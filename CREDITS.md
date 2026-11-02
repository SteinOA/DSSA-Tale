# Opphav, bidragsytere og lisenser

DSSA Tale for Windows er en selvstendig tilpasning av **OpenWhispr**, ikke et
nyutviklet talegjenkjenningssystem. Takk til forfatterne, vedlikeholderne,
forskerne og øvrige bidragsytere i prosjektene nedenfor.

## Grunnlaget

- **OpenWhispr Team og prosjektets bidragsytere:** Electron-appen, diktering,
  opptak, modellhåndtering og store deler av brukergrensesnittet.
  [Kildekode](https://github.com/OpenWhispr/openwhispr),
  [bidragsytere](https://github.com/OpenWhispr/openwhispr/graphs/contributors).
  Windows-arbeidet bygger på v1.10.4, commit
  `ba6d61820b4c56d7b08012c61c2ae6b43f3152f3`.
  Original MIT-lisens og opphavsrettstekst er bevart i [LICENSE](LICENSE).
  Original dokumentasjon finnes i [README.upstream.md](README.upstream.md).
- **Nasjonalbiblioteket AI Lab / NbAiLab:** NB-Whisper-modellene for norsk
  talegjenkjenning. [Modellkort og forfatterreferanser](https://huggingface.co/NbAiLab/nb-whisper-large).
  Modellkortet oppgir Apache-2.0. Store talemodeller følger ikke med
  installasjonen; de velges og lastes ned i appen eller gjenbrukes lokalt.
- **OpenAI og Whisper-bidragsyterne:** det opprinnelige Whisper-grunnlaget som
  NB-Whisper bygger videre på. [Prosjekt og MIT-lisens](https://github.com/openai/whisper).
- **ggml-org, Georgi Gerganov og whisper.cpp-bidragsyterne:** lokal kjøring av
  Whisper. [whisper.cpp](https://github.com/ggml-org/whisper.cpp), MIT.
  Appens nedlastingsoppsett bruker også
  [OpenWhisprs whisper.cpp-bygg](https://github.com/OpenWhispr/whisper.cpp).

## Taleaktivitet og talerfordeling

- **Silero Team og Silero VAD-bidragsyterne:** taleaktivitetsdeteksjon.
  [Silero VAD](https://github.com/snakers4/silero-vad), MIT.
- **k2-fsa / sherpa-onnx-bidragsyterne:** lokal ONNX-kjøring og distribusjon av
  talerfordelingsmodellene. [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx), Apache-2.0.
- **pyannote og forskerne bak segmentation-3.0:** segmenteringsmodellen som
  brukes i sherpa-onnx-utgaven. [Modellkort](https://huggingface.co/pyannote/segmentation-3.0), MIT.
- **3D-Speaker / ModelScope og CAM++-forfatterne:** stemmerepresentasjonen
  `3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx`.
  [3D-Speaker](https://github.com/modelscope/3D-Speaker), Apache-2.0.

De små hjelpemodellene for taleaktivitet og talerfordeling beholdes i
Windows-pakken. De må ikke forveksles med de store, valgfrie talemodellene.
Talerfordeling er ikke identitetsgjenkjenning; etiketter og navn må kontrolleres.

## Andre avhengigheter

Appen bruker blant annet Electron, Chromium, Node.js, React, Radix UI,
Tailwind CSS, SQLite/better-sqlite3, ONNX Runtime, docx, markdown-it, Qdrant,
llama.cpp og FFmpeg. Se [package-lock.json](package-lock.json) for de faktiske
JavaScript-versjonene og [tredjepartsmerknadene](resources/legal/THIRD-PARTY-NOTICES.txt)
for lisens- og opphavsrettstekster. Denne korte oversikten erstatter ikke dem.

**FFmpeg har egne vilkår.** Fra Windows v31 brukes et eget lydbygg av
FFmpeg 6.1.1 med LAME 3.100 og Opus 1.5.2. GPL- og nonfree-delene er ikke
aktivert. FFmpeg og LAME beholder sine LGPL-vilkår, og Opus beholder sin
BSD-lisens. Programmet kjøres separat fra Electron-appen.
Fullstendige kildearkiver, lokale byggepatcher og byggeoppskrift følger
utgivelsen i `DSSA-Tale-corresponding-source.zip`. Denne kildepakken skal
alltid tilbys sammen med installasjonsfilen, med samme tilgjengelighet.
Se [distribusjonsoversikten](docs/windows-distribution.md).

**yt-dlp** 2026.07.04 bygges separat med Python 3.12.10 og PyInstaller 6.13.0,
uten den valgfrie GPL-avhengigheten mutagen. yt-dlp-koden er Unlicense;
de faktiske avhengighetene beholder sine egne vilkår. PyInstallers
bootloader-unntak følger med lisensen. Certifis MPL-kildekode og
kildedistribusjonene til byggmiljøets avhengigheter følger kildepakken.
Dette gir ikke rett til å laste ned andres innhold i strid med deres vilkår.

**NirCmd**, copyright Nir Sofer, er et separat freeware-verktøy, ikke MIT.
Hele den uendrede x64-pakken følger med: `nircmd.exe`, `nircmdc.exe` og
`NirCmd.chm`. Verktøyet distribueres uten betaling. Originalvilkårene finnes
i `resources/legal/native/NirCmd-LICENSE.txt` og i den medfølgende hjelpen.

**WebRTC-bidragsyterne** og **Abseil-bidragsyterne** krediteres for lokal
ekkokansellering. APM-kilden er festet til
`08f235eba0c247f8929045adb090d0b0445cf8ea`, Abseil til
`9ac7062b1860d895fb5a8cbf58c3e9ef8f674b5f`. BSD-, patent- og Apache-tekstene
er bevart under `resources/legal/native/`.

**Lucide-bidragsyterne og Cole Bemis / Feather** krediteres for ikonene (ISC
og MIT). Det tidligere betalte Nucleo-settet brukes ikke i v31-bygget eller
den offentlige kildepakken. **Noto Sans, Inter og Caveat** beholder sine
SIL Open Font License-tekster. Den betalte Yowza-skriften pakkes ikke med.

**Microsoft Visual C++ Runtime** er en separat systemforutsetning. De løse
Microsoft-runtime-DLL-ene følger ikke med v31. Om nødvendig henter
installasjonen Microsofts signerte x64-installasjon direkte fra Microsoft;
brukeren godtar Microsofts vilkår i deres eget vindu. Ingen omstart utføres
automatisk. LLVM OpenMP-komponenten har en separat bevart lisens.

**NSIS og bidragsyterne til INetC, nsExec og NSISunz** krediteres for
installasjonen. Originale NSIS-vilkår ligger i `resources/legal/native/NSIS-COPYING.txt`.
V31 bruker ZIP-utpakking og zlib-komprimering; Nsis7z-/LZMA-utpakkeren fra
de tidligere pakkene brukes ikke i dette installasjonsbygget.

Den valgfrie Tinfoil-leverandøren er utelatt i Windows-distribusjonen fordi
dens SDK-er har AGPL-vilkår. Ingen Tinfoil-/verifier-SDK-kode pakkes i
renderer eller Node-ressurser. Grunnlagets egne MIT-lisensierte adaptere og
typer kan fortsatt forekomme i kildesnapshotet. Andre plattformbygg og
upstreams komplette leverandørutvalg er ikke omfattet av denne kontrollen.
Eksisterende Tinfoil-innstillinger slettes ikke, men leverandøren kan ikke
brukes i denne Windows-utgaven. Lokal bruk og Google/Microsoft er uendret.

De valgfrie Python-adapterne under `scripts/meeting-engine` bygger på
Faster-Whisper/CTranslate2, PyTorch og pyannote.audio. Faster-Whisper er fortsatt
et separat forsøk. Fra Windows v22 kan Community-1 brukes til lokal
talerfordeling ved lydimport når en kontrollert Python-runtime og modellen
er konfigurert lokalt. Modellen er testet på offentlige talerklipp og en lang
lokal møtefil. Resultatene beviser ikke riktige identiteter i hele møtet.

**pyannote/speaker-diarization-community-1** har
[CC-BY-4.0-modellvilkår og forskerreferanser](https://huggingface.co/pyannote/speaker-diarization-community-1).
pyannote.audio-koden er MIT-lisensiert. Modellvekter, Python-miljø og
kontonøkler ligger utenfor dette kodearkivet og pakkes ikke i installasjonsfilen.
Modelltilgang må godkjennes av brukeren hos Hugging Face. Inference skjer lokalt.
Les oppsetts- og testgrensene i [Community-1-notatet](docs/COMMUNITY-1-WINDOWS.md).

## DSSA-tilpasningene

Fra v28 kan valgfrie møteverktøy installeres separat fra appen. Takk til
**Astral og python-build-standalone-bidragsyterne** for den portable
[Python-distribusjonen](https://github.com/astral-sh/python-build-standalone),
**Python Software Foundation og Python-bidragsyterne**, og **NLTK-bidragsyterne**
for [Punkt-ressursene](https://github.com/nltk/nltk_data).
Python-arkivet og Punkt kontrolleres mot festede SHA-256-summer før bruk.
Python-/pakke- og modell-lisensfiler skal beholdes i det nedlastede miljøet.
Windows-avhengighetene er festet i `scripts/meeting-engine/requirements-windows.txt`.
Disse nedlastingene, modellene og Hugging Face-nøklene pakkes ikke i installasjonen.

Et separat tidsjusteringsforsøk bruker [WhisperX](https://github.com/m-bain/whisperX)
(Max Bain og bidragsytere, BSD-2-Clause) og Nasjonalbibliotekets
[Wav2Vec2-modeller](https://huggingface.co/NbAiLab) for bokmål og nynorsk
(Apache-2.0). Modellrevisjoner og filsummer står i
`scripts/meeting-engine/alignment-models.json`. WhisperX, Python-testmiljøet og
disse modellvektene følger ikke med Windows-pakken. Forsøket erstatter ikke
den aktive transkripsjonen. Se [testnotatet](docs/windows-v24-alignment-trial.md).
Fra v25 kan den lokale tidsjusteringen velges ved lydimport sammen med
Community-1. Windows-pakken inneholder adapteren; Python-bibliotekene og
modellvektene installeres separat. Se [oppsettet](docs/windows-v25-alignment.md).
Fra v26 foretrekkes GPU når det er plass; CPU brukes som reserve ved manglende
CUDA, minnemangel eller GPU-feil. Se [v26-notatet](docs/windows-v26-gpu-alignment.md).

Windows-tilpasningene vedlikeholdes i
[SteinOA/openwhispr-nb-whisper](https://github.com/SteinOA/openwhispr-nb-whisper).
De omfatter blant annet norsk grensesnitt, bokmål/nynorsk-valg, lokal
møte- og filflyt, eksport, hjelpetekster, ressursvisning, leverandørmarkeringer
og integritetskontroller for opprydding og referat. Endringene er utviklet
med hjelp av OpenAI Codex og gjennomgått gjennom kodekontroller, avgrensede
tester og brukerens lokale utprøving. Det er ikke en påstand om feilfrihet
eller om at alle integrasjoner er ende-til-ende-testet.

Git-historikken og opprinnelige copyright-tekster beholdes. DSSA Tale er ikke
utgitt eller godkjent av OpenWhispr, OpenAI, Nasjonalbiblioteket, Microsoft,
Google eller Apple. Navn og leverandørmerker tilhører sine respektive eiere.

## Filer som følger en offentlig testutgave

- `DSSA-Tale-public-source.zip`: den tilpassede kildekoden og byggeskriptene,
  uten privat Git-historikk, betalte ikonfiler, brukerprofiler eller nøkler.
- `DSSA-Tale-corresponding-source.zip`: de tilsvarende kildearkivene for
  medieverktøyene og de lokale byggeendringene.
- `COMPONENTS-AND-SHA256.json`: faktiske pakkefiler, størrelser, summer,
  komponentversjoner, lisenser og kildehenvisninger.
- `SHA256SUMS.txt`, denne krediteringen og utgivelsens LES-MEG/teststatus.

Installer og begge kildepakker må gjøres tilgjengelige samlet. Å publisere
bare en gammel v30-installasjon med denne nye teksten er ikke tilstrekkelig.
V31 er en testutgave; en kontrollert installasjon på en helt ren Windows-PC
og alle kontointegrasjoner er ikke bekreftet. Brukererfaring på en bærbar PC
med eget grafikkort er rapportert, men er ikke en kontrollert maskinmåling.

Ingen privat lyd, transkripsjoner, kontoopplysninger, autentiseringstokener
eller brukerprofiler skal legges i dette kodearkivet.
