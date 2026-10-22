const { verwerk } = require(require("path").join(__dirname, "..", "parse.js"));
const V = new Date(2026, 9, 22);
const g = [
  // invoer, titel, datum, tijd, eind
  ["tandarts morgen 14:00-15:30", "tandarts", "2026-10-23", "14:00", "15:30"],
  ["tandarts morgen 14:00 - 15:30", "tandarts", "2026-10-23", "14:00", "15:30"],
  ["14:00–15:30 morgen tandarts", "tandarts", "2026-10-23", "14:00", "15:30"],
  ["werk za 10u tot 16u", "werk", "2026-10-24", "10:00", "16:00"],
  ["werk za 10 tot 16u", "werk", "2026-10-24", "10:00", "16:00"],
  ["van 9 tot 12 college", "college", "2026-10-22", "09:00", "12:00"],
  ["college vrijdag van 9.30 tot 12.15", "college", "2026-10-23", "09:30", "12:15"],
  ["om 14:00 tot 15:00 overleg", "overleg", "2026-10-22", "14:00", "15:00"],
  ["tandarts morgen 14:00 1 uur", "tandarts", "2026-10-23", "14:00", "15:00"],
  ["overleg vr 13:30 45 min", "overleg", "2026-10-23", "13:30", "14:15"],
  ["sporten 19:00 anderhalf uur", "sporten", "2026-10-22", "19:00", "20:30"],
  ["sporten 19:00 1,5 uur", "sporten", "2026-10-22", "19:00", "20:30"],
  ["bellen 9u een kwartier", "bellen", "2026-10-22", "09:00", "09:15"],
  ["inleveren vrijdag tot 17:00", "inleveren", "2026-10-23", null, "17:00"],
  ["inleveren tot 17u vrijdag", "inleveren", "2026-10-23", null, "17:00"],
  ["Lezen TL 5.10-5.20 maandag", "Lezen TL 5.10-5.20", "2026-10-26", null, null],
  ["Lezen HO 4.1-4.4 ma", "Lezen HO 4.1-4.4", "2026-10-26", null, null],
  ["lezen 2 uur vrijdag", "lezen 2 uur", "2026-10-23", null, null],
  ["werk 22:00-06:00 za", "werk", "2026-10-24", "22:00", "06:00"],
  ["9-12 inleveren", "inleveren", "2026-12-09", null, null],
  ["tot ziens zeggen morgen", "tot ziens zeggen", "2026-10-23", null, null],
  ["college 9 uur vrijdag", "college", "2026-10-23", "09:00", null],
];
let f = 0;
for (const [inv, titel, datum, tijd, eind] of g) {
  const r = verwerk(inv, V); const p = [];
  if (r.titel !== titel) p.push("titel=" + JSON.stringify(r.titel));
  if (r.datum !== datum) p.push("datum=" + r.datum);
  if (r.tijd !== tijd) p.push("tijd=" + r.tijd);
  if (r.eind !== eind) p.push("eind=" + r.eind);
  if (p.length) { f++; console.log("FAIL", JSON.stringify(inv), "->", p.join(", ")); }
}
console.log((g.length - f) + " van " + g.length + " goed");
