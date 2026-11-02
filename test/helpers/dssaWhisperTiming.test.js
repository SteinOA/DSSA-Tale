const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  extractWhisperTiming,
  offsetAndTrimTiming,
} = require("../../src/helpers/dssaWhisperTiming");
test("real segment and token times survive cleaning; malformed token metadata cannot replace spoken words", () => {
  const segments = extractWhisperTiming({
    segments: [
      {
        text: " Eg bur i Ørsta. <|nocaptions|>",
        start: 5,
        end: 8,
        words: [
          { word: " Eg", start: 5, end: 5.4 },
          { word: " bur", start: 5.4, end: 6 },
          { word: " i", start: 6, end: 6.3 },
          { word: " Ørsta.", start: 6.3, end: 8 },
          { word: " <|nocaptions|>", start: 8, end: 8 },
        ],
      },
    ],
  });
  assert.equal(segments[0].text, "Eg bur i Ørsta.");
  assert.equal(segments[0].words.length, 4);
  const bad = extractWhisperTiming({
    segments: [
      { text: "Bevar alle orda.", start: 0, end: 4, words: [{ word: "Bevar", start: 0, end: 1 }] },
    ],
  });
  assert.equal(bad[0].text, "Bevar alle orda.");
  assert.equal(bad[0].words, undefined);
});
test("chunk clocks use the real overlapping source offset and partial text trims stay coarse", () => {
  const segments = [
    {
      text: "møte med deltakarar",
      start: 0,
      end: 3,
      words: [
        { text: "møte", start: 0, end: 1 },
        { text: " med", start: 1, end: 2 },
        { text: " deltakarar", start: 2, end: 3 },
      ],
    },
  ];
  const whole = offsetAndTrimTiming(segments, 0, 29.5, 65);
  assert.equal(whole[0].start, 29.5);
  assert.equal(whole[0].words[1].start, 30.5);
  const partial = offsetAndTrimTiming(segments, 1, 29.5, 65);
  assert.equal(partial[0].text, "med deltakarar");
  assert.equal(partial[0].start, 29.5);
  assert.equal(partial[0].words, undefined);
  assert.equal(offsetAndTrimTiming(segments, 0, 64, 65), null);
});
