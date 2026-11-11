# DSSA Tale Windows v41 – veiledet førstegangsoppsett

v40 sendte brukeren fra velkomst rett til innstillinger. Modell, mikrofon og modellvalg for møte/import ble ikke kontrollert i en samlet flyt.

v41 leder gjennom fire trinn: språk og forklaring, modellnedlasting med framdrift og diskontroll, lokal mikrofontest med lydmåler og feilveiledning, og instruksjon til første notat/opptak. Tilbake er tilgjengelig. Oppsettet kan åpnes igjen under Generelt. Vinduet har flyttbar tittellinje og vindusknapper.

Fullføring krever installert valgt modell og en avsluttet mikrofontest som registrerte lyd. Modellen kontrolleres igjen før innstillingene lagres. Diktering, møte og lydimport settes til lokal Whisper med samme modell; norsk eller engelsk velges fra grensesnittspråket. Tekstopprydding er av i grunnoppsettet. Ingen konto/API-nøkkel kreves. Community-1 og skykoblinger er valgfrie.

## Kontroller og grenser

Automatisk funksjonstest går gjennom tom modelliste, manglende modell, nektet mikrofontilgang, lydregistrering, stopp/opprydding, modell som slettes før fullføring, og korrekt lokal konfigurasjon i alle tre lydkontekster. Typekontroll og relaterte komponenttester kjøres før pakking.

Mikrofontesten registrerer lydnivå uten å lagre lyd. Den er ikke en transkripsjonstest og kontrollerer ikke systemlyd eller talerfordeling. Første virkelige opptak må fortsatt prøves av brukeren. Installer og faktisk installert versjon kontrolleres fra GitHub-nedlasting med SHA-256. En tom profil på denne PC-en tilsvarer ikke testing på alle Windows-maskiner.

## Oppstartsrettelse funnet ved GitHub-installasjonen

Den nedlastede pakken avdekket EACCES ved kopiering av Local Storage/leveldb etter at Chromium hadde åpnet mappen. Sikkerhetskopien startes nå etter at enkeltinstanslåsen er tatt, før app.whenReady og før Chromium sin standardsesjon opprettes. En andre appinstans sikkerhetskopierer ikke profilen. En manglende profilmappe opprettes før markøren skrives. Reelle sikkerhetskopifeil stopper fortsatt migrering, slik at eksisterende data ikke overskrives uten sikkerhetskopi. Tester dekker ny profil, bevaring av tidligere innstillinger og feil uten fullført markør.
