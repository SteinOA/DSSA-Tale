const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { MeetingSetup, PYTHON, PUNKT } = require("../../src/helpers/dssaMeetingSetup");

test("Silero inventory checks bundled files without installing or copying them", (t) => {
  const { bundledSileroAvailable } = require("../../src/helpers/dssaMeetingSetup");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-silero-status-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const resources = path.join(root, "resources");
  const folder = path.join(resources, "bin", "whisper-vad");
  assert.equal(bundledSileroAvailable(resources, root), false);
  assert.equal(fs.existsSync(resources), false);
  fs.mkdirSync(folder, { recursive: true });
  const model = path.join(folder, "ggml-silero-v5.1.2.bin");
  fs.writeFileSync(model, "");
  assert.equal(bundledSileroAvailable(resources, root), false);
  fs.writeFileSync(model, "synthetic model fixture");
  assert.equal(bundledSileroAvailable(resources, root), true);
  assert.equal(fs.readFileSync(model, "utf8"), "synthetic model fixture");
});
test("optional download checks byte count and hash before activating an artifact", async (t) => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "dssa-setup-test-"));
  t.after(() => {
    if (path.dirname(root) === fs.realpathSync(os.tmpdir()))
      fs.rmSync(root, { recursive: true, force: true });
  });
  const setup = new MeetingSetup({
    app: { getPath: () => root },
    net: { fetch: async () => new Response("tampered") },
    safeStorage: {},
  });
  setup.controller = new AbortController();
  await assert.rejects(
    setup.download({ ...PYTHON, bytes: 8 }, path.join(root, "download.gz")),
    /kontrollsummen/
  );
  assert.ok(!fs.existsSync(path.join(root, "download.gz")));
  assert.match(PYTHON.sha256, /^[a-f0-9]{64}$/);
  assert.match(PUNKT.sha256, /^[a-f0-9]{64}$/);
});
test("failed setup preserves old configuration and emits no secret or raw subprocess trace", async (t) => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "dssa-setup-fail-"));
  t.after(() => {
    if (path.dirname(root) === fs.realpathSync(os.tmpdir()))
      fs.rmSync(root, { recursive: true, force: true });
  });
  const file = path.join(root, "dssa-community-engine.json");
  fs.writeFileSync(file, "previous working setup");
  const setup = new MeetingSetup({ app: { getPath: () => root }, net: { fetch }, safeStorage: {} });
  setup.install = async () => {
    throw Error("Controlled public test failure");
  };
  setup.start({ kind: "runtime", device: "cpu" });
  assert.throws(() => setup.start({ kind: "runtime" }), /allerede/);
  await setup.pending;
  assert.equal(setup.state.busy, false);
  assert.equal(setup.state.phase, "failed");
  assert.equal(fs.readFileSync(file, "utf8"), "previous working setup");
  assert.equal(setup.state.error, "Controlled public test failure");
});
