import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import googleCalendarIcon from "../../assets/icons/google-calendar.svg";
import appleCalendarIcon from "../../assets/icons/apple-calendar.svg";
import { getMeetingJoinUrl } from "../../helpers/meetingJoinUrl";
import { useSettingsStore } from "../../stores/settingsStore";

type GoogleStatus = { connected: boolean; configured?: boolean; accounts: { email: string }[] };
export default function DssaCalendarConnections({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [events, setEvents] = useState<
    {
      id: string;
      summary: string;
      start_time: string;
      hangout_link?: string;
      conference_data?: string;
    }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [callLink, setCallLink] = useState("");
  const [callType, setCallType] = useState<"google" | "apple">("google");
  const api = window.electronAPI;
  const primaryOnly = useSettingsStore((state) => state.gcalPrimaryOnly);
  const setPrimaryOnly = useSettingsStore((state) => state.setGcalPrimaryOnly);
  const refresh = useCallback(async () => {
    const current = await api.gcalGetConnectionStatus?.();
    if (!current) throw Error("calendar unavailable");
    setStatus(current);
    useSettingsStore.getState().setGcalAccounts(current.accounts || []);
    if (current.connected && !compact) {
      const result = await api.gcalGetUpcomingEvents?.(14 * 24 * 60);
      if (!result?.success) throw Error("events unavailable");
      setEvents((result.events || []).filter((event) => event.provider === "google"));
    } else setEvents([]);
  }, [api, compact]);
  useEffect(() => {
    let active = true;
    void api
      .gcalGetConnectionStatus?.()
      .then(async (current) => {
        if (!active || !current) return;
        setStatus(current);
        useSettingsStore.getState().setGcalAccounts(current.accounts || []);
        if (current.connected && !compact) {
          const result = await api.gcalGetUpcomingEvents?.(14 * 24 * 60);
          if (active && result?.success)
            setEvents((result.events || []).filter((event) => event.provider === "google"));
        }
      })
      .catch(() => {
        if (active) setMessage(t("dssaCalendars.failed"));
      });
    const unsubscribe = api.onGcalConnectionChanged?.(() => {
      if (active) void refresh().catch(() => setMessage(t("dssaCalendars.failed")));
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [api, compact, refresh, t]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch {
      setMessage(t("dssaCalendars.failed"));
    } finally {
      setBusy(false);
    }
  };
  const openUrl = async (url: string) => {
    const result = await api.openExternal(url);
    if (!result?.success) throw Error("open failed");
  };
  const openCall = async (link: string, type?: "google" | "apple") => {
    let url: URL;
    try {
      url = new URL(link.trim());
    } catch {
      setMessage(t("dssaCalendars.invalidLink"));
      return;
    }
    const allowed =
      type === "google"
        ? ["meet.google.com"]
        : type === "apple"
          ? ["facetime.apple.com"]
          : [
              "meet.google.com",
              "facetime.apple.com",
              "teams.microsoft.com",
              "teams.live.com",
              "teams.cloud.microsoft",
            ];
    if (
      url.protocol !== "https:" ||
      !allowed.includes(url.hostname) ||
      url.username ||
      url.password
    ) {
      setMessage(t("dssaCalendars.invalidLink"));
      return;
    }
    await openUrl(url.href);
  };
  return (
    <div className="space-y-4 max-w-3xl">
      <h2 className="text-lg font-semibold">{t("dssaCalendars.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("dssaCalendars.remembered")}</p>
      <section
        data-brand="google"
        data-provider-area
        className="dssa-provider-card rounded-xl border border-border p-4 space-y-3"
      >
        <h3 className="flex items-center gap-2 font-semibold">
          <img src={googleCalendarIcon} className="size-6 shrink-0" alt="" />
          Google Kalender / Google Meet
        </h3>
        <p className="text-sm">
          {status
            ? t(
                status.connected
                  ? "dssaCalendars.connected"
                  : status.configured
                    ? "dssaCalendars.notConnected"
                    : "dssaCalendars.setupNeeded"
              )
            : t("dssaCalendars.loading")}
        </p>
        {status?.connected && (
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={!primaryOnly}
              disabled={busy}
              onChange={(event) => {
                const next = !event.target.checked;
                void run(async () => {
                  const result = await api.gcalSetPrimaryOnly?.(next);
                  if (!result?.success) throw Error("selection failed");
                  setPrimaryOnly(next);
                  await refresh();
                });
              }}
            />
            {t("dssaCalendars.allCalendars")}
          </label>
        )}
        {status?.accounts?.map((account) => (
          <div key={account.email} className="flex flex-wrap items-center gap-4 text-sm">
            <span>{account.email}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api.gcalDisconnect?.(account.email);
                  if (!result?.success) throw Error("disconnect failed");
                  await refresh();
                })
              }
            >
              {t("dssaCalendars.disconnect")}
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-4">
          <Button
            disabled={busy || !status?.configured}
            onClick={() =>
              void run(async () => {
                const result = await api.gcalStartOAuth?.();
                if (!result?.success) throw Error("oauth failed");
                await refresh();
              })
            }
          >
            {t("dssaCalendars.connectGoogle")}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run(() => openUrl("https://calendar.google.com/"))}
          >
            {t("dssaCalendars.openGoogle")}
          </Button>
          {!compact && (
            <Button
              variant="outline"
              disabled={busy || !status?.connected}
              onClick={() =>
                void run(async () => {
                  const result = await api.gcalSyncEvents?.();
                  if (!result?.success) throw Error("sync failed");
                  await refresh();
                })
              }
            >
              {t("dssaCalendars.refresh")}
            </Button>
          )}
        </div>
        {!status?.configured && (
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              {t("dssaCalendars.setupTitle")}
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">{t("dssaCalendars.setupText")}</p>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api.gcalImportClientCredentials?.();
                  if (result?.canceled) return;
                  if (!result?.success) throw Error("import failed");
                  await refresh();
                })
              }
            >
              {t("dssaCalendars.importConfig")}
            </Button>
          </details>
        )}
        {!compact && status?.connected && (
          <ul className="space-y-3">
            {events.map((event) => {
              const link = getMeetingJoinUrl(event);
              return (
                <li key={event.id} className="rounded-md border border-border p-3 space-y-2">
                  <p className="font-medium">{event.summary || t("dssaCalendars.untitled")}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(event.start_time).toLocaleString(i18n.language)}
                  </p>
                  {link && (
                    <Button
                      size="sm"
                      variant="outline"
                      data-brand={
                        link.includes("teams.")
                          ? "teams"
                          : link.includes("facetime.apple.com")
                            ? "facetime"
                            : "google"
                      }
                      onClick={() => void run(() => openCall(link))}
                    >
                      {t("dssaCalendars.join")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="rounded-xl border border-border p-4 space-y-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <img src={appleCalendarIcon} className="size-6 shrink-0" alt="" />
          Apple Kalender / FaceTime
        </h3>
        <p className="text-sm">{t("dssaCalendars.appleLimit")}</p>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void run(() => openUrl("https://www.icloud.com/calendar/"))}
        >
          {t("dssaCalendars.openApple")}
        </Button>
      </section>
      {!compact && (
        <section className="rounded-xl border border-border p-4 space-y-3">
          <h3 className="font-semibold">{t("dssaCalendars.callTitle")}</h3>
          <label className="grid gap-2 text-sm">
            {t("dssaCalendars.callProvider")}
            <select
              className="rounded-md border border-border bg-background px-3 py-2"
              value={callType}
              onChange={(event) => setCallType(event.target.value as "google" | "apple")}
            >
              <option value="google">Google Meet</option>
              <option value="apple">FaceTime</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            {t("dssaCalendars.callLink")}
            <input
              type="url"
              value={callLink}
              onChange={(event) => setCallLink(event.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2"
              placeholder={
                callType === "google" ? "https://meet.google.com/…" : "https://facetime.apple.com/…"
              }
            />
          </label>
          <Button
            disabled={busy || !callLink.trim()}
            onClick={() => void run(() => openCall(callLink, callType))}
          >
            {t("dssaCalendars.join")}
          </Button>
          <p className="text-sm text-muted-foreground">
            {t(
              callType === "google" ? "dssaCalendars.meetRecording" : "dssaCalendars.facetimeLimit"
            )}
          </p>
        </section>
      )}
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
