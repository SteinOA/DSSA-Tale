import { Button } from "../ui/button";
import {
  openDssaFeature,
  type DssaFeatureTarget,
  type DssaSettingsTarget,
} from "../../utils/dssaFeatureNavigation";

const features: { title: string; description: string; target: DssaFeatureTarget }[] = [
  {
    title: "Automatisk notatblokk",
    description: "Se samlet diktering på Hjem. Krever at lokal historikk er på.",
    target: "view:home",
  },
  {
    title: "Lokal historikk og lydlagring",
    description: "Velg hva som lagres og hvor lenge. Dette styrer også notatblokken.",
    target: "settings:privacyData",
  },
  {
    title: "Mappeimport med undermapper",
    description: "Finn opptak i en mappe, legg dem i kø og lagre hver fil som et eget notat.",
    target: "view:upload",
  },
  {
    title: "Gjenoppta lydimport",
    description: "Se lagrede, avbrutte lokale importjobber. Ingen egen aktiveringsbryter.",
    target: "view:upload",
  },
  {
    title: "Google Disk og skymapper",
    description: "Direkte Google-innlogging, kalendere og lokale mappetilkoblinger.",
    target: "settings:connections",
  },
  {
    title: "Tale til tekst",
    description: "Modellvalg for diktering, møteopptak og lydimport.",
    target: "settings:speechToText",
  },
  {
    title: "Tekstopprydding og referat",
    description: "Valgfrie tekstmodeller, assistent, oversettelse og notatformatering.",
    target: "settings:llms",
  },
  {
    title: "Hurtigtaster",
    description: "Velg snarveier og Trykk eller Hold inne for diktering.",
    target: "settings:hotkeys",
  },
  {
    title: "Modelloversikt og møteverktøy",
    description: "Se maskinvare og installerte modeller. Sett opp valgfri Community-1.",
    target: "settings:system",
  },
];

export default function DssaFeatureLinks({
  onSettings,
}: {
  onSettings: (section: DssaSettingsTarget) => void;
}) {
  return (
    <section
      lang="nb"
      aria-label="Finn funksjoner og oppsett"
      className="space-y-3 rounded-xl border border-border p-4"
    >
      <h3 className="font-semibold">Finn funksjoner og oppsett</h3>
      <Button variant="outline" onClick={() => window.dispatchEvent(new Event("dssa-start-setup"))}>
        Start oppsettsveiviseren
      </Button>
      <p className="text-sm text-muted-foreground">
        Åpne funksjonen eller innstillingssiden. Ingen nedlasting, innlogging eller endring starter
        når du åpner en side.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {features.map((feature) => (
          <div key={feature.title} className="space-y-2 rounded-lg border border-border p-3">
            <Button
              variant="outline"
              className="h-auto min-h-9 max-w-full whitespace-normal text-start"
              onClick={() => {
                if (feature.target.startsWith("settings:"))
                  onSettings(feature.target.slice(9) as DssaSettingsTarget);
                else openDssaFeature(feature.target);
              }}
            >
              {feature.title}
            </Button>
            <p className="text-sm text-muted-foreground">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
