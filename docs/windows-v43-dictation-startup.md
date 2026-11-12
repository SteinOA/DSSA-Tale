# DSSA Tale v43 for Windows

Knappen som startet oppsettsveiviseren på nytt er fjernet fra «Finn funksjoner og oppsett». Modell, mikrofon og hurtigtaster endres direkte under Innstillinger. Førstegangsveiviseren beholdes for nye brukere.

## Bokmål, nynorsk og Teams-møter

- Appen støtter transkripsjon på både bokmål og nynorsk. Velg ønsket transkripsjonsspråk før opptaket.
- DSSA Tale kan ta opp og transkribere lyd fra Teams-møter. Systemlyd tar med de andre deltakerne, og mikrofonen tar med din egen stemme.
- Start under **Teams og filer → Teams → Start lokalt møteopptak**, og kontroller opptaksindikatoren. Opptaket gjøres lokalt i DSSA Tale ved siden av Teams og krever ikke Microsoft-innlogging. Informer deltakerne om opptaket.

## Installer eller oppdater

Last ned **DSSA-Tale-1.10.4-dssa.43-Windows-x64.exe** nedenfor. Avslutt opptak og vent til transkripsjonen er ferdig før du lukker appen og installerer oppdateringen. Vanlig oppdatering beholder notater, innstillinger og nedlastede modeller.

Ved første start hjelper veiviseren med språk, talemodell og mikrofontest. NB-Whisper Large 3,1 GB er forhåndsvalgt og anbefalt for norsk. Modellen lastes ned separat. Lokal tale til tekst krever ingen konto, abonnement eller API-nøkkel. GPU anbefales ved kompatibel maskinvare.

Automatisk oppstart styres under **Innstillinger → Generelt → Oppstart → Start ved pålogging**. «Start minimert» lar appen starte i bakgrunnen.

## Endringer

- Fjernet snarveien som kunne starte hele oppsettet igjen ved et uhell.
- Fullført oppsett beholdes ved avbrutt veiviser eller lukket vindu.
- Bruksanvisningen viser direkte til vanlige innstillinger.
- Lokal diktering, møteopptak, lydimport og de øvrige v42-funksjonene følger med.

## Kontrollert

Typekontroll og tre automatiske tester bestod: funksjonslenker, førstegangsoppsett og lokale standardvalg før det skjulte dikteringsvinduet opprettes. Pakketesten kontrollerte blant annet native SQLite og dokumenteksport. Distribusjonskontrollen omfattet 374 filer, 436 JavaScript-pakker og 14 native komponentgrupper.

v43 er installert som oppdatering av v42 på brukerens PC. Alle 374 installerte filer samsvarer med byggmanifestet. Beskyttede profilfiler og den nedlastede modellen var uendret etter installasjonen. Appen åpner på Hjem uten nytt oppsett, og brukeren bekreftet fungerende diktering og innliming. Den samme installasjonsfilen publiseres her.

## Grenser og hjelp

v43 er ikke separat testet på en helt ny Windows-maskin eller med alle maskinvare- og kontokombinasjoner. Førstegangsinstallasjon fra GitHub med tom profil ble tidligere kontrollert for v42. Test et kort møteopptak før viktige møter. Teams-systemlyd og valgfri Community-1 er ikke ende-til-ende-verifisert i v43. Stemmegrupper er ikke automatisk bekreftede personnavn.

Windows-utgaven har ikke eget DSSA-kodesigneringssertifikat. SHA256SUMS.txt bekrefter filidentitet. Ikke slå av Windows-beskyttelsen.

DSSA Tale er en uavhengig tilpasning av OpenWhispr. OpenWhispr gir ikke brukerstøtte for DSSA Tale. Meld feil på https://github.com/SteinOA/DSSA-Tale/issues uten private opptak eller nøkler. MIT gjelder appen; komponenter og modeller har egne vilkår. Se vedlagte kilder, komponentmanifest og CREDITS.md. Privat Git-historikk og brukerprofiler følger ikke med.
