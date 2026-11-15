const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { scanAudioFolder, registerFolderImport } = require("../../src/helpers/dssaFolderImport");

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dssa-folder-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "day2"));
  await fs.mkdir(path.join(root, "day10"));
  for (const file of ["main.WAV", "day10/talk.mp3", "day2/talk.mp3", "day2/video.MKV", "notes.txt"])
    await fs.writeFile(path.join(root, file), "unchanged original");
  await fs.writeFile(path.join(root, "empty.wav"), "");
  return root;
}

test("folder scan includes nested media in natural path order and never alters originals", async (t) => {
  const root = await fixture(t);
  const result = await scanAudioFolder(root);
  assert.deepEqual(
    result.files.map((file) => file.name.split(path.sep).join("/")),
    ["day2/talk.mp3", "day2/video.MKV", "day10/talk.mp3", "main.WAV"]
  );
  assert.equal(result.skippedCount, 2);
  assert.equal(result.warningCount, 0);
  for (const file of result.files)
    assert.equal(await fs.readFile(file.path, "utf8"), "unchanged original");
  assert.deepEqual(
    (await scanAudioFolder(root, { recursive: false })).files.map((file) => file.name),
    ["main.WAV"]
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(scanAudioFolder(root, { signal: controller.signal }), {
    name: "AbortError",
  });
});

test("folder links cannot escape the selected folder or create recursive cycles", async (t) => {
  const root = await fixture(t);
  await fs.symlink(root, path.join(root, "day2", "loop"), "junction");
  const result = await scanAudioFolder(root);
  assert.equal(result.files.length, 4);
  assert.equal(result.skippedCount, 3);
});

test("picker authorizes only discovered files and cancel never authorizes paths", async (t) => {
  const root = await fixture(t);
  const handlers = new Map(),
    approved = [];
  let selection = { canceled: false, filePaths: [root] };
  registerFolderImport(
    { handle: (name, fn) => handlers.set(name, fn) },
    {
      dialog: {
        showOpenDialog: async (options) => {
          assert.deepEqual(options.properties, ["openDirectory"]);
          return selection;
        },
      },
      approveAudioPath: (file) => approved.push(file),
    }
  );
  const sender = Object.assign(new EventEmitter(), { id: 4 });
  const pick = handlers.get("select-audio-folder");
  const first = await pick(
    { sender },
    { recursive: false, folderPath: "C:/ignored-renderer-input" }
  );
  assert.equal(first.files.length, 1);
  assert.deepEqual(
    approved,
    first.files.map((file) => file.path)
  );
  selection = { canceled: true, filePaths: [] };
  assert.deepEqual(await pick({ sender }), { canceled: true });
  assert.equal(approved.length, 1);
  let release;
  selection = new Promise((resolve) => {
    release = resolve;
  });
  const pending = pick({ sender });
  assert.match((await pick({ sender })).error, /pågår/);
  handlers.get("cancel-audio-folder-scan")({ sender });
  release({ canceled: false, filePaths: [root] });
  assert.deepEqual(await pending, { canceled: true });
  assert.equal(approved.length, 1);
  assert.equal(sender.listenerCount("destroyed"), 0);
});
