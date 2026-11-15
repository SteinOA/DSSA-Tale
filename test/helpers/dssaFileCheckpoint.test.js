const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const {
  fingerprintSource,
  assertSourceUnchanged,
  openFileCheckpoint,
  configurationHash,
  clearFileCheckpoints,
} = require("../../src/helpers/dssaFileCheckpoint");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-checkpoint-test-"));
  const file = path.join(root, "source.audio");
  fs.writeFileSync(file, "audio A");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, file, directory: path.join(root, "checkpoints") };
}
const params = (directory, source, options = {}) => ({
  directory,
  source,
  options: { model: "nb-large", language: "nn", timestamps: true, ...options },
  chunkBytes: 32000,
  pcmBytes: 96000,
});
const result = {
  success: true,
  text: "Eg held fram.",
  segments: [
    {
      text: "Eg held fram.",
      start: 0,
      end: 1,
      words: [
        { text: " Eg", start: 0, end: 0.2 },
        { text: " held", start: 0.2, end: 0.6 },
        { text: " fram.", start: 0.6, end: 1 },
      ],
    },
  ],
};

test("configuration identity includes inference settings while excluding cancellation and request bookkeeping", () => {
  const first = {
    model: "nb-large",
    language: "nn",
    timestamps: true,
    vadConfig: { threshold: 0.5, minSpeechDurationMs: 100 },
  };
  assert.equal(
    configurationHash(first),
    configurationHash({
      vadConfig: { minSpeechDurationMs: 100, threshold: 0.5 },
      timestamps: true,
      language: "nn",
      model: "nb-large",
      signal: new AbortController().signal,
      requestId: "new-request",
      priority: "interactive",
      onProgress() {},
    })
  );
  for (const patch of [
    { model: "nb-large-full" },
    { language: "no" },
    { timestamps: false },
    { initialPrompt: "Another dictionary" },
    { vadConfig: { threshold: 0.6 } },
    { skipDecoderThresholds: true },
  ])
    assert.notEqual(configurationHash(first), configurationHash({ ...first, ...patch }));
});

test("atomic records round-trip complete raw timing and do not expose source paths or inference hints in metadata", async (t) => {
  const f = fixture(t),
    source = await fingerprintSource(f.file);
  const config = params(f.directory, source, {
    initialPrompt: "PRIVATE_INITIAL_HINT",
    requestId: "private-request-id",
    signal: new AbortController().signal,
  });
  const checkpoint = openFileCheckpoint(config);
  checkpoint.save(0, result);
  const restored = openFileCheckpoint(config);
  assert.deepEqual(restored.completed, [result]);
  const folder = path.join(f.directory, fs.readdirSync(f.directory)[0]);
  const files = fs.readdirSync(folder);
  assert.deepEqual(files.sort(), ["000000.json", "manifest.json"]);
  const metadata = fs.readFileSync(path.join(folder, "manifest.json"), "utf8");
  assert.ok(!metadata.includes(f.file));
  assert.doesNotMatch(metadata, /PRIVATE_INITIAL_HINT|private-request-id|signal|requestId/);
});

test("corrupt or missing records only permit a validated contiguous prefix, never skip a lost middle chunk", async (t) => {
  const f = fixture(t),
    config = params(f.directory, await fingerprintSource(f.file));
  const checkpoint = openFileCheckpoint(config);
  for (let index = 0; index < 3; index++) checkpoint.save(index, result);
  const folder = path.join(f.directory, fs.readdirSync(f.directory)[0]);
  const middle = path.join(folder, "000001.json");
  const tampered = JSON.parse(fs.readFileSync(middle, "utf8"));
  tampered.result.text = "Tampered text";
  fs.writeFileSync(middle, JSON.stringify(tampered));
  assert.equal(openFileCheckpoint(config).completed.length, 1, "checksum invalidates altered JSON");
  fs.unlinkSync(middle);
  assert.equal(
    openFileCheckpoint(config).completed.length,
    1,
    "a valid suffix is not reused across a hole"
  );
  fs.writeFileSync(path.join(folder, "manifest.json"), "broken JSON");
  assert.equal(
    openFileCheckpoint(config).completed.length,
    0,
    "new manifest generation rejects every old record"
  );
});

test("same-size source replacement and inference or chunk geometry changes never reuse stale text", async (t) => {
  const f = fixture(t),
    source = await fingerprintSource(f.file);
  const config = params(f.directory, source),
    checkpoint = openFileCheckpoint(config);
  checkpoint.save(0, result);
  const oldTimes = fs.statSync(f.file);
  fs.writeFileSync(f.file, "audio B");
  fs.utimesSync(f.file, oldTimes.atime, oldTimes.mtime);
  const replaced = await fingerprintSource(f.file);
  assert.notEqual(replaced.sha256, source.sha256);
  assert.equal(replaced.size, source.size);
  assert.equal(openFileCheckpoint(params(f.directory, replaced)).completed.length, 0);
  for (const patch of [
    { options: { ...config.options, language: "no" } },
    { chunkBytes: 64000 },
    { pcmBytes: 128000 },
  ])
    assert.equal(openFileCheckpoint({ ...config, ...patch }).completed.length, 0);
});

test("changed sources and failed results cannot be checkpointed as completed speech", async (t) => {
  const f = fixture(t),
    source = await fingerprintSource(f.file),
    checkpoint = openFileCheckpoint(params(f.directory, source));
  assert.throws(() => checkpoint.save(0, { success: false, error: "decode failed" }), TypeError);
  checkpoint.save(0, { success: false, message: "No audio detected" });
  fs.writeFileSync(f.file, "changed source");
  assert.throws(() => assertSourceUnchanged(source), { code: "SOURCE_FILE_CHANGED" });
  assert.throws(() => checkpoint.save(1, result), { code: "SOURCE_FILE_CHANGED" });
});

test("expired interrupted checkpoints are not reused beyond seven days", async (t) => {
  const f = fixture(t),
    config = params(f.directory, await fingerprintSource(f.file));
  const checkpoint = openFileCheckpoint(config);
  checkpoint.save(0, result);
  const folder = path.join(f.directory, fs.readdirSync(f.directory)[0]);
  const manifestPath = path.join(folder, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.createdAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.deepEqual(openFileCheckpoint(config).completed, []);
  assert.equal(fs.existsSync(path.join(folder, "000000.json")), false);
});

test("a shorter history retention also expires interrupted transcript parts", async (t) => {
  const f = fixture(t),
    config = params(f.directory, await fingerprintSource(f.file));
  openFileCheckpoint(config).save(0, result);
  const folder = path.join(f.directory, fs.readdirSync(f.directory)[0]);
  const file = path.join(folder, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.createdAt = Date.now() - 2 * 24 * 60 * 60 * 1000;
  fs.writeFileSync(file, JSON.stringify(manifest));
  clearFileCheckpoints(f.directory, true, 24 * 60 * 60 * 1000);
  assert.equal(fs.existsSync(folder), false);
});
