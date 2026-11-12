# DSSA Tale for Windows

Lokal diktering, møteopptak og lydimport. Uavhengig tilpasning av OpenWhispr, med støtte for Nasjonalbibliotekets NB-Whisper. Ingen konto eller abonnement er nødvendig for lokal tale til tekst.

## Last ned v43

**[Last ned DSSA Tale v43 for Windows x64](https://github.com/SteinOA/DSSA-Tale/releases/download/v1.10.4-dssa.43/DSSA-Tale-1.10.4-dssa.43-Windows-x64.exe)**

v43 er installert og testet på Windows som en oppdatering av v42. Lokal diktering og innliming er bekreftet av brukeren. Notater, innstillinger og nedlastet modell ble beholdt. v42 ble tidligere kontrollert fra GitHub med tom profil og ny modellnedlasting.

[GitHub-utgivelsen](https://github.com/SteinOA/DSSA-Tale/releases/tag/v1.10.4-dssa.43) inneholder **DSSA-Tale-1.10.4-dssa.43-Windows-x64.exe**, kilder, kontrollsummer og veiledning. v40 og v41 er trukket fra offentlig nedlasting. v43 fjerner knappen som startet oppsettsveiviseren på nytt fra innstillingene. Rettelsene for lokal diktering fra v42 følger med.

## Første start

Veiviseren viser deg gjennom språk, modellnedlasting, mikrofontest og ditt første opptak. Den forklarer hva du skal trykke på og venter til modell og mikrofon er kontrollert. Modellene lastes ned separat. NB-Whisper Large med full presisjon (3,1 GB) er forhåndsvalgt og anbefalt for norsk; mindre modeller kan velges ved behov.

Ingen konto, abonnement eller API-nøkkel kreves. Valgt lokal modell brukes til diktering, møter og lydimport. Tekstopprydding er valgfritt og av i grunnoppsettet. Veiviseren brukes ved første oppstart. Senere endrer du valgene direkte under Innstillinger.

## Funksjoner og hjelp

- Diktering, lokale notater og møteopptak med mikrofon/systemlyd.
- Synlige opptaksknapper og status under transkripsjon etter stopp.
- Målt behandlet og gjenstående lyd ved lokal etterbehandling, med estimert resttid.
- Lydimport og mappeimport med undermapper og et notat per fil.
- Valgfri stemmeutskillelse, tekstopprydding, Google Disk og Microsoft-tilkobling.

Les [bruksanvisningen](docs/BRUKSANVISNING-WINDOWS.txt) og [oppsett og testgrenser](docs/windows-v43-dictation-startup.md). Mikrofontesten kontrollerer ikke Teams-systemlyden. Test et kort opptak før viktige møter. Stemmegrupper er ikke automatisk bekreftede personnavn. Importkøen lagres ikke ved avslutning.

## Oppdatering og kilder

Lukk appen når opptak og transkripsjon er ferdig. Installer ny pakke manuelt. Vanlig oppdatering sletter ikke brukerdata. Windows x64-utgaven har ikke eget DSSA-kodesigneringssertifikat; ikke slå av Windows-beskyttelsen. Se kontrollsummer og teststatus i utgivelsen.

Se [CREDITS.md](CREDITS.md), [LICENSE](LICENSE) og [distribusjon og kilder](docs/windows-distribution.md). Offentlig kildeeksport og tilhørende komponentkilder følger utgivelsen. Privat historikk og brukerprofiler følger ikke med. Appen er MIT; komponenter og modeller har egne vilkår. Mac er ikke endret.

Meld feil under [Issues](https://github.com/SteinOA/DSSA-Tale/issues). Ikke legg ved private data eller nøkler. OpenWhispr gir ikke brukerstøtte for DSSA Tale.
