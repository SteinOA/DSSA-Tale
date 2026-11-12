# DSSA Tale v42 – første diktering bruker lokal modell

## Feil og rettelse

Ved første oppstart kunne en delt renderer-modul opprette innstillingslageret før main.jsx hadde brukt DSSA sine lokale standardvalg. Hovedvinduets veiviser viste lokal NB-Whisper, mens det skjulte dikteringsvinduet fortsatt hadde useLocalWhisper=false. Diktering feilet med krav om OpenWhispr Cloud-innlogging før tekst kunne bli sendt til innliming.

Innstillingslageret har nå en direkte avhengighet til DSSA-standardvalgene. De brukes før lagerets første lesing av localStorage i hvert vindu. NB-Whisper Large full presisjon er også standardmodell i dette grunnoppsettet. Ingen konto kreves for lokal diktering.

## Test

Regresjonstesten starter fra tom lagring, laster innstillingslageret direkte som det skjulte dikteringsvinduet gjør, og kontrollerer lokal rute, norsk, NB-Whisper Large full, automatisk innliming og avslått tekstopprydding før veiviseren har kjørt. En separat hovedvindus-instans skal beholde samme oppsett. Beslektede veiviser-, standardvalg- og innlimingstester består.

## Grenser

Feilen som ble observert var transkripsjonsruten før innlimingen. Automatisk innliming i alle eksterne programmer er ikke garantert. En faktisk diktering og innliming i Codex er ikke ende-til-ende-verifisert for denne pakken. v42 installeres ikke på denne PC-en nå, etter brukerens ønske om å fjerne den installerte programvaren. Talemotoren i v41 hadde allerede bestått test med syntetisk lyd, og native komponenter er uendret.

## Første oppsett

NB-Whisper Large med full presisjon (3,1 GB) står øverst og er forhåndsvalgt. Veiviseren viser nedlasting, kontrollerer modellfilen og tester mikrofonen. GPU anbefales i rød tekst ved kompatibel maskinvare. Windows-vinduet åpnes på hovedskjermen.
