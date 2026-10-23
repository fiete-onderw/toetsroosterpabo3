// Digigenda agenda-abonnement: zet opdrachten (en eventueel de Pabo-toetsen) om in een .ics-agenda.

const SOORT_LABEL = { deadline: "Deadline", toets: "Toets", herkansing: "Herkansing", afspraak: "Afspraak", overig: "Overig" };
const AGENDA_NAAM = { school: "School", werk: "Werk", persoonlijk: "Persoonlijk" };

// toetsen.js is JavaScript ("window.PLANNING = {...}"). Zet dat om naar JSON zonder code uit te voeren.
export function leesPlanning(bron) {
  const begin = bron.indexOf("{", bron.indexOf("PLANNING"));
  const eind = bron.lastIndexOf("}");
  if (begin < 0 || eind < begin) return null;
  const src = bron.slice(begin, eind + 1);
  let uit = "", i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'") {
      let j = i + 1, s = "";
      while (j < n && src[j] !== c) {
        if (src[j] === "\\") { s += src[j] + (src[j + 1] || ""); j += 2; continue; }
        s += src[j]; j++;
      }
      let waarde;
      try { waarde = c === '"' ? JSON.parse('"' + s + '"') : s.replace(/\\'/g, "'"); } catch (e) { waarde = s; }
      uit += JSON.stringify(waarde);
      i = j + 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(src[j])) j++;
      const woord = src.slice(i, j);
      let k = j;
      while (k < n && /\s/.test(src[k])) k++;
      uit += src[k] === ":" ? JSON.stringify(woord) : woord;
      i = j;
      continue;
    }
    uit += c;
    i++;
  }
  try { return JSON.parse(uit.replace(/,(\s*[}\]])/g, "$1")); } catch (e) { return null; }
}

const tekst = (s) => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const datumIcs = (iso) => iso.replace(/-/g, "");
function volgendeDag(iso) {
  const [j, m, d] = iso.split("-").map(Number);
  const x = new Date(Date.UTC(j, m - 1, d + 1));
  return x.getUTCFullYear() + String(x.getUTCMonth() + 1).padStart(2, "0") + String(x.getUTCDate()).padStart(2, "0");
}
const stempel = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

// Regels langer dan 75 bytes vouwen (verplicht in het ics-formaat)
function vouw(regel) {
  const enc = new TextEncoder();
  if (enc.encode(regel).length <= 75) return regel;
  const delen = [];
  let huidig = "", bytes = 0, max = 75;
  for (const teken of regel) {
    const b = enc.encode(teken).length;
    if (bytes + b > max) { delen.push(huidig); huidig = ""; bytes = 0; max = 74; }
    huidig += teken; bytes += b;
  }
  delen.push(huidig);
  return delen.join("\r\n ");
}

const TIJDZONE = [
  "BEGIN:VTIMEZONE", "TZID:Europe/Amsterdam",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE"
];

export function maakIcs(data, planning, nu) {
  const inst = data.instellingen || {};
  const agendas = Array.isArray(inst.agendas) && inst.agendas.length ? inst.agendas : ["school", "werk", "persoonlijk"];
  const pabo = inst.pabo !== false && agendas.includes("school");
  const doelgroep = ["jk", "ok"].includes(inst.doelgroep) ? inst.doelgroep : "alle";
  const dtstamp = stempel(nu || new Date());
  const r = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Digigenda//Agenda//NL", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + tekst("Digigenda (" + data.naam + ")"), "X-WR-TIMEZONE:Europe/Amsterdam",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"
  ].concat(TIJDZONE);

  const dagEvent = (uid, start, eindExclusief, titel, omschrijving, categorie) => {
    r.push("BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + dtstamp,
      "DTSTART;VALUE=DATE:" + start, "DTEND;VALUE=DATE:" + eindExclusief,
      "SUMMARY:" + tekst(titel), "TRANSP:TRANSPARENT");
    if (omschrijving) r.push("DESCRIPTION:" + tekst(omschrijving));
    if (categorie) r.push("CATEGORIES:" + tekst(categorie));
    r.push("END:VEVENT");
  };

  const wie = slug(data.naam || "");
  for (const o of data.opdrachten || []) {
    if (!agendas.includes(o.agenda || "school")) continue;
    const uid = slug(o.id) + "-" + wie + "@digigenda";
    const titel = (o.klaar ? "✓ " : "") + o.titel;
    const label = SOORT_LABEL[o.soort];
    const omschrijving = [label ? "Soort: " + label : "", o.notitie || ""].filter(Boolean).join("\n");
    const categorie = AGENDA_NAAM[o.agenda] || "School";
    const eind = /^\d{2}:\d{2}$/.test(o.eind || "") ? o.eind : null;
    if (o.tijd && /^\d{2}:\d{2}$/.test(o.tijd)) {
      r.push("BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + dtstamp,
        "DTSTART;TZID=Europe/Amsterdam:" + datumIcs(o.datum) + "T" + o.tijd.replace(":", "") + "00",
        eind && eind > o.tijd ? "DTEND;TZID=Europe/Amsterdam:" + datumIcs(o.datum) + "T" + eind.replace(":", "") + "00"
          : eind && eind < o.tijd ? "DTEND;TZID=Europe/Amsterdam:" + volgendeDag(o.datum) + "T" + eind.replace(":", "") + "00"   // nachtdienst: eindigt de volgende dag
          : "DURATION:PT1H",
        "SUMMARY:" + tekst(titel));
      if (omschrijving) r.push("DESCRIPTION:" + tekst(omschrijving));
      r.push("CATEGORIES:" + tekst(categorie), "END:VEVENT");
    } else {
      dagEvent(uid, datumIcs(o.datum), volgendeDag(o.datum), titel + (eind ? " (tot " + eind + ")" : ""), omschrijving, categorie);
    }
  }

  if (pabo && planning) {
    for (const t of planning.toetsen || []) {
      if (!t.datum) continue;
      if (t.doelgroep && t.doelgroep !== "alle" && doelgroep !== "alle" && t.doelgroep !== doelgroep) continue;
      dagEvent("toets-" + datumIcs(t.datum) + "-" + slug(t.titel) + "@digigenda", datumIcs(t.datum), volgendeDag(t.datum), t.titel, t.uitleg || "", "School");
    }
    for (const p of planning.periodes || []) {
      if (!p.start) continue;
      dagEvent("periode-" + datumIcs(p.start) + "@digigenda", datumIcs(p.start), volgendeDag(p.start), "Start " + p.naam, p.uitleg || "", "School");
    }
    for (const v of planning.vakanties || []) {
      if (!v.start || !v.eind) continue;
      dagEvent("vakantie-" + datumIcs(v.start) + "@digigenda", datumIcs(v.start), volgendeDag(v.eind), v.naam, "", "School");
    }
  }

  r.push("END:VCALENDAR");
  return r.map(vouw).join("\r\n") + "\r\n";
}
