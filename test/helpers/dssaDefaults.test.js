const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeDssaDefaults } = require("../../src/dssaDefaults.ts");
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
  };
}
test("local defaults preserve existing ASR, self-hosted model, endpoint, hotkey and cleanup choice", () => {
  const existing = {
    whisperModel: "nb-large",
    preferredLanguage: "nn",
    cleanupMode: "self-hosted",
    cleanupRemoteUrl: "http://127.0.0.1:11434/v1",
    cleanupModel: "gemma3:4b",
    useCleanupModel: "false",
    dictationKey: "Control+Super",
    uiLanguage: "en",
  };
  const s = storage(existing);
  initializeDssaDefaults(s);
  for (const [key, value] of Object.entries(existing)) assert.equal(s.getItem(key), value, key);
  assert.equal(s.getItem("meetingTranscriptionMode"), "local");
  s.setItem("whisperModel", "nb-large-full");
  initializeDssaDefaults(s);
  assert.equal(s.getItem("whisperModel"), "nb-large-full");
});
test("fresh installs use Norwegian and local speech with cleanup off", () => {
  const s = storage();
  initializeDssaDefaults(s);
  assert.equal(s.getItem("uiLanguage"), "nb");
  assert.equal(s.getItem("preferredLanguage"), "no");
  assert.equal(s.getItem("useCleanupModel"), "false");
  assert.equal(s.getItem("transcriptionMode"), "local");
  assert.equal(s.getItem("skipAuth"), "true");
  assert.equal(s.getItem("audioCuesEnabled"), "false");
});

test("the initial English Nemotron test profile recovers to its existing Norwegian Whisper model", () => {
  const s = storage({
    dssaLocalMigrationV1: "true",
    preferredLanguage: "auto",
    whisperModel: "nb-large-full",
    localTranscriptionProvider: "nvidia",
    meetingLocalTranscriptionProvider: "nvidia",
    uploadLocalTranscriptionProvider: "nvidia",
  });
  initializeDssaDefaults(s);
  assert.equal(s.getItem("preferredLanguage"), "no");
  assert.equal(s.getItem("whisperModel"), "nb-large-full");
  for (const key of [
    "localTranscriptionProvider",
    "meetingLocalTranscriptionProvider",
    "uploadLocalTranscriptionProvider",
  ])
    assert.equal(s.getItem(key), "whisper");
  assert.equal(
    JSON.parse(s.getItem("dssaSpeechBeforeNorwegianRecovery")).localTranscriptionProvider,
    "nvidia"
  );
  s.setItem("preferredLanguage", "nn");
  initializeDssaDefaults(s);
  assert.equal(s.getItem("preferredLanguage"), "nn");
});

test("existing DSSA profiles silence cues once without resetting speech settings or later choices", () => {
  const s = storage({
    dssaLocalMigrationV1: "true",
    audioCuesEnabled: "true",
    whisperModel: "nb-large-full",
    preferredLanguage: "no",
    dictationKey: "Control+Super",
  });
  initializeDssaDefaults(s);
  assert.equal(s.getItem("audioCuesEnabled"), "false");
  assert.deepEqual(JSON.parse(s.getItem("dssaAudioCuesBeforeQuietMigration")), {
    audioCuesEnabled: "true",
  });
  assert.equal(s.getItem("whisperModel"), "nb-large-full");
  assert.equal(s.getItem("preferredLanguage"), "no");
  assert.equal(s.getItem("dictationKey"), "Control+Super");
  s.setItem("audioCuesEnabled", "true");
  initializeDssaDefaults(s);
  assert.equal(s.getItem("audioCuesEnabled"), "true");
  assert.deepEqual(JSON.parse(s.getItem("dssaAudioCuesBeforeQuietMigration")), {
    audioCuesEnabled: "true",
  });
});
