import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import teamsIcon from "../../assets/icons/apps/teams.svg";

export default function DssaTeamsRecordingChoices({
  onStartMeeting,
}: {
  onStartMeeting?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch {
      setError(t("dssaTeams.failed"));
    } finally {
      setBusy(false);
    }
  };
  const openMeeting = async () => {
    let url: URL;
    try {
      url = new URL(link.trim());
    } catch {
      setError(t("dssaTeams.invalidLink"));
      return;
    }
    if (
      url.protocol !== "https:" ||
      !["teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft"].includes(url.hostname) ||
      url.username ||
      url.password
    ) {
      setError(t("dssaTeams.invalidLink"));
      return;
    }
    const result = await window.electronAPI.openExternal(url.href);
    if (!result?.success) throw Error("open failed");
  };
  return (
    <div className="grid gap-4 max-w-3xl">
      <section
        data-brand="teams"
        data-provider-area
        className="dssa-provider-card rounded-xl border border-border p-4 space-y-3"
      >
        <h2 className="flex items-center gap-3 font-semibold">
          <img src={teamsIcon} alt="" className="size-7 shrink-0" />
          {t("dssaTeams.nativeTitle")}
        </h2>
        <p className="text-sm leading-relaxed">{t("dssaTeams.nativeText")}</p>
        <label className="grid gap-2 text-sm">
          {t("dssaTeams.meetingLink")}
          <input
            type="url"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://teams.microsoft.com/…"
            className="rounded-md border border-border bg-background px-3 py-2"
          />
        </label>
        <Button disabled={busy || !link.trim()} onClick={() => void run(openMeeting)}>
          {t("dssaTeams.openMeeting")}
        </Button>
        <p className="text-sm text-muted-foreground">{t("dssaTeams.nativeSteps")}</p>
        <p className="text-xs text-muted-foreground">{t("dssaTeams.nativeLimits")}</p>
        <p className="text-sm">{t("dssaTeams.after")}</p>
        <Button
          variant="outline"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("dssa-navigate", { detail: "upload" }))
          }
        >
          {t("dssaTeams.import")}
        </Button>
      </section>
      <section className="rounded-xl border border-border p-4 space-y-3">
        <h2 className="font-semibold">{t("dssaTeams.localTitle")}</h2>
        <p className="text-sm leading-relaxed">{t("dssaTeams.localText")}</p>
        <Button
          disabled={busy || !onStartMeeting}
          onClick={() =>
            void run(async () => {
              await onStartMeeting?.();
            })
          }
        >
          {t("dssaTeams.startLocal")}
        </Button>
      </section>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
