import { useTranslation } from "react-i18next";
import { Loader2 } from "../icons";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { formatImportClock } from "../../utils/dssaImportTiming";

export default function DssaRecordingHelp({
  isRecording,
  isProcessing,
  isDiarizing,
  noteId,
}: {
  isRecording: boolean;
  isProcessing: boolean;
  isDiarizing: boolean;
  noteId: number;
}) {
  const { t } = useTranslation();
  const progress = useMeetingRecordingStore((state) =>
    isProcessing && state.processingProgress?.noteId === noteId ? state.processingProgress : null
  );
  const busy = isProcessing || isDiarizing;
  return (
    <section
      className="mx-4 my-3 space-y-2 rounded-lg border border-border bg-card p-4 text-sm"
      aria-label={t("dssaRecording.helpTitle")}
    >
      <h3 className="font-semibold">{t("dssaRecording.helpTitle")}</h3>
      <ol className="list-decimal space-y-1 ps-5">
        <li>{t("dssaRecording.stepStart")}</li>
        <li>{t("dssaRecording.stepStop")}</li>
        <li>{t("dssaRecording.stepResult")}</li>
      </ol>
      <p className="text-muted-foreground">{t("dssaRecording.autoStart")}</p>
      <p role="status" aria-live="polite" className="flex items-center gap-2 font-medium">
        {busy && <Loader2 size={16} aria-hidden="true" className="shrink-0 animate-spin" />}
        {t(
          isRecording
            ? "dssaRecording.recording"
            : isProcessing
              ? "dssaRecording.processing"
              : isDiarizing
                ? "dssaRecording.diarizing"
                : "dssaRecording.idle"
        )}
      </p>
      {progress && progress.totalSeconds > 0 && (
        <div className="space-y-2" aria-label={t("dssaRecording.progressTitle")}>
          <progress
            className="h-3 w-full"
            max={progress.totalSeconds}
            value={progress.processedSeconds}
            aria-label={t("dssaRecording.progressTitle")}
          />
          <p>
            {t("dssaRecording.progress", {
              processed: formatImportClock(progress.processedSeconds),
              total: formatImportClock(progress.totalSeconds),
              percent: Math.round((progress.processedSeconds / progress.totalSeconds) * 100),
            })}
          </p>
          <p>
            {t("dssaRecording.remainingAudio", {
              time: formatImportClock(
                Math.max(0, progress.totalSeconds - progress.processedSeconds)
              ),
            })}
          </p>
          {progress.remainingSeconds != null && (
            <p>
              {t("dssaRecording.remainingTime", {
                time: formatImportClock(progress.remainingSeconds),
              })}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t(
              progress.processedSeconds >= progress.totalSeconds
                ? "dssaRecording.textComplete"
                : "dssaRecording.progressHint"
            )}
          </p>
        </div>
      )}
    </section>
  );
}
