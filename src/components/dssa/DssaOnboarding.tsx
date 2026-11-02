import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { createDssaTranslator } from "../../utils/dssaTranslation";
import { Button } from "../ui/button";
import logo from "../../assets/icon.png";

export default function DssaOnboarding({
  onComplete,
}: {
  onComplete: (options?: { openSettings: boolean }) => void;
}) {
  const { i18n } = useTranslation();
  const { uiLanguage, setUiLanguage } = useSettingsStore();
  const tr = createDssaTranslator(i18n);
  const finish = () => {
    localStorage.setItem("authenticationSkipped", "true");
    localStorage.setItem("skipAuth", "true");
    localStorage.removeItem("onboardingStep");
    onComplete({ openSettings: true });
  };
  return (
    <main className="flex h-screen items-center justify-center bg-surface-window p-8">
      <div className="max-w-lg space-y-6">
        <img src={logo} alt="" className="h-14 w-14 rounded-xl" />
        <h1 className="text-3xl font-semibold">DSSA Tale</h1>
        <p className="text-lg">
          {tr(
            "Din stemme. Dine møter. Dine dokumenter.",
            "Your voice. Your meetings. Your documents."
          )}
        </p>
        <p className="text-muted-foreground leading-relaxed">
          {tr(
            "Dikter der markøren står, ta opp møter eller importer lydfiler. Talegjenkjenning og talermerking skjer lokalt. Du velger selv om dokumentene skal lagres i en skymappe.",
            "Dictate at the cursor, record meetings or import audio. Transcription and speaker labelling run locally. You choose whether to save documents to a cloud folder."
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {tr(
            "Ingen konto eller abonnement. Velg talemodell under Innstillinger. Eksisterende modeller kan brukes videre.",
            "No account or subscription. Choose a speech model in Settings. Existing models can be reused."
          )}
        </p>
        <div className="flex gap-3 items-center">
          <Button onClick={finish}>{tr("Kom i gang", "Get started")}</Button>
          <select
            aria-label="Språk / Language"
            value={uiLanguage}
            onChange={(event) => setUiLanguage(event.target.value)}
            className="rounded border border-border bg-background p-2 text-sm"
          >
            <option value="nb">Norsk bokmål</option>
            <option value="nn">Norsk nynorsk</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
    </main>
  );
}
