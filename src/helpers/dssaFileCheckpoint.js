const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createAbortError } = require("./abortError");

const VERSION = 1;
const MAX_RECORD_BYTES = 16 * 1024 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const EPHEMERAL_OPTIONS = new Set(["signal", "requestId", "priority", "onProgress"]);
const digest = (text) => crypto.createHash("sha256").update(text).digest("hex");
const snapshot = (stat) => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs];

function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonical(value[key])])
    );
  throw new TypeError("Checkpoint options must contain plain finite JSON values");
}

function configurationHash(options) {
  return digest(
    JSON.stringify(
      canonical(
        Object.fromEntries(
          Object.entries(options || {}).filter(
            ([key, value]) => !EPHEMERAL_OPTIONS.has(key) && value !== undefined
          )
        )
      )
    )
  );
}

function assertSourceUnchanged(source) {
  if (
    fs.realpathSync(source.path) !== source.realPath ||
    JSON.stringify(snapshot(fs.statSync(source.path))) !== JSON.stringify(source.stat)
  ) {
    const error = new Error("Lydfilen ble endret under behandlingen. Velg filen på nytt.");
    error.code = "SOURCE_FILE_CHANGED";
    throw error;
  }
}

async function fingerprintSource(filePath, signal) {
  if (signal?.aborted) throw createAbortError("Transkripsjonen er avbrutt");
  const source = { path: path.resolve(filePath), realPath: fs.realpathSync(filePath) };
  const stat = fs.statSync(source.path);
  if (!stat.isFile()) throw new TypeError("Checkpoint source must be a file");
  source.stat = snapshot(stat);
  source.size = stat.size;
  const hash = crypto.createHash("sha256");
  for await (const buffer of fs.createReadStream(source.path, { signal })) hash.update(buffer);
  assertSourceUnchanged(source);
  source.sha256 = hash.digest("hex");
  return source;
}

function validResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  if (result.success !== true)
    return (
      result.success === false &&
      (result.message === "No audio detected" || result.code === "NO_SPEECH_DETECTED")
    );
  if (typeof result.text !== "string") return false;
  if (result.segments === undefined) return true;
  if (!Array.isArray(result.segments)) return false;
  return result.segments.every((segment) => {
    if (
      !segment ||
      typeof segment.text !== "string" ||
      !Number.isFinite(segment.start) ||
      !Number.isFinite(segment.end) ||
      segment.start < 0 ||
      segment.end < segment.start
    )
      return false;
    return (
      segment.words === undefined ||
      (Array.isArray(segment.words) &&
        segment.words.every(
          (word) =>
            word &&
            typeof word.text === "string" &&
            Number.isFinite(word.start) &&
            Number.isFinite(word.end) &&
            word.start >= 0 &&
            word.end >= word.start
        ))
    );
  });
}

function atomicJson(target, value) {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > MAX_RECORD_BYTES)
    throw new Error("Checkpoint record is too large");
  const temporary = target + "." + crypto.randomUUID() + ".part";
  let fd;
  try {
    fd = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(fd, serialized);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, target);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function readJson(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RECORD_BYTES) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

// The caller supplies a dedicated cache root. Only our hashed child directories
// are removed; never traverse links or arbitrary sibling files.
function clearFileCheckpoints(directory, expiredOnly = false, maxAgeMs = MAX_AGE_MS) {
  if (!fs.existsSync(directory)) return;
  const root = fs.realpathSync(directory);
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!/^[a-f0-9]{64}$/.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink())
      continue;
    const folder = path.join(root, entry.name);
    if (expiredOnly) {
      const createdAt = readJson(path.join(folder, "manifest.json"))?.createdAt;
      if (
        Number.isFinite(createdAt) &&
        createdAt <= Date.now() &&
        Date.now() - createdAt < Math.min(MAX_AGE_MS, maxAgeMs)
      )
        continue;
    }
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

function openFileCheckpoint({
  directory,
  source,
  options,
  chunkBytes,
  pcmBytes,
  overlapBytes = 16000,
}) {
  if (
    !Number.isSafeInteger(chunkBytes) ||
    chunkBytes < 32000 ||
    !Number.isSafeInteger(pcmBytes) ||
    pcmBytes < 0
  )
    throw new TypeError("Invalid checkpoint audio geometry");
  const configuration = configurationHash(options);
  const identity = {
    version: VERSION,
    sourceSha256: source.sha256,
    sourceBytes: source.size,
    configuration,
    chunkBytes,
    pcmBytes,
    overlapBytes,
    format: "pcm16-mono-16000",
  };
  const key = digest(JSON.stringify(identity));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  clearFileCheckpoints(directory, true);
  const root = fs.realpathSync(directory);
  const folder = path.join(root, key);
  if (fs.existsSync(folder) && fs.lstatSync(folder).isSymbolicLink())
    throw new Error("Unsafe checkpoint directory");
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  if (fs.realpathSync(folder) !== folder) throw new Error("Unsafe checkpoint directory");
  const manifestPath = path.join(folder, "manifest.json");
  let manifest = readJson(manifestPath);
  if (
    !manifest ||
    manifest.key !== key ||
    JSON.stringify(manifest.identity) !== JSON.stringify(identity) ||
    !/^[0-9a-f-]{36}$/i.test(manifest.generation || "")
  ) {
    manifest = { key, identity, generation: crypto.randomUUID(), createdAt: Date.now() };
    atomicJson(manifestPath, manifest);
  }
  const total = Math.ceil(pcmBytes / chunkBytes);
  const fileFor = (index) => path.join(folder, `${String(index).padStart(6, "0")}.json`);
  const frameFor = (index) => {
    const start = index * chunkBytes,
      from = Math.max(0, start - (index ? overlapBytes : 0));
    return {
      start,
      from,
      bytes: Math.min(chunkBytes + (index ? overlapBytes : 0), pcmBytes - from),
    };
  };
  const completed = [];
  for (let index = 0; index < total; index++) {
    const record = readJson(fileFor(index));
    if (
      !record ||
      record.key !== key ||
      record.generation !== manifest.generation ||
      record.index !== index ||
      JSON.stringify(record.frame) !== JSON.stringify(frameFor(index)) ||
      !validResult(record.result) ||
      record.sha256 !== digest(JSON.stringify(record.result))
    )
      break;
    completed.push(record.result);
  }
  return {
    completed,
    clear() {
      fs.rmSync(folder, { recursive: true, force: true });
    },
    save(index, result) {
      assertSourceUnchanged(source);
      if (!Number.isSafeInteger(index) || index < 0 || index >= total || !validResult(result))
        throw new TypeError("Only completed valid chunks may be checkpointed");
      // No request IDs, signals, filenames or options are written to the cache.
      const raw = JSON.parse(
        JSON.stringify(result, (key, value) => (key === "signal" ? undefined : value))
      );
      atomicJson(fileFor(index), {
        key,
        generation: manifest.generation,
        index,
        frame: frameFor(index),
        sha256: digest(JSON.stringify(raw)),
        result: raw,
      });
    },
  };
}

module.exports = {
  fingerprintSource,
  assertSourceUnchanged,
  openFileCheckpoint,
  configurationHash,
  clearFileCheckpoints,
};
