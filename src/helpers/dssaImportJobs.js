const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const {
  fingerprintSource,
  assertSourceUnchanged,
  configurationHash,
} = require("./dssaFileCheckpoint");
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAGES = new Set(["transcription", "diarization", "alignment", "final"]);
const MAX_BYTES = 64 * 1024 ** 2;

function atomicJson(file, value) {
  const data = JSON.stringify(value);
  if (Buffer.byteLength(data) > MAX_BYTES) throw Error("Importresultatet er for stort.");
  const temporary = file + "." + crypto.randomUUID() + ".part";
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, data);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function readJson(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES)
    throw Error("Ugyldig importfil.");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function settingsForRecovery(configuration) {
  const t = configuration?.transcription,
    d = configuration?.diarization;
  if (
    t?.useLocalWhisper !== true ||
    t.localTranscriptionProvider !== "whisper" ||
    typeof t.whisperModel !== "string" ||
    !d
  )
    throw Error("Gjenopptakelse gjelder lokal Whisper-import.");
  if (
    !/^[a-zA-Z0-9_.-]{1,128}$/.test(t.whisperModel) ||
    typeof t.language !== "string" ||
    t.language.length > 16
  )
    throw Error("Ugyldig modell eller språk.");
  const count = require("./dssaCommunityDiarization").speakerConstraints({
    maxSpeakers: d.numSpeakers ?? 15,
    minSpeakers: d.minSpeakers,
    exactSpeakers: d.exactSpeakers,
  });
  return {
    transcription: {
      useLocalWhisper: true,
      localTranscriptionProvider: "whisper",
      whisperModel: t.whisperModel,
      language: t.language,
    },
    diarization: {
      enabled: !!d.enabled,
      localModelsReady: !!d.localModelsReady,
      numSpeakers: d.numSpeakers ?? null,
      ...(count.minSpeakers !== undefined ? { minSpeakers: count.minSpeakers } : {}),
      ...(count.exactSpeakers !== undefined ? { exactSpeakers: count.exactSpeakers } : {}),
      engine: d.engine === "community-1" ? "community-1" : "sherpa-onnx",
      alignment: ["fast", "precise"].includes(d.alignment) ? d.alignment : "off",
    },
    folderId:
      Number.isSafeInteger(configuration.folderId) && configuration.folderId > 0
        ? configuration.folderId
        : null,
  };
}
function cleanResult(stage, result) {
  if (!STAGES.has(stage) || result?.success !== true)
    throw Error("Bare fullførte behandlingstrinn kan lagres.");
  const segments = result.segments ?? (["transcription", "final"].includes(stage) ? [] : undefined);
  if (!Array.isArray(segments) || segments.length > 200000) throw Error("Ugyldige tidssegmenter.");
  const clean = segments.map((s) => {
    if (
      !s ||
      !Number.isFinite(s.start) ||
      !Number.isFinite(s.end) ||
      s.start < 0 ||
      s.end < s.start
    )
      throw Error("Ugyldige lydtider.");
    if (stage !== "diarization" && typeof s.text !== "string") throw Error("Tekst mangler.");
    if (s.speaker !== undefined && !/^speaker_\d+$/.test(s.speaker))
      throw Error("Ugyldig taleretikett.");
    return {
      start: s.start,
      end: s.end,
      ...(typeof s.text === "string" ? { text: s.text } : {}),
      ...(s.speaker ? { speaker: s.speaker } : {}),
      ...(Array.isArray(s.words)
        ? {
            words: s.words.map((w) => {
              if (
                typeof w.text !== "string" ||
                !Number.isFinite(w.start) ||
                !Number.isFinite(w.end) ||
                w.start < 0 ||
                w.end < w.start
              )
                throw Error("Ugyldige ordtider.");
              return { text: w.text, start: w.start, end: w.end };
            }),
          }
        : {}),
      ...(typeof s.speakerAssignment === "string"
        ? { speakerAssignment: s.speakerAssignment }
        : {}),
    };
  });
  if (["transcription", "final"].includes(stage) && typeof result.text !== "string")
    throw Error("Transkripsjonen mangler.");
  const output = {
    success: true,
    segments: clean,
    ...(typeof result.text === "string" ? { text: result.text } : {}),
    ...(Number.isFinite(result.durationSeconds) ? { durationSeconds: result.durationSeconds } : {}),
  };
  for (const key of [
    "diarized",
    "diarizationWarning",
    "alignmentWarning",
    "checkpointWarning",
    "speakerCountMismatch",
  ])
    if (typeof result[key] === "boolean") output[key] = result[key];
  for (const key of ["fallback", "applied"])
    if (Number.isSafeInteger(result[key]) && result[key] >= 0) output[key] = result[key];
  if (["cpu", "cuda"].includes(result.device)) output.device = result.device;
  if (result.resourceWarning === "memory-pressure") output.resourceWarning = result.resourceWarning;
  return output;
}
class ImportJobs {
  constructor(
    profile,
    { resolveAudio = (p) => p, approveAudio = () => {}, canPersist = () => true, database } = {}
  ) {
    Object.assign(this, { profile, resolveAudio, approveAudio, canPersist, database });
    this.root = path.join(profile, "import-jobs");
    this.active = new Set();
  }
  folder(id) {
    if (!ID.test(id || "")) throw Error("Ugyldig import-ID.");
    fs.mkdirSync(this.root, { recursive: true });
    const root = fs.realpathSync(this.root),
      folder = path.join(root, id);
    if (
      fs.existsSync(folder) &&
      (fs.lstatSync(folder).isSymbolicLink() || fs.realpathSync(folder) !== folder)
    )
      throw Error("Utrygg importmappe.");
    return folder;
  }
  read(id) {
    const job = readJson(path.join(this.folder(id), "job.json"));
    if (
      job.id !== id ||
      job.version !== 1 ||
      (job.accountId ?? null) !== (this.database?.activeAccountId ?? null)
    )
      throw Error("Importjobben tilhører ikke den aktive profilen.");
    return job;
  }
  write(job) {
    job.updatedAt = Date.now();
    atomicJson(path.join(this.folder(job.id), "job.json"), job);
  }
  async begin(filePath, configuration, resumeId) {
    if (!this.canPersist()) return { disabled: true };
    const settings = settingsForRecovery(configuration);
    if (resumeId) {
      const job = this.read(resumeId);
      if (this.active.has(job.id)) throw Error("Importen arbeider allerede.");
      if (configurationHash(job.configuration) !== configurationHash(settings))
        throw Error("Gjenoppta med samme modell, målform og talervalg.");
      assertSourceUnchanged(job.source);
      const current = await fingerprintSource(job.source.path);
      if (current.sha256 !== job.source.sha256)
        throw Error("Originalopptaket er endret. Velg filen på nytt.");
      this.approveAudio(current.realPath);
      job.source = current;
      job.state = "working";
      this.write(job);
      this.active.add(job.id);
      return this.describe(job, true);
    }
    const allowed = this.resolveAudio(filePath);
    if (!allowed) throw Error("Velg lydfilen gjennom appen.");
    if (
      !require("../constants/uploadAudioFormats.json").UPLOAD_AUDIO_EXTENSIONS.includes(
        path.extname(allowed).slice(1).toLowerCase()
      )
    )
      throw Error("Velg en støttet lydfil.");
    let source = await fingerprintSource(allowed);
    const id = crypto.randomUUID(),
      folder = this.folder(id);
    fs.mkdirSync(folder);
    // Downloaded temporary media must survive the OS-temp sweep after a crash.
    const temp = fs.realpathSync(os.tmpdir());
    if (source.realPath.startsWith(temp + path.sep)) {
      const target = path.join(folder, "source" + path.extname(source.realPath).toLowerCase());
      await fs.promises.copyFile(source.realPath, target + ".part", fs.constants.COPYFILE_EXCL);
      fs.renameSync(target + ".part", target);
      const copied = await fingerprintSource(target);
      if (copied.sha256 !== source.sha256) throw Error("Lydkopien kunne ikke kontrolleres.");
      source = copied;
    }
    const job = {
      version: 1,
      id,
      accountId: this.database?.activeAccountId ?? null,
      state: "working",
      createdAt: Date.now(),
      source,
      configuration: settings,
      stages: {},
      name: path.basename(allowed),
    };
    this.write(job);
    this.active.add(id);
    return this.describe(job, true);
  }
  describe(job, includeStages = false) {
    const stages = {};
    if (includeStages)
      for (const [stage, hash] of Object.entries(job.stages)) {
        try {
          const data = readJson(path.join(this.folder(job.id), stage + ".json"));
          if (configurationHash(data) === hash) stages[stage] = cleanResult(stage, data);
        } catch {
          /* Redo corrupt or incomplete stage. */
        }
      }
    return {
      id: job.id,
      name: job.name,
      path: job.source.path,
      sizeBytes: job.source.size,
      state: this.active.has(job.id)
        ? "working"
        : job.state === "working"
          ? "interrupted"
          : job.state,
      configuration: job.configuration,
      completedStages: Object.keys(job.stages),
      updatedAt: job.updatedAt,
      noteId: job.noteId,
      ...(includeStages ? { stages } : {}),
    };
  }
  list() {
    if (!fs.existsSync(this.root)) return [];
    return fs
      .readdirSync(this.root)
      .filter((id) => ID.test(id))
      .flatMap((id) => {
        try {
          const j = this.read(id);
          return ["done", "dismissed"].includes(j.state) ? [] : [this.describe(j)];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);
  }
  stage(id, stage, result) {
    if (!this.canPersist()) throw Error("Lokal lagring er avslått.");
    const job = this.read(id);
    assertSourceUnchanged(job.source);
    const safe = cleanResult(stage, result);
    atomicJson(path.join(this.folder(id), stage + ".json"), safe);
    job.stages[stage] = configurationHash(safe);
    this.write(job);
    return { success: true };
  }
  pause(id) {
    const job = this.read(id);
    this.active.delete(id);
    if (job.state !== "done") job.state = "interrupted";
    this.write(job);
    return { success: true };
  }
  dismiss(id) {
    const job = this.read(id);
    if (this.active.has(id)) throw Error("Avbryt importen først.");
    job.state = "dismissed";
    this.write(job);
    return { success: true };
  }
  async resume(id) {
    const job = this.read(id);
    assertSourceUnchanged(job.source);
    this.approveAudio(job.source.realPath);
    return this.describe(job);
  }
  workDirectory(id, filePath, stage) {
    const job = this.read(id);
    if (
      !["alignment", "diarization"].includes(stage) ||
      fs.realpathSync(filePath) !== job.source.realPath
    )
      throw Error("Ugyldig gjenopptakelse.");
    assertSourceUnchanged(job.source);
    const folder = path.join(this.folder(id), stage + "-work");
    if (fs.existsSync(folder) && fs.lstatSync(folder).isSymbolicLink())
      throw Error("Utrygg arbeidsmappe.");
    fs.mkdirSync(folder, { recursive: true });
    return {
      folder,
      key: configurationHash({
        source: job.source.sha256,
        settings: job.configuration,
        version: 1,
      }),
    };
  }
  async relink(id, filePath) {
    const job = this.read(id);
    if (this.active.has(id)) throw Error("Importen arbeider allerede.");
    const source = await fingerprintSource(filePath);
    if (source.sha256 !== job.source.sha256 || source.size !== job.source.size)
      throw Error("Dette er ikke det samme originalopptaket.");
    job.source = source;
    this.approveAudio(source.realPath);
    this.write(job);
    return this.describe(job);
  }
  commit(id, args) {
    const job = this.read(id),
      db = this.database;
    assertSourceUnchanged(job.source);
    if (!job.stages.final) throw Error("Importresultatet er ikke sikret.");
    const result = this.describe(job, true).stages.final;
    if (!result) throw Error("Importresultatet må behandles på nytt.");
    db.db.exec(
      "CREATE TABLE IF NOT EXISTS dssa_import_saves (job_id TEXT PRIMARY KEY, note_id INTEGER NOT NULL)"
    );
    const saved = db.db.transaction(() => {
      const existing = db.db
        .prepare("SELECT note_id FROM dssa_import_saves WHERE job_id=?")
        .get(id);
      if (existing) {
        const note = db.getNote(existing.note_id);
        if (!note) throw Error("Det lagrede notatet er slettet eller utilgjengelig.");
        return { success: true, note };
      }
      const response = db.saveNote(
        String(args.title || job.name).slice(0, 500),
        result.text,
        "upload",
        job.name,
        result.durationSeconds || null,
        job.configuration.folderId
      );
      if (!response?.success || !response.note) throw Error("Notatet kunne ikke lagres.");
      // Derive the timeline from the checked result, not a second renderer payload.
      const clean = result.segments.length
        ? {
            transcript: JSON.stringify(
              result.segments.map((s) => ({
                text: s.text,
                timestamp: job.createdAt + s.start * 1000,
                audioStartTimestamp: job.createdAt,
                endTimestamp: job.createdAt + s.end * 1000,
                ...(s.speaker ? { speaker: s.speaker, speakerIsPlaceholder: true } : {}),
              }))
            ),
          }
        : {};
      if (job.configuration.diarization.enabled) clean.diarization_enabled = 1;
      if (Object.keys(clean).length && db.updateNote(response.note.id, clean)?.success !== true)
        throw Error("Talertidene kunne ikke lagres.");
      db.db
        .prepare("INSERT INTO dssa_import_saves (job_id,note_id) VALUES (?,?)")
        .run(id, response.note.id);
      return { success: true, note: db.getNote(response.note.id) };
    })();
    // If this write fails, the SQL idempotency key still prevents a duplicate note.
    job.noteId = saved.note.id;
    job.state = "done";
    this.active.delete(id);
    this.write(job);
    return saved;
  }
  sourceForNote(noteId) {
    try {
      const row = this.database.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dssa_import_saves'")
        .get();
      if (!row) return null;
      const link = this.database.db
        .prepare("SELECT job_id FROM dssa_import_saves WHERE note_id=?")
        .get(noteId);
      return link ? this.read(link.job_id).source : null;
    } catch {
      return null;
    }
  }
  cleanup(days = 7) {
    if (!fs.existsSync(this.root)) return;
    const root = fs.realpathSync(this.root),
      age = Math.min(7, days || 7) * 86400000;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (
        !ID.test(entry.name) ||
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        this.active.has(entry.name)
      )
        continue;
      const folder = path.join(root, entry.name);
      let job;
      try {
        job = readJson(path.join(folder, "job.json"));
      } catch {
        continue;
      }
      if (this.canPersist() && Number.isFinite(job.updatedAt) && Date.now() - job.updatedAt < age)
        continue;
      if (path.dirname(folder) === root && fs.realpathSync(folder) === folder)
        fs.rmSync(folder, { recursive: true, force: true });
    }
  }
}
module.exports = { ImportJobs, settingsForRecovery, cleanResult, atomicJson, readJson };
