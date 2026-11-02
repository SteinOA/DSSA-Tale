export interface ImportProgress {
  device?: "cpu" | "cuda";
  gpuFallbackReason?: string;
  chunksTotal: number;
  chunksCompleted: number;
  resumedChunks?: number;
  audioDurationSeconds?: number;
  audioProcessedSeconds?: number;
  processingElapsedSeconds?: number;
  receivedAt?: number;
}

export function formatImportClock(seconds: number): string {
  const value = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const rest = String(value % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

export function importTiming(
  progress: ImportProgress | null,
  now: number,
  fallbackDuration?: number | null
) {
  const duration = progress?.audioDurationSeconds ?? fallbackDuration;
  const total =
    typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? duration : null;
  const rawProcessed = progress?.audioProcessedSeconds;
  const processed =
    total !== null && typeof rawProcessed === "number" && Number.isFinite(rawProcessed)
      ? Math.min(total, Math.max(0, rawProcessed))
      : null;
  let estimatedRemainingSeconds: number | null = null;
  if (
    progress &&
    Number.isFinite(progress.chunksTotal) &&
    Number.isFinite(progress.chunksCompleted)
  ) {
    const fresh = progress.chunksCompleted - (progress.resumedChunks || 0);
    const left = progress.chunksTotal - progress.chunksCompleted;
    const elapsed = progress.processingElapsedSeconds;
    const age = Math.max(0, (now - (progress.receivedAt ?? now)) / 1000);
    if (
      fresh >= 2 &&
      left > 0 &&
      typeof elapsed === "number" &&
      Number.isFinite(elapsed) &&
      elapsed >= 3
    ) {
      const remaining = (elapsed / fresh) * left - age;
      // An expired estimate is not proof that processing has completed.
      if (remaining > 0) estimatedRemainingSeconds = Math.ceil(remaining);
    }
  }
  return {
    totalSeconds: total,
    processedSeconds: processed,
    audioRemainingSeconds: processed === null || total === null ? null : total - processed,
    estimatedRemainingSeconds,
  };
}
