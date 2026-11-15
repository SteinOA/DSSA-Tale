const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");
test("a fresh dictation renderer loads local Norwegian defaults before constructing its settings store", async (t) => {
  installBrowserGlobals(t);
  // Load the store directly, without the main entry or onboarding screen. This
  // mirrors the shared chunk evaluated first by the hidden dictation window.
  const hidden = await createRendererServer(t, { cachePrefix: "dssa-fresh-dictation-" });
  const { getSettings } = await hidden.ssrLoadModule("/stores/settingsStore.ts");
  const beforeWizard = getSettings();
  assert.equal(beforeWizard.transcriptionMode, "local");
  assert.equal(beforeWizard.useLocalWhisper, true);
  assert.equal(beforeWizard.localTranscriptionProvider, "whisper");
  assert.equal(beforeWizard.whisperModel, "nb-large-full");
  assert.equal(beforeWizard.preferredLanguage, "no");
  assert.equal(beforeWizard.autoPasteEnabled, true);
  assert.equal(beforeWizard.useCleanupModel, false);
  assert.equal(localStorage.getItem("onboardingCompleted"), null);
  const panel = await createRendererServer(t, { cachePrefix: "dssa-fresh-panel-" });
  const { getSettings: panelSettings } = await panel.ssrLoadModule("/stores/settingsStore.ts");
  assert.equal(panelSettings().useLocalWhisper, true);
  assert.equal(getSettings().useLocalWhisper, true);
});
