const { verwerk, verwerkRegels } = require(require("path").join(__dirname, "..", "parse.js"));
const V = new Date(2026, 9, 22); // donderdag 22 okt 2026
const gevallen = [
  // [invoer, titel, datum, tijd, soort, agenda]
  ["Lezen RT 6.2.2 vrijdag", "Lezen RT 6.2.2", "2026-10-23", null, "opdracht", null],
  ["vrijdag Lezen RT 6.2.2", "Lezen RT 6.2.2", "2026-10-23", null],
  ["14:00 morgen tandarts", "tandarts", "2026-10-23", "14:00"],
  ["tandarts morgen om 14:00", "tandarts", "2026-10-23", "14:00"],
  ["morgen 14:00 tandarts", "tandarts", "2026-10-23", "14:00"],
  ["za 10u werk Essent", "werk Essent", "2026-10-24", "10:00"],
  ["werk Essent za 10u #werk", "werk Essent", "2026-10-24", "10:00", "opdracht", "werk"],
  ["deadline portfolio rekenen 14 nov", "deadline portfolio rekenen", "2026-11-14", null, "deadline"],
  ["volgende week dinsdag casus 3", "casus 3", "2026-10-27", null],
  ["casus 3 dinsdag volgende week", "casus 3", "2026-10-27", null],
  ["over 3 dagen boeken terugbrengen #prive", "boeken terugbrengen", "2026-10-25", null, "opdracht", "persoonlijk"],
  ["boeken terugbrengen #privé over 3 dagen", "boeken terugbrengen", "2026-10-25", null, "opdracht", "persoonlijk"],
  ["Lezen: HO 7.1–7.5 · HO H8 do", "Lezen: HO 7.1–7.5 · HO H8", "2026-10-22", null],
  ["Lezen TL 5.10 en HO 4.1-4.4 maandag", "Lezen TL 5.10 en HO 4.1-4.4", "2026-10-26", null],
  ["Lezen: RT 5.2.1–5.2.3 · TL H4 zaterdag", "Lezen: RT 5.2.1–5.2.3 · TL H4", "2026-10-24", null],
  ["zo snel mogelijk mail sturen", "zo snel mogelijk mail sturen", "2026-10-22", null],
  ["mail sturen zo", "mail sturen", "2026-10-25", null],
  ["zo 9u30 hardlopen", "hardlopen", "2026-10-25", "09:30"],
  ["om 9 college", "college", "2026-10-22", "09:00"],
  ["college 9 uur vrijdag", "college", "2026-10-23", "09:00"],
  ["vergadering om 14.30 woensdag", "vergadering", "2026-10-28", "14:30"],
  ["toets rekenen 14-11", "toets rekenen", "2026-11-14", null, "toets"],
  ["inleveren 3/9", "inleveren", "2027-09-03", null],
  ["inleveren 3-9-2026", "inleveren", "2026-09-03", null],
  ["kerstdiner 2026-12-24 18:00 #prive", "kerstdiner", "2026-12-24", "18:00", "opdracht", "persoonlijk"],
  ["verjaardag oma 5 januari", "verjaardag oma", "2027-01-05", null],
  ["afspraak huisarts op vrijdag om 08:15", "afspraak huisarts", "2026-10-23", "08:15", "afspraak"],
  ["- Lezen RT 6.2.2 vandaag", "Lezen RT 6.2.2", "2026-10-22", null],
  ["1. Casus 1 opnieuw maken za", "Casus 1 opnieuw maken", "2026-10-24", null],
  ["volgende vrijdag borrel", "borrel", "2026-10-23", null],
  ["volgende donderdag borrel", "borrel", "2026-10-29", null],
  ["deze donderdag borrel", "borrel", "2026-10-22", null],
  ["herkansing taal over 2 weken", "herkansing taal", "2026-11-05", null, "herkansing"],
  ["300 tekens per 5 minuten oefenen", "300 tekens per 5 minuten oefenen", "2026-10-22", null],
  ["Lezen P 12.4 overmorgen", "Lezen P 12.4", "2026-10-24", null],
  ["Ma bellen met Roel", "bellen met Roel", "2026-10-26", null],
  ["huiswerk voor morgen", "huiswerk", "2026-10-23", null],
  ["31 sep feest", "31 sep feest", "2026-10-22", null],
];
let fout = 0;
for (const [inv, titel, datum, tijd, soort, agenda] of gevallen) {
  const r = verwerk(inv, V);
  const probl = [];
  if (r.titel !== titel) probl.push("titel=" + JSON.stringify(r.titel));
  if (r.datum !== datum) probl.push("datum=" + r.datum);
  if (r.tijd !== tijd) probl.push("tijd=" + r.tijd);
  if (soort && r.soort !== soort) probl.push("soort=" + r.soort);
  if (agenda !== undefined && r.agenda !== agenda) probl.push("agenda=" + r.agenda);
  if (probl.length) { fout++; console.log("FAIL", JSON.stringify(inv), "->", probl.join(", ")); }
}
const regels = verwerkRegels("Lezen RT 6.2.2 vrijdag\n\n- Casus 2 za #school\n14:00 tandarts ma", V, { standaardAgenda: "werk" });
if (regels.length !== 3 || regels[1].agenda !== "school" || regels[2].agenda !== "werk" || regels[2].datum !== "2026-10-26") { fout++; console.log("FAIL meerdere regels", JSON.stringify(regels.map(r=>[r.titel,r.datum,r.tijd,r.agenda]))); }
const std = verwerk("iets doen", V, { standaardDatum: "2026-11-02" });
if (std.datum !== "2026-11-02" || std.datumHerkend) { fout++; console.log("FAIL standaarddatum"); }
console.log(gevallen.length + 2 - fout, "van", gevallen.length + 2, "goed");
