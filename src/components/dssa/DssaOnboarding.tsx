import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { createDssaTranslator } from "../../utils/dssaTranslation";
import { useModelDownload } from "../../hooks/useModelDownload";
import { Button } from "../ui/button";
import logo from "../../assets/icon.png";
import { OnboardingWindowControls } from "../onboarding/OnboardingShell";

export default function DssaOnboarding({
  onComplete,
}: {
  onComplete: (options?: { openSettings: boolean }) => void;
}) {
  const { i18n } = useTranslation();
  const { uiLanguage, setUiLanguage } = useSettingsStore();
  const tr = createDssaTranslator(i18n);
  const [step, setStep] = useState(0);
  const [model, setModel] = useState("small");
  const [installed, setInstalled] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [micReady, setMicReady] = useState(false);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  useEffect(() => {
    // The router leaves initial visibility to the onboarding surface.
    void window.electronAPI?.setOnboardingWindowMode?.("expanded");
  }, []);
  const refresh = useCallback(async () => {
    try {
      const result = await window.electronAPI.listWhisperModels();
      if (!result.success) throw new Error("Kunne ikke kontrollere talemodellene. Prøv igjen.");
      setInstalled(result.models.filter((m) => m.downloaded).map((m) => m.model));
      setChecked(true);
      setError("");
    } catch (e) {
      setError(String(e));
      setChecked(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const download = useModelDownload({
    modelType: "whisper",
    onDownloadComplete: () => {
      void refresh();
    },
  });
  const ready = checked && installed.includes(model);
  useEffect(() => {
    if (!testing) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        context = new AudioContext();
        await context.resume();
        if (stopped) return;
        const analyser = context.createAnalyser();
        context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        timer = setInterval(() => {
          analyser.getByteTimeDomainData(samples);
          const peak = Math.max(...samples.map((v) => Math.abs(v - 128))) / 128;
          setLevel(Math.min(100, Math.round(peak * 300)));
          if (peak > 0.025) setHeard(true);
        }, 100);
      } catch (e) {
        if (!stopped) {
          setError(String(e));
          setTesting(false);
        }
      }
    })();
    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      void context?.close();
    };
  }, [testing]);
  const finish = async () => {
    if (!ready || !micReady) return;
    // Disk truth is checked again before committing a usable local configuration.
    try {
      const result = await window.electronAPI.listWhisperModels();
      if (!result.success || !result.models.some((m) => m.model === model && m.downloaded)) {
        setChecked(false);
        setStep(1);
        setError("Talemodellen mangler. Last den ned før du fortsetter.");
        return;
      }
      const s = useSettingsStore.getState();
      s.setTranscriptionMode("local");
      s.setUseLocalWhisper(true);
      s.setLocalTranscriptionProvider("whisper");
      s.setWhisperModel(model);
      s.setMeetingTranscriptionMode("local");
      s.setMeetingUseLocalWhisper(true);
      s.setMeetingLocalTranscriptionProvider("whisper");
      s.setMeetingWhisperModel(model);
      s.setUploadTranscriptionMode("local");
      s.setUploadUseLocalWhisper(true);
      s.setUploadLocalTranscriptionProvider("whisper");
      s.setUploadWhisperModel(model);
      s.setPreferredLanguage(uiLanguage === "en" ? "en" : "no");
      s.setUseCleanupModel(false);
      localStorage.setItem("authenticationSkipped", "true");
      localStorage.setItem("skipAuth", "true");
      localStorage.removeItem("onboardingStep");
      await window.electronAPI?.setOnboardingWindowMode?.("restore");
      onComplete({ openSettings: false });
    } catch (e) {
      setError(String(e));
    }
  };
  const titles = [
    tr("Velkommen", "Welcome"),
    tr("Last ned talemodell", "Download speech model"),
    tr("Test mikrofon", "Test microphone"),
    tr("Ditt første opptak", "Your first recording"),
  ];
  return (
    <main className="relative h-screen overflow-y-auto bg-surface-window p-6 pt-14">
      <div
        className="absolute inset-x-0 top-0 h-10"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
        data-window-drag-zone=""
        aria-hidden="true"
      />
      <OnboardingWindowControls />
      <div className="mx-auto max-w-xl space-y-5 py-4">
        <img src={logo} alt="" className="h-12 w-12 rounded-xl" />
        <p className="text-sm text-muted-foreground">
          DSSA Tale · {tr("Trinn", "Step")} {step + 1} / 4
        </p>
        <h1 className="text-2xl font-semibold">{titles[step]}</h1>
        {step === 0 && (
          <>
            <p>
              {tr(
                "Vi hjelper deg gjennom oppsettet. Ingen konto, abonnement eller API-nøkkel er nødvendig for lokal tale til tekst.",
                "We will guide you through setup. Local transcription needs no account, subscription or API key."
              )}
            </p>
            <label className="block">
              Språk / Language{" "}
              <select
                className="ml-2 rounded border bg-background p-2"
                value={uiLanguage}
                onChange={(e) => setUiLanguage(e.target.value)}
              >
                <option value="nb">Norsk bokmål</option>
                <option value="nn">Norsk nynorsk</option>
                <option value="en">English</option>
              </select>
            </label>
            <p>
              {tr(
                "Først laster du ned en talemodell. Deretter tester du mikrofonen. Lyd behandles lokalt på PC-en.",
                "First download a speech model, then test your microphone. Audio is processed locally on your PC."
              )}
            </p>
          </>
        )}
        {step === 1 && (
          <>
            <p>
              {tr(
                "Velg en modell og trykk Last ned. Internett kreves for nedlastingen. Du kan fortsette når modellen er kontrollert på disken.",
                "Choose a model and click Download. Internet is required for the download. Continue once the model is verified on disk."
              )}
            </p>
            <select
              aria-label="Talemodell / Speech model"
              disabled={download.isDownloading}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded border bg-background p-2"
            >
              <option value="small">Whisper Small · 466 MB</option>
              <option value="medium">Whisper Medium · 1,5 GB</option>
              <option value="nb-large">NB-Whisper Large · 1,08 GB</option>
              <option value="nb-large-full">NB-Whisper Large · 3,1 GB</option>
            </select>
            <p className="text-sm">
              {tr(
                "Small bruker mindre plass og passer til å komme i gang. Større modeller bruker mer minne og tid. NB-Whisper er spesielt trent for norsk. Modellen du velger brukes til diktering, møter og lydimport. Tekstopprydding er slått av i dette grunnoppsettet og kan aktiveres senere.",
                "Small uses less space and is a good starting point. Larger models need more memory and time. NB-Whisper is trained for Norwegian. The selected model is used for dictation, meetings and audio import. Text cleanup is disabled in this basic setup and can be enabled later."
              )}
            </p>
            <p role="status">
              {ready
                ? tr("Modellen er installert og klar.", "Model installed and ready.")
                : tr("Talemodellen er ikke klar ennå.", "Speech model is not ready yet.")}
            </p>
            {!ready && !download.isDownloading && (
              <Button onClick={() => void download.downloadModel(model)}>
                {tr("Last ned valgt modell", "Download selected model")}
              </Button>
            )}
            {download.isDownloading && (
              <div role="status">
                <progress
                  max={100}
                  value={download.downloadProgress.percentage}
                  className="w-full"
                />
                <p>{Math.floor(download.downloadProgress.percentage)} %</p>
                <Button variant="outline" onClick={() => void download.cancelDownload(model)}>
                  {tr("Avbryt nedlasting", "Cancel download")}
                </Button>
              </div>
            )}
            <Button variant="outline" onClick={() => void refresh()}>
              {tr("Kontroller på nytt", "Check again")}
            </Button>
          </>
        )}
        {step === 2 && (
          <>
            <p>
              {tr(
                "Trykk Test mikrofon og si noen ord. Tillat mikrofontilgang dersom Windows spør. Testen lagrer ingen lyd. Bekreft at lydmåleren reagerer når du snakker.",
                "Click Test microphone and say a few words. Allow microphone access if Windows asks. No audio is saved. Confirm that the meter responds to your voice."
              )}
            </p>
            <progress
              aria-label="Mikrofonnivå / Microphone level"
              max={100}
              value={level}
              className="w-full"
            />
            {!testing ? (
              <Button
                onClick={() => {
                  setError("");
                  setHeard(false);
                  setTesting(true);
                }}
              >
                {tr("Test mikrofon", "Test microphone")}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setTesting(false);
                  setMicReady(heard);
                  setLevel(0);
                }}
              >
                {tr("Stopp testen", "Stop test")}
              </Button>
            )}
            <p role="status">
              {micReady
                ? tr("Mikrofonen er kontrollert.", "Microphone checked.")
                : heard
                  ? tr(
                      "Lyd registrert. Stopp testen når du er ferdig.",
                      "Audio detected. Stop the test when finished."
                    )
                  : tr("Venter på mikrofontest.", "Waiting for microphone test.")}
            </p>
            <p className="text-sm">
              {tr(
                "Ingen utslag? Kontroller valgt standardmikrofon i Windows → Innstillinger → System → Lyd, og mikrofontilgang under Personvern og sikkerhet. Test deretter igjen.",
                "No response? Check the default microphone in Windows Settings → System → Sound, and microphone access under Privacy & security. Then test again."
              )}
            </p>
          </>
        )}
        {step === 3 && (
          <>
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                {tr(
                  "Åpne Møter og notater og velg nytt notat. Opptaket starter når du oppretter notatet; se etter opptaksindikatoren.",
                  "Open Meetings and notes and create a note. Recording starts when you create the note; look for the recording indicator."
                )}
              </li>
              <li>
                {tr(
                  "Snakk noen setninger. Trykk Stopp opptak når du er ferdig.",
                  "Say a few sentences. Click Stop recording when finished."
                )}
              </li>
              <li>
                {tr(
                  "Vent mens appen transkriberer. Teksten vises i notatet når behandlingen er ferdig.",
                  "Wait while the app transcribes. The text appears in your note when processing finishes."
                )}
              </li>
            </ol>
            <p>
              {tr(
                "Teams-møte: velg møteopptak med systemlyd for de andre deltakerne og mikrofon for din egen stemme. Mikrofontesten ovenfor kontrollerer bare mikrofonen. Test systemlyden med et kort møteopptak før et viktig møte.",
                "Teams meeting: use meeting recording with system audio for the other participants and microphone for yourself. The test above checks only the microphone. Test system audio with a short meeting recording before an important meeting."
              )}
            </p>
            <p className="text-sm">
              {tr(
                "Stemmeutskillelse og tekstopprydding er ekstra funksjoner. Community-1 krever eget oppsett og er ikke nødvendig for å komme i gang.",
                "Speaker separation and text cleanup are additional features. Community-1 needs separate setup and is not required to get started."
              )}
            </p>
          </>
        )}
        {(error || download.downloadError) && (
          <p role="alert" className="text-destructive">
            {error || download.downloadError}
          </p>
        )}
        <div className="flex gap-3 pt-2">
          {step > 0 && (
            <Button
              variant="outline"
              disabled={testing || download.isDownloading}
              onClick={() => setStep(step - 1)}
            >
              {tr("Tilbake", "Back")}
            </Button>
          )}
          {step < 3 ? (
            <Button
              disabled={(step === 1 && !ready) || (step === 2 && (!micReady || testing))}
              onClick={() => setStep(step + 1)}
            >
              {tr("Neste", "Next")}
            </Button>
          ) : (
            <Button disabled={!ready || !micReady} onClick={() => void finish()}>
              {tr("Åpne DSSA Tale", "Open DSSA Tale")}
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
