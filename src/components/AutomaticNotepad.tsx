import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Copy, Trash2, Undo2 } from "./icons";
import { useSettingsStore } from "../stores/settingsStore";
import { usePolicyStore } from "../stores/policyStore";
import { effectiveLocalHistoryEnabled } from "../stores/policyRules";

type NotepadState = Awaited<ReturnType<Window["electronAPI"]["automaticNotepad"]>>;

export default function AutomaticNotepad({ onOpenNote }: { onOpenNote: (id: number) => void }) {
  const preference = useSettingsStore((s) => s.dataRetentionEnabled);
  const allowed = usePolicyStore((s) => effectiveLocalHistoryEnabled(s, preference));
  const [state, setState] = useState<NotepadState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef(0);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    const revision = ++request.current;
    try {
      const result = await window.electronAPI.automaticNotepad("read");
      if (mounted.current && request.current === revision) setState(result);
    } catch {
      if (mounted.current) setMessage("Notatblokken kunne ikke leses. Prøv igjen.");
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const dispose = window.electronAPI.onAutomaticNotepadChanged((status) => {
      if (status?.failed)
        setMessage("Notatblokken kunne ikke lagres. Dikteringen ligger fortsatt i historikken.");
      void refresh();
    });
    const noteUpdated = window.electronAPI.onNoteUpdated(() => void refresh());
    const noteDeleted = window.electronAPI.onNoteDeleted(() => void refresh());
    return () => {
      mounted.current = false;
      dispose();
      noteUpdated();
      noteDeleted();
    };
  }, [refresh, allowed]);
  const mutate = async (action: "clear" | "undo") => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await window.electronAPI.automaticNotepad(action);
      if (!result.success) setMessage(result.error ?? "Endringen kunne ikke lagres.");
      await refresh();
    } catch {
      setMessage("Endringen kunne ikke lagres. Prøv igjen.");
    } finally {
      setBusy(false);
    }
  };
  const copy = async (content: string) => {
    try {
      const result = await window.electronAPI.writeClipboard(content);
      setMessage(result?.success ? "Notatet er kopiert." : "Notatet kunne ikke kopieres.");
    } catch {
      setMessage("Notatet kunne ikke kopieres.");
    }
  };
  return (
    <AutomaticNotepadView
      state={state}
      allowed={allowed}
      busy={busy}
      message={message}
      onOpenNote={onOpenNote}
      onCopy={copy}
      onMutate={mutate}
    />
  );
}

export function AutomaticNotepadView({
  state,
  allowed,
  busy,
  message,
  onOpenNote,
  onCopy,
  onMutate,
}: {
  state: NotepadState | null;
  allowed: boolean;
  busy: boolean;
  message: string;
  onOpenNote: (id: number) => void;
  onCopy: (content: string) => void;
  onMutate: (action: "clear" | "undo") => void;
}) {
  const enabled = allowed && state?.enabled;
  const content = enabled ? (state?.note?.content ?? "") : "";
  return (
    <section
      aria-label="Automatisk notatblokk"
      className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5 text-foreground"
    >
      <h2 className="text-lg font-semibold">Automatisk notatblokk</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ferdig diktering legges til som nye avsnitt, samtidig som teksten settes inn i programmet du
        bruker. Lagres bare lokalt som et personlig notat.
      </p>
      {!allowed || state?.enabled === false ? (
        <p className="mt-3 text-sm" role="status">
          Av: lokal historikk er deaktivert eller lagring er blokkert. Ingen nye avsnitt lagres her.
        </p>
      ) : !state ? (
        <p className="mt-3" role="status">
          Laster notatblokken …
        </p>
      ) : (
        <>
          <div
            className="mt-3 max-h-64 min-h-24 overflow-auto rounded-lg border border-border bg-background p-3 whitespace-pre-wrap break-words text-base leading-relaxed"
            tabIndex={0}
            aria-label="Innhold i notatblokken"
          >
            {content || "Nye dikteringer kommer her. Eldre historikk legges ikke til."}
          </div>
          {state.note && (
            <button
              type="button"
              className="mt-2 text-sm underline underline-offset-4 focus-visible:outline focus-visible:outline-2"
              onClick={() => onOpenNote(state.note!.id)}
            >
              Rediger under Notater
            </button>
          )}
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="outline"
          className="h-auto min-h-9 max-w-full whitespace-normal text-start"
          disabled={busy || !content}
          onClick={() => onCopy(content)}
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          Kopier notatet
        </Button>
        <Button
          variant="destructive"
          className="h-auto min-h-9 max-w-full whitespace-normal text-start"
          disabled={busy || !content}
          onClick={() => onMutate("clear")}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Tøm notatblokken
        </Button>
        {enabled && state?.canUndo && (
          <Button
            variant="outline"
            className="h-auto min-h-9 max-w-full whitespace-normal text-start"
            disabled={busy}
            onClick={() => onMutate("undo")}
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            Angre tømming
          </Button>
        )}
      </div>
      {(message || state?.error) && (
        <p className="mt-3 text-sm" role="status">
          {message || state?.error}
        </p>
      )}
    </section>
  );
}
