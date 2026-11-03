import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./button";
import { Tooltip } from "./tooltip";
import {
  Copy,
  Trash2,
  FileText,
  FolderOpen,
  RotateCcw,
  Loader2,
  AlertCircle,
  ArchiveRestore,
} from "../icons";
import type {
  TranscriptionItem as TranscriptionItemType,
  TranscriptionErrorCode,
} from "../../types/electron";
import { cn } from "../lib/utils";
import { getCachedPlatform } from "../../utils/platform";
import { formatMmSs } from "../../utils/formatDuration";

const platform = getCachedPlatform();

const TRANSCRIPT_TEXT_CLASS =
  "text-base leading-normal wrap-break-word whitespace-pre-wrap text-foreground";

function getShowInFolderKey(): string {
  if (platform === "win32") return "controlPanel.history.showInFolderWindows";
  if (platform === "linux") return "controlPanel.history.showInFolderLinux";
  return "controlPanel.history.showInFolder";
}

interface MenuAction {
  key: string;
  icon: typeof Copy;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

interface TranscriptionItemProps {
  item: TranscriptionItemType;
  onCopy: (text: string) => void;
  onDelete: (id: number) => void;
  onShowAudioInFolder?: (id: number) => void;
  onRetryTranscription?: (id: number, options?: { isRecover?: boolean }) => Promise<void>;
  onOpenSettings?: (section?: string) => void;
}

export default function TranscriptionItem({
  item,
  onCopy,
  onDelete,
  onShowAudioInFolder,
  onRetryTranscription,
  onOpenSettings,
}: TranscriptionItemProps) {
  const { t, i18n } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const timestampSource = item.timestamp.endsWith("Z") ? item.timestamp : `${item.timestamp}Z`;
  const timestampDate = new Date(timestampSource);
  const formattedTime = Number.isNaN(timestampDate.getTime())
    ? ""
    : timestampDate.toLocaleTimeString(i18n.language, {
        hour: "2-digit",
        minute: "2-digit",
      });

  const handleRetry = async () => {
    if (isRetrying || !onRetryTranscription) return;
    setIsRetrying(true);
    try {
      await onRetryTranscription(item.id, { isRecover: item.status === "discarded" });
    } finally {
      setIsRetrying(false);
    }
  };

  const isFailed = item.status === "failed";
  const isDiscarded = item.status === "discarded";
  const isTranscribed = !isFailed && !isDiscarded;
  const discardedDuration =
    item.audio_duration_ms && item.audio_duration_ms > 0
      ? formatMmSs(Math.round(item.audio_duration_ms / 1000))
      : null;
  const rawText = item.raw_text;
  const hasAudio = item.has_audio === 1;
  // A failed row keeps the transcript when only a later step failed.
  const hasKeptText = isFailed && item.text.trim() !== "";

  const errorCode = item.error_code as TranscriptionErrorCode;
  const isConfigError =
    errorCode === "API_KEY_MISSING" ||
    errorCode === "INVALID_KEY" ||
    errorCode === "PROVIDER_AUTH_FAILED" ||
    errorCode === "PROVIDER_ACCESS_DENIED" ||
    errorCode === "PROVIDER_QUOTA_EXHAUSTED" ||
    errorCode === "PROVIDER_MODEL_NOT_FOUND" ||
    errorCode === "PROVIDER_NO_RESPONSE" ||
    errorCode === "MODEL_NOT_AVAILABLE" ||
    errorCode === "CUSTOM_ENDPOINT_INVALID";
  const isLimitError = errorCode === "LIMIT_REACHED";
  const isOfflineError = errorCode === "OFFLINE";

  const retryLabel = t(
    item.route_kind === "translation"
      ? "controlPanel.history.retryTranslationMode"
      : "controlPanel.history.retryTranscription"
  );

  // Every available action stays visible, with labels and wrapping at larger text sizes.
  const candidateActions: (MenuAction | false)[] = [
    isDiscarded &&
      hasAudio && {
        key: "recover",
        icon: ArchiveRestore,
        label: t("controlPanel.history.discarded.recover"),
        onSelect: handleRetry,
      },
    !isDiscarded &&
      hasAudio && { key: "retry", icon: RotateCcw, label: retryLabel, onSelect: handleRetry },
    isTranscribed &&
      rawText !== null && {
        key: "raw",
        icon: FileText,
        label: t("controlPanel.history.viewRawTranscript"),
        onSelect: () => setIsExpanded((expanded) => !expanded),
      },
    hasAudio && {
      key: "folder",
      icon: FolderOpen,
      label: t(getShowInFolderKey()),
      onSelect: () => onShowAudioInFolder?.(item.id),
    },
    {
      key: "delete",
      icon: Trash2,
      label: t("controlPanel.history.deleteItem"),
      onSelect: () => onDelete(item.id),
      destructive: true,
    },
  ];
  const menuActions = candidateActions.filter((action): action is MenuAction => action !== false);

  return (
    <div
      className={cn(
        "group/row px-4 py-3 transition-colors duration-150",
        isFailed
          ? "bg-destructive/5"
          : isDiscarded
            ? "bg-muted/20 opacity-80"
            : "hover:bg-muted/20 dark:hover:bg-white/2",
        // Translation rows get a 2px primary accent; ps-[14px] keeps text aligned with the other rows.
        item.route_kind === "translation" && "border-s-2 border-s-primary/70 ps-[14px]"
      )}
    >
      <span className="text-xs tabular-nums text-muted-foreground">{formattedTime}</span>

      <div className="mt-1.5">
        {isFailed ? (
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-destructive">
                {t(
                  hasKeptText
                    ? "controlPanel.history.editFailedTranscriptKept"
                    : "controlPanel.history.transcriptionFailed"
                )}
              </p>
              {item.error_message && (
                <p className="mt-0.5 text-xs leading-relaxed wrap-break-word text-muted-foreground">
                  {item.error_message}
                </p>
              )}
              {isConfigError && hasKeptText && (
                <p className="mt-1 text-xs text-muted-foreground">
                  <button
                    onClick={() => onOpenSettings?.("dictationAgent")}
                    className="cursor-pointer text-primary hover:underline"
                  >
                    {t("controlPanel.history.failedCtaAiSettings")}
                  </button>
                </p>
              )}
              {isConfigError && !hasKeptText && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {hasAudio ? (
                    <>
                      <button
                        onClick={() => onOpenSettings?.()}
                        className="cursor-pointer text-primary hover:underline"
                      >
                        {t("controlPanel.history.failedCtaSettings")}
                      </button>{" "}
                      {t("controlPanel.history.failedCtaAndRetry")}
                    </>
                  ) : (
                    <button
                      onClick={() => onOpenSettings?.()}
                      className="cursor-pointer text-primary hover:underline"
                    >
                      {t("controlPanel.history.failedCtaSettingsOnly")}
                    </button>
                  )}
                </p>
              )}
              {isLimitError && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("controlPanel.history.failedLimitReached")}
                </p>
              )}
              {isOfflineError && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("controlPanel.history.failedOffline")}
                </p>
              )}
            </div>
          </div>
        ) : isDiscarded ? (
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("controlPanel.history.discarded.badge")}
            </span>
            <span className="truncate text-sm text-muted-foreground">
              {discardedDuration
                ? t("controlPanel.history.discarded.recordingWithDuration", {
                    duration: discardedDuration,
                  })
                : t("controlPanel.history.discarded.recording")}
            </span>
          </div>
        ) : (
          <p dir="auto" className={cn("dssa-content-text", TRANSCRIPT_TEXT_CLASS)}>
            {item.text}
          </p>
        )}
        {hasKeptText && (
          <p dir="auto" className={cn("dssa-content-text mt-2", TRANSCRIPT_TEXT_CLASS)}>
            {item.text}
          </p>
        )}
      </div>

      <div
        className="mt-3 flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t("controlPanel.history.moreActions")}
      >
        {(isTranscribed || hasKeptText) && (
          <Button
            size="sm"
            variant="outline"
            className="h-auto min-h-8 max-w-full whitespace-normal text-start"
            onClick={() => onCopy(item.text)}
            aria-label={t("controlPanel.history.copyText")}
          >
            <Copy size={14} aria-hidden="true" />
            {t("controlPanel.history.copyText")}
          </Button>
        )}
        {menuActions.map(({ key, icon: Icon, label, onSelect, destructive }) => (
          <Button
            key={key}
            size="sm"
            variant={destructive ? "destructive" : "outline"}
            className="h-auto min-h-8 max-w-full whitespace-normal text-start"
            onClick={onSelect}
            aria-expanded={key === "raw" ? isExpanded : undefined}
            disabled={
              (["retry", "recover"].includes(key) && (isRetrying || !onRetryTranscription)) ||
              (key === "folder" && !onShowAudioInFolder)
            }
          >
            {isRetrying && ["retry", "recover"].includes(key) ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Icon size={14} aria-hidden="true" />
            )}
            {label}
          </Button>
        ))}
      </div>

      {isTranscribed && rawText !== null && (
        <div
          inert={!isExpanded}
          className={cn(
            "grid transition-[grid-template-rows] duration-200",
            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-2 border-t border-border/70 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("controlPanel.history.rawTranscript")}
                </span>
                <Tooltip content={t("controlPanel.history.copyRawTranscript")}>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onCopy(rawText)}
                    className="h-5 w-5 rounded-sm text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                  >
                    <Copy size={10} />
                  </Button>
                </Tooltip>
              </div>
              <p dir="auto" className="mt-1 text-xs leading-relaxed text-muted-foreground/80">
                {rawText}
              </p>
              {rawText === item.text && (
                <p className="mt-1 text-[10px] italic text-muted-foreground/70">
                  {t("controlPanel.history.noAiProcessing")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
