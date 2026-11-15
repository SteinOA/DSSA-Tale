import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HardwareProfile } from "../../types/dssa";
import { Button } from "../ui/button";

export default function DssaHardwareSettings() {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<HardwareProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = async (refresh = false) => {
    setBusy(true);
    try {
      const next = await window.dssaAPI.hardwareProfile(refresh);
      if (!next.policy || next.error) throw Error();
      setProfile(next);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const gb = (bytes: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(bytes / 1024 ** 3) +
    " GiB";
  return (
    <section className="space-y-4 rounded-xl border border-border p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">{t("dssa.hardwareTitle")}</h3>
        <Button disabled={busy} onClick={() => void load(true)}>
          {t("dssa.hardwareRefresh")}
        </Button>
      </div>
      {failed && <p role="status">{t("dssa.hardwareUnknown")}</p>}
      {profile && (
        <>
          <p>
            {profile.cpu.vendor} · {profile.cpu.model} · {profile.cpu.logicalCpus}{" "}
            {t("dssa.hardwareThreads")}
          </p>
          <p>
            {t("dssa.hardwareRam", {
              total: gb(profile.policy.totalBytes),
              available: gb(profile.policy.availableBytes),
              budget: gb(profile.policy.budgetBytes),
            })}
          </p>
          <ul className="space-y-2">
            {profile.adapters
              .filter((g) => !g.software)
              .map((gpu, index) => (
                <li key={index}>
                  {gpu.vendor} · {gpu.name} ·{" "}
                  {t("dssa.hardwareVram", {
                    dedicated: gb(gpu.dedicatedBytes),
                    shared: gb(gpu.sharedBytes),
                  })}
                </li>
              ))}
          </ul>
          {!profile.adapters.some((g) => !g.software) && <p>{t("dssa.hardwareUnknown")}</p>}
          <p>
            {t("dssa.hardwarePolicy", {
              threads: profile.policy.cpuThreads,
              seconds: profile.policy.alignmentWindowSeconds,
            })}
          </p>
          <p>
            {t("dssa.hardwareBackend", {
              backend: profile.recommendations.suggestedBackend.toUpperCase(),
            })}
          </p>
          <h4 className="font-semibold">{t("dssa.hardwareSpeech")}</h4>
          <p>
            {profile.recommendations.speech.recommended === "nb-large-full"
              ? "NB-Whisper Large"
              : "NB-Whisper Large Q4"}{" "}
            · {t("dssa.hardwareEstimate")}
          </p>
          {!profile.recommendations.speech.quantizedFits && (
            <p className="text-amber-700 dark:text-amber-300">{t("dssa.hardwareLowRam")}</p>
          )}
          <h4 className="font-semibold">{t("dssa.hardwareCleanup")}</h4>
          <ul className="space-y-3">
            {profile.recommendations.languageModels.map((model) => (
              <li key={model.id}>
                <strong>{model.name}</strong> · {gb(model.sizeBytes)} ·{" "}
                {t("dssa.hardwareModelRam", { ram: gb(model.estimatedRamBytes) })}
                <p>
                  {t(
                    !model.fitsRam
                      ? "dssa.hardwareLowRam"
                      : model.fitsGpu
                        ? "dssa.hardwareGpuFit"
                        : "dssa.hardwareCpuFit"
                  )}
                  {profile.recommendations.recommendedLanguageModel === model.id
                    ? ` · ${t("dssa.hardwareCandidate")}`
                    : ""}
                </p>
                {model.cleanupCheck && (
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    {t("dssa.hardwareCleanupTest", {
                      cases: model.cleanupCheck.cases,
                      rejected: model.cleanupCheck.rejected,
                    })}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">{t("dssa.hardwareLanguageCaution")}</p>
          <p className="text-sm text-muted-foreground">{t("dssa.hardwareUnchanged")}</p>
        </>
      )}
    </section>
  );
}
