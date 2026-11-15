const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDocument,
  plainText,
  createDocx,
  documentHtml,
} = require("../../src/helpers/dssaDocument");
const { verifyModelFile } = require("../../src/helpers/dssaModelIntegrity");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const note = {
  title: "Styremøte – Østfold",
  created_at: "2026-10-28T10:00:00Z",
  content: "rapport_final.csv: 2 * 3 = 6",
  enhanced_content: "## Vedtak\n\nIngen vedtak ble dokumentert.\n\n- Kari undersøker saken.",
  transcript: JSON.stringify([
    { text: "Vi undersøker saken.", timestamp: 2, speaker: "speaker_0" },
    { text: "Fristen er fredag.", timestamp: 65, speaker: "speaker_1" },
  ]),
};
test("transcript options remove only metadata, preserving all spoken text", () => {
  const plain = buildDocument(note, { source: "transcript" });
  assert.equal(plain.body, "Vi undersøker saken.\n\nFristen er fredag.");
  const detailed = buildDocument(
    note,
    { source: "transcript", timestamps: true, speakers: true },
    { speaker_0: "Kari" }
  );
  assert.match(detailed.body, /\[00:00:02\] Kari: Vi undersøker saken/);
  assert.match(detailed.body, /Taler 2: Fristen er fredag/);
});
test("summary and raw notes remain separate and empty summaries fail", () => {
  assert.match(buildDocument(note, { source: "summary" }).body, /Ingen vedtak/);
  assert.equal(buildDocument(note, { source: "notes" }).body, note.content);
  assert.throws(
    () => buildDocument({ ...note, enhanced_content: "" }, { source: "summary" }),
    /referat/
  );
  assert.match(
    plainText(buildDocument(note, { source: "notes" })),
    /rapport_final.csv: 2 \* 3 = 6/
  );
});
test("real DOCX package is generated with Unicode text", async () => {
  const bytes = await createDocx(buildDocument(note, { source: "summary" }));
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  const entries = Object.fromEntries(
    Object.entries(require("fflate").unzipSync(bytes)).map(([name, data]) => [
      name,
      Buffer.from(data).toString(),
    ])
  );
  assert.match(entries["word/document.xml"], /Styremøte – Østfold/);
  assert.match(entries["word/document.xml"], /Ingen vedtak ble dokumentert/);
  assert.ok(entries["[Content_Types].xml"]);
});
test("PDF HTML escapes hostile markup and does not permit network loads", () => {
  const html = documentHtml({
    title: "<script>alert(1)</script>",
    date: "",
    body: '<img src="https://evil.test/a">\n\n![track](https://evil.test/track)',
  });
  assert.ok(!html.includes("<script>alert"));
  assert.match(html, /default-src 'none'/);
  assert.match(html, /&lt;img/);
});

test("DOCX preserves tables and TXT preserves fenced literal text", async () => {
  const bytes = await createDocx({
    title: "Oppgaver",
    date: "",
    body: "| Oppgave | Ansvar |\n|---|---|\n| Sjekk mikrofon | Kari |",
  });
  const xml = Buffer.from(require("fflate").unzipSync(bytes)["word/document.xml"]).toString();
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /Sjekk mikrofon/);
  assert.match(xml, /Kari/);
  assert.match(
    plainText({ title: "Kode", date: "", body: "```\nrapport_final.csv\n2 * 3\n```" }),
    /rapport_final.csv\n2 \* 3/
  );
});
test("model validation checks exact size and digest without deleting damaged files", async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "dssa-integrity-"));
  const file = path.join(folder, "model.bin");
  fs.writeFileSync(file, "abc");
  const expected = {
    expectedSizeBytes: 3,
    sha256: crypto.createHash("sha256").update("abc").digest("hex"),
  };
  try {
    await verifyModelFile(file, expected);
    await assert.rejects(verifyModelFile(file, { ...expected, sha256: "0".repeat(64) }), /SHA-256/);
    await assert.rejects(verifyModelFile(file, { ...expected, expectedSizeBytes: 4 }), /størrelse/);
    assert.equal(fs.readFileSync(file, "utf8"), "abc");
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test("Nynorsk text and names survive DOCX, TXT and PDF preparation with Nynorsk proofing language", async () => {
  const text = "Eg vil ikkje endre målforma. Me drøfta møtet på Teams i Ørsta.";
  const document = buildDocument({ ...note, content: text }, { source: "notes", language: "nn" });
  assert.equal(document.body, text);
  assert.match(plainText(document), /Eg vil ikkje endre målforma/);
  assert.match(documentHtml(document), /lang="nn-NO"/);
  const entries = require("fflate").unzipSync(await createDocx(document));
  assert.match(
    Buffer.from(entries["word/document.xml"]).toString(),
    /Me drøfta møtet på Teams i Ørsta/
  );
  assert.match(Buffer.from(entries["word/styles.xml"]).toString(), /w:lang w:val="nn-NO"/);
  const transcript = buildDocument(
    { ...note, transcript: JSON.stringify([{ text, speaker: "one", timestamp: 0 }]) },
    { source: "transcript", speakers: true, language: "nn" }
  );
  assert.match(transcript.body, /^Talar 1: Eg/);
});

test('unknown timed voices stay unknown instead of receiving an invented participant number',()=>{
 const document=buildDocument({...note,transcript:JSON.stringify([{text:'Eg er usikker.',timestamp:0},{text:'Neste sak.',timestamp:2,speaker:'speaker_0'}])},{source:'transcript',speakers:true,language:'nn'});
 assert.match(document.body,/^Ukjend talar: Eg er usikker/);
 assert.match(document.body,/Talar 1: Neste sak/);
});
