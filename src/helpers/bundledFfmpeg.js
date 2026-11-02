const fs = require("node:fs");
const path = require("node:path");

// Windows ships the documented LGPL audio build with its corresponding source.
// Do not fall back to the unverified GPL binary in the development dependency.
function bundledFfmpegPath() {
  if (process.platform !== "win32") return require("ffmpeg-static");
  const codeRoot = path.resolve(__dirname, "../..");
  const resourceRoot = /^app\.asar(?:\.unpacked)?$/.test(path.basename(codeRoot))
    ? path.dirname(codeRoot)
    : path.join(codeRoot, "resources");
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, "bin", "ffmpeg.exe"),
    path.join(resourceRoot, "bin", "ffmpeg.exe"),
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("The bundled DSSA FFmpeg audio build is missing");
  return found;
}

module.exports = { bundledFfmpegPath };
