# Digigenda

Eén agenda voor school, werk en privé. Je typt je planning gewoon in je eigen woorden,
bijvoorbeeld `morgen 14:00 tandarts` of `deadline portfolio rekenen 14 nov`.
Gemaakt voor HAN Pabo jaar 3 (studiejaar 2026–2027), maar ook bruikbaar voor wie niet op de Pabo zit.

## Wat kan het?

- **Startscherm:** kies welke agenda's je gebruikt (School, Werk, Persoonlijk) en of je het HAN Pabo 3-toetsrooster wilt zien.
- **Snel invoeren:** één regel typen en Enter. De volgorde maakt niet uit. Je ziet vooraf hoe Digigenda het begrijpt.
  - dagen: vandaag, morgen, overmorgen, maandag…zondag, ma…zo, volgende week (dinsdag), over 3 dagen, 14 nov, 14-11, 14/11
  - tijden: 14:00, om 14.30, 14u, 9u30, 9 uur, om 9
  - eindtijd: 14:00-15:30, 14:00 tot 15:30, van 9 tot 11, 14:00 1,5 uur, 10:00 45 min, of alleen `tot 17:00` (to-do met deadline)
  - agenda: `#school`, `#werk`, `#prive`
  - soort: de woorden deadline, toets, herkansing en afspraak
  - meerdere regels plakken = meerdere opdrachten tegelijk
- **To-do of afspraak:** iets zonder begintijd is een to-do die je afvinkt. Iets met een begintijd is een blok in je agenda
  (niet afvinkbaar).
- **Vandaag:** een weekstrook, een kaart met wat er *nu* is en wat *hierna* komt, je to-do's en je dag in tijdblokken met een
  rode lijn op de huidige tijd. Tik op een leeg uur om iets te plannen.
- **Weergaven:** op de telefoon een onderbalk met Maand · ⌂ Vandaag · Lijst; bij Vandaag wissel je tussen Dag en Week
  (ma–vr in tijdblokken, het weekend apart). De telefoon opent op Vandaag, de laptop op de maand (tabs Maand, Week, Dag, Lijst).
- **Openstaande to-do's** van eerdere dagen blijven gewoon staan, zonder rood label. Je schuift ze met één tik door
  (→ vandaag / → morgen). Eén keer per dag krijg je een rustige melding als er nog iets openstaat.
- **Meldingen:** 15 minuten vóór een afspraak en elke ochtend om 07:30 een dagoverzicht (aan te zetten in de instellingen,
  account nodig). Op de iPhone werkt dit alleen als Digigenda op je beginscherm staat (iOS 16.4 of nieuwer).
- **Als app op je beginscherm**, met eigen icoon en offline werken (iPhone: Safari → Deel → Zet op beginscherm).
- **Koppelen aan je iPhone-agenda:** in de instellingen maak je een geheime agenda-link; je iPhone ververst die zelf, ongeveer elk uur.

## Waar worden mijn opdrachten bewaard?

**Zonder account:** alleen in je eigen browser, op je eigen apparaat. Gebruik **Back-up downloaden** om ze mee te nemen.

**Met account (optioneel):** gebruikersnaam + pincode van 4 cijfers. Je opdrachten staan dan online en je ziet ze op elk
apparaat waar je inlogt. Opdrachten die je al zonder account had, gaan automatisch mee.

- Makkelijke pincodes (zoals 1234, 0000, een jaartal of een reeks) kun je niet kiezen.
- Na 5 foute pincodes wordt een account geblokkeerd: eerst 15 minuten, daarna 1 uur, 4 uur en 24 uur.
  Apparaten waarop je al bent ingelogd blijven gewoon werken.
- In de instellingen kun je je **pincode wijzigen** (je andere apparaten worden dan uitgelogd) en **uitloggen op alle apparaten**.
- Een pincode van 4 cijfers blijft geen sterke beveiliging. Zet er alleen planning in, niets persoonlijks of gevoeligs.
- Pincode vergeten? Er is geen herstelknop; de beheerder kan je account in Supabase verwijderen.
- **Face ID / vingerafdruk:** na het inloggen kun je in de instellingen Face ID aanzetten. Daarmee ontgrendel je je opgeslagen
  inlog op dat apparaat. De pincode blijft de controle op de server.

## Toetsdata aanpassen

Alle vaste Pabo-gegevens staan in **`toetsen.js`**. Zodra een toetsdatum bekend is:

1. Open `toetsen.js` op GitHub en klik op het potlood (Edit).
2. Haal de toets weg uit `zonderDatum` en zet hem in `toetsen`, met een datum als `"2026-12-08"`.
3. Klik op **Commit changes**. Binnen een minuut staat het op de website (en binnen een uur in iPhone-agenda's).

## Beveiliging

- Alle tabellen hebben RLS aan. De Digigenda-tabellen staan in een apart schema (`kalender`) dat niet via de API bereikbaar is;
  de website praat alleen via de `kal_`-functies, die zelf het inlogbewijs of de geheime agenda-code controleren.
- Pincodes worden versleuteld opgeslagen (bcrypt). Maximaal 20 nieuwe accounts per uur en 500 in totaal.
- De website heeft een Content-Security-Policy: alleen eigen scripts, en alleen verbinding met Supabase.
- Meldingen gaan alleen naar apparaten die nog ingelogd zijn: uitloggen, een nieuwe pincode of 'uitloggen op alle apparaten'
  stopt ze vanzelf. De sleutels voor meldingen staan alleen in de database (`kalender.config`), niet in deze repository.

## Beheer (Supabase)

1. **Database:** Supabase > SQL Editor > New query > plak `supabase.sql` > Run. Nog een keer uitvoeren kan geen kwaad.
2. **Agenda-koppeling:** de serverfunctie staat in `supabase/functions/digigenda-agenda/` (zonder JWT-controle;
   de functie controleert zelf de geheime code).
3. **Meldingen:** de serverfunctie staat in `supabase/functions/digigenda-meldingen/` (zonder JWT-controle). Een planner
   (pg_cron) kijkt elke minuut of er iets te melden valt en roept de functie dan aan met een geheim. Bij een nieuwe installatie:
   maak een VAPID-sleutelpaar en een lang willekeurig geheim, zet ze in `kalender.config` (zie `supabase.sql`) en zet de
   publieke VAPID-sleutel in `cloud.js`.
4. In `cloud.js` staan de project-URL en de publishable key. Maak `SLEUTEL` leeg om online opslaan uit te zetten.

## Bestanden

| Bestand | Wat |
|---|---|
| `index.html` | De pagina |
| `style.css` | Opmaak (licht en donker) |
| `app.js` | Werking van de agenda |
| `parse.js` | Snelle invoer: zet een getypte regel om in dag, tijd, agenda en titel |
| `cloud.js` | Verbinding met Supabase (inloggen, online opslaan) en Face ID |
| `toetsen.js` | Toetsen, periodes en vakanties van HAN Pabo 3 (hier pas je data aan) |
| `sw.js`, `manifest.webmanifest`, `icons/` | App op je beginscherm en offline werken |
| `supabase.sql` | Database-opzet voor Supabase |
| `supabase/functions/digigenda-agenda/` | Serverfunctie voor het agenda-abonnement (.ics) |
| `supabase/functions/digigenda-meldingen/` | Serverfunctie die pushmeldingen versleutelt en verstuurt |

## Bronnen

- Conceptoverzicht OWE's Kernfase Voltijd jaar 3, studiejaar 26-27 (concept, kan nog wijzigen)
- [HAN-jaarrooster 2026-2027](https://www.han.nl/studeren/jaarrooster/)

Check toetsdata altijd in Osiris.
