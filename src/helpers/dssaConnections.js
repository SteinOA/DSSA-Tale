const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const SOURCES = ["google", "microsoft", "apple"];
function checkSource(source) {
  if (!SOURCES.includes(source)) throw Error("Ukjent filkilde.");
}
function readConnections(app) {
  try {
    const value = JSON.parse(
      fs.readFileSync(path.join(app.getPath("userData"), "dssa-connections.json"), "utf8")
    );
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
function folderStatus(folder) {
  if (typeof folder !== "string" || !folder) return { path: "", available: false };
  try {
    if (!fs.statSync(folder).isDirectory()) throw Error();
    fs.accessSync(folder, fs.constants.R_OK);
    fs.opendirSync(folder).closeSync();
    return { path: folder, available: true };
  } catch {
    return { path: folder, available: false };
  }
}
function listConnections(app) {
  const settings = readConnections(app);
  const { sourceCandidates } = require("./dssaAudioSources");
  return SOURCES.map((source) => {
    let candidates = [];
    try {
      candidates = sourceCandidates(source, app.getPath("home"));
    } catch {}
    return {
      source,
      ...folderStatus(settings[source]),
      candidates: [...new Set(candidates)].filter((p) => folderStatus(p).available),
    };
  });
}
function saveConnections(app, settings) {
  const file = path.join(app.getPath("userData"), "dssa-connections.json");
  const temporary = file + "." + require("crypto").randomUUID() + ".tmp";
  try {
    fs.writeFileSync(temporary, JSON.stringify(settings, null, 2), { flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
async function chooseConnectionFolder({ app, dialog }, source) {
  checkSource(source);
  const state = listConnections(app).find((item) => item.source === source);
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    defaultPath: state.available ? state.path : state.candidates[0],
  });
  if (result.canceled || !result.filePaths?.length) return { canceled: true };
  const folder = fs.realpathSync(result.filePaths[0]);
  if (!folderStatus(folder).available) throw Error("Mappen er ikke tilgjengelig.");
  const settings = readConnections(app);
  settings[source] = folder;
  saveConnections(app, settings);
  return { success: true, connections: listConnections(app) };
}
function useDetectedConnectionFolder(app, source, selectedPath) {
  checkSource(source);
  const state = listConnections(app).find((item) => item.source === source);
  if (typeof selectedPath !== "string" || !state.candidates.includes(selectedPath))
    throw Error("Mappen er ikke tilgjengelig.");
  const folder = fs.realpathSync(selectedPath);
  if (!folderStatus(folder).available) throw Error("Mappen er ikke tilgjengelig.");
  const settings = readConnections(app);
  settings[source] = folder;
  saveConnections(app, settings);
  return { success: true, connections: listConnections(app) };
}
function removeConnectionFolder(app, source) {
  checkSource(source);
  const settings = readConnections(app);
  delete settings[source];
  saveConnections(app, settings);
  return { success: true, connections: listConnections(app) };
}
async function openConnectionFolder({ app, shell }, source) {
  checkSource(source);
  const status = folderStatus(readConnections(app)[source]);
  if (!status.available) throw Error("Mappen er ikke tilgjengelig.");
  const error = await shell.openPath(status.path);
  if (error) throw Error(error);
  return { success: true };
}
async function openConnectionLogin({ shell }, source) {
  checkSource(source);
  // Delegate credentials and passkeys to the provider's existing desktop client.
  if (source === "google") {
    const root = path.join(
      process.env.ProgramFiles || "C:\\Program Files",
      "Google",
      "Drive File Stream"
    );
    let versions = [];
    try {
      versions = fs
        .readdirSync(root)
        .filter((v) => /^\d+(?:\.\d+)+$/.test(v))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    } catch {}
    const executable = versions
      .map((v) => path.join(root, v, "GoogleDriveFS.exe"))
      .find((p) => fs.existsSync(p));
    if (executable) {
      const error = await shell.openPath(executable);
      if (error) throw Error(error);
      return { success: true, mode: "desktop" };
    }
    await shell.openExternal("https://support.google.com/drive/answer/10838124");
    return { success: true, mode: "setup" };
  }
  const appId =
    source === "apple" ? "AppleInc.iCloud_nzyj5cx40ttqa!iCloud" : "Microsoft.SkyDrive.Desktop";
  await new Promise((resolve, reject) => {
    const child = spawn("explorer.exe", ["shell:AppsFolder\\" + appId], {
      windowsHide: true,
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
  return { success: true, mode: "desktop" };
}
module.exports = {
  readConnections,
  folderStatus,
  listConnections,
  chooseConnectionFolder,
  useDetectedConnectionFolder,
  removeConnectionFolder,
  openConnectionFolder,
  openConnectionLogin,
};
