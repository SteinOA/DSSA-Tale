const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

test("new transcript summaries validate source excerpts before saving, preserve drafts and keep the old summary on rejection", async (t) => {
  const updates = [],
    calls = [];
  installBrowserGlobals(t, {
    window: {
      electronAPI: {
        getNote: async () => ({ enhanced_content: "Eksisterande referat." }),
        updateNote: async (id, payload) => {
          updates.push({ id, payload });
          return { success: true };
        },
      },
    },
  });
  let response = "";
  globalThis.__dssaEvidenceInference = async (text, config) => {
    calls.push({ text, config });
    return response;
  };
  t.after(() => delete globalThis.__dssaEvidenceInference);
  const vite = await createRendererServer(t, {
    cachePrefix: "dssa-summary-evidence-",
    mockModules: {
      "/services/ReasoningService":
        "export default { processText: (text, model, agent, config) => globalThis.__dssaEvidenceInference(text, config) };",
      "/utils/generateTitle": "export const generateNoteTitle = async () => undefined;",
    },
  });
  const store = await vite.ssrLoadModule("/stores/actionProcessingStore.ts");
  const { useSettingsStore } = await vite.ssrLoadModule("/stores/settingsStore.ts");
  useSettingsStore.setState({
    preferredLanguage: "nn",
    uiLanguage: "en",
    autoGenerateNoteTitle: false,
  });
  const material = {
    transcript: "Kari: Eg tek oppgåva innan fredag.",
    notes: "Me ventar på tilbod.",
    meetingContext: "Ola betaler 99 millionar.",
  };
  const answer = (evidence) =>
    `Møtet drøfta tilbodet.\n\n\`\`\`dssa-evidence\n${JSON.stringify(evidence)}\n\`\`\``;
  const run = (id, extra = {}) =>
    store.runBackgroundAction(
      id,
      `${material.meetingContext}\n${material.notes}\n${material.transcript}`,
      "hash",
      { id: 1, name: "Referat", prompt: "Skriv referat." },
      { modelId: "test", isCloudMode: true, isMeetingNote: true, material, ...extra },
      { noModel: "no", noEndpoint: "no", actionFailed: "failed" }
    );
  const wait = async (id) => {
    for (let n = 0; n < 200; n++) {
      if (
        updates.some((row) => row.id === id) ||
        store.useActionProcessingStore.getState().errorEvents.some((row) => row.noteId === id)
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail("summary did not settle");
  };
  response = answer({
    decisions: [],
    tasks: ["Eg tek oppgåva innan fredag.", "Me ventar på tilbod."],
  });
  run(3001);
  await wait(3001);
  assert.equal(calls.length, 1, "source validation adds no model call");
  assert.match(calls[0].config.systemPrompt, /dssa-evidence/);
  const saved = updates[0].payload.enhanced_content;
  assert.match(saved, /Møtet drøfta tilbodet/);
  assert.match(saved, /Utkast/);
  assert.match(saved, /Moglege oppgåver/);
  assert.match(saved, /Eg tek oppgåva innan fredag/);
  assert.doesNotMatch(saved, /```dssa-evidence/);
  let id = 3002;
  for (const invalid of [
    answer({ decisions: [material.meetingContext], tasks: [] }),
    answer({ decisions: [], tasks: ["Ola tek oppgåva innan fredag."] }),
    "Vanleg referat utan dokumentasjon.",
  ]) {
    response = invalid;
    run(id);
    await wait(id);
    assert.equal(
      updates.some((row) => row.id === id),
      false,
      "invalid evidence cannot overwrite an existing summary"
    );
    assert.equal(
      store.useActionProcessingStore.getState().errorEvents.find((row) => row.noteId === id)
        .messageKey,
      "notes.actions.errors.sourceEvidenceRejected"
    );
    id++;
  }
  response = "Eit uttrykkeleg omskrive referat.";
  run(3010, { fromSummary: true });
  await wait(3010);
  assert.equal(
    updates.find((row) => row.id === 3010).payload.enhanced_content,
    response,
    "existing-summary edits retain their explicit-action behavior"
  );
  assert.doesNotMatch(calls.at(-1).config.systemPrompt, /dssa-evidence/);
});
