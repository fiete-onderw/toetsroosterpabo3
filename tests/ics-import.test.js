// ics.js: lezen van echte voorbeeldbestanden (Outlook, Google, iCloud, roosterapp) en rare gevallen
const ICS = require(require("path").join(__dirname, "..", "ics.js"));
const fs = require("fs"), path = require("path");
const map = path.join(__dirname, "ics-bestanden");
const NU = new Date("2026-10-22T10:00:00");
const res = []; const check = (n, ok, x) => res.push((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  (" + (typeof x === "string" ? x : JSON.stringify(x)) + ")"));
const lees = (naam, o) => ICS.lees(fs.readFileSync(path.join(map, naam), "utf8"), Object.assign({ nu: NU }, o || {}));
const vind = (r, f) => r.voorvallen.filter(f);
const kort = (v) => v.map((x) => x.datum + " " + (x.tijd || "hele dag") + (x.eind ? "-" + x.eind : "") + " " + x.titel);

// ---------- Outlook ----------
const o = lees("outlook-werk.ics");
check("outlook: leesbaar, naam", o.ok && o.naam === "Agenda - Gijs (werk)", o);
const team = vind(o, (v) => v.uid.startsWith("040000008200E00074C5B7101A82E00800000000D0A1E3F1C7A2DC01"));
check("outlook: wekelijkse reeks uitgerold (ma 5 okt t/m 29 mrt, minus EXDATE 26 okt, minus geannuleerde 9 nov)", team.length === 24, kort(team));
check("outlook: EXDATE 26 okt weg", !team.some((v) => v.datum === "2026-10-26"));
check("outlook: geannuleerd voorval 9 nov weg", !team.some((v) => v.datum === "2026-11-09"));
const verplaatst = team.find((v) => v.datum === "2026-11-03");
check("outlook: RECURRENCE-ID verplaatst 2 nov → 3 nov 14:00, oude 2 nov weg", verplaatst && verplaatst.tijd === "14:00" && verplaatst.titel.includes("verplaatst") && !team.some((v) => v.datum === "2026-11-02"), kort(team.slice(0, 8)));
check("outlook: Windows-tijdzone → Nederlandse tijd (09:00 blijft 09:00, ook na de wintertijd)", team.filter((v) => v.tijd === "09:00").length === 23, kort(team));
check("outlook: UNTIL in UTC (29 mrt 07:00Z = 09:00 lokaal) telt mee", team.some((v) => v.datum === "2027-03-29"));
const nacht = vind(o, (v) => v.uid.startsWith("nacht"))[0];
check("outlook: nachtdienst 22:00–06:00 over middernacht", nacht && nacht.datum === "2026-10-30" && nacht.tijd === "22:00" && nacht.eind === "06:00", nacht);
const vrij = vind(o, (v) => v.uid.startsWith("vrij"))[0];
check("outlook: hele dag (VALUE=DATE), 1 dag, niet bezet (FREE)", vrij && vrij.heledag && vrij.datum === "2026-11-06" && vrij.bezet === false && vind(o, (v) => v.uid.startsWith("vrij")).length === 1, vrij);
const tr = vind(o, (v) => v.uid.startsWith("training"))[0];
check("outlook: DURATION PT7H30M → 09:00–16:30", tr && tr.tijd === "09:00" && tr.eind === "16:30", tr);
check("outlook: afspraak uit 2025 buiten het venster", !vind(o, (v) => v.uid.startsWith("oud")).length);
const zt = vind(o, (v) => v.uid.startsWith("zomertijd"))[0];
check("outlook: dag van de zomertijd 08:30–12:00 klopt", zt && zt.tijd === "08:30" && zt.eind === "12:00", zt);
check("outlook: gevouwen DESCRIPTION weer één geheel met \\n", team[0].omschrijving.includes("Wekelijks overleg.\nAgenda:") && team[0].omschrijving.includes("gevouwen wordt over meerdere regels"), team[0].omschrijving);
check("outlook: LOCATION met \\, ontdaan", team[0].locatie === "Vergaderzaal 2.14, Arnhem", team[0].locatie);
check("outlook: dienst 24 okt 10:00–16:30", vind(o, (v) => v.uid.startsWith("dienst"))[0].eind === "16:30");

// ---------- Google ----------
const g = lees("google-persoonlijk.ics");
const hard = vind(g, (v) => v.uid.startsWith("7k3m"));
check("google: wekelijks di 27 okt t/m 15 dec minus EXDATE 10 nov = 7", hard.length === 7, kort(hard));
check("google: UNTIL 20261215T225959Z (= 23:59 lokaal) telt 15 dec mee", hard.some((v) => v.datum === "2026-12-15"));
check("google: uitzondering 24 nov 20:00 vervangt 19:30", hard.filter((v) => v.datum === "2026-11-24").length === 1 && hard.find((v) => v.datum === "2026-11-24").tijd === "20:00");
check("google: EXDATE 10 nov weg", !hard.some((v) => v.datum === "2026-11-10"));
const utc = vind(g, (v) => v.uid.startsWith("utc"))[0];
check("google: UTC-tijd 18:00Z → 19:00 (wintertijd 5 nov)", utc && utc.tijd === "19:00" && utc.eind === "20:30", utc);
const weg = vind(g, (v) => v.uid.startsWith("kerstweekend"));
check("google: hele dag 20–23 dec (DTEND exclusief) = 4 dagen", weg.length === 4 && weg[0].datum === "2026-12-20" && weg[3].datum === "2026-12-23", kort(weg));
const borrel = vind(g, (v) => v.uid.startsWith("borrel"));
check("google: maandelijks laatste vrijdag (BYDAY=-1FR): 30 okt, 27 nov, 25 dec, 29 jan…", borrel.slice(0, 4).map((v) => v.datum).join() === "2026-10-30,2026-11-27,2026-12-25,2027-01-29", kort(borrel));
check("google: geannuleerde reeks helemaal weg", !vind(g, (v) => v.uid.startsWith("geannuleerd")).length);
const lunch = vind(g, (v) => v.uid.startsWith("zonder-tzid"))[0];
check("google: escapes in SUMMARY en DESCRIPTION", lunch && lunch.titel === "Lunch, met komma; en puntkomma" && lunch.omschrijving === "Regel 1\nRegel 2", lunch);

// ---------- iCloud ----------
const i = lees("icloud-prive.ics");
const kerst = vind(i, (v) => v.uid.startsWith("5A1F"));
check("icloud: hele dag 26–30 dec = 5 dagen, niet bezet", kerst.length === 5 && kerst.every((v) => v.heledag && !v.bezet), kort(kerst));
const oma = vind(i, (v) => v.uid.startsWith("B2C3"))[0];
check("icloud: afspraak 28 nov 14:00–16:00", oma && oma.datum === "2026-11-28" && oma.tijd === "14:00" && oma.eind === "16:00", oma);
const jarig = vind(i, (v) => v.uid === "jarig-daan");
check("icloud: jaarlijkse verjaardag sinds 1999 → één voorval in het venster (12 apr 2027)", jarig.length === 1 && jarig[0].datum === "2027-04-12", kort(jarig));
const ny = vind(i, (v) => v.uid === "ny-reis")[0];
check("icloud: America/New_York 09:00 → 15:00 Nederlandse tijd", ny && ny.tijd === "15:00" && ny.eind === "16:30", ny);

// ---------- rooster (UTC) ----------
const r = lees("rooster-utc.ics");
const kassa = vind(r, (v) => v.uid === "shift-100234@shiftbase")[0];
check("rooster: 08:00Z–16:00Z op 24 okt (zomertijd) → 10:00–18:00", kassa && kassa.tijd === "10:00" && kassa.eind === "18:00", kassa);
const nm = vind(r, (v) => v.uid === "shift-100235@shiftbase")[0];
check("rooster: 31 okt 21:00Z–1 nov 05:00Z → 22:00–06:00 (wintertijd sinds 25 okt)", nm && nm.datum === "2026-10-31" && nm.tijd === "22:00" && nm.eind === "06:00", nm);
const k2 = vind(r, (v) => v.uid === "shift-100236@shiftbase")[0];
check("rooster: 7 nov 09:00Z → 10:00 (wintertijd)", k2 && k2.tijd === "10:00" && k2.eind === "14:00", k2);
check("rooster: verlof 10–12 nov = 3 dagen", vind(r, (v) => v.uid.startsWith("verlof")).length === 3);
check("rooster: LF-regeleinden werken", r.ok && r.voorvallen.length === 6, r.voorvallen.length);

// ---------- raar ----------
const x = lees("raar.ics");
check("raar: zonder eindtijd → eind null", vind(x, (v) => v.uid === "geen-eind")[0].eind === null);
const lang = vind(x, (v) => v.uid === "lange-tekst")[0];
const opd = ICS.naarOpdracht(lang, "imp1", "werk", false);
check("raar: lange titel/omschrijving afgekapt tot 80/400", opd.titel.length === 80 && opd.notitie.length === 400, [opd.titel.length, opd.notitie.length]);
check("raar: html in titel blijft tekst", vind(x, (v) => v.uid === "html-titel")[0].titel.startsWith("<img"));
check("raar: zonder UID krijgt een stabiele sleutel", vind(x, (v) => v.uid.startsWith("zonder-uid-")).length === 1);
check("raar: kapotte datum overgeslagen met melding", !vind(x, (v) => v.uid === "kapotte-datum").length && x.meldingen.some((m) => m.includes("Kapot")));
check("raar: onbekende tijdzone → Nederlandse tijd + melding", vind(x, (v) => v.uid === "onbekende-zone")[0].tijd === "09:00" && x.meldingen.some((m) => m.includes("Mars/Olympus")), x.meldingen);
check("raar: TZID tussen aanhalingstekens", vind(x, (v) => v.uid === "aanhalingstekens")[0].tijd === "11:00");
const nb = vind(x, (v) => v.uid === "bestaat-niet-zomertijd")[0];
check("raar: niet-bestaande tijd op zomertijd-dag levert tóch een afspraak", nb && nb.datum === "2027-03-28" && /^0[23]:30$/.test(nb.tijd), nb);
const dag = vind(x, (v) => v.uid === "elke-dag-oneindig");
check("raar: oneindige dagelijkse reeks sinds 2020 alleen binnen het venster (-30/+400 dagen = 431)", dag.length === 431, dag.length);
const td = vind(x, (v) => v.uid === "tweede-dinsdag");
check("raar: BYSETPOS=2 met BYDAY=TU: 13 okt, 10 nov, 8 dec, 12 jan", td.slice(0, 4).map((v) => v.datum).join() === "2026-10-13,2026-11-10,2026-12-08,2027-01-12", kort(td));
const ow = vind(x, (v) => v.uid === "om-de-twee-weken");
check("raar: INTERVAL=2 BYDAY=FR,SA COUNT=6", ow.map((v) => v.datum).join() === "2026-10-23,2026-10-24,2026-11-06,2026-11-07,2026-11-20,2026-11-21", kort(ow));
const rd = vind(x, (v) => v.uid === "rdate");
check("raar: RDATE voegt 3 en 5 dec toe", rd.map((v) => v.datum).join() === "2026-12-01,2026-12-03,2026-12-05", kort(rd));
check("raar: dubbele UID+start in één bestand = één voorval", vind(x, (v) => v.uid === "dubbel").length === 1);
check("geen agenda: nette fout", !ICS.lees(fs.readFileSync(path.join(map, "geen-agenda.txt"), "utf8")).ok);
check("leeg: nette fout", !ICS.lees("").ok);

// ---------- stabiele ids ----------
const a1 = ICS.naarOpdracht(kassa, "imp-abc", "werk", false), a2 = ICS.naarOpdracht(lees("rooster-utc.ics").voorvallen.find((v) => v.uid === kassa.uid), "imp-abc", "werk", true);
check("naarOpdracht: zelfde voorval → zelfde id (geen dubbelen bij verversen)", a1.id === a2.id && /^i[0-9a-f]{22}$/.test(a1.id), [a1.id, a2.id]);
check("naarOpdracht: 'alleen bezet' bewaart geen titel/notitie", a2.titel === "Werk" && a2.notitie === "" && a1.titel === "Kassa" && a1.notitie.includes("Afdeling: Kassa"), a2);
check("naarOpdracht: andere import → ander id", ICS.naarOpdracht(kassa, "imp-xyz", "werk", false).id !== a1.id);

// ---------- snelheid: groot bestand ----------
let groot = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:x\r\n";
for (let n = 0; n < 4000; n++) {
  const d = new Date(Date.UTC(2026, 9, 1 + (n % 400)));
  const ds = d.toISOString().slice(0, 10).replace(/-/g, "");
  groot += "BEGIN:VEVENT\r\nUID:groot-" + n + "\r\nDTSTART:" + ds + "T" + String(8 + (n % 10)).padStart(2, "0") + "0000Z\r\nDTEND:" + ds + "T" + String(9 + (n % 10)).padStart(2, "0") + "0000Z\r\nSUMMARY:Afspraak " + n + "\r\nDESCRIPTION:" + "tekst ".repeat(50) + "\r\nEND:VEVENT\r\n";
}
groot += "END:VCALENDAR\r\n";
const t0 = Date.now(); const gr = ICS.lees(groot, { nu: NU }); const duur = Date.now() - t0;
check("groot: 4000 afspraken (" + Math.round(groot.length / 1024) + " kB) in < 3 s", gr.ok && gr.voorvallen.length === 4000 && duur < 3000, duur + " ms, " + gr.voorvallen.length);

console.log(res.join("\n"));
console.log(res.filter((r) => r.startsWith("PASS")).length + " / " + res.length + " geslaagd");
if (res.some((r) => r.startsWith("FAIL"))) process.exit(1);
