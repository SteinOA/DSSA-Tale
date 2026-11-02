import logger from "./logger";
import { validateCleanupIntegrity } from "../helpers/dssaTextIntegrity";

const wordSegmenter = new Intl.Segmenter("und", { granularity: "word" });
const cleanupLabel =
  /^(?:Cleaned transcript:|\*\*Cleaned transcript:\*\*|\*\*Cleaned transcript\*\*:)$/i;

function comparisonTokens(text: string): string[] {
  // Keep contractions as one word when punctuation is discarded.
  const normalized = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['’]/gu, "")
    .replace(/\p{P}/gu, " ");
  return Array.from(wordSegmenter.segment(normalized))
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment);
}

function assertNotDuplicatedCleanupOutput(rawText: string, output: string): void {
  // Collapse stutters ("the the") so they don't read as saying a word twice.
  const originalTokens = comparisonTokens(rawText).filter(
    (token, index, all) => token !== all[index - 1]
  );
  const tokens: string[] = [];
  for (const line of output.split(/\r?\n/u)) {
    if (cleanupLabel.test(line.trim())) continue;
    for (const token of comparisonTokens(line)) tokens.push(token);
  }

  const halfLength = tokens.length / 2;
  if (!Number.isInteger(halfLength) || halfLength < 6) return;
  const copy = tokens.slice(0, halfLength);
  if (!copy.every((token, index) => token === tokens[index + halfLength])) return;
  // A speaker who really said it twice said most of its words twice: each word
  // in the copy uses up two of its occurrences in the raw transcript.
  const rawCounts = new Map<string, number>();
  for (const token of originalTokens) rawCounts.set(token, (rawCounts.get(token) ?? 0) + 1);
  let saidTwice = 0;
  for (const token of copy) {
    const remaining = rawCounts.get(token) ?? 0;
    if (remaining < 2) continue;
    rawCounts.set(token, remaining - 2);
    saidTwice++;
  }
  if (saidTwice * 2 > halfLength) return;

  logger.logReasoning("CLEANUP_OUTPUT_REJECTED", {
    reason: "duplicated_transcript",
    inputLength: rawText.length,
    outputLength: output.length,
  });
  throw Object.assign(
    new Error("AI cleanup repeated the transcript. The original text was kept."),
    {
      code: "CLEANUP_OUTPUT_INVALID",
      messageKey: "hooks.audioRecording.errorDescriptions.cleanupDuplicated",
    }
  );
}

export function assertValidCleanupOutput(
  rawText: string,
  output: string,
  options: { strict?: boolean } = {}
): void {
  // Keep the existing duplication diagnostic and legacy callers unchanged.
  assertNotDuplicatedCleanupOutput(rawText, output);
  if (!options.strict) return;
  const integrity = validateCleanupIntegrity(rawText, output);
  if (integrity.valid) return;
  logger.logReasoning("CLEANUP_OUTPUT_REJECTED", {
    reason: integrity.reason,
    inputLength: rawText.length,
    outputLength: output.length,
  });
  throw Object.assign(new Error("AI cleanup changed the content. The original text was kept."), {
    code: "CLEANUP_OUTPUT_INVALID",
    messageKey: "hooks.audioRecording.errorDescriptions.cleanupIntegrityRejected",
  });
}
