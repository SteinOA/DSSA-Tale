import type {
  FileTranscriptionConfig,
  FileTranscriptionResult,
  DiarizationSettings,
} from "../services/fileTranscription";
import type { NoteItem } from "./electron";
export type CloudSource = "google" | "microsoft" | "apple";
export interface ImportJob {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  state: string;
  updatedAt: number;
  noteId?: number;
  error?: string;
  disabled?: boolean;
  canceled?: boolean;
  configuration: {
    transcription: Pick<
      FileTranscriptionConfig,
      "useLocalWhisper" | "localTranscriptionProvider" | "whisperModel" | "language"
    >;
    diarization: DiarizationSettings;
    folderId: number | null;
  };
  completedStages: string[];
  stages?: {
    transcription?: FileTranscriptionResult;
    final?: FileTranscriptionResult;
    diarization?: Awaited<ReturnType<NonNullable<Window["electronAPI"]["diarizeAudioFile"]>>>;
    alignment?: Awaited<ReturnType<NonNullable<Window["electronAPI"]["alignAudioFile"]>>>;
  };
}
export interface CloudConnection {
  source: CloudSource;
  path: string;
  available: boolean;
  candidates: string[];
}
export interface ConnectionResult extends DssaResult {
  connections?: CloudConnection[];
  mode?: string;
}
export interface MicrosoftItem {
  id: string;
  name?: string;
  subject?: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  start?: { dateTime: string; timeZone: string };
  onlineMeeting?: { joinUrl?: string };
  webLink?: string;
  size?: number;
}
export interface RecordingLibrary {
  id: string;
  label: string;
  kind: string;
  available: boolean;
}
export interface DssaResult {
  success?: boolean;
  canceled?: boolean;
  error?: string;
  filePath?: string;
  name?: string;
  size?: number;
}
export interface MicrosoftStatus extends DssaResult {
  configured: boolean;
  connected: boolean;
  user: string;
  clientId: string;
}
export interface GoogleDriveStatus extends DssaResult {
  configured: boolean;
  connected: boolean;
  user: string;
  folder: { id: string; name: string };
}
export interface GoogleDriveItem {
  id: string;
  name: string;
  mimeType: string;
  folder: boolean;
  size?: string;
}
export interface MeetingSetupStatus extends DssaResult {
  sileroInstalled?: boolean;
  busy: boolean;
  phase: string;
  kind?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  device?: string;
  runtime: boolean;
  runtimeDevice?: string;
  community: boolean;
  alignment: Record<string, Record<string, string>>;
  credential: boolean;
}
export interface HardwareProfile {
  error?: string;
  checkedAt: number;
  cpu: { model: string; vendor: string; logicalCpus: number };
  adapters: Array<{
    name: string;
    vendor: string;
    dedicatedBytes: number;
    sharedBytes: number;
    software: boolean;
  }>;
  policy: {
    totalBytes: number;
    availableBytes: number;
    budgetBytes: number;
    reserveBytes: number;
    tier: string;
    cpuThreads: number;
    alignmentWindowSeconds: number;
  };
  recommendations: {
    speech: {
      recommended: string;
      quantizedFits: boolean;
      fullFits: boolean;
      quantizedBytes: number;
      fullBytes: number;
    };
    languageModels: Array<{
      id: string;
      name: string;
      sizeBytes: number;
      estimatedRamBytes: number;
      fitsRam: boolean;
      fitsGpu: boolean;
      cleanupCheck?: {
        cases: number;
        accepted: number;
        rejected: number;
        unchanged: number;
        sha256: string;
      } | null;
    }>;
    recommendedLanguageModel: string | null;
    suggestedBackend: string;
    alignmentMode: string;
  };
}
declare global {
  interface Window {
    dssaAPI: {
      speakerSamples: (
        noteId: number,
        speaker: string
      ) => Promise<
        DssaResult & { available: boolean; samples: Array<{ start: number; end: number }> }
      >;
      speakerAttach: (noteId: number) => Promise<DssaResult>;
      speakerClip: (
        noteId: number,
        speaker: string,
        index: number
      ) => Promise<DssaResult & { audioBase64?: string; start?: number; end?: number }>;
      importBegin: (args: {
        filePath: string;
        configuration: ImportJob["configuration"];
        resumeId?: string;
      }) => Promise<ImportJob>;
      importJobs: () => Promise<ImportJob[]>;
      importResume: (id: string) => Promise<ImportJob>;
      importLocate: (id: string) => Promise<ImportJob>;
      importStage: (id: string, stage: string, result: unknown) => Promise<DssaResult>;
      importPause: (id: string) => Promise<DssaResult>;
      importDismiss: (id: string) => Promise<DssaResult>;
      importCommit: (args: {
        id: string;
        title: string;
      }) => Promise<{ success: boolean; note?: NoteItem; error?: string }>;
      hardwareProfile: (refresh?: boolean) => Promise<HardwareProfile>;
      connections: () => Promise<ConnectionResult>;
      chooseConnectionFolder: (source: CloudSource) => Promise<ConnectionResult>;
      useDetectedConnectionFolder: (source: CloudSource, path: string) => Promise<ConnectionResult>;
      removeConnectionFolder: (source: CloudSource) => Promise<ConnectionResult>;
      openConnectionFolder: (source: CloudSource) => Promise<DssaResult>;
      openConnectionLogin: (source: CloudSource) => Promise<ConnectionResult>;
      resourceUsage: () => Promise<{
        app: {
          cpuPercent: number | null;
          ramUsedBytes: number;
          processCount: number;
          gpu: {
            percent: number | null;
            dedicatedBytes: number | null;
            sharedBytes: number | null;
          } | null;
        } | null;
        cpuPercent: number | null;
        ramUsedBytes: number;
        ramTotalBytes: number;
        gpu: { name: string; percent: number; usedBytes: number; totalBytes: number } | null;
        sampledAt: number;
      }>;
      recordingLibraries: () => Promise<RecordingLibrary[]>;
      addRecordingLibrary: (args: {
        kind: string;
        label: string;
      }) => Promise<DssaResult & { libraries?: RecordingLibrary[] }>;
      removeRecordingLibrary: (
        id: string
      ) => Promise<DssaResult & { libraries?: RecordingLibrary[] }>;
      exportDocument: (options: {
        noteId: number;
        format: string;
        source: string;
        timestamps: boolean;
        speakers: boolean;
        language?: string;
      }) => Promise<DssaResult>;
      microsoftStatus: () => Promise<MicrosoftStatus>;
      meetingSetupStatus: () => Promise<MeetingSetupStatus>;
      meetingSetupStart: (args: {
        kind: string;
        language?: string;
        device?: string;
      }) => Promise<DssaResult>;
      meetingSetupCancel: () => Promise<DssaResult>;
      meetingSetupCredential: (token: string) => Promise<DssaResult>;
      meetingSetupForget: () => Promise<DssaResult>;
      googleDriveStatus: () => Promise<GoogleDriveStatus>;
      googleDriveClient: () => Promise<DssaResult>;
      googleDriveConnect: () => Promise<GoogleDriveStatus>;
      googleDriveDisconnect: () => Promise<GoogleDriveStatus>;
      googleDriveList: (args: { folder?: string; query?: string; pageToken?: string }) => Promise<{
        success?: boolean;
        error?: string;
        items: GoogleDriveItem[];
        next: string | null;
      }>;
      googleDrivePin: (folder: string) => Promise<GoogleDriveStatus>;
      googleDriveDownload: (itemId: string) => Promise<DssaResult>;
      googleDriveUpload: (folder: string) => Promise<DssaResult>;
      microsoftConnect: (clientId?: string) => Promise<MicrosoftStatus>;
      microsoftDisconnect: () => Promise<MicrosoftStatus>;
      microsoftList: (args: {
        kind: string;
        query?: string;
        siteId?: string;
        driveId?: string;
        itemId?: string;
        next?: string;
      }) => Promise<{ items: MicrosoftItem[]; next: string | null; error?: string }>;
      microsoftDownload: (args: {
        driveId: string;
        itemId: string;
        forImport?: boolean;
      }) => Promise<DssaResult>;
      microsoftUpload: (args: { driveId: string; itemId?: string }) => Promise<DssaResult>;
      openMicrosoftLink: (url: string) => Promise<DssaResult>;
      localFolders: () => Promise<{ name: string; path: string }[]>;
      openLocalFolder: () => Promise<DssaResult>;
    };
  }
}
