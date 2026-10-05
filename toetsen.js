/*
  TOETSGEGEVENS — dit is het enige bestand dat je hoeft aan te passen.

  - Is een toetsdatum bekend? Haal de toets weg uit "zonderDatum" en zet hem
    in "toetsen" met een datum in de vorm "JJJJ-MM-DD".
  - doelgroep: "alle", "jk" (jongere kind) of "ok" (oudere kind).
  - soort: "lkt" (landelijke kennistoets) of "toets" (cursustoets).

  Bron: Conceptoverzicht OWE's Kernfase Voltijd jaar 3 (studiejaar 26-27)
  en het HAN-jaarrooster 2026-2027.
*/
window.PLANNING = {
  schooljaar: "2026–2027",

  periodes: [
    { naam: "Periode 1", kort: "P1", start: "2026-08-31", eind: "2026-11-08" },
    { naam: "Periode 2", kort: "P2", start: "2026-11-09", eind: "2027-01-31" },
    { naam: "Periode 3", kort: "P3", start: "2027-02-01", eind: "2027-04-11", uitleg: "Minor (30 EC)" },
    { naam: "Periode 4", kort: "P4", start: "2027-04-12", eind: "2027-07-04", uitleg: "Minor (30 EC)" }
  ],

  vakanties: [
    { naam: "Herfstvakantie", start: "2026-10-17", eind: "2026-10-25" },
    { naam: "Kerstvakantie", start: "2026-12-19", eind: "2027-01-03" },
    { naam: "HAN-week", start: "2027-01-25", eind: "2027-01-31", wisselweek: true },
    { naam: "Voorjaarsvakantie", start: "2027-02-06", eind: "2027-02-14" },
    { naam: "Meivakantie", start: "2027-04-24", eind: "2027-05-09" },
    { naam: "Zomervakantie", start: "2027-07-17", eind: "2027-08-22" }
  ],

  // Toetsen met een vaste datum
  toetsen: [
    {
      datum: "2026-11-17",
      titel: "LKT Taal",
      soort: "lkt",
      doelgroep: "alle",
      uitleg: "Landelijke kennistoets taal: de kennisbasis taal. Onderdeel van Eigen Vaardigheden C. Er zijn 2 kansen per studiejaar."
    },
    {
      datum: "2026-11-24",
      titel: "LKT Rekenen",
      soort: "lkt",
      doelgroep: "alle",
      uitleg: "Landelijke kennistoets rekenen: de kennisbasis rekenen. Onderdeel van Eigen Vaardigheden C. Er zijn 2 kansen per studiejaar."
    },
    {
      datum: "2027-01-11",
      titel: "Begin tentamenweek P2",
      soort: "toets",
      doelgroep: "alle",
      uitleg: "Vanaf deze week vinden de cursustoetsen van periode 2 plaats. Op welke dag welke toets is, is nog niet bekend."
    }
  ],

  // Toetsen waarvan alleen de periode bekend is
  zonderDatum: [
    {
      periode: "P2", titel: "Kennistoets OJW", vorm: "Kennistoets", doelgroep: "alle", herkansing: "P3 of P4",
      uitleg: "Kennis van geschiedenis, aardrijkskunde en natuur & techniek op basisschoolniveau."
    },
    {
      periode: "P2", titel: "Brede Professionele Basis 3", vorm: "Gesprek", doelgroep: "alle", herkansing: "P3",
      uitleg: "Gesprek over je persoonlijke en professionele identiteit en je visie op goed onderwijs."
    },
    {
      periode: "P2", titel: "Thematisch ontwerp", vorm: "Presentatie + gesprek", doelgroep: "alle", herkansing: "In overleg met je SO",
      uitleg: "Presentatie van je thematisch ontwerp en de tussenbeoordeling van stage 3."
    },
    {
      periode: "P2", titel: "Taal profilering", vorm: "Niet vermeld", doelgroep: "alle", herkansing: "Niet vermeld",
      uitleg: "Rijke taalleeromgeving binnen je thematisch ontwerp. De toetsvorm staat niet in het overzicht."
    },
    {
      periode: "P2", titel: "Rekenen profilering", vorm: "Presentatie", doelgroep: "ok", herkansing: "P3",
      uitleg: "Les met rijke rekenproblemen vanuit onderzoekend leren (meten, meetkunde of verbanden)."
    },
    {
      periode: "P2", titel: "Kunstzinnige activiteiten", vorm: "Portfolio", doelgroep: "ok", herkansing: "P3",
      uitleg: "Portfolio met je lessen muziek, drama en beeldende vorming."
    },
    {
      periode: "P2", titel: "Rekenen profilering", vorm: "Portfolio", doelgroep: "jk", herkansing: "P3",
      uitleg: "Ontwerp, uitvoering en reflectie van een rijke rekenomgeving."
    },
    {
      periode: "P2", titel: "Oriëntatie op jezelf en de wereld", vorm: "Gesprek", doelgroep: "jk", herkansing: "P3",
      uitleg: "Gesprek over je OJW-leeractiviteiten in de stage."
    }
  ]
};
