# Windows v40: møteopptak og framdrift

Notatet viser tekst på Start opptak- og Stopp opptak-knappene og en trinnvis
forklaring på opptak, stopp og hvor utskriften havner. Forklaringen nevner at
et nytt notat kan starte opptak automatisk og skiller mellom diktering med
hurtigtast og møteopptak.

Etter stopp holdes en notatbundet behandlingsstatus synlig mens den faktiske
stoppeoperasjonen transkriberer og lagrer. Tidligere fikk NoteEditor alltid
`isProcessing=false`, og opptaksflagget ble tømt før sluttbehandlingen var over.
Det nye feltet `processingNoteId` varer til stoppeoperasjonens Promise er
avsluttet, også ved feil. Det starter ikke en ny transkripsjon.

Ved lokal «Transkriber etter møtet» kommer framdriften fra den eksisterende
PCM-køen, ikke en timer som gjetter prosenten. Køen registrerer fullførte bytes
først etter at en lydbit er vellykket transkribert og fjernet fra arbeidskøen.
24 kHz, mono, 16-bit PCM tilsvarer 48 000 bytes per lydsekund. Mikrofon og
systemlyd summeres som arbeid på separate spor; UI forklarer derfor hvorfor
lydmengden kan overstige møtets varighet.

Visningen har prosent, behandlet lyd og gjenstående lyd. Anslått resttid for
tekstfasen beregnes først etter to fullførte lydbiter, fra faktisk brukt tid og
forholdet mellom ferdige og gjenstående bytes. Den er merket som et anslag og
gjelder ikke etterfølgende talerfordeling. 100 prosent viser at lydkøens
tekstfase er ferdig, med egen forklaring om videre lagring/talerfordeling.
Mellom oppdateringene vises en arbeidsindikator. Ingen falsk prosentøkning
eller garantert fullføringstid brukes.

Main sender framdrift gjennom en egen IPC-hendelse. Rendereren tar bare imot
framdrift for notatet som faktisk sluttbehandles, og tømmer status etterpå.
Skyopptak og løpende transkripsjon får generell behandlingsstatus ved stopp,
men loves ikke denne målbare køframdriften.

Målrettede tester kontrollerer at mislykkede lydbiter beholdes og ikke telles
som ferdige, at begge spor telles, at ny kjøring teller resterende arbeid,
at status varer gjennom en ventende stopp, og at hendelser fra andre eller
ferdige notater ignoreres. UI-prøven kontrollerer synlig framdrift og skillet
mellom tekstfasen og videre behandling. Mikrofon- og Teams-prøve med den nye
pakken er fortsatt en separat praktisk test. Ingen konto eller lydinnstilling
er endret av disse kontrollene.
