# Community-1 i Windows v22

Community-1 er en valgfri lokal motor for talerfordeling ved **lydimport**.
Den bytter ikke ut NB-Whisper eller dikteringen ved markøren. Dagens
sherpa-onnx-motor er fortsatt tilgjengelig som alternativ.

## Lokal utprøving 30. oktober 2026

- Tilgangen til den gatede modellen ble først avvist, og fungerte etter at
  brukeren godkjente vilkår/tilgang hos Hugging Face.
- Fem publiserte modellfiler, cirka 32,8 MB totalt, ble kontrollert mot
  modellkildens filsummer. Inference kontrollerer en fast revisjon og kjente
  SHA-256-summer før modellen lastes.
- I et sammenklippet, offentlig testopptak på 54,747 sekunder med fire kjente
  NPSC-talere og fem turer fant Community-1 fire grupper. Samme taler fikk
  samme etikett ved gjenkomst. Dagens sherpa-onnx fant seks grupper i samme lyd.
  Det er en liten, ren test uten overlapp, ikke en generell nøyaktighetsmåling.
- En virkelig produksjonsbroprøve med den begrensede batchstørrelsen fant også
  fire grupper på det offentlige klippet. Hele brokallet tok 14,9 sekunder,
  inkludert ny Python- og modelloppstart.
- En lokal møtefil på 6 942,752 sekunder ble analysert på CUDA. Modellinnlasting
  tok 12,1 sekunder og analyse 217,6 sekunder: 229,7 sekunder totalt.
- Med samme ASR-tekst og tidsstempler økte merkede tekstsegmenter fra
  2 170/3 215 til 2 790/3 215. Ukjente segmenter falt fra 1 045 til 425.
  Tekstinnhold og rekkefølge var uendret. Ingen lagrede notater ble overskrevet.
- Community-1 fant ti grupper, mens sherpa-onnx hadde tolv etiketter. Brukeren
  oppgir omtrent 10–14 møtedeltakere. Ingen av tellingene dokumenterer faktisk
  identitet eller hvem som snakket. Det finnes ingen manuelt verifisert DER.
- En reell Windows-avbrytingstest bekreftet AbortError og ingen gjenværende
  Python-prosesser fra testjobben. Prosesstreet må avsluttes fordi en Windows-
  venv-launcher kan ha en egen Python-underprosess.

Færre ukjente segmenter alene er ikke bevis for mer korrekt fordeling. Feil
sammenslåing, korte bidrag, bakgrunnstale og overlapp må kontrolleres manuelt.
Grensen er satt til 15 etter brukerens valg, slik at et oppgitt møte med opptil 14 talende personer
ikke begrenses til 12. Dette er støtte for talerantallet, ikke dokumentasjon på
korrekt gjenkjenning av 14 personer.

## Oppsett og bruk

Den lokale utprøvingsmaskinen har et separat Python-miljø. Det er ikke med i
installasjonsfilen. Andre maskiner må sette opp det avhengighetsmiljøet som er
beskrevet i [adapterens README](../scripts/meeting-engine/README.md) og hente
modellen med egne, godkjente Hugging Face-rettigheter.

Profilfilen `dssa-community-engine.json` kan peke til dette miljøet:

```json
{
  "enabled": true,
  "pythonPath": "C:\\valgt-miljo\\Scripts\\python.exe",
  "modelPath": "C:\\valgte-modeller\\community-1",
  "device": "cuda"
}
```

Filene må være tilgjengelige på maskinen. Profilfilen inneholder ingen token.
Appen viser Community-1 som tilgjengelig når oppsettet finnes. Under
**Lydimport → Skill talere → Motor for stemmeutskillelse** kan brukeren velge
Community-1 eller sherpa-onnx. Valget huskes. Manglende Community-1-oppsett
erstattes ikke med en umerket påstand om at Community-1 ble kjørt.

Community-1 kjøres etter ASR for å begrense samtidig GPU-belastning. På denne
maskinen beholdes Whisper-modellen i minnet; Community-1 bruker batchstørrelse
8 for segmentering og embeddings. En liten maskin kan likevel mangle kapasitet.
Denne rekkefølgen kan ta lengre total tid enn sherpa-onnx sin parallelle
CPU-kjøring. De målte 3:50 gjelder bare Community-1-analysen, ikke hele importen.

Lyd behandles som en midlertidig mono 16 kHz PCM16-kopi, slik modellen krever.
Originalfilen beholdes. Uavhengige originalkanaler utnyttes ikke separat i
denne implementeringen; det er et mulig videre arbeid.

## Videre testing

Manuelt kontrollerte talerskifter og overlapp, flere språk/dialekter, korte
innlegg fra mange personer, målt GPU-minne i hele v22-jobben, installasjon på
ren Windows-maskin og enklere runtime-oppsett i grensesnittet gjenstår.
WhisperX-basert ordjustering er undersøkt som mulighet, men ikke integrert.
