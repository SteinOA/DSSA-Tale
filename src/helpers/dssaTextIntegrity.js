// A conservative text-preservation gate, not a claim of semantic correctness.
// Automatic cleanup may alter presentation, but never silently rewrite words.
const protectedPatterns = [
  /```[\s\S]*?```/gu,
  /`[^`\r\n]*`/gu,
  /["“«](?:[A-Za-z]:[\\/]|\\\\|\/)[^"”»\r\n]+["”»]/gu,
  /\b(?:https?:\/\/|www\.)[^\s<>"`«»]+/giu,
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu,
  /\b[A-Za-z]:[\\/][^\s<>"`«»]+/gu,
  /\\\\[\p{L}\p{N}_-]+\\[^\s<>"`«»]+/gu,
  /(?:\.{1,2}[\\/]|\/(?!\/))[\p{L}_][\p{L}\p{N}_./\\-]*/gu,
  /\bC(?:\+\+|#)(?![\p{L}\p{N}])/gu,
  /\b[\p{L}]{1,16}[-/]\d+(?:[-/]\d+)*(?![\p{L}\p{N}])/gu,
  /\b[\p{L}_][\p{L}\p{N}_]*_[\p{L}\p{N}_]+\b/gu,
];

function protectedSpans(text) {
  const spans = [];
  for (const pattern of protectedPatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      // Sentence punctuation is outside an unquoted URL/path. Code spans are
      // exact and must never have punctuation or spaces stripped inside them.
      const exactCode = match[0].startsWith("`");
      const quotedPath = /^["“«]/u.test(match[0]);
      const value = quotedPath
        ? match[0].slice(1, -1)
        : exactCode
          ? match[0]
          : match[0].replace(/[.,]+$/u, "");
      const start = match.index,
        end = start + (quotedPath ? match[0].length : value.length);
      if (value && !spans.some((span) => start < span.end && end > span.start))
        spans.push({ start, end, value });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

function inspect(value) {
  const text = value.normalize("NFC");
  const spans = protectedSpans(text),
    tokens = [],
    numbers = [];
  const append = (part) => {
    // Keep decimal/date/time delimiters and signs, including spaced negatives.
    // Ordinary sentence punctuation is excluded. Symbols are retained because
    // a plus, equals sign, or multiplication sign can carry actual meaning.
    const pattern =
      /[+\-−]?\s*\p{N}+(?:[.,:/\-–—]\p{N}+)*(?:\s*[%‰])?|[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*|[\p{S}#&@`]/gu;
    for (const match of part.matchAll(pattern)) {
      const raw = match[0].trim();
      if (/\p{N}/u.test(raw)) {
        const number = raw.replace(/\s+/gu, "");
        numbers.push(number);
        tokens.push(["number", number]);
      } else tokens.push(["word", raw.toLocaleLowerCase("nb-NO").replace(/’/gu, "'")]);
    }
  };
  let offset = 0;
  for (const span of spans) {
    append(text.slice(offset, span.start));
    tokens.push(["protected", span.value]);
    offset = span.end;
  }
  append(text.slice(offset));
  return { tokens, numbers, protected: spans.map((span) => span.value) };
}

export function validateCleanupIntegrity(raw, cleaned) {
  if (typeof raw !== "string" || typeof cleaned !== "string")
    return { valid: false, reason: "words_changed" };
  if (raw.trim() && !cleaned.trim()) return { valid: false, reason: "empty_output" };
  const source = inspect(raw),
    output = inspect(cleaned);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(source.protected, output.protected))
    return { valid: false, reason: "protected_text_changed" };
  if (!same(source.numbers, output.numbers)) return { valid: false, reason: "numbers_changed" };
  if (!same(source.tokens, output.tokens)) return { valid: false, reason: "words_changed" };
  return { valid: true };
}
