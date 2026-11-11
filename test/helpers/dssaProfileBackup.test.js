const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { backupBeforeMigration } = require("../../src/helpers/dssaProfileBackup");
function profile(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-profile-backup-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, "new-profile");
}
test("a genuinely absent profile is created and marked before Chromium starts", async (t) => {
  const p = profile(t);
  await backupBeforeMigration(p);
  assert.equal(
    fs.readFileSync(path.join(p, ".dssa-windows-backup-v1"), "utf8"),
    "Fresh DSSA profile\n"
  );
  assert.equal(fs.existsSync(path.join(p, "dssa-backups")), false);
});
test("existing local settings are preserved once, including LevelDB files", async (t) => {
  const p = profile(t);
  fs.mkdirSync(path.join(p, "Local Storage", "leveldb"), { recursive: true });
  fs.writeFileSync(path.join(p, "Local Storage", "leveldb", "000003.ldb"), "local settings");
  fs.writeFileSync(path.join(p, ".env"), "TEST_SETTING=example");
  await backupBeforeMigration(p);
  const dest = fs.readFileSync(path.join(p, ".dssa-windows-backup-v1"), "utf8").trim();
  assert.ok(dest.startsWith(path.join(p, "dssa-backups")));
  assert.equal(
    fs.readFileSync(path.join(dest, "Local Storage", "leveldb", "000003.ldb"), "utf8"),
    "local settings"
  );
  assert.equal(fs.readFileSync(path.join(dest, ".env"), "utf8"), "TEST_SETTING=example");
  fs.writeFileSync(path.join(p, ".env"), "TEST_SETTING=changed");
  await backupBeforeMigration(p);
  assert.equal(fs.readFileSync(path.join(dest, ".env"), "utf8"), "TEST_SETTING=example");
});
test("failed backup preserves originals and does not mark migration safe", async (t) => {
  const p = profile(t);
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, ".env"), "TEST_SETTING=original");
  const copy = fs.cpSync;
  fs.cpSync = () => {
    throw Object.assign(Error("Locked settings"), { code: "EACCES" });
  };
  try {
    await assert.rejects(backupBeforeMigration(p), { code: "EACCES" });
  } finally {
    fs.cpSync = copy;
  }
  assert.equal(fs.existsSync(path.join(p, ".dssa-windows-backup-v1")), false);
  assert.equal(fs.readFileSync(path.join(p, ".env"), "utf8"), "TEST_SETTING=original");
});
