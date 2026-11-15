import DssaSharePointMark from "./DssaSharePointMark";
import DssaCloudMark from "./DssaCloudMark";
import DssaHelpButton from "./DssaHelpButton";
import { createDssaTranslator } from "../../utils/dssaTranslation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { FolderOpen, FileAudio, ArrowLeft, Link2 } from "../icons";
import { isSupportedUploadFile } from "../../utils/uploadAudioFormats";
import type { DssaResult, MicrosoftItem, MicrosoftStatus } from "../../types/dssa";
import DssaRecordingLibraries from "./DssaRecordingLibraries";
import DssaGoogleDrive from "./DssaGoogleDrive";

type Source = "google" | "microsoft" | "apple";
export default function DssaAudioSources({
  onBrowse,
  onLink,
  onImport,
  onLibrary,
}: {
  onBrowse: (source: Source) => Promise<void>;
  onLink: () => void;
  onImport: (file: DssaResult) => void;
  onLibrary: (id: string) => Promise<void>;
}) {
  const { i18n } = useTranslation();
  const tr = createDssaTranslator(i18n);
  const [source, setSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<MicrosoftStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [items, setItems] = useState<MicrosoftItem[]>([]);
  const [kind, setKind] = useState("drives");
  const [driveId, setDriveId] = useState("");
  const [next, setNext] = useState<string | null>(null);
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const load = async (
    target: string,
    args: {
      siteId?: string;
      driveId?: string;
      itemId?: string;
      query?: string;
      next?: string;
    } = {},
    append = false
  ) => {
    const result = await window.dssaAPI.microsoftList({ kind: target, ...args });
    if (result.error) throw Error(result.error);
    if (!mounted.current) return;
    setItems((previous) => (append ? [...previous, ...result.items] : result.items));
    setKind(target);
    setNext(result.next);
  };
  const open = (selected: Source) => {
    setSource(selected);
    setError("");
    setItems([]);
    setTrail([]);
    setDriveId("");
    setNext(null);
    setQuery("");
    void run(async () => {
      const connections = await window.dssaAPI.connections();
      if (connections.error) throw Error(connections.error);
      if (!mounted.current) return;
      if (
        selected !== "google" &&
        connections.connections?.some((item) => item.source === selected && item.path)
      ) {
        await onBrowse(selected);
        if (mounted.current) setSource(null);
        return;
      }
      if (selected === "microsoft") {
        const state = await window.dssaAPI.microsoftStatus();
        if (state.error) throw Error(state.error);
        if (!mounted.current) return;
        setStatus(state);
        setClientId(state.clientId || "");
        if (state.connected) await load("drives");
      }
    });
  };
  const choose = async (item: MicrosoftItem) => {
    if (kind === "sites") {
      setTrail([]);
      await load("drives", { siteId: item.id });
    } else if (kind === "drives") {
      setDriveId(item.id);
      setTrail([]);
      await load("files", { driveId: item.id });
    } else if (item.folder) {
      setTrail((previous) => [...previous, { id: item.id, name: item.name || "Mappe" }]);
      await load("files", { driveId, itemId: item.id });
    } else {
      const result = await window.dssaAPI.microsoftDownload({
        driveId,
        itemId: item.id,
        forImport: true,
      });
      if (!mounted.current) {
        if (result.filePath) void window.electronAPI.deleteTempFile(result.filePath);
        return;
      }
      if (result.error) throw Error(result.error);
      if (result.success && result.filePath) {
        onImport(result);
        setSource(null);
      }
    }
  };
  return (
    <section
      className="mt-5 space-y-3"
      aria-label={tr("Hent lyd fra skytjeneste", "Import cloud audio")}
    >
      <div className="flex flex-wrap items-center justify-center gap-4">
        <div className="inline-flex items-center gap-4">
          <Button
            variant="outline"
            className="rounded-full"
            disabled={busy}
            data-brand="google"
            onClick={() => open("google")}
          >
            <DssaCloudMark source="google" />
            {tr("Google Disk", "Google Drive")}
          </Button>
          <DssaHelpButton topic="google" />
        </div>
        <div className="inline-flex items-center gap-4">
          <Button
            variant="outline"
            className="rounded-full"
            disabled={busy}
            data-brand="microsoft"
            data-brand-accent="sharepoint"
            onClick={() => open("microsoft")}
          >
            <DssaCloudMark source="microsoft" />
            <DssaSharePointMark />
            OneDrive / SharePoint
          </Button>
          <DssaHelpButton topic="microsoft" />
        </div>
        <div className="inline-flex items-center gap-4">
          <Button
            variant="outline"
            className="rounded-full"
            disabled={busy}
            data-brand="apple"
            onClick={() => open("apple")}
          >
            <DssaCloudMark source="apple" />
            iCloud Drive
          </Button>
          <DssaHelpButton topic="apple" />
        </div>
        <div className="inline-flex items-center gap-4">
          <Button variant="ghost" data-brand="link" className="rounded-full" onClick={onLink}>
            <Link2 size={15} className="mr-2" />
            {tr("Lim inn lenke", "Paste link")}
          </Button>
          <DssaHelpButton topic="link" />
        </div>
      </div>
      <DssaRecordingLibraries onPick={onLibrary} />
      <Dialog
        open={source !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setSource(null);
        }}
      >
        <DialogContent
          data-provider-area
          data-brand={source || undefined}
          className="max-w-2xl max-h-[85vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>
              {source === "google"
                ? tr("Google Disk", "Google Drive")
                : source === "apple"
                  ? "iCloud Drive"
                  : "OneDrive / SharePoint"}
            </DialogTitle>
          </DialogHeader>
          {source === "google" && (
            <DssaGoogleDrive
              onImport={(file) => {
                onImport(file);
                setSource(null);
              }}
            />
          )}
          {source !== "microsoft" ? (
            <>
              <p className="text-sm text-muted-foreground">
                {tr(
                  "Velg lyd- eller videofilen direkte fra skymappen i Windows. Filen hentes ved åpning, uten at du først må lagre en kopi selv. Google Disk for datamaskin eller iCloud for Windows må være installert og innlogget.",
                  "Choose audio or video directly from its cloud folder in Windows. Files are fetched when opened, without manually saving a copy first. Drive for desktop or iCloud for Windows must be installed and signed in."
                )}
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (source) {
                      await onBrowse(source);
                      setSource(null);
                    }
                  })
                }
              >
                <FolderOpen size={16} className="mr-2" />
                {tr("Velg fra skymappe", "Choose from cloud folder")}
              </Button>
            </>
          ) : (
            <>
              {!status?.connected ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {tr(
                      "Koble til Microsoft for å bla i OneDrive og SharePoint her. Bruk klient-ID-en fra appregistreringen din, eller velg fra en skymappe som allerede er koblet til Windows.",
                      "Connect Microsoft to browse OneDrive and SharePoint here. Use your app registration client ID, or choose from a cloud folder already connected in Windows."
                    )}
                  </p>
                  <label className="block text-sm">
                    {tr("Microsoft klient-ID (offentlig)", "Microsoft Application (client) ID")}
                    <input
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="mt-1 w-full rounded-md border p-2 bg-background"
                    />
                  </label>
                  <Button
                    disabled={busy || !clientId.trim()}
                    onClick={() =>
                      void run(async () => {
                        const result = await window.dssaAPI.microsoftConnect(clientId.trim());
                        if (result.error) throw Error(result.error);
                        setStatus(result);
                        if (result.connected) await load("drives");
                      })
                    }
                  >
                    {tr("Koble til Microsoft", "Connect Microsoft")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          setTrail([]);
                          await load("drives");
                        })
                      }
                    >
                      OneDrive
                    </Button>
                    <form
                      className="flex flex-1 gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(() => load("sites", { query }));
                      }}
                    >
                      <input
                        aria-label={tr("Søk etter SharePoint-nettsted", "Search SharePoint sites")}
                        placeholder={tr("SharePoint-nettsted …", "SharePoint site …")}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="min-w-0 flex-1 rounded-md border bg-background px-2"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !query.trim()}
                        type="submit"
                      >
                        {tr("Søk", "Search")}
                      </Button>
                    </form>
                  </div>
                  {kind === "files" && (
                    <div className="flex items-center gap-2 text-sm">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const previous = trail.slice(0, -1);
                            setTrail(previous);
                            await load("files", { driveId, itemId: previous.at(-1)?.id });
                          })
                        }
                      >
                        <ArrowLeft size={15} />
                        {tr("Opp", "Up")}
                      </Button>
                      <span>
                        {trail.map((x) => x.name).join(" / ") ||
                          tr("Dokumentbibliotek", "Document library")}
                      </span>
                    </div>
                  )}
                  <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
                    {!busy && items.length === 0 && (
                      <p className="p-3 text-sm text-muted-foreground">
                        {tr("Ingen filer eller mapper funnet.", "No files or folders found.")}
                      </p>
                    )}
                    {items.map((item) => {
                      const folder = kind !== "files" || !!item.folder;
                      const supported = folder || isSupportedUploadFile(item.name || "");
                      return (
                        <button
                          key={item.id}
                          disabled={busy || !supported}
                          className="flex w-full items-center gap-3 p-3 text-left text-sm hover:bg-muted disabled:opacity-40"
                          onClick={() => void run(() => choose(item))}
                        >
                          {folder ? <FolderOpen size={17} /> : <FileAudio size={17} />}
                          <span className="min-w-0 flex-1 truncate">{item.name || item.id}</span>
                          {!folder && supported && <span>{tr("Importer", "Import")}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {next && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void run(() => load(kind, { next }, true))}
                    >
                      {tr("Vis flere", "Show more")}
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {tr(
                      "Valgt fil hentes til midlertidig lagring og åpnes direkte i Lydimport. Ingenting lastes opp.",
                      "The selected file is fetched to temporary storage and opened directly in Audio import. Nothing is uploaded."
                    )}
                  </p>
                </div>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await onBrowse("microsoft");
                    setSource(null);
                  })
                }
              >
                <FolderOpen size={16} className="mr-2" />
                {tr("Velg fra skymappe i Windows", "Choose from Windows cloud folder")}
              </Button>
            </>
          )}
          {busy && (
            <p role="status" className="text-sm">
              {tr("Henter …", "Loading …")}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
