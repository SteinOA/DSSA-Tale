const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { mountSettingsPanel } = require("../lib/settingsPanelHarness");

const mount = (t, targets) =>
  mountSettingsPanel(t, {
    module: "/components/settings/DictationTranslationSettings.tsx",
    settings: { translationTargets: JSON.stringify(targets), preferredLanguage: "nb" },
  });
const preset = (panel) =>
  panel.find((node) => node.props?.children === "dssa.englishNorwegianPreset")[0];

test("English-to-Norwegian preset preserves other targets and enables the translation route", async (t) => {
  const panel = await mount(t, ["de"]);
  await React.act(async () => preset(panel).props.onClick());
  const state = panel.state();
  assert.equal(state.preferredLanguage, "en");
  assert.equal(state.translationSourceLanguage, "en");
  assert.equal(state.translationTargetLanguage, "no");
  assert.equal(state.useDictationTranslation, true);
  assert.deepEqual(state.translationTargets, ["de", "no"]);
  assert.equal(panel.requests().length, 0, "setup does not send text to any provider");
});

test("full target list is preserved instead of silently replacing a language", async (t) => {
  const targets = ["de", "fr", "es", "it", "pt"];
  const panel = await mount(t, targets);
  assert.equal(preset(panel).props.disabled, true);
  await React.act(async () => preset(panel).props.onClick());
  assert.deepEqual(panel.state().translationTargets, targets);
  assert.equal(panel.state().preferredLanguage, "nb");
});

test("an existing Norwegian target remains usable at capacity without duplication", async (t) => {
  const targets = ["de", "fr", "es", "it", "no"];
  const panel = await mount(t, targets);
  assert.equal(preset(panel).props.disabled, false);
  await React.act(async () => preset(panel).props.onClick());
  assert.deepEqual(panel.state().translationTargets, targets);
  assert.equal(panel.state().translationTargetLanguage, "no");
});
