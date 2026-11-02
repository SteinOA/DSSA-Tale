const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeTimedSpeakers } = require("../../src/helpers/speakerMergeTimed");
const assign = (asr, diarization) => mergeTimedSpeakers(diarization, asr);

test("actual timestamps preserve a brief late contribution independently of silence and text length", () => {
  const speech = [
    { start: 0, end: 4, text: "Ein svært lang tekst frå møteleiaren før pausen." },
    { start: 6000, end: 6002, text: "Ja." },
  ];
  const result = assign(speech, [
    { start: 6000, end: 6002, speaker: "guest_12" },
    { start: 0, end: 4, speaker: "chair" },
  ]);
  assert.deepEqual(result.map((segment) => segment.speaker), ["chair", "guest_12"]);
  assert.deepEqual(result.map(({ text, start, end }) => ({ text, start, end })), speech);
});

test("the strongest real overlap wins only when one non-simultaneous voice clearly dominates", () => {
  const result = assign([{ start: 10, end: 14, text: "Spørsmål og svar." }], [
    { start: 10, end: 11, speaker: "questioner" },
    { start: 11, end: 14, speaker: "respondent" },
  ]);
  assert.equal(result[0].speaker, "respondent");
  assert.equal(result[0].speakerAssignment, "overlap");
});

test("equal or weakly dominant turns remain ambiguous rather than attributing all words to one person", () => {
  for (const boundary of [11.5, 12]) {
    const result = assign([{ start: 10, end: 14, text: "To personar snakkar." }], [
      { start: 10, end: boundary, speaker: "one" },
      { start: boundary, end: 14, speaker: "two" },
    ]);
    assert.equal(result[0].speaker, undefined);
    assert.equal(result[0].speakerAssignment, "ambiguous");
  }
});

test("simultaneous voices are not assigned to a fabricated dominant identity", () => {
  const result = assign([{ start: 0, end: 4, text: "Overlappande tale." }], [
    { start: 0, end: 4, speaker: "one" },
    { start: 2, end: 3, speaker: "two" },
  ]);
  assert.equal(result[0].speaker, undefined);
  assert.equal(result[0].speakerAssignment, "ambiguous");
});

test("duplicate same-speaker intervals do not inflate overlap evidence", () => {
  const result = assign([{ start: 0, end: 4, text: "Eit svar." }], [
    { start: 0, end: 2, speaker: "one" },
    { start: 0, end: 2, speaker: "one" },
    { start: 2, end: 4, speaker: "two" },
  ]);
  assert.equal(result[0].speaker, undefined);
  assert.equal(result[0].speakerAssignment, "ambiguous");
});

test("only a close unambiguous boundary can use nearest fallback; long silence stays unknown", () => {
  const result = assign([
    { start: 4.2, end: 4.3, text: "Kort lyd." },
    { start: 60, end: 61, text: "Seinare tale." },
  ], [{ start: 0, end: 4, speaker: "one" }]);
  assert.equal(result[0].speaker, "one");
  assert.equal(result[0].speakerAssignment, "nearest");
  assert.equal(result[1].speaker, undefined);
  assert.equal(result[1].speakerAssignment, "unknown");
});

test("an equal-distance boundary between two people stays ambiguous", () => {
  const result = assign([{ start: 4.4, end: 4.6, text: "Kven?" }], [
    { start: 0, end: 4, speaker: "one" },
    { start: 5, end: 8, speaker: "two" },
  ]);
  assert.equal(result[0].speaker, undefined);
  assert.equal(result[0].speakerAssignment, "ambiguous");
});

test("missing identities or sparse voiced coverage stay unknown without creating word timestamps", () => {
  const original = { start: 0, end: 10, text: "  Teksten står uendra. " };
  const result = assign([original], [{ start: 0, end: 1, speaker: "one" }]);
  assert.equal(result[0].speaker, undefined);
  assert.equal(result[0].text, original.text);
  assert.equal(result[0].start, original.start);
  assert.equal(result[0].end, original.end);
  assert.equal(assign([original], [])[0].speaker, undefined);
});

test("invalid timing is rejected so callers can preserve the plain transcript rather than invent positions", () => {
  for (const timing of [{ start: NaN, end: 1 }, { start: -1, end: 1 }, { start: 2, end: 1 }])
    assert.throws(() => assign([{ ...timing, text: "Behald teksten." }], []), TypeError);
});

test("native token pieces are concatenated into real words before assigning their timestamps", () => {
  const original = "  Eg heiter Åse.  ";
  const result = mergeTimedSpeakers([
    { start: 100, end: 101.1, speaker: "one" },
    { start: 101.1, end: 104, speaker: "two" },
  ], [{ start: 100, end: 104, text: original, words: [
    { text: " Eg", start: 100, end: 100.4 },
    { text: " hei", start: 100.5, end: 100.7 },
    { text: "ter", start: 100.7, end: 101 },
    { text: " Å", start: 101.2, end: 101.5 },
    { text: "se", start: 101.5, end: 102 },
    { text: ".", start: 102, end: 102 },
  ] }], 200);
  assert.equal(result.map((segment) => segment.text).join(""), original);
  assert.deepEqual(result.map((segment) => segment.speaker), ["one", "two"]);
  assert.equal(result[0].text, "  Eg heiter");
  assert.equal(result[1].text, " Åse.  ");
  assert.equal(result[0].start, 100);
  assert.equal(result[0].end, 101);
  assert.equal(result[1].start, 101.2);
  assert.equal(result[1].end, 102);
});

test("complete-word provider metadata without leading spaces preserves the source whitespace", () => {
  const original = "God  dag.";
  const result = mergeTimedSpeakers([
    { start: 0, end: 1, speaker: "one" },
    { start: 1, end: 2, speaker: "two" },
  ], [{ start: 0, end: 2, text: original, words: [
    { text: "God", start: 0, end: 1 },
    { text: "dag.", start: 1, end: 2 },
  ] }], 2);
  assert.equal(result.map((segment) => segment.text).join(""), original);
  assert.deepEqual(result.map((segment) => segment.speaker), ["one", "two"]);
});

test("word text mismatches fall back to one truthful coarse interval without dropping source words", () => {
  const original = "Denne teksten skal bevarast.";
  const result = mergeTimedSpeakers([
    { start: 0, end: 2, speaker: "one" },
    { start: 2, end: 4, speaker: "two" },
  ], [{ start: 0, end: 4, text: original, words: [
    { text: " Something else.", start: 0, end: 4 },
  ] }], 4);
  assert.equal(result.length, 1);
  assert.equal(result[0].speaker, undefined);
  assert.equal(result[0].text, original);
  assert.equal(result[0].start, 0);
  assert.equal(result[0].end, 4);
});

test("one timed token spanning multiple words never acquires invented per-word positions", () => {
  const result = mergeTimedSpeakers([
    { start: 0, end: 1, speaker: "one" },
    { start: 1, end: 2, speaker: "two" },
  ], [{ start: 0, end: 2, text: "God dag.", words: [
    { text: "God dag.", start: 0, end: 2 },
  ] }], 2);
  assert.equal(result.length, 1);
  assert.equal(result[0].speaker, undefined);
  assert.equal(result[0].text, "God dag.");
});

test("invalid or non-monotonic word clocks fall back to the unchanged ASR segment", () => {
  for (const words of [
    [{ text: " God", start: -1, end: 1 }, { text: " dag.", start: 1, end: 2 }],
    [{ text: " God", start: 1, end: 2 }, { text: " dag.", start: 0, end: 1 }],
  ]) {
    const result = mergeTimedSpeakers([{ start: 0, end: 2, speaker: "one" }], [
      { start: 0, end: 2, text: "God dag.", words },
    ], 2);
    assert.equal(result.length, 1);
    assert.equal(result[0].text, "God dag.");
    assert.equal(result[0].start, 0);
    assert.equal(result[0].end, 2);
  }
});

test("out-of-file ASR times fail explicitly instead of being scaled into the recording", () => {
  assert.throws(() => mergeTimedSpeakers([], [{ start: 100, end: 101, text: "Hei." }], 10), TypeError);
});

test("zero-length diarization points provide no evidence for a speaker identity", () => {
  const result = mergeTimedSpeakers([{ start: 1, end: 1, speaker: "noise" }], [
    { start: 0.8, end: 1.2, text: "Behald teksten." },
  ], 2);
  assert.equal(result[0].speaker, undefined);
  assert.equal(result[0].speakerAssignment, "unknown");
});
