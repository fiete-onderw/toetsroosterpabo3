# Ontwerprichting Digigenda

Dit document legt de visuele richting en het ontwerpsysteem vast. Het hoort bij de ontwerpronde van oktober 2026.

## Twee richtingen afgewogen

**1. Papier en inkt (gekozen).** Een agenda die aanvoelt als een goed gedrukte planner: warm papier, inkt, dunne lijnen, grote datum als kop, cijfers in tabelstand. Vlakken worden gescheiden door lijnen en witruimte, niet door kaarten. Eén gekleurd object per scherm: de Nu-kaart. De rode nu-lijn is de enige felle kleur.
Past bij: een student die rust zoekt, snel wil scannen en de app vaak kort opent. Werkt even goed op telefoon als op laptop, en in donker als in licht.

**2. Dagdeel-licht (afgewezen).** De achtergrond en de kop kleuren sterk mee met het dagdeel (ochtendgoud, avondblauw), met zachte verlopen en glas-effecten. Opvallend, maar het trekt aandacht naar decoratie in plaats van naar de planning, verlopen en gloed zijn precies de generieke patronen die we willen vermijden, en het contrast is moeilijk te borgen op elk moment van de dag. De bestaande, heel lichte dagdeel-tint blijft wel bestaan als tweede, stille laag.

## Signatuur

De **datumkop op papier**: de dag staat groot en vet bovenaan, direct op de achtergrond, met daaronder één rustige regel en een dunne lijn. Alles eronder is inkt op papier. Het enige vlak met kleur is de Nu-kaart, en het enige felle accent is de rode nu-lijn in de tijdlijn. Daardoor is op elk scherm in één oogopslag duidelijk: welke dag, wat nu, wat straks.

## Ontwerpsysteem

### Kleur (licht)

| Token | Waarde | Gebruik |
|---|---|---|
| `--bg` | `#f5f1ec` (ochtend `#f7f2ea`, avond `#f1eff3`, nacht `#edeef2`) | papier |
| `--kaart` | `#fffdfb` | Nu-kaart, dialogen, maandraster |
| `--fg` | `#1c2030` | inkt |
| `--muted` | `#5f6575` | bijschriften, labels (contrast 4,8:1 op de lichtste vlakken) |
| `--lijn` | `#e4ddd7` | hairlines |
| `--zacht` | `#efe9e4` | weekend, aanwijzen |
| `--accent` | `#2b5a86` | knoppen, vandaag, gekozen dag (6.9:1 op wit) |
| `--nu` | `#c9311f` | nu-lijn en Nu-label, nergens anders |

Agenda's en toetssoorten houden hun eigen kleur (school blauw, werk groen, persoonlijk magenta, landelijke kennistoets rood, deadline paars, herkansing amber). Ze worden alleen als dunne streep, stip of lichte tint gebruikt, nooit als vol vlak met tekst erin, behalve bij vaste toetsen in het maandraster.

### Kleur (donker)

Papier `#14161c`, kaart `#1b1e26`, inkt `#eceef2`, bijschrift `#9aa0ae`, lijn `#2c303b`, accent `#8ab6e4` met donkere tekst erop. Alle agenda- en soortkleuren hebben een lichtere donkere variant.

### Typografie

- Koppen: **Bricolage Grotesque** (variabel, 500 tot 800). Datumkop 800, −0,02 em, `clamp(1.75rem, 3.2vw, 2.4rem)`. Nu-titel 700. Knoppen 600.
- Lopende tekst: **Atkinson Hyperlegible** 400, 15 px, regelhoogte 1,45. To-do-titels in 400; alleen tijden en de titel van wat nu bezig is zijn vet.
- Kleine labels (To-do, Agenda, MA DI WO, wk): 11,5 px, 700, kapitalen, letterafstand 0,08 em, bijschriftkleur. Eén stijl voor alle labels in de app.
- Cijfers altijd in tabelstand (`font-variant-numeric: tabular-nums`).

### Ruimte en vorm

- Ruimtemaat 4, 8, 12, 16, 24, 32 px. Pagina maximaal 1240 px breed, 16 px zijmarge op de telefoon.
- Hoeken: 6 px (chips), 10 px (knoppen, velden), 16 px (Nu-kaart, dialogen), rond (tabbladen, filters, dagkeuze).
- Diepte: geen schaduwen op de pagina. Alleen zwevende lagen (toast, actieblad, typbalk op de telefoon) hebben een zachte schaduw.
- Lijnen: 1 px `--lijn`. De kop en de voet hebben een hairline; secties worden gescheiden door witruimte en een label.

### Lagen

1. Papier (achtergrond met dagdeel-tint).
2. Inkt: koppen, lijsten, raster, hairlines.
3. Eén gekleurd vlak: de Nu-kaart (lichte tint van de agendakleur).
4. Zwevend: typbalk en onderbalk op de telefoon, toast, dialogen.

### Beweging

- Nieuw scherm: inhoud verschijnt met een korte fade van 160 ms en 4 px omhoog.
- Nu-stip pulseert langzaam (2 s).
- Achtergrondtint verloopt in 1,5 s mee met het dagdeel.
- Alles uit bij `prefers-reduced-motion: reduce`.

### Indeling per scherm

- **Telefoon** (tot 640 px): groet en rond accountknopje bovenin, datumkop, weekstrook, Nu-kaart, to-do's, tijdlijn. Typbalk en onderbalk zweven onderaan.
- **Tablet** (641 tot 899 px): kop op één regel (woordmerk, tabbladen, account), typregel eronder, inhoud in één kolom.
- **Laptop** (vanaf 900 px): kop op één regel met tabbladen in het midden en agendafilters rechts; dag- en weekweergave met tijdlijn links en Nu-kaart plus to-do's rechts; maand met raster links en dagpaneel rechts, gescheiden door een lijn.

## Onafhankelijke review (oktober 2026)

Een apart review-agent beoordeelde twintig schermafbeeldingen zonder de bouw gezien te hebben. Scores als hulpmiddel: ontwerpkwaliteit 6,5, originaliteit 7, vakmanschap 5,5, functionaliteit 6.

**Overgenomen en doorgevoerd**
- Tijden in weekblokken werden afgeknipt over de rand; nu met ellipsis, en bij overlappende blokken alleen de begintijd.
- De rode nu-lijn liep door tekst; nu `mix-blend-mode: multiply` in licht, zodat de tekst leesbaar blijft.
- De dag-tijdlijn stond op een grijs vlak en de week-tijdlijn op wit; nu allebei op het papier.
- Het blok "15:00–18:00 vrij" was een derde gekleurd vlak; nu een stippellijn met alleen het label.
- Afgelopen afspraken waren als geheel uitgegrijsd (rond 3:1); nu volle dekking met bijschriftkleur (4,8:1).
- Tijd- en datumvelden in de dialoog weken af van tekstvelden; nu één veldstijl.
- De typregel op laptop eindigde op 69 % van de breedte; nu even breed als de lijnen, filters rechts.
- Filters toonden niet of ze aan of uit stonden; aan heeft nu een lichte tint van de agendakleur.
- De vakantie-arcering viel in het weekend weg (de weekendachtergrond overschreef de arcering); hersteld, en in donker beter zichtbaar.
- Instellingen toonden drie dik omrande agendakaarten; nu rijen met een gekleurde streep.
- Lijst op laptop had geen leesbreedte; nu maximaal 880 px.
- Tellerbadges, dagpaneelkop met hoofdletter, pijltjes bij de weekstrook op 44 px hoog, logo-icoon (met oranje) uit de kop.
- Bijschriftkleur en nu-rood iets donkerder zodat elke combinatie 4,5:1 haalt.

**Bewust niet overgenomen**
- Onderbalk met Vandaag-knop en de Dag/Week-schakelaar vervangen door vier gelijke tabbladen: de onderbalk en de schakelaar zijn een bewuste keuze uit het "rust"-ontwerp (één vraag per scherm) en zijn uitgebreid getest.
- Het veld "Soort" schrappen: deadline, toets en herkansing hebben het nodig voor kleur, meldingen en studieblokken.
- Datum "10/22/2026" en "04:00 PM": dat is de en-US-locale van de testbrowser; op een Nederlands toestel toont de browser Nederlandse velden.
- "Geen Vandaag-knop op laptop": de knop "Deze maand", "Deze week" of "Vandaag" verschijnt zodra je niet in de huidige periode bent.
- Weekweergave op de telefoon als lijst van zeven dagen: een goed idee, maar een andere weergave in plaats van een opmaakwijziging. Genoteerd als vervolgstap.
- Agendafilters op elk telefoonscherm: op Vandaag, Week en Lijst is bewust alles zichtbaar; filteren hoort bij de maand.

## Ronde 2 (oktober 2026): alle aanbevelingen doorgevoerd, kleur en personalisatie

Op verzoek van de eigenaar zijn ook de eerder afgewezen punten van de reviewer gebouwd, omdat ze de app rustiger en overzichtelijker maken:
- **Eén navigatiemodel op de telefoon.** De onderbalk heeft vier gelijke tabbladen (Dag, Week, Maand, Lijst) in één lijnstijl; de verheven Vandaag-knop en de Dag/Week-schakelaar in de kop zijn weg. Nog een keer op Dag tikken springt naar vandaag.
- **Weekweergave op de telefoon als lijst** van zeven dagen onder elkaar, met to-do's, afspraken en doorlopende nachtdiensten per dag; de dagkop opent de dag. Het raster blijft op tablet en laptop.
- **Vandaag-knop op laptop** altijd naast de pijlen (stil als je er al bent); op de telefoon alleen als je niet in de huidige week of maand bent.
- **Agendafilters op elk telefoonscherm**, klein en met zichtbare aan/uit-toestand.
- **Eén woord voor toevoegen** (dialoog "Toevoegen"/"Wijzigen", knoppen "Toevoegen"), dagpaneelkop gelijk aan de dagkop, label "Toetsen tonen voor" boven de specialisatiekeuze, lijn-icoon voor instellingen.
- **Lege toestanden**: week zonder afspraken, dag zonder to-do's, "vrij" per dag in de weeklijst.

**Kleur.** Het palet blijft warm papier met inkt; agendakleuren en accent zijn natuurlijke tinten (inktblauw, mosgroen, zeegroen, pruim, lavendel, roest, oker, leisteen), geen verlopen, geen gloed. Elke tint heeft een lichte en een donkere variant en haalt 4,5:1 op het papier én met witte (licht) of donkere (donker) tekst erop.

**Personalisatie** (Instellingen → Uiterlijk en Meeplannen; gaat mee naar andere apparaten bij inloggen):
- Thema: automatisch, licht of donker (ook tegen de toestelinstelling in).
- Accentkleur (5 tinten) en kleur per agenda (8 tinten).
- Opent op: automatisch, Dag, Week, Maand of Lijst.
- Dagritme: mijn dag loopt van … tot …, studeren liefst 's ochtends/'s middags/'s avonds, pauze tussen afspraken (0/15/30 min). Vrije tijd, Plan in en studieblokken volgen dit.
