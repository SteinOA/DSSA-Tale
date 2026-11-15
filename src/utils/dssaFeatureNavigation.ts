export const DSSA_SETTINGS_TARGETS = [
  "general",
  "hotkeys",
  "toneStyle",
  "connections",
  "speechToText",
  "llms",
  "privacyData",
  "system",
  "transcription",
  "uploadTranscription",
  "intelligence",
  "dictationAgent",
  "noteFormatting",
] as const;

export type DssaSettingsTarget = (typeof DSSA_SETTINGS_TARGETS)[number];
export function isDssaSettingsTarget(value: unknown): value is DssaSettingsTarget {
  return typeof value === "string" && DSSA_SETTINGS_TARGETS.some((target) => target === value);
}
export type DssaFeatureTarget =
  | `settings:${DssaSettingsTarget}`
  | "view:home"
  | "view:upload"
  | "view:personal-notes"
  | "view:integrations"
  | "view:dictionary";

export function openDssaFeature(target: DssaFeatureTarget) {
  const [kind, value] = target.split(":");
  window.dispatchEvent(
    new CustomEvent(kind === "settings" ? "dssa-open-settings" : "dssa-navigate", { detail: value })
  );
}

export const DSSA_GUIDE_LINKS: Partial<
  Record<string, { label: string; target: DssaFeatureTarget }[]>
> = {
  start: [{ label: "Velg talemodell", target: "settings:transcription" }],
  generelt: [{ label: "Åpne Generelt", target: "settings:general" }],
  hurtigtaster: [{ label: "Åpne Hurtigtaster", target: "settings:hotkeys" }],
  diktering: [{ label: "Dikteringsinnstillinger", target: "settings:transcription" }],
  notatblokk: [
    { label: "Åpne notatblokken på Hjem", target: "view:home" },
    { label: "Innstillinger for lokal historikk", target: "settings:privacyData" },
  ],
  historikk: [{ label: "Åpne Hjem", target: "view:home" }],
  ordliste: [{ label: "Åpne Ordliste og tekstsnutter", target: "view:dictionary" }],
  modeller: [
    { label: "Tale til tekst", target: "settings:speechToText" },
    { label: "Andre språkmodeller", target: "settings:llms" },
  ],
  assistent: [{ label: "Assistent og oversettelse", target: "settings:llms" }],
  moter: [{ label: "Åpne Møter og notater", target: "view:personal-notes" }],
  notater: [
    { label: "Åpne Møter og notater", target: "view:personal-notes" },
    { label: "Modell for notatformatering", target: "settings:noteFormatting" },
  ],
  lydimport: [
    { label: "Åpne Lydimport", target: "view:upload" },
    { label: "Modell for lydimport", target: "settings:uploadTranscription" },
  ],
  gjenopptakelse: [{ label: "Se lagrede importjobber", target: "view:upload" }],
  talere: [{ label: "Talervalg under Lydimport", target: "view:upload" }],
  community: [{ label: "Åpne Community-1-oppsettet", target: "settings:system" }],
  tidsjustering: [{ label: "Åpne Lydimport", target: "view:upload" }],
  skymapper: [{ label: "Åpne Tilkoblinger", target: "settings:connections" }],
  googledisk: [
    { label: "Koble til Google Disk", target: "settings:connections" },
    { label: "Importer fra Google Disk", target: "view:upload" },
  ],
  mobil: [{ label: "Åpne opptaksbiblioteker i Lydimport", target: "view:upload" }],
  microsoft: [{ label: "Åpne Teams og filer", target: "view:integrations" }],
  kalendere: [{ label: "Kalendertilkoblinger", target: "settings:connections" }],
  referat: [
    { label: "Tekstopprydding", target: "settings:intelligence" },
    { label: "Tone og stil", target: "settings:toneStyle" },
  ],
  lagring: [
    { label: "Personvern og data", target: "settings:privacyData" },
    { label: "Lagre notater som filer", target: "settings:general" },
  ],
  systemvalg: [{ label: "Åpne System", target: "settings:system" }],
  system: [{ label: "Åpne System", target: "settings:system" }],
};
