const test = require("node:test");
const assert = require("node:assert/strict");
const en = require("../../src/locales/en/translation.json");
const nb = require("../../src/locales/nb/translation.json");
const shared = new Map(require("../fixtures/dssa-nb-shared-labels.json"));
function leaves(node, prefix = "", out = []) {
  for (const [key, value] of Object.entries(node)) {
    const p = prefix ? prefix + "." + key : key;
    if (value && typeof value === "object") leaves(value, p, out);
    else if (typeof value === "string") out.push([p, value]);
  }
  return out;
}
const get = (key) => key.split(".").reduce((node, part) => node?.[part], nb);
const variables = (s) => (s.match(/\{\{[^}]+\}\}/g) || []).sort();
test("Norwegian covers every English UI key with the same interpolation variables", () => {
  for (const [key, text] of leaves(en)) {
    const value = get(key);
    assert.equal(typeof value, "string", key);
    assert.deepEqual(variables(value), variables(text), key);
    if (text.trim()) assert.ok(value.trim(), key);
    assert.doesNotMatch(value, /\[DSSA\d+\]|ZXPH\d+ZX/, key);
  }
});
test("shared labels are limited to explicitly reviewed names, technical examples and Norwegian homographs", () => {
  for (const [key, text] of leaves(en))
    if (text && get(key) === text) assert.equal(shared.get(key), text, key + " still uses English");
});
test("preview, preferences, privacy and logging headings are Norwegian", () => {
  assert.equal(nb.settingsPage.transcription.transcriptionPreview, "Løpende tekstvisning");
  assert.equal(nb.settingsModal.sections.general.label, "Generelt");
  assert.equal(nb.settingsModal.sections.privacyData.label, "Personvern og data");
  assert.equal(nb.developerSection.whatGetsLogged.title, "Dette registreres i loggen");
  assert.equal(nb.apiKeyInput.label, "API-nøkkel");
});
