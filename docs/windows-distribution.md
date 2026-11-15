# DSSA Tale Windows: distribusjon fra v31

Dette er en uoffisiell, gratis tilpasning av OpenWhispr 1.10.4, med norsk
lokal diktering, møter og lydimport. Appens MIT-lisens erstatter ikke
komponentenes lisenser. Original opphavsrett og lisens beholdes.

## Hva som skal ligge ved installasjonen

| Fil                                  | Innhold                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Windows x64-installasjonsfil         | Programmet, små hjelpemodeller og lisenstekster                                                  |
| `DSSA-Tale-public-source.zip`        | Kildesnapshot for akkurat dette bygget, med låste npm-avhengigheter                              |
| `DSSA-Tale-corresponding-source.zip` | FFmpeg/LAME/Opus-kilder, Python- og yt-dlp-kilder, avhengighetskilder, byggepatcher og oppskrift |
| `COMPONENTS-AND-SHA256.json`         | Pakkefiler med SHA-256, versjoner, opphav og lisenshenvisninger                                  |
| `SHA256SUMS.txt`                     | Kontrollsummer for installasjon og kildepakker                                                   |
| `CREDITS.md` og LES-MEG              | Opphav, installasjon og presise testgrenser                                                      |

Begge kildepakker skal publiseres sammen med binærfilen, med samme tilgang
og uten ekstra betaling. Prosjektets private Git-historikk skal ikke gjøres
offentlig: den kan inneholde tidligere betalte ikonressurser og arbeidsdata.
Den offentlige kildepakken er en separat eksport av de distribuerbare filene.
Dette dokumentet endrer ingen tilgangsinnstillinger på GitHub.

## Medieverktøy

FFmpeg-bygget har GPL og nonfree deaktivert. LAME (LGPL) og Opus (BSD)
bygges fra de vedlagte versjonene. FFmpeg kjøres som et separat program;
Electron-appen lenkes ikke mot FFmpegs biblioteker. Byggepatchene tilpasser
MinGW-linkerflagg og lange archiver-kommandoer for Zig/Windows. Kildearkivene
er bevart uendret; lokale endringer leveres som separate patcher og skript.
Zig 0.14.1 og GNU Make 4.4.1 er byggeverktøy. Oppskriften oppgir nedlasting
og SHA-256; brukeren av appen trenger ikke installere disse.

Det tidligere Gyan GPL-bygget og npm-pakken `ffmpeg-static` følger ikke
Windows-installasjonen fra v31. Andre plattformoppsett i grunnlaget er ikke
godkjent av denne Windows-kontrollen.

yt-dlp er et eget PyInstaller-bygg uten mutagen og curl_cffi. Det dekker
appens lydnedlastingsflyt; valgfrie metadata- og impersoneringsfunksjoner fra
upstreams komplette pakke er ikke med. Oppdateringer som brukeren senere
henter direkte fra yt-dlp kan ha andre komponenter og vilkår.
`resources/legal/yt-dlp-components.json` beskriver det isolerte byggmiljøet,
inkludert noen rene byggeverktøy. Originale lisenstekster er bevart i
`resources/legal/yt-dlp/`. Certifis tilsvarende MPL-kilder er vedlagt.

NirCmd-pakken beholdes komplett og uendret og distribueres uten betaling.
Microsofts runtime hentes direkte av installasjonen hvis den mangler;
brukeren leser og godtar Microsofts vilkår selv. Den pakkes ikke om som
enkeltstående DLL-er. Den åpne OpenMP-lisensen er bevart separat.

## Native komponenter og modeller

Komponentmanifestet knytter hver fil til opphav og lisens. whisper.cpp er
festet til OpenWhispr-taggen 0.0.10, llama.cpp til b9763, sherpa-onnx til
1.13.8 og Qdrant til 1.19.2. ONNX-runtime-DLL-ene har filversjon 1.28.2.
Sherpa-programmenes importnavn er endret fra `onnxruntime.dll` til
`ow-onnxrt.dll` av det vedlagte `scripts/lib/pe-imports.js`.

Små Silero-, segmentation-3.0- og CAM++-modeller følger med. For modeller
uten innebygd revisjon er filens SHA-256 identiteten; et modellnavn alene
tolkes ikke som et bevist Git-commit. Segmentation-lisensen er hentet fra
det samme sherpa-onnx-modellarkivet og beholdt uendret.
Store NB-Whisper-/GGUF-modeller, Python-miljøet for valgfrie møteverktøy og
Community-1-modellene følger ikke med. Deres egne vilkår gjelder ved
separat nedlasting; Hugging Face-tilgang kan kreves for valgfrie modeller.

## Testgrenser

Utgaven skal merkes **testutgave**. Dokumenterte bygge- og pakketester
erstatter ikke en kontrollert installasjon på en ny Windows-maskin.
Brukeren har rapportert god funksjon også på en bærbar med eget grafikkort;
maskinvare og målte tider er ikke loggført. Ingen generell hastighetsgaranti
eller måling fra tastslipp til synlig tekst er dokumentert.

Lokal diktering krever ikke konto eller abonnement. Google og Microsoft er
valgfrie tilkoblinger som krever passende appregistrering og samtykke;
testkontoer, klientoppsett og autentiseringstokener følger ikke med.
