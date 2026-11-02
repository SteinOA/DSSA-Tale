const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const {
  readCommunityConfig,
  validateCommunityResult,
  runCommunityDiarization,
  speakerConstraints,
} = require("../../src/helpers/dssaCommunityDiarization");
test("speaker count guidance distinguishes an old cap from an exact count or range", () => {
  assert.deepEqual(speakerConstraints(), { maxSpeakers: 15 });
  assert.deepEqual(speakerConstraints({ maxSpeakers: 9, minSpeakers: 8 }), {
    maxSpeakers: 9,
    minSpeakers: 8,
  });
  assert.deepEqual(speakerConstraints({ exactSpeakers: 12 }), {
    maxSpeakers: 15,
    exactSpeakers: 12,
  });
  assert.deepEqual(speakerConstraints({ exactSpeakers: 15 }), {
    maxSpeakers: 15,
    exactSpeakers: 15,
  });
  for (const options of [
    { maxSpeakers: 16 },
    { minSpeakers: 9, maxSpeakers: 8 },
    { exactSpeakers: true },
    { exactSpeakers: 4.5 },
    { exactSpeakers: 12, maxSpeakers: 9 },
  ])
    assert.throws(() => speakerConstraints(options));
});
test("Community configuration is optional and refuses shell commands or missing files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-community-config-test-"));
  try {
    assert.equal(readCommunityConfig(dir), null);
    fs.writeFileSync(
      path.join(dir, "dssa-community-engine.json"),
      JSON.stringify({
        enabled: true,
        pythonPath: "python; injected",
        modelPath: dir,
        device: "cuda",
      })
    );
    assert.equal(readCommunityConfig(dir), null);
    fs.writeFileSync(path.join(dir, "dssa-community-engine.json"), "invalid json");
    assert.equal(readCommunityConfig(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("model output must have real bounded times and cannot exceed the selected speaker cap", () => {
  const good = {
    success: true,
    engine: "pyannote-community-1",
    durationSeconds: 10,
    segments: [{ start: 1, end: 2, speaker: "speaker_0" }],
  };
  assert.equal(validateCommunityResult(good, 1), good);
  assert.throws(() =>
    validateCommunityResult({ ...good, segments: [{ start: 1, end: 20, speaker: "speaker_0" }] }, 1)
  );
  assert.throws(() =>
    validateCommunityResult(
      { ...good, segments: [...good.segments, { start: 3, end: 4, speaker: "speaker_1" }] },
      1
    )
  );
  assert.throws(() => validateCommunityResult({ ...good, segments: [] }, 1));
});
test("a cancelled request never starts a Python process or writes private request data", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runCommunityDiarization({}, "unused", { signal: controller.signal }), {
    name: "AbortError",
  });
});
