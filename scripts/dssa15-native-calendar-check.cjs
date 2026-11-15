const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");
const output = path.resolve(__dirname, "../../dssa15-native-calendar-check.json");
const sandbox = path.resolve(__dirname, "../../dssa15-native-crypto-profile");
fs.mkdirSync(sandbox, { recursive: true });
app.setPath("userData", sandbox);
app.whenReady().then(() => {
  const Database = require("better-sqlite3");
  const DatabaseManager = require("../src/helpers/database");
  const manager = Object.create(DatabaseManager.prototype);
  manager.db = new Database(":memory:");
  manager.db.exec("CREATE TABLE google_calendar_tokens (google_email TEXT UNIQUE, access_token TEXT, refresh_token TEXT, expires_at INTEGER, scope TEXT, updated_at TEXT)");
  manager.saveGoogleTokens({ google_email: "test@example.invalid", access_token: "synthetic-access-for-test", refresh_token: "synthetic-refresh-for-test", expires_at: 123456, scope: "test" });
  const raw = manager.db.prepare("SELECT * FROM google_calendar_tokens").get();
  const decoded = manager.getGoogleTokens();
  const results = {
    windowsEncryptionAvailable: safeStorage.isEncryptionAvailable(),
    accessEncryptedAtRest: raw.access_token.startsWith("dssa-calendar:v1:") && !raw.access_token.includes("synthetic-access-for-test"),
    refreshEncryptedAtRest: raw.refresh_token.startsWith("dssa-calendar:v1:") && !raw.refresh_token.includes("synthetic-refresh-for-test"),
    decodedOnRead: decoded.access_token === "synthetic-access-for-test" && decoded.refresh_token === "synthetic-refresh-for-test",
    lookupOnEmail: manager.getGoogleTokensByEmail("test@example.invalid").refresh_token === "synthetic-refresh-for-test",
    allRowsDecoded: manager.getAllGoogleTokens()[0].access_token === "synthetic-access-for-test",
  };
  manager.db.close();
  fs.writeFileSync(output, JSON.stringify(results, null, 2));
  app.exit(Object.values(results).every(Boolean) ? 0 : 1);
}).catch((error) => {
  fs.writeFileSync(output, JSON.stringify({ success: false, error: String(error.message) }));
  app.exit(1);
});
