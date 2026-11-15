const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { previewWindows, SpeakerPreview } = require("../../src/helpers/dssaSpeakerPreview");
const { fingerprintSource } = require("../../src/helpers/dssaFileCheckpoint");
const anchor = 1700000000000;
const segment = (start, end, speaker = "speaker_3") => ({
  timestamp: anchor + start * 1000,
  endTimestamp: anchor + end * 1000,
  audioStartTimestamp: anchor,
  speaker,
  text: "Offentleg prøve.",
});
test("preview uses real source anchor, bounded excerpts and distinct locations", () => {
  const segments = [
    segment(100, 140),
    segment(120, 125),
    segment(1, 9),
    segment(10, 10.1),
    segment(60, 65, "speaker_1"),
  ];
  assert.deepEqual(previewWindows(segments, "speaker_3"), [
    { start: 1, end: 9 },
    { start: 100, end: 112 },
    { start: 120, end: 125 },
  ]);
  assert.deepEqual(
    previewWindows([{ speaker: "speaker_3", timestamp: 1000, text: "No anchor" }], "speaker_3"),
    []
  );
  assert.deepEqual(previewWindows(segments, "../bad"), []);
});
test("clip reads only associated source and rejects changed audio before decoding", async (t) => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "dssa-preview-test-"));
  t.after(() => {
    if (path.dirname(root) === fs.realpathSync(os.tmpdir()))
      fs.rmSync(root, { recursive: true, force: true });
  });
  const source = path.join(root, "public.wav");
  fs.writeFileSync(source, "RIFF public test");
  const identity = await fingerprintSource(source);
  let calls = 0;
  const preview = new SpeakerPreview({
    profile: root,
    database: {
      getNote: (id) =>
        id === 1 ? { note_type: "upload", transcript: JSON.stringify([segment(1, 20)]) } : null,
    },
    imports: { sourceForNote: () => identity },
    ffmpeg: () => "trusted-ffmpeg.exe",
    run: async (exe, args) => {
      calls++;
      assert.equal(exe, "trusted-ffmpeg.exe");
      assert.equal(args[args.indexOf("-t") + 1], "12");
      assert.equal(args[args.indexOf("-i") + 1], identity.realPath);
      return { data: Buffer.from("RIFF public test") };
    },
  });
  const clip = await preview.clip(1, "speaker_3");
  assert.equal(clip.end, 13);
  assert.ok(clip.audioBase64);
  assert.equal(calls, 1);
  fs.appendFileSync(source, "changed");
  await assert.rejects(preview.clip(1, "speaker_3"), /endret/);
  assert.equal(calls, 1);
  await assert.rejects(preview.clip(2, "speaker_3"), /importert/);
});
