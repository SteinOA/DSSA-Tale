# DSSA Tale Windows 1.10.4-dssa.32

Valgte knapper og faner skal kunne skilles fra vanlige handlingsknapper.
Felles stil for `aria-pressed`, `aria-selected`, radiovalg og aktive faner
viser nå valgt alternativ med mørk blå bakgrunn, hvit tekst og lys innvendig
kant. Alternativer som ikke er valgt har nøytral lys eller mørk bakgrunn.
Hover beholder forskjellen. Av/på-brytere og avkrysningsbokser beholder
sine egne kontroller.

Trykk/Hold inne og de delte leverandørfanene viser i tillegg en hake på
valgt alternativ. Leverandørfanene oppgir nå tilstanden med `aria-pressed`.
Valget og lagringen av innstillingene er uendret.

Kontrollert med typesjekk, ESLint og Windows-rendererbygg. En visuell
kontrollside rendret de faktiske React-komponentene og produksjons-CSS-en
i lyst og mørkt tema, med bekreftede ulike beregnede farger for valgt og
ikke valgt. Kontrollen endret ingen brukerinnstillinger.

Media-, lisens- og kildeoppsettet fra v31 beholdes. Den tilsvarende
mediekildepakken er uendret; appens kildesnapshot oppdateres for v32.
Prosjekt og GitHub-utkast forblir private.
