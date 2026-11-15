// Obtain runtime assets from the exact verified upstream Windows release.
// Speech-model weights are deliberately not downloaded or bundled.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const root = path.resolve(__dirname, "..");
const SHA256 = "f95d0e98611ccf7f5f0c9187caed430ff820fb4b68a4123cd80308b1e08e507f";
const URL =
  "https://github.com/OpenWhispr/openwhispr/releases/download/v1.10.4/OpenWhispr-Setup-1.10.4.exe";
async function sha256(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function main() {
  if (process.platform !== "win32") throw Error("This preparation script requires Windows x64.");
  const work = path.join(root, ".dssa-build");
  fs.mkdirSync(work, { recursive: true });
  const supplied = process.argv.indexOf("--setup");
  const setup =
    supplied >= 0
      ? path.resolve(process.argv[supplied + 1])
      : path.join(work, "OpenWhispr-Setup-1.10.4.exe");
  if (!fs.existsSync(setup)) {
    if (supplied >= 0) throw Error("The supplied setup file does not exist.");
    const response = await fetch(URL, { signal: AbortSignal.timeout(10 * 60000) });
    if (!response.ok) throw Error(`Upstream download failed (${response.status})`);
    await pipeline(
      Readable.fromWeb(response.body),
      fs.createWriteStream(setup + ".part", { flags: "w" })
    );
    fs.renameSync(setup + ".part", setup);
  }
  if ((await sha256(setup)) !== SHA256)
    throw Error("Upstream setup SHA-256 mismatch; no assets were copied.");
  const sevenZip = process.env.SEVEN_ZIP || "C:\\Program Files\\7-Zip\\7z.exe";
  if (!fs.existsSync(sevenZip))
    throw Error("7-Zip is required on the build machine. Set SEVEN_ZIP to 7z.exe.");
  const invoke = (args) => {
    const result = spawnSync(sevenZip, args, { stdio: "inherit", windowsHide: true });
    if (result.status !== 0) throw Error("Archive extraction failed.");
  };
  invoke(["x", setup, `-o${path.join(work, "setup")}`, "$PLUGINSDIR\\app-64.7z", "-y"]);
  const unpacked = path.join(work, "runtime");
  invoke([
    "x",
    path.join(work, "setup/$PLUGINSDIR/app-64.7z"),
    `-o${unpacked}`,
    "resources\\bin\\*",
    "resources\\app.asar.unpacked\\*",
    "-r",
    "-y",
  ]);
  fs.cpSync(path.join(unpacked, "resources/bin"), path.join(root, "resources/bin"), {
    recursive: true,
  });
  fs.cpSync(
    path.join(unpacked, "resources/app.asar.unpacked/node_modules"),
    path.join(root, "node_modules"),
    { recursive: true }
  );
  fs.mkdirSync(path.join(root, "resources/legal"), { recursive: true });
  fs.copyFileSync(
    path.join(root, "LICENSE"),
    path.join(root, "resources/legal/OpenWhispr-MIT.txt")
  );
  const notices = [];
  for (const name of fs.readdirSync(path.join(root, "node_modules"))) {
    if (name.startsWith(".")) continue;
    const entries = name.startsWith("@")
      ? fs.readdirSync(path.join(root, "node_modules", name)).map((child) => path.join(name, child))
      : [name];
    for (const entry of entries) {
      const pkg = path.join(root, "node_modules", entry);
      if (!fs.statSync(pkg).isDirectory()) continue;
      for (const file of fs
        .readdirSync(pkg)
        .filter((f) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(f))) {
        if (!fs.statSync(path.join(pkg, file)).isFile()) continue;
        notices.push(
          `\n===== ${entry}/${file} =====\n` + fs.readFileSync(path.join(pkg, file), "utf8")
        );
      }
    }
  }
  fs.writeFileSync(path.join(root, "resources/legal/THIRD-PARTY-NOTICES.txt"), notices.join("\n"));
  fs.writeFileSync(
    path.join(work, "provenance.json"),
    JSON.stringify(
      { version: "1.10.4", url: URL, sha256: SHA256, prepared: new Date().toISOString() },
      null,
      2
    )
  );
  console.log("Verified Windows runtime assets are ready. No speech-model weights downloaded.");
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
