# Pabo 3 Kalender

Toetskalender voor HAN Pabo voltijd jaar 3 (studiejaar 2026–2027).

- **Vaste toetsen, periodes en vakanties** staan voor iedereen in de kalender (met een slotje).
- **Eigen opdrachten** zet je er zelf bij: klik op een dag en kies "+ Opdracht op deze dag".
- Filter bovenaan op **jongere kind** of **oudere kind**.

## Waar worden mijn opdrachten bewaard?

**Zonder account:** alleen in je eigen browser, op je eigen apparaat. Klasgenoten zien jouw opdrachten niet, en jij ziet die van hen niet.
Wissel je van apparaat? Gebruik dan **Back-up downloaden** en op het andere apparaat **Back-up terugzetten**.
Let op: als je je browsergegevens wist, ben je je opdrachten kwijt zonder back-up.

**Met account (optioneel):** maak rechts in het paneel **Inloggen** een account met een gebruikersnaam en een pincode van 4 cijfers.
Je opdrachten staan dan online en je ziet ze op elk apparaat waar je inlogt. Opdrachten die je al zonder account had, gaan automatisch mee.

- Na 5 foute pincodes wordt een account 15 minuten geblokkeerd.
- Een pincode van 4 cijfers is geen sterke beveiliging. Zet er dus alleen studieplanning in, niets persoonlijks.
- Pincode vergeten? Er is geen herstelknop. De beheerder kan je account in Supabase verwijderen, zodat je opnieuw kunt beginnen.

**Face ID (iPhone) / vingerafdruk:** na het inloggen kun je in het accountpaneel Face ID aanzetten.
Open je de kalender daarna op dat apparaat, dan ontgrendel je met Face ID in plaats van je pincode.
Dit werkt alleen op de echte website (https), niet als je `index.html` als bestand opent.

## Online opslag instellen (beheerder)

1. Open in Supabase je project > **SQL Editor** > **New query**.
2. Plak de inhoud van `supabase.sql` en klik op **Run**. Eén keer is genoeg.
3. Zet in `cloud.js` de project-URL en de **publishable key** (Project Settings > API Keys).

Wil je online opslaan uitzetten? Maak `SLEUTEL` in `cloud.js` leeg (`""`). De kalender werkt dan weer alleen met opslag in de browser.

## Toetsdata aanpassen

Alle vaste gegevens staan in **`toetsen.js`**. Zodra een toetsdatum bekend is:

1. Open `toetsen.js` op GitHub en klik op het potlood (Edit).
2. Haal de toets weg uit `zonderDatum` en zet hem in `toetsen`, met een datum als `"2026-12-08"`.
3. Klik op **Commit changes**. Binnen een minuut staat het op de website.

## Bestanden

| Bestand | Wat |
|---|---|
| `index.html` | De pagina |
| `style.css` | Opmaak |
| `app.js` | Werking van de kalender |
| `toetsen.js` | Toetsen, periodes en vakanties (hier pas je data aan) |
| `cloud.js` | Verbinding met Supabase (inloggen, online opslaan) en Face ID |
| `supabase.sql` | Database-opzet voor Supabase (één keer uitvoeren) |

## Bronnen

- Conceptoverzicht OWE's Kernfase Voltijd jaar 3, studiejaar 26-27 (concept, kan nog wijzigen)
- [HAN-jaarrooster 2026-2027](https://www.han.nl/studeren/jaarrooster/)

Check toetsdata altijd in Osiris.
