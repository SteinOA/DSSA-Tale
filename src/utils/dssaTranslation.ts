import type { i18n } from "i18next";
import { dssaLabelKey } from "../helpers/dssaLabelKey";

export function createDssaTranslator(instance: i18n) {
  return (nb: string, en: string): string =>
    String(
      instance.t("dssaInline." + dssaLabelKey(nb), {
        defaultValue: instance.language.startsWith("en") ? en : nb,
      })
    );
}
