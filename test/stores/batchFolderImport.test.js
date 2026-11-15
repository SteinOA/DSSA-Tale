const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

test("folder queue deduplicates paths, saves each file before the next, and continues after a failed file", async (t) => {
  installBrowserGlobals(t);
  const operations = [];
  globalThis.__folderImportOperations = operations;
  t.after(() => {
    delete globalThis.__folderImportOperations;
  });
  const vite = await createRendererServer(t, {
    cachePrefix: "dssa-folder-queue-",
    mockModules: {
      "/services/fileTranscription": `export async function transcribeFileWithSpeakers(path) {
        globalThis.__folderImportOperations.push("transcribe:" + path);
        return path.includes("bad") ? {success:false,error:"test error"} : {success:true,text:path};
      }`,
      "/components/notes/shared": `export const DOWNLOAD_ERROR_KEYS = {}; export function transcriptionErrorKey() { return null; }`,
      "/services/uploadNotes": `export async function saveUploadNote(value) {
        globalThis.__folderImportOperations.push("save:" + value.sourceName);
        return {success:true,note:{id:globalThis.__folderImportOperations.length}};
      } export function uploadTitleFallback(text) { return text; }`,
      "/stores/settingsStore": "export function getSettings() { return {}; }",
      "/stores/policyRules": "export function isTranscriptionContextAllowed() { return true; }",
      "/stores/policyStore": "export const usePolicyStore = { getState() { return {}; } };",
    },
  });
  const queue = await vite.ssrLoadModule("/stores/batchQueueStore.ts");
  assert.equal(
    queue.addFolderFiles([
      { name: "day1/same.wav", path: "C:/recordings/day1/same.wav", sizeBytes: 20 },
      { name: "bad.wav", path: "C:/recordings/bad.wav", sizeBytes: 20 },
      { name: "day2/same.wav", path: "C:/recordings/day2/same.wav", sizeBytes: 20 },
    ]),
    3
  );
  assert.equal(
    queue.addFolderFiles([
      { name: "duplicate.wav", path: "c:\\RECORDINGS\\day1\\same.wav", sizeBytes: 20 },
    ]),
    0
  );
  assert.equal(queue.useBatchQueueStore.getState().isProcessing, false);
  assert.deepEqual(operations, []);
  queue.processBatchQueue(
    { transcription: { getApiKey: () => "", useLocalWhisper: true }, folderId: 2 },
    { enabled: false }
  );
  for (let i = 0; i < 100 && queue.useBatchQueueStore.getState().isProcessing; i++)
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(queue.useBatchQueueStore.getState().isProcessing, false);
  assert.deepEqual(operations, [
    "transcribe:C:/recordings/day1/same.wav",
    "save:day1/same.wav",
    "transcribe:C:/recordings/bad.wav",
    "transcribe:C:/recordings/day2/same.wav",
    "save:day2/same.wav",
  ]);
  const items = queue.useBatchQueueStore.getState().queue;
  assert.deepEqual(
    items.map((item) => item.status),
    ["done", "error", "done"]
  );
  assert.notEqual(items[0].noteId, items[2].noteId);
});
