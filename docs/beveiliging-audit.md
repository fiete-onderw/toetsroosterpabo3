# Beveiligings- en kwaliteitsaudit (fase 2)

Datum: 23 oktober 2026. Project: Supabase "Stipt" (`srfigofpluibrrgcefuq`), alleen schema `kalender` en de `public.kal_*`-functies.

## Wat is gecontroleerd

| Onderdeel | Hoe | Uitkomst |
|---|---|---|
| RLS op alle `kalender.*`-tabellen | `pg_policies`, `has_table_privilege` | Aan, geen policies (bewust: de API komt niet bij het schema; `anon` heeft geen `usage` op het schema) |
| Rechten `kal_*`-functies | `has_function_privilege` per rol | `anon` alleen de 12 functies die de website nodig heeft; `service_role` de 5 serverfuncties; `authenticated` niets meer |
| Directe tabel-toegang via REST | `GET /rest/v1/gebruikers` met publishable key | 404 (tabel niet in het API-schema) |
| `kal_ics_data` via REST als anon | POST met publishable key | 401 `permission denied` (was: toegestaan) |
| Meldingen-planner (pg_cron) | `cron.job_run_details` + `net._http_response` | Draait elke minuut zonder fouten; aanroep met geheim → 200 `{"ok":true}`; zonder geheim → 401 |
| Edge function `digigenda-agenda` | Live aanroep met ongeldige code | 404 met nette tekst; haalt data nu met de service-rol op |
| Edge function `digigenda-meldingen` | CORS, invoercontrole, misbruik | CORS alleen voor `https://fiete-onderw.github.io`; token moet een uuid zijn; testmelding max. 1× per minuut per account |
| XSS | `tests/xss.test.js` + review van alle `innerHTML` | Alle gebruikersdata gaat door `esc()`; kleuren/soorten via whitelist |
| CSP | `index.html` | Ongewijzigd: alleen eigen scripts, verbinding alleen met Supabase. `style-src 'unsafe-inline'` blijft nodig voor de positionering van tijdblokken (inline `style="top:…"`), scripts blijven strikt |
| Browseropslag | review | Inlogbewijs (uuid) en een kopie van de opdrachten in `localStorage`; nooit de pincode. Face ID-slot is een schermslot, geen versleuteling |

## Gevonden en opgelost

1. **`kal_ics_data` was voor iedereen aanroepbaar** (met een geldige geheime code). Nu alleen voor `service_role`; de agenda-functie gebruikt de service-rol. De code van 36 hex-tekens blijft de echte bescherming, maar brute force via de REST-API is nu uitgesloten.
2. **`authenticated` kon alle `kal_*`-functies aanroepen.** Digigenda logt nooit in via Supabase Auth; die rol is van Stipt. Ingetrokken.
3. **`kal_bewaar` gaf een databasefout (HTTP 400) bij een rare datum of id.** Nu een nette foutmelding; de app toonde anders eindeloos "Niet alles staat online".
4. **Testmelding kon onbeperkt worden aangeroepen** door wie een inlogbewijs heeft. Nu 1× per minuut per account.
5. **`kalender.klaarzetten` had geen primaire sleutel** (advisor). Toegevoegd.
6. **Nachtdienst (22:00–06:00) verloor zijn eindtijd** in de app en in de .ics. Opgelost in fase 1 (DTEND op de volgende dag).
7. **Accountformulier werd opnieuw getekend tijdens het typen** als de sync op de achtergrond klaar was (pincode kwijt). Stille verversingen slaan het formulier nu over.
8. **Back-up terugzetten kende geen maximum**; de server weigert boven 1000, waardoor de sync bleef hangen. Nu wordt boven 1000 overgeslagen met uitleg.
9. **Opruimtaak** `digigenda-opruimen` (04:10) verwijdert 'al gestuurd'-sleutels ouder dan 14 dagen.

## Advisor-meldingen die bewust blijven staan

- *RLS enabled, no policy* op `kalender.*`: de website komt nooit rechtstreeks bij deze tabellen; `anon` heeft geen `usage` op het schema. Een policy toevoegen zou juist een ingang maken.
- *anon can execute SECURITY DEFINER function* voor de 12 publieke `kal_*`-functies: dat is het ontwerp (inloggen met gebruikersnaam + pincode in plaats van Supabase Auth). Elke functie controleert zelf het inlogbewijs.
- *pg_net in public schema*: door Supabase/Stipt zo geïnstalleerd. Verplaatsen vereist `drop extension` in een gedeeld project; niet gedaan zonder toestemming.
- *Leaked password protection*: Supabase Auth, hoort bij Stipt.

## Randgevallen uit de code-review

- **Sync-wachtrij:** per id een `bewaar`/`verwijder`-vlag; mislukt een verzoek, dan gaat de id terug in de wachtrij. Verlopen sessie → wachtrij blijft staan en wordt na opnieuw inloggen alsnog verstuurd.
- **Offline → online:** `online`- en `visibilitychange`-events roepen `vernieuw()` aan: eerst wachtrij versturen, dan de serverlijst ophalen.
- **Twee apparaten tegelijk:** laatste schrijver wint per opdracht (geen samenvoeging per veld). Verwijderen op apparaat A terwijl B dezelfde opdracht offline wijzigt: B's wijziging zet hem terug. Dat is bekend en bewust eenvoudig gehouden.
- **Tijdzones:** de app rekent in de lokale tijd van het apparaat; meldingen en .ics rekenen in Europe/Amsterdam (met VTIMEZONE en zomertijdregels). In het buitenland kan 'vandaag' dus verschillen.
- **Dagwisseling om 00:00:** elke 30 s wordt gecontroleerd; 'Vandaag' springt mee en een nachtdienst van gisteren loopt door als vervolgblok.

## Niet getest (kan alleen Gijs)

- Echte pushmelding op zijn iPhone (de keten planner → functie → Apple is live gecontroleerd tot aan het versturen; er stond niets klaar om te sturen).
- Echt iOS-toetsenbord in de beginscherm-app (nagebootst met `visualViewport`).
