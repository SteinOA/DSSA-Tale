const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"),
  path = require("path"),
  os = require("os");
const {
  listLibraries,
  getLibrary,
  addLibrary,
  removeLibrary,
} = require("../../src/helpers/dssaRecordingLibraries");
test("recording libraries retain their selected path without copying or deleting audio", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-libraries-"));
  const folder = path.join(root, "RODE Reporter");
  fs.mkdirSync(folder);
  const audio = path.join(folder, "opptak.m4a");
  fs.writeFileSync(audio, "recording");
  const app = { getPath: () => root };
  const environment = {
    app,
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [folder] }) },
  };
  try {
    assert.deepEqual(listLibraries(app), []);
    const result = await addLibrary(environment, { kind: "rode", label: "RØDE Reporter" });
    const library = result.libraries[0];
    assert.equal(library.label, "RØDE Reporter");
    assert.equal(library.available, true);
    assert.equal(library.path, undefined); // renderer does not need the stored filesystem path
    assert.equal(getLibrary(app, library.id).path, fs.realpathSync(folder));
    assert.equal(
      (await addLibrary(environment, { kind: "rode", label: "duplicate" })).libraries.length,
      1
    );
    assert.deepEqual(removeLibrary(app, library.id).libraries, []);
    assert.equal(fs.readFileSync(audio, "utf8"), "recording");
    assert.throws(() => getLibrary(app, library.id), /ikke tilgjengelig/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("cancel creates no library and unavailable folders stay bookmarked", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-libraries-"));
  const app = { getPath: () => root };
  const folder = path.join(root, "phone");
  fs.mkdirSync(folder);
  const environment = {
    app,
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  };
  try {
    assert.deepEqual(await addLibrary(environment, { kind: "iphone", label: "" }), {
      canceled: true,
    });
    assert.deepEqual(listLibraries(app), []);
    environment.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    const result = await addLibrary(environment, { kind: "android", label: "Telefon" });
    fs.rmdirSync(folder);
    assert.equal(listLibraries(app)[0].available, false);
    assert.throws(() => getLibrary(app, result.libraries[0].id), /ikke tilgjengelig/);
    await assert.rejects(addLibrary(environment, { kind: "__proto__" }), /Ukjent/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
