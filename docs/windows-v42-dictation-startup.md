# DSSA Tale v42 – første diktering bruker lokal modell

## Feil og rettelse

Ved første oppstart kunne en delt renderer-modul opprette innstillingslageret før main.jsx hadde brukt DSSA sine lokale standardvalg. Hovedvinduets veiviser viste lokal NB-Whisper, mens det skjulte dikteringsvinduet fortsatt hadde useLocalWhisper=false. Diktering feilet med krav om OpenWhispr Cloud-innlogging før tekst kunne bli sendt til innliming.

Innstillingslageret har nå en direkte avhengighet til DSSA-standardvalgene. De brukes før lagerets første lesing av localStorage i hvert vindu. NB-Whisper Large full presisjon er også standardmodell i dette grunnoppsettet. Ingen konto kreves for lokal diktering.

## Test

Regresjonstesten starter fra tom lagring, laster innstillingslageret direkte som det skjulte dikteringsvinduet gjør, og kontrollerer lokal rute, norsk, NB-Whisper Large full, automatisk innliming og avslått tekstopprydding før veiviseren har kjørt. En separat hovedvindus-instans skal beholde samme oppsett. Beslektede veiviser-, standardvalg- og innlimingstester består.

## Grenser

Feilen som ble observert var transkripsjonsruten før innlimingen. Automatisk innliming i alle eksterne programmer er ikke garantert. v42 er lastet ned fra GitHub og installert med tom profil og tom talemodellmappe. Alle 374 installerte pakkefiler er kontrollert mot manifestet. NB-Whisper Large er lastet ned på nytt og kontrollert med SHA-256. Praktisk diktering og innliming i Codex er bekreftet på denne PC-en; loggen viser lokal transkripsjon uten Cloud-bruk. Talemotoren i v41 hadde allerede bestått test med syntetisk lyd, og native komponenter er uendret.

## Første oppsett

NB-Whisper Large med full presisjon (3,1 GB) står øverst og er forhåndsvalgt. Veiviseren viser nedlasting, kontrollerer modellfilen og tester mikrofonen. GPU anbefales i rød tekst ved kompatibel maskinvare. Windows-vinduet åpnes på hovedskjermen.
