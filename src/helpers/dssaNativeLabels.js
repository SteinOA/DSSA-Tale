const messages = require("./dssaNativeMessages.json");
const { dssaLabelKey } = require("./dssaLabelKey");
function translateNative(text, values = {}) {
  for (const [pattern, template] of [
    [
      /^Microsoft kunne ikke utføre handlingen \((\d+)\)\.$/,
      "Microsoft kunne ikke utføre handlingen ({{status}}).",
    ],
    [
      /^Opplastingen ble ikke bekreftet \((\d+)\)\. Kontroller mappen før du prøver på nytt\.$/,
      "Opplastingen ble ikke bekreftet ({{status}}). Kontroller mappen før du prøver på nytt.",
    ],
  ]) {
    const match = typeof text === "string" && text.match(pattern);
    if (match) return translateNative(template, { ...values, status: match[1] });
  }
  if (!Object.hasOwn(messages, text)) return text;
  const { i18nMain } = require("./i18nMain");
  return i18nMain.t("dssaNative." + dssaLabelKey(text), {
    defaultValue: i18nMain.language.startsWith("en") ? messages[text] : text,
    ...values,
  });
}
module.exports = { translateNative };
