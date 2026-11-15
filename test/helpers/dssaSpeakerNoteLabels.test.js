const test = require("node:test");
const assert = require("node:assert/strict");
const { renameUploadSpeakerLabels: rename } = require("../../src/helpers/dssaSpeakerNoteLabels");
const { syncUploadSpeakerLabels } = require("../../src/helpers/dssaSpeakerNoteLabels");
const anchor = 1700000000000;
const segment = (speaker, start, end, speakerName) => ({
  speaker,
  speakerName,
  text: "Eg er samd.",
  timestamp: anchor + start * 1000,
  endTimestamp: anchor + end * 1000,
  audioStartTimestamp: anchor,
});
const note = (content, segments) => ({
  note_type: "upload",
  content,
  transcript: JSON.stringify(segments),
});

test("names saved by an earlier version are repaired once on reopening", () => {
  const n = note("\\[Taler 3\\] 0:00 - 0:04\nEg er samd.", [segment("speaker_2", 0, 4, "Åse")]);
  const mappings = [{ speaker_id: "speaker_2", display_name: "Åse" }];
  const content = syncUploadSpeakerLabels(n, mappings);
  assert.equal(content, "\\[Åse\\] 0:00 - 0:04\nEg er samd.");
  assert.equal(syncUploadSpeakerLabels({ ...n, content }, mappings), content);
});

test("Notes editor Markdown escaping survives renaming and a second rename", () => {
  const n = note("\\[Taler 3\\] 0:00 - 0:04\nEg er samd.", [segment("speaker_2", 0, 4)]);
  const renamed = rename(n, [], "speaker_2", "Åse [A]");
  assert.equal(renamed, "\\[Åse \\[A\\]\\] 0:00 - 0:04\nEg er samd.");
  assert.equal(
    rename(
      { ...n, content: renamed },
      [{ speaker_id: "speaker_2", display_name: "Åse [A]" }],
      "speaker_2",
      "Kari"
    ),
    "\\[Kari\\] 0:00 - 0:04\nEg er samd."
  );
});

test("renaming a cluster changes only its generated note headers, preserving words, other people and unknowns", () => {
  const content =
    "[Taler 3] 1:00 - 1:04\nEg er samd.\n\n[Taler 2] 1:04 - 1:08\nBevar [Taler 3] i sitatet.\n\n[Ukjent taler] 1:08 - 1:09\nJa.\n\n[Taler 3] 1:09 - 1:10\nPrøv igjen.";
  const n = note(content, [
    segment("speaker_2", 60, 64),
    segment("speaker_1", 64, 68),
    segment(undefined, 68, 69),
    segment("speaker_2", 69, 70),
  ]);
  const result = rename(n, [], "speaker_2", "Åse");
  assert.equal(
    result,
    content.replace("[Taler 3] 1:00", "[Åse] 1:00").replace("[Taler 3] 1:09", "[Åse] 1:09")
  );
});

test("changing an existing name works after reopen without changing another cluster with the same old name", () => {
  const n = note("[Åse] 0:00 - 0:04\nEg er samd.\n\n[Åse] 0:04 - 0:08\nEit anna avsnitt.", [
    segment("speaker_2", 0, 4, "Åse"),
    segment("speaker_1", 4, 8, "Åse"),
  ]);
  assert.equal(
    rename(
      n,
      [
        { speaker_id: "speaker_2", display_name: "Åse" },
        { speaker_id: "speaker_1", display_name: "Åse" },
      ],
      "speaker_2",
      "Kari"
    ),
    n.content.replace("[Åse] 0:00", "[Kari] 0:00")
  );
});

test("nynorsk and English generated labels are recognized without translating the transcript", () => {
  for (const label of ["Talar 3", "Speaker 3"]) {
    const n = note(`[${label}] 0:00 - 0:04\nEg tykkjer dette er bra.`, [
      segment("speaker_2", 0, 4),
    ]);
    assert.equal(
      rename(n, [], "speaker_2", "Bjørn"),
      "[Bjørn] 0:00 - 0:04\nEg tykkjer dette er bra."
    );
  }
});

test("rich-text markup is preserved and a name cannot inject HTML", () => {
  const n = note("<p>[Taler 3] 0:00 - 0:04</p><p><strong>Eg er samd.</strong></p>", [
    segment("speaker_2", 0, 4),
  ]);
  const result = rename(n, [], "speaker_2", "A & <B>");
  assert.equal(result, "<p>[A &amp; &lt;B&gt;] 0:00 - 0:04</p><p><strong>Eg er samd.</strong></p>");
});

test("a rounded clock shared by different clusters with the same name is not guessed", () => {
  const n = note("[Åse] 0:00 - 0:00\nKort.", [
    segment("speaker_2", 0.1, 0.2, "Åse"),
    segment("speaker_1", 0.3, 0.4, "Åse"),
  ]);
  assert.equal(rename(n, [], "speaker_2", "Kari"), n.content);
});

test("edited prose, unrelated clocks, ordinary notes and invalid metadata remain untouched", () => {
  const n = note("Eg sa [Taler 3] 0:00 - 0:04.\n[Taler 3] 5:00 - 5:04\nManuelt tillegg.", [
    segment("speaker_2", 0, 4),
  ]);
  assert.equal(rename(n, [], "speaker_2", "Åse"), n.content);
  assert.equal(rename({ ...n, note_type: "manual" }, [], "speaker_2", "Åse"), n.content);
  assert.equal(rename({ ...n, transcript: "invalid" }, [], "speaker_2", "Åse"), n.content);
});
