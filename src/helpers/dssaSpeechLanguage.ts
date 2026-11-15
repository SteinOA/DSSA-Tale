import registry from "../models/modelRegistryData.json";

export function isNorwegianSpeechLanguage(language: string) {
  return ["no", "nb", "nn"].includes(language.toLowerCase().replace(/_/g, "-").split("-")[0]);
}

export function supportsNorwegianSpeech(model: string) {
  const models: Record<string, { supportedLanguages?: string[] }> = registry.parakeetModels;
  // Unknown models are not silently reinterpreted. Known model capabilities are
  // authoritative, including multilingual models which do not include Norwegian.
  const info = models[model];
  return !info || (info.supportedLanguages || []).some(isNorwegianSpeechLanguage);
}

interface SpeechSettings {
  preferredLanguage: string;
  localTranscriptionProvider: string;
  parakeetModel: string;
  cohereModel: string;
  meetingLocalTranscriptionProvider: string;
  meetingParakeetModel: string;
  meetingCohereModel: string;
  uploadLocalTranscriptionProvider: string;
  uploadParakeetModel: string;
  uploadCohereModel: string;
}

export function norwegianSpeechProviderPatch(settings: SpeechSettings): Record<string, "whisper"> {
  if (!isNorwegianSpeechLanguage(settings.preferredLanguage)) return {};
  const patch: Record<string, "whisper"> = {};
  for (const prefix of ["", "meeting", "upload"] as const) {
    const providerKey = prefix
      ? `${prefix}LocalTranscriptionProvider`
      : "localTranscriptionProvider";
    const provider = settings[providerKey as keyof SpeechSettings];
    if (provider !== "nvidia" && provider !== "cohere") continue;
    const modelKey = provider === "cohere" ? "cohereModel" : "parakeetModel";
    const scopedModelKey = prefix
      ? `${prefix}${modelKey[0].toUpperCase()}${modelKey.slice(1)}`
      : modelKey;
    const model = settings[scopedModelKey as keyof SpeechSettings] || settings[modelKey];
    if (model && !supportsNorwegianSpeech(model)) patch[providerKey] = "whisper";
  }
  return patch;
}
