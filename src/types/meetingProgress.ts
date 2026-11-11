export interface MeetingProgress {
  noteId: number;
  processedSeconds: number;
  totalSeconds: number;
  completedChunks: number;
  totalChunks: number;
  elapsedSeconds: number;
  remainingSeconds: number | null;
}
