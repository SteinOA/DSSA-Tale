const fs = require("fs");
const path = require("path");
async function backupBeforeMigration(profile) {
  const marker = path.join(profile, ".dssa-windows-backup-v1");
  if (fs.existsSync(marker)) return;
  const existing = [
    ".env",
    "Local Storage",
    "transcriptions.db",
    "secure-keys",
    "Preferences",
  ].filter((name) => fs.existsSync(path.join(profile, name)));
  if (!existing.length) {
    fs.writeFileSync(marker, "Fresh DSSA profile\n");
    return;
  }
  const destination = path.join(profile, "dssa-backups", "before-1.10.4-dssa.1-" + Date.now());
  fs.mkdirSync(destination, { recursive: true });
  for (const name of existing) {
    if (name === "transcriptions.db") {
      const Database = require("better-sqlite3");
      const db = new Database(path.join(profile, name), { readonly: true, fileMustExist: true });
      try {
        await db.backup(path.join(destination, name));
      } finally {
        db.close();
      }
    } else fs.cpSync(path.join(profile, name), path.join(destination, name), { recursive: true });
  }
  fs.writeFileSync(
    path.join(destination, "BACKUP.txt"),
    "Local backup made before DSSA Tale database/settings migration. Audio and model files were not changed or copied. Close all OpenWhispr/DSSA processes before restoring these files.\n"
  );
  fs.writeFileSync(marker, destination + "\n");
}
module.exports = { backupBeforeMigration };
