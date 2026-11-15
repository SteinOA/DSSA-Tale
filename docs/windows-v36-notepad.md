# Automatisk notatblokk – Windows v36

Hjem viser en lokal personlig notatblokk. Ferdig tekst fra eksisterende dikteringslagring legges til i nye avsnitt. Automatisk innliming bruker samme eksisterende kode som før. Ingen tekst hentes fra utklippstavlen, og notatblokken bestiller ingen ekstra transkripsjon, språkmodell eller embedding.

Hver lagring leser den ferske notatraden i en SQLite-transaksjon. Leverings-ID hindrer duplikater, også etter omstart. Lagring av historikk og notatblokk er separate: en feil i notatblokken ruller tilbake notatmutasjonen, mens allerede lagret diktering beholdes i historikken. Det gis en synlig feilmelding uten transkripsjon i logger. Ingen eldre historikk importeres.

Manuelle rettelser fra Notater sendes med teksten redigeringen startet fra. En ny automatisk avsnittshale flettes inn etter rettelsene. Andre samtidige endringer gir konflikt fremfor stille overskriving. Ved feil i en forsinket redigeringslagring beholdes redigeringsbufferen med synlig beskjed.

Kopier notatet skriver bare det aktuelle notatet til utklippstavlen. Tøm notatblokken tømmer bare denne notatraden og lagrer én lokal angrekopi. Angre setter den tømte teksten foran det som er kommet til siden. Ny tømming erstatter forrige angrepunkt. Dikteringshistorikk, andre notater og målprogrammets tekst berøres ikke.

Automatisk lagring krever synkronisert tillatelse til lokal historikk og avklart policy ved innlogget konto. Deaktivert eller blokkert historikk oppretter ingen notatlagring. Eksisterende innhold slettes ikke automatisk når bryteren slås av. Notatet er lokalt og utelatt fra skysynkronisering, deling, markdown-speiling og modellbasert indeksering.

## Kontroller

- Automatiske regresjonstester av dikteringsferdigstilling, innlimingsfeil, tekstbevaring, historikkinnstillinger og forhåndsvisningsgeometri.
- Integrasjonstester mot ekte SQLite med syntetisk bokmål/nynorsk, navn og tall; duplikatvern, 20 raske leveringer, manuelle rettelser og avsnitt tilført mens redigering venter, tømming/ny tekst/angre, lukking/gjenåpning av databasen og fremprovosert skrivefeil.
- Visuell kontroll av faktisk React-visning med produksjons-CSS i lyst/mørkt tema og større tekst/smalt område.
- Typesjekk, rendererbygg og ESLint for TypeScript/React-filer. CommonJS-hjelpere dekkes av kjøring og integrasjonstester og er utelatt fra prosjektets ESLint-oppsett.

## Må prøves av brukeren før publisering

Installer manuelt etter å ha lukket appen. Kontroller at versjonen er 1.10.4-dssa.36.

1. Dikter tre setninger i et annet program. Kontroller både automatisk innliming og tre nye avsnitt på Hjem. Prøv bokmål/nynorsk, navn og tall.
2. Gå til Notater, rett teksten, vent på lagring og dikter igjen. Kontroller at rettelsene beholdes.
3. Tøm notatblokken, dikter en ny setning, og trykk Angre tømming. Både gammel og ny tekst skal finnes.
4. Naviger bort og tilbake; lukk og start appen igjen. Notatet skal beholdes.
5. Slå av lokal historikk, dikter og kontroller at notatblokken ikke får nye avsnitt. Slå på igjen ved ønsket videre bruk.

Faktisk mikrofon, hurtigtast og innliming i et eksternt Windows-program i den nye pakken er ikke testet av automatiseringen. Ren Windows-installasjon er heller ikke testet. Ingen installasjon, omstart eller endring av eksisterende brukerprofil er utført. Offentlig publisering krever brukerens uttrykkelige OK etter prøving.

Utgaven inneholder også den tidligere bestilte lavere og bredere flytende tekstforhåndsvisningen og tydeligere navn på valget for å slå av ekstra tenking. En allerede eksisterende test av lenkehandlere i assistentvinduet feiler på både opprinnelig og endret kilde (tre handlere mot forventet to); dette gjelder ikke notatlagring eller diktering.
