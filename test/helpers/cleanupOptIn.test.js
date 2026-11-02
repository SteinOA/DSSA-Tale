const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

for (const savedChoice of [undefined, "true", "false"]) {
  test(`cleanup is opt-in and model routing preserves saved choice ${savedChoice}`, async (t) => {
    installBrowserGlobals(t, {
      initialStorage: savedChoice === undefined ? {} : { useCleanupModel: savedChoice },
    });
    const vite = await createRendererServer(t, { cachePrefix: "dssa-cleanup-opt-in-" });
    const { useSettingsStore } = await vite.ssrLoadModule("/stores/settingsStore.ts");
    const expected = savedChoice === "true";
    assert.equal(useSettingsStore.getState().useCleanupModel, expected);
    useSettingsStore.getState().setCloudReasoningForAllScopes({
      cleanupCloudMode: "local",
      cleanupProvider: "qwen",
      cleanupModel: "qwen3-4b-q4_k_m",
    });
    assert.equal(useSettingsStore.getState().useCleanupModel, expected);
    useSettingsStore.getState().updateCleanupSettings({ useCleanupModel: !expected });
    assert.equal(useSettingsStore.getState().useCleanupModel, !expected);
  });
}
