# DSSA Tale for Windows

Gratis lokal norsk diktering, møteopptak og lydimport, basert på OpenWhispr og Nasjonalbibliotekets NB-Whisper. Dette er en uavhengig tilpasning.

Offentlig testutgave: **1.10.4-dssa.40**, Windows x64.

## Last ned

[Utgivelsen av v40](https://github.com/SteinOA/DSSA-Tale/releases/tag/v1.10.4-dssa.40) har installasjonsfilen **DSSA-Tale-1.10.4-dssa.40-Windows-x64.exe**, kildepakker, kontrollsummer og installasjonsveiledning. Avslutt opptak og transkripsjon og lukk appen før installasjon. Ikke slett brukerprofilen eller modellene.

Lokal diktering trenger ingen konto eller abonnement. Last ned talemodell separat under Innstillinger → Tale til tekst. Under Hurtigtaster velger du Trykk eller Hold inne. Denne pakken har ikke eget DSSA-kodesigneringssertifikat. Ikke slå av Windows-beskyttelsen.

## Nytt i v40

- Tydelige opptaksknapper, møtehjelp og transkripsjonsstatus etter stopp.
- Målt framdrift og gjenstående lyd for lokal transkripsjon etter møtet. Resttid er et anslag; mikrofon og møtelyd telles separat.
- Mappeimport med undermapper, kø og et notat per fil. Kølisten lagres ikke ved avslutning.
- Bruksanvisning med 28 kapitler og innganger til funksjoner og oppsett.
- Community-1-veiledning med lenker til modelltilgang og Hugging Face-nøkkel.
- Rettet PC-tekst, Google Disk-hjelp og offentlig feilrapportering. Ingen OpenWhispr-support for DSSA Tale.

Les [bruksanvisningen](docs/BRUKSANVISNING-WINDOWS.txt), [møteframdrift og testgrenser](docs/windows-v40-meeting-progress.md) og [Community-1-oppsett](docs/community-optional-setup.md).

## Møteopptak og data

DSSA Tale er en separat app ved siden av Teams. Lokalt møteopptak forsøker å ta inn mikrofon og systemlyd; det starter ikke Teams sitt skyopptak eller sender automatisk Teams-varsel. Informer deltakerne og gjør en kort prøve. Stemmegrupper er ikke automatisk bekreftede personnavn.

Automatisk notatblokk og gjenopptakelse av lokale importer krever tillatt lokal historikk. Google Disk, Microsoft og kalender er valgfrie tilkoblinger med eget oppsett og samtykke. Tekstopprydding er valgfri og kan øke ventetiden.

## Teststatus og kilder

Typekontroll, målrettede funksjons-/språkprøver og pakketester med syntetiske data er gjennomført. Ren PC-installasjon, alle konto-OAuth-flyter, fersk Community-1-installasjon og den nye framdriftsvisningen under et virkelig Teams-møte er ikke ende-til-ende-verifisert. Ingen garantert hastighet eller feilfri talerfordeling.

Se [CREDITS.md](CREDITS.md), [LICENSE](LICENSE) og [distribusjon og kilder](docs/windows-distribution.md). App/tilpasninger er MIT; komponenter og modeller har egne vilkår. NB-Whisper bygger på OpenAIs Whisper og er videre trent for norsk av Nasjonalbiblioteket.

Offentlig kildeeksport og tilhørende medieverktøykilder følger utgivelsen. Den private utviklingshistorikken følger ikke med. Sluttbrukeren trenger ikke utviklingsverktøy; byggeoppskriften følger kildepakken.

Meld feil under [Issues](https://github.com/SteinOA/DSSA-Tale/issues). Unngå private opptak, dokumenter og tilgangsnøkler.

Mac-versjonen omfattes ikke av Windows-utgivelsen.
