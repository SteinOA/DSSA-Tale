const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAudioManager } = require("./harness/audioManager");

// transcriptions.timestamp is what the history list sorts and groups on. A
// successful dictation stores when speech started, so every other row a
// recording can produce has to be dated the same way -- otherwise a failed
// take sorts above the dictation that was still being transcribed when it
// happened, and the column means two different things depending on the row.
async function loadManagerClass(t) {
  return loadAudioManager(t, {
    cachePrefix: "openwhispr-occurrence-time-test-",
    settingsKey: "__occurrenceTimeSettings",
    settings: { dataRetentionEnabled: true, audioRetentionDays: 0 },
    mockModules: {
      "/services/SyncService.js": "export const syncService = { debouncedPush() {} };",
    },
  });
}

test("a failed take is dated when it was recorded, not when the failure was written", async (t) => {
  const { AudioManager, window } = await loadManagerClass(t);
  const saved = [];
  window.electronAPI.saveTranscription = async (text, rawText, options) => {
    saved.push(options);
    return { id: 1 };
  };

  const manager = Object.assign(Object.create(AudioManager.prototype), {
    lastAudioBlob: null,
    lastAudioMetadata: null,
    translationRequested: false,
  });
  await manager.saveFailedTranscription("boom", null, {
    analyticsOccurredAt: "2026-04-01T09:00:00.000Z",
  });

  assert.equal(saved.length, 1);
  assert.equal(saved[0].analyticsOccurredAt, "2026-04-01T09:00:00.000Z");
});

test("a discarded take carries its recording time past the state reset", async (t) => {
  const { AudioManager } = await loadManagerClass(t);
  const manager = Object.assign(Object.create(AudioManager.prototype), {
    recordingStartTime: Date.parse("2026-04-01T09:00:00.000Z"),
    audioChunks: [],
    _batchSegments: [],
    recordingMimeType: "audio/webm",
  });

  // The snapshot exists because the save is async and runs after the manager
  // has already been reset for the next recording, so recordingStartTime is
  // gone by then -- the occurrence time has to be captured with the audio.
  const snapshot = manager.takeDiscardedBatchSnapshot();

  assert.equal(snapshot.analyticsOccurredAt, "2026-04-01T09:00:00.000Z");
});

test("only a finished dictation requests notepad append using the exact final text", async (t) => {
  const { AudioManager, window } = await loadManagerClass(t);
  const writes = [];
  window.electronAPI.recordAnalyticsEvent = async () => ({ success: true });
  window.electronAPI.saveTranscription = async (...args) => {
    writes.push(args);
    return { id: 1 };
  };
  window.electronAPI.readClipboard = () => {
    throw new Error("Clipboard must not be read");
  };
  const manager = Object.assign(Object.create(AudioManager.prototype), {
    lastAudioBlob: null,
    lastAudioMetadata: null,
    translationRequested: false,
  });
  const final = "Eg møter Åse kl. 14.30 – 12 deltakarar, 3 500 kroner.";
  assert.equal(
    await manager.saveTranscription(final, "raw", { clientTranscriptionId: "exact-final" }),
    true
  );
  assert.equal(writes[0][0], final);
  assert.equal(writes[0][2].appendToNotepad, true);
  await manager.saveFailedTranscription("failure", null, {});
  assert.notEqual(writes[1][2].appendToNotepad, true);
});
