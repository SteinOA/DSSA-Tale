# DSSA Tale 1.10.4-dssa.31 – Windows x64 testutgave

Gratis lokal norsk diktering uten obligatorisk konto eller abonnement.
Appen bygger på OpenWhispr og NB-Whisper; den er ikke utgitt eller godkjent
av disse prosjektene. Opphav og vilkår står i CREDITS.md og `resources/legal`.

## Endringer

- Beholder innloggingstilpasningene fra v29 og de tydelige sendepilene fra v30.
- Bruker åpne Lucide/Feather-ikoner i stedet for de betalte Nucleo-filene.
- Leverer et dokumentert LGPL-lydbygg av FFmpeg med MP3 og Opus, og et eget
  yt-dlp-bygg med bevarte lisenser og tilhørende kildedistribusjoner.
- Inneholder hele originalpakken for NirCmd, uten endrede originalfiler.
- Utelater den valgfrie Tinfoil-leverandøren og dens AGPL-SDK-er.
- Henter ved behov Microsofts runtime direkte fra Microsoft. Brukeren
  godtar selv Microsofts vilkår; installasjonen starter ikke Windows på nytt.
- Leveres med kildearkiver, komponentoversikt og kontrollsummer.

## Installere og begynne

1. Last ned Windows-x64-installasjonsfilen fra den samme utgivelsen som denne
   teksten. Kontroller den mot `SHA256SUMS.txt` hvis du ønsker å kontrollere filen.
2. Lukk DSSA Tale og kjør installasjonen. Eksisterende brukerdata skal beholdes.
   Hvis Microsoft-runtime mangler, kreves Internett og eventuelt administrator.
3. Start appen fra den installerte DSSA Tale-snarveien. Bekreft versjon
   `1.10.4-dssa.31`; eldre separate v29-/v30-snarveier kan åpne gamle mapper.
4. Velg mikrofon og last ned en passende NB-Whisper-modell. Start gjerne med
   en mindre modell på en bærbar med begrenset minne. Konto trengs ikke for
   lokal diktering. Velg hurtigtast og bruk Hold inne hvis opptaket skal stoppe
   når du slipper tastene.

Installasjonsfilen er ikke signert med et eget DSSA-kodesigneringssertifikat.
Windows kan derfor vise en advarsel. Kontroller opphav og sum; ikke slå av
Windows-beskyttelse for å installere appen. En kontrollsum dokumenterer
filidentitet og erstatter ikke en signatur eller sikkerhetsgjennomgang.

## Hva som er kontrollert

Det følger separate resultater for pakkede moduler og faktiske konverteringer
av syntetisk lyd gjennom MP3, Opus, FLAC, M4A, MP4 og WebM. Kildefilene er
testsignaler, ikke brukeropptak. yt-dlp-versjon og tilgjengelige extractorer
kontrolleres lokalt. Dette er ikke en test av samtlige nettsteder.

Den endelige komponentlisten og SHA-256-manifestet gjelder den faktiske
installasjonspakken. Bygget kontrollerer at de dokumenterte medieverktøyene
og NirCmd-originalene har forventede summer, at nødvendige lisensfiler er
med, og at det betalte ikonsettet ikke importeres.

Brukeren har rapportert at appen fungerer godt også på en bærbar PC med
eget grafikkort. Dette er en brukererfaring; nøyaktig maskin og testversjon
er ikke loggført. En helt ren Windows-installasjon og alle GPU-varianter er
ikke kontrollert. Ingen målt hastighet fra tastslipp til innlimt tekst er
oppgitt. Første modellstart kan være tregere enn senere dikteringer.

Google Disk, OneDrive og SharePoint er valgfrie. Brukerens lokale
testregistreringer og innloggingstokener følger ikke med. Disse funksjonene
krever riktig Google-/Microsoft-appregistrering, samtykke og eventuelt
organisasjonens administrator. Valgfrie Community-1-/WhisperX-verktøy og
store modellfiler installeres separat og følger egne vilkår.

## Kilder og lisenser

Installer, `DSSA-Tale-public-source.zip`, `DSSA-Tale-corresponding-source.zip`,
`COMPONENTS-AND-SHA256.json`, `SHA256SUMS.txt` og CREDITS.md skal tilbys samlet.
Se [distribusjonsoversikten](windows-distribution.md). Den private
prosjekthistorikken er ikke nødvendig for å bruke appen og skal ikke deles.
