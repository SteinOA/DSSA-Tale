// Applied before settingsStore loads. Never replace a user's chosen local model,
// endpoint, language or hotkey. Keep a rollback copy of touched settings.
export function initializeDssaDefaults(storage: Storage) {
  // Requested Norwegian-only recovery from the first test profile, whose GPU
  // selection had switched dictation to English Nemotron. Keep a rollback and
  // preserve either previously selected NB-Whisper model and Norwegian variant.
  if (!storage.getItem("dssaNorwegianSpeechMigrationV1")) {
    const keys = [
      "preferredLanguage",
      "whisperModel",
      "localTranscriptionProvider",
      "meetingLocalTranscriptionProvider",
      "uploadLocalTranscriptionProvider",
    ];
    storage.setItem(
      "dssaSpeechBeforeNorwegianRecovery",
      JSON.stringify(Object.fromEntries(keys.map((key) => [key, storage.getItem(key)])))
    );
    const language = (storage.getItem("preferredLanguage") || "").toLowerCase().split("-")[0];
    if (!["no", "nb", "nn"].includes(language)) storage.setItem("preferredLanguage", "no");
    if (!["nb-large", "nb-large-full"].includes(storage.getItem("whisperModel") || ""))
      storage.setItem("whisperModel", "nb-large");
    for (const key of keys.slice(2)) storage.setItem(key, "whisper");
    storage.setItem("dssaNorwegianSpeechMigrationV1", "true");
  }
  // The ready cue plays after the microphone opens and can leak back through
  // speakers. Apply once to existing test profiles too; a later manual choice
  // in Settings is respected on subsequent starts.
  if (!storage.getItem("dssaQuietCuesMigrationV1")) {
    storage.setItem(
      "dssaAudioCuesBeforeQuietMigration",
      JSON.stringify({ audioCuesEnabled: storage.getItem("audioCuesEnabled") })
    );
    storage.setItem("audioCuesEnabled", "false");
    storage.setItem("dssaQuietCuesMigrationV1", "true");
  }
  if (storage.getItem("dssaLocalMigrationV1")) return;
  const previous: Record<string, string | null> = {};
  const set = (key: string, value: string, onlyMissing = false) => {
    const old = storage.getItem(key);
    if (onlyMissing && old !== null && old !== "") return;
    previous[key] = old;
    storage.setItem(key, value);
  };
  for (const key of ["transcriptionMode", "meetingTranscriptionMode", "uploadTranscriptionMode"]) {
    if (!["local", "self-hosted"].includes(storage.getItem(key) || "")) set(key, "local");
  }
  for (const key of [
    "cleanupMode",
    "noteFormattingMode",
    "chatAgentMode",
    "dictationAgentMode",
    "translationMode",
  ]) {
    if (!["local", "self-hosted"].includes(storage.getItem(key) || "")) set(key, "local");
  }
  set("uiLanguage", "nb", true);
  set("whisperModel", "nb-large", true);
  set("preferredLanguage", "no", true);
  set("localTranscriptionProvider", "whisper", true);
  set("useCleanupModel", "false", true);
  set("useDictationAgent", "false", true);
  set("useLocalWhisper", "true");
  set("meetingUseLocalWhisper", "true");
  set("uploadUseLocalWhisper", "true");
  set("isSignedIn", "false");
  set("authenticationSkipped", "true");
  set("skipAuth", "true");
  set("autoUpdatesEnabled", "false");
  storage.setItem("dssaSettingsBeforeMigrationV1", JSON.stringify(previous));
  storage.setItem("dssaLocalMigrationV1", "true");
}
if (typeof localStorage !== "undefined") initializeDssaDefaults(localStorage);
