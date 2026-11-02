import React from "react";
import { cn } from "../lib/utils";

// Both completion warnings sit under the transcript preview and share its
// column, so they share one recipe; only the tone differs.
const COMPLETION_WARNING = "mt-3 max-w-md text-center text-[13px] leading-relaxed";

interface UploadModelSettingsButtonProps {
  label: string;
  actionLabel: string;
  onOpenSettings?: (section: string) => void;
  className?: string;
}

export function UploadModelSettingsButton({
  label,
  actionLabel,
  onOpenSettings,
  className,
}: UploadModelSettingsButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onOpenSettings?.("uploadTranscription")}
      // WCAG 2.5.3: keep the visible label inside the accessible name, so the
      // model stays announced and voice control can still target the button.
      aria-label={`${label}, ${actionLabel}`}
      title={actionLabel}
      disabled={!onOpenSettings}
      className={cn(
        "inline-flex items-center justify-center min-h-9 max-w-full px-4 py-2 leading-snug whitespace-normal rounded-md transition-colors",
        "hover:text-foreground hover:decoration-foreground/50 active:text-foreground/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1",
        "disabled:pointer-events-none disabled:no-underline disabled:opacity-50",
        className
      )}
    >
      {label}
    </button>
  );
}

interface UploadCompleteWarningsProps {
  alignmentWarning?: boolean;
  partialWarning: { failed: number; total: number } | null;
  diarizationWarning: boolean;
  checkpointWarning?: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function UploadCompleteWarnings({
  alignmentWarning,
  partialWarning,
  diarizationWarning,
  checkpointWarning,
  t,
}: UploadCompleteWarningsProps): React.JSX.Element | null {
  if (!partialWarning && !diarizationWarning && !checkpointWarning && !alignmentWarning)
    return null;

  return (
    <>
      {alignmentWarning && (
        <p className={cn(COMPLETION_WARNING, "text-warning")} role="status">
          {t("dssa.alignmentWarning")}
        </p>
      )}
      {partialWarning && (
        <p className={cn(COMPLETION_WARNING, "text-destructive")}>
          {t("notes.upload.partialWarningCount", {
            failed: partialWarning.failed,
            total: partialWarning.total,
          })}
        </p>
      )}
      {diarizationWarning && (
        <p className={cn(COMPLETION_WARNING, "text-warning")} role="status" aria-live="polite">
          {t("notes.upload.diarizationWarning")}
        </p>
      )}
      {checkpointWarning && (
        <p className={cn(COMPLETION_WARNING, "text-warning")} role="status">
          {t("dssa.importCheckpointWarning")}
        </p>
      )}
    </>
  );
}
