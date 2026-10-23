# Testresultaten per importroute (fase 3e)

Getest op 23 oktober 2026 met realistische testbestanden (`tests/ics-bestanden/`), de parser-tests (`tests/ics-import.test.js`, 52
controles), de browsertests (`tests/import.test.js`, 40 controles) en live-aanroepen van de edge function `digigenda-import` via
het Supabase-project (met een tijdelijk testaccount `digigendatest`; zie onderaan).

| Route | Bron | Resultaat | Toelichting |
|---|---|---|---|
| 1. Link | Outlook / Microsoft 365, gepubliceerde ICS-link | **Werkt met beperking** | Parser leest Outlook-exports volledig (Windows-tijdzone `W. Europe Standard Time`, VTIMEZONE, gevouwen regels, wekelijkse reeks met EXDATE, verplaatste en geannuleerde voorvallen, nachtdienst, DURATION). De link zelf is live getest via een gepubliceerd bestand op GitHub (zelfde formaat). **Beperking:** werkt alleen als de beheerder publiceren toestaat, en Microsoft levert ± 6 maanden vooruit. Een echte werk-tenant van Gijs is niet getest: dat kan alleen hij. |
| 1. Link | Google Agenda, geheime iCal-link | **Werkt met beperking** | Google-export gelezen (VTIMEZONE Europe/Amsterdam, UNTIL in UTC, uitzondering met RECURRENCE-ID, EXDATE, geannuleerde reeks, UTC-tijden, meerdaagse hele dag, maandelijks laatste vrijdag). `webcal://`-link live getest. **Beperking:** bij Workspace-werkaccounts kan de beheerder het geheime adres uitzetten; persoonlijke Google-accounts hebben het altijd. |
| 1. Link | iCloud, openbare agenda | **Werkt** | iCloud-export gelezen (meerdaagse vakantie, jaarlijkse verjaardag sinds 1999, afspraak in America/New_York). Openbare link is `webcal://` en alleen-lezen; alleen voor iCloud-agenda's. |
| 1. Link | Rooster-apps (Shiftbase/Planday-stijl, UTC zonder VTIMEZONE) | **Werkt** | Diensten in UTC correct naar Nederlandse tijd, ook rond de wintertijd-overgang (25 okt) en bij een nachtdienst over middernacht; verlof als hele dagen. **Beperking:** alleen als de werkgever de agendalink aan heeft staan; salarispakketten (Nmbrs, AFAS, Youforce) hebben er geen. |
| 1. Link | HAN-rooster / Osiris | **Werkt niet (geen link gevonden)** | Geen gedocumenteerde abonnementslink voor studenten. Als MyX/Osiris een .ics-export biedt: route 2. Anders: roostertekst in de snelle invoer. |
| 2. Bestand | Outlook (`Bestand → Agenda opslaan`), Google-export, iCloud-export, rooster-export | **Werkt** | Lezen gebeurt in de browser; voorbeeld vóór toevoegen; keuze van agenda; "alleen als bezet"; opnieuw importeren werkt het bestaande bij (zelfde sleutels → geen dubbelen, verdwenen afspraken weg). Tot 5 MB; 4000 afspraken (1,7 MB) in < 3 s. |
| 3. Plakken/delen | .ics-tekst in de snelle invoer of het importvenster; `?tekst=` (Android share-target) | **Werkt** | Agenda-tekst wordt herkend aan `BEGIN:VCALENDAR` en opent het importvenster; gewone tekst gaat naar de snelle invoer. **Beperking:** delen naar een web-app werkt niet op iOS (WebKit ondersteunt share-target niet); daar: bestand kiezen of tekst plakken. |
| 3. E-mailadres om uitnodigingen naar door te sturen | — | **Niet gebouwd** | Vereist een eigen domein en een e-mailontvangstdienst (niet gratis zonder domein) en opent een misbruikingang. Zie docs/import-onderzoek.md §6. |
| 4. OAuth (Microsoft Graph / Google Calendar API) | — | **Bewust niet gebouwd** | Werkaccounts vereisen in de praktijk beheerdersgoedkeuring; Google vereist app-verificatie. Staat met uitleg in de app. |

## Live-controles van de serverfunctie (SSRF en gedrag)

| Invoer | Antwoord |
|---|---|
| `http://…` | geweigerd: alleen https/webcal |
| `https://127.0.0.1/…`, `https://[::1]/…`, `https://169.254.169.254/…` | geweigerd: intern adres |
| `https://localhost:8443/…` | geweigerd: alleen poort 443 |
| `https://user:pw@…` | geweigerd: inloggegevens in de link |
| niet-bestaande hostnaam | nette fout: naam niet gevonden |
| `https://www.google.com/` (html) | nette fout: webpagina, geen agendabestand |
| redirect `github.com → raw.githubusercontent.com` | gevolgd (max. 3 hops, elke hop opnieuw gecontroleerd) en gelezen |
| cron-aanroep zonder geheim | 401 |
| verzoek met ongeldig inlogbewijs | `sessie: false` |
| verversen van een opgeslagen link | 6 afspraken opgeslagen met `bron`, `laatst_ververst` gezet |

Beperking: de Supabase-runtime negeert `serverName` bij een TLS-verbinding op een vastgezet IP, dus de DNS-controle en het ophalen
zijn twee stappen (venster van milliseconden voor DNS-rebinding). De edge function heeft geen bevoorrecht intern netwerk.

## Niet getest (kan alleen Gijs)

- Een echte gepubliceerde Outlook-link van zijn werkgever (of de melding dat publiceren uitstaat).
- Een echt geheim Google-adres of een echte openbare iCloud-link (het formaat is identiek aan de testbestanden).
- De uurlijkse verversing over langere tijd (de planner `digigenda-imports` staat aan, elk uur op :07).

## Testaccount

Voor de live-controles is een account `digigendatest` aangemaakt (met één link-import `imp-livetest1`). Verwijderen kan Gijs in
Supabase met `delete from kalender.gebruikers where naam = 'digigendatest';` (de import en opdrachten gaan mee door cascade).
