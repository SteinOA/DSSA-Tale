// Collect exact source distributions for the privately staged release assets.
// No user profile, account, model or recording is read.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".dssa-build/public-release-sources");
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

async function download(url, name, expected) {
  if (path.basename(name) !== name) throw new Error("Invalid source filename");
  const target = path.join(output, name);
  let bytes = fs.existsSync(target) ? fs.readFileSync(target) : null;
  if (!bytes || (expected && digest(bytes) !== expected)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (expected && digest(bytes) !== expected) throw new Error(`Source hash mismatch: ${name}`);
  fs.writeFileSync(target, bytes);
  return { file: name, url, bytes: bytes.length, sha256: digest(bytes) };
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const python = JSON.parse(
    fs.readFileSync(path.join(root, "resources/legal/yt-dlp-components.json"))
  );
  const results = [];
  for (let index = 0; index < python.length; index += 4) {
    results.push(
      ...(await Promise.all(
        python.slice(index, index + 4).map(async (component) => {
          const response = await fetch(
            `https://pypi.org/pypi/${encodeURIComponent(component.name)}/${encodeURIComponent(component.version)}/json`
          );
          if (!response.ok) throw new Error(`PyPI source metadata missing: ${component.name}`);
          const data = await response.json();
          const source = data.urls.find((entry) => entry.packagetype === "sdist");
          if (!source) throw new Error(`No source distribution: ${component.name}`);
          return {
            component: component.name,
            version: component.version,
            ...(await download(source.url, source.filename, source.digests.sha256)),
          };
        })
      ))
    );
  }
  results.push(
    await download(
      "https://www.python.org/ftp/python/3.12.10/Python-3.12.10.tar.xz",
      "Python-3.12.10.tar.xz"
    )
  );
  for (const [file, url, hash] of [
    [
      "ffmpeg-6.1.1.tar.xz",
      "https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz",
      "8684f4b00f94b85461884c3719382f1261f0d9eb3d59640a1f4ac0873616f968",
    ],
    [
      "lame-3.100.tar.gz",
      "https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz",
      "ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e",
    ],
    [
      "opus-1.5.2.tar.gz",
      "https://downloads.xiph.org/releases/opus/opus-1.5.2.tar.gz",
      "65c1d2f78b9f2fb20082c38cbe47c951ad5839345876e46941612ee87f9a7ce1",
    ],
  ])
    results.push(await download(url, file, hash));
  fs.writeFileSync(
    path.join(output, "SOURCE-INPUTS.json"),
    JSON.stringify(results, null, 2) + "\n"
  );
  console.log(
    JSON.stringify({
      sourceArchives: results.length,
      bytes: results.reduce((sum, row) => sum + row.bytes, 0),
    })
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
