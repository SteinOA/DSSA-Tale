const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const record = JSON.parse(fs.readFileSync(path.join(root, "resources/legal/media-build.json")));
for (const item of record.binaries) {
  const full = path.resolve(root, "resources/bin", item.file);
  if (path.dirname(full) !== path.resolve(root, "resources/bin"))
    throw new Error("Unsafe media filename");
  const actual = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
  if (actual !== item.sha256) throw new Error(`Media provenance mismatch: ${item.file}`);
}
for (const file of [
  "native/FFmpeg-LGPL-2.1.txt",
  "native/LAME-COPYING.txt",
  "native/Opus-COPYING.txt",
  "native/pyannote-segmentation-MIT.txt",
  "native/NirCmd-LICENSE.txt",
  "native/Lucide-ISC-and-Feather-MIT.txt",
  "native/Python-3.12.10-LICENSE.txt",
  "javascript-components.json",
  "yt-dlp-components.json",
])
  if (fs.statSync(path.join(root, "resources/legal", file)).size < 20)
    throw new Error(`Incomplete notice: ${file}`);
if (
  /from\s+["']\.\/nucleo["']/.test(
    fs.readFileSync(path.join(root, "src/components/icons/index.ts"), "utf8")
  )
)
  throw new Error("Restricted icon set is still imported");
for (const item of record.nirCmdOriginalFiles) {
  const bytes = fs.readFileSync(path.join(root, "resources/bin", item.file));
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== item.sha256)
    throw new Error(`NirCmd original changed: ${item.file}`);
}
console.log("DSSA media provenance and required distribution notices verified.");
