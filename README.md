# DSSA Tale for Windows

**Lokal norsk talegjenkjenning med NB-Whisper.** Hele formålet med DSSA Tale er lokal behandling. Appen kan diktere i andre programmer, ta opp og transkribere møter, behandle lydfiler og samle resultatene i søkbare notater. Lyden og teksten behandles på din egen PC. Etter modellnedlastingen kan vanlig bruk skje uten konto, abonnement, API-nøkkel eller en skytjeneste som behandler innholdet.

DSSA Tale er en uavhengig tilpasning av OpenWhispr med støtte for Nasjonalbibliotekets NB-Whisper. Den anbefalte og dokumenterte arbeidsmåten bruker lokale modeller. Nett er nødvendig for å laste ned appen og modellene, men ikke for å behandle et diktat, møteopptak eller en importert lydfil etter at oppsettet er ferdig.

### Testfunksjon for Teams uten integrering

DSSA Tale kan brukes som en lokal testløsning for å ta opp Teams-samtaler møte etter møte. Det krever ingen Teams-bot, Microsoft-innlogging, tillegg i Teams, Teams-API eller tilgang til Teams-kontoen. DSSA Tale kobler seg ikke til Teams-skyen. Du starter og stopper opptaket i DSSA Tale, og hvert møte lagres lokalt som et eget notat. Appen styrer ikke Teams og sender ingen opptaksvarsling til deltakerne. Den som starter opptaket må derfor informere deltakerne og få et tydelig muntlig samtykke før hvert møteopptak.

## Last ned

**[Last ned DSSA Tale v43 for Windows x64](https://github.com/SteinOA/DSSA-Tale/releases/download/v1.10.4-dssa.43/DSSA-Tale-1.10.4-dssa.43-Windows-x64.exe)**

[Åpne GitHub-utgivelsen](https://github.com/SteinOA/DSSA-Tale/releases/tag/v1.10.4-dssa.43) for kontrollsummer, kildekode og utgivelsesnotater. v43 er installert og kontrollert på Windows. Lokal diktering og innliming er brukerbekreftet, og en vanlig oppdatering beholdt notater, innstillinger og nedlastet modell.

## Innhold

- [Hva kan DSSA Tale gjøre?](#hva-kan-dssa-tale-gjøre)
- [Kom raskt i gang](#kom-raskt-i-gang)
- [Dikter i Word, Outlook, Teams og andre programmer](#dikter-i-word-outlook-teams-og-andre-programmer)
- [Ta opp og transkriber et møte](#ta-opp-og-transkriber-et-møte)
- [Importer lydfiler og hele mapper](#importer-lydfiler-og-hele-mapper)
- [Notater, søk og eksport](#notater-søk-og-eksport)
- [Modeller, språk og GPU](#modeller-språk-og-gpu)
- [Personvern og lokal behandling](#personvern-og-lokal-behandling)
- [Oppdatering og sikker bruk](#oppdatering-og-sikker-bruk)
- [Bruksanvisninger og teknisk dokumentasjon](#bruksanvisninger-og-teknisk-dokumentasjon)
- [Kilder, lisens og feilrapportering](#kilder-lisens-og-feilrapportering)

## Hva kan DSSA Tale gjøre?

| Område | Dette kan du gjøre |
| --- | --- |
| Diktering | Snakk med en hurtigtast og få ferdig tekst ved markøren i programmer som tillater innliming. Resultatet finnes også i lokal historikk. |
| Norsk tale til tekst | Velg bokmål eller nynorsk og bruk NB-Whisper Large i full eller kvantisert utgave. |
| Møteopptak | Ta opp mikrofon og systemlyd lokalt, transkriber underveis eller etter møtet, og følg framdriften etter stopp. |
| Teams | Ta opp Teams-samtaler lokalt, møte etter møte, uten bot, tillegg, Microsoft-innlogging eller annen integrering i Teams. |
| Lydimport | Importer lyd- og videofiler, flere filer samtidig eller en mappe med undermapper. Hver brukbar fil kan lagres som et eget notat. |
| Notater | Opprett møte- og arbeidsnotater, bruk automatisk notatblokk for diktater, organiser i mapper og søk i lagret innhold. |
| Eksport | Kopier tekst eller eksporter notater og utskrifter til blant annet tekst, Word og PDF når formatet er tilgjengelig i appen. |
| Ordliste og tekstsnutter | Hjelp modellen med navn og faguttrykk, og erstatt korte talte fraser med faste tekstblokker. |
| Talermerking | Bruk valgfri stemmeutskillelse for å gruppere talere. Navn og usikre grupper må kontrolleres manuelt. |
| Lokal tekstopprydding | Bruk en valgfri lokal språkmodell til opprydding, referat og notatformatering. Dette er av i grunnoppsettet. |

## Kom raskt i gang

1. Last ned installasjonsfilen fra lenken over og avslutt en eldre DSSA Tale før installasjon.
2. Start DSSA Tale og følg førstegangsveiviseren.
3. Velg grensesnitt- og transkripsjonsspråk.
4. Last ned en NB-Whisper-modell. Full presisjon på omtrent 3,1 GB er forhåndsvalgt og anbefalt for best mulig norsk resultat. Den kvantiserte modellen bruker mindre plass og minne.
5. Test mikrofonen og velg riktig inngang dersom lydmåleren ikke reagerer.
6. Fullfør første diktat i veiviseren og prøv deretter et kort diktat i et tomt dokument.
7. Aktiver GPU under innstillingene dersom PC-en har støttet NVIDIA-maskinvare og du ønsker raskere lokal behandling.

Veiviseren brukes ved første oppstart. Senere finner du modellvalg under **Innstillinger → Tale til tekst**, snarveier under **Innstillinger → Hurtigtaster**, og en samlet funksjonsoversikt under **Innstillinger → Generelt**.

## Dikter i Word, Outlook, Teams og andre programmer

1. Klikk i tekstfeltet der teksten skal stå.
2. Start opptaket med dikteringshurtigtasten som vises i appen.
3. Snakk tydelig i normal takt.
4. Stopp med samme hurtigtast i trykkmodus, eller slipp tastene i hold-inne-modus.
5. Vent til transkripsjonen er ferdig. Teksten limes inn automatisk når dette er aktivert.

Hvis teksten ikke limes inn, åpner du **Hjem**, finner resultatet i dikteringshistorikken og velger **Kopier**. Kontroller navn, tall og faguttrykk før teksten brukes videre. Bruk én dikteringsapp om gangen, slik at flere programmer ikke reagerer på samme globale hurtigtast.

## Ta opp og transkriber et møte

1. Informer deltakerne om opptaket og følg rutinene som gjelder for møtet.
2. Åpne **Teams og filer → Teams → Start lokalt møteopptak**. Du kan også opprette et nytt notat under **Møter og notater**.
3. Kontroller at opptakstid og indikator faktisk går, og at både mikrofon og systemlyd er tilgjengelig.
4. Velg om møtet skal transkriberes underveis eller etter at opptaket er stoppet.
5. Stopp opptaket fra notatet og la appen stå åpen til lagring og transkripsjon er ferdig.
6. Kontroller at både din egen og de andre deltakernes tale finnes i utskriften før du lager referat eller eksport.

Mikrofontesten i oppsettet kontrollerer ikke systemlyden. Gjør derfor et kort prøveopptak før viktige møter. DSSA Tale starter et lokalt opptak ved siden av Teams; det starter ikke Teams sitt varslede skyopptak.

Når ett møte er ferdigbehandlet, kan du opprette neste notat og starte et nytt lokalt opptak. Dette er fortsatt en testfunksjon. Kontroller lyd og opptaksindikator hver gang. DSSA Tale varsler ikke deltakerne, så be om og få et tydelig muntlig samtykke før hvert opptak. Følg også rutinene som gjelder i virksomheten din.

## Importer lydfiler og hele mapper

Åpne **Lydimport** og velg én av disse arbeidsmåtene:

- dra inn én lyd- eller videofil;
- velg flere filer og la dem behandles som en kø;
- velg en mappe og ta med undermapper dersom dette er aktivert.

Velg språk, talemodell og eventuell talermerking før du starter. Hver ferdig fil lagres som et eget notat. La DSSA Tale være åpen til køen er ferdig; importkøen gjenopprettes ikke automatisk etter at appen avsluttes. Originalfilene endres ikke.

## Notater, søk og eksport

**Hjem** viser dikteringshistorikk og automatisk notatblokk. **Møter og notater** brukes til lengre dokumenter, møteutskrifter og egne arbeidsnotater. Du kan organisere notater i mapper og bruke søkefeltet eller `Ctrl + K` for å finne lagret innhold.

Vanlig arbeidsflyt:

1. Gi notatet et tydelig navn.
2. Kontroller råutskriften mot opptaket.
3. Rett navn, tall og talermerking.
4. Bruk valgfri tekstopprydding eller referatfunksjon dersom du ønsker det.
5. Eksporter eller kopier den kontrollerte teksten.

Råutskriften er resultatet før eventuell KI-behandling og er nyttig dersom et senere behandlingstrinn feiler.

## Modeller, språk og GPU

Talemodellen gjør lyd om til tekst. En språkmodell brukes eventuelt etterpå til opprydding, referat, spørsmål eller oversettelse. De to modelltypene er uavhengige.

- **NB-Whisper Large full presisjon:** omtrent 3,1 GB, anbefalt for best norsk kvalitet.
- **NB-Whisper Large kvantisert:** mindre nedlasting og vanligvis lavere minnebruk.
- **Bokmål og nynorsk:** velges før opptak eller import. Kontroller dialekt, navn og faguttrykk.
- **GPU:** kan gjøre lokal behandling raskere på støttet NVIDIA-maskinvare, men forbedrer ikke automatisk selve språkresultatet.

Legg gjentatte navn og faguttrykk i **Ordliste**. Installerte modeller er ikke nødvendigvis valgt for alle oppgaver; kontroller egne valg for diktering, møte og lydimport.

## Personvern og lokal behandling

NB-Whisper behandler lyd på PC-en. Den beskrevne dikteringen, møtebehandlingen, lydimporten, notatene og den lokale tekstoppryddingen bruker ikke en skytjeneste til å behandle innholdet. Ingen konto, API-nøkkel eller abonnement er nødvendig.

Internett brukes til å laste ned appen og modellene og til lenker du selv åpner. Enkelte menyer fra grunnprogrammet kan vise valg for eksterne tilkoblinger. De er ikke nødvendige og inngår ikke i den lokale arbeidsmåten som er beskrevet her. Ikke aktiver en ekstern tjeneste dersom innholdet skal forbli helt lokalt.

## Oppdatering og sikker bruk

Lukk DSSA Tale når opptak, import og transkripsjon er ferdig. Installer deretter den nye pakken manuelt. En vanlig oppdatering skal bevare brukerprofil, notater, innstillinger og nedlastede modeller, men sikkerhetskopier viktig materiale før større oppgraderinger.

Windows x64-utgaven har ikke eget DSSA-kodesigneringssertifikat. Ikke slå av Windows-beskyttelsen. Last bare ned fra dette repoets GitHub-utgivelser og sammenlign kontrollsummen når du trenger ekstra kontroll.

## Bruksanvisninger og teknisk dokumentasjon

- [Kort, trinnvis bruksanvisning](docs/BRUKSANVISNING-WINDOWS.md)
- [Full bruksanvisning som følger appen](docs/BRUKSANVISNING-WINDOWS.txt)
- [Oppstart, lokal diktering og testgrenser for v43](docs/windows-v43-dictation-startup.md)
- [Valgfritt Community-1-oppsett](docs/COMMUNITY-1-WINDOWS.md)
- [Distribusjon, kildekode og pakkeinnhold](docs/windows-distribution.md)

## Kilder, lisens og feilrapportering

Se [CREDITS.md](CREDITS.md), [LICENSE](LICENSE) og [distribusjonsdokumentasjonen](docs/windows-distribution.md). Appen er MIT-lisensiert; modeller og enkelte komponenter har egne vilkår. Offentlig kildeeksport og tilhørende komponentkilder følger utgivelsen. Private brukerprofiler følger aldri med.

Meld feil under [Issues](https://github.com/SteinOA/DSSA-Tale/issues). Oppgi Windows-versjon, DSSA Tale-versjon, modellvalg og hva du forsøkte. Ikke legg ved private opptak, transkripsjoner, passord eller API-nøkler. OpenWhispr gir ikke brukerstøtte for DSSA Tale.
