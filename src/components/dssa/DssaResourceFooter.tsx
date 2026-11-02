import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type Usage = Awaited<ReturnType<Window["dssaAPI"]["resourceUsage"]>>;
export default function DssaResourceFooter() {
  const { t, i18n } = useTranslation();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [visible, setVisible] = useState(
    () => localStorage.getItem("dssa-resource-footer-visible") !== "false"
  );
  useEffect(() => {
    if (!visible) return;
    let active = true;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const sample = await window.dssaAPI.resourceUsage();
        if (active && typeof sample.ramTotalBytes === "number") setUsage(sample);
      } catch {}
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [visible]);
  const gb = (bytes: number) =>
    (bytes / 1073741824).toLocaleString(i18n.language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  return (
    <footer
      className="flex shrink-0 flex-wrap items-center justify-end gap-x-5 gap-y-1 border-t border-border/40 px-4 py-1 text-[11px] tabular-nums text-muted-foreground"
      aria-label={t("dssa.resourcesLabel")}
    >
      <button
        type="button"
        className="inline-flex h-7 items-center rounded-md px-3 text-[11px]"
        aria-expanded={visible}
        onClick={() => {
          const next = !visible;
          setVisible(next);
          localStorage.setItem("dssa-resource-footer-visible", String(next));
        }}
      >
        {t(visible ? "dssa.hideResources" : "dssa.showResources")}
      </button>
      {visible && (
        <>
          <span title={t("dssa.appCpuHint")}>
            {t("dssa.appCpu")}:{" "}
            {usage?.app?.cpuPercent != null
              ? `${usage.app.cpuPercent.toLocaleString(i18n.language, { maximumFractionDigits: 1 })} % / 100 %`
              : "—"}
          </span>
          <span title={t("dssa.appRamHint")}>
            {t("dssa.appRam")}:{" "}
            {usage?.app && usage.ramTotalBytes > 0
              ? `${gb(usage.app.ramUsedBytes)} / ${gb(usage.ramTotalBytes)} GB (${((usage.app.ramUsedBytes / usage.ramTotalBytes) * 100).toLocaleString(i18n.language, { maximumFractionDigits: 1 })} %)`
              : "—"}
          </span>
          <span title={t("dssa.appGpuHint")}>
            {t("dssa.appGpu")}:{" "}
            {usage?.app?.gpu?.percent != null ? `${Math.round(usage.app.gpu.percent)} %` : "—"}
          </span>
          <span title={t("dssa.appGpuMemoryHint")}>
            {t("dssa.appGpuMemory")}:{" "}
            {usage?.app?.gpu?.dedicatedBytes != null
              ? `${gb(usage.app.gpu.dedicatedBytes)}${usage.gpu ? ` / ${gb(usage.gpu.totalBytes)}` : ""} GB`
              : "—"}
          </span>
        </>
      )}
    </footer>
  );
}
