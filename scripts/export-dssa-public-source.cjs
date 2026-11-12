// Export a source snapshot, never the private checkout or its Git history.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
if (!process.argv[2]) throw new Error("Pass the local release output directory");
const output = path.resolve(process.argv[2]);
const cache = path.join(root, ".dssa-build");
const stage = fs.mkdtempSync(path.join(cache, "public-source-"));
fs.mkdirSync(output, { recursive: true });
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root }
)
  .toString()
  .split("\0")
  .filter(Boolean);
const rootFiles = new Set([
  "main.js",
  "preload.js",
  "package.json",
  "package-lock.json",
  "LICENSE",
  "CREDITS.md",
  "README.upstream.md",
  "electron-builder.json",
  "electron-builder.unsigned-win.json",
  "electron-builder.dssa-win.json",
  "electron-builder.dssa-win.cjs",
]);
const publicDocs = new Set([
  "docs/windows-v42-dictation-startup.md",
  "docs/windows-v41-first-run.md",
  "docs/windows-distribution.md",
  "docs/windows-v31-release.md",
  "docs/windows-v32-selection.md",
  "docs/windows-v36-notepad.md",
  "docs/windows-v37-layout.md",
  "docs/community-optional-setup.md",
  "docs/BRUKSANVISNING-WINDOWS.txt",
  "docs/windows-v40-meeting-progress.md",
  "docs/windows-google-sign-in.md",
  "docs/windows-v28-microsoft-setup.md",
  "docs/COMMUNITY-1-WINDOWS.md",
]);
const selected = files.filter((name) => {
  if (name.includes("\\") || name.startsWith("/") || name.split("/").includes(".."))
    throw new Error("Unsafe source path");
  if (/(^|\/)(node_modules|\.git|build|third_party|__pycache__)(\/|$)/.test(name)) return false;
  if (/\.(exe|dll|node|onnx|bin|gguf|db|sqlite|dpapi|pyc)$/i.test(name)) return false;
  if (/^(resources\/bin\/|src\/components\/icons\/nucleo\/|src\/assets\/fonts\/yowza\/)/.test(name))
    return false;
  if (/^(scripts\/sync-nucleo-icons\.js|src\/components\/icons\/nucleo-map\.json)$/.test(name))
    return false;
  if (name === "scripts/measure-dictation-latency.cjs") return false;
  if (publicDocs.has(name) || rootFiles.has(name)) return true;
  return /^(src|native|resources|scripts|test)\//.test(name);
});
for (const name of selected) {
  const source = path.join(root, name);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
  const bytes = fs.readFileSync(source);
  if (
    /(github_pat_[A-Za-z0-9_]{50,}|ghp_[A-Za-z0-9]{36}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(
      bytes.toString("utf8")
    )
  )
    throw new Error(`Potential credential in export: ${name}`);
  const target = path.join(stage, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
fs.writeFileSync(
  path.join(stage, "README.md"),
  "# DSSA Tale Windows – public source snapshot\n\nThis snapshot accompanies the Windows test installer. See CREDITS.md,\ndocs/windows-distribution.md, docs/windows-v31-release.md and docs/windows-v32-selection.md.\n\nThe private repository history, paid Nucleo/Yowza assets, downloaded native\nbinaries, large models and user profiles are deliberately excluded.\nThe renderer uses Lucide/Feather icons under ISC/MIT licenses.\n\nInstall Node.js and run npm ci. Rebuild the documented media tools from the\nseparate corresponding-source asset and prepare the native binaries from the\npinned upstream releases described by the component manifest. The build scripts\nand source files are included; the installer requires no development tools.\n\nRun npm run typecheck, npm test and npm run build:dssa:win. Publishing is\ndisabled by the Windows configuration. Optional cloud services need the user's\nown registration/consent; no test accounts or publisher OAuth setup are bundled.\n"
);
const sevenZip =
  process.env.SEVENZIP || path.join(process.env.ProgramFiles || "C:/Program Files", "7-Zip/7z.exe");
const temporary = path.join(cache, `source-${crypto.randomUUID()}.zip`);
execFileSync(sevenZip, ["a", "-tzip", "-mx=6", temporary, "."], {
  cwd: stage,
  windowsHide: true,
  stdio: "pipe",
});
const destination = path.join(output, "DSSA-Tale-public-source.zip");
fs.copyFileSync(temporary, destination);
const hash = crypto.createHash("sha256").update(fs.readFileSync(destination)).digest("hex");
console.log(
  JSON.stringify({
    file: path.basename(destination),
    sha256: hash,
    sourceFiles: selected.length,
    gitHistoryIncluded: false,
    profileIncluded: false,
  })
);
