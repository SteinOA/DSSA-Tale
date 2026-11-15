import { createDssaTranslator } from "../../utils/dssaTranslation";
import DssaHelpButton from "./DssaHelpButton";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { FolderOpen, Plus, X } from "../icons";
import type { RecordingLibrary } from "../../types/dssa";

export default function DssaRecordingLibraries({
  onPick,
}: {
  onPick: (id: string) => Promise<void>;
}) {
  const { i18n } = useTranslation();
  const tr = createDssaTranslator(i18n);
  const [libraries, setLibraries] = useState<RecordingLibrary[]>([]);
  const [kind, setKind] = useState("rode");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void window.dssaAPI
      .recordingLibraries()
      .then((result) => {
        if (active && Array.isArray(result)) setLibraries(result);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const kinds = [
    ["rode", "RØDE Reporter"],
    ["iphone", tr("Apple Taleopptak", "Apple Voice Memos")],
    ["android", tr("Android-opptak", "Android recordings")],
    ["other", tr("Annen opptaksmappe", "Other recording folder")],
  ];
  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-3">
      <div className="flex items-center gap-4">
        <p className="text-sm font-medium">
          {tr("Mine opptaksbiblioteker", "My recording libraries")}
        </p>
        <DssaHelpButton topic="libraries" />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {tr(
          "Koble til en tilgjengelig opptaksmappe én gang. Åpne deretter opptakene herfra uten å flytte dem til en annen mappe. Opptak inne i Taleopptak eller RØDE Reporter må først deles til en mappe som PC-en har tilgang til.",
          "Link an accessible recording folder once, then open recordings here without moving them elsewhere. Recordings inside Voice Memos or RØDE Reporter must first be shared to a folder accessible to this PC."
        )}
      </p>
      {libraries.length > 0 && (
        <ul className="space-y-1">
          {libraries.map((library) => (
            <li key={library.id} className="flex items-center gap-1">
              <Button
                className="min-w-0 flex-1 justify-start"
                variant="ghost"
                disabled={busy}
                onClick={() => void run(() => onPick(library.id))}
              >
                <FolderOpen size={16} className="mr-2 shrink-0" />
                <span className="truncate">{library.label}</span>
                {!library.available && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {tr("Frakoblet", "Offline")}
                  </span>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                aria-label={tr("Fjern kobling til ", "Unlink ") + library.label}
                title={tr("Fjern bare koblingen, behold filene", "Remove link only, keep files")}
                onClick={() =>
                  void run(async () => {
                    const result = await window.dssaAPI.removeRecordingLibrary(library.id);
                    if (result.error) throw Error(result.error);
                    if (result.libraries) setLibraries(result.libraries);
                  })
                }
              >
                <X size={14} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <select
          aria-label={tr("Type opptaksbibliotek", "Recording library type")}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          {kinds.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <input
          aria-label={tr("Biblioteknavn", "Library name")}
          placeholder={tr("Eget navn (valgfritt)", "Custom name (optional)")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await window.dssaAPI.addRecordingLibrary({
                kind,
                label: label.trim() || kinds.find((row) => row[0] === kind)?.[1] || "",
              });
              if (result.error) throw Error(result.error);
              if (result.libraries) {
                setLibraries(result.libraries);
                setLabel("");
              }
            })
          }
        >
          <Plus size={15} className="mr-1" />
          {tr("Koble opptaksmappe", "Link recording folder")}
        </Button>
      </div>
      {busy && (
        <p className="text-xs" role="status">
          {tr("Åpner …", "Opening …")}
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
