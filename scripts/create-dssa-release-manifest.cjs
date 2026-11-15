const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const asar = require("@electron/asar");
const root = path.resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("Pass the built win-unpacked directory");
const resources = path.join(root, "resources");
const archive = path.join(resources, "app.asar");
const entries = asar
  .listPackage(archive)
  .map((name) => name.replaceAll("\\", "/").replace(/^\/+/, ""));
const metadata = JSON.parse(asar.extractFile(archive, "package.json"));
const sourceZip = path.join(path.dirname(root), "DSSA-Tale-public-source.zip");
const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(sourceZip)).digest("hex");
if (metadata.dssaSourceSnapshotSha256 !== sourceHash)
  throw new Error("The packaged source identity does not match the source asset");
if (!fs.existsSync(path.join(path.dirname(root), "DSSA-Tale-corresponding-source.zip")))
  throw new Error("Required corresponding source asset is missing");
if (metadata.dssaGoogleDesktopClient || metadata.dssaMicrosoftDesktopClientId)
  throw new Error("Personal/publisher OAuth setup must not enter this release");
if (entries.some((name) => /node_modules\/ffmpeg-static\//.test(name)))
  throw new Error("Unverified ffmpeg-static distribution is still packaged");
if (entries.some((name) => /node_modules\/(tinfoil\/|@tinfoilsh\/)/.test(name)))
  throw new Error("Excluded AGPL SDK is still packaged");
const boundary = JSON.parse(
  asar.extractFile(archive, path.join("src", "dist", "dssa-license-boundary.json"))
);
if (boundary.tinfoilSdkBundled !== false)
  throw new Error("Renderer SDK exclusion was not verified");
const components = [
  [
    "ffmpeg",
    "6.1.1, DSSA audio build",
    "LGPL-2.1-or-later",
    "https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz",
    ["native/FFmpeg-LGPL-2.1.txt", "native/LAME-COPYING.txt", "native/Opus-COPYING.txt"],
  ],
  [
    "whisper",
    "OpenWhispr/whisper.cpp 0.0.10",
    "MIT",
    "https://github.com/OpenWhispr/whisper.cpp/tree/0.0.10",
    ["native/whisper-cpp-MIT.txt"],
  ],
  [
    "llama",
    "b9763 / dec5ca557",
    "MIT",
    "https://github.com/ggml-org/llama.cpp/tree/b9763",
    ["native/llama-cpp-MIT.txt"],
  ],
  [
    "sherpa",
    "1.13.8 (ONNX import renamed)",
    "Apache-2.0",
    "https://github.com/k2-fsa/sherpa-onnx/tree/v1.13.8",
    ["native/sherpa-onnx-Apache-2.0.txt"],
  ],
  [
    "onnx",
    "1.28.2",
    "MIT AND component-specific notices",
    "https://github.com/microsoft/onnxruntime/tree/v1.28.2",
    ["native/onnxruntime-MIT.txt", "native/onnxruntime-ThirdPartyNotices.txt"],
  ],
  [
    "openmp",
    "bundled libomp140 file version 5.0",
    "MIT OR NCSA",
    "https://github.com/llvm/llvm-project/tree/llvmorg-5.0.0/openmp",
    ["native/OpenMP-5.0-LICENSE.txt"],
  ],
  [
    "qdrant",
    "1.19.2",
    "Apache-2.0",
    "https://github.com/qdrant/qdrant/tree/v1.19.2",
    ["native/qdrant-Apache-2.0.txt"],
  ],
  [
    "yt-dlp",
    "2026.07.04, DSSA build (without mutagen)",
    "Unlicense AND dependency-specific licenses",
    "https://github.com/yt-dlp/yt-dlp/tree/2026.07.04",
    ["native/yt-dlp-Unlicense.txt", "native/Python-3.12.10-LICENSE.txt"],
  ],
  [
    "nircmd",
    "2.87, complete original x64 package",
    "LicenseRef-NirSoft-Freeware",
    "https://www.nirsoft.net/utils/nircmd.html",
    ["native/NirCmd-LICENSE.txt"],
  ],
  [
    "aec",
    "OpenWhispr 1.10.4; WebRTC APM 08f235e; Abseil 9ac7062",
    "MIT AND BSD-3-Clause AND Apache-2.0",
    "https://github.com/OpenWhispr/openwhispr/tree/ba6d61820b4c56d7b08012c61c2ae6b43f3152f3/native/meeting-aec-helper",
    [
      "OpenWhispr-MIT.txt",
      "native/WebRTC-LICENSE.txt",
      "native/WebRTC-PATENTS.txt",
      "native/abseil-Apache-2.0.txt",
    ],
  ],
  [
    "windows-helpers",
    "OpenWhispr 1.10.4 and DSSA source snapshot",
    "MIT",
    "https://github.com/OpenWhispr/openwhispr/tree/ba6d61820b4c56d7b08012c61c2ae6b43f3152f3/resources",
    ["OpenWhispr-MIT.txt"],
  ],
  [
    "silero",
    "artifact hashes; GGML model labelled v5.1.2",
    "MIT",
    "https://github.com/snakers4/silero-vad/tree/v5.1.2",
    ["native/silero-MIT.txt"],
  ],
  [
    "segmentation",
    "sherpa-onnx pyannote segmentation-3.0 ONNX artifact",
    "MIT",
    "https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-segmentation-models",
    ["native/pyannote-segmentation-MIT.txt"],
  ],
  [
    "campplus",
    "3D-Speaker CAMPPlus ONNX artifact",
    "Apache-2.0",
    "https://github.com/modelscope/3D-Speaker",
    ["native/3D-Speaker-Apache-2.0.txt"],
  ],
];
for (const [id, , , , notices] of components)
  for (const notice of notices)
    if (!fs.existsSync(path.join(resources, "legal", notice)))
      throw new Error(`Missing ${id} notice: ${notice}`);

function componentFor(file) {
  const name = path.basename(file);
  if (file.startsWith("resources/bin/")) {
    if (/^ffmpeg\.exe$/.test(name)) return "ffmpeg";
    if (/^whisper-server/.test(name)) return "whisper";
    if (/^(ggml|llama|mtmd).*\.(dll|exe)$/.test(name)) return "llama";
    if (/^sherpa-onnx-.*\.exe$/.test(name)) return "sherpa";
    if (/^(ow-onnxrt|onnxruntime_providers_shared)\.dll$/.test(name)) return "onnx";
    if (/^libomp/.test(name)) return "openmp";
    if (/^qdrant/.test(name)) return "qdrant";
    if (/^yt-dlp/.test(name)) return "yt-dlp";
    if (/^(nircmdc?\.exe|NirCmd\.chm)$/i.test(name)) return "nircmd";
    if (/^meeting-aec-helper/.test(name)) return "aec";
    if (/^(windows-|dssa-resource-probe)/.test(name)) return "windows-helpers";
    if (/silero/.test(name)) return "silero";
    if (/pyannote/.test(file) && /\.onnx$/.test(name)) return "segmentation";
    if (/campplus/.test(name)) return "campplus";
    if (/\.(exe|dll|onnx|bin)$/i.test(name))
      throw new Error(`Unattributed native artifact: ${file}`);
  }
  if (file.includes("app.asar.unpacked/node_modules/")) return "javascript-dependencies";
  if (/\.(woff2?|ttf)$/i.test(name)) return "fonts";
  if (!file.startsWith("resources/")) return "electron-chromium-installer";
  return "application-and-notices";
}

const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    const relative = path.relative(root, full).replaceAll("\\", "/");
    if (
      /(^|\/)(\.env|.*\.dpapi|.*\.gguf|transcriptions\.db|dssa-microsoft\.json|dssa-google-calendar\.json)$/i.test(
        relative
      )
    )
      throw new Error(`Private/user artifact in package: ${relative}`);
    if (/yowza.*\.(otf|ttf|woff2?)$/i.test(relative))
      throw new Error(`Restricted font: ${relative}`);
    const bytes = fs.readFileSync(full);
    files.push({
      path: relative,
      bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      component: componentFor(relative),
    });
  }
}
walk(root);
for (const name of entries)
  if (/(^|\/)(\.env|.*\.dpapi|transcriptions\.db|dssa-microsoft\.json)$/i.test(name))
    throw new Error(`Private/user artifact in archive: ${name}`);
for (const name of ["nircmd.exe", "nircmdc.exe", "NirCmd.chm"])
  if (!fs.existsSync(path.join(resources, "bin", name)))
    throw new Error(`Incomplete NirCmd package: ${name}`);
const media = JSON.parse(fs.readFileSync(path.join(resources, "legal/media-build.json")));
for (const expected of [...media.binaries, ...media.nirCmdOriginalFiles]) {
  const actual = files.find((file) => file.path === `resources/bin/${expected.file}`);
  if (!actual || actual.sha256 !== expected.sha256)
    throw new Error(`Packaged component differs from documented original/build: ${expected.file}`);
}
for (const name of ["msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll", "vcomp140.dll"])
  if (fs.existsSync(path.join(resources, "bin", name)))
    throw new Error(`Microsoft runtime must come directly from Microsoft: ${name}`);

const javascript = [];
for (const name of entries.filter((name) =>
  /(^|\/)node_modules\/(?:@[^/]+\/)?[^/]+\/package\.json$/.test(name)
)) {
  const data = JSON.parse(asar.extractFile(archive, name.split("/").join(path.sep)));
  javascript.push({
    name: data.name,
    version: data.version,
    license: data.license || data.licenses || null,
    repository: data.repository || null,
  });
}
if (javascript.length === 0) throw new Error("No packaged JavaScript metadata could be inspected");
if (javascript.some((item) => /AGPL/i.test(JSON.stringify(item.license))))
  throw new Error("An unreviewed AGPL dependency is packaged");
const result = {
  version: metadata.version,
  format: 1,
  components: components.map(([id, version, license, source, notices]) => ({
    id,
    version,
    license,
    source,
    notices,
  })),
  javascript,
  files,
  externalPrerequisite:
    "Microsoft Visual C++ x64 runtime, obtained by user directly from Microsoft if missing",
  sourceAssetsRequired: ["DSSA-Tale-public-source.zip", "DSSA-Tale-corresponding-source.zip"],
  limitations: [
    "Pattern-based package privacy audit, not a general proof of absence of secrets",
    "Fresh Windows machine installation remains a separate manual test",
  ],
};
fs.writeFileSync(
  path.join(path.dirname(root), "COMPONENTS-AND-SHA256.json"),
  JSON.stringify(result, null, 2) + "\n"
);
console.log(
  JSON.stringify({
    version: metadata.version,
    files: files.length,
    javascriptPackages: javascript.length,
    nativeComponents: components.length,
    audit: "passed",
  })
);
