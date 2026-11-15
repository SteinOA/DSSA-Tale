const fs = require("fs");
const path = require("path");
const { UPLOAD_AUDIO_EXTENSIONS } = require("../constants/uploadAudioFormats.json");
const { translateNative: ui } = require("./dssaNativeLabels");
const SOURCES = {
  google: "Google Disk",
  microsoft: "OneDrive / SharePoint",
  apple: "iCloud Drive",
};

function sourceCandidates(source, home, environment = process.env) {
  if (source === "microsoft")
    return [
      environment.OneDriveCommercial,
      environment.OneDriveConsumer,
      environment.OneDrive,
      ...fs
        .readdirSync(home, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith("OneDrive"))
        .map((e) => path.join(home, e.name)),
    ].filter(Boolean);
  if (source === "apple") return [path.join(home, "iCloudDrive"), path.join(home, "iCloud Drive")];
  const candidates = [path.join(home, "Google Drive"), path.join(home, "My Drive")];
  if (process.platform === "win32") {
    for (const letter of "DEFGHIJKLMNOPQRSTUVWXYZ")
      for (const name of ["My Drive", "Min disk", "Shared drives"])
        candidates.push(path.join(letter + ":\\", name));
  }
  return candidates;
}

async function pickCloudAudio({ app, dialog }, source, multiple = true) {
  if (!Object.hasOwn(SOURCES, source)) throw Error("Ukjent filkilde.");
  const settingsPath = path.join(app.getPath("userData"), "dssa-audio-source-folders.json");
  let folders = {};
  try {
    folders = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {}
  if (!folders || typeof folders !== "object" || Array.isArray(folders)) folders = {};
  const pinned = require("./dssaConnections").readConnections(app)[source];
  if (pinned && !require("./dssaConnections").folderStatus(pinned).available)
    throw Error("Mappen er ikke tilgjengelig.");
  const candidates = [pinned, folders[source], ...sourceCandidates(source, app.getPath("home"))];
  const defaultPath = candidates.find((p) => {
    try {
      return typeof p === "string" && fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  });
  const result = await dialog.showOpenDialog({
    title: ui("Velg lyd fra {{source}} – skymappe i Windows", { source: SOURCES[source] }),
    defaultPath,
    properties: multiple ? ["openFile", "multiSelections"] : ["openFile"],
    filters: [{ name: ui("Lyd og video"), extensions: UPLOAD_AUDIO_EXTENSIONS }],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  if (
    result.filePaths.some(
      (p) => !UPLOAD_AUDIO_EXTENSIONS.includes(path.extname(p).slice(1).toLowerCase())
    )
  )
    throw Error("Velg en støttet lyd- eller videofil.");
  folders[source] = path.dirname(result.filePaths[0]);
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(folders, null, 2));
  } catch {}
  return { canceled: false, filePaths: result.filePaths, filePath: result.filePaths[0] };
}
module.exports = { pickCloudAudio, sourceCandidates };
