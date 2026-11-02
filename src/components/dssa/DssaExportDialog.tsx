import { createDssaTranslator } from "../../utils/dssaTranslation";
import DssaHelpButton from "./DssaHelpButton";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import type { NoteItem } from "../../types/electron";
import type {} from "../../types/dssa";
import { getSettings } from "../../stores/settingsStore";

export default function DssaExportDialog({
  open,
  onClose,
  note,
}: {
  open: boolean;
  onClose: () => void;
  note: NoteItem;
}) {
  const { i18n } = useTranslation();
  const tr = createDssaTranslator(i18n);
  const [source, setSource] = useState("notes");
  const [timestamps, setTimestamps] = useState(false);
  const [speakers, setSpeakers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (open) {
      setSource(
        note.enhanced_content
          ? "summary"
          : note.transcript && note.transcript !== "[]"
            ? "transcript"
            : "notes"
      );
      setMessage("");
    }
  }, [open, note.id, note.enhanced_content, note.transcript]);
  const save = async (format: string) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await window.dssaAPI.exportDocument({
        noteId: note.id,
        format,
        source,
        timestamps,
        speakers,
        language: getSettings().preferredLanguage,
      });
      if (result.error) throw Error(result.error);
      if (result.success)
        setMessage(tr("Dokumentet er lagret: ", "Document saved: ") + result.filePath);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-4 pr-6">
            <DialogTitle>{tr("Lagre møtedokument", "Save meeting document")}</DialogTitle>
            <DssaHelpButton topic="export" />
          </div>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{note.title}</p>
        <label className="grid gap-2 text-sm">
          {tr("Innhold", "Content")}
          <select
            className="rounded-md border border-border bg-background px-3 py-2"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={busy}
          >
            <option value="summary" disabled={!note.enhanced_content}>
              {tr("Bearbeidet referat", "Meeting summary")}
            </option>
            <option value="transcript">{tr("Full utskrift", "Full transcript")}</option>
            <option value="notes">{tr("Mine notater", "My notes")}</option>
          </select>
        </label>
        {source === "transcript" && (
          <div className="grid gap-3 text-sm">
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={speakers}
                onChange={(e) => setSpeakers(e.target.checked)}
                disabled={busy}
              />
              {tr("Ta med talernavn eller talernummer", "Include speaker names or numbers")}
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={timestamps}
                onChange={(e) => setTimestamps(e.target.checked)}
                disabled={busy}
              />
              {tr("Ta med tidsstempler", "Include timestamps")}
            </label>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {tr(
            "Velg en lokal mappe eller en synkronisert OneDrive-, SharePoint- eller Google Drive-mappe i lagrevinduet. Filer i en skymappe kan bli lastet opp av synkroniseringstjenesten.",
            "Choose a local or synced OneDrive, SharePoint or Google Drive folder in the save dialog. Files in a cloud folder may be uploaded by its sync service."
          )}
        </p>
        <div className="flex gap-2 flex-wrap">
          {["docx", "pdf", "txt"].map((format) => (
            <Button
              key={format}
              disabled={busy}
              onClick={() => void save(format)}
              variant={format === "docx" ? "default" : "outline"}
            >
              {format === "docx"
                ? "Word (.docx)"
                : format === "pdf"
                  ? "PDF"
                  : tr("Ren tekst", "Plain text")}
            </Button>
          ))}
        </div>
        <p role="status" className="text-sm break-words">
          {busy ? tr("Lager dokument …", "Creating document …") : message}
        </p>
      </DialogContent>
    </Dialog>
  );
}
