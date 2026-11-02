// Run with ELECTRON_RUN_AS_NODE=1 using the packaged DSSA Tale executable.
// Uses synthetic data only; does not start app/main.js or read user profiles.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

async function main() {
  const resources = path.resolve(process.argv[2]);
  const archive = path.join(resources, "app.asar");
  const packaged = createRequire(path.join(archive, "package.json"));
  const metadata = packaged("./package.json");
  assert.equal(metadata.version, process.argv[3] || require("../package.json").version);
  assert.ok(!metadata.dssaGoogleDesktopClient && !metadata.dssaMicrosoftDesktopClientId);
  assert.equal(metadata.dssaPublicWindowsBuild, true);
  await assert.rejects(
    packaged("./src/helpers/tinfoilSecureClient.js").tinfoilSecureFetch("/v1/models"),
    /not included in this DSSA Windows distribution/
  );
  assert.equal(
    packaged("./src/helpers/bundledFfmpeg.js").bundledFfmpegPath(),
    path.join(resources, "bin", "ffmpeg.exe")
  );
  const vad = packaged("./src/helpers/whisperVadConfig.js");
  assert.equal(vad.resolveContextSileroEnabled({}, "dictation"), false);
  assert.equal(vad.resolveContextSileroEnabled({}, "noteRecording"), true);
  assert.equal(vad.resolveContextSileroEnabled({}, "meeting"), true);
  const model = path.join(resources, "bin/whisper-vad/ggml-silero-v5.1.2.bin");
  assert.ok(fs.statSync(model).size > 800000);
  const { speakerConstraints } = packaged("./src/helpers/dssaCommunityDiarization.js");
  assert.equal(speakerConstraints({ exactSpeakers: 15 }).exactSpeakers, 15);
  assert.throws(() => speakerConstraints({ maxSpeakers: 16 }));
  const { validateDesktopClient } = packaged("./src/helpers/dssaGoogleCalendarClient.js");
  assert.throws(() => validateDesktopClient({ web: {} }));
  // OAuth modules require Electron's browser process and are not loaded in
  // RUN_AS_NODE mode; account integration needs a separate in-app test.
  const writer = packaged("./src/helpers/dssaDocument.js");
  const document = writer.buildDocument(
    {
      title: "Pakketest – ÆØÅ",
      created_at: 1793577600,
      content: "Ingen vedtak. Nynorsk: Eg kjem i morgon.",
    },
    { source: "notes", language: "nb" }
  );
  assert.match(writer.plainText(document), /ÆØÅ/);
  const bytes = await writer.createDocx(document);
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  const zip = packaged("fflate").unzipSync(bytes);
  assert.match(Buffer.from(zip["word/document.xml"]).toString(), /Eg kjem i morgon/);
  const html = writer.documentHtml({
    title: "Test",
    date: "",
    body: '<img src="https://untrusted.invalid">',
  });
  assert.match(html, /default-src 'none'/);
  assert.ok(!html.includes('<img src="https://untrusted.invalid">'));
  const db = new (packaged("better-sqlite3"))(":memory:");
  assert.equal(db.prepare("SELECT 29 AS version").get().version, 29);
  db.close();
  for (const name of ["CREDITS.md", "OpenWhispr-MIT.txt", "THIRD-PARTY-NOTICES.txt"])
    assert.ok(fs.statSync(path.join(resources, "legal", name)).size > 100);
  console.log(
    JSON.stringify(
      {
        version: metadata.version,
        runtime: process.versions.electron,
        packagedModules: "passed",
        wordExportAndNorwegianText: "passed",
        pdfHtmlProtection: "passed (HTML only, no PDF rendering)",
        nativeSqlite: "passed",
        vadConfigurationAndBundledModel: "passed (no speech inference)",
        noticesPresent: true,
        actualAccountLogin: "not tested",
        freshWindowsInstallation: "not tested",
        userProfileAccessed: false,
      },
      null,
      2
    )
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
