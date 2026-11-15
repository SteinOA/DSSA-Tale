// Preserve license/notice files for application, renderer and build dependencies.
// This deliberately includes some tools that are not shipped in the installer.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json")));
const sections = [
  "Dependency notices: application, renderer and build tools. Not every listed tool is bundled.\n",
];
const inventory = [];
for (const [location, data] of Object.entries(lock.packages).sort(([a], [b]) =>
  a.localeCompare(b)
)) {
  if (!location.includes("node_modules/") || location.endsWith("node_modules/ffmpeg-static"))
    continue;
  const directory = path.join(root, location);
  if (!fs.existsSync(directory)) continue;
  const metadataPath = path.join(directory, "package.json");
  if (!fs.existsSync(metadataPath)) continue;
  const metadata = JSON.parse(fs.readFileSync(metadataPath));
  const notices = [];
  for (const name of fs.readdirSync(directory).sort()) {
    if (!/^(licen[sc]e|copying|notice|copyright)(\.|$|-)/i.test(name)) continue;
    const full = path.join(directory, name);
    if (!fs.statSync(full).isFile()) continue;
    const bytes = fs.readFileSync(full);
    if (bytes.includes(0)) continue;
    notices.push(name);
    sections.push(
      `\n===== ${location}/${name} (${metadata.version}) =====\n${bytes.toString("utf8")}\n`
    );
  }
  inventory.push({
    name: metadata.name,
    version: metadata.version,
    license: metadata.license || metadata.licenses || data.license || null,
    repository: metadata.repository || null,
    notices,
    buildTool: Boolean(data.dev),
  });
}
const noticePath = path.join(root, "resources/legal/THIRD-PARTY-NOTICES.txt");
const noticeText = sections.join("");
if (!fs.existsSync(noticePath) || fs.readFileSync(noticePath, "utf8") !== noticeText)
  fs.writeFileSync(noticePath, noticeText);
fs.writeFileSync(
  path.join(root, "resources/legal/javascript-components.json"),
  JSON.stringify(inventory, null, 2) + "\n"
);
console.log(
  JSON.stringify({
    packages: inventory.length,
    noticeFiles: inventory.reduce((sum, row) => sum + row.notices.length, 0),
  })
);
