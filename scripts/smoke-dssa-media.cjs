// Real subprocess conversions of synthetic sound; never accesses microphone/profile.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const bin = path.resolve(process.argv[2] || "resources/bin");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-media-smoke-"));
function run(exe, args) {
  const result = spawnSync(path.join(bin, exe), args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
  });
  assert.equal(
    result.status,
    0,
    `${exe} failed: ${result.stderr || result.error || "unknown error"}`
  );
  return result.stdout;
}
const wave = Buffer.alloc(44 + 32000);
wave.write("RIFF", 0);
wave.writeUInt32LE(wave.length - 8, 4);
wave.write("WAVEfmt ", 8);
wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20);
wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(16000, 24);
wave.writeUInt32LE(32000, 28);
wave.writeUInt16LE(2, 32);
wave.writeUInt16LE(16, 34);
wave.write("data", 36);
wave.writeUInt32LE(32000, 40);
for (let index = 0; index < 16000; index++)
  wave.writeInt16LE(
    Math.round(6000 * Math.sin((2 * Math.PI * 440 * index) / 16000)),
    44 + 2 * index
  );
const input = path.join(temp, "synthetic.wav");
fs.writeFileSync(input, wave);
const license = run("ffmpeg.exe", ["-L"]);
assert.match(license, /Lesser General Public License/);
const formats = [];
for (const [extension, codec] of [
  ["mp3", "libmp3lame"],
  ["opus", "libopus"],
  ["flac", "flac"],
  ["m4a", "aac"],
  ["mp4", "aac"],
  ["webm", "libopus"],
]) {
  const encoded = path.join(temp, `encoded.${extension}`);
  const decoded = path.join(temp, `decoded-${extension}.wav`);
  run("ffmpeg.exe", ["-nostdin", "-hide_banner", "-i", input, "-c:a", codec, "-y", encoded]);
  run("ffmpeg.exe", [
    "-nostdin",
    "-hide_banner",
    "-i",
    encoded,
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    "-y",
    decoded,
  ]);
  const bytes = fs.readFileSync(decoded);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  let samples;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const length = bytes.readUInt32LE(offset + 4);
    if (bytes.toString("ascii", offset, offset + 4) === "data") {
      samples = length / 2;
      break;
    }
    offset += 8 + length + (length % 2);
  }
  assert.ok(samples >= 15200 && samples <= 17600, `Unexpected ${extension} duration: ${samples}`);
  formats.push({ format: extension, codec, pcmSamples: samples, result: "passed" });
}
assert.equal(run("yt-dlp-win32-x64.exe", ["--ignore-config", "--version"]).trim(), "2026.07.04");
const extractorCount = run("yt-dlp-win32-x64.exe", ["--ignore-config", "--list-extractors"])
  .trim()
  .split(/\r?\n/).length;
assert.ok(extractorCount > 1600);
console.log(
  JSON.stringify(
    {
      formats,
      ytDlpVersion: "2026.07.04",
      extractorCount,
      profileAccessed: false,
      networkDownloadTested: false,
      endToEndDictationLatencyMeasured: false,
    },
    null,
    2
  )
);
