const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readDesktopClient } = require("../../src/helpers/dssaGoogleCalendarClient");

function fixture(t, client) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-google-client-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ dssaGoogleDesktopClient: client })
  );
  const app = { getPath: () => root, getAppPath: () => root };
  return { root, app };
}

test("a fresh profile can use the publisher desktop client without importing user configuration", (t) => {
  const client = {
    clientId: "publisher.apps.googleusercontent.com",
    clientSecret: "public-desktop-value",
  };
  const f = fixture(t, client);
  assert.deepEqual(readDesktopClient({ app: f.app }), client);
  assert.ok(!fs.existsSync(path.join(f.root, "dssa-google-calendar-client.dpapi")));
});

test("existing encrypted custom configuration takes priority and fails closed when unavailable", (t) => {
  const f = fixture(t, {
    clientId: "publisher.apps.googleusercontent.com",
    clientSecret: "public-value",
  });
  fs.writeFileSync(path.join(f.root, "dssa-google-calendar-client.dpapi"), "encrypted-fixture");
  const client = { clientId: "custom.apps.googleusercontent.com", clientSecret: "custom-value" };
  const safeStorage = {
    isEncryptionAvailable: () => true,
    decryptString: () => JSON.stringify(client),
  };
  assert.deepEqual(readDesktopClient({ app: f.app, safeStorage }), client);
  safeStorage.isEncryptionAvailable = () => false;
  assert.throws(() => readDesktopClient({ app: f.app, safeStorage }), /utilgjengelig/);
});

test("unconfigured editions remain unconfigured and invalid packaged clients are rejected", (t) => {
  const f = fixture(t);
  assert.equal(readDesktopClient({ app: f.app }), null);
  fs.writeFileSync(
    path.join(f.root, "package.json"),
    JSON.stringify({ dssaGoogleDesktopClient: { clientId: "bad" } })
  );
  assert.throws(() => readDesktopClient({ app: f.app }), /skrivebordsapp/);
});

test("Windows packaging accepts a complete publisher client and rejects a partial configuration", () => {
  const { execFileSync, spawnSync } = require("node:child_process");
  const root = path.resolve(__dirname, "../..");
  const env = {
    ...process.env,
    DSSA_GOOGLE_DESKTOP_CLIENT_ID: "publisher.apps.googleusercontent.com",
    DSSA_GOOGLE_DESKTOP_CLIENT_SECRET: "public-desktop-value",
  };
  const script =
    'process.stdout.write(JSON.stringify(require("./electron-builder.dssa-win.cjs").extraMetadata.dssaGoogleDesktopClient))';
  const result = JSON.parse(
    execFileSync(process.execPath, ["-e", script], { cwd: root, env, windowsHide: true })
  );
  assert.equal(result.clientId, env.DSSA_GOOGLE_DESKTOP_CLIENT_ID);
  assert.equal(result.clientSecret, env.DSSA_GOOGLE_DESKTOP_CLIENT_SECRET);
  delete env.DSSA_GOOGLE_DESKTOP_CLIENT_SECRET;
  assert.notEqual(
    spawnSync(process.execPath, ["-e", script], { cwd: root, env, windowsHide: true }).status,
    0
  );
});
