const fs = require("fs");
const path = require("path");

function validateDesktopClient(value) {
  const client = value?.installed;
  if (
    !client ||
    typeof client.client_id !== "string" ||
    !/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(client.client_id) ||
    typeof client.client_secret !== "string" ||
    client.client_secret.length < 4 ||
    client.client_secret.length > 512
  ) {
    throw Error("Velg en Google OAuth-JSON-fil for en skrivebordsapp.");
  }
  return { clientId: client.client_id, clientSecret: client.client_secret };
}

function readDesktopClient({ app, safeStorage }) {
  if (!app?.getPath) return null;
  const file = path.join(app.getPath("userData"), "dssa-google-calendar-client.dpapi");
  if (fs.existsSync(file)) {
    if (!safeStorage.isEncryptionAvailable()) throw Error("Sikker lagring er utilgjengelig.");
    const client = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
    return validateDesktopClient({
      installed: { client_id: client.clientId, client_secret: client.clientSecret },
    });
  }
  // A desktop OAuth client identifies the app; user tokens remain profile-local.
  // Ship this configuration once so users do not need their own Cloud project.
  if (!app.getAppPath) return null;
  const packageFile = path.join(app.getAppPath(), "package.json");
  const client = JSON.parse(fs.readFileSync(packageFile, "utf8")).dssaGoogleDesktopClient;
  if (!client) return null;
  return validateDesktopClient({
    installed: { client_id: client.clientId, client_secret: client.clientSecret },
  });
}

function readClient() {
  return readDesktopClient(require("electron"));
}

async function importClient() {
  const { app, safeStorage, dialog } = require("electron");
  if (!safeStorage.isEncryptionAvailable()) throw Error("Sikker lagring er utilgjengelig.");
  const chosen = await dialog.showOpenDialog({
    title: "Velg Google OAuth-JSON for skrivebordsapp",
    properties: ["openFile"],
    filters: [{ name: "Google OAuth JSON", extensions: ["json"] }],
  });
  if (chosen.canceled || !chosen.filePaths.length) return { canceled: true };
  const file = chosen.filePaths[0];
  if (fs.statSync(file).size > 65536) throw Error("JSON-filen er for stor.");
  const client = validateDesktopClient(JSON.parse(fs.readFileSync(file, "utf8")));
  fs.writeFileSync(
    path.join(app.getPath("userData"), "dssa-google-calendar-client.dpapi"),
    safeStorage.encryptString(JSON.stringify(client))
  );
  return { success: true };
}

module.exports = { validateDesktopClient, readDesktopClient, readClient, importClient };
