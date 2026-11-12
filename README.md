# DSSA Tale for Windows

Lokal diktering, møteopptak og lydimport. Uavhengig tilpasning av OpenWhispr, med støtte for Nasjonalbibliotekets NB-Whisper. Ingen konto eller abonnement er nødvendig for lokal tale til tekst.

## Last ned v42

[GitHub-utgivelsen](https://github.com/SteinOA/DSSA-Tale/releases/tag/v1.10.4-dssa.42) inneholder **DSSA-Tale-1.10.4-dssa.42-Windows-x64.exe**, kilder, kontrollsummer og veiledning. v40 og v41 er trukket fra offentlig nedlasting. v42 retter første diktering som ellers kunne bli sendt til OpenWhispr Cloud i stedet for lokal modell.

## Første start

Veiviseren viser deg gjennom språk, modellnedlasting, mikrofontest og ditt første opptak. Den forklarer hva du skal trykke på og venter til modell og mikrofon er kontrollert. Modellene lastes ned separat. NB-Whisper Large med full presisjon (3,1 GB) er forhåndsvalgt og anbefalt for norsk; mindre modeller kan velges ved behov.

Ingen konto, abonnement eller API-nøkkel kreves. Valgt lokal modell brukes til diktering, møter og lydimport. Tekstopprydding er valgfritt og av i grunnoppsettet. Under Innstillinger → Generelt kan du starte oppsettsveiviseren igjen.

## Funksjoner og hjelp

- Diktering, lokale notater og møteopptak med mikrofon/systemlyd.
- Synlige opptaksknapper og status under transkripsjon etter stopp.
- Målt behandlet og gjenstående lyd ved lokal etterbehandling, med estimert resttid.
- Lydimport og mappeimport med undermapper og et notat per fil.
- Valgfri stemmeutskillelse, tekstopprydding, Google Disk og Microsoft-tilkobling.

Les [bruksanvisningen](docs/BRUKSANVISNING-WINDOWS.txt) og [oppsett og testgrenser](docs/windows-v42-dictation-startup.md). Mikrofontesten kontrollerer ikke Teams-systemlyden. Test et kort opptak før viktige møter. Stemmegrupper er ikke automatisk bekreftede personnavn. Importkøen lagres ikke ved avslutning.

## Oppdatering og kilder

Lukk appen når opptak og transkripsjon er ferdig. Installer ny pakke manuelt. Vanlig oppdatering sletter ikke brukerdata. Windows x64-testutgaven har ikke eget DSSA-kodesigneringssertifikat; ikke slå av Windows-beskyttelsen. Se kontrollsummer og teststatus i utgivelsen.

Se [CREDITS.md](CREDITS.md), [LICENSE](LICENSE) og [distribusjon og kilder](docs/windows-distribution.md). Offentlig kildeeksport og tilhørende komponentkilder følger utgivelsen. Privat historikk og brukerprofiler følger ikke med. Appen er MIT; komponenter og modeller har egne vilkår. Mac er ikke endret.

Meld feil under [Issues](https://github.com/SteinOA/DSSA-Tale/issues). Ikke legg ved private data eller nøkler. OpenWhispr gir ikke brukerstøtte for DSSA Tale.
