const test = require("node:test");
const assert = require("node:assert/strict");
const {
  norwegianSpeechProviderPatch,
  supportsNorwegianSpeech,
} = require("../../src/helpers/dssaSpeechLanguage.ts");
const settings = {
  preferredLanguage: "no",
  localTranscriptionProvider: "nvidia",
  parakeetModel: "nemotron-speech-streaming-en-0.6b",
  cohereModel: "",
  meetingLocalTranscriptionProvider: "nvidia",
  meetingParakeetModel: "",
  meetingCohereModel: "",
  uploadLocalTranscriptionProvider: "whisper",
  uploadParakeetModel: "",
  uploadCohereModel: "",
};
test("Norwegian dictation and inherited meeting engines reject English Nemotron", () => {
  assert.deepEqual(norwegianSpeechProviderPatch(settings), {
    localTranscriptionProvider: "whisper",
    meetingLocalTranscriptionProvider: "whisper",
  });
  assert.equal(settings.parakeetModel, "nemotron-speech-streaming-en-0.6b");
});
test("English and automatic language choices retain their selected engine", () => {
  for (const language of ["en", "auto"])
    assert.deepEqual(
      norwegianSpeechProviderPatch({ ...settings, preferredLanguage: language }),
      {}
    );
});
test("Bokmaal and Nynorsk variants are guarded; multilingual is not a promise of Norwegian", () => {
  for (const language of ["nb-NO", "nn", "no"])
    assert.equal(
      norwegianSpeechProviderPatch({ ...settings, preferredLanguage: language })
        .localTranscriptionProvider,
      "whisper"
    );
  assert.equal(supportsNorwegianSpeech("parakeet-tdt-0.6b-v3"), false);
});
test("Already selected Whisper is stable, with no further reconciliation", () => {
  const repaired = { ...settings, ...norwegianSpeechProviderPatch(settings) };
  assert.deepEqual(norwegianSpeechProviderPatch(repaired), {});
});
