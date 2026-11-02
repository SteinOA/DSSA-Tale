export const SUMMARY_EVIDENCE_INSTRUCTION = `MANDATORY SOURCE-EXCERPT PROTOCOL:
Write the normal requested summary as an unverified draft. Do not write separate decisions or action-item sections in the prose: the app builds those from source excerpts.
End your answer with exactly one fenced block tagged dssa-evidence containing JSON with exactly these keys:
\`\`\`dssa-evidence
{"decisions":["an exact contiguous quote from the original transcript or manual notes"],"tasks":["another exact contiguous quote"]}
\`\`\`
Use empty arrays when no relevant excerpts exist. Copy quotations exactly, preserving names, wording, punctuation and numbers; never paraphrase, combine or invent them. Include enough surrounding words to retain negation, uncertainty and context. Meeting context, invited participants, dictionary hints and your own working notes are never evidence. No text may follow the final fence. Excerpts show possible decisions/tasks; their meaning still needs human review.`;

function failure(reason) {
  return { valid: false, reason };
}

export function validateSummaryEvidence(output, material) {
  if (typeof output !== "string") return failure("malformed_evidence");
  const tags = output.match(/^\s*```dssa-evidence\b/gmu) || [];
  const block = /(?:^|\n)[ \t]*```dssa-evidence[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*\s*$/u.exec(
    output
  );
  if (tags.length !== 1 || !block || block[1].length > 131072)
    return failure("missing_or_malformed_evidence");
  let evidence;
  try {
    evidence = JSON.parse(block[1]);
  } catch {
    return failure("malformed_evidence");
  }
  if (
    !evidence ||
    Array.isArray(evidence) ||
    Object.keys(evidence).sort().join(",") !== "decisions,tasks"
  )
    return failure("malformed_evidence");
  const sources = [material?.transcript, material?.notes].filter(
    (value) => typeof value === "string" && value.trim()
  );
  if (!sources.length) return failure("missing_source");
  for (const key of ["decisions", "tasks"]) {
    if (!Array.isArray(evidence[key]) || evidence[key].length > 100)
      return failure("malformed_evidence");
    for (const quote of evidence[key]) {
      if (
        typeof quote !== "string" ||
        quote.trim().length < 8 ||
        quote.length > 4000 ||
        quote !== quote.trim()
      )
        return failure("malformed_evidence");
      if (!sources.some((source) => source.includes(quote))) return failure("unsupported_quote");
    }
  }
  const draft = output.slice(0, block.index).trim();
  if (!draft) return failure("empty_draft");
  return { valid: true, draft, decisions: evidence.decisions, tasks: evidence.tasks };
}

const escapeExcerpt = (text) =>
  text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/[\\`*_{}\[\]()!#|]/gu, "\\$&")
    .split(/\r?\n/u)
    .map((line) => `> ${line}`)
    .join("\n");

export function renderSummaryEvidence(result, labels) {
  if (!result?.valid) throw new TypeError("Summary evidence must be validated before rendering");
  const section = (title, quotes) =>
    `## ${title}\n\n${quotes.length ? quotes.map(escapeExcerpt).join("\n\n") : labels.none}`;
  return `> ${labels.warning}\n\n${result.draft}\n\n${section(labels.decisions, result.decisions)}\n\n${section(labels.tasks, result.tasks)}`;
}
