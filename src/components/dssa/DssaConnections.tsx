import DssaSharePointMark from "./DssaSharePointMark";
import DssaCloudMark from "./DssaCloudMark";
import DssaCalendarConnections from "./DssaCalendarConnections";
import DssaGoogleDrive from "./DssaGoogleDrive";
import DssaHelpButton from "./DssaHelpButton";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import type { CloudConnection, CloudSource, ConnectionResult } from "../../types/dssa";
import DssaIntegrations from "./DssaIntegrations";

export default function DssaConnections() {
  const { t } = useTranslation();
  const [items, setItems] = useState<CloudConnection[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const api = window.dssaAPI;
  const tr = (key: string) => String(t("dssaConnections." + key));
  const run = async (action: () => Promise<ConnectionResult>) => {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const result = await action();
      if (result.error) throw Error(result.error);
      if (result.connections) setItems(result.connections);
      else if (!result.canceled) {
        const refreshed = await api.connections();
        if (refreshed.error) throw Error(refreshed.error);
        setItems(refreshed.connections || []);
        if (result.mode) setMessage(tr(result.mode === "setup" ? "setupOpened" : "clientOpened"));
      }
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void api
        .connections()
        .then((result) => {
          if (!active) return;
          if (result.error) {
            setFailed(true);
            setMessage(result.error);
          } else setItems(result.connections || []);
        })
        .catch(() => {
          if (active) {
            setFailed(true);
            setMessage(String(t("dssaConnections.loadFailed")));
          }
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, [api, t]);
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">{tr("title")}</h2>
          <DssaHelpButton topic="connections" />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{tr("intro")}</p>
      </div>
      {message && (
        <p role={failed ? "alert" : "status"} className="text-sm">
          {message}
        </p>
      )}
      <DssaCalendarConnections compact />
      <DssaGoogleDrive />
      <div className="rounded-xl border border-border">
        <DssaIntegrations connectionOnly />
      </div>
      {(["google", "microsoft", "apple"] as CloudSource[]).map((source) => {
        const item = items.find((value) => value.source === source);
        return (
          <section
            key={source}
            data-brand={source}
            data-brand-accent={source === "microsoft" ? "sharepoint" : undefined}
            data-provider-area
            className="dssa-provider-card space-y-3 rounded-lg border border-border p-4"
            aria-label={tr(
              source === "google"
                ? "googleLocal"
                : source === "microsoft"
                  ? "microsoftLocal"
                  : source
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-medium">
                <DssaCloudMark source={source} />
                {source === "microsoft" && <DssaSharePointMark />}
                {tr(
                  source === "google"
                    ? "googleLocal"
                    : source === "microsoft"
                      ? "microsoftLocal"
                      : source
                )}
              </h3>
              <span className="text-xs text-muted-foreground">
                {tr(item?.path ? (item.available ? "available" : "unavailable") : "notSelected")}
              </span>
            </div>
            {item?.path && <p className="break-all text-sm">{item.path}</p>}
            {!item?.path && !!item?.candidates.length && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{tr("detected")}</p>
                {item.candidates.map((folder) => (
                  <div key={folder} className="flex flex-wrap items-center gap-4">
                    <span className="min-w-0 flex-1 break-all text-xs">{folder}</span>
                    <Button
                      data-brand={source}
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(() => api.useDetectedConnectionFolder(source, folder))
                      }
                    >
                      {tr("useDetected")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-4">
              <Button
                disabled={busy}
                data-brand={source}
                onClick={() => void run(() => api.chooseConnectionFolder(source))}
              >
                {tr("choose")}
              </Button>
              <Button
                variant="outline"
                disabled={busy || !item?.available}
                data-brand={source}
                onClick={() => void run(() => api.openConnectionFolder(source))}
              >
                {tr("open")}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                data-brand={source}
                onClick={() => void run(() => api.openConnectionLogin(source))}
              >
                {tr("login")}
              </Button>
              {!!item?.path && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void run(() => api.removeConnectionFolder(source))}
                >
                  {tr("remove")}
                </Button>
              )}
            </div>
          </section>
        );
      })}
      <p className="text-xs text-muted-foreground">{tr("accessNote")}</p>
      <Button variant="outline" disabled={busy} onClick={() => void run(() => api.connections())}>
        {tr("refresh")}
      </Button>
    </div>
  );
}
