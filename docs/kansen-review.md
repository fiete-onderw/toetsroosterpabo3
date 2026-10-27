# Kansen-review Digigenda (oktober 2026)

Onafhankelijke productreview op toevoegingen, kansen en toepassingen, met rust, overzicht en personalisatie als
meetlat. Gebaseerd op `README.md`, `docs/ontwerp.md`, `docs/meeplannen-schets.md`, de eerste 200 regels en de
functielijst van `app.js`, `parse.js`, `toetsen.js` en negen schermafbeeldingen (390 px en 1440 px). Niets is
aangepast; dit is alleen een rapport.

Wat ik technisch heb vastgesteld en wat de beoordeling stuurt:

- Eigen opdrachten kennen **geen herhaling**. Alleen geïmporteerde .ics-reeksen worden uitgerold. "Elke dinsdag
  stage" bestaat dus niet, tenzij je het 20 keer typt.
- Thema volgt alleen `prefers-color-scheme`; er is geen keuze licht/donker/automatisch en geen accentkleur.
- De startweergave hangt vast aan het apparaat (`voorkeur.weergave = telefoon() ? "dag" : "maand"`).
- Het dagvenster voor "vrij"-labels (08:00–22:00) en voor studieblokken (13:00–21:00) is hardgecodeerd.
- Meldingen staan vast op 15 minuten vooraf en 07:30; geen stille uren.
- Een toets "zonder vaste datum" krijgt alleen een datum via een commit in `toetsen.js`; de student kan dat niet zelf.
- Agenda's heten vast School, Werk, Persoonlijk met vaste kleuren.
- Geen vak-begrip: een studieblok heet "Studeren: <naam>" maar is verder niet gekoppeld aan de toets, en is niet afvinkbaar.
- Geen print-stijl, geen deelfunctie (wel een uitgaande .ics-link).

---

## 1. Positiebepaling

Wat Pabo-studenten nu gebruiken is een stapel: de HAN-roosterapp of Osiris voor colleges en toetsen, Google/Apple
Agenda voor afspraken, de werkgever-app (Shiftbase, Planday) voor diensten, en daarnaast Notion, Structured of
papieren to-do's voor schoolwerk. Niemand heeft daar één rustig beeld van zijn week.

Digigenda zit precies tussen agenda en to-do-app in, zoals Structured (tijdlijn + to-do) en Fantastical
(natuurlijke taal). Vergeleken met die twee:

- **Sterker:** Nederlandse snelle invoer die écht werkt ("morgen 14:00-15:30 overleg stage" met voorbeeld vooraf),
  het ingebouwde Pabo 3-toetsrooster met periodes en vakanties, de Nu-kaart, "vrij"-labels in de tijdlijn en
  studieblokken terugplannen vanaf een toets. Dit heeft geen enkele grote app voor een HAN-student.
- **Zwakker:** geen herhalingen (Structured, Google, Apple hebben dat allemaal), geen eigen kleuren of namen, geen
  eigen ritme (werktijden, studievoorkeur), geen widgets. Op de telefoon is de weekweergave een verkleinde
  laptopweergave ("Coll Taal", "Bell", "Samenv…") en bedekken typbalk en onderbalk samen zo'n twee uur van de
  tijdlijn, precies waar het "15:00–18:00 vrij"-label staat.

Het unieke dat uitgebouwd moet worden is niet "nog een weergave", maar: **Digigenda weet wat een Pabo-week is.**
Stagedagen, colleges, diensten, toetsperiodes en de vrije uren daartussen. De meeplan-laag (gaten, studieblokken,
dagstart, avondblik) is het goede skelet; wat ontbreekt is dat de app het weekritme van de student kent, en dat de
student de app naar zich toe kan trekken (naam, kleur, thema, dagritme). Alles hieronder dient dat ene doel.

---

## 2. Kansen per thema

Bouwomvang: **klein** = uren in CSS/JS, **middel** = een dag, **groot** = meerdere dagen of serverwerk.

### Rust (minder tikken, minder prikkels)

**R1. Herhaling in de snelle invoer.**
"elke dinsdag 9:00-15:30 stage t/m 31 jan" of "wekelijks do 13:30 college taal" maakt een reeks. Technisch het
makkelijkst door de reeks uit te rollen tot concrete opdrachten met een gedeeld `reeks`-id, precies zoals de
.ics-import al doet; verwijderen vraagt "alleen deze / deze en volgende".
*Waarom:* een stage- of collegedag typ je nu per week opnieuw, of je laat het weg en dan zijn de "vrij"-labels en
studieblokken fout. Dit is de grootste bron van gedoe in de huidige app.
*Hoe het eruitziet:* in het voorbeeld onder de typbalk een extra chip "elke di t/m 31 jan"; in de agenda verder niets nieuws.
*Omvang:* middel (parse-regel, `reeks`-veld in `normaal()`, uitrollen, verwijderen per reeks).

**R2. Standaardduur en agenda per trefwoord.**
Woorden als "college" (1,5 uur, School), "dienst" (4 uur, Werk), "stage" (hele dag, School), "tandarts" (30 min,
Persoonlijk) krijgen een passende duur en agenda als je die niet typt; de app leert ook van wat je zelf bij eerdere
items met hetzelfde eerste woord koos.
*Waarom:* elke correctie achteraf (venster openen, eindtijd aanpassen, agenda wisselen) is een onderbreking.
*Hoe het eruitziet:* alleen in de voorbeeldchips ("13:30–15:00", "School"); geen nieuw scherm.
*Omvang:* klein.

**R3. Stille uren en tijd van het dagoverzicht.**
Geen afspraakmelding tussen 22:00 en 07:30, het ochtendoverzicht op een zelfgekozen tijd (06:30 voor een stagedag,
09:00 in de vakantie), en een vinkje "geen melding bij diensten uit een geïmporteerd rooster".
*Waarom:* een melding om 05:45 voor een vroege dienst die je toch al weet, of om 07:30 in de herfstvakantie, is
precies de prikkel die een rustige app niet moet geven.
*Hoe het eruitziet:* twee regels extra onder Meldingen in de instellingen.
*Omvang:* klein in de app, middel in `digigenda-meldingen` (tijdzone en venster respecteren).

**R4. "Vanavond vrij" in de Nu-kaart.**
Als er na 17:00 niets meer gepland is en er morgen geen deadline of toets valt, zegt de Nu-kaart dat met één regel
in plaats van "Daarna: niets". De avondblik (na 20:00) blijft zoals hij is.
*Waarom:* rust is ook weten dat je mag stoppen. De app meldt nu alleen wat er wél is.
*Hoe het eruitziet:* één regel tekst in de bestaande kaart, geen nieuw vlak.
*Omvang:* klein.

**R5. Pauze tussen afspraken in het meeplannen.**
Eén instelling onder Meeplannen: "ruimte tussen afspraken: 0 / 15 / 30 min". Gaten beginnen pas na die marge, en
"Plan in" en studieblokken plakken niet meer direct tegen een college of dienst.
*Waarom:* de reistijd van stage naar huis is geen vrije tijd. Zonder dit stelt de app studieblokken voor die in de
praktijk nooit lukken, en dan vertrouw je de voorstellen niet meer.
*Omvang:* klein (één parameter in `gatenOp`).

### Overzicht (zien wat eraan komt, zonder meer te tonen)

**O1. Deadline-aftelling en "Komende deadlines".**
Bij deadlines, toetsen en herkansingen staat "over 6 dagen" in bijschriftkleur; de Lijst krijgt onder "Komende 7
dagen" een korte sectie "Daarna" met de eerstvolgende drie toetsen en deadlines, ook als die weken weg zijn.
*Waarom:* de Lijst stopt nu bij zeven dagen; de LKT Taal van 17 november is op 22 oktober onzichtbaar, behalve in het
maandraster van november. Juist de dingen die ver weg zijn en groot, moet je rustig zien aankomen.
*Hoe het eruitziet:* één bijschrift per rij en één extra kopje in de Lijst.
*Omvang:* klein.

**O2. Zelf een datum geven aan een toets zonder datum.**
Op elke rij onder "Toetsen zonder vaste datum" een knop "Datum bekend?" die een eigen opdracht van het soort toets
aanmaakt met dezelfde naam en uitleg, en de rij uit de lijst haalt (gekoppeld via een `vast`-id).
*Waarom:* zodra Osiris de datum geeft, moet de student vandaag studieblokken kunnen plannen, niet wachten op een
commit in `toetsen.js`. Dit is de ontbrekende schakel tussen het toetsrooster en het meeplannen.
*Hoe het eruitziet:* een kleine knop per rij; daarna is de toets gewoon een toets in de agenda.
*Omvang:* klein tot middel.

**O3. Studievoortgang bij een toets.**
Studieblokken die het meeplannen aanmaakt krijgen een `voor`-veld met het id van de toets. Op de toets-rij en in het
dagpaneel staat "Studeren: 2 van 4 gedaan"; een blok telt als gedaan als het voorbij is, of als je het afvinkt
(blokken met het soort studeren worden afvinkbaar, andere blokken niet).
*Waarom:* nu zie je vier losse "Studeren: LKT Taal"-blokken, maar nergens of je op schema ligt. Eén getal geeft
meer rust dan vier blokken.
*Hoe het eruitziet:* één bijschrift op de toets-rij; de blokken zelf veranderen niet.
*Omvang:* middel.

**O4. Weekweergave op de telefoon als zeven dagen onder elkaar.**
Zoals `docs/ontwerp.md` al noteert: op 390 px is het vijfkolomsraster onleesbaar. Zeven dagrijen (ma–zo) met
tijd + titel per regel, to-do's bovenaan per dag, en de "vrij"-labels als stippellijn-regel.
*Waarom:* de weekweergave is op de telefoon nu de minst bruikbare, terwijl "wat is mijn week" de vraag is die een
student het vaakst stelt.
*Omvang:* middel.

**O5. Periode-regel in de Lijst en in de dagkop.**
Op de telefoon ontbreekt de jaarstrook van de laptop. Eén rustige regel onderaan de Lijst: "Periode 1 · nog 2
weken · 2 toetsen · kerstvakantie over 8 weken".
*Waarom:* een Pabo-jaar leeft in periodes, niet in maanden. Op de laptop zie je dat (sep–jul-strook), op de
telefoon niet.
*Omvang:* klein.

**O6. Werkuren per week.**
In de weekkop (telefoon en laptop) één bijschrift: "Werk: 12 u" als de agenda Werk aanstaat en er diensten zijn.
*Waarom:* studenten met een urencontract tellen dit nu met de hand; het is één optelsom die al in `blokkenVan` zit.
*Omvang:* klein.

### Personalisatie (de app naar je toe trekken, zonder hem drukker te maken)

**P1. Thema: licht, donker, automatisch, en vier accentkleuren.**
Een keuze in de instellingen die `data-theme` op `<html>` zet, plus vier inkttinten voor `--accent` (het huidige
blauw, een groen, een terracotta, een paars) die allemaal 4,5:1 halen op papier en kaart.
*Waarom:* "mijn agenda" begint bij de kleur van de gekozen dag en de knoppen. Vier keuzes zijn genoeg; een kleurkiezer
niet, want die breekt het contrast en de rust.
*Hoe het eruitziet:* vier rondjes en een driestandenknop in de instellingen.
*Omvang:* klein (tokens staan al in `:root`).

**P2. Eigen naam en kleur per agenda.**
"Werk" wordt "Albert Heijn", "School" blijft "Pabo"; kleur uit acht vaste tinten met donkere variant. De hashtags
`#school`, `#werk`, `#prive` blijven werken en de eigen naam wordt ook een tag (`#ah`).
*Waarom:* het startscherm vraagt al welke agenda's je gebruikt; de volgende vraag is hoe ze heten. Een vaste "Werk"
voelt als een sjabloon.
*Hoe het eruitziet:* naamveld en kleurrij in de bestaande agenda-rijen van de instellingen.
*Omvang:* klein tot middel (`AGENDA_NAAM`, `AGENDA`-tabel in `parse.js`, CSS-variabelen per agenda).

**P3. Startweergave.**
Keuze "Open op: Vandaag / Week / Lijst / Maand" in plaats van de vaste koppeling aan apparaat. Weekbegin op zondag
hoeft niet: Nederlandse studenten denken in ma–zo en de weeknummers kloppen alleen zo.
*Waarom:* wie zijn dag plant opent op Vandaag, wie zijn week bewaakt op Week. Nu beslist het schermformaat.
*Omvang:* klein.

**P4. Dagritme.**
Twee instellingen onder Meeplannen: "mijn dag loopt van … tot …" (standaard 08:00–22:00) en "studeren liefst
's ochtends / 's middags / 's avonds". Ze sturen de "vrij"-labels, "Plan in", de studieblokken en het bereik van de
tijdlijn.
*Waarom:* de hardgecodeerde 13:00–21:00 voor studieblokken past een ochtendmens niet, en wie avonddiensten draait
heeft juist de ochtend vrij. Zonder dit zijn de voorstellen voor een deel van de studenten altijd verkeerd.
*Omvang:* klein (parameters bestaan al als constanten).

**P5. Stagedagen als vast ritme.**
Een Pabo-specifieke verpakking van R1: in de instellingen onder het Pabo-blok "Stagedagen: ma di" en een tijd
(08:15–15:30), per periode. De app toont die dagen een stil hele-dag-label "Stage" en telt ze als bezet.
*Waarom:* de stage is het grootste vaste blok in een Pabo-week en de reden dat de "vrij"-labels nu te optimistisch
zijn. Dit is één instelling in plaats van een reeks typen.
*Hoe het eruitziet:* een hele-dag-chip bovenaan de dag, zoals geïmporteerde hele-dag-items nu al.
*Omvang:* klein als R1 bestaat, anders middel.

**P6. Snelkoppelingen op het beginscherm.**
`shortcuts` in `manifest.webmanifest`: "Nieuw" (opent met de typbalk in focus), "Vandaag", "Lijst". Een echte
iOS-widget kan niet met een web-app; dat moet je niet beloven.
*Omvang:* klein.

### Wat NIET past bij rust (en dus bewust niet in deze lijst)

- Prioriteiten (P1–P4), labels, subtaken, projecten: dat maakt van een to-do-regel een formulier.
- Kleurrijke volle blokken, emoji-iconen per item, achtergrondafbeeldingen: de ontwerprichting is terecht één gekleurd vlak.
- Locaties met kaart en automatische reistijd: R5 (vaste marge) geeft 90 % van het nut zonder adresvelden.
- Een vrije kleurkiezer voor accent of agenda's: contrast en samenhang gaan verloren; vaste sets volstaan.
- Weekbegin op zondag, 12-uursklok, meerdere tijdzones: niet de doelgroep.

---

## 3. Toepassingen: drie weken uit het leven van deze student

### A. Stageweek met avonddienst

Ma en di stage 08:15–15:30 (40 minuten reizen), wo college rekenen 10:00–12:00, do college taal 13:30–15:00 en
dienst 18:00–21:30 (uit Shiftbase), vr vrij. Elke zondagavond moet de lesvoorbereiding voor maandag af.

*Wat werkt:* de dienst komt via de rooster-link binnen, de Nu-kaart laat zien "Daarna 18:00 Dienst", de avondblik
toont hoe dinsdag begint.

*Wat mist:*
- De stage staat er alleen als je hem elke week typt (R1/P5). Doe je dat niet, dan zegt de app op maandag
  "08:00–22:00 vrij" en stelt hij studieblokken voor op een stagedag.
- "Lesvoorbereiding" is een wekelijkse to-do met deadline zondag; die bestaat niet als reeks (R1).
- Het gat na stage begint om 15:30, maar je bent pas 16:10 thuis (R5).
- Woensdag 12:00–18:00 is het enige echte studiegat; de app ziet het, maar een ochtendmens krijgt studieblokken
  pas vanaf 13:00 (P4).

### B. Toetsweek LKT Taal (17 nov) en LKT Rekenen (24 nov)

Twee landelijke kennistoetsen een week na elkaar, stage loopt door, werk twee avonden.

*Wat werkt:* beide toetsen staan vast in het rooster, "Studieblokken plannen" stelt per toets vier blokken voor in
vrije middagen en avonden.

*Wat mist:*
- Vanaf 22 oktober is de toets nergens zichtbaar behalve in het maandraster van november (O1). De student wil
  "LKT Taal over 26 dagen" zien, elke dag, in één bijschrift.
- Acht studieblokken over twee toetsen zonder voortgang: ligt ze op schema voor taal of rekenen? (O3)
- Studieblokken zijn niet afvinkbaar en verdwijnen als "geweest" ook als ze niet gedaan zijn; een gemist blok wordt
  niet opnieuw voorgesteld. Een rustige variant: bij een gemist blok vraagt de dagstart "Studeren: LKT Taal van
  gisteren · Vandaag / Later / Weg", net als bij to-do's.
- Melding om 07:30 op de toetsdag is prima; een melding om 05:45 voor een vroege dienst de avond ervoor niet (R3).

### C. Tentamenweek P2 (vanaf 11 jan) na de kerstvakantie, met extra diensten

Vier cursustoetsen waarvan de dagen pas in december bekend worden, kerstvakantie 19 dec–3 jan met extra werk,
een portfolio-deadline eind januari.

*Wat werkt:* "Begin tentamenweek P2" staat vast, de vakantie is gearceerd, de HAN-week staat in `toetsen.js`.

*Wat mist:*
- Zodra Osiris "Kennistoets OJW: 13 januari" meldt, kan de student dat niet zelf vastzetten (O2). Ze maakt dan een
  eigen toets aan en de rij "zonder datum" blijft staan: dubbel.
- Geen beeld van de periode als geheel op de telefoon: hoeveel weken tot de tentamenweek, hoeveel daarvan vakantie
  (O5). De laptop heeft de jaarstrook; de telefoon heeft niets tussen Lijst (7 dagen) en Maand.
- Werkuren in de kerstvakantie tegen de studietijd afzetten: "Werk deze week: 24 u" is één bijschrift (O6), nu
  rekent ze het uit de blokken.
- Studieblokken plannen vanaf een toets die nog geen datum heeft kan niet; "plan 6 blokken in de week vóór 11
  januari" zou al genoeg zijn als "Begin tentamenweek" als anker mag dienen.

---

## 4. Toplijst: acht toevoegingen met de hoogste waarde per bouwuur

Gerangschikt. Elke regel is een specificatie die direct te bouwen is.

1. **Herhaling in de snelle invoer (R1).** `parse.js` herkent `elke <dag>`, `wekelijks`, `elke 2 weken` en
   `t/m <datum>` (standaard t/m het einde van de huidige periode uit `toetsen.js`), de app rolt de reeks uit tot
   losse opdrachten met een gedeeld `reeks`-veld, en verwijderen biedt "alleen deze / deze en volgende". *Middel.*
2. **Datum geven aan een toets zonder datum (O2).** Elke rij onder "Toetsen zonder vaste datum" krijgt "Datum
   bekend?", dat `openVenster` opent met titel, soort toets en notitie vooringevuld en een `vast`-id bewaart,
   waarna `tekenZonderDatum` die rij verbergt. *Klein.*
3. **Deadline-aftelling en "Daarna" in de Lijst (O1).** Bij soort deadline/toets/herkansing en bij vaste toetsen
   een bijschrift "over N dagen" (vanaf 14 dagen; "morgen" en "vandaag" als woord), en in `tekenLijst` na
   "Komende 7 dagen" een kopje "Daarna" met de eerstvolgende drie. *Klein.*
4. **Thema en accentkleur (P1).** Instelling `thema: auto|licht|donker` als `data-theme` op `<html>` naast de
   bestaande `prefers-color-scheme`-regels, en `accent: blauw|groen|terracotta|paars` dat `--accent` en de donkere
   variant zet; vier vaste tinten die AA halen. *Klein.*
5. **Dagritme (P4).** Instellingen `dag: {van: "08:00", tot: "22:00"}` en `studeren: "ochtend|middag|avond"` in
   het meeplan-blok; `gatenOp`, `eersteGat`, `studieVoorstel` en `dagBereik` lezen ze in plaats van de constanten.
   *Klein.*
6. **Eigen naam en kleur per agenda (P2).** `instellingen.agendas` wordt een lijst `{id, naam, kleur}` met acht
   vaste kleuren; `AGENDA_NAAM` en de tag-tabel in `parse.js` lezen eruit; de id's school/werk/persoonlijk blijven
   voor opslag en #tags. *Klein tot middel.*
7. **Standaardduur en agenda per trefwoord (R2).** Een tabel `{college: [90, "school"], dienst: [240, "werk"],
   stage: [null, "school"], tandarts: [30, "persoonlijk"]}` in `parse.js`, overschreven door wat de gebruiker bij
   de laatste opdracht met hetzelfde eerste woord koos (bewaard in `voorkeur`). *Klein.*
8. **Studievoortgang bij een toets (O3).** Studieblokken uit `studieVoorstel` krijgen `voor: <id of vast-id>` en
   `soort: "studeren"`; zulke blokken zijn afvinkbaar, en `rij`/`vastRij` tonen "Studeren: 2 van 4" bij de toets.
   *Middel.*

Net buiten de acht: weekweergave op de telefoon als zeven dagrijen (O4, middel, hoge waarde maar meer werk), stille
uren (R3, serverwerk), pauze tussen afspraken (R5, klein, past goed bij 5), werkuren per week (O6, klein).

---

## 5. Drie valkuilen: populair, maar slecht voor de rust

1. **Streaks, scores en focus-timers.** Structured, Forest en de meeste studie-apps belonen "7 dagen op rij" en
   tellen Pomodoro's. Het werkt een paar weken en keert dan om: de reeks breken voelt als falen, en een timer in de
   Nu-kaart maakt van een rustig overzicht een wekker. Als je voortgang wilt tonen, doe het zoals O3: één getal bij
   de toets, geen vlammetje bij de dag.

2. **Cijfers, EC's en vakdashboards.** Notion-sjablonen voor studenten hebben tabellen met cijfers, studiepunten en
   percentages per vak. Dat is Osiris nabouwen, het trekt de app van "wat doe ik vandaag" naar "hoe sta ik ervoor",
   en een rood percentage in een agenda is precies de onrust die het papier-en-inkt-ontwerp wil vermijden. Houd
   het vak-begrip beperkt tot de koppeling toets–studieblokken.

3. **Gedeelde agenda's en meldingen van anderen.** "Deel je agenda met je studiegenoot", groepsplanning met
   uitnodigingen, een badge met het aantal open items op het icoon. Alles wat een ander in jouw agenda kan zetten of
   wat je telt als je de app niet open hebt, neemt de controle weg die rust geeft. Als delen nodig is voor
   groepsopdrachten, dan alleen uitgaand en als tekst: "Vrij deze week: di 15–18, wo 12–18" via de deelknop van het
   toestel, zonder account of koppeling. Dat is klein te bouwen en blijft eenrichtingsverkeer.

---

## Wat hiervan is gebouwd (ronde 2, oktober 2026)

Gebouwd en getest (`tests/ronde2.test.js`):
- **1. Herhaling in de snelle invoer**: "elke dinsdag 9:00-15:30 stage t/m 31 jan", "iedere do 19:00 sporten", "wekelijks lesvoorbereiding inleveren vrijdag tot 17:00". Zonder einddatum loopt de reeks tot het einde van de huidige periode (anders 8 weken), hoogstens 30 keer. Items delen het begin van hun id, dus er is geen schemawijziging nodig en het werkt offline. In het venster staat de uitleg "Hoort bij een wekelijkse reeks" en een knop "Deze en volgende verwijderen (n)".
- **2. Datum geven aan een toets zonder datum**: knop "Datum bekend? Zet hem in je agenda" opent Toevoegen, vooringevuld als toets; de rij verdwijnt zodra de toets met die titel bestaat.
- **3. Aftelling en "Daarna"**: deadlines, toetsen en herkansingen tonen "morgen" of "over N dagen" (tot 14 dagen); de Lijst krijgt een kopje "Daarna" met de eerstvolgende drie toetsen en deadlines na deze week (ook de Pabo-toetsen). De Lijst-kop toont "Periode 1 · nog N weken · N toetsen".
- **4. Thema en accent**: automatisch/licht/donker en vijf accentkleuren; plus **6. kleur per agenda** (acht tinten) en **P3 startweergave**.
- **5. Dagritme**: dag van … tot …, studeren liefst ochtend/middag/avond, pauze tussen afspraken (R5). Gaten, Plan in en studieblokken lezen dit.
- **7. Standaardduur per trefwoord**: college/werkcollege 1,5 u, dienst 4 u, tandarts/dokter/kapper 30 min, overleg/vergadering/bellen 1 u, stage 7 u; in het voorbeeld gemarkeerd als "(standaard)".
- **R4 "Vanavond vrij"** in de Nu-kaart na 15:00 zonder afspraken; **O4 weeklijst op de telefoon**; **O6 werkuren** als bijschrift in de weekkop ("werk 9,5 u").

Niet gebouwd (en waarom):
- **R3 Stille uren voor meldingen**: vraagt een wijziging in de serverfunctie `digigenda-meldingen`; buiten deze ontwerpronde.
- **O3 Studievoortgang** ("Studeren: 2 van 4"): vraagt een koppeling tussen studieblokken en de toets in de opslag; genoteerd als vervolgstap.
- **P2 Eigen namen voor agenda's**: de kleuren zijn nu instelbaar; namen raken de tags (#school/#werk) in de snelle invoer en de servervalidatie. Vervolgstap.
- **P5 Stagedagen als vast ritme**: kan nu al via "elke dinsdag 9:00-15:30 stage t/m …".
