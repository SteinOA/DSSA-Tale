import { withSessionRefresh } from "../lib/auth";
import {
  resolveTranscriptionRoute,
  type ManagedTranscriptionResolution,
  type TranscriptionRoute,
} from "../helpers/transcriptionRoute";
import {
  getManagedTranscriptionResolution,
  isManagedTranscriptionActive,
} from "./managedTranscription";
import { getTranscriptionProviders } from "../models/ModelRegistry";
import type { LocalTranscriptionProvider } from "../types/electron";
import type { ImportJob } from "../types/dssa";

export interface FileTranscriptionResult {
  recoveryJobId?: string;
  success: boolean;
  text?: string;
  error?: string;
  code?: string;
  messageKey?: string;
  diarized?: boolean;
  // The transcript succeeded, but requested speaker labels could not be applied.
  diarizationWarning?: boolean;
  timingUnavailable?: boolean;
  alignmentWarning?: boolean;
  checkpointWarning?: boolean;
  warning?: string;
  // Set alongside `warning` by the chunked cloud path: how much audio was lost.
  failedChunks?: number;
  totalChunks?: number;
  // Measured duration of the source audio, for persisting as
  // audio_duration_seconds. Only transcribeFileWithSpeakers sets it.
  durationSeconds?: number | null;
  // Segment-level timing from BYOK providers that support it (opts.timestamps
  // or BYOK diarization). Absent whenever the provider returned text only.
  segments?: Array<{ text: string; start: number; end: number; speaker?: string }>;
}

export interface DiarizationSettings {
  minSpeakers?: number;
  exactSpeakers?: number;
  alignment?: "off" | "fast" | "precise";
  engine?: "community-1" | "sherpa-onnx";
  enabled: boolean;
  // Local sherpa-onnx models present; BYOK-native diarization doesn't need them.
  localModelsReady: boolean;
  numSpeakers: number | null;
}

export interface FileTranscriptionConfig {
  useLocalWhisper: boolean;
  localTranscriptionProvider: string;
  whisperModel: string;
  parakeetModel: string;
  cohereModel: string;
  isOpenWhisprCloud: boolean;
  getApiKey: () => string;
  cloudTranscriptionProvider: string;
  cloudTranscriptionBaseUrl: string;
  cloudTranscriptionModel: string;
  language: string;
  cortiEnvironment?: string;
  cortiTenant?: string;
  transcriptionMode?: string;
  remoteTranscriptionUrl?: string;
  remoteTranscriptionModel?: string;
}

export interface TranscriptionApiKeys {
  openaiApiKey: string;
  groqApiKey: string;
  xaiApiKey: string;
  mistralApiKey: string;
  geminiApiKey: string;
  tinfoilApiKey: string;
  deepgramApiKey: string;
  assemblyaiApiKey: string;
  customTranscriptionApiKey?: string;
}

export function getTranscriptionApiKey(provider: string, keys: TranscriptionApiKeys): string {
  switch (provider) {
    case "openai":
      return keys.openaiApiKey;
    case "groq":
      return keys.groqApiKey;
    case "xai":
      return keys.xaiApiKey;
    case "mistral":
      return keys.mistralApiKey;
    case "gemini":
      return keys.geminiApiKey;
    case "tinfoil":
      return keys.tinfoilApiKey;
    case "deepgram":
      return keys.deepgramApiKey;
    case "assemblyai":
      return keys.assemblyaiApiKey;
    case "custom":
      return keys.customTranscriptionApiKey || "";
    default:
      return "";
  }
}

// Pre-flight through the shared resolver: code-carrying errors (incl. the
// Tinfoil-URL and fail-closed custom guards) surface here without an IPC
// round-trip; the main-process handler re-resolves the same fields as
// defense in depth.
export function resolveFileTranscriptionRoute(
  cfg: FileTranscriptionConfig,
  managed: ManagedTranscriptionResolution | null = null
): TranscriptionRoute {
  return resolveTranscriptionRoute({
    settings: {
      transcriptionMode: cfg.transcriptionMode,
      remoteTranscriptionUrl: cfg.remoteTranscriptionUrl,
      remoteTranscriptionModel: cfg.remoteTranscriptionModel,
      cloudTranscriptionProvider: cfg.cloudTranscriptionProvider,
      cloudTranscriptionModel: cfg.cloudTranscriptionModel,
      cloudTranscriptionBaseUrl: cfg.cloudTranscriptionBaseUrl,
      cortiEnvironment: cfg.cortiEnvironment,
      cortiTenant: cfg.cortiTenant,
    },
    providers: getTranscriptionProviders(),
    managed,
    request: { effectiveLanguage: cfg.language || undefined },
  });
}

// Single provider dispatch shared by the single-file flow and the batch queue,
// so BYOK providers receive identical options in both.
export async function transcribeFile(
  filePath: string,
  cfg: FileTranscriptionConfig,
  diarize: boolean,
  opts: { requestId?: string; timestamps?: boolean } = {}
): Promise<FileTranscriptionResult> {
  // Managed enterprise STT outranks every personal lane, OpenWhispr Cloud and
  // local included: under managed_required no audio may leave the tenant.
  const managed = getManagedTranscriptionResolution();
  if (managed?.kind === "error") {
    return {
      success: false,
      error: managed.message,
      code: managed.code,
      messageKey: managed.messageKey,
    };
  }

  if (!managed && cfg.isOpenWhisprCloud) {
    return withSessionRefresh(async () => {
      const r = await window.electronAPI.transcribeAudioFileCloud!(filePath, opts);
      if (!r.success && r.code) {
        throw Object.assign(new Error(r.error || "Cloud transcription failed"), {
          code: r.code,
        });
      }
      return r;
    });
  }

  if (!managed && cfg.useLocalWhisper) {
    const provider = cfg.localTranscriptionProvider as LocalTranscriptionProvider;
    return window.electronAPI.transcribeAudioFile(filePath, {
      provider,
      model:
        provider === "nvidia"
          ? cfg.parakeetModel
          : provider === "cohere"
            ? cfg.cohereModel
            : cfg.whisperModel,
      // Respect an explicit written-language choice for uploads too. In
      // particular NB-Whisper needs nn to produce Nynorsk rather than Bokmål.
      ...(cfg.language && cfg.language !== "auto" ? { language: cfg.language } : {}),
      requestId: opts.requestId,
      timestamps: opts.timestamps === true,
    });
  }

  const route = resolveFileTranscriptionRoute(cfg, managed);
  if (route.transport === "error") {
    return {
      success: false,
      error: route.message,
      code: route.code,
      messageKey: route.messageKey,
    };
  }

  // Self-hosted fields make the handler route to the configured server
  // (fail-closed on misconfiguration) instead of stale BYOK settings.
  return window.electronAPI.transcribeAudioFileByok!({
    filePath,
    managed: managed?.kind === "managed" ? managed : undefined,
    apiKey: cfg.getApiKey(),
    baseUrl: cfg.cloudTranscriptionBaseUrl,
    model: cfg.cloudTranscriptionModel,
    diarize: diarize || undefined,
    timestamps: opts.timestamps || undefined,
    provider: cfg.cloudTranscriptionProvider,
    language: cfg.language,
    environment: cfg.cortiEnvironment,
    tenant: cfg.cortiTenant,
    transcriptionMode: cfg.transcriptionMode,
    remoteTranscriptionUrl: cfg.remoteTranscriptionUrl,
    remoteTranscriptionModel: cfg.remoteTranscriptionModel,
  });
}

// OpenAI/Mistral BYOK handle diarization inside the transcription call itself.
// Self-hosted mode routes to the user's own server, which doesn't — those users
// get local diarization like everyone else.
export function shouldUseByokDiarize(
  cfg: FileTranscriptionConfig,
  diarizationEnabled: boolean
): boolean {
  if (isManagedTranscriptionActive()) return false;
  return (
    diarizationEnabled &&
    !cfg.useLocalWhisper &&
    !cfg.isOpenWhisprCloud &&
    cfg.transcriptionMode !== "self-hosted" &&
    (cfg.cloudTranscriptionProvider === "openai" || cfg.cloudTranscriptionProvider === "mistral")
  );
}

interface DiarizationSettingsRequest {
  minSpeakers?: number;
  exactSpeakers?: number;
  alignment?: "off" | "fast" | "precise";
  engine?: "community-1" | "sherpa-onnx";
  enabled: boolean;
  modelsReady: boolean;
  numSpeakers: number | null;
  config: FileTranscriptionConfig;
  ensureModels: () => Promise<boolean>;
}

// Speaker detection is opt-in but its local models download lazily, so a run
// started before they land would report "couldn't be applied" without the
// diarizer ever being invoked. Fetch them first; only the routes that diarize
// server-side can skip the download.
export async function resolveDiarizationSettings({
  minSpeakers,
  exactSpeakers,
  alignment,
  engine,
  enabled,
  modelsReady,
  numSpeakers,
  config,
  ensureModels,
}: DiarizationSettingsRequest): Promise<DiarizationSettings> {
  const needsLocalModels = enabled && !modelsReady && !shouldUseByokDiarize(config, enabled);
  return {
    ...(minSpeakers !== undefined ? { minSpeakers } : {}),
    ...(exactSpeakers !== undefined ? { exactSpeakers } : {}),
    ...(alignment ? { alignment } : {}),
    ...(engine ? { engine } : {}),
    enabled,
    localModelsReady: needsLocalModels ? await ensureModels() : modelsReady,
    numSpeakers,
  };
}

// Transcribe and diarize in parallel, then merge speaker labels into the text.
// Shared by the single-file flow and the batch queue. `durationSeconds` (when the
// source knows it, e.g. URL downloads) beats inferring duration from segments.
type ImportOptions = {
  requestId?: string;
  timestamps?: boolean;
  recoveryJobId?: string;
  folderId?: number | null;
};
interface RecoveryContext {
  stages: NonNullable<ImportJob["stages"]>;
  record: (stage: string, result: unknown) => Promise<void>;
}
export async function transcribeFileWithSpeakers(
  filePath: string,
  cfg: FileTranscriptionConfig,
  diarization: DiarizationSettings,
  durationSeconds?: number | null,
  opts: ImportOptions = {}
): Promise<FileTranscriptionResult> {
  const api = window.dssaAPI;
  let job: ImportJob | undefined;
  let checkpointWarning = false;
  if (cfg.useLocalWhisper && cfg.localTranscriptionProvider === "whisper" && api?.importBegin) {
    try {
      const created = await api.importBegin({
        filePath,
        resumeId: opts.recoveryJobId,
        configuration: {
          transcription: {
            useLocalWhisper: true,
            localTranscriptionProvider: "whisper",
            whisperModel: cfg.whisperModel,
            language: cfg.language,
          },
          diarization,
          folderId: opts.folderId ?? null,
        },
      });
      if (created.error) throw Error(created.error);
      if (created.disabled && opts.recoveryJobId)
        throw Error("Slå på lokal historikk før denne importen gjenopptas.");
      if (created.id && !created.disabled) job = created;
    } catch (error) {
      if (opts.recoveryJobId) throw error;
      checkpointWarning = true;
    }
  }
  const record = async (stage: string, result: unknown) => {
    if (!job) return;
    const saved = await api.importStage(job.id, stage, result);
    if (!saved.success) throw Error(saved.error || "Importresultatet kunne ikke sikres.");
  };
  try {
    const cached = job?.stages || {};
    const result =
      cached.final ||
      (await transcribeFileWithSpeakersCore(
        job?.path || filePath,
        cfg,
        diarization,
        durationSeconds,
        { ...opts, recoveryJobId: job?.id },
        job ? { stages: cached, record } : undefined
      ));
    if (result.success && result.text && job) {
      await record("final", result);
      return { ...result, recoveryJobId: job.id };
    }
    return { ...result, ...(checkpointWarning ? { checkpointWarning: true } : {}) };
  } finally {
    if (job) await api.importPause(job.id).catch(() => {});
  }
}

async function transcribeFileWithSpeakersCore(
  filePath: string,
  cfg: FileTranscriptionConfig,
  diarization: DiarizationSettings,
  durationSeconds?: number | null,
  opts: ImportOptions = {},
  recovery?: RecoveryContext
): Promise<FileTranscriptionResult> {
  const byokDiarize = shouldUseByokDiarize(cfg, diarization.enabled);
  let communityEngine = false;
  if (diarization.enabled && !byokDiarize && diarization.engine !== "sherpa-onnx") {
    try {
      communityEngine =
        diarization.engine === "community-1" ||
        (await window.electronAPI.getDiarizationModelStatus?.())?.engine === "community-1";
    } catch {
      /* Existing local engine remains available. */
    }
  }
  const runDiarization = async () => {
    if (recovery?.stages.diarization) return recovery.stages.diarization;
    const result = await (diarization.enabled && diarization.localModelsReady && !byokDiarize
      ? (window.electronAPI
          .diarizeAudioFile?.(filePath, {
            ...(diarization.engine ? { engine: diarization.engine } : {}),
            numSpeakers: diarization.numSpeakers ?? undefined,
            minSpeakers: diarization.minSpeakers,
            exactSpeakers: diarization.exactSpeakers,
            requestId: opts.requestId,
            recoveryJobId: opts.recoveryJobId,
          })
          .catch((error) =>
            error?.name === "AbortError" ? { success: false, code: "UPLOAD_CANCELLED" } : null
          ) ?? Promise.resolve(null))
      : Promise.resolve(null));
    if (result?.success && result.segments?.length) await recovery?.record("diarization", result);
    return result;
  };

  const runTranscription = async () => {
    if (recovery?.stages.transcription) return recovery.stages.transcription;
    const result = await transcribeFile(filePath, cfg, byokDiarize, {
      ...opts,
      timestamps: opts.timestamps || diarization.enabled,
    });
    if (result.success && result.text && result.segments?.length)
      await recovery?.record("transcription", result);
    return result;
  };
  // Both engines use GPU memory. Run Community-1 after ASR on an 8 GB card.
  const [transcribed, diar] = communityEngine
    ? await (async () => {
        const text = await runTranscription();
        return [text, text.success && text.text ? await runDiarization() : null] as const;
      })()
    : await Promise.all([runTranscription(), runDiarization()]);

  // The diarizer measures the converted audio, so it covers picked files whose
  // duration the caller never knew. 0/NaN mean "unknown", hence ||.
  const measuredDuration =
    durationSeconds ||
    transcribed.durationSeconds ||
    (diar?.success && diar.durationSeconds) ||
    null;
  const result = { ...transcribed, durationSeconds: measuredDuration };
  if (diar?.code === "UPLOAD_CANCELLED")
    return { ...result, success: false, code: "UPLOAD_CANCELLED" };

  if (!result.success || !result.text || !diarization.enabled || result.diarized) return result;
  if (!diar?.success || !diar.segments?.length) {
    return { ...result, diarizationWarning: true };
  }

  // File imports must not invent a time axis from text length. Without actual
  // ASR timing retain the transcript and clearly report missing speaker labels.
  if (!result.segments?.length) return { ...result, diarizationWarning: true };

  let timedSegments = result.segments;
  let alignmentWarning = false;
  if (
    cfg.useLocalWhisper &&
    communityEngine &&
    ["fast", "precise"].includes(diarization.alignment || "")
  ) {
    try {
      const aligned =
        recovery?.stages.alignment ||
        (await window.electronAPI.alignAudioFile?.(filePath, {
          mode: diarization.alignment as "fast" | "precise",
          language: cfg.language,
          requestId: opts.requestId,
          recoveryJobId: opts.recoveryJobId,
          segments: result.segments,
        }));
      if (aligned?.code === "UPLOAD_CANCELLED")
        return { ...result, success: false, code: "UPLOAD_CANCELLED" };
      if (aligned?.success && aligned.segments?.length) {
        if (!recovery?.stages.alignment) await recovery?.record("alignment", aligned);
        timedSegments = aligned.segments;
        alignmentWarning = !!aligned.fallback || !!aligned.resourceWarning;
      } else alignmentWarning = true;
    } catch {
      alignmentWarning = true;
    }
  }

  try {
    const merged = await window.electronAPI.mergeSpeakerText?.(
      diar.segments,
      result.text,
      measuredDuration || 0,
      timedSegments,
      cfg.language
    );
    if (merged?.success && merged.text && merged.segments?.length)
      return {
        ...result,
        text: merged.text,
        segments: merged.segments,
        diarized: !!merged.segments?.some((segment) => segment.speaker),
        ...(alignmentWarning ? { alignmentWarning: true } : {}),
        ...(merged.diarizationWarning || diar.speakerCountMismatch
          ? { diarizationWarning: true }
          : {}),
      };
  } catch {
    // Merge failure falls back to the plain transcript.
  }
  return { ...result, diarizationWarning: true };
}
