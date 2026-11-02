const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateSummaryEvidence,
  renderSummaryEvidence,
} = require("../../src/helpers/dssaSummaryEvidence");
const material = {
  transcript:
    "Kari: Eg tek oppgåva innan fredag.\nOla: Me har ikkje vedteke å bruke 1,5 millionar.",
  notes: "Vi ventar på nytt tilbod.",
  meetingContext: "Kari skal betale 99 millionar.",
};
const answer = (evidence, draft = "Eit referatutkast.") =>
  `${draft}\n\n\`\`\`dssa-evidence\n${JSON.stringify(evidence)}\n\`\`\``;

test("evidence accepts only exact contiguous original transcript or manual-note excerpts and strips its sidecar", () => {
  const result = validateSummaryEvidence(
    answer({
      decisions: ["Me har ikkje vedteke å bruke 1,5 millionar."],
      tasks: ["Eg tek oppgåva innan fredag.", "Vi ventar på nytt tilbod."],
    }),
    material
  );
  assert.equal(result.valid, true);
  assert.equal(result.draft, "Eit referatutkast.");
  assert.equal(result.decisions[0], "Me har ikkje vedteke å bruke 1,5 millionar.");
  assert.equal(result.tasks.length, 2);
  assert.equal(validateSummaryEvidence(answer({ decisions: [], tasks: [] }), material).valid, true);
});

test("evidence rejects unsupported facts, changed negation/numbers/wording, context-only names and combined sources", () => {
  for (const quote of [
    "Me har vedteke å bruke 1,5 millionar.",
    "Me har ikkje vedteke å bruke 15 millionar.",
    "Jeg tar oppgaven innen fredag.",
    material.meetingContext,
    "innan fredag. Vi ventar på nytt tilbod.",
    "Ein oppdikta avtale.",
  ])
    assert.equal(
      validateSummaryEvidence(answer({ decisions: [quote], tasks: [] }), material).valid,
      false,
      quote
    );
  assert.equal(
    validateSummaryEvidence(answer({ decisions: ["Vi ventar på nytt tilbod."], tasks: [] }), {
      meetingContext: material.notes,
      transcript: "",
      notes: "",
    }).valid,
    false
  );
});

test("evidence rejects missing, malformed, duplicate or nonterminal metadata without silently dropping it", () => {
  const good = answer({ decisions: [], tasks: [] });
  for (const output of [
    "Vanleg referat utan kjelder.",
    good + "\nEtterskrift",
    good + "\n" + good,
    answer({ tasks: [] }),
    answer({ decisions: {}, tasks: [] }),
    answer({ decisions: [], tasks: [], verified: true }),
    answer({ decisions: [42], tasks: [] }),
    answer({ decisions: [" "], tasks: [] }),
    "Referat.\n```dssa-evidence\n{bad json}\n```",
    answer({ decisions: [], tasks: [] }, ""),
  ])
    assert.equal(validateSummaryEvidence(output, material).valid, false, output);
});

test("rendered draft visibly limits verification and escapes source Markdown/HTML without exposing JSON", () => {
  const quote = "Bruk <img src=x> og [lenkje](https://example.test) no.";
  const result = validateSummaryEvidence(
    answer({ decisions: [], tasks: [quote] }, "Vanleg fritekst, ikkje kontrollert."),
    { transcript: quote }
  );
  const rendered = renderSummaryEvidence(result, {
    warning: "Utkast – kontroller innhaldet.",
    decisions: "Moglege vedtak",
    tasks: "Moglege oppgåver",
    none: "Ingen utdrag.",
  });
  assert.match(rendered, /^> Utkast/);
  assert.match(rendered, /Vanleg fritekst, ikkje kontrollert\./);
  assert.match(rendered, /&lt;img src=x&gt;/);
  assert.ok(rendered.includes("\\[lenkje\\]"));
  assert.doesNotMatch(rendered, /```dssa-evidence|<img/);
  assert.throws(() => renderSummaryEvidence({ valid: false }, {}), TypeError);
});
