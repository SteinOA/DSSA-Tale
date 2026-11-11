const fs = require("node:fs/promises");
const path = require("node:path");
const { UPLOAD_AUDIO_EXTENSIONS } = require("../constants/uploadAudioFormats.json");

// Enumerates only the folder explicitly selected in the native picker. Never
// follows symlinks/junctions or writes, moves, or deletes the original media.
async function scanAudioFolder(folder, { recursive = true, signal } = {}) {
  const root = await fs.realpath(folder);
  if (!(await fs.stat(root)).isDirectory()) throw Error("Velg en mappe.");
  const files = [],
    warnings = [],
    directories = [root];
  let skippedCount = 0,
    warningCount = 0;
  const seen = new Set();
  const inside = (real) => {
    const relative = path.relative(root, real);
    return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
  };
  while (directories.length) {
    signal?.throwIfAborted();
    const directory = directories.pop();
    try {
      const realDirectory = await fs.realpath(directory);
      if (!inside(realDirectory)) {
        skippedCount++;
        continue;
      }
      const key = process.platform === "win32" ? realDirectory.toLowerCase() : realDirectory;
      if (seen.has(key)) continue;
      seen.add(key);
      const entries = await fs.readdir(realDirectory, { withFileTypes: true });
      for (const entry of entries) {
        signal?.throwIfAborted();
        const candidate = path.join(realDirectory, entry.name);
        try {
          const stat = await fs.lstat(candidate);
          if (stat.isSymbolicLink()) {
            skippedCount++;
            continue;
          }
          if (stat.isDirectory()) {
            if (recursive) directories.push(candidate);
            continue;
          }
          if (
            !stat.isFile() ||
            !stat.size ||
            !UPLOAD_AUDIO_EXTENSIONS.includes(path.extname(entry.name).slice(1).toLowerCase())
          ) {
            skippedCount++;
            continue;
          }
          const real = await fs.realpath(candidate);
          if (!inside(real)) {
            skippedCount++;
            continue;
          }
          files.push({ name: path.relative(root, real), path: real, sizeBytes: stat.size });
        } catch (error) {
          signal?.throwIfAborted();
          warningCount++;
          if (warnings.length < 20)
            warnings.push({
              name: path.relative(root, candidate),
              code: error.code || "READ_FAILED",
            });
        }
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (directory === root) throw error;
      warningCount++;
      if (warnings.length < 20)
        warnings.push({ name: path.relative(root, directory), code: error.code || "READ_FAILED" });
    }
  }
  files.sort(
    (a, b) => a.name.localeCompare(b.name, "nb", { numeric: true }) || a.path.localeCompare(b.path)
  );
  return { folderPath: root, files, skippedCount, warningCount, warnings };
}

function registerFolderImport(ipcMain, { dialog, approveAudioPath }) {
  const scans = new Map();
  ipcMain.handle("select-audio-folder", async (event, options = {}) => {
    const sender = event.sender;
    if (scans.has(sender.id)) return { canceled: false, error: "Et mappesøk pågår allerede." };
    const controller = new AbortController();
    scans.set(sender.id, controller);
    const abort = () => controller.abort();
    sender.once("destroyed", abort);
    try {
      const selection = await dialog.showOpenDialog({
        title: "Velg mappe med lyd og video",
        properties: ["openDirectory"],
      });
      if (selection.canceled || !selection.filePaths.length || controller.signal.aborted)
        return { canceled: true };
      const result = await scanAudioFolder(selection.filePaths[0], {
        recursive: options?.recursive !== false,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      for (const file of result.files) approveAudioPath(file.path);
      return { canceled: false, ...result };
    } catch (error) {
      if (controller.signal.aborted) return { canceled: true };
      return { canceled: false, error: error.message || "Mappen kunne ikke leses." };
    } finally {
      scans.delete(sender.id);
      sender.removeListener("destroyed", abort);
    }
  });
  ipcMain.handle("cancel-audio-folder-scan", (event) => {
    scans.get(event.sender.id)?.abort();
  });
}

module.exports = { scanAudioFolder, registerFolderImport };
