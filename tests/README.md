# Tests

Start eerst een lokale server in de hoofdmap: `python3 -m http.server 8766`.
Daarna: `npm i playwright` (of zet `PLAYWRIGHT_PAD` / `CHROMIUM_PAD` naar een bestaande installatie).

| Bestand | Wat |
|---|---|
| `parse.test.js`, `parse2.test.js` | Snelle invoer (`node tests/parse.test.js`) |
| `ics.test.mjs` | Agenda-abonnement met eindtijden |
| `app.test.js` | Hele app in de browser, met nagebootste Supabase (laptop, telefoon, meldingen, offline) |
| `aanraken.test.js` | Vegen, lang indrukken en tikken op de telefoon |
| `xss.test.js` | Geen code-injectie via titels/notities (verwacht `"xss":0,"imgs":0`) |
| `sw-push.test.js` | Service worker toont een melding bij een push |
| `randgevallen.test.js` | 320 px, 30+ to-do's, lange titels, overlappende afspraken, nachtdienst, lege dag, toetsenbord, dagwisseling, toetsenbordbediening |
| `ics-import.test.js` | `ics.js` met echte voorbeeldbestanden (Outlook, Google, iCloud, roosterapp, rare gevallen) uit `tests/ics-bestanden/` (`node tests/ics-import.test.js`) |
| `import.test.js` | Agenda's binnenhalen in de browser: bestand, plakken, link (nagebootste serverfunctie), privacy, geen dubbelen, verwijderen |
| `meeplannen.test.js` | Vrije tijd, Plan in, studieblokken, dagstart, avondblik |
| `openen.test.js` | Face ID na X minuten, melding/link opent item, shortcuts, share-target via de service worker, cache-first |
| `schermafbeeldingen.js` | Maakt schermafbeeldingen in `tests/schermen/` |
| `ontwerp-schermen.js` | Maakt de ontwerpset op 360, 390, 768 en 1440 px, licht en donker (`OUT=docs/schermen node tests/ontwerp-schermen.js`) |

Alles in één keer: `sh tests/alles.sh` (verwacht een server op 8766).

Alle tests praten met een nagebootste server; ze raken de echte database niet.
