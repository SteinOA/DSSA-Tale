// Source timestamps from whisper-server, never a clock inferred from text length.
const clean = (text) =>
  String(text || "")
    .replace(/<\|(?:nocaptions|nospeech)\|>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
const valid = (item) =>
  Number.isFinite(item.start) &&
  Number.isFinite(item.end) &&
  item.start >= 0 &&
  item.end > item.start;
function extractWhisperTiming(result) {
  if (!Array.isArray(result?.segments)) return [];
  return result.segments
    .filter(valid)
    .map((segment) => {
      const text = clean(segment.text);
      const words = Array.isArray(segment.words)
        ? segment.words
            .map((word) => ({
              text: String(word.word ?? word.text ?? "").replace(
                /<\|(?:nocaptions|nospeech)\|>/gi,
                " "
              ),
              start: word.start,
              end: word.end,
            }))
            .filter((word) => word.text.trim())
        : [];
      const usableWords =
        words.length &&
        words.every(
          (word) =>
            Number.isFinite(word.start) &&
            Number.isFinite(word.end) &&
            word.start >= 0 &&
            word.end >= word.start
        ) &&
        clean(words.map((word) => word.text).join("")) === text;
      return { text, start: segment.start, end: segment.end, ...(usableWords ? { words } : {}) };
    })
    .filter((segment) => segment.text);
}
function offsetAndTrimTiming(segments, wordsToDrop, offset, duration) {
  const output = [];
  for (const original of segments) {
    const words = original.text.trim().split(/\s+/);
    if (wordsToDrop >= words.length) {
      wordsToDrop -= words.length;
      continue;
    }
    const partial = wordsToDrop > 0;
    const text = partial ? words.slice(wordsToDrop).join(" ") : original.text;
    wordsToDrop = 0;
    const shifted = { text, start: original.start + offset, end: original.end + offset };
    // A text-only prefix trim cannot prove a new word's exact starting time.
    // Keep the engine's coarse source interval rather than invent that time.
    if (!partial && original.words)
      shifted.words = original.words.map((word) => ({
        ...word,
        start: word.start + offset,
        end: word.end + offset,
      }));
    if (!valid(shifted) || shifted.end > duration + 0.25) return null;
    output.push(shifted);
  }
  return output;
}
module.exports = { cleanWhisperText: clean, extractWhisperTiming, offsetAndTrimTiming };
