const test = require("node:test"),
  assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");
const config = {
  useLocalWhisper: true,
  localTranscriptionProvider: "whisper",
  whisperModel: "nb-large",
  parakeetModel: "",
  isOpenWhisprCloud: false,
  getApiKey: () => "",
  cloudTranscriptionProvider: "openai",
  cloudTranscriptionBaseUrl: "",
  cloudTranscriptionModel: "",
  language: "nn",
};
async function setup(t) {
  const { window } = installBrowserGlobals(t);
  const vite = await createRendererServer(t, {
    cachePrefix: "dssa-file-alignment-",
    mockModules: { "/lib/auth": "export const withSessionRefresh=fn=>fn();" },
  });
  const mod = await vite.ssrLoadModule("/services/fileTranscription.ts");
  const calls = [];
  const original = [{ text: "Eg er samd.", start: 0, end: 2 }];
  window.electronAPI.transcribeAudioFile = async () => {
    calls.push("asr");
    return { success: true, text: "Eg er samd.", segments: original, durationSeconds: 2 };
  };
  window.electronAPI.diarizeAudioFile = async () => {
    calls.push("voices");
    return { success: true, segments: [{ start: 0, end: 2, speaker: "speaker_0" }] };
  };
  window.electronAPI.mergeSpeakerText = async (_v, text, _d, segments) => {
    calls.push("merge");
    assert.equal(text, "Eg er samd.");
    return { success: true, text, segments: segments.map((s) => ({ ...s, speaker: "speaker_0" })) };
  };
  return { ...mod, window, calls, original };
}
const settings = {
  enabled: true,
  localModelsReady: true,
  numSpeakers: 15,
  engine: "community-1",
  alignment: "fast",
};

test("resuming a local import reuses persisted ASR and voices, then saves its final stage", async (t) => {
  const x = await setup(t),
    stages = [];
  let paused = false;
  x.window.dssaAPI = {
    importBegin: async (args) => {
      assert.equal(args.configuration.transcription.language, "nn");
      assert.equal(args.configuration.transcription.getApiKey, undefined);
      return {
        id: "saved-job",
        path: "saved.mp3",
        stages: {
          transcription: {
            success: true,
            text: "Eg er samd.",
            segments: x.original,
            durationSeconds: 2,
          },
          diarization: { success: true, segments: [{ start: 0, end: 2, speaker: "speaker_0" }] },
        },
      };
    },
    importStage: async (_id, stage) => {
      stages.push(stage);
      return { success: true };
    },
    importPause: async () => {
      paused = true;
      return { success: true };
    },
  };
  x.window.electronAPI.alignAudioFile = async (_file, options) => {
    assert.equal(options.recoveryJobId, "saved-job");
    return { success: true, segments: x.original, applied: 1 };
  };
  const result = await x.transcribeFileWithSpeakers("original.mp3", config, settings, 2, {
    recoveryJobId: "saved-job",
  });
  assert.equal(result.recoveryJobId, "saved-job");
  assert.equal(result.text, "Eg er samd.");
  assert.deepEqual(x.calls, ["merge"]);
  assert.deepEqual(stages, ["alignment", "final"]);
  assert.equal(paused, true);
});

test("cancelled speaker processing never creates a successful late result", async (t) => {
  const x = await setup(t);
  x.window.electronAPI.diarizeAudioFile = async () => ({
    success: false,
    code: "UPLOAD_CANCELLED",
  });
  const result = await x.transcribeFileWithSpeakers("file.mp3", config, settings, 2);
  assert.equal(result.success, false);
  assert.equal(result.code, "UPLOAD_CANCELLED");
  assert.ok(!x.calls.includes("merge"));
});

test("file alignment runs after ASR and voices, then passes real word clocks to the merge", async (t) => {
  const x = await setup(t);
  x.window.electronAPI.alignAudioFile = async (_file, options) => {
    x.calls.push("align");
    assert.equal(options.language, "nn");
    assert.equal(options.requestId, "request");
    return {
      success: true,
      segments: [{ ...x.original[0], words: [{ text: "Eg", start: 0.1, end: 0.3 }] }],
    };
  };
  const result = await x.transcribeFileWithSpeakers("/tmp/test.wav", config, settings, null, {
    requestId: "request",
  });
  assert.deepEqual(x.calls, ["asr", "voices", "align", "merge"]);
  assert.equal(result.text, "Eg er samd.");
  assert.equal(result.segments[0].words[0].start, 0.1);
});
test("missing or failed helper preserves a successful original transcript", async (t) => {
  const x = await setup(t);
  x.window.electronAPI.alignAudioFile = async () => ({ success: false, code: "ALIGNMENT_FAILED" });
  const result = await x.transcribeFileWithSpeakers("/tmp/test.wav", config, settings);
  assert.equal(result.success, true);
  assert.equal(result.alignmentWarning, true);
  assert.equal(result.text, "Eg er samd.");
  assert.equal(result.segments[0].start, 0);
});
test("available RAM refusal preserves the original nynorsk and speaker merge", async (t) => {
  const x = await setup(t);
  x.window.electronAPI.alignAudioFile = async () => ({ success: false, code: "INSUFFICIENT_RAM" });
  const result = await x.transcribeFileWithSpeakers("/tmp/test.wav", config, settings);
  assert.equal(result.success, true);
  assert.equal(result.text, "Eg er samd.");
  assert.equal(result.alignmentWarning, true);
});
test("speaker range reaches the local model without changing the transcript", async (t) => {
  const x = await setup(t);
  x.window.electronAPI.diarizeAudioFile = async (_path, options) => {
    assert.equal(options.numSpeakers, 9);
    assert.equal(options.minSpeakers, 8);
    return { success: true, segments: [{ start: 0, end: 2, speaker: "speaker_0" }] };
  };
  const result = await x.transcribeFileWithSpeakers("/tmp/test.wav", config, {
    ...settings,
    alignment: "off",
    numSpeakers: 9,
    minSpeakers: 8,
  });
  assert.equal(result.success, true);
  assert.equal(result.text, "Eg er samd.");
});
test("cancelling alignment does not merge or save a late successful import", async (t) => {
  const x = await setup(t);
  x.window.electronAPI.alignAudioFile = async () => ({ success: false, code: "UPLOAD_CANCELLED" });
  const result = await x.transcribeFileWithSpeakers("/tmp/test.wav", config, settings);
  assert.equal(result.success, false);
  assert.equal(result.code, "UPLOAD_CANCELLED");
  assert.equal(x.calls.includes("merge"), false);
});
test("alignment Off leaves existing behavior unchanged", async (t) => {
  const x = await setup(t);
  x.window.electronAPI.alignAudioFile = async () => {
    throw Error("Must not be called");
  };
  const result = await x.transcribeFileWithSpeakers("/tmp/test.wav", config, {
    ...settings,
    alignment: "off",
  });
  assert.equal(result.success, true);
  assert.equal(result.alignmentWarning, undefined);
});
