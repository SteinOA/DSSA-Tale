import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import DssaCloudMark from "./DssaCloudMark";
import { FolderOpen, FileAudio } from "../icons";
import type { DssaResult, GoogleDriveItem, GoogleDriveStatus } from "../../types/dssa";
import { isSupportedUploadFile } from "../../utils/uploadAudioFormats";

export default function DssaGoogleDrive({ onImport }: { onImport?: (file: DssaResult) => void }) {
  const { t } = useTranslation();
  const tr = (key: string) => String(t("dssaCloud." + key));
  const [status, setStatus] = useState<GoogleDriveStatus | null>(null),
    [items, setItems] = useState<GoogleDriveItem[]>([]),
    [trail, setTrail] = useState<Array<{ id: string; name: string }>>([]),
    [folder, setFolder] = useState("root"),
    [link, setLink] = useState(""),
    [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const live = useRef(true);
  const api = window.dssaAPI;
  const load = useCallback(
    async (id: string, pageToken?: string) => {
      const r = await api.googleDriveList({ folder: id, pageToken });
      if (r.error) throw Error(r.error);
      if (!live.current) return;
      setFolder(id);
      setItems((old) => (pageToken ? [...old, ...r.items] : r.items));
      setNext(r.next);
    },
    [api]
  );
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await action();
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (live.current) setBusy(false);
    }
  }, []);
  const refresh = useCallback(async () => {
    const r = await api.googleDriveStatus();
    if (r.error) throw Error(r.error);
    if (!live.current) return;
    setStatus(r);
    if (r.connected) {
      await load(r.folder.id);
      setTrail(r.folder.id === "root" ? [] : [r.folder]);
    }
  }, [api, load]);
  useEffect(() => {
    live.current = true;
    void run(refresh);
    return () => {
      live.current = false;
    };
  }, [run, refresh]);
  return (
    <section
      data-brand="google"
      data-provider-area
      className="dssa-provider-card space-y-4 rounded-xl border p-4"
    >
      <h3 className="flex items-center gap-2 font-semibold">
        <DssaCloudMark source="google" />
        {tr("googleTitle")}
      </h3>
      <p className="text-sm text-muted-foreground">{tr("intro")}</p>
      {status?.connected ? (
        <>
          <p className="break-all text-sm">
            {status.user} · {tr("pinned")}: {status.folder.name}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy}
              data-brand="google"
              onClick={() => void run(() => load(folder))}
            >
              {tr("refresh")}
            </Button>
            <Button
              disabled={busy}
              data-brand="google"
              onClick={() =>
                void run(async () => {
                  await load("root");
                  setTrail([]);
                })
              }
            >
              {tr("root")}
            </Button>
            <Button
              disabled={busy || !trail.length}
              data-brand="google"
              onClick={() =>
                void run(async () => {
                  const previous = trail.slice(0, -1);
                  await load(previous.at(-1)?.id || "root");
                  setTrail(previous);
                })
              }
            >
              {tr("back")}
            </Button>
            <Button
              disabled={busy}
              data-brand="google"
              onClick={() =>
                void run(async () => {
                  const r = await api.googleDrivePin(folder);
                  if (r.error) throw Error(r.error);
                  setStatus(r);
                  setMessage(tr("pinSaved"));
                })
              }
            >
              {tr("pin")}
            </Button>
            <Button
              disabled={busy}
              data-brand="google"
              onClick={() =>
                void run(async () => {
                  const r = await api.googleDriveUpload(folder);
                  if (r.error) throw Error(r.error);
                  if (r.success) {
                    setMessage(tr("uploaded") + ": " + r.name);
                    await load(folder);
                  }
                })
              }
            >
              {tr("upload")}
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                void run(async () => {
                  const r = await api.googleDriveDisconnect();
                  if (r.error) throw Error(r.error);
                  setStatus(r);
                  setItems([]);
                })
              }
            >
              {tr("disconnect")}
            </Button>
          </div>
          <label className="block text-sm">
            {tr("folderLink")}
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="mt-2 w-full rounded-md border bg-background p-2"
              placeholder="https://drive.google.com/drive/folders/…"
            />
          </label>
          <Button
            disabled={busy || !link.trim()}
            data-brand="google"
            onClick={() =>
              void run(async () => {
                const r = await api.googleDrivePin(link.trim());
                if (r.error) throw Error(r.error);
                setStatus(r);
                await load(r.folder.id);
                setTrail([r.folder]);
                setLink("");
              })
            }
          >
            {tr("openFolder")}
          </Button>
          <p className="text-sm">
            {tr("current")}: {trail.map((i) => i.name).join(" / ") || tr("root")}
          </p>
          <div
            className="max-h-72 overflow-auto rounded-lg border divide-y"
            aria-label={tr("files")}
          >
            {!items.length && <p className="p-3 text-sm">{tr("empty")}</p>}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={
                  busy || (!item.folder && (!onImport || !isSupportedUploadFile(item.name)))
                }
                className="flex w-full items-center gap-3 bg-background px-3 py-3 text-left text-sm hover:bg-accent disabled:opacity-60"
                onClick={() =>
                  void run(async () => {
                    if (item.folder) {
                      await load(item.id);
                      setTrail((old) => [...old, { id: item.id, name: item.name }]);
                    } else {
                      const r = await api.googleDriveDownload(item.id);
                      if (!live.current) {
                        if (r.filePath) void window.electronAPI.deleteTempFile(r.filePath);
                        return;
                      }
                      if (r.error) throw Error(r.error);
                      if (r.success) onImport?.(r);
                    }
                  })
                }
              >
                {item.folder ? <FolderOpen size={18} /> : <FileAudio size={18} />}
                <span className="min-w-0 flex-1 break-all">{item.name}</span>
              </button>
            ))}
          </div>
          {next && (
            <Button disabled={busy} onClick={() => void run(() => load(folder, next))}>
              {tr("more")}
            </Button>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <Button
            disabled={busy || !status?.configured}
            data-brand="google"
            onClick={() =>
              void run(async () => {
                const r = await api.googleDriveConnect();
                if (r.error) throw Error(r.error);
                await refresh();
              })
            }
          >
            {tr("connect")}
          </Button>
          {status && !status.configured && (
            <p role="status" className="text-sm text-muted-foreground">
              {tr("setupMissing")}
            </p>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">{tr("advanced")}</summary>
            <Button
              className="mt-3"
              variant="outline"
              disabled={busy}
              data-brand="google"
              onClick={() =>
                void run(async () => {
                  const r = await api.googleDriveClient();
                  if (r.error) throw Error(r.error);
                  await refresh();
                })
              }
            >
              {tr("client")}
            </Button>
          </details>
        </div>
      )}
      {busy && (
        <p role="status" className="text-sm">
          {tr("working")}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
