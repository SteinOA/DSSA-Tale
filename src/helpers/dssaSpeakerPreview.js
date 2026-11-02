const fs = require("fs"),
  path = require("path");
const { spawn } = require("child_process");
const { fingerprintSource, assertSourceUnchanged } = require("./dssaFileCheckpoint");
const { atomicJson, readJson } = require("./dssaImportJobs");
const { killProcess } = require("../utils/process");
function previewWindows(segments, speaker) {
  if (!/^speaker_\d+$/.test(speaker || "")) return [];
  const anchor = segments.find((s) => Number.isFinite(s.audioStartTimestamp))?.audioStartTimestamp;
  if (!Number.isFinite(anchor)) return [];
  const ranges = segments
    .filter(
      (s) =>
        s.speaker === speaker &&
        Number.isFinite(s.timestamp) &&
        Number.isFinite(s.endTimestamp) &&
        s.endTimestamp - s.timestamp >= 600
    )
    .map((s) => ({ start: (s.timestamp - anchor) / 1000, end: (s.endTimestamp - anchor) / 1000 }))
    .filter((s) => s.start >= 0 && s.end > s.start)
    .sort((a, b) => b.end - b.start - (a.end - a.start));
  const selected = [];
  for (const range of ranges) {
    if (selected.every((s) => Math.abs(s.start - range.start) >= 15))
      selected.push({ start: range.start, end: Math.min(range.end, range.start + 12) });
    if (selected.length === 3) break;
  }
  return selected.sort((a, b) => a.start - b.start);
}
function runFFmpeg(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let bytes = 0,
      output = [],
      stderr = "";
    const timer = setTimeout(() => {
      killProcess(child, "SIGKILL");
      reject(Error("Lydutdraget tok for lang tid."));
    }, 30000);
    child.stdout.on("data", (buffer) => {
      bytes += buffer.length;
      if (bytes > 1024 ** 2) {
        killProcess(child, "SIGKILL");
        reject(Error("Lydutdraget er for stort."));
      } else output.push(buffer);
    });
    child.stderr.on("data", (buffer) => {
      stderr = (stderr + buffer.toString()).slice(-65536);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(Error("Lydutdraget kunne ikke åpnes."));
      else resolve({ data: Buffer.concat(output), stderr });
    });
  });
}
class SpeakerPreview {
  constructor({ profile, database, imports, dialog, approveAudio, ffmpeg, run = runFFmpeg }) {
    Object.assign(this, { profile, database, imports, dialog, approveAudio, ffmpeg, run });
    this.root = path.join(profile, "speaker-audio-links");
  }
  note(id) {
    if (!Number.isSafeInteger(id) || id < 1) throw Error("Ugyldig notat.");
    const note = this.database.getNote(id);
    if (!note || note.note_type !== "upload") throw Error("Velg et importert opptak.");
    return note;
  }
  file(id) {
    this.note(id);
    fs.mkdirSync(this.root, { recursive: true });
    return path.join(this.root, id + ".json");
  }
  source(id) {
    try {
      return readJson(this.file(id));
    } catch {
      return this.imports.sourceForNote(id);
    }
  }
  windows(id, speaker) {
    const note = this.note(id);
    const segments = JSON.parse(note.transcript || "[]");
    const samples = previewWindows(segments, speaker).filter(
      (s) => !note.audio_duration_seconds || s.end <= note.audio_duration_seconds + 0.001
    );
    return { success: true, available: !!this.source(id), samples };
  }
  async attach(id) {
    const note = this.note(id);
    const chosen = await this.dialog.showOpenDialog({
      title: "Velg originalopptaket til utskriften",
      properties: ["openFile"],
      filters: [
        {
          name: "Lyd og video",
          extensions: require("../constants/uploadAudioFormats.json").UPLOAD_AUDIO_EXTENSIONS,
        },
      ],
    });
    if (chosen.canceled) return { canceled: true };
    const file = chosen.filePaths[0];
    if (
      !require("../constants/uploadAudioFormats.json").UPLOAD_AUDIO_EXTENSIONS.includes(
        path.extname(file).slice(1).toLowerCase()
      )
    )
      throw Error("Velg en støttet lyd- eller videofil.");
    const source = await fingerprintSource(file);
    if (note.audio_duration_seconds) {
      const { stderr } = await this.run(this.ffmpeg(), [
        "-hide_banner",
        "-nostdin",
        "-i",
        source.path,
        "-t",
        "0",
        "-f",
        "null",
        "-",
      ]);
      const duration = require("./ffmpegUtils").parseFfmpegDuration(stderr);
      if (
        !Number.isFinite(duration) ||
        Math.abs(duration - note.audio_duration_seconds) >
          Math.max(2, note.audio_duration_seconds * 0.001)
      )
        throw Error("Opptakets lengde stemmer ikke med utskriften. Velg samme originalopptak.");
    }
    atomicJson(this.file(id), source);
    this.approveAudio?.(source.realPath);
    return { success: true };
  }
  async clip(id, speaker, index = 0) {
    const samples = this.windows(id, speaker).samples;
    if (!Number.isInteger(index) || !samples[index])
      throw Error("Ingen kontrollerbar lydtid for denne taleren.");
    const source = this.source(id);
    if (!source) throw Error("Koble til originalopptaket først.");
    assertSourceUnchanged(source);
    const sample = samples[index];
    const { data } = await this.run(this.ffmpeg(), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-ss",
      String(sample.start),
      "-i",
      source.realPath,
      "-t",
      String(sample.end - sample.start),
      "-vn",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      "pipe:1",
    ]);
    assertSourceUnchanged(source);
    if (!data.length || data.length > 1024 ** 2 || data.toString("ascii", 0, 4) !== "RIFF")
      throw Error("Lydutdraget er ugyldig.");
    return { success: true, audioBase64: data.toString("base64"), ...sample };
  }
}
module.exports = { SpeakerPreview, previewWindows, runFFmpeg };
