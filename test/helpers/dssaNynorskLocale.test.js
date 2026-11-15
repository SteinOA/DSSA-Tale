const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

const localePath = (language, file = "translation.json") =>
  path.join(__dirname, "../../src/locales", language, file);
const readLocale = (language, file) =>
  JSON.parse(fs.readFileSync(localePath(language, file), "utf8"));

function leaves(node, prefix = "", out = []) {
  for (const [key, value] of Object.entries(node)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") leaves(value, fullKey, out);
    else if (typeof value === "string") out.push([fullKey, value]);
  }
  return out;
}

const interpolation = (text) => (text.match(/\{\{[^}]+\}\}/g) || []).sort();

test("Nynorsk covers the complete shipped English and Bokmål label trees without damaged variables", () => {
  const nn = new Map(leaves(readLocale("nn")));
  const knownKeys = new Set();
  for (const language of ["en", "nb"]) {
    const reference = new Map(leaves(readLocale(language)));
    for (const key of reference.keys()) knownKeys.add(key);
    assert.deepEqual(
      [...reference.keys()].filter((key) => !nn.has(key)),
      [],
      `${language}: missing Nynorsk keys`
    );
    for (const [key, source] of reference) {
      const translated = nn.get(key);
      assert.equal(typeof translated, "string", key);
      if (source.trim()) assert.ok(translated.trim(), `${key}: empty translation`);
      assert.deepEqual(interpolation(translated), interpolation(source), `${key}: variables`);
      assert.doesNotMatch(translated, /DSSAVAR\d+|ZXPH\d+ZX|\[DSSA\d+\]/i, key);
    }
  }
  assert.deepEqual(
    [...nn.keys()].filter((key) => !knownKeys.has(key)),
    [],
    "unexpected Nynorsk keys outside the English/Bokmål union"
  );
});

test("Nynorsk prompt bundle preserves interpolation and distinguishes source language from interface language", () => {
  const nn = readLocale("nn", "prompts.json");
  const en = readLocale("en", "prompts.json");
  assert.deepEqual(Object.keys(nn).sort(), Object.keys(en).sort());
  for (const [key, source] of Object.entries(en)) {
    assert.ok(nn[key].trim(), key);
    assert.deepEqual(interpolation(nn[key]), interpolation(source), key);
  }
  assert.match(nn.cleanupPrompt, /Ikkje byt målform berre fordi grensesnittet er på nynorsk/);
  assert.match(nn.cleanupPrompt, /Ikkje dikt inn/);
});

test("translated locale arrays keep their shape so returnObjects callers receive usable example lists", () => {
  const nb = readLocale("nb");
  const nn = readLocale("nn");
  let arrays = 0;
  function verifyShape(source, translated, key = "translation") {
    if (Array.isArray(source)) {
      arrays++;
      assert.ok(Array.isArray(translated), `${key} must remain an array`);
      assert.equal(translated.length, source.length, `${key}: array length`);
    }
    if (source && typeof source === "object") {
      for (const [child, value] of Object.entries(source))
        verifyShape(value, translated?.[child], `${key}.${child}`);
    }
  }
  verifyShape(nb, nn);
  assert.ok(arrays > 0, "checks actual translated array resources");
  const { i18nMain } = require("../../src/helpers/i18nMain");
  const examples = i18nMain.getFixedT("nn")("onboarding.voiceAgent.examples", {
    returnObjects: true,
  });
  assert.ok(Array.isArray(examples), "i18next returns an array to example-list consumers");
  assert.deepEqual(examples, nn.onboarding.voiceAgent.examples);
  assert.ok(examples.every((item) => typeof item === "string" && item.length));
});

test("native dialogs and known errors follow the selected interface language while preserving filenames and unknown diagnostics", async (t) => {
  const { translateNative } = require("../../src/helpers/dssaNativeLabels");
  const messages = require("../../src/helpers/dssaNativeMessages.json");
  const { dssaLabelKey } = require("../../src/helpers/dssaLabelKey");
  const { i18nMain } = require("../../src/helpers/i18nMain");
  const previous = i18nMain.language;
  t.after(() => i18nMain.changeLanguage(previous));
  const values = { source: "RØDE Reporter", file: "Åse & Kari.wav", status: "503" };
  const format = (text) => text.replace(/\{\{(\w+)\}\}/g, (match, key) => values[key] ?? match);
  for (const language of ["nn", "en", "nb"]) {
    await i18nMain.changeLanguage(language);
    const dictionary = readLocale(language).dssaNative;
    for (const source of Object.keys(messages)) {
      const key = dssaLabelKey(source);
      assert.equal(typeof dictionary[key], "string", `${language}: ${source}`);
      assert.equal(
        translateNative(source, values),
        format(dictionary[key]),
        `${language}: ${source}`
      );
    }
    assert.equal(
      translateNative("Microsoft kunne ikke utføre handlingen (503)."),
      format(dictionary[dssaLabelKey("Microsoft kunne ikke utføre handlingen ({{status}}).")])
    );
    assert.equal(
      translateNative(
        "Opplastingen ble ikke bekreftet (503). Kontroller mappen før du prøver på nytt."
      ),
      format(
        dictionary[
          dssaLabelKey(
            "Opplastingen ble ikke bekreftet ({{status}}). Kontroller mappen før du prøver på nytt."
          )
        ]
      )
    );
    const diagnostic = "ENOENT: C:\\Lyd\\Åse & Kari.wav; original diagnostic retained";
    assert.equal(translateNative(diagnostic), diagnostic, "unrecognized diagnostics stay intact");
  }
});

test("reviewed Nynorsk controls preserve units and distinguish people from loudspeaker devices", () => {
  const nn = readLocale("nn");
  const nb = readLocale("nb");
  assert.equal(nn.common.save, "Lagre");
  assert.equal(nn.dictionary.import, "Importer");
  assert.match(nn.settingsPage.transcription.diarization.title, /[Tt]alar/);
  assert.doesNotMatch(nn.settingsPage.transcription.diarization.title, /høgtalar/i);
  assert.match(nn.settingsPage.transcription.vad.fields.maxSpeechDurationS.label, /\(s\)/);
  assert.match(nn.settingsPage.transcription.vad.fields.samplesOverlap.label, /\(s\)/);
  for (const [key, text] of Object.entries(nb.dssaInline)) {
    for (const brand of ["Teams", "SharePoint", "OneDrive", "RØDE Reporter"]) {
      if (text.includes(brand)) assert.ok(nn.dssaInline[key].includes(brand), `${key}: ${brand}`);
    }
  }
});

test("every product-specific translated UI call has entries for all three supported Norwegian/English choices", () => {
  const ts = require("typescript");
  const { dssaLabelKey } = require("../../src/helpers/dssaLabelKey");
  const locales = Object.fromEntries(
    ["nb", "nn", "en"].map((locale) => [locale, readLocale(locale)])
  );
  const folder = path.join(__dirname, "../../src/components/dssa");
  let checked = 0;
  for (const name of fs.readdirSync(folder).filter((file) => file.endsWith(".tsx"))) {
    const source = ts.createSourceFile(
      name,
      fs.readFileSync(path.join(folder, name), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "tr" &&
        node.arguments.length === 2 &&
        node.arguments.every(ts.isStringLiteralLike)
      ) {
        const [nb, en] = node.arguments.map((arg) => arg.text);
        const key = dssaLabelKey(nb);
        assert.equal(locales.nb.dssaInline[key], nb, `${name}: Bokmål source drift`);
        assert.equal(locales.en.dssaInline[key], en, `${name}: English source drift`);
        assert.equal(typeof locales.nn.dssaInline[key], "string", `${name}: missing Nynorsk`);
        checked++;
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.ok(checked > 50, "checks the real product UI rather than a small fixture");
});

test("renderer and native i18n normalize Nynorsk regions and switch product labels without altering speech settings", async (t) => {
  installBrowserGlobals(t, { initialStorage: { uiLanguage: "nn", preferredLanguage: "nn" } });
  const vite = await createRendererServer(t, { cachePrefix: "dssa-nynorsk-locale-test-" });
  const frontend = await vite.ssrLoadModule("/i18n.ts");
  const main = require("../../src/helpers/i18nMain");
  for (const tag of ["nn", "nn-NO", "nn_NO", "NN-no"]) {
    assert.equal(frontend.normalizeUiLanguage(tag), "nn", `renderer ${tag}`);
    assert.equal(main.normalizeUiLanguage(tag), "nn", `native ${tag}`);
  }
  const { useSettingsStore } = await vite.ssrLoadModule("/stores/settingsStore.ts");
  const { createDssaTranslator } = await vite.ssrLoadModule("/utils/dssaTranslation.ts");
  const { dssaLabelKey } = await vite.ssrLoadModule("/helpers/dssaLabelKey.js");
  const phrase = "Lagre møtedokument";
  const english = "Save meeting document";
  const key = dssaLabelKey(phrase);
  useSettingsStore.setState({ preferredLanguage: "nn", whisperModel: "nb-large-full" });
  const translate = createDssaTranslator(frontend.default);
  for (const locale of ["nn", "en", "nb", "nn"]) {
    useSettingsStore.getState().setUiLanguage(locale);
    await frontend.default.changeLanguage(locale);
    assert.equal(translate(phrase, english), readLocale(locale).dssaInline[key], locale);
    assert.equal(
      useSettingsStore.getState().preferredLanguage,
      "nn",
      "interface switch keeps chosen written language"
    );
    assert.equal(
      useSettingsStore.getState().whisperModel,
      "nb-large-full",
      "interface switch keeps speech model"
    );
  }
  const { getCleanupSystemPrompt } = await vite.ssrLoadModule("/config/prompts.ts");
  assert.match(
    getCleanupSystemPrompt(null, [], "nn", "en"),
    /entire output in Nynorsk, never Bokmål/
  );
  const bokmal = getCleanupSystemPrompt(null, [], "no", "nn");
  assert.match(bokmal, /selected written language is Norwegian Bokmål/);
  assert.doesNotMatch(bokmal, /entire output in Nynorsk, never Bokmål/);
});
