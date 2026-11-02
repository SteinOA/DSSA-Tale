import DssaSharePointMark from "./DssaSharePointMark";
import { createDssaTranslator } from "../../utils/dssaTranslation";
import DssaTeamsRecordingChoices from "./DssaTeamsRecordingChoices";
import DssaCloudMark from "./DssaCloudMark";
import teamsIcon from "../../assets/icons/apps/teams.svg";
import microsoftCalendarIcon from "../../assets/icons/microsoft-calendar.svg";
import DssaCalendarConnections from "./DssaCalendarConnections";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { CalendarDays, FolderOpen, Mic, Upload, Download, ArrowLeft } from "../icons";
import type { MicrosoftItem, MicrosoftStatus } from "../../types/dssa";

export default function DssaIntegrations(_props: {
  onStartMeeting?: () => Promise<void>;
  connectionOnly?: boolean;
  isPaid?: boolean;
  onUpgrade?: () => void;
  section?: string;
  onSectionChange?: (section: never) => void;
}) {
  const { i18n, t } = useTranslation();
  const tr = createDssaTranslator(i18n);
  const [tab, setTab] = useState(_props.connectionOnly ? "connection" : "teams");
  const [status, setStatus] = useState<MicrosoftStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<MicrosoftItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [kind, setKind] = useState("drives");
  const [driveId, setDriveId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState("");
  const [localFolders, setLocalFolders] = useState<{ name: string; path: string }[]>([]);
  const api = window.dssaAPI;
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void run(async () => {
      const state = await api.microsoftStatus();
      if (state.error) throw Error(state.error);
      setStatus(state);
      setClientId(state.clientId || "");
      setLocalFolders(await api.localFolders());
    });
  }, [api]);
  const load = async (
    target: string,
    args: {
      driveId?: string;
      siteId?: string;
      itemId?: string;
      query?: string;
      next?: string;
    } = {},
    append = false
  ) => {
    const result = await api.microsoftList({ kind: target, ...args });
    if (result.error) throw Error(result.error);
    setItems((previous) => (append ? [...previous, ...result.items] : result.items));
    setNext(result.next);
    setKind(target);
  };
  const selectTab = (value: string) => {
    setTab(value);
    setMessage("");
    setItems([]);
    setNext(null);
    setFolders([]);
    setDriveId("");
    setSiteId("");
    if (status?.connected && value === "calendar") void run(() => load("events"));
    if (status?.connected && value === "files") void run(() => load("drives"));
  };
  const openItem = async (item: MicrosoftItem) => {
    if (kind === "sites") {
      setSiteId(item.id);
      await load("drives", { siteId: item.id });
    } else if (kind === "drives") {
      setDriveId(item.id);
      setFolders([]);
      await load("files", { driveId: item.id });
    } else if (item.folder) {
      setFolders((previous) => [...previous, { id: item.id, name: item.name || "Mappe" }]);
      await load("files", { driveId, itemId: item.id });
    } else {
      const result = await api.microsoftDownload({ driveId, itemId: item.id });
      if (result.error) throw Error(result.error);
      if (result.success)
        setMessage(
          tr("Lastet ned til ", "Downloaded to ") +
            result.filePath +
            tr(
              ". Lydfilen kan nå åpnes under Lydimport.",
              ". You can now open the audio file under Audio import."
            )
        );
    }
  };
  const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  return (
    <div className="flex h-full min-h-0">
      {!_props.connectionOnly && (
        <nav
          aria-label={tr("Integrasjoner", "Integrations")}
          className="w-44 shrink-0 border-r border-border/40 p-3 space-y-4"
        >
          {[
            ["teams", "Teams", Mic],
            ["calendar", tr("Kalender", "Calendar"), CalendarDays],
            ["files", tr("Filer og SharePoint", "Files and SharePoint"), FolderOpen],
            ["connection", tr("Tilkobling", "Connection"), Upload],
          ].map(([id, label, Icon]) => {
            const I = Icon as typeof Mic;
            return (
              <button
                key={id as string}
                data-brand={
                  id === "teams"
                    ? "teams"
                    : id === "calendar"
                      ? undefined
                      : id === "files"
                        ? "sharepoint"
                        : "microsoft"
                }
                aria-current={tab === id ? "page" : undefined}
                disabled={busy}
                onClick={() => selectTab(id as string)}
                className={`flex w-full items-center gap-2 rounded-md p-2 text-left text-sm ${tab === id ? "bg-primary/10 text-primary" : "hover:bg-foreground/5"}`}
              >
                {id === "teams" ? (
                  <img src={teamsIcon} alt="" className="size-5 shrink-0" />
                ) : id === "files" ? (
                  <DssaSharePointMark />
                ) : (
                  <I size={16} />
                )}
                {label as string}
              </button>
            );
          })}
        </nav>
      )}
      <section
        data-provider-area={tab !== "teams" || undefined}
        data-brand={
          tab === "teams"
            ? undefined
            : tab === "files" && (siteId || kind === "sites")
              ? "sharepoint"
              : "microsoft"
        }
        className="flex-1 min-w-0 overflow-auto p-7 space-y-5"
      >
        <div className="flex justify-between gap-4 items-center">
          <h1 className="flex items-center gap-3 text-xl font-semibold">
            {tab === "teams" ? (
              <img src={teamsIcon} alt="" className="size-8 shrink-0" />
            ) : tab !== "calendar" ? (
              <DssaCloudMark source="microsoft" />
            ) : null}
            {tab === "teams"
              ? "Teams"
              : tab === "calendar"
                ? tr("Kalender", "Calendar")
                : tab === "files"
                  ? tr("Filer og SharePoint", "Files and SharePoint")
                  : _props.connectionOnly
                    ? "OneDrive / SharePoint"
                    : "Microsoft 365"}
          </h1>
          <span className="text-xs text-muted-foreground">
            {status?.connected
              ? `${tr("Tilkoblet", "Connected")}: ${status.user}`
              : tr("Microsoft er ikke tilkoblet", "Microsoft is not connected")}
          </span>
        </div>
        {tab === "teams" && <DssaTeamsRecordingChoices onStartMeeting={_props.onStartMeeting} />}
        {tab === "connection" && (
          <div className="max-w-2xl space-y-4">
            <p className="text-sm leading-relaxed">
              {tr(
                "Valgfri tilkobling for å finne kalenderavtaler, åpne Teams-møter og hente eller lagre filer i OneDrive og SharePoint. Lokal diktering og transkribering krever ingen tilkobling.",
                "Optional connection to find calendar events, open Teams meetings and download or upload OneDrive and SharePoint files. Local dictation and transcription do not require a connection."
              )}
            </p>
            <p className="text-xs text-muted-foreground">{t("dssaMicrosoftSignIn.intro")}</p>
            {status && !clientId && (
              <p role="status" className="text-sm text-muted-foreground">
                {t("dssaMicrosoftSignIn.setupMissing")}
              </p>
            )}
            <div className="flex flex-wrap gap-4">
              <Button
                disabled={busy || !!status?.connected || !clientId}
                onClick={() =>
                  void run(async () => {
                    const result = await api.microsoftConnect(clientId || undefined);
                    if (result.error) throw Error(result.error);
                    setStatus(result);
                    setMessage(tr("Microsoft er koblet til.", "Microsoft is connected."));
                  })
                }
              >
                {t("dssaMicrosoftSignIn.connect")}
              </Button>
              <Button
                variant="outline"
                disabled={busy || !status?.connected}
                onClick={() =>
                  void run(async () => {
                    const result = await api.microsoftDisconnect();
                    if (result.error) throw Error(result.error);
                    setStatus(result);
                    setItems([]);
                  })
                }
              >
                {tr("Koble fra", "Disconnect")}
              </Button>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                {t("dssaMicrosoftSignIn.advanced")}
              </summary>
              <label className="mt-3 grid gap-2 text-sm">
                {tr("Microsoft klient-ID (offentlig)", "Microsoft Application (client) ID")}
                <input
                  className={inputClass}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value.trim())}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  disabled={busy || status?.connected}
                />
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("dssaMicrosoftSignIn.setupHint")}
              </p>
            </details>
          </div>
        )}
        {tab === "calendar" && <DssaCalendarConnections />}
        {tab === "calendar" && (
          <h2 className="flex items-center gap-3 font-semibold">
            <img src={microsoftCalendarIcon} alt="" className="size-6 shrink-0" />
            Microsoft Kalender / Teams
          </h2>
        )}
        {(tab === "calendar" || tab === "files") && !status?.connected && (
          <div className="space-y-3">
            <p className="text-sm">
              {tr(
                "Denne visningen krever Microsoft-innlogging og appregistrering. Den er ikke koblet til ennå.",
                "This view requires Microsoft sign-in and app registration. It is not connected yet."
              )}
            </p>
            <Button variant="outline" onClick={() => selectTab("connection")}>
              {tr("Åpne tilkobling", "Open connection")}
            </Button>
          </div>
        )}
        {tab === "calendar" && status?.connected && (
          <>
            <p className="text-sm text-muted-foreground">
              {tr(
                "Møter de neste 14 dagene. Kalenderen endres ikke.",
                "Meetings in the next 14 days. Your calendar is not changed."
              )}
            </p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run(() => load("events"))}
            >
              {tr("Oppdater", "Refresh")}
            </Button>
            <ul className="divide-y divide-border/40">
              {items.map((item) => (
                <li key={item.id} className="py-4 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {item.subject || tr("Uten tittel", "Untitled")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.start
                        ? new Date(
                            item.start.dateTime +
                              (item.start.timeZone === "UTC" &&
                              !/Z$|[+-]\d\d:\d\d$/.test(item.start.dateTime)
                                ? "Z"
                                : "")
                          ).toLocaleString(i18n.language)
                        : ""}
                    </p>
                  </div>
                  {item.onlineMeeting?.joinUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const r = await api.openMicrosoftLink(item.onlineMeeting!.joinUrl!);
                          if (r.error) throw Error(r.error);
                        })
                      }
                    >
                      {tr("Åpne Teams-møte", "Open Teams meeting")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === "files" && (
          <>
            <p className="text-sm text-muted-foreground">
              {tr(
                "Hent opptak til PC-en, eller last opp et ferdig dokument til valgt mappe. Opptak lastes aldri opp automatisk.",
                "Download recordings to your PC, or upload a finished document to the selected folder. Recordings are never uploaded automatically."
              )}
            </p>
            {status?.connected && (
              <>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    data-brand="microsoft"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setDriveId("");
                        setFolders([]);
                        setSiteId("");
                        await load("drives");
                      })
                    }
                  >
                    OneDrive
                  </Button>
                  <input
                    className="rounded-md border border-border bg-background px-3 py-1 text-sm"
                    aria-label={tr("Søk i SharePoint", "Search SharePoint")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={tr(
                      "SharePoint-lenke eller områdenavn",
                      "SharePoint URL or site name"
                    )}
                  />
                  <Button
                    variant="outline"
                    disabled={busy || !query.trim()}
                    data-brand="sharepoint"
                    onClick={() => void run(() => load("sites", { query }))}
                  >
                    <DssaSharePointMark />
                    {tr("Åpne SharePoint", "Open SharePoint")}
                  </Button>
                </div>
                {kind === "files" && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const parent = folders.slice(0, -1);
                          setFolders(parent);
                          await load("files", { driveId, itemId: parent.at(-1)?.id });
                        })
                      }
                    >
                      <ArrowLeft size={14} />
                      {tr("Opp ett nivå", "Up one level")}
                    </Button>
                    <span className="text-xs flex-1">
                      {folders.map((f) => f.name).join(" / ") || tr("Rotmappe", "Root folder")}
                    </span>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const r = await api.microsoftUpload({
                            driveId,
                            itemId: folders.at(-1)?.id,
                          });
                          if (r.error) throw Error(r.error);
                          if (r.success) {
                            await load("files", { driveId, itemId: folders.at(-1)?.id });
                            setMessage(tr("Lastet opp: ", "Uploaded: ") + r.name);
                          }
                        })
                      }
                    >
                      <Upload size={14} />
                      {tr("Last opp fil", "Upload file")}
                    </Button>
                  </div>
                )}
                <ul className="divide-y divide-border/40">
                  {items.map((item) => (
                    <li key={item.id}>
                      <button
                        disabled={busy}
                        className="flex items-center gap-3 w-full text-left py-3 hover:text-primary"
                        onClick={() => void run(() => openItem(item))}
                      >
                        {kind !== "files" || item.folder ? (
                          <FolderOpen size={17} />
                        ) : (
                          <Download size={17} />
                        )}
                        <span className="text-sm flex-1">{item.name || item.id}</span>
                        {item.size !== undefined && !item.folder && (
                          <span className="text-xs text-muted-foreground">
                            {(item.size / 1024 ** 2).toFixed(1)} MB
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="border-t border-border/40 pt-4 space-y-3">
              <h2 className="font-medium text-sm">
                {tr("Synkroniserte mapper", "Synced folders")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {tr(
                  "Du kan også bruke mapper som allerede er synkronisert til PC-en, uten egen API-tilkobling. Velg dem i fil- og lagrevinduene.",
                  "You can also use folders already synced to your PC without an API connection. Choose them in open and save dialogs."
                )}
              </p>
              {localFolders.map((folder) => (
                <p className="text-xs break-all" key={folder.path}>
                  {folder.name}: {folder.path}
                </p>
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  void run(async () => {
                    const r = await api.openLocalFolder();
                    if (r.error) throw Error(r.error);
                  })
                }
              >
                {tr("Velg og åpne mappe", "Choose and open folder")}
              </Button>
            </div>
          </>
        )}
        {next && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(() =>
                load(kind, { next, siteId, driveId, itemId: folders.at(-1)?.id }, true)
              )
            }
          >
            {tr("Vis flere", "Show more")}
          </Button>
        )}
        {(tab === "calendar" || tab === "files") &&
          status?.connected &&
          !busy &&
          items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {tr("Ingen elementer i denne visningen.", "No items in this view.")}
            </p>
          )}
        <p className="text-sm break-words" role="status">
          {busy ? tr("Arbeider …", "Working …") : message}
        </p>
      </section>
    </div>
  );
}
