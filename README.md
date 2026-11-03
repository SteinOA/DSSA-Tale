# DSSA Tale for Windows

Gratis lokal norsk diktering, møteopptak og lydimport. Offentlig betaversjon: **1.10.4-dssa.38**, Windows x64.

## Nytt i v38

- Automatisk lokal notatblokk samler ferdig diktering uten ekstra modellkjøring. Kopier, Tøm og Angre bevarer nye avsnitt og manuelle rettelser.
- Historikken har synlige handlingsknapper. Kalenderen ligger over velkomsten, og tekstområdene følger vindusbredden.
- System viser installerte modeller, valgt dikteringsmodell, språk og status for Silero VAD, sherpa-onnx og Community-1. Bare Community-1-oppsettet ligger der.
- Språk og eventuell ordtidsjustering velges ved tale til tekst / lydimport. Valgfrie wav2vec2-tillegg erstatter ikke NB-Whisper.
- Endringene for installert versjon kan leses under System, uten nett eller innlogging.

## Last ned og installer

1. Åpne [siste utgivelse](https://github.com/SteinOA/DSSA-Tale/releases/tag/v1.10.4-dssa.38) og last ned `DSSA-Tale-1.10.4-dssa.38-Windows-x64.exe`.
2. Lukk DSSA Tale før installasjon. Installer og start appen.
3. Velg mikrofon og hurtigtast under innstillingene. Under **Tale til tekst** velger du en NB-Whisper-modell fra Nasjonalbiblioteket og laster den ned.
4. Hold inne hurtigtasten mens du snakker. Slipp tastene for å sette teksten inn i det aktive skrivefeltet.

Lokal diktering krever ingen konto eller abonnement. Store talemodeller lastes ned separat; internett kreves til nedlasting. Valgfrie skytjenester krever egne kontoer og tillatelser. Google/Microsoft-tilkoblinger kan kreve egen appregistrering; se veiledningene i docs/. Valgfri GPU-akselerasjon krever kompatibel maskinvare og ekstra nedlasting. Community-1 er et separat, valgfritt tillegg; se [veiledningen](docs/community-optional-setup.md).

**Tekstopprydding er valgfritt** og kan gi ekstra ventetid. «Løpende tekstvisning» viser en separat forhåndsvisning mens du dikterer og kan slås av. En valgt innstillingsfane betyr ikke at funksjonen er aktivert.

## Status og kjente begrensninger

Dette er en offentlig testutgave. Pakkede moduler, norsk teksteksport, SQLite, lisensfiler og arkivintegritet er kontrollert. Ren installasjon på en ny Windows-PC og full Community-1-installasjon er ikke verifisert. Hastighet avhenger av maskin, modell og innstillinger; det gis ingen garantert responstid.

Installasjonsfilen mangler eget DSSA-kodesigneringssertifikat, så Windows kan vise en advarsel. Kontroller utgiver, filnavn og `SHA256SUMS.txt`; kontrollsummer erstatter ikke kodesignering. Ikke slå av Windows-beskyttelsen.

Feil og forbedringsforslag kan meldes som [issues](https://github.com/SteinOA/DSSA-Tale/issues). Unngå å legge ved personlige opptak, dokumenter, tilgangsnøkler eller logger med private data.

## Opphav og lisenser

DSSA Tale bygger på **OpenWhispr**. **NB-Whisper** kommer fra **Nasjonalbiblioteket** og bygger på **OpenAIs Whisper-modell**, videre trent for norsk. Dette er en uoffisiell tilpasning, ikke utgitt eller godkjent av disse prosjektene.

Se [CREDITS.md](CREDITS.md), [LICENSE](LICENSE), [distribusjon og kilder](docs/windows-distribution.md) og `resources/legal`. Appens MIT-lisens erstatter ikke komponentenes egne vilkår. Modellene har egne lisenser.

## Kildekode og bygging

Dette repositoriet inneholder kildeeksporten til v35 med en offentlig README. Den private utviklingshistorikken følger ikke med. Installasjonsfilen og begge kildearkivene ligger i samme utgivelse:

- `DSSA-Tale-public-source.zip`: kildeeksporten som installasjonsfilen er bygget fra.
- `DSSA-Tale-corresponding-source.zip`: tilhørende medieverktøykilder, avhengigheter, patcher og byggeoppskrift.
- `COMPONENTS-AND-SHA256.json`: komponenter og kontrollsummer.

Utviklere trenger Node.js 24 eller nyere. Kjør `npm ci`, og klargjør native avhengigheter som beskrevet i distribusjonsdokumentasjonen og kildearkivene før bygging. Modellvekter og nedlastede binærfiler inngår ikke i Git-kilden. Brukere av installasjonsfilen trenger ikke utviklingsverktøy.

Mac-versjonen omfattes ikke av denne Windows-utgivelsen.


