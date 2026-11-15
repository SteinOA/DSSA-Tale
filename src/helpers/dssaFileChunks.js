const fs = require("fs"),
  path = require("path");
const { createAbortError } = require("./abortError");
const { cleanWhisperText, offsetAndTrimTiming } = require("./dssaWhisperTiming");
const {
  fingerprintSource,
  assertSourceUnchanged,
  openFileCheckpoint,
  clearFileCheckpoints,
} = require("./dssaFileCheckpoint");
function wavHeader(bytes) {
  const b = Buffer.alloc(44);
  b.write("RIFF", 0);
  b.writeUInt32LE(bytes + 36, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(bytes, 40);
  return b;
}
function dataRange(fd, size) {
  const first = Buffer.alloc(12);
  fs.readSync(fd, first, 0, 12, 0);
  if (first.toString("ascii", 0, 4) !== "RIFF" || first.toString("ascii", 8, 12) !== "WAVE")
    throw Error("Ugyldig WAV-fil.");
  let offset = 12,
    valid = false;
  while (offset + 8 <= size) {
    const h = Buffer.alloc(8);
    fs.readSync(fd, h, 0, 8, offset);
    const n = h.readUInt32LE(4),
      id = h.toString("ascii", 0, 4);
    if (id === "fmt ") {
      const f = Buffer.alloc(16);
      fs.readSync(fd, f, 0, 16, offset + 8);
      valid =
        f.readUInt16LE(0) === 1 &&
        f.readUInt16LE(2) === 1 &&
        f.readUInt32LE(4) === 16000 &&
        f.readUInt16LE(14) === 16;
    }
    if (id === "data") {
      if (!valid) throw Error("Lydformatet kunne ikke klargjøres.");
      return { offset: offset + 8, bytes: Math.min(n, size - offset - 8) };
    }
    offset += 8 + n + (n % 2);
  }
  throw Error("Lyddata mangler i WAV-filen.");
}
function joinOverlap(previous, incoming) {
  if (!incoming.trim()) return previous.trim();
  if (!previous) return incoming.trim();
  const a = previous.trim().split(/\s+/),
    b = incoming.trim().split(/\s+/);
  const normalize = (s) => s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  let overlap = 0;
  for (let n = Math.min(12, a.length, b.length); n > 0; n--) {
    if (a.slice(-n).map(normalize).join(" ") === b.slice(0, n).map(normalize).join(" ")) {
      overlap = n;
      break;
    }
  }
  return previous.trim() + (b.length > overlap ? " " + b.slice(overlap).join(" ") : "");
}
async function transcribeFileChunks(
  filePath,
  options,
  {
    transcribe,
    onProgress = () => {},
    convert,
    temporaryRoot,
    chunkSeconds = 30,
    checkpointDirectory,
    canCheckpoint = () => true,
  } = {}
) {
  // Opt-in only. No persistent transcript is created by existing callers.
  let checkpointAllowed = !!checkpointDirectory;
  let checkpointWarning = false;
  const checkPolicy = () => {
    if (!checkpointAllowed) return false;
    let allowed = false;
    try {
      allowed = canCheckpoint() === true;
    } catch {
      /* Fail closed. */
    }
    if (!allowed) {
      checkpointAllowed = false;
      try {
        clearFileCheckpoints(checkpointDirectory);
      } catch {
        checkpointWarning = true;
      }
    }
    return checkpointAllowed;
  };
  const source = checkPolicy() ? await fingerprintSource(filePath, options.signal) : null;
  const base = path.resolve(temporaryRoot || require("./safeTempDir").getSafeTempDir());
  const dir = fs.mkdtempSync(path.join(base, "ow-file-"));
  let fd;
  try {
    const wav = path.join(dir, "audio.wav");
    await (convert || require("./ffmpegUtils").convertToWav)(filePath, wav, {
      signal: options.signal,
    });
    if (options.signal?.aborted) throw createAbortError("Transkripsjonen er avbrutt");
    if (source) assertSourceUnchanged(source);
    fd = fs.openSync(wav, "r");
    const data = dataRange(fd, fs.fstatSync(fd).size);
    const step = Math.max(32000, Math.floor(chunkSeconds) * 32000),
      total = Math.ceil(data.bytes / step);
    let checkpoint = null;
    if (source && checkPolicy()) {
      try {
        checkpoint = openFileCheckpoint({
          directory: checkpointDirectory,
          source,
          options,
          chunkBytes: step,
          pcmBytes: data.bytes,
        });
      } catch {
        // Failed persistence must not discard a usable transcription. The
        // caller can surface this flag without logging private source/result data.
        checkpointWarning = true;
      }
    }
    const resumed = checkpoint?.completed.length || 0;
    const processingStartedAt = Date.now();
    const reportProgress = (completed) =>
      onProgress({
        chunksCompleted: completed,
        chunksTotal: total,
        audioDurationSeconds: data.bytes / 32000,
        audioProcessedSeconds: Math.min(data.bytes, completed * step) / 32000,
        processingElapsedSeconds: Math.max(0, (Date.now() - processingStartedAt) / 1000),
        ...(resumed ? { resumedChunks: resumed } : {}),
      });
    let text = "",
      lastResult = {};
    const timed = [];
    let fullTiming = options.timestamps === true;
    reportProgress(resumed);
    for (let start = 0, completed = 0; start < data.bytes; start += step) {
      if (options.signal?.aborted) throw createAbortError("Transkripsjonen er avbrutt");
      const overlap = start > 0 ? 16000 : 0,
        from = start - overlap,
        bytes = Math.min(step + overlap, data.bytes - from);
      if (source) assertSourceUnchanged(source);
      const index = completed;
      if (!checkPolicy()) checkpoint = null;
      if (checkpoint && index < resumed) lastResult = checkpoint.completed[index];
      else {
        const buffer = Buffer.alloc(44 + bytes);
        wavHeader(bytes).copy(buffer);
        fs.readSync(fd, buffer, 44, bytes, data.offset + from);
        lastResult = await transcribe(buffer, { ...options, priority: "background" });
      }
      const silent =
        lastResult?.message === "No audio detected" || lastResult?.code === "NO_SPEECH_DETECTED";
      if (!lastResult?.success && !silent)
        throw Error(lastResult?.error || "En lyddel kunne ikke transkriberes.");
      if (!checkPolicy()) checkpoint = null;
      if (checkpoint && index >= resumed) {
        try {
          checkpoint.save(index, lastResult);
        } catch (error) {
          if (error.code === "SOURCE_FILE_CHANGED") throw error;
          checkpointWarning = true;
          checkpoint = null;
        }
      }
      if (!silent) {
        const incoming = cleanWhisperText(lastResult.text);
        const joined = joinOverlap(text, incoming);
        const appended = joined.slice(text.length).trim();
        if (options.timestamps) {
          const dropWords = incoming
            ? incoming.split(/\s+/).length - (appended ? appended.split(/\s+/).length : 0)
            : 0;
          const sourceSegments = lastResult.segments;
          if (
            !sourceSegments?.length ||
            cleanWhisperText(sourceSegments.map((s) => s.text).join(" ")) !== incoming
          )
            fullTiming = false;
          else {
            const shifted = offsetAndTrimTiming(
              sourceSegments,
              dropWords,
              from / 32000,
              data.bytes / 32000
            );
            if (!shifted) fullTiming = false;
            else timed.push(...shifted);
          }
        }
        text = joined;
      }
      completed++;
      if (completed > resumed) reportProgress(completed);
      // Allow interactive requests to enter the queue between background chunks.
      await new Promise((resolve) => setImmediate(resolve));
    }
    if (options.signal?.aborted) throw createAbortError("Transkripsjonen er avbrutt");
    if (source) assertSourceUnchanged(source);
    // Completion clears the temporary transcript cache; interrupted jobs retain
    // their completed prefix, bounded to seven days by the cache helper.
    if (!checkPolicy()) checkpoint = null;
    if (checkpoint) {
      try {
        checkpoint.clear();
      } catch {
        checkpointWarning = true;
      }
    }
    fullTiming =
      fullTiming &&
      timed.length > 0 &&
      cleanWhisperText(timed.map((s) => s.text).join(" ")) === cleanWhisperText(text);
    return text.trim()
      ? {
          success: true,
          text,
          durationSeconds: data.bytes / 32000,
          ...(checkpointWarning ? { checkpointWarning: true } : {}),
          ...(fullTiming
            ? { segments: timed }
            : options.timestamps
              ? { timingUnavailable: true }
              : {}),
        }
      : {
          success: false,
          message: "No audio detected",
          code: "NO_SPEECH_DETECTED",
          durationSeconds: data.bytes / 32000,
        };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    const resolved = path.resolve(dir);
    if (path.dirname(resolved) === base && path.basename(resolved).startsWith("ow-file-"))
      fs.rmSync(resolved, { recursive: true, force: true });
  }
}
module.exports = { wavHeader, dataRange, joinOverlap, transcribeFileChunks };
