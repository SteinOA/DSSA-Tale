# DSSA Tale v37 – vindusstørrelse og synlige handlinger

Dette er den ferdige Windows-pakken med de avtalte endringene fra v36. Ingen flere mellomutgaver planlegges i denne runden. Offentlig publisering venter på brukerens uttrykkelige OK. Eksisterende Windows-app er ikke installert, startet på nytt eller erstattet automatisk.

## Endringer

- Hver diktering i historikken har direkte synlige, merkede knapper: Kopier tekst, Transkriber på nytt, Vis original transkripsjon, Vis i Filutforsker og rød Slett, der handlingen er tilgjengelig. Ingen nedtrekksmeny eller krav om å holde musepekeren over raden. Én eksisterende bekreftelse beholdes ved sletting av historikk, siden lokal sletting er permanent.
- Kalenderen er flyttet til en kompakt rad over Velkommen tilbake. Tilkoblede kalenderdager fordeles i et rutenett fremfor å oppta en fast høyrekolonne.
- Hjem, Notater, lydimport, oversikter, assistentens skrivefelt og tilkoblingssider bruker tilgjengelig bredde med små kantavstander. Innstillinger bruker vindusbredden. Notatredigeringen har 20 skjermpunkter kantavstand uten en voksende sentrert marg.
- Windows starter normalt med opptil 1000 × 800 logiske skjermpunkter, begrenset til 80 % av tilgjengelig bredde og 90 % av høyden på skjermen ved musepekeren. Arbeidsflaten er allerede korrigert for Windows-skalering og oppgavelinjen. Skjermens fysiske tommestørrelse brukes ikke. Brukeren kan endre størrelse videre; økt bredde går til innholdet.
- Topplinjen tilpasses smalere plass med en søkeknapp i stedet for det lange søkefeltet. Tekstknapper kan brytes over linjer ved større tekst/smal plass.
- Automatisk notatblokk fra v36 beholdes. Diktering, CUDA, modeller, hurtigtaster, innliming og brukerdata er ikke endret i denne oppfølgingen.

## Kontrollert

- 20 automatiske tester av kontrollpanelvisning, gjenåpning, onboarding og skjermtilpasset startstørrelse. Arbeidsflater fra 640 × 440 til 3840 × 2120, inkludert stående skjerm, negative skjermkoordinater og logisk arbeidsflate tilsvarende skalert 4K. Dette er beregningstester, ikke fysiske tester av alle skjermtyper.
- Komponenttester av synlige historikkhandlinger, riktig tekst/ID ved kopiering/sletting/filvisning, originaltekst og opptatt-status ved ny transkribering. Eksisterende tester av velkomst, kalender og skrivefelt er også kjørt.
- Faktiske React-komponenter og produksjons-CSS kontrollert visuelt ved bredder 1600, 1000 og 640 i separate forhåndsvisninger. Tekstfeltene følger bredden; ved 640 brytes handlingsraden over to linjer. Lyst og mørkt tema er kontrollert.
- Typesjekk, ESLint for endrede React/TypeScript-filer og Windows-distribusjonsbygg. Pakkekontroll og tilhørende resultater følger installasjonsfilen.

Brukerens skjermbilde fra v36 viser at to faktiske dikteringer er tilføyd i notatblokken. Det er ikke en full test av alle lagrings- og innlimingsforløp i v37. Ren Windows-installasjon er fortsatt ikke verifisert. Den tidligere dokumenterte testen av assistentvinduets lenkehandlere feiler også på utgangspunktet før disse endringene; den er ikke endret her.
