import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button";
import { useSettingsStore, selectResolvedLLMConfig } from "../../stores/settingsStore";
import { WHISPER_MODEL_INFO, PARAKEET_MODEL_INFO } from "../../models/ModelRegistry";
import type { MeetingSetupStatus } from "../../types/dssa";

export interface InstalledModelRow {
  id: string;
  name: string;
  selectedFor?: string;
}

export function InstalledModelRows({ rows }: { rows: InstalledModelRow[] }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <span className="font-medium">{row.name}</span>
          <span
            className={
              row.selectedFor
                ? "rounded-md border border-primary bg-primary/10 px-2 py-1 text-sm font-semibold"
                : "text-sm text-muted-foreground"
            }
          >
            {row.selectedFor ? `Installert · ${row.selectedFor}` : "Installert"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function DssaInstalledModels({ status }: { status: MeetingSetupStatus | null }) {
  const [rows, setRows] = useState<InstalledModelRow[]>([]);
  const [sherpa, setSherpa] = useState<boolean | null>(null);
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(true);
  const selected = useSettingsStore((s) =>
    !s.useLocalWhisper
      ? ""
      : `speech:${s.localTranscriptionProvider === "whisper" ? s.whisperModel : s.localTranscriptionProvider === "cohere" ? s.cohereModel : s.parakeetModel}`
  );
  const cleanup = useSettingsStore((s) =>
    s.useCleanupModel ? selectResolvedLLMConfig(s, "dictationCleanup").model : null
  );
  const dictationVad = useSettingsStore((s) => s.dictationSileroEnabled);
  const recordingVad = useSettingsStore((s) => s.noteRecordingSileroEnabled);
  const meetingVad = useSettingsStore((s) => s.meetingSileroEnabled);
  const language = useSettingsStore((s) => s.preferredLanguage);
  const refresh = useCallback(async (live: () => boolean) => {
    const result = await Promise.allSettled([
      window.electronAPI.listWhisperModels(),
      window.electronAPI.listParakeetModels(),
      window.electronAPI.modelGetAll(),
      window.electronAPI.getDiarizationModelStatus(),
    ]);
    if (!live()) return;
    const next: InstalledModelRow[] = [];
    const whisper = result[0];
    if (whisper.status === "fulfilled" && whisper.value.success)
      for (const model of whisper.value.models) {
        if (model.downloaded)
          next.push({
            id: `speech:${model.model}`,
            name: WHISPER_MODEL_INFO[model.model]?.name ?? model.model,
          });
      }
    const other = result[1];
    if (other.status === "fulfilled" && other.value.success)
      for (const model of other.value.models) {
        if (model.downloaded)
          next.push({
            id: `speech:${model.model}`,
            name: PARAKEET_MODEL_INFO[model.model]?.name ?? model.model,
          });
      }
    const llms = result[2];
    if (llms.status === "fulfilled")
      for (const model of llms.value) {
        if (model.isDownloaded) next.push({ id: `text:${model.id}`, name: model.name });
      }
    const speakers = result[3];
    setSherpa(speakers.status === "fulfilled" ? Boolean(speakers.value.sherpaReady) : null);
    setRows(next);
    setWarning(
      result.some((r) => r.status === "rejected") ||
        (whisper.status === "fulfilled" && !whisper.value.success) ||
        (other.status === "fulfilled" && !other.value.success)
        ? "Noen installasjoner kunne ikke kontrolleres. Prøv Oppdater oversikten."
        : ""
    );
    setLoading(false);
  }, []);
  useEffect(() => {
    let live = true;
    const run = () => void refresh(() => live);
    run();
    window.addEventListener("focus", run);
    return () => {
      live = false;
      window.removeEventListener("focus", run);
    };
  }, [refresh]);
  const displayRows = rows
    .map((row) => ({
      ...row,
      selectedFor:
        row.id === selected
          ? "Valgt for diktering"
          : row.id === `text:${cleanup}`
            ? "Valgt for tekstopprydding"
            : undefined,
    }))
    .sort((a, b) => Number(Boolean(b.selectedFor)) - Number(Boolean(a.selectedFor)));
  return (
    <section
      className="space-y-3 rounded-xl border border-border p-4"
      aria-label="Installerte modeller og bruk"
    >
      <h3 className="font-semibold">Installerte modeller og bruk</h3>
      <p className="text-sm text-muted-foreground">
        Dette er status, ikke nye modellvalg. Modell for diktering velges under Tale til tekst.
        «Valgt» betyr modellen appen skal bruke, ikke at den behandler lyd akkurat nå.
      </p>
      {loading ? (
        <p role="status">Kontrollerer installerte modeller …</p>
      ) : displayRows.length ? (
        <InstalledModelRows rows={displayRows} />
      ) : (
        <p className="text-sm">
          Ingen nedlastede tale- eller tekstmodeller ble funnet i kontrollert modellager.
        </p>
      )}
      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="font-semibold">Lagret språkvalg</dt>
          <dd>
            {language === "nb"
              ? "Bokmål"
              : language === "nn"
                ? "Nynorsk"
                : language === "no"
                  ? "Norsk"
                  : language === "auto"
                    ? "Automatisk språk"
                    : language}
            . Vises fra tidligere valg; endres under Tale til tekst eller Lydopplasting.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Møteverktøy for Community-1/ordtider</dt>
          <dd>
            {status
              ? status.runtime
                ? `Installert (${status.runtimeDevice === "cuda" ? "NVIDIA CUDA" : status.runtimeDevice === "cpu" ? "CPU" : "miljø kontrollert"})`
                : "Ikke installert"
              : "Status kontrolleres"}
            . Installasjonsstatus er ikke det samme som at et tillegg er valgt i et opptak.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Silero VAD – oppdager tale og stillhet</dt>
          <dd>
            {status?.sileroInstalled === undefined
              ? "Status kontrolleres"
              : status.sileroInstalled
                ? "Installert (følger med appen)"
                : "Ikke installert"}
            . Valgt for Whisper: Diktering {dictationVad ? "på" : "av"}, notatopptak/lydopplasting{" "}
            {recordingVad ? "på" : "av"}, møter {meetingVad ? "på" : "av"}. Skriver ikke teksten og
            skiller ikke talere.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">sherpa-onnx – lokal stemmeutskillelse</dt>
          <dd>
            {sherpa === null
              ? "Status kontrolleres"
              : sherpa
                ? "Modellene er installert"
                : "Modellene er ikke installert"}
            . Alternativet til Community-1. Velges under Lydopplasting → Skill talere → Motor for
            stemmeutskillelse.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Community-1 – valgfri stemmeutskillelse</dt>
          <dd>
            {status ? (status.community ? "Installert" : "Ikke installert") : "Status kontrolleres"}
            . Krever eget valg og modelltilgang. Nedlasting aktiverer ikke en ny dikteringsmodell.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Ordjustering (wav2vec2 via WhisperX)</dt>
          <dd>
            {Object.entries(status?.alignment ?? {})
              .flatMap(([mode, languages]) =>
                Object.keys(languages).map(
                  (lang) =>
                    `Nasjonalbibliotekets wav2vec2 ${mode === "fast" ? "300M" : "1B"} (${lang})`
                )
              )
              .join(" · ") || "Ingen justeringsmodeller er installert"}
            . Brukes bare ved valgt tidsjustering i lydopplasting; erstatter ikke NB-Whisper.
          </dd>
        </div>
      </dl>
      <Button
        variant="outline"
        onClick={() => {
          setLoading(true);
          void refresh(() => true);
        }}
      >
        Oppdater oversikten
      </Button>
      {warning && (
        <p role="status" className="text-sm">
          {warning}
        </p>
      )}
    </section>
  );
}
