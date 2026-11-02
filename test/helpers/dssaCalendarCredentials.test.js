const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const crypto = require("node:crypto");
const { validateDesktopClient } = require("../../src/helpers/dssaGoogleCalendarClient");
const protection = require("../../src/helpers/dssaCalendarTokenProtection");

test("only a Google desktop client can be imported", () => {
  const installed = {
    client_id: "test-desktop.apps.googleusercontent.com",
    client_secret: "test-only-secret",
  };
  assert.equal(validateDesktopClient({ installed }).clientId, installed.client_id);
  for (const value of [
    { web: installed },
    { installed: { ...installed, client_id: "https://attacker.example" } },
    { installed: { ...installed, client_secret: "" } },
    null,
  ]) {
    assert.throws(() => validateDesktopClient(value));
  }
});

test("calendar tokens round-trip through encryption, legacy rows stay readable, and corruption fails closed", () => {
  const original = Module._load;
  const key = crypto.randomBytes(32);
  const encryption = {
    encrypt(text) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },
    decrypt(blob) {
      const cipher = crypto.createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12));
      cipher.setAuthTag(blob.subarray(12, 28));
      return {
        value: Buffer.concat([cipher.update(blob.subarray(28)), cipher.final()]).toString("utf8"),
      };
    },
  };
  Module._load = function (request, parent, isMain) {
    if (request === "./secretCrypto" && parent.filename.endsWith("dssaCalendarTokenProtection.js"))
      return encryption;
    return original.call(this, request, parent, isMain);
  };
  try {
    const row = {
      google_email: "test@example.invalid",
      access_token: protection.encode("test-access-token"),
      refresh_token: protection.encode("test-refresh-token"),
    };
    assert.ok(!JSON.stringify(row).includes("test-access-token"));
    assert.equal(protection.decodeRow(row).refresh_token, "test-refresh-token");
    assert.ok(
      row.access_token.startsWith("dssa-calendar:v1:"),
      "decoding must not mutate stored values"
    );
    assert.equal(
      protection.decodeRow({ access_token: "legacy-value" }).access_token,
      "legacy-value"
    );
    assert.equal(protection.decodeRow(null), null);
    assert.equal(protection.encode(null), null);
    assert.throws(() => protection.decodeRow({ access_token: "dssa-calendar:v1:broken" }));
  } finally {
    Module._load = original;
  }
});

test("calendar token writes fail when encryption is unavailable", () => {
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "./secretCrypto" && parent.filename.endsWith("dssaCalendarTokenProtection.js"))
      return {
        encrypt() {
          throw Error("unavailable");
        },
      };
    return original.call(this, request, parent, isMain);
  };
  try {
    assert.throws(() => protection.encode("test-token"), /unavailable/);
  } finally {
    Module._load = original;
  }
});
