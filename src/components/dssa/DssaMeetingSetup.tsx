import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import DssaInstalledModels from "./DssaInstalledModels";
import type { MeetingSetupStatus } from "../../types/dssa";
export default function DssaMeetingSetup() {
  const { t } = useTranslation();
  const tr = useCallback((key: string) => String(t("dssaSetup." + key)), [t]);
  const [status, setStatus] = useState<MeetingSetupStatus | null>(null),
    [busy, setBusy] = useState(false),
    [token, setToken] = useState(""),
    [error, setError] = useState("");
  const api = window.dssaAPI;
  useEffect(() => {
    let live = true;
    const refresh = () => {
      void api
        .meetingSetupStatus()
        .then((r) => {
          if (live) {
            if (r.error) setError(r.error);
            setStatus(r);
          }
        })
        .catch(() => {
          if (live) setError(tr("statusFailed"));
        });
    };
    refresh();
    const timer = setInterval(refresh, 1500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [api, tr]);
  const run = async (action: () => Promise<{ error?: string }>) => {
    setBusy(true);
    setError("");
    try {
      const r = await action();
      if (r.error) throw Error(r.error);
      setStatus(await api.meetingSetupStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const disabled = busy || !!status?.busy;
  return (
    <section className="space-y-4">
      <DssaInstalledModels status={status} />
      <details className="rounded-xl border border-border p-4">
        <summary className="cursor-pointer font-semibold">
          Valgfritt: installer Community-1 for stemmeutskillelse
        </summary>
        <div className="mt-4 space-y-4">
          <p className="text-sm">
            Dette oppsettet gjelder bare Community-1. Det endrer ikke dikteringsmodell, språk eller
            Silero VAD. Modell og språk velges under Tale til tekst eller Lydopplasting.
          </p>
          <h3 className="font-semibold">{tr("title")}</h3>
          <p className="text-sm text-muted-foreground">{tr("intro")}</p>
          <details className="rounded-lg border border-border bg-muted/30 p-3">
            <summary className="cursor-pointer text-sm font-semibold">
              {tr("communityGuideTitle")}
            </summary>
            <div className="mt-3 space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>{tr("communityOptional")}</p>
              <div>
                <h4 className="font-medium text-foreground">{tr("communityStepsTitle")}</h4>
                <ol className="mt-2 list-decimal space-y-2 pl-5">
                  <li>{tr("communityStepTools")}</li>
                  <li>{tr("communityStepAccess")}</li>
                  <li>{tr("communityStepModel")}</li>
                  <li>{tr("communityStepUse")}</li>
                </ol>
              </div>
              <div>
                <h4 className="font-medium text-foreground">{tr("communityRequirementsTitle")}</h4>
                <ul className="mt-2 list-disc space-y-2 pl-5">
                  <li>{tr("communityDisk")}</li>
                  <li>{tr("communityCpu")}</li>
                  <li>{tr("communityGpu")}</li>
                  <li>{tr("communityNetwork")}</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-foreground">{tr("communityUpdatesTitle")}</h4>
                <p className="mt-2">{tr("communityUpdates")}</p>
              </div>
            </div>
          </details>
          <p className="text-sm">
            {tr("runtime")}: {status?.runtime ? tr("ready") : tr("missing")} · Community-1:{" "}
            {status?.community ? tr("ready") : tr("missing")}
          </p>
          {status?.runtime && (
            <p className="text-sm text-muted-foreground">
              {tr("installedDevice")}:{" "}
              {status.runtimeDevice === "cuda"
                ? "NVIDIA CUDA"
                : status.runtimeDevice === "cpu"
                  ? "CPU"
                  : tr("unknownDevice")}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {!status?.runtime && (
              <Button
                disabled={disabled}
                onClick={() =>
                  void run(() => api.meetingSetupStart({ kind: "runtime", device: "auto" }))
                }
              >
                Klargjør Community-1
              </Button>
            )}
            {!status?.community && (
              <Button
                disabled={disabled || !status?.runtime || !status?.credential}
                onClick={() => void run(() => api.meetingSetupStart({ kind: "community" }))}
              >
                {tr("installCommunity")}
              </Button>
            )}
          </div>
          {status && !status.community && (
            <p className="text-sm" role="status">
              {!status.runtime
                ? "Trykk Klargjør Community-1 først. Det laster ned nødvendige biblioteker i et eget Python-miljø; kompatibel CPU/CUDA velges automatisk."
                : !status.credential
                  ? "For å laste ned Community-1 må du godta modellvilkårene med din egen Hugging Face-konto og legge inn lesetilgangsnøkkelen under Hugging Face-tilgang nedenfor. Derfor er knappen utilgjengelig nå."
                  : "Community-1 er valgfritt. Knappen laster ned modellen, men valget om å bruke den gjøres under Lydopplasting → Skill talere."}
            </p>
          )}
          {status?.busy && (
            <div role="status" className="space-y-2">
              <p>
                {tr("phase_" + status.phase)}
                {["python", "punkt"].includes(status.phase) && status.totalBytes
                  ? ` · ${Math.floor((100 * (status.downloadedBytes || 0)) / status.totalBytes)} %`
                  : ""}
              </p>
              <Button variant="outline" onClick={() => void run(() => api.meetingSetupCancel())}>
                {tr("cancel")}
              </Button>
            </div>
          )}
          {status?.phase === "done" && (
            <p role="status" className="text-sm">
              {tr("done")}
            </p>
          )}
          {status?.phase === "cancelled" && (
            <p role="status" className="text-sm">
              {tr("cancelled")}
            </p>
          )}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">{tr("hfTitle")}</summary>
            <div className="mt-3 space-y-3">
              <p className="text-sm text-muted-foreground">{tr("hfHint")}</p>
              <Button
                data-brand="link"
                onClick={() =>
                  void window.electronAPI.openExternal(
                    "https://huggingface.co/pyannote/speaker-diarization-community-1"
                  )
                }
              >
                {tr("terms")}
              </Button>
              <label className="block text-sm">
                {tr("token")}
                <input
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="mt-2 w-full rounded-md border bg-background p-2"
                />
              </label>
              <div className="flex flex-wrap gap-4">
                <Button
                  disabled={disabled || !status?.runtime || !token.trim()}
                  onClick={() => {
                    const value = token.trim();
                    setToken("");
                    void run(() => api.meetingSetupCredential(value));
                  }}
                >
                  {tr("saveToken")}
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled || !status?.credential}
                  onClick={() => void run(() => api.meetingSetupForget())}
                >
                  {tr("forgetToken")}
                </Button>
              </div>
            </div>
          </details>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
