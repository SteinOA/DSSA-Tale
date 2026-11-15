import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import type { ImportJob } from "../../types/dssa";
export default function DssaImportRecovery({
  disabled,
  onResume,
  refreshKey,
}: {
  disabled: boolean;
  onResume: (job: ImportJob) => void;
  refreshKey: string;
}) {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<ImportJob[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void window.dssaAPI?.importJobs?.().then((items) => {
      if (live && Array.isArray(items)) setJobs(items);
    });
    return () => {
      live = false;
    };
  }, [refreshKey]);
  const act = async (job: ImportJob, locate = false) => {
    setBusy(true);
    setError("");
    try {
      const result = await (locate
        ? window.dssaAPI.importLocate(job.id)
        : window.dssaAPI.importResume(job.id));
      if (result.error) throw Error(result.error);
      if (!result.canceled) onResume(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (!jobs.length && !error) return null;
  return (
    <section className="mb-5 rounded-xl border border-primary/30 p-4">
      <h3 className="font-semibold">{t("dssa.recoveryTitle")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("dssa.recoveryHint")}</p>
      {jobs.map((job) => (
        <div key={job.id} className="mt-4 flex flex-wrap items-center gap-3">
          <span className="min-w-0 flex-1 break-all">
            {job.name} · {job.completedStages.length}{" "}
            {t(job.completedStages.length === 1 ? "dssa.recoveryStage" : "dssa.recoveryStages")}
          </span>
          <Button
            disabled={disabled || busy || job.state === "working"}
            onClick={() => void act(job)}
          >
            {t("dssa.recoveryResume")}
          </Button>
          <Button
            disabled={disabled || busy || job.state === "working"}
            onClick={() => void act(job, true)}
          >
            {t("dssa.recoveryLocate")}
          </Button>
          <Button
            disabled={disabled || busy || job.state === "working"}
            onClick={async () => {
              const r = await window.dssaAPI.importDismiss(job.id);
              if (r.success) setJobs((items) => items.filter((j) => j.id !== job.id));
              else setError(r.error || "");
            }}
          >
            {t("dssa.recoveryHide")}
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="mt-3 text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
