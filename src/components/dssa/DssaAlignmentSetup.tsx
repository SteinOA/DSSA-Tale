import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import type { MeetingSetupStatus } from "../../types/dssa";

export default function DssaAlignmentSetup({
  language,
  onModelsChange,
}: {
  language: string;
  onModelsChange: React.Dispatch<React.SetStateAction<Record<string, Record<string, boolean>>>>;
}) {
  const [status, setStatus] = useState<MeetingSetupStatus | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    let live = true;
    const refresh = async () => {
      try {
        const result = await window.dssaAPI.meetingSetupStatus();
        if (!live) return;
        if (result.error) {
          setError(result.error);
          return;
        }
        setStatus(result);
        const models = Object.fromEntries(
          Object.entries(result.alignment ?? {}).map(([mode, languages]) => [
            mode,
            Object.fromEntries(Object.keys(languages).map((key) => [key, true])),
          ])
        );
        onModelsChange((current) =>
          JSON.stringify(current) === JSON.stringify(models) ? current : models
        );
      } catch {
        if (live) setError("Justeringsmodellene kunne ikke kontrolleres.");
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [onModelsChange]);
  const start = async (kind: "alignment-fast" | "alignment-precise") => {
    if (!["nb", "nn"].includes(language) || starting || status?.busy) return;
    setStarting(true);
    setError("");
    try {
      const result = await window.dssaAPI.meetingSetupStart({ kind, language, device: "auto" });
      if (result.error) setError(result.error);
      setStatus(await window.dssaAPI.meetingSetupStatus());
    } catch {
      setError("Nedlastingen kunne ikke startes.");
    } finally {
      setStarting(false);
    }
  };
  return (
    <details className="w-full rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Valgfritt: installer ordtidsjustering for dette språket
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        <p>
          Nasjonalbibliotekets wav2vec2-modeller brukes via WhisperX til å plassere ordene i
          lydopptaket. De endrer ikke teksten og erstatter ikke NB-Whisper. 300M bruker mindre minne
          enn 1B; dette er ikke et nytt valg av dikteringsmodell.
        </p>
        <p>
          Språk fra lydimport:{" "}
          <strong>
            {language === "nb"
              ? "Bokmål"
              : language === "nn"
                ? "Nynorsk"
                : "Velg bokmål eller nynorsk i språkvalget for lydimport først"}
          </strong>
          .
        </p>
        <p>
          Førstegangsoppsett kan også laste ned nødvendige Python-biblioteker. Krever internett og
          ledig diskplass. Nedlasting slår ikke på tidsjustering; velg ønsket behandling ovenfor
          etterpå.
        </p>
        <div className="flex flex-wrap gap-3">
          {(["fast", "precise"] as const).map((mode) => (
            <Button
              key={mode}
              variant="outline"
              disabled={
                starting ||
                !status ||
                status.busy ||
                !["nb", "nn"].includes(language) ||
                Boolean(status.alignment?.[mode]?.[language])
              }
              onClick={() => void start(mode === "fast" ? "alignment-fast" : "alignment-precise")}
            >
              {status?.alignment?.[mode]?.[language] ? "Installert" : "Last ned"}: wav2vec2{" "}
              {mode === "fast" ? "300M" : "1B"}
            </Button>
          ))}
        </div>
        {status?.busy && <p role="status">Tilleggsinstallasjon pågår. Fase: {status.phase}.</p>}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
