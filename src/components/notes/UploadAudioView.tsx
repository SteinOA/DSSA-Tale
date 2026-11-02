import React, { useState, useRef, useEffect } from "react";
import { formatImportClock, importTiming, type ImportProgress } from "../../utils/dssaImportTiming";
import { useTranslation } from "react-i18next";
import {
  Upload,
  FileAudio,
  X,
  AlertCircle,
  ArrowRight,
  FolderOpen,
  Plus,
  Settings,
  Link2,
  Users,
} from "../icons";
import { useShallow } from "zustand/react/shallow";
import { Button } from "../ui/button";
import { PAGE_CONTENT_WIDTH_CLASS } from "../ui/pageWidth";
import { CARD_SURFACE_CLASS } from "../ui/surfaces";
import { GRADIENT_CIRCLE } from "../ui/gradientCircle";
import { Toggle } from "../ui/toggle";
import EmptyStateCard from "../ui/EmptyStateCard";
import { cn } from "../lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import type { FolderItem } from "../../types/electron";
import {
  findDefaultFolder,
  findVideosFolder,
  DOWNLOAD_ERROR_KEYS,
  transcriptionErrorKey,
  MEETINGS_FOLDER_NAME,
} from "./shared";
import { useAuth } from "../../hooks/useAuth";
import { useUsage } from "../../hooks/useUsage";
import { useSettings } from "../../hooks/useSettings";
import { requestSignIn } from "../../utils/requestSignIn";
import { describeProviderError } from "../../utils/describeProviderError";
import {
  getAllReasoningModels,
  getBatchTranscriptionModel,
  getParakeetModelInfo,
  getTranscriptionProviders,
  isSherpaLocalProvider,
} from "../../models/ModelRegistry";
import {
  useSettingsStore,
  selectIsCloudCleanupMode,
  selectPolicyEffectiveSettings,
  selectResolvedUploadTranscription,
  getSettings,
} from "../../stores/settingsStore";
import { useBatchQueue } from "../../stores/batchQueueStore";
import type { TranscribeOptions } from "../../stores/batchQueueStore";
import {
  transcribeFileWithSpeakers,
  resolveDiarizationSettings,
  shouldUseByokDiarize,
  getTranscriptionApiKey,
} from "../../services/fileTranscription";
import type {
  FileTranscriptionConfig,
  FileTranscriptionResult,
  DiarizationSettings,
} from "../../services/fileTranscription";
import { MAX_SPEAKER_COUNT } from "../../constants/speakerDetection.json";
import DssaImportRecovery from "../dssa/DssaImportRecovery";
import type { ImportJob } from "../../types/dssa";
import BatchQueueView from "./BatchQueueView";
import { generateNoteTitle } from "../../utils/generateTitle";
import { getBaseLanguageCode } from "../../utils/languageSupport";
import { isTranscriptionContextAllowed } from "../../stores/policyRules";
import { usePolicyStore } from "../../stores/policyStore";
import { usePolicySnapshot, useTranscriptionContextAllowed } from "../../hooks/usePolicy";
import { byokFileSizeLimit, resolveTranscriptionRoute } from "../../helpers/transcriptionRoute";
import { saveUploadNote, uploadTitleFallback } from "../../services/uploadNotes";
import { useManagedScopeResolution } from "../../stores/enterpriseIdentityStore";
import { isManagedTranscriptionActive } from "../../services/managedTranscription";
import { UploadCompleteWarnings, UploadModelSettingsButton } from "./UploadAudioFeedback";
import { isSupportedUploadFile, uploadFileUrlPattern } from "../../utils/uploadAudioFormats";
import DssaAudioSources from "../dssa/DssaAudioSources";
import DssaHelpButton from "../dssa/DssaHelpButton";

type UploadState = "idle" | "selected" | "downloading" | "transcribing" | "complete" | "error";

const CLOUD_FREE_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB — free plan cloud limit
const CLOUD_PRO_MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB — pro plan cloud limit

const MAX_BATCH_URLS = 50;

// Every action on this page: the brand pill for the next step, a ghost pill beside it.
const PRIMARY_ACTION_CLASS = "rounded-full px-5 font-medium";
const SECONDARY_ACTION_CLASS = "rounded-full px-4";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isYouTubeUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname;
    return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
  } catch {
    return false;
  }
}

function parseBatchUrls(text: string): { valid: string[]; skipped: number } {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const line of lines) {
    try {
      const parsed = new URL(line);
      const httpsOk = parsed.protocol === "https:";
      const httpYoutubeOk = parsed.protocol === "http:" && isYouTubeUrl(line);
      if ((httpsOk || httpYoutubeOk) && !seen.has(line)) {
        seen.add(line);
        valid.push(line);
      }
    } catch {
      // invalid line, counted as skipped
    }
  }
  const capped = valid.slice(0, MAX_BATCH_URLS);
  return { valid: capped, skipped: lines.length - capped.length };
}

export interface UploadActivity {
  device?: "cpu" | "cuda";
  stage: "preparing" | "speech" | "alignment" | "saving" | "downloading" | "batch";
  startedAt: number;
  fileName: string;
  withSpeakers: boolean;
  speechPercent: number | null;
}
interface UploadAudioViewProps {
  onNoteCreated?: (noteId: number, folderId: number | null) => void;
  onOpenSettings?: (section: string) => void;
  onActivityChange?: (active: UploadActivity | null) => void;
}

export default function UploadAudioView({
  onNoteCreated,
  onOpenSettings,
  onActivityChange,
}: UploadAudioViewProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<UploadState>("idle");
  const recoveryRef = useRef<ImportJob | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState(false);
  const [file, setFile] = useState<{
    name: string;
    path: string;
    size: string;
    sizeBytes: number;
    fromUrl?: boolean;
    durationSeconds?: number | null;
  } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  useEffect(() => {
    if (recoveryRef.current && file?.path !== recoveryRef.current.path) {
      recoveryRef.current = null;
      setRecoveryNotice(false);
    }
  }, [file?.path]);
  const [partialWarning, setPartialWarning] = useState<{ failed: number; total: number } | null>(
    null
  );
  const [diarizationWarning, setDiarizationWarning] = useState(false);
  const [checkpointWarning, setCheckpointWarning] = useState(false);
  const [noteId, setNoteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadStage, setUploadStage] = useState<"preparing" | "speech" | "alignment" | "saving">(
    "preparing"
  );
  const [alignmentWarning, setAlignmentWarning] = useState(false);
  const [chunkProgress, setChunkProgress] = useState<ImportProgress | null>(null);
  const progressCleanupRef = useRef<(() => void) | null>(null);
  const runIdRef = useRef(0);
  const activeRequestIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const urlDownloadActiveRef = useRef(false);

  const [urlInput, setUrlInput] = useState("");
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    stage: string;
    percent: number;
    title?: string;
  } | null>(null);
  const [downloadedTempPath, setDownloadedTempPath] = useState<string | null>(null);
  const downloadedTempPathRef = useRef(downloadedTempPath);
  useEffect(() => {
    downloadedTempPathRef.current = downloadedTempPath;
  }, [downloadedTempPath]);
  const [urlExpanded, setUrlExpanded] = useState(false);
  const [skippedNotice, setSkippedNotice] = useState<string | null>(null);
  const singleDownloadIdRef = useRef<string | null>(null);

  const batch = useBatchQueue();
  const activityStartedRef = useRef<number | null>(null);

  const [diarizationEnabled, setDiarizationEnabled] = useState(
    () => localStorage.getItem("uploadDiarizationEnabled") === "true"
  );
  // Earlier builds accepted decimals; a saved one would read as Auto.
  const [diarizationNumSpeakers, setDiarizationNumSpeakers] = useState<string>(() => {
    const saved = localStorage.getItem("uploadDiarizationNumSpeakers") || "";
    return /^\d+$/.test(saved) ? saved : "";
  });
  const [diarizationModelsReady, setDiarizationModelsReady] = useState<boolean | null>(null);
  const [speakerMode, setSpeakerMode] = useState<"auto" | "cap" | "range" | "exact">(() => {
    const saved = localStorage.getItem("uploadSpeakerMode");
    return saved === "range" || saved === "exact" || saved === "cap"
      ? saved
      : localStorage.getItem("uploadDiarizationNumSpeakers")
        ? "cap"
        : "auto";
  });
  const [minimumSpeakers, setMinimumSpeakers] = useState(
    () => localStorage.getItem("uploadMinimumSpeakers") || "2"
  );
  useEffect(() => {
    localStorage.setItem("uploadSpeakerMode", speakerMode);
    localStorage.setItem("uploadMinimumSpeakers", minimumSpeakers);
  }, [speakerMode, minimumSpeakers]);
  const [diarizationEngine, setDiarizationEngine] = useState<"community-1" | "sherpa-onnx">(
    "sherpa-onnx"
  );
  const [communityReady, setCommunityReady] = useState(false);
  const [alignmentModels, setAlignmentModels] = useState<Record<string, Record<string, boolean>>>(
    {}
  );
  const [alignmentMode, setAlignmentMode] = useState<"off" | "fast" | "precise">(() => {
    const saved = localStorage.getItem("uploadAlignmentMode");
    return saved === "off" || saved === "precise" ? saved : "fast";
  });
  const [sherpaReady, setSherpaReady] = useState(true);
  const [diarizationDownloading, setDiarizationDownloading] = useState(false);
  useEffect(() => {
    const active = state === "transcribing" || state === "downloading" || batch.isProcessing;
    if (!active) {
      activityStartedRef.current = null;
      onActivityChange?.(null);
      return;
    }
    activityStartedRef.current ??= Date.now();
    onActivityChange?.({
      stage: batch.isProcessing ? "batch" : state === "downloading" ? "downloading" : uploadStage,
      startedAt: activityStartedRef.current,
      fileName: file?.name || "",
      withSpeakers: diarizationEnabled,
      device: uploadStage === "alignment" ? chunkProgress?.device : undefined,
      speechPercent: chunkProgress?.chunksTotal
        ? Math.round((chunkProgress.chunksCompleted / chunkProgress.chunksTotal) * 100)
        : null,
    });
  }, [
    state,
    uploadStage,
    batch.isProcessing,
    file?.name,
    diarizationEnabled,
    chunkProgress,
    onActivityChange,
  ]);

  useEffect(() => {
    localStorage.setItem("uploadDiarizationEnabled", String(diarizationEnabled));
  }, [diarizationEnabled]);

  useEffect(() => {
    localStorage.setItem("uploadDiarizationNumSpeakers", diarizationNumSpeakers);
  }, [diarizationNumSpeakers]);

  const diarizationDownloadRef = useRef<Promise<boolean> | null>(null);
  // Callers share one in-flight download: a transcribe started while the
  // mount-time heal is still fetching has to wait for it, not give up and
  // report that speaker detection couldn't be applied.
  const ensureDiarizationModels = (): Promise<boolean> => {
    if (diarizationDownloadRef.current) return diarizationDownloadRef.current;
    setDiarizationDownloading(true);
    const pending = (async () => {
      try {
        await window.electronAPI.downloadDiarizationModels?.();
        const status = await window.electronAPI.getDiarizationModelStatus?.();
        const ready = status?.modelsDownloaded ?? false;
        setDiarizationModelsReady(ready);
        return ready;
      } finally {
        diarizationDownloadRef.current = null;
        setDiarizationDownloading(false);
      }
    })();
    diarizationDownloadRef.current = pending;
    return pending;
  };

  const buildDiarizationSettings = (): Promise<DiarizationSettings> =>
    resolveDiarizationSettings({
      engine: diarizationEngine,
      alignment:
        diarizationEngine === "community-1" && alignmentModels[alignmentMode]?.[alignmentLanguage]
          ? alignmentMode
          : "off",
      enabled: diarizationEnabled,
      modelsReady: !!diarizationModelsReady,
      numSpeakers:
        speakerMode === "auto" ? null : Number(diarizationNumSpeakers) || MAX_SPEAKER_COUNT,
      ...(diarizationEngine === "community-1" && speakerMode === "range"
        ? { minSpeakers: Number(minimumSpeakers) || 1 }
        : {}),
      ...(diarizationEngine === "community-1" && speakerMode === "exact"
        ? { exactSpeakers: Number(diarizationNumSpeakers) || MAX_SPEAKER_COUNT }
        : {}),
      config: buildTranscriptionConfig(),
      ensureModels: ensureDiarizationModels,
    });

  useEffect(() => {
    window.electronAPI.getDiarizationModelStatus?.().then((status) => {
      setCommunityReady(!!status?.communityReady);
      setAlignmentModels(status?.alignmentModels || {});
      setSherpaReady(status?.sherpaReady !== false);
      setDiarizationEngine(
        localStorage.getItem("uploadDiarizationEngine") === "sherpa-onnx" &&
          status?.sherpaReady !== false
          ? "sherpa-onnx"
          : status?.engine || "sherpa-onnx"
      );
      const ready = status?.modelsDownloaded ?? false;
      setDiarizationModelsReady(ready);
      // Heal a persisted-on toggle whose models were removed since; roll it back
      // if the download fails so it can't sit ON while doing nothing.
      if (!ready && localStorage.getItem("uploadDiarizationEnabled") === "true") {
        if (shouldUseByokDiarize(buildTranscriptionConfig(), true)) return;
        ensureDiarizationModels().then((ok) => {
          if (!ok) setDiarizationEnabled(false);
        });
      }
    });
    // Mount-only by design: heals persisted state against the models on disk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  // Batch destination folder, deliberately separate from the single-flow one:
  // handleFolderChange moves the already-saved note when noteId is set.
  const [batchFolderId, setBatchFolderId] = useState<string>("");
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [providerReady, setProviderReady] = useState<boolean | null>(null);

  const { isSignedIn } = useAuth();
  const usage = useUsage();
  // The server enforces the free-tier size limit regardless, so an unresolved
  // entitlement should not block a payer's upload.
  const isProUser = usage?.hasPaidAccessOptimistic ?? false;

  const apiKeys = useSettings();
  const {
    openaiApiKey,
    groqApiKey,
    xaiApiKey,
    mistralApiKey,
    geminiApiKey,
    tinfoilApiKey,
    deepgramApiKey,
    assemblyaiApiKey,
    customTranscriptionApiKey,
  } = apiKeys;
  const policyState = usePolicySnapshot();

  const {
    useLocalWhisper,
    whisperModel,
    localTranscriptionProvider,
    parakeetModel,
    cohereModel,
    cloudTranscriptionProvider,
    cloudTranscriptionModel,
    cloudTranscriptionBaseUrl,
    cloudTranscriptionMode,
    transcriptionMode,
    remoteTranscriptionUrl,
    remoteTranscriptionModel,
  } = useSettingsStore(
    useShallow((settings) =>
      selectResolvedUploadTranscription(selectPolicyEffectiveSettings(settings, policyState))
    )
  );
  const uploadAllowedByPolicy = useTranscriptionContextAllowed("upload");

  const setUploadTranscriptionMode = useSettingsStore((s) => s.setUploadTranscriptionMode);
  const setUploadCloudTranscriptionMode = useSettingsStore(
    (s) => s.setUploadCloudTranscriptionMode
  );
  const setUploadUseLocalWhisper = useSettingsStore((s) => s.setUploadUseLocalWhisper);

  const cortiClientId = useSettingsStore((s) => s.cortiClientId);
  const cortiClientSecret = useSettingsStore((s) => s.cortiClientSecret);
  const cortiEnvironment = useSettingsStore((s) => s.cortiEnvironment);
  const cortiTenant = useSettingsStore((s) => s.cortiTenant);
  const preferredLanguage = useSettingsStore((s) => s.preferredLanguage);
  const selectedLanguage = getBaseLanguageCode(preferredLanguage);
  const alignmentLanguage =
    selectedLanguage === "nn" ? "nn" : ["nb", "no"].includes(selectedLanguage) ? "nb" : "";
  const isCloudCleanup = useSettingsStore((settings) =>
    selectIsCloudCleanupMode(selectPolicyEffectiveSettings(settings, policyState))
  );
  const effectiveCleanupModel = useSettingsStore((settings) => {
    const effectiveSettings = selectPolicyEffectiveSettings(settings, policyState);
    return selectIsCloudCleanupMode(effectiveSettings) ? "" : effectiveSettings.cleanupModel;
  });
  const useCleanupModel = useSettingsStore((s) => s.useCleanupModel);
  const enterpriseTranscriptionSetupMode = useSettingsStore(
    (s) => s.enterpriseTranscriptionSetupMode
  );
  const managedActive =
    useManagedScopeResolution("transcription", enterpriseTranscriptionSetupMode).kind === "managed";

  const isOpenWhisprCloud =
    isSignedIn && cloudTranscriptionMode === "openwhispr" && !useLocalWhisper;

  // Mode detection
  const isSelfHosted = transcriptionMode === "self-hosted" && !useLocalWhisper;
  const isByok = !useLocalWhisper && !isOpenWhisprCloud;

  // Mode-aware file size validation
  // Local: no limits at all
  // BYOK: 25 MB hard max regardless of plan (14 MB for Gemini's inline cap)
  // Cloud free: 25 MB max (upgrade to Pro for more)
  // Cloud pro: 500 MB max
  const byokMaxFileSize = byokFileSizeLimit(cloudTranscriptionProvider);
  const byokMaxFileSizeMb = Math.floor(byokMaxFileSize / (1024 * 1024));
  let fileTooLarge = false;
  let requiresUpgrade = false;
  let requiresAccount = false;
  let byokTooLarge = false;
  let isLargeFile = false;

  if (file) {
    if (useLocalWhisper) {
      // Local transcription: no file size restrictions
    } else if (isSelfHosted || cloudTranscriptionProvider === "custom") {
      // Self-hosted / custom endpoints (e.g. local whisper.cpp): no file size restrictions
    } else if (isByok) {
      byokTooLarge = file.sizeBytes > byokMaxFileSize;
      if (byokTooLarge && !isSignedIn) {
        requiresAccount = true;
      }
    } else {
      // Cloud (OpenWhispr) — user is always signed in here
      fileTooLarge = file.sizeBytes > CLOUD_PRO_MAX_FILE_SIZE;
      requiresUpgrade = !isProUser && file.sizeBytes > CLOUD_FREE_MAX_FILE_SIZE;
      isLargeFile = file.sizeBytes > CLOUD_FREE_MAX_FILE_SIZE;
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (urlDownloadActiveRef.current) {
        window.electronAPI.cancelUrlDownload();
      }
      if (downloadedTempPathRef.current) {
        window.electronAPI.deleteTempFile(downloadedTempPathRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Uploads and URL downloads are a personal flow: scope the folder list
    // (and the by-name "Videos" destination lookup) to the private space so a
    // same-named team folder can never capture them.
    let cancelled = false;
    const loadFolders = async () => {
      try {
        const spaces = (await window.electronAPI.getSpaces?.()) ?? [];
        const privateSpace = spaces.find((space) => space.kind === "private");
        const items = (await window.electronAPI.getFolders?.(privateSpace?.id ?? null)) ?? [];
        if (cancelled) return;
        setFolders(items);
        const personal = findDefaultFolder(items);
        if (personal) {
          setSelectedFolderId(String(personal.id));
          setBatchFolderId(String(personal.id));
        }
      } catch (error) {
        if (!cancelled) console.error("Failed to load upload folders:", error);
      }
    };
    void loadFolders();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkProviderReady = async () => {
      if (managedActive) {
        setProviderReady(true);
        return;
      }
      if (isOpenWhisprCloud) {
        setProviderReady(true);
        return;
      }
      if (!useLocalWhisper) {
        if (isSelfHosted) {
          if (!cancelled) setProviderReady(!!remoteTranscriptionUrl?.trim());
        } else if (cloudTranscriptionProvider === "custom") {
          const route = resolveTranscriptionRoute({
            settings: { cloudTranscriptionProvider, cloudTranscriptionBaseUrl },
            providers: getTranscriptionProviders(),
          });
          if (!cancelled) setProviderReady(route.transport !== "error");
        } else if (cloudTranscriptionProvider === "corti") {
          if (!cancelled) setProviderReady(!!(cortiClientId && cortiClientSecret));
        } else {
          if (!cancelled)
            setProviderReady(
              !!getTranscriptionApiKey(cloudTranscriptionProvider, {
                openaiApiKey,
                groqApiKey,
                xaiApiKey,
                mistralApiKey,
                geminiApiKey,
                tinfoilApiKey,
                deepgramApiKey,
                assemblyaiApiKey,
                customTranscriptionApiKey,
              })
            );
        }
        return;
      }
      if (isSherpaLocalProvider(localTranscriptionProvider)) {
        const r = await window.electronAPI.listParakeetModels?.();
        if (!cancelled)
          setProviderReady(
            !!(r?.success && r.models.some((m: { downloaded?: boolean }) => m.downloaded))
          );
      } else {
        const r = await window.electronAPI.listWhisperModels?.();
        if (!cancelled)
          setProviderReady(
            !!(r?.success && r.models.some((m: { downloaded?: boolean }) => m.downloaded))
          );
      }
    };
    checkProviderReady();
    return () => {
      cancelled = true;
    };
  }, [
    managedActive,
    isOpenWhisprCloud,
    isSelfHosted,
    remoteTranscriptionUrl,
    useLocalWhisper,
    localTranscriptionProvider,
    cloudTranscriptionProvider,
    cloudTranscriptionBaseUrl,
    openaiApiKey,
    groqApiKey,
    xaiApiKey,
    mistralApiKey,
    geminiApiKey,
    tinfoilApiKey,
    deepgramApiKey,
    assemblyaiApiKey,
    customTranscriptionApiKey,
    cortiClientId,
    cortiClientSecret,
  ]);

  const getActiveModelLabel = (): string => {
    if (isOpenWhisprCloud) return t("notes.upload.openwhisprCloud");
    if (useLocalWhisper) {
      if (localTranscriptionProvider === "nvidia")
        return getParakeetModelInfo(parakeetModel)?.name ?? parakeetModel;
      if (localTranscriptionProvider === "cohere") return `Cohere · ${cohereModel || "default"}`;
      return `Whisper · ${whisperModel || "base"}`;
    }
    if (isSelfHosted) {
      const name = t("settingsPage.transcription.modes.selfHosted");
      return remoteTranscriptionModel ? `${name} · ${remoteTranscriptionModel}` : name;
    }
    const name =
      cloudTranscriptionProvider === "custom"
        ? t("notes.upload.custom")
        : cloudTranscriptionProvider.charAt(0).toUpperCase() + cloudTranscriptionProvider.slice(1);
    const model = getBatchTranscriptionModel(cloudTranscriptionProvider) ?? cloudTranscriptionModel;
    return `${name} · ${model}`;
  };

  const buildTranscriptionConfig = (): FileTranscriptionConfig => ({
    useLocalWhisper,
    localTranscriptionProvider: localTranscriptionProvider as string,
    whisperModel,
    parakeetModel,
    cohereModel,
    isOpenWhisprCloud,
    getApiKey: () => getTranscriptionApiKey(cloudTranscriptionProvider, apiKeys),
    cloudTranscriptionProvider: cloudTranscriptionProvider as string,
    cloudTranscriptionBaseUrl: cloudTranscriptionBaseUrl || "",
    cloudTranscriptionModel,
    // Empty = auto-detect; the resolver supplies a default where one is required.
    language: getBaseLanguageCode(preferredLanguage) || "",
    cortiEnvironment,
    cortiTenant,
    transcriptionMode,
    remoteTranscriptionUrl,
    remoteTranscriptionModel,
  });

  // Batch counterpart of the single-file size gating above; returns keys under notes.upload.*.
  const getBatchSizeErrorKey = (sizeBytes: number): string | null => {
    if (useLocalWhisper || isSelfHosted || cloudTranscriptionProvider === "custom") return null;
    if (isByok) return sizeBytes > byokMaxFileSize ? "byokTooLarge" : null;
    if (sizeBytes > CLOUD_PRO_MAX_FILE_SIZE) return "fileTooLarge";
    if (!isProUser && sizeBytes > CLOUD_FREE_MAX_FILE_SIZE) return "paidPlanRequired";
    return null;
  };

  const generateTitle = async (text: string): Promise<string> => {
    if (!useCleanupModel) return "";
    if (!getSettings().autoGenerateNoteTitle) return "";
    const model = isCloudCleanup ? "" : effectiveCleanupModel || getAllReasoningModels()[0]?.value;
    if (!model && !isCloudCleanup) return "";
    return generateNoteTitle(text, model);
  };

  const handleBrowse = async (source?: "google" | "microsoft" | "apple", libraryId?: string) => {
    const res = await window.electronAPI.selectAudioFile({ multiple: true, source, libraryId });
    if (res.canceled) return;

    const filePaths: string[] = res.filePaths || (res.filePath ? [res.filePath] : []);
    if (filePaths.length === 0) return;

    // While a batch runs (or a queue exists), new files join the queue.
    if (filePaths.length === 1 && !batch.isProcessing && !batch.hasQueue) {
      const fp = filePaths[0];
      const name = fp.split(/[/\\]/).pop() || "audio";
      const sizeBytes = (await window.electronAPI.getFileSize?.(fp)) ?? 0;
      setFile({ name, path: fp, size: sizeBytes ? formatFileSize(sizeBytes) : "", sizeBytes });
      setState("selected");
      setError(null);
      return;
    }

    const items: Array<{ name: string; path: string; sizeBytes: number }> = [];
    for (const fp of filePaths) {
      const name = fp.split(/[/\\]/).pop() || "audio";
      const sizeBytes = (await window.electronAPI.getFileSize?.(fp)) ?? 0;
      items.push({ name, path: fp, sizeBytes });
    }
    batch.addFiles(items);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const validFiles: Array<{ name: string; path: string; sizeBytes: number }> = [];
    const skippedNames: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!isSupportedUploadFile(f.name)) {
        skippedNames.push(f.name);
        continue;
      }
      const filePath = window.electronAPI.getPathForFile(f);
      if (filePath) {
        validFiles.push({ name: f.name, path: filePath, sizeBytes: f.size });
      }
    }

    setSkippedNotice(
      skippedNames.length > 0
        ? t("notes.upload.unsupportedFiles", { names: skippedNames.join(", ") })
        : null
    );
    if (validFiles.length === 0) return;

    if (validFiles.length === 1 && !batch.isProcessing && !batch.hasQueue) {
      const f = validFiles[0];
      setFile({
        name: f.name,
        path: f.path,
        size: formatFileSize(f.sizeBytes),
        sizeBytes: f.sizeBytes,
      });
      setState("selected");
      setError(null);
    } else {
      batch.addFiles(validFiles);
    }
  };

  const reset = () => {
    recoveryRef.current = null;
    setRecoveryNotice(false);
    if (progressCleanupRef.current) progressCleanupRef.current();
    progressCleanupRef.current = null;
    if (downloadedTempPath) {
      window.electronAPI.deleteTempFile(downloadedTempPath);
      setDownloadedTempPath(null);
    }
    setState("idle");
    setFile(null);
    setResult(null);
    setPartialWarning(null);
    setDiarizationWarning(false);
    setAlignmentWarning(false);
    setCheckpointWarning(false);
    setNoteId(null);
    setError(null);

    setChunkProgress(null);
    setUrlInput("");
    setDownloadProgress(null);
    setSkippedNotice(null);
    const personal = findDefaultFolder(folders);
    if (personal) setSelectedFolderId(String(personal.id));
  };

  const cancelTranscription = () => {
    // True backend abort for cloud and local uploads; the run-id bump still
    // discards any late result from providers that can't be aborted (BYOK).
    if (activeRequestIdRef.current) {
      window.electronAPI.cancelUploadTranscription?.(activeRequestIdRef.current);
      activeRequestIdRef.current = null;
    }
    runIdRef.current++;
    reset();
  };
  const handleTranscribe = async () => {
    if (!file || batch.isProcessing) return;
    if (
      !isManagedTranscriptionActive() &&
      !isTranscriptionContextAllowed(usePolicyStore.getState(), getSettings(), "upload")
    ) {
      setError(t("common.managedByOrg"));
      return;
    }
    const currentFile = file;
    setRecoveryNotice(false);
    const currentTempPath = downloadedTempPath;
    const runId = ++runIdRef.current;
    const requestId = crypto.randomUUID();
    activeRequestIdRef.current = requestId;
    setUploadStage("preparing");
    setState("transcribing");
    setError(null);

    setChunkProgress(null);
    setDiarizationWarning(false);
    setCheckpointWarning(false);

    const useChunkProgress = useLocalWhisper || (isOpenWhisprCloud && isLargeFile);

    if (useChunkProgress) {
      progressCleanupRef.current =
        window.electronAPI.onUploadTranscriptionProgress?.((data) => {
          if (data.requestId && data.requestId !== requestId) return;
          if (data.stage === "alignment") setUploadStage("alignment");
          if (data.chunksTotal > 0) {
            setChunkProgress({
              device: data.device,
              gpuFallbackReason: data.gpuFallbackReason,
              chunksTotal: data.chunksTotal,
              chunksCompleted: data.chunksCompleted,
              resumedChunks: data.resumedChunks,
              audioDurationSeconds: data.audioDurationSeconds,
              audioProcessedSeconds: data.audioProcessedSeconds,
              processingElapsedSeconds: data.processingElapsedSeconds,
              receivedAt: Date.now(),
            });
          }
        }) ?? null;
    }

    try {
      const recovered = recoveryRef.current;
      const diarization =
        recovered?.configuration.diarization || (await buildDiarizationSettings());
      setUploadStage("speech");
      const res: FileTranscriptionResult = await transcribeFileWithSpeakers(
        currentFile.path,
        { ...buildTranscriptionConfig(), ...recovered?.configuration.transcription },
        diarization,
        currentFile.durationSeconds,
        {
          requestId,
          timestamps: true,
          recoveryJobId: recovered?.id,
          folderId:
            recovered?.configuration.folderId ??
            (selectedFolderId ? Number(selectedFolderId) : null),
        }
      ).finally(() => {
        if (activeRequestIdRef.current === requestId) activeRequestIdRef.current = null;
      });

      if (runId !== runIdRef.current) return;

      if (progressCleanupRef.current) progressCleanupRef.current();
      progressCleanupRef.current = null;

      if (res.success && res.text) {
        setUploadStage("saving");
        if (res.durationSeconds)
          setFile((current) =>
            current ? { ...current, durationSeconds: res.durationSeconds } : current
          );

        setResult(res.text);
        setPartialWarning(
          res.failedChunks && res.totalChunks
            ? { failed: res.failedChunks, total: res.totalChunks }
            : null
        );
        setDiarizationWarning(!!res.diarizationWarning);
        setAlignmentWarning(!!res.alignmentWarning);
        setCheckpointWarning(!!res.checkpointWarning);

        let title: string;
        if (currentFile.fromUrl) {
          title = currentFile.name;
        } else {
          const aiTitle = await generateTitle(res.text);
          if (runId !== runIdRef.current) return;
          title = aiTitle || uploadTitleFallback(res.text, currentFile.name);
        }

        const noteRes = await saveUploadNote({
          recoveryJobId: res.recoveryJobId,
          title,
          text: res.text,
          sourceName: currentFile.name,
          folderId: selectedFolderId ? Number(selectedFolderId) : null,
          diarization,
          durationSeconds: res.durationSeconds,
          segments: res.segments,
        });
        if (runId !== runIdRef.current) return;
        if (!noteRes.success || !noteRes.note)
          throw Error(
            ("error" in noteRes ? String(noteRes.error) : "") ||
              t("notes.upload.transcriptionFailed")
          );
        setNoteId(noteRes.note.id);
        if (currentTempPath) {
          window.electronAPI.deleteTempFile(currentTempPath);
          setDownloadedTempPath(null);
        }
        setState("complete");
      } else {
        const errorKey = transcriptionErrorKey(res);
        setError(
          errorKey
            ? t(`notes.upload.${errorKey}`)
            : res.messageKey
              ? describeProviderError({ ...res, message: res.error }, t).description
              : res.error || t("notes.upload.transcriptionFailed")
        );
        setState("error");
      }
    } catch (err) {
      if (runId !== runIdRef.current) return;
      if (progressCleanupRef.current) progressCleanupRef.current();
      progressCleanupRef.current = null;

      const errorKey = transcriptionErrorKey(err);
      if (errorKey) {
        setError(t(`notes.upload.${errorKey}`));
      } else {
        setError(
          err instanceof Error
            ? describeProviderError(err, t).description
            : t("notes.upload.errorOccurred")
        );
      }
      setState("error");
    }
  };

  const handleUrlSubmit = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    // While a batch runs (or a queue exists), submitted URLs join the queue.
    if (batch.isProcessing || batch.hasQueue) {
      handleBatchUrlSubmit();
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      setError(t("notes.upload.urlInvalid"));
      setState("error");
      return;
    }

    // Main enforces HTTPS for direct downloads (YouTube http URLs get coerced),
    // so reject here instead of surfacing a misleading late failure.
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isYouTubeUrl(trimmed))) {
      setError(t("notes.upload.urlInvalid"));
      setState("error");
      return;
    }

    setState("downloading");
    setError(null);
    setDownloadProgress({ stage: "resolving", percent: 0 });

    const downloadId = crypto.randomUUID();
    singleDownloadIdRef.current = downloadId;
    const cleanupProgress = window.electronAPI.onUrlDownloadProgress?.((data) => {
      if (data.downloadId && data.downloadId !== downloadId) return;
      setDownloadProgress(data);
    });

    urlDownloadActiveRef.current = true;
    try {
      const res = await window.electronAPI.downloadUrlAudio(trimmed, downloadId);

      if (!mountedRef.current) {
        // Unmounted mid-download: nothing owns the temp file anymore, delete it.
        if (res.success) window.electronAPI.deleteTempFile(res.tempPath);
        return;
      }

      if (!res.success) {
        const fail = res as { success: false; error: string; code?: string };
        if (fail.code === "DOWNLOAD_CANCELLED") {
          setState("idle");
          return;
        }
        const key = DOWNLOAD_ERROR_KEYS[fail.code || ""];
        setError(
          key ? t(`notes.upload.${key}`) : fail.error || t("notes.upload.urlDownloadFailed")
        );
        setState("error");
        return;
      }

      setDownloadedTempPath(res.tempPath);
      setFile({
        name: res.title,
        path: res.tempPath,
        size: formatFileSize(res.sizeBytes),
        sizeBytes: res.sizeBytes,
        fromUrl: true,
        durationSeconds: res.durationSeconds,
      });
      const videosFolder = findVideosFolder(folders);
      if (videosFolder) setSelectedFolderId(String(videosFolder.id));
      setState("selected");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("notes.upload.urlDownloadFailed"));
      setState("error");
    } finally {
      urlDownloadActiveRef.current = false;
      singleDownloadIdRef.current = null;
      cleanupProgress?.();
      setDownloadProgress(null);
    }
  };

  // Retry re-runs whatever failed: a selected file's transcription, or the URL download.
  const handleRetry = () => {
    if (file) {
      handleTranscribe();
    } else if (urlInput.trim()) {
      handleUrlSubmit();
    } else {
      reset();
    }
  };

  const handleCancelDownload = () => {
    window.electronAPI.cancelUrlDownload(singleDownloadIdRef.current ?? undefined);
  };

  const handleBatchUrlSubmit = () => {
    const { valid, skipped } = parseBatchUrls(urlInput);
    if (valid.length > 0) {
      batch.addUrls(valid);
      // Same default the single-URL flow applies; the selector stays editable.
      if (!batchFolderId) {
        const videosFolder = findVideosFolder(folders);
        if (videosFolder) setBatchFolderId(String(videosFolder.id));
      }
      setUrlInput("");
      setUrlExpanded(false);
    }
    setSkippedNotice(skipped > 0 ? t("notes.upload.urlsSkipped", { n: skipped }) : null);
  };

  const startBatchProcessing = async () => {
    if (state === "downloading" || state === "transcribing") return;
    if (
      !isManagedTranscriptionActive() &&
      !isTranscriptionContextAllowed(usePolicyStore.getState(), getSettings(), "upload")
    ) {
      setSkippedNotice(t("common.managedByOrg"));
      return;
    }
    setSkippedNotice(null);

    const transcribeOpts: TranscribeOptions = {
      transcription: buildTranscriptionConfig(),
      folderId: batchFolderId ? Number(batchFolderId) : null,
      validateSize: getBatchSizeErrorKey,
      generateTitle: async (text) => (await generateTitle(text)) || null,
    };

    batch.processQueue(transcribeOpts, await buildDiarizationSettings());
  };

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const res = await window.electronAPI.createFolder(trimmed);
    if (res.success && res.folder) {
      setFolders((prev) => [...prev, res.folder!]);
      const newId = String(res.folder.id);
      setSelectedFolderId(newId);
      if (noteId != null) {
        window.electronAPI.updateNote(noteId, { folder_id: res.folder.id });
      }
    }
    setNewFolderName("");
    setShowNewFolderDialog(false);
  };

  const handleFolderChange = (val: string) => {
    if (val === "__create_new__") {
      setShowNewFolderDialog(true);
      return;
    }
    setSelectedFolderId(val);
    if (noteId != null) {
      window.electronAPI.updateNote(noteId, { folder_id: Number(val) });
    }
  };

  const switchToCloud = () => {
    setUploadTranscriptionMode("openwhispr");
    setUploadCloudTranscriptionMode("openwhispr");
    setUploadUseLocalWhisper(false);
  };

  const getTranscribingLabel = (): string => {
    if (isOpenWhisprCloud) return t("notes.upload.transcribingCloud");
    if (useLocalWhisper) return t("notes.upload.transcribingLocal");
    if (isSelfHosted) {
      return t("notes.upload.transcribingProvider", {
        provider: t("settingsPage.transcription.modes.selfHosted"),
      });
    }
    return t("notes.upload.transcribingProvider", { provider: cloudTranscriptionProvider });
  };

  return (
    <div className="flex flex-col items-center h-full overflow-y-auto">
      <div
        className={cn(PAGE_CONTENT_WIDTH_CLASS, "px-6 py-8 shrink-0 my-auto")}
        style={{ animation: "float-up 0.4s ease-out" }}
      >
        <DssaImportRecovery
          refreshKey={state}
          disabled={state === "transcribing" || batch.isProcessing}
          onResume={(job) => {
            recoveryRef.current = job;
            setRecoveryNotice(true);
            setFile({
              name: job.name,
              path: job.path,
              sizeBytes: job.sizeBytes,
              size: formatFileSize(job.sizeBytes),
            });
            setSelectedFolderId(
              job.configuration.folderId ? String(job.configuration.folderId) : ""
            );
            setState("selected");
            setError(null);
          }}
        />
        {recoveryNotice && (
          <p className="mb-4 rounded-lg border border-primary/30 p-3 text-sm" role="status">
            {t("dssa.recoverySelected")}
          </p>
        )}
        {state === "idle" && providerReady === false && (
          <NoProviderView t={t} onOpenSettings={() => onOpenSettings?.("uploadTranscription")} />
        )}

        {state === "idle" && providerReady !== false && (
          <>
            <IdleView
              t={t}
              getActiveModelLabel={getActiveModelLabel}
              handleDrop={handleDrop}
              handleBrowse={() => handleBrowse()}
              isDragOver={isDragOver}
              setIsDragOver={setIsDragOver}
              onOpenSettings={onOpenSettings}
            />

            <DssaAudioSources
              onBrowse={handleBrowse}
              onLibrary={(id) => handleBrowse(undefined, id)}
              onLink={() => {
                setUrlExpanded(false);
                requestAnimationFrame(() => urlInputRef.current?.focus());
              }}
              onImport={(result) => {
                if (!result.filePath) return;
                const sizeBytes = result.size || 0;
                setFile({
                  name: result.name || result.filePath.split(/[/\\]/).pop() || "opptak",
                  path: result.filePath,
                  size: formatFileSize(sizeBytes),
                  sizeBytes,
                });
                setDownloadedTempPath(result.filePath);
                setState("selected");
                setError(null);
              }}
            />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {t("dssa.cloudLinkHint")}
            </p>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-border/70 dark:bg-white/10" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                {t("notes.upload.orDivider")}
              </span>
              <div className="h-px flex-1 bg-border/70 dark:bg-white/10" />
            </div>

            {urlExpanded ? (
              <div>
                <textarea
                  dir="ltr"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder={t("notes.upload.pasteUrls")}
                  rows={4}
                  className="w-full resize-none rounded-2xl! px-4 py-3 text-sm placeholder:text-foreground/45"
                  autoFocus
                />
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setUrlExpanded(false);
                      setUrlInput("");
                    }}
                    className={SECONDARY_ACTION_CLASS}
                  >
                    {t("notes.upload.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBatchUrlSubmit}
                    disabled={!urlInput.trim()}
                    className={PRIMARY_ACTION_CLASS}
                  >
                    {t("notes.upload.addToQueue")}
                  </Button>
                </div>
              </div>
            ) : (
              <div dir="ltr" className="relative">
                {isYouTubeUrl(urlInput) ? (
                  <svg
                    viewBox="0 0 28 20"
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-[14px] z-10 pointer-events-none"
                  >
                    <rect width="28" height="20" rx="4" fill="#FF0000" />
                    <polygon points="11,4 11,16 21,10" fill="white" />
                  </svg>
                ) : uploadFileUrlPattern.test(urlInput) ? (
                  <FileAudio
                    size={16}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/45 z-10 pointer-events-none"
                  />
                ) : (
                  <Link2
                    size={16}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/45 z-10 pointer-events-none"
                  />
                )}
                <input
                  dir="ltr"
                  type="url"
                  ref={urlInputRef}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleUrlSubmit();
                    }
                  }}
                  onFocus={() => {
                    if (urlInput.includes("\n")) setUrlExpanded(true);
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text");
                    if (pasted.includes("\n")) {
                      e.preventDefault();
                      setUrlInput(pasted);
                      setUrlExpanded(true);
                    }
                  }}
                  placeholder={t("notes.upload.urlPlaceholder")}
                  className="h-11 w-full rounded-full! pl-11 pr-12 text-sm placeholder:text-foreground/45"
                />
                <button
                  onClick={handleUrlSubmit}
                  disabled={!urlInput.trim()}
                  aria-label={t("notes.upload.urlSubmit")}
                  className={cn(
                    "absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full transition-[filter,transform] duration-100",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                    urlInput.trim()
                      ? cn(GRADIENT_CIRCLE, "hover:brightness-110 active:scale-95")
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </>
        )}

        {skippedNotice && <p className="mt-2 text-center text-xs text-warning">{skippedNotice}</p>}

        {batch.hasQueue && (
          <div className="mt-5">
            <BatchQueueView
              queue={batch.queue}
              byokMaxFileSizeMb={byokMaxFileSizeMb}
              completedCount={batch.completedCount}
              failedCount={batch.failedCount}
              totalCount={batch.totalCount}
              isProcessing={batch.isProcessing}
              onRemoveItem={batch.removeItem}
              onCancelAll={batch.cancelAll}
              onClearQueue={() => {
                setSkippedNotice(null);
                batch.clearQueue();
              }}
              onOpenNote={(noteId) =>
                onNoteCreated?.(noteId, batchFolderId ? Number(batchFolderId) : null)
              }
            />

            {!batch.isProcessing && batch.queue.some((i) => i.status === "queued") && (
              <div className="mt-4 flex flex-col items-center gap-3">
                {folders.length > 0 && (
                  <FolderSelect
                    t={t}
                    folders={folders}
                    value={batchFolderId}
                    onChange={setBatchFolderId}
                  />
                )}
                <Button
                  onClick={startBatchProcessing}
                  disabled={
                    !uploadAllowedByPolicy || state === "downloading" || state === "transcribing"
                  }
                  className={PRIMARY_ACTION_CLASS}
                >
                  {t("notes.upload.transcribe")}
                </Button>
              </div>
            )}
          </div>
        )}

        {state === "selected" && file && (
          <SelectedView
            t={t}
            file={file}
            getActiveModelLabel={getActiveModelLabel}
            reset={reset}
            handleTranscribe={handleTranscribe}
            transcribeDisabled={batch.isProcessing || !uploadAllowedByPolicy}
            requiresUpgrade={!!requiresUpgrade}
            fileTooLarge={fileTooLarge}
            isLargeFile={isLargeFile}
            isOpenWhisprCloud={isOpenWhisprCloud}
            byokTooLarge={byokTooLarge}
            byokMaxFileSizeMb={byokMaxFileSizeMb}
            requiresAccount={requiresAccount}
            isProUser={!!isProUser}
            onUpgrade={() => usage?.openCheckout()}
            onCreateAccount={requestSignIn}
            onSwitchToCloud={switchToCloud}
            onOpenSettings={onOpenSettings}
          />
        )}

        {state === "downloading" && downloadProgress && (
          <div
            className={cn(CARD_SURFACE_CLASS, "flex flex-col items-center px-6 py-10 text-center")}
            style={{ animation: "float-up 0.3s ease-out" }}
          >
            <ProgressWaveform />
            <ProgressBar
              percent={
                downloadProgress.stage === "downloading" && downloadProgress.percent
                  ? downloadProgress.percent
                  : null
              }
            />
            <p className="text-[15px] font-medium text-foreground">
              {downloadProgress.stage === "resolving"
                ? t("notes.upload.urlResolving")
                : t("notes.upload.urlDownloading")}
            </p>

            {downloadProgress.title && (
              <p
                dir="auto"
                className="mt-1 w-full max-w-sm truncate text-[13px] text-muted-foreground"
              >
                {downloadProgress.title}
              </p>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelDownload}
              className={cn(SECONDARY_ACTION_CLASS, "mt-5")}
            >
              {t("notes.upload.urlCancelDownload")}
            </Button>
          </div>
        )}

        {state === "transcribing" && (
          <TranscribingView
            t={t}
            stage={uploadStage}
            withSpeakers={diarizationEnabled}
            getTranscribingLabel={getTranscribingLabel}
            file={file}
            chunkProgress={chunkProgress}
            onCancel={cancelTranscription}
          />
        )}

        {state === "complete" && result && (
          <CompleteView
            t={t}
            result={result}
            durationSeconds={file?.durationSeconds}
            partialWarning={partialWarning}
            diarizationWarning={diarizationWarning}
            alignmentWarning={alignmentWarning}
            checkpointWarning={checkpointWarning}
            folders={folders}
            selectedFolderId={selectedFolderId}
            handleFolderChange={handleFolderChange}
            noteId={noteId}
            onNoteCreated={onNoteCreated}
            reset={reset}
          />
        )}

        {state === "error" && error && (
          <ErrorView t={t} error={error} reset={reset} onRetry={handleRetry} />
        )}

        {(state === "idle" || state === "selected") && (
          <div
            className={cn(
              CARD_SURFACE_CLASS,
              "mt-5 divide-y divide-border/60 dark:divide-white/10"
            )}
          >
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Users size={16} className="mt-0.5 shrink-0 text-foreground/45" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {t("notes.upload.speakerDetection")}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    {t("notes.upload.speakerDetectionDescription")}
                  </p>

                  {diarizationEnabled &&
                    !useLocalWhisper &&
                    !isOpenWhisprCloud &&
                    !isSelfHosted &&
                    cloudTranscriptionProvider === "openai" && (
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {t("notes.upload.openaiDiarizeNote")}
                      </p>
                    )}
                  {diarizationEnabled &&
                    !useLocalWhisper &&
                    !isOpenWhisprCloud &&
                    !isSelfHosted &&
                    cloudTranscriptionProvider === "mistral" && (
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {t("notes.upload.mistralDiarizeNote")}
                      </p>
                    )}
                  {diarizationEnabled &&
                    !useLocalWhisper &&
                    !isOpenWhisprCloud &&
                    !isSelfHosted &&
                    cloudTranscriptionProvider === "groq" && (
                      <p className="mt-1.5 text-xs leading-relaxed text-warning">
                        {t("notes.upload.groqDiarizeNote")}
                      </p>
                    )}

                  {diarizationDownloading && (
                    <p className="mt-1.5 text-xs leading-relaxed text-primary">
                      {t("notes.upload.downloadingModels")}
                    </p>
                  )}
                  {diarizationModelsReady &&
                    !shouldUseByokDiarize(buildTranscriptionConfig(), diarizationEnabled) && (
                      <div className="mt-1.5 text-xs leading-relaxed">
                        <p className="text-primary">
                          {t("dssa.diarizationEngine", {
                            engine:
                              diarizationEngine === "community-1" ? "Community-1" : "sherpa-onnx",
                          })}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {t(
                            diarizationEngine === "community-1"
                              ? "dssa.communityDiarizationDescription"
                              : "dssa.sherpaDiarizationDescription"
                          )}
                        </p>
                      </div>
                    )}

                  {diarizationEnabled && isOpenWhisprCloud && (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {t("notes.upload.diarizationRunsLocally")}
                    </p>
                  )}
                </div>
              </div>
              <Toggle
                checked={diarizationEnabled}
                disabled={diarizationDownloading}
                ariaLabel={t("notes.upload.speakerDetection")}
                onChange={async (next) => {
                  setDiarizationEnabled(next);
                  // BYOK-native diarization needs no local models — don't download them.
                  if (
                    next &&
                    !diarizationModelsReady &&
                    !shouldUseByokDiarize(buildTranscriptionConfig(), true)
                  ) {
                    const ready = await ensureDiarizationModels();
                    if (!ready) setDiarizationEnabled(false);
                  }
                }}
              />
            </div>

            {diarizationEnabled && diarizationModelsReady && (
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <label htmlFor="upload-speaker-engine" className="text-sm font-medium">
                  {t("dssa.diarizationEngineChoice")}
                </label>
                <select
                  id="upload-speaker-engine"
                  className="min-h-9 rounded-lg border border-border bg-background px-3 text-sm"
                  value={diarizationEngine}
                  onChange={(event) => {
                    const engine =
                      event.target.value === "community-1" ? "community-1" : "sherpa-onnx";
                    setDiarizationEngine(engine);
                    localStorage.setItem("uploadDiarizationEngine", engine);
                  }}
                >
                  <option value="community-1" disabled={!communityReady}>
                    Community-1
                  </option>
                  <option value="sherpa-onnx" disabled={!sherpaReady}>
                    sherpa-onnx
                  </option>
                </select>
              </div>
            )}
            {diarizationEnabled && diarizationModelsReady && useLocalWhisper && (
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <label htmlFor="upload-alignment-mode" className="text-sm font-medium">
                  {t("dssa.alignmentChoice")}
                </label>
                <select
                  id="upload-alignment-mode"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={
                    useLocalWhisper &&
                    diarizationEngine === "community-1" &&
                    alignmentModels[alignmentMode]?.[alignmentLanguage]
                      ? alignmentMode
                      : "off"
                  }
                  disabled={diarizationEngine !== "community-1"}
                  onChange={(e) => {
                    const value = e.target.value as "off" | "fast" | "precise";
                    setAlignmentMode(value);
                    localStorage.setItem("uploadAlignmentMode", value);
                  }}
                >
                  <option value="off">{t("dssa.alignmentOff")}</option>
                  <option value="fast" disabled={!alignmentModels.fast?.[alignmentLanguage]}>
                    {t("dssa.alignmentFast")}
                  </option>
                  <option value="precise" disabled={!alignmentModels.precise?.[alignmentLanguage]}>
                    {t("dssa.alignmentPrecise")}
                  </option>
                </select>
                <p className="w-full text-sm text-muted-foreground">{t("dssa.alignmentHint")}</p>
              </div>
            )}
            {diarizationEnabled && diarizationModelsReady && (
              <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1 ps-7">
                  <label
                    htmlFor="upload-num-speakers"
                    className="block text-sm font-medium text-foreground"
                  >
                    {t("dssa.speakerCountMode")}
                  </label>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    {t("dssa.speakerCountHelp")}
                  </p>
                </div>
                <select
                  aria-label={t("dssa.speakerCountMode")}
                  value={speakerMode}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  onChange={(e) => {
                    setSpeakerMode(e.target.value as typeof speakerMode);
                    if (!diarizationNumSpeakers) setDiarizationNumSpeakers("15");
                  }}
                >
                  <option value="auto">{t("dssa.speakerAuto")}</option>
                  <option value="cap">{t("dssa.speakerCap")}</option>
                  <option value="range" disabled={diarizationEngine !== "community-1"}>
                    {t("dssa.speakerRange")}
                  </option>
                  <option value="exact" disabled={diarizationEngine !== "community-1"}>
                    {t("dssa.speakerExact")}
                  </option>
                </select>
                {speakerMode === "range" && diarizationEngine === "community-1" && (
                  <label className="text-sm">
                    {t("dssa.speakerMin")}
                    <input
                      type="number"
                      min={1}
                      max={Number(diarizationNumSpeakers) || 15}
                      step={1}
                      value={minimumSpeakers}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isInteger(n))
                          setMinimumSpeakers(
                            String(Math.max(1, Math.min(Number(diarizationNumSpeakers) || 15, n)))
                          );
                      }}
                      className="ml-2 w-20 rounded-lg border px-3 py-2"
                    />
                  </label>
                )}
                {speakerMode !== "auto" && (
                  <label className="text-sm">
                    {t(speakerMode === "exact" ? "dssa.speakerKnown" : "dssa.speakerMax")}
                    <input
                      id="upload-num-speakers"
                      type="number"
                      min="1"
                      max={MAX_SPEAKER_COUNT}
                      step="1"
                      inputMode="numeric"
                      value={diarizationNumSpeakers}
                      onKeyDown={(e) => {
                        if ([".", ",", "e", "E", "+", "-"].includes(e.key)) e.preventDefault();
                      }}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") {
                          setDiarizationNumSpeakers("");
                          return;
                        }
                        const n = Number(raw);
                        if (!Number.isInteger(n)) return;
                        const next = Math.max(1, Math.min(MAX_SPEAKER_COUNT, n));
                        setDiarizationNumSpeakers(String(next));
                        if (Number(minimumSpeakers) > next) setMinimumSpeakers(String(next));
                      }}
                      placeholder={t("notes.upload.numSpeakersPlaceholder")}
                      className="h-9 w-32 shrink-0 rounded-xl! px-3 text-sm placeholder:text-foreground/45 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent className="sm:max-w-95">
          <DialogHeader>
            <DialogTitle>{t("notes.upload.newFolder")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/50">
              {t("notes.upload.folderName")}
            </label>
            <Input
              dir="auto"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t("notes.folders.folderName")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowNewFolderDialog(false);
                setNewFolderName("");
              }}
            >
              {t("notes.upload.cancel")}
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              {t("notes.upload.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProgressWaveform() {
  return (
    <div className="mb-6 flex h-10 items-end justify-center gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-primary/60"
          style={{
            height: "100%",
            animation: `waveform-bar ${0.8 + i * 0.12}s ease-in-out infinite`,
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}

// null = size unknown (no content-length): pulse a full bar instead of sitting on an empty one.
function ProgressBar({ percent }: { percent: number | null }) {
  return (
    <div className="mb-4 h-1 w-full max-w-xs overflow-hidden rounded-full bg-foreground/8 dark:bg-white/10">
      <div
        className={cn(
          "h-full rounded-full bg-primary transition-[width] duration-500 ease-out",
          percent === null && "animate-pulse"
        )}
        style={{ width: `${percent === null ? 100 : Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

interface NoProviderViewProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  onOpenSettings: () => void;
}

function NoProviderView({ t, onOpenSettings }: NoProviderViewProps) {
  return (
    <EmptyStateCard
      icon={Settings}
      title={t("notes.upload.noProviderTitle")}
      description={t("notes.upload.noProviderDescription")}
      headingLevel={2}
      className="py-12"
    >
      <Button onClick={onOpenSettings} className={PRIMARY_ACTION_CLASS}>
        {t("notes.upload.noProviderAction")}
      </Button>
    </EmptyStateCard>
  );
}

interface IdleViewProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  getActiveModelLabel: () => string;
  handleDrop: (e: React.DragEvent) => void;
  handleBrowse: () => void;
  isDragOver: boolean;
  setIsDragOver: (v: boolean) => void;
  onOpenSettings?: (section: string) => void;
}

function IdleView({
  t,
  getActiveModelLabel,
  handleDrop,
  handleBrowse,
  isDragOver,
  setIsDragOver,
  onOpenSettings,
}: IdleViewProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleBrowse();
    }
  };

  return (
    <>
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {t("notes.upload.title")}
        </h2>
        <div className="flex max-w-full items-center justify-center gap-4">
          <UploadModelSettingsButton
            label={t("notes.upload.using", { model: getActiveModelLabel() })}
            actionLabel={t("notes.upload.noProviderAction")}
            onOpenSettings={onOpenSettings}
            className="text-[13px] text-muted-foreground"
          />
          <DssaHelpButton topic="model" />
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={t("notes.upload.dropOrBrowse")}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragOver(false);
        }}
        onClick={handleBrowse}
        onKeyDown={handleKeyDown}
        className={cn(
          "group mt-6 flex cursor-pointer flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center",
          "transition-[background-color,border-color,transform] duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          isDragOver
            ? "scale-[1.01] border-primary/60 bg-primary/5 dark:bg-primary/10"
            : "border-border bg-card/50 hover:border-primary/40 hover:bg-primary/5 dark:border-white/15 dark:bg-surface-2/60 dark:hover:bg-primary/10"
        )}
        style={isDragOver ? { animation: "drag-pulse 1.5s ease-in-out infinite" } : undefined}
      >
        <span
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
            isDragOver
              ? "bg-primary/15 text-primary"
              : "bg-surface-3 text-foreground/70 group-hover:text-primary"
          )}
        >
          <Upload size={20} />
        </span>
        <p
          className={cn(
            "mt-4 text-[15px] font-medium",
            isDragOver ? "text-primary" : "text-foreground"
          )}
        >
          {isDragOver ? t("notes.upload.dropToUpload") : t("notes.upload.dropOrBrowse")}
        </p>
        {!isDragOver && (
          <p className="mt-1 max-w-md text-[13px] leading-relaxed text-foreground/60">
            {t("notes.upload.supportedFormats")}
          </p>
        )}
      </div>
    </>
  );
}

interface SelectedViewProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  file: { name: string; path: string; size: string; sizeBytes: number };
  getActiveModelLabel: () => string;
  reset: () => void;
  handleTranscribe: () => void;
  transcribeDisabled: boolean;
  requiresUpgrade: boolean;
  fileTooLarge: boolean;
  isLargeFile: boolean;
  isOpenWhisprCloud: boolean;
  byokTooLarge: boolean;
  byokMaxFileSizeMb: number;
  requiresAccount: boolean;
  isProUser: boolean;
  onUpgrade: () => void;
  onCreateAccount: () => void;
  onSwitchToCloud: () => void;
  onOpenSettings?: (section: string) => void;
}

function SelectedView({
  t,
  file,
  getActiveModelLabel,
  reset,
  handleTranscribe,
  transcribeDisabled,
  requiresUpgrade,
  fileTooLarge,
  isLargeFile,
  isOpenWhisprCloud,
  byokTooLarge,
  byokMaxFileSizeMb,
  requiresAccount,
  isProUser,
  onUpgrade,
  onCreateAccount,
  onSwitchToCloud,
  onOpenSettings,
}: SelectedViewProps) {
  const canTranscribe = !fileTooLarge && !requiresUpgrade && !byokTooLarge;

  return (
    <div className="flex flex-col gap-3" style={{ animation: "float-up 0.3s ease-out" }}>
      <div className={cn(CARD_SURFACE_CLASS, "flex items-center gap-4 p-4")}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/15">
          <FileAudio size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p dir="ltr" className="truncate text-sm font-medium text-foreground">
            {file.name}
          </p>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
            {file.size && (
              <>
                <span className="shrink-0">{file.size}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <UploadModelSettingsButton
              label={getActiveModelLabel()}
              actionLabel={t("notes.upload.noProviderAction")}
              onOpenSettings={onOpenSettings}
              className="min-w-0 truncate text-start"
            />
          </div>
        </div>
        <button
          onClick={reset}
          aria-label={t("notes.upload.cancel")}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-foreground/45 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <X size={14} />
        </button>
      </div>

      {/* Cloud absolute limit (500 MB) */}
      {fileTooLarge && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 dark:bg-destructive/10">
          <p className="text-[13px] leading-relaxed text-destructive">
            {t("notes.upload.fileTooLarge")}
          </p>
        </div>
      )}

      {/* BYOK file too large — shared explanation */}
      {byokTooLarge && (
        <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 dark:bg-primary/10">
          <p className="text-[13px] leading-relaxed text-foreground/80">
            {t("notes.upload.byokTooLarge", { size: byokMaxFileSizeMb })}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {t("notes.upload.byokTooLargeDetail", { size: byokMaxFileSizeMb })}
          </p>
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-foreground">
            {requiresAccount
              ? t("notes.upload.byokTooLargeNeedsAccount")
              : isProUser
                ? t("notes.upload.switchToCloudForLargeFiles")
                : t("notes.upload.byokTooLargeNeedsUpgrade")}
          </p>
        </div>
      )}

      {/* Cloud free user, file > 25 MB → needs paid plan */}
      {requiresUpgrade && !fileTooLarge && (
        <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 dark:bg-primary/10">
          <p className="text-[13px] leading-relaxed text-foreground/80">
            {t("notes.upload.paidPlanRequired")}
          </p>
        </div>
      )}

      {/* Cloud large file info (Pro user, will be chunked) */}
      {isLargeFile && !requiresUpgrade && !fileTooLarge && isOpenWhisprCloud && (
        <p className="text-center text-[13px] text-muted-foreground">
          {t("notes.upload.largeFileNote")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        {/* BYOK too large — not signed in: Create Account */}
        {byokTooLarge && requiresAccount && (
          <Button onClick={onCreateAccount} className={PRIMARY_ACTION_CLASS}>
            {t("notes.upload.createAccount")}
          </Button>
        )}

        {/* BYOK too large — signed in, Pro: Switch to Cloud */}
        {byokTooLarge && !requiresAccount && isProUser && (
          <Button onClick={onSwitchToCloud} className={PRIMARY_ACTION_CLASS}>
            {t("notes.upload.switchToCloud")}
          </Button>
        )}

        {/* BYOK too large — signed in, Free: Upgrade */}
        {byokTooLarge && !requiresAccount && !isProUser && (
          <Button onClick={onUpgrade} className={PRIMARY_ACTION_CLASS}>
            {t("notes.upload.upgrade")}
          </Button>
        )}

        {/* Cloud requires upgrade */}
        {!byokTooLarge && requiresUpgrade && (
          <Button onClick={onUpgrade} className={PRIMARY_ACTION_CLASS}>
            {t("notes.upload.upgrade")}
          </Button>
        )}

        {/* Normal: can transcribe */}
        {canTranscribe && (
          <Button
            onClick={handleTranscribe}
            disabled={transcribeDisabled}
            className={PRIMARY_ACTION_CLASS}
          >
            {t("notes.upload.transcribe")}
          </Button>
        )}

        {/* Cancel button — always shown */}
        <Button variant="ghost" onClick={reset} className={SECONDARY_ACTION_CLASS}>
          {t("notes.upload.cancel")}
        </Button>
      </div>
    </div>
  );
}

interface TranscribingViewProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  stage: "preparing" | "speech" | "alignment" | "saving";
  withSpeakers: boolean;
  getTranscribingLabel: () => string;
  file: {
    name: string;
    path: string;
    size: string;
    sizeBytes: number;
    durationSeconds?: number | null;
  } | null;
  chunkProgress: ImportProgress | null;
  onCancel: () => void;
}

function TranscribingView({
  t,
  stage,
  withSpeakers,
  getTranscribingLabel,
  file,
  chunkProgress,
  onCancel,
}: TranscribingViewProps) {
  const hasChunkInfo = chunkProgress !== null && chunkProgress.chunksTotal > 0;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsedLabel = formatImportClock(elapsed);
  const timing = importTiming(chunkProgress, Date.now(), file?.durationSeconds);

  return (
    <div
      className={cn(CARD_SURFACE_CLASS, "flex flex-col items-center px-6 py-10 text-center")}
      style={{ animation: "float-up 0.3s ease-out" }}
    >
      <ProgressWaveform />
      <ProgressBar percent={null} />

      <p className="text-[15px] font-medium text-foreground" role="status">
        {stage === "preparing"
          ? t("dssa.importPreparing")
          : stage === "alignment"
            ? t("dssa.importAlignment")
            : stage === "saving"
              ? t("dssa.importSaving")
              : withSpeakers
                ? t(
                    hasChunkInfo && chunkProgress.chunksCompleted >= chunkProgress.chunksTotal
                      ? "dssa.importWaitingSpeakers"
                      : "dssa.importSpeechAndSpeakers"
                  )
                : getTranscribingLabel()}
      </p>
      <p className="mt-1 text-sm tabular-nums text-muted-foreground">
        {t("dssa.importElapsed", { time: elapsedLabel })}
      </p>
      {stage === "alignment" && chunkProgress?.device && (
        <p className="mt-1 text-sm text-muted-foreground" role="status">
          {t(
            chunkProgress.device === "cuda" ? "dssa.alignmentGpuActive" : "dssa.alignmentCpuActive"
          )}
        </p>
      )}
      {stage === "alignment" && chunkProgress?.gpuFallbackReason && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground" role="status">
          {t(
            chunkProgress.gpuFallbackReason === "insufficient-vram"
              ? "dssa.alignmentLowVram"
              : "dssa.alignmentCpuFallback"
          )}
        </p>
      )}
      {timing.totalSeconds !== null && (
        <p className="mt-1 text-sm tabular-nums text-foreground">
          {t("dssa.importAudioLength", { time: formatImportClock(timing.totalSeconds) })}
        </p>
      )}
      {timing.processedSeconds !== null && timing.audioRemainingSeconds !== null && (
        <p className="mt-1 text-sm tabular-nums text-muted-foreground">
          {t("dssa.importAudioProcessed", {
            processed: formatImportClock(timing.processedSeconds),
            remaining: formatImportClock(timing.audioRemainingSeconds),
          })}
        </p>
      )}
      {hasChunkInfo && chunkProgress.chunksCompleted < chunkProgress.chunksTotal && (
        <p className="mt-1 text-sm tabular-nums text-foreground">
          {timing.estimatedRemainingSeconds !== null
            ? t(stage === "alignment" ? "dssa.importAlignmentEta" : "dssa.importTextEta", {
                time: formatImportClock(timing.estimatedRemainingSeconds),
              })
            : t("dssa.importEtaPending")}
        </p>
      )}
      <p className="mt-2 max-w-sm text-xs text-muted-foreground">{t("dssa.importDurationHint")}</p>
      {hasChunkInfo ? (
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t(stage === "alignment" ? "dssa.importAlignmentPercent" : "dssa.importSpeechPercent", {
            percent: Math.round((chunkProgress.chunksCompleted / chunkProgress.chunksTotal) * 100),
          })}
          {" · "}
          {t(stage === "alignment" ? "dssa.alignmentChunkProgress" : "notes.upload.chunkProgress", {
            completed: chunkProgress.chunksCompleted,
            total: chunkProgress.chunksTotal,
          })}
        </p>
      ) : null}
      {!hasChunkInfo && file ? (
        <p dir="ltr" className="mt-1 w-full max-w-sm truncate text-[13px] text-muted-foreground">
          {file.name}
        </p>
      ) : null}
      {!!chunkProgress?.resumedChunks && (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {t("dssa.importResumed", { count: chunkProgress.resumedChunks })}
        </p>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={onCancel}
        className={cn(SECONDARY_ACTION_CLASS, "mt-5")}
      >
        {t("notes.upload.cancelTranscription")}
      </Button>
    </div>
  );
}

interface FolderSelectProps {
  t: (key: string) => string;
  folders: FolderItem[];
  value: string;
  onChange: (val: string) => void;
  includeCreateNew?: boolean;
  className?: string;
}

function FolderSelect({
  t,
  folders,
  value,
  onChange,
  includeCreateNew,
  className,
}: FolderSelectProps) {
  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-52 rounded-full px-3.5 text-sm [&>svg]:h-3.5 [&>svg]:w-3.5">
          <SelectValue placeholder={t("notes.upload.selectFolder")} />
        </SelectTrigger>
        <SelectContent>
          {folders.map((f) => {
            const isMeetings = f.name === MEETINGS_FOLDER_NAME && !!f.is_default;
            return (
              <SelectItem
                key={f.id}
                value={String(f.id)}
                disabled={isMeetings}
                className="text-sm py-1.5 ps-2.5 pe-7 rounded-md"
              >
                <span className="flex items-center gap-1.5">
                  <span dir="auto">{f.name}</span>
                  {isMeetings && (
                    <span className="text-[9px] uppercase tracking-wider text-foreground/45 font-medium">
                      {t("notes.folders.soon")}
                    </span>
                  )}
                </span>
              </SelectItem>
            );
          })}
          {includeCreateNew && (
            <>
              <SelectSeparator />
              <SelectItem value="__create_new__" className="text-sm py-1.5 ps-2.5 pe-7 rounded-md">
                <span className="flex items-center gap-1.5 text-primary">
                  <Plus size={12} />
                  {t("notes.upload.newFolder")}
                </span>
              </SelectItem>
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

interface CompleteViewProps {
  durationSeconds?: number | null;
  t: (key: string, options?: Record<string, unknown>) => string;
  result: string;
  partialWarning: { failed: number; total: number } | null;
  diarizationWarning: boolean;
  alignmentWarning?: boolean;
  checkpointWarning: boolean;
  folders: FolderItem[];
  selectedFolderId: string;
  handleFolderChange: (val: string) => void;
  noteId: number | null;
  onNoteCreated?: (noteId: number, folderId: number | null) => void;
  reset: () => void;
}

function CompleteView({
  alignmentWarning,
  durationSeconds,
  t,
  result,
  partialWarning,
  diarizationWarning,
  checkpointWarning,
  folders,
  selectedFolderId,
  handleFolderChange,
  noteId,
  onNoteCreated,
  reset,
}: CompleteViewProps) {
  return (
    <div
      className={cn(CARD_SURFACE_CLASS, "flex flex-col items-center px-6 py-10 text-center")}
      style={{ animation: "float-up 0.3s ease-out" }}
    >
      <div className="relative w-12 h-12 mb-4">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            strokeWidth="1.5"
            className="stroke-success/20"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            strokeWidth="1.5"
            className="stroke-success"
            strokeDasharray="94.25"
            strokeLinecap="round"
            style={{ animation: "ring-fill 0.8s ease-out forwards" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-5 h-5 text-success" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="24"
              strokeDashoffset="24"
              style={{ animation: "draw-check 0.4s ease-out 0.5s forwards" }}
            />
          </svg>
        </div>
      </div>

      <p className="text-[15px] font-medium text-foreground">
        {t("notes.upload.transcriptionComplete")}
      </p>
      {typeof durationSeconds === "number" && durationSeconds > 0 && (
        <p className="mt-1 text-sm tabular-nums text-muted-foreground">
          {t("dssa.importAudioLength", { time: formatImportClock(durationSeconds) })}
        </p>
      )}
      <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground line-clamp-2">
        {result.slice(0, 150)}
      </p>

      <UploadCompleteWarnings
        alignmentWarning={alignmentWarning}
        partialWarning={partialWarning}
        diarizationWarning={diarizationWarning}
        checkpointWarning={checkpointWarning}
        t={t}
      />

      {folders.length > 0 && (
        <FolderSelect
          t={t}
          folders={folders}
          value={selectedFolderId}
          onChange={handleFolderChange}
          includeCreateNew
          className="mt-5"
        />
      )}

      <div className="mt-5 flex items-center gap-2">
        {noteId != null && onNoteCreated && (
          <Button
            onClick={() =>
              onNoteCreated(noteId, selectedFolderId ? Number(selectedFolderId) : null)
            }
            className={PRIMARY_ACTION_CLASS}
          >
            {t("notes.upload.openNote")}
          </Button>
        )}
        <Button variant="ghost" onClick={reset} className={SECONDARY_ACTION_CLASS}>
          {t("notes.upload.uploadAnother")}
        </Button>
      </div>
    </div>
  );
}

interface ErrorViewProps {
  t: (key: string) => string;
  error: string;
  reset: () => void;
  onRetry: () => void;
}

function ErrorView({ t, error, reset, onRetry }: ErrorViewProps) {
  return (
    <div className="flex flex-col gap-4" style={{ animation: "float-up 0.3s ease-out" }}>
      <div className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 dark:bg-destructive/10">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-destructive" />
        <p className="flex-1 text-sm leading-relaxed text-destructive">{error}</p>
        <button
          onClick={reset}
          aria-label={t("common.close")}
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-foreground/45 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button onClick={onRetry} className={PRIMARY_ACTION_CLASS}>
          {t("notes.upload.retry")}
        </Button>
        <Button variant="ghost" onClick={reset} className={SECONDARY_ACTION_CLASS}>
          {t("notes.upload.startOver")}
        </Button>
      </div>
    </div>
  );
}
