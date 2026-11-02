const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { ImportJobs, settingsForRecovery, atomicJson } = require("../../src/helpers/dssaImportJobs");
const configuration = {
  transcription: {
    useLocalWhisper: true,
    localTranscriptionProvider: "whisper",
    whisperModel: "nb-large",
    language: "nn",
    apiKey: "secret-not-for-disk",
  },
  diarization: {
    enabled: true,
    localModelsReady: true,
    engine: "community-1",
    numSpeakers: 15,
    minSpeakers: 8,
    alignment: "fast",
  },
  folderId: null,
};
const result = {
  success: true,
  text: "Eg er ikkje samd. Åse kjem kl. 14.30.",
  durationSeconds: 12,
  segments: [
    { start: 2, end: 6, text: "Eg er ikkje samd.", speaker: "speaker_3" },
    { start: 7, end: 12, text: "Åse kjem kl. 14.30.", speaker: "speaker_1" },
  ],
};
function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "dssa-jobs-test-"));
  t.after(() => {
    if (path.dirname(root) === fs.realpathSync(os.tmpdir()))
      fs.rmSync(root, { recursive: true, force: true });
  });
  const file = path.join(root, "meeting.mp3");
  fs.writeFileSync(file, Buffer.from("public test fixture"));
  const sql = new DatabaseSync(":memory:");
  t.after(() => sql.close());
  sql.exec(
    "CREATE TABLE notes(id INTEGER PRIMARY KEY,title TEXT,content TEXT,note_type TEXT,source_file TEXT,audio_duration_seconds REAL,folder_id INTEGER,transcript TEXT,diarization_enabled INTEGER)"
  );
  const db = {
    activeAccountId: null,
    db: {
      exec: (s) => sql.exec(s),
      prepare: (s) => sql.prepare(s),
      transaction: (fn) => () => {
        sql.exec("BEGIN");
        try {
          const r = fn();
          sql.exec("COMMIT");
          return r;
        } catch (e) {
          sql.exec("ROLLBACK");
          throw e;
        }
      },
    },
    getNote: (id) => sql.prepare("SELECT * FROM notes WHERE id=?").get(id),
    saveNote: (title, text, type, name, duration, folder) => {
      const r = sql
        .prepare(
          "INSERT INTO notes(title,content,note_type,source_file,audio_duration_seconds,folder_id) VALUES(?,?,?,?,?,?)"
        )
        .run(title, text, type, name, duration, folder);
      return { success: true, note: db.getNote(Number(r.lastInsertRowid)) };
    },
    updateNote: (id, updates) => {
      for (const [k, v] of Object.entries(updates))
        sql.prepare(`UPDATE notes SET ${k}=? WHERE id=?`).run(v, id);
      return { success: true };
    },
  };
  const options = { database: db, resolveAudio: (p) => p, approveAudio: () => {} };
  return { root, file, db, sql, options, jobs: new ImportJobs(root, options) };
}
test("restart reuses checked stages, preserves nynorsk and keeps temporary source available", async (t) => {
  const f = fixture(t),
    job = await f.jobs.begin(f.file, configuration);
  f.jobs.stage(job.id, "final", result);
  fs.unlinkSync(f.file);
  const restarted = new ImportJobs(f.root, f.options);
  assert.equal(restarted.list()[0].state, "interrupted");
  const resumed = await restarted.begin("ignored-renderer-path", configuration, job.id);
  assert.deepEqual(resumed.stages.final, result);
  assert.ok(fs.existsSync(resumed.path));
  const saved = restarted.commit(job.id, { title: "Offentleg prøve" });
  assert.equal(saved.note.content, result.text);
  assert.equal(JSON.parse(saved.note.transcript)[0].speaker, "speaker_3");
  assert.equal(restarted.commit(job.id, { title: "Duplicate" }).note.id, saved.note.id);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM notes").get().n, 1);
  assert.equal(restarted.list().length, 0);
  assert.ok(
    !fs
      .readFileSync(path.join(f.root, "import-jobs", job.id, "job.json"), "utf8")
      .includes("secret-not-for-disk")
  );
});
test("corrupt stage is rerun, changed original and changed model are refused", async (t) => {
  const f = fixture(t),
    job = await f.jobs.begin(f.file, configuration);
  f.jobs.stage(job.id, "final", result);
  f.jobs.pause(job.id);
  atomicJson(path.join(f.root, "import-jobs", job.id, "final.json"), {
    ...result,
    text: "Tampered",
  });
  const resumed = await f.jobs.begin(job.path, configuration, job.id);
  assert.equal(resumed.stages.final, undefined);
  f.jobs.pause(job.id);
  await assert.rejects(
    f.jobs.begin(
      job.path,
      { ...configuration, transcription: { ...configuration.transcription, language: "nb" } },
      job.id
    ),
    /samme modell/
  );
  fs.appendFileSync(job.path, "changed");
  await assert.rejects(f.jobs.resume(job.id), /endret/);
  assert.throws(() => f.jobs.commit(job.id, {}), /endret/);
});
test("SQL transaction rolls back a failed transcript save and retry creates one complete note", async (t) => {
  const f = fixture(t),
    job = await f.jobs.begin(f.file, configuration);
  f.jobs.stage(job.id, "final", result);
  const update = f.db.updateNote;
  f.db.updateNote = () => ({ success: false });
  assert.throws(() => f.jobs.commit(job.id, {}), /Talertidene/);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM notes").get().n, 0);
  f.db.updateNote = update;
  const saved = f.jobs.commit(job.id, {});
  assert.equal(saved.note.diarization_enabled, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM notes").get().n, 1);
});
test("private jobs are hidden across account changes and no paths can escape the cache", async (t) => {
  const f = fixture(t),
    job = await f.jobs.begin(f.file, configuration);
  f.jobs.pause(job.id);
  f.db.activeAccountId = "another-account";
  assert.deepEqual(f.jobs.list(), []);
  await assert.rejects(f.jobs.resume(job.id), /aktive profilen/);
  assert.throws(() => f.jobs.folder("../outside"), /import-ID/);
  f.db.activeAccountId = null;
  assert.throws(() => f.jobs.workDirectory(job.id, f.file, "alignment"), /Ugyldig/);
});
test("history off stops caching and cleanup deletes only owned inactive jobs, never original media", async (t) => {
  const f = fixture(t);
  let enabled = true;
  const jobs = new ImportJobs(f.root, { ...f.options, canPersist: () => enabled });
  const job = await jobs.begin(f.file, configuration);
  enabled = false;
  jobs.cleanup();
  assert.ok(fs.existsSync(job.path));
  jobs.pause(job.id);
  jobs.cleanup();
  assert.ok(!fs.existsSync(path.join(f.root, "import-jobs", job.id)));
  assert.ok(fs.existsSync(f.file));
  assert.deepEqual(await jobs.begin(f.file, configuration), { disabled: true });
});
test("recovery settings reject invalid counts and remove credentials and functions", () => {
  assert.equal(settingsForRecovery(configuration).transcription.apiKey, undefined);
  assert.throws(() =>
    settingsForRecovery({
      ...configuration,
      diarization: { ...configuration.diarization, numSpeakers: 16 },
    })
  );
  assert.throws(() =>
    settingsForRecovery({
      ...configuration,
      transcription: { ...configuration.transcription, whisperModel: "../../bad" },
    })
  );
});
