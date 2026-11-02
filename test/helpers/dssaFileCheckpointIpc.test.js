const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const chunks = require("../../src/helpers/dssaFileChunks");
const checkpoints = require("../../src/helpers/dssaFileCheckpoint");
const handlersPath = require.resolve("../../src/helpers/ipcHandlers");
const originalLoad = Module._load;
let userData, chunkHandler, clearCalls, clearError;
const electron = {
  app: {
    getPath: () => userData,
    getName: () => "test",
    getVersion: () => "0",
    on() {},
    isPackaged: false,
  },
  ipcMain: { handle() {}, on() {} },
  BrowserWindow: { getAllWindows: () => [] },
  net: {},
  shell: {},
  systemPreferences: {},
  session: {},
};

let IPCHandlers;
test.before(() => {
  Module._load = function (request, parent, isMain) {
    if (request === "electron") return electron;
    if (parent?.filename === handlersPath && request === "./dssaFileChunks")
      return { transcribeFileChunks: (...args) => chunkHandler(...args) };
    if (parent?.filename === handlersPath && request === "./dssaFileCheckpoint")
      return {
        ...checkpoints,
        clearFileCheckpoints: (...args) => {
          clearCalls.push(args);
          if (clearError) throw clearError;
          checkpoints.clearFileCheckpoints(...args);
        },
      };
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[handlersPath];
  IPCHandlers = require(handlersPath);
});
test.after(() => {
  Module._load = originalLoad;
  delete require.cache[handlersPath];
});
test.beforeEach(() => {
  clearCalls = [];
  clearError = undefined;
});

function context() {
  return Object.assign(Object.create(IPCHandlers.prototype), {
    _retentionSettingsSynced: true,
    _retentionSettings: {
      dataRetentionEnabled: true,
      localHistoryPolicyResolved: true,
      audioRetentionDays: 0,
      transcriptRetentionDays: 0,
    },
    _hasActiveAccountScope: () => true,
    _resolveWhisperVadOptions: () => ({ vadEnabled: true, vadConfig: { threshold: 0.6 } }),
  });
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-checkpoint-ipc-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  userData = path.join(root, "isolated-profile");
  fs.mkdirSync(userData);
  return root;
}

test("Whisper file IPC uses its profile cache, live resolved-history consent and existing speech/progress options", async (t) => {
  fixture(t);
  const ctx = context(),
    progress = () => {},
    signal = new AbortController().signal;
  let captured;
  ctx.whisperManager = { transcribeLocalWhisper: async (buffer, options) => ({ buffer, options }) };
  chunkHandler = async (...args) => {
    captured = args;
    return { success: true, text: "Eg held fram." };
  };
  const result = await ctx.transcribeLocalFile("already-approved.audio", {
    provider: "openai",
    model: "nb-large",
    language: "nn",
    timestamps: true,
    signal,
    onProgress: progress,
  });
  assert.equal(result.text, "Eg held fram.");
  const [source, options, deps] = captured;
  assert.equal(source, "already-approved.audio");
  assert.equal(deps.checkpointDirectory, path.join(userData, "file-transcription-checkpoints"));
  assert.equal(deps.onProgress, progress);
  assert.equal(options.signal, signal);
  assert.equal(options.language, "nn");
  assert.equal(options.timestamps, true);
  assert.equal(options.onProgress, undefined);
  assert.deepEqual(options.vadConfig, { threshold: 0.6 });
  assert.equal(deps.canCheckpoint(), true);
  ctx._retentionSettingsSynced = false;
  assert.equal(deps.canCheckpoint(), false, "startup defaults are not consent");
  ctx._retentionSettingsSynced = true;
  ctx._retentionSettings.dataRetentionEnabled = false;
  assert.equal(deps.canCheckpoint(), false, "renderer history-off applies to an existing callback");
  ctx._retentionSettings.dataRetentionEnabled = true;
  ctx._retentionSettings.localHistoryPolicyResolved = false;
  assert.equal(
    deps.canCheckpoint(),
    false,
    "signed-in unresolved managed policy cannot authorize caching"
  );
  ctx._retentionSettings.localHistoryPolicyResolved = true;
  assert.equal(deps.canCheckpoint(), true);
  ctx._retentionSettings.localHistoryPolicyResolved = false;
  ctx._hasActiveAccountScope = () => false;
  assert.equal(
    deps.canCheckpoint(),
    true,
    "signed-out synchronized personal preference remains usable"
  );
  const payload = Buffer.from("bounded PCM"),
    chunkOptions = { priority: "background", language: "nn" };
  assert.deepEqual(await deps.transcribe(payload, chunkOptions), {
    buffer: payload,
    options: chunkOptions,
  });
});

test("live IPC callback removes an existing checkpoint when history is turned off mid-file and keeps usable text", async (t) => {
  const root = fixture(t),
    source = path.join(root, "source.audio"),
    ctx = context();
  fs.writeFileSync(source, "unchanged synthetic input");
  const cache = path.join(userData, "file-transcription-checkpoints");
  let calls = 0;
  ctx.whisperManager = {
    transcribeLocalWhisper: async () => {
      calls++;
      if (calls === 2) {
        assert.equal(fs.readdirSync(cache).length, 1);
        ctx._retentionSettings.dataRetentionEnabled = false;
      }
      return { success: true, text: `Del ${calls}.` };
    },
  };
  chunkHandler = (file, options, deps) =>
    chunks.transcribeFileChunks(file, options, {
      ...deps,
      temporaryRoot: root,
      convert: async (_input, output) =>
        fs.writeFileSync(
          output,
          Buffer.concat([chunks.wavHeader(65 * 32000), Buffer.alloc(65 * 32000)])
        ),
    });
  const result = await ctx.transcribeLocalFile(source, { provider: "openai", language: "nn" });
  assert.equal(calls, 3);
  assert.equal(result.text, "Del 1. Del 2. Del 3.");
  assert.deepEqual(fs.readdirSync(cache), []);
  assert.equal(fs.readFileSync(source, "utf8"), "unchanged synthetic input");
});

test("retention cleanup clears checkpoint transcripts for off or unresolved history without bypassing audio retention", (t) => {
  fixture(t);
  const ctx = context(),
    audioCleanups = [];
  ctx.audioStorageManager = { cleanupExpiredAudio: (...args) => audioCleanups.push(args) };
  ctx.databaseManager = {};
  ctx._retentionSettings.audioRetentionDays = 7;
  ctx._retentionSettings.dataRetentionEnabled = false;
  ctx._runRetentionCleanup();
  const cache = path.join(userData, "file-transcription-checkpoints");
  const day = 24 * 60 * 60 * 1000;
  assert.deepEqual(clearCalls, [[cache, false, 7 * day]]);
  assert.deepEqual(audioCleanups, [[7, ctx.databaseManager]]);
  clearCalls = [];
  ctx._retentionSettings.dataRetentionEnabled = true;
  ctx._retentionSettings.localHistoryPolicyResolved = false;
  ctx._runRetentionCleanup();
  assert.deepEqual(clearCalls, [[cache, false, 7 * day]]);
  clearCalls = [];
  ctx._retentionSettings.localHistoryPolicyResolved = true;
  ctx._runRetentionCleanup();
  assert.deepEqual(
    clearCalls,
    [[cache, true, 7 * day]],
    "allowed history still sweeps expired recovery data"
  );
  ctx.databaseManager.deleteTranscriptionsExpiredBefore = () => ({ ids: [], analyticsPurged: 0 });
  for (const days of [1, 3, 30]) {
    clearCalls = [];
    ctx._retentionSettings.transcriptRetentionDays = days;
    ctx._runRetentionCleanup();
    assert.deepEqual(
      clearCalls,
      [[cache, true, Math.min(7, days) * day]],
      "checkpoint TTL honors shorter transcript retention and never exceeds seven days"
    );
  }
});

test("checkpoint cleanup failure cannot block normal transcript and audio retention", (t) => {
  fixture(t);
  const ctx = context(),
    operations = [];
  ctx._retentionSettings.audioRetentionDays = 3;
  ctx._retentionSettings.transcriptRetentionDays = 1;
  ctx.databaseManager = {
    deleteTranscriptionsExpiredBefore: (days) => {
      operations.push(["transcript", days]);
      return { ids: [42], analyticsPurged: 1 };
    },
  };
  ctx.audioStorageManager = {
    deleteAudio: (id) => operations.push(["deleted-audio", id]),
    cleanupExpiredAudio: (days, db) => {
      assert.equal(db, ctx.databaseManager);
      operations.push(["audio", days]);
    },
  };
  clearError = Object.assign(new Error("injected cleanup failure"), { code: "EACCES" });
  assert.doesNotThrow(() => ctx._runRetentionCleanup());
  assert.equal(clearCalls.length, 1);
  assert.deepEqual(operations, [
    ["transcript", 1],
    ["deleted-audio", 42],
    ["audio", 3],
  ]);
});

test("NVIDIA and Cohere Sherpa routes retain their original buffer/options path without Whisper checkpoints", async (t) => {
  const root = fixture(t),
    source = path.join(root, "source.audio"),
    ctx = context();
  fs.writeFileSync(source, "sherpa input");
  chunkHandler = async () => {
    assert.fail("Sherpa must not enter Whisper chunk/checkpoint handling");
  };
  for (const provider of ["nvidia", "cohere"]) {
    const options = { provider, language: "nn", model: "local-sherpa" };
    ctx.parakeetManager = {
      transcribeLocalParakeet: async (buffer, received) => {
        assert.equal(buffer.toString(), "sherpa input");
        assert.equal(received, options);
        return { success: true, text: "Direkte lokal rute." };
      },
    };
    assert.equal((await ctx.transcribeLocalFile(source, options)).text, "Direkte lokal rute.");
  }
  assert.equal(fs.existsSync(path.join(userData, "file-transcription-checkpoints")), false);
});
