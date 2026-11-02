const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

function localConfig() {
  return {
    useLocalWhisper: true,
    localTranscriptionProvider: "whisper",
    whisperModel: "base",
    parakeetModel: "parakeet-tdt-0.6b-v3",
    cohereModel: "command-a-transcribe",
    isOpenWhisprCloud: false,
    getApiKey: () => "",
    cloudTranscriptionProvider: "openai",
    cloudTranscriptionBaseUrl: "",
    cloudTranscriptionModel: "whisper-1",
    language: "en",
    transcriptionMode: "providers",
  };
}

test("Community-1 waits for transcription before allocating its GPU pipeline", async (t) => {
  const { window, transcribeFileWithSpeakers } = await loadFileTranscription(t);
  const calls = [];
  window.electronAPI.getDiarizationModelStatus = async () => ({
    available: true,
    modelsDownloaded: true,
    engine: "community-1",
  });
  window.electronAPI.transcribeAudioFile = async () => {
    calls.push("transcription-start");
    await new Promise((resolve) => setTimeout(resolve, 10));
    calls.push("transcription-end");
    return {
      success: true,
      text: "Norsk tale.",
      segments: [{ start: 0, end: 1, text: "Norsk tale." }],
    };
  };
  window.electronAPI.diarizeAudioFile = async () => {
    calls.push("diarization");
    return { success: false };
  };
  await transcribeFileWithSpeakers("/tmp/public.wav", localConfig(), {
    enabled: true,
    localModelsReady: true,
    numSpeakers: 12,
  });
  assert.deepEqual(calls, ["transcription-start", "transcription-end", "diarization"]);
});
test("failed transcription never starts a later Community-1 GPU job", async (t) => {
  const { window, transcribeFileWithSpeakers } = await loadFileTranscription(t);
  let calls = 0;
  window.electronAPI.getDiarizationModelStatus = async () => ({
    available: true,
    modelsDownloaded: true,
    engine: "community-1",
  });
  window.electronAPI.transcribeAudioFile = async () => ({ success: false, error: "Cancelled" });
  window.electronAPI.diarizeAudioFile = async () => {
    calls++;
    return { success: false };
  };
  const result = await transcribeFileWithSpeakers("/tmp/public.wav", localConfig(), {
    enabled: true,
    localModelsReady: true,
    numSpeakers: 14,
  });
  assert.equal(result.success, false);
  assert.equal(calls, 0);
});

async function loadFileTranscription(t) {
  const { window } = installBrowserGlobals(t);
  const vite = await createRendererServer(t, {
    cachePrefix: "openwhispr-file-diarization-warning-test-",
    mockModules: {
      "/lib/auth": "export const withSessionRefresh = (fn) => fn();",
    },
  });
  const mod = await vite.ssrLoadModule("/services/fileTranscription.ts");
  window.electronAPI.transcribeAudioFile = async () => ({
    success: true,
    text: "Plain transcript",
    segments: [{ text: "Plain transcript", start: 0, end: 2 }],
  });
  return { window, ...mod };
}

test("local file imports forward Nynorsk and preserve the decoded duration without diarization", async (t) => {
  const { window, transcribeFileWithSpeakers } = await loadFileTranscription(t);
  const seen = [];
  window.electronAPI.transcribeAudioFile = async (_file, options) => {
    seen.push(options);
    return { success: true, text: "Eg vil ikkje byte målform.", durationSeconds: 123.5 };
  };
  const result = await transcribeFileWithSpeakers(
    "/tmp/test.wav",
    {
      ...localConfig(),
      localTranscriptionProvider: "whisper",
      whisperModel: "nb-large",
      language: "nn",
    },
    { enabled: false, localModelsReady: false }
  );
  assert.equal(seen[0].language, "nn");
  assert.equal(seen[0].model, "nb-large");
  assert.equal(result.durationSeconds, 123.5);
  assert.equal(result.text, "Eg vil ikkje byte målform.");
});

test("keeps the transcript and warns when local speaker identification fails", async (t) => {
  const { window, transcribeFileWithSpeakers } = await loadFileTranscription(t);
  window.electronAPI.diarizeAudioFile = async () => ({
    success: false,
    error: "Speaker identification failed",
  });

  const result = await transcribeFileWithSpeakers("/tmp/audio.wav", localConfig(), {
    enabled: true,
    localModelsReady: true,
    numSpeakers: null,
  });

  assert.equal(result.success, true);
  assert.equal(result.text, "Plain transcript");
  assert.equal(result.diarizationWarning, true);
});

test("keeps the transcript and warns when speaker labels cannot be merged", async (t) => {
  const { window, transcribeFileWithSpeakers } = await loadFileTranscription(t);
  window.electronAPI.diarizeAudioFile = async () => ({
    success: true,
    segments: [{ speaker: "speaker_00", start: 0, end: 2 }],
  });
  window.electronAPI.mergeSpeakerText = async () => ({
    success: false,
    error: "Merge failed",
  });

  const result = await transcribeFileWithSpeakers("/tmp/audio.wav", localConfig(), {
    enabled: true,
    localModelsReady: true,
    numSpeakers: null,
  });

  assert.equal(result.success, true);
  assert.equal(result.text, "Plain transcript");
  assert.equal(result.diarizationWarning, true);
});

// The diarize handler returns no segments when it discards a collapsed run.
test("warns and keeps the measured duration when diarization returns no segments", async (t) => {
  const { window, transcribeFileWithSpeakers } = await loadFileTranscription(t);
  let mergeCalls = 0;
  window.electronAPI.diarizeAudioFile = async () => ({
    success: true,
    segments: [],
    durationSeconds: 1188,
  });
  window.electronAPI.mergeSpeakerText = async () => {
    mergeCalls += 1;
    return { success: true, text: "Speaker 1: Plain transcript" };
  };

  const result = await transcribeFileWithSpeakers("/tmp/audio.wav", localConfig(), {
    enabled: true,
    localModelsReady: true,
    numSpeakers: null,
  });

  assert.equal(mergeCalls, 0);
  assert.equal(result.text, "Plain transcript");
  assert.equal(result.diarizationWarning, true);
  assert.equal(result.durationSeconds, 1188);
});

test("does not warn when speaker labels are merged", async (t) => {
  const { window, transcribeFileWithSpeakers } = await loadFileTranscription(t);
  window.electronAPI.diarizeAudioFile = async () => ({
    success: true,
    segments: [{ speaker: "speaker_00", start: 0, end: 2 }],
  });
  const mergeCalls = [];
  const attributed = [{ text: "Plain transcript", start: 0, end: 2, speaker: "speaker_0" }];
  window.electronAPI.mergeSpeakerText = async (...args) => {
    mergeCalls.push(args);
    return { success: true, text: "Speaker 1: Plain transcript", segments: attributed };
  };

  const result = await transcribeFileWithSpeakers("/tmp/audio.wav", localConfig(), {
    enabled: true,
    localModelsReady: true,
    numSpeakers: null,
  });

  assert.equal(result.text, "Speaker 1: Plain transcript");
  assert.equal(result.diarizationWarning, undefined);
  assert.equal(result.diarized, true);
  assert.deepEqual(result.segments, attributed);
  assert.equal(mergeCalls.length, 1);
  assert.deepEqual(mergeCalls[0][3], [{ text: "Plain transcript", start: 0, end: 2 }]);
  assert.equal(mergeCalls[0][4], "en");
});

test("missing actual ASR timings keeps plain text and warns without calling the legacy proportional merge", async (t) => {
  const { window, transcribeFileWithSpeakers } = await loadFileTranscription(t);
  let mergeCalls = 0;
  window.electronAPI.transcribeAudioFile = async () => ({
    success: true,
    text: "Plain transcript",
    durationSeconds: 60,
  });
  window.electronAPI.diarizeAudioFile = async () => ({
    success: true,
    segments: [{ start: 0, end: 60, speaker: "one" }],
  });
  window.electronAPI.mergeSpeakerText = async () => {
    mergeCalls++;
    throw Error("must not guess");
  };
  const result = await transcribeFileWithSpeakers("/tmp/audio.wav", localConfig(), {
    enabled: true,
    localModelsReady: true,
    numSpeakers: 2,
  });
  assert.equal(mergeCalls, 0);
  assert.equal(result.text, "Plain transcript");
  assert.equal(result.diarizationWarning, true);
  assert.equal(result.diarized, undefined);
});

test("unknown timed speakers retain their structured timeline and propagate a warning", async (t) => {
  const { window, transcribeFileWithSpeakers } = await loadFileTranscription(t);
  const attributed = [{ text: "Plain transcript", start: 0, end: 2 }];
  window.electronAPI.diarizeAudioFile = async () => ({
    success: true,
    segments: [{ start: 0, end: 2, speaker: "one" }],
  });
  window.electronAPI.mergeSpeakerText = async () => ({
    success: true,
    text: "[Unknown Speaker] Plain transcript",
    segments: attributed,
    diarizationWarning: true,
  });
  const result = await transcribeFileWithSpeakers("/tmp/audio.wav", localConfig(), {
    enabled: true,
    localModelsReady: true,
    numSpeakers: 2,
  });
  assert.deepEqual(result.segments, attributed);
  assert.equal(result.diarizationWarning, true);
  assert.equal(result.diarized, false);
});

test("a legacy text-only merge response is not accepted as verified timestamped attribution", async (t) => {
  const { window, transcribeFileWithSpeakers } = await loadFileTranscription(t);
  window.electronAPI.diarizeAudioFile = async () => ({
    success: true,
    segments: [{ start: 0, end: 2, speaker: "one" }],
  });
  window.electronAPI.mergeSpeakerText = async () => ({
    success: true,
    text: "[Speaker 1] Guessed assignment",
  });
  const result = await transcribeFileWithSpeakers("/tmp/audio.wav", localConfig(), {
    enabled: true,
    localModelsReady: true,
    numSpeakers: 2,
  });
  assert.equal(result.text, "Plain transcript");
  assert.equal(result.diarizationWarning, true);
});

test("does not warn when speaker detection is off", async (t) => {
  const { window, transcribeFileWithSpeakers } = await loadFileTranscription(t);
  let diarizeCalls = 0;
  window.electronAPI.diarizeAudioFile = async () => {
    diarizeCalls += 1;
    return { success: false };
  };

  const result = await transcribeFileWithSpeakers("/tmp/audio.wav", localConfig(), {
    enabled: false,
    localModelsReady: true,
    numSpeakers: null,
  });

  assert.equal(diarizeCalls, 0);
  assert.equal(result.diarizationWarning, undefined);
});

test("does not warn when the provider applied its own speaker labels", async (t) => {
  const { window, transcribeFileWithSpeakers } = await loadFileTranscription(t);
  window.electronAPI.transcribeAudioFile = async () => ({
    success: true,
    text: "[Speaker 1] Hola",
    diarized: true,
  });

  const result = await transcribeFileWithSpeakers("/tmp/audio.wav", localConfig(), {
    enabled: true,
    localModelsReady: true,
    numSpeakers: null,
  });

  assert.equal(result.diarizationWarning, undefined);
});

test("keeps the transcript and warns when the merge throws", async (t) => {
  const { window, transcribeFileWithSpeakers } = await loadFileTranscription(t);
  window.electronAPI.diarizeAudioFile = async () => ({
    success: true,
    segments: [{ speaker: "speaker_00", start: 0, end: 2 }],
  });
  window.electronAPI.mergeSpeakerText = async () => {
    throw new Error("merge crashed");
  };

  const result = await transcribeFileWithSpeakers("/tmp/audio.wav", localConfig(), {
    enabled: true,
    localModelsReady: true,
    numSpeakers: null,
  });

  assert.equal(result.text, "Plain transcript");
  assert.equal(result.diarizationWarning, true);
});

test("fetches the local speaker models before a run that needs them", async (t) => {
  const { resolveDiarizationSettings } = await loadFileTranscription(t);
  let ensureCalls = 0;

  const settings = await resolveDiarizationSettings({
    enabled: true,
    modelsReady: false,
    numSpeakers: null,
    config: localConfig(),
    ensureModels: async () => {
      ensureCalls += 1;
      return true;
    },
  });

  assert.equal(ensureCalls, 1);
  assert.deepEqual(settings, { enabled: true, localModelsReady: true, numSpeakers: null });
});

test("does not fetch local models when the provider diarizes server-side", async (t) => {
  const { resolveDiarizationSettings } = await loadFileTranscription(t);
  let ensureCalls = 0;

  const settings = await resolveDiarizationSettings({
    enabled: true,
    modelsReady: false,
    numSpeakers: 2,
    config: { ...localConfig(), useLocalWhisper: false, cloudTranscriptionProvider: "openai" },
    ensureModels: async () => {
      ensureCalls += 1;
      return true;
    },
  });

  assert.equal(ensureCalls, 0);
  assert.deepEqual(settings, { enabled: true, localModelsReady: false, numSpeakers: 2 });
});

test("does not fetch local models when speaker detection is off", async (t) => {
  const { resolveDiarizationSettings } = await loadFileTranscription(t);
  let ensureCalls = 0;

  const settings = await resolveDiarizationSettings({
    enabled: false,
    modelsReady: false,
    numSpeakers: null,
    config: localConfig(),
    ensureModels: async () => {
      ensureCalls += 1;
      return true;
    },
  });

  assert.equal(ensureCalls, 0);
  assert.equal(settings.enabled, false);
});

test("reports models unavailable when the download fails", async (t) => {
  const { resolveDiarizationSettings } = await loadFileTranscription(t);

  const settings = await resolveDiarizationSettings({
    enabled: true,
    modelsReady: false,
    numSpeakers: null,
    config: localConfig(),
    ensureModels: async () => false,
  });

  assert.equal(settings.localModelsReady, false);
});
