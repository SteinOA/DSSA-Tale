# Enkel bruksanvisning for DSSA Tale på Windows

Denne veiledningen er skrevet for deg som ønsker konkrete klikk og minst mulig dataspråk. Du trenger ikke kunne programmere. Tale, møteopptak og lydfiler behandles lokalt på PC-en når du bruker oppsettet i denne veiledningen. Den [fulle bruksanvisningen](BRUKSANVISNING-WINDOWS.txt) beskriver alle innstillinger.

## Innhold

- [Installer og gjør appen klar](#installer-og-gjør-appen-klar)
- [Snakk og få teksten skrevet inn](#snakk-og-få-teksten-skrevet-inn)
- [Ta opp et Teams-møte](#ta-opp-et-teams-møte)
- [Lag tekst fra en lydfil](#lag-tekst-fra-en-lydfil)
- [Finn og bruk notatene](#finn-og-bruk-notatene)
- [Velg bokmål eller nynorsk](#velg-bokmål-eller-nynorsk)
- [Oppdater appen](#oppdater-appen)
- [Når noe ikke virker](#når-noe-ikke-virker)

## Installer og gjør appen klar

1. Klikk på nedlastingslenken for **DSSA Tale v43** på forsiden av repoet.
2. Når filen er lastet ned, åpner du den og følger valgene på skjermen.
3. Start **DSSA Tale**.
4. Velg bokmål, nynorsk eller engelsk for menyene.
5. Appen ber deg laste ned en talemodell. Dette er den delen som gjør tale om til tekst. Velg det anbefalte valget hvis du er usikker.
6. Vent til nedlastingen er ferdig. Dette kan ta litt tid.
7. Velg mikrofonen du bruker, og trykk på mikrofontesten. Snakk og se om lydmåleren beveger seg.
8. Følg resten av veiviseren og prøv et kort diktat.

## Snakk og få teksten skrevet inn

1. Åpne stedet der du vil skrive, for eksempel Word, Outlook eller et meldingsfelt i Teams.
2. Klikk i feltet slik at skrivemerket blinker.
3. Trykk hurtigtasten som DSSA Tale viser for diktering.
4. Snakk tydelig.
5. Trykk hurtigtasten på nytt, eller slipp tastene hvis du bruker hold-inne-valget.
6. Vent mens DSSA Tale lager teksten.
7. Les teksten før du sender eller lagrer den.

Hvis teksten ikke kommer inn automatisk, åpner du **Hjem** i DSSA Tale. Finn teksten, trykk **Kopier**, gå tilbake til dokumentet og trykk `Ctrl + V`.

## Ta opp et Teams-møte

Dette er en lokal testfunksjon uten integrering i Teams. Du trenger ingen Teams-bot, Microsoft-innlogging, tillegg eller kontakt med Teams-API-et. DSSA Tale kobler seg ikke til Teams-skyen for å behandle opptaket. Du kan avslutte ett opptak, la teksten bli ferdig og deretter starte neste samtale som et nytt lokalt notat.

DSSA Tale sender ikke opptaksvarsel til deltakerne. Før hvert opptak må du derfor fortelle at du vil ta opp og få et tydelig muntlig samtykke fra deltakerne. Følg også rutinene som gjelder i virksomheten din.

1. Fortell deltakerne at møtet blir tatt opp.
2. Start møtet i Teams.
3. Åpne **Teams og filer** i DSSA Tale.
4. Velg **Teams** og deretter **Start lokalt møteopptak**.
5. Se at tiden begynner å gå. Da vet du at opptaket har startet.
6. Når møtet er ferdig, trykker du **Stopp opptak** i DSSA Tale.
7. La appen stå åpen mens den lager teksten. En framdriftsvisning forteller hvor langt den har kommet.
8. Les gjennom teksten og rett navn, tall og hvem som sa hva.

Gjør et kort prøveopptak før et viktig møte. Mikrofontesten alene kontrollerer ikke lyden fra de andre deltakerne. Kontroller opptakstid, mikrofon og systemlyd på nytt for hvert møte.

## Lag tekst fra en lydfil

1. Åpne **Lydimport**.
2. Velg én fil, flere filer eller en hel mappe.
3. Velg bokmål eller nynorsk.
4. Trykk på knappen for å starte.
5. La DSSA Tale stå åpen til alle filene er ferdige.
6. Hver ferdige fil finnes som et eget notat.

Originalfilene dine blir ikke endret. Hvis appen viser **Gjenoppta** etter en avbrutt fil, kan du fortsette den filen. Hele listen med valgte filer kommer ikke alltid tilbake etter at appen er lukket.

## Finn og bruk notatene

- **Hjem** viser nylige diktater.
- **Møter og notater** viser møteutskrifter og andre notater.
- Søkefeltet øverst finner lagret innhold.
- **Kopier** legger teksten klar til innliming i et annet program.
- **Eksport** kan lage en tekst-, Word- eller PDF-fil når valget finnes i notatet.
- **Rå utskrift** viser teksten før eventuell automatisk opprydding.

Les alltid gjennom teksten. Talegjenkjenning kan skrive feil navn, tall eller ord.

## Velg bokmål eller nynorsk

Menyspråket bestemmer språket på knapper og forklaringer. Transkripsjonsspråket bestemmer om talen skal skrives som bokmål eller nynorsk. Velg riktig transkripsjonsspråk før du starter opptaket.

Hvis et navn eller fagord ofte blir feil, åpner du **Ordliste** og legger det inn der.

## Oppdater appen

1. Vent til alle opptak og lydfiler er ferdig behandlet.
2. Avslutt DSSA Tale helt.
3. Last ned den nye installasjonsfilen fra GitHub-siden.
4. Installer den på vanlig måte.
5. Start appen og prøv et kort diktat.

En vanlig oppdatering skal beholde notater, innstillinger og modeller. Ta likevel vare på viktige ferdige dokumenter.

## Når noe ikke virker

### Mikrofonen gir ingen lyd

Kontroller at mikrofonen er koblet til. Velg riktig mikrofon i DSSA Tale. Kontroller også at Windows har gitt appen lov til å bruke mikrofonen.

### Teksten kommer ikke inn i dokumentet

Klikk først i et vanlig skrivefelt. Prøv i Notisblokk. Du kan alltid kopiere teksten fra **Hjem** og lime den inn selv.

### De andre i Teams-møtet mangler

Da har appen trolig bare fått lyden fra mikrofonen. Kontroller systemlyd og gjør et kort prøveopptak.

### Det tar lang tid

Lange opptak tar lengre tid. Andre åpne programmer og den største talemodellen kan også bruke mye minne. La appen arbeide ferdig.

### Teksten blir feil språk

Kontroller at bokmål eller nynorsk er valgt før opptaket. Prøv et kort opptak uten automatisk tekstopprydding.
