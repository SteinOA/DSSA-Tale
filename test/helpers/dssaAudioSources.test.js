const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"),
  path = require("path"),
  os = require("os");
const { pickCloudAudio } = require("../../src/helpers/dssaAudioSources");
test("cloud picker opens the provider folder and remembers user-chosen locations separately", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-sources-"));
  try {
    const drive = path.join(root, "Google Drive");
    fs.mkdirSync(drive);
    const custom = path.join(root, "custom-drive");
    fs.mkdirSync(custom);
    const file = path.join(custom, "mote.mp3");
    fs.writeFileSync(file, "audio");
    const seen = [];
    const environment = {
      app: { getPath: () => root },
      dialog: {
        showOpenDialog: async (options) => {
          seen.push(options);
          return { canceled: false, filePaths: [file] };
        },
      },
    };
    assert.equal((await pickCloudAudio(environment, "google")).filePath, file);
    assert.equal(seen[0].defaultPath, drive);
    await pickCloudAudio(environment, "google");
    assert.equal(seen[1].defaultPath, custom);
    await pickCloudAudio(environment, "apple");
    assert.equal(seen[2].defaultPath, undefined);
    await assert.rejects(pickCloudAudio(environment, "unknown"), /Ukjent/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("cancel changes no remembered folder; unsupported selections are rejected", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-sources-"));
  try {
    const environment = {
      app: { getPath: () => root },
      dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    };
    assert.deepEqual(await pickCloudAudio(environment, "google"), { canceled: true });
    assert.equal(fs.existsSync(path.join(root, "dssa-audio-source-folders.json")), false);
    environment.dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path.join(root, "program.exe")],
    });
    await assert.rejects(pickCloudAudio(environment, "google"), /lyd/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
