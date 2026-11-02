const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"),
  os = require("os"),
  path = require("path");
const {
  chooseConnectionFolder,
  readConnections,
  listConnections,
  removeConnectionFolder,
  openConnectionFolder,
  openConnectionLogin,
} = require("../../src/helpers/dssaConnections");
const { pickCloudAudio } = require("../../src/helpers/dssaAudioSources");
test("fixed cloud folder persists across service instances, is used for import, and survives subfolder imports", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-connection-"));
  try {
    const fixed = path.join(root, "cloud"),
      sub = path.join(fixed, "sub");
    fs.mkdirSync(sub, { recursive: true });
    const file = path.join(sub, "møte.mp3");
    fs.writeFileSync(file, "source");
    const app = { getPath: () => root };
    const env = {
      app,
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [fixed] }) },
    };
    const connected = await chooseConnectionFolder(env, "google");
    assert.equal(connected.connections.find((x) => x.source === "google").available, true);
    const restartedApp = { getPath: () => root };
    assert.equal(readConnections(restartedApp).google, fs.realpathSync(fixed));
    const opened = [];
    env.dialog.showOpenDialog = async (options) => {
      opened.push(options.defaultPath);
      return { canceled: false, filePaths: [file] };
    };
    await pickCloudAudio(env, "google");
    await pickCloudAudio(env, "google");
    assert.deepEqual(opened, [fs.realpathSync(fixed), fs.realpathSync(fixed)]);
    assert.equal(readConnections(app).google, fs.realpathSync(fixed));
    let target;
    await openConnectionFolder(
      {
        app,
        shell: {
          openPath: async (p) => {
            target = p;
            return "";
          },
        },
      },
      "google"
    );
    assert.equal(target, fs.realpathSync(fixed));
    removeConnectionFolder(app, "google");
    assert.equal(readConnections(app).google, undefined);
    assert.equal(fs.readFileSync(file, "utf8"), "source");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("cancel, invalid source, inaccessible folder, corrupt settings and shell errors stay honest", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-connection-"));
  try {
    const app = { getPath: () => root };
    const env = {
      app,
      dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    };
    assert.deepEqual(await chooseConnectionFolder(env, "apple"), { canceled: true });
    assert.deepEqual(readConnections(app), {});
    await assert.rejects(chooseConnectionFolder(env, "not-a-provider"), /Ukjent/);
    await assert.rejects(openConnectionLogin({ shell: {} }, "https://attacker.invalid"), /Ukjent/);
    const file = path.join(root, "dssa-connections.json");
    fs.writeFileSync(file, "broken");
    assert.deepEqual(readConnections(app), {});
    fs.writeFileSync(file, JSON.stringify({ apple: path.join(root, "offline") }));
    assert.equal(listConnections(app).find((x) => x.source === "apple").available, false);
    await assert.rejects(pickCloudAudio(env, "apple"), /tilgjengelig/);
    await assert.rejects(
      openConnectionFolder({ app, shell: { openPath: () => assert.fail() } }, "apple"),
      /tilgjengelig/
    );
    fs.writeFileSync(file, JSON.stringify({ apple: root }));
    await assert.rejects(
      openConnectionFolder({ app, shell: { openPath: async () => "denied" } }, "apple"),
      /denied/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("connections UI supports all three languages and never calls a launched client an authenticated account", () => {
  const labels = ["nb", "nn", "en"].map(
    (lang) =>
      JSON.parse(
        fs.readFileSync(path.join(__dirname, "../../src/locales", lang, "translation.json"), "utf8")
      ).dssaConnections
  );
  for (const locale of labels) {
    assert.deepEqual(Object.keys(locale).sort(), Object.keys(labels[0]).sort());
    for (const value of Object.values(locale)) assert.ok(value.length > 0);
  }
  const code = fs.readFileSync(
    path.join(__dirname, "../../src/components/dssa/DssaConnections.tsx"),
    "utf8"
  );
  assert.match(code, /item\.available/);
  assert.match(code, /api\.connections/);
  assert.match(code, /connectionOnly/);
});

test("detected folders use existing Windows access with one choice; unknown and vanished candidates are rejected", () => {
  const { useDetectedConnectionFolder } = require("../../src/helpers/dssaConnections");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-detected-"));
  try {
    const app = { getPath: () => root },
      detected = path.join(root, "Google Drive");
    fs.mkdirSync(detected);
    const result = useDetectedConnectionFolder(app, "google", detected);
    assert.equal(
      result.connections.find((item) => item.source === "google").path,
      fs.realpathSync(detected)
    );
    assert.equal(result.connections.find((item) => item.source === "google").available, true);
    assert.throws(() => useDetectedConnectionFolder(app, "google", root), /tilgjengelig/);
    fs.rmdirSync(detected);
    assert.throws(() => useDetectedConnectionFolder(app, "google", detected), /tilgjengelig/);
    assert.equal(readConnections(app).google, detected);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
