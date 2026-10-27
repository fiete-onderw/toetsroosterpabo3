/*
  Digigenda: snelle invoer.
  Zet een regel als "Lezen RT 6.2.2 vrijdag 14:00 #school" om in
  { titel, datum, tijd, soort, agenda }. De volgorde van de woorden maakt niet uit.

  Herkent:
  - dagen:   vandaag, morgen, overmorgen, maandag..zondag, ma..zo, "volgende week (dinsdag)",
             "dinsdag volgende week", "volgende dinsdag", "deze vrijdag", "over 3 dagen", "over 2 weken",
             14 nov, 14 november (2027), 14-11, 14/11, 14-11-2026, 2026-11-14
  - tijden:  14:00, om 14.30, 14u, 9u30, 9 uur, om 9
  - eindtijd: 14:00-15:30, 10u tot 16u, van 9 tot 12, 14:00 1 uur, 13:30 45 min, "tot 17:00" (alleen eindtijd)
  - agenda:  #school, #werk, #prive / #privé / #persoonlijk
  - soort:   de woorden deadline, toets, tentamen, herkansing, afspraak (blijven in de titel staan)
  - herhaling: "elke dinsdag", "iedere di", "wekelijks", "elke week", met einde "t/m 31 jan" of "tot en met 31 januari"
  - standaardduur zonder eindtijd: college/werkcollege 1,5 u, dienst 4 u, tandarts/dokter 30 min, overleg/vergadering 1 u
*/
(function (root) {
  "use strict";

  const B0 = "(?<![\\p{L}\\p{N}])";   // begin van een woord
  const B1 = "(?![\\p{L}\\p{N}])";    // einde van een woord

  const WEEKDAG = { zondag: 0, maandag: 1, dinsdag: 2, woensdag: 3, donderdag: 4, vrijdag: 5, zaterdag: 6,
    zo: 0, ma: 1, di: 2, wo: 3, do: 4, vr: 5, za: 6 };
  const DAG_VOL = "maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag";
  const DAG_KORT = "ma|di|wo|do|vr|za|zo";
  const DAG_ALLE = DAG_VOL + "|" + DAG_KORT;
  const MAAND = { jan: 0, januari: 0, feb: 1, februari: 1, mrt: 2, maart: 2, apr: 3, april: 3, mei: 4,
    jun: 5, juni: 5, jul: 6, juli: 6, aug: 7, augustus: 7, sep: 8, sept: 8, september: 8,
    okt: 9, oktober: 9, nov: 10, november: 10, dec: 11, december: 11 };
  const MAAND_RE = Object.keys(MAAND).sort((a, b) => b.length - a.length).join("|");
  const TELWOORD = { een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10 };
  const AGENDA = { school: "school", werk: "werk", prive: "persoonlijk", "privé": "persoonlijk", persoonlijk: "persoonlijk" };
  const SOORT = { deadline: "deadline", toets: "toets", tentamen: "toets", herkansing: "herkansing", afspraak: "afspraak" };
  const DUUR = [[/\b(hoor|werk)?college\b/u, 90], [/\b(nacht|avond|ochtend)?dienst\b/u, 240], [/\b(tandarts|dokter|huisarts|kapper|fysio)\b/u, 30], [/\b(overleg|vergadering|gesprek|intake|bellen)\b/u, 60], [/\b(stage)\b/u, 420]];

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const begin = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const geldig = (j, m, d) => { const x = new Date(j, m, d); return x.getFullYear() === j && x.getMonth() === m && x.getDate() === d; };

  // Eerstvolgende gegeven weekdag; vandaag telt mee tenzij strikt = true.
  function eerstvolgende(van, dow, strikt) {
    let n = (dow - van.getDay() + 7) % 7;
    if (n === 0 && strikt) n = 7;
    return plus(van, n);
  }
  // Weekdag in de volgende week (weken beginnen op maandag).
  function volgendeWeek(van, dow) {
    const maandagDezeWeek = plus(van, -((van.getDay() + 6) % 7));
    return plus(maandagDezeWeek, 7 + ((dow + 6) % 7));
  }
  // Dag en maand zonder jaartal: dit jaar, of volgend jaar als die dag al geweest is.
  function zonderJaar(van, m, d) {
    let j = van.getFullYear();
    if (!geldig(j, m, d)) return null;
    if (new Date(j, m, d) < van) j++;
    return geldig(j, m, d) ? new Date(j, m, d) : null;
  }

  function verwerk(regel, vandaag, opties) {
    const van = begin(vandaag || new Date());
    const tekst = String(regel || "").replace(/^\s*(?:[-*•·▪]|\d{1,2}[.)])\s+/, "");
    const laag = tekst.toLowerCase();
    const bezet = [];          // [start, eind] van herkende stukjes
    const delen = [];
    const vrij = (s, e) => bezet.every(([a, b]) => e <= a || s >= b);
    const neem = (s, e, soort, waarde) => { bezet.push([s, e]); delen.push({ soort, tekst: tekst.slice(s, e).trim(), waarde }); };

    function zoek(patroon, verwerkFn, alleenEerste = true) {
      const re = new RegExp(patroon, "giu");
      let m;
      while ((m = re.exec(laag)) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        const s = m.index, e = m.index + m[0].length;
        if (!vrij(s, e)) continue;
        const waarde = verwerkFn(m, s, e);
        if (waarde == null) continue;
        return { s, e, waarde };
      }
      return null;
    }

    let agenda = null, datum = null, tijd = null, soort = null;

    // 1. agenda-tag
    const tag = zoek("#(" + Object.keys(AGENDA).join("|") + ")" + B1, (m) => AGENDA[m[1]]);
    if (tag) { agenda = tag.waarde; neem(tag.s, tag.e, "agenda", agenda); }

    // 2. tijdvak: "14:00-15:30", "10u tot 16u", "van 9 tot 12"
    const TOK = "(?:[01]?\\d|2[0-3])(?:[:.][0-5]\\d|u(?:[0-5]\\d)?)?(?:\\s*uur)?";
    const naarTijd = (t) => { const m = /(\d{1,2})(?:[:.](\d{2})|u(\d{2})?)?/.exec(t); return pad(+m[1]) + ":" + (m[2] || m[3] || "00"); };
    const sterk = (t) => /[:u]/.test(t);   // 14:00, 14u, 14 uur (niet: 14 of 14.30)
    let eind = null;
    const vakPatronen = [
      [B0 + "van\\s+(" + TOK + ")\\s*(?:-|–|tot)\\s*(" + TOK + ")" + B1, (m) => [naarTijd(m[1]), naarTijd(m[2])]],
      ["(?:" + B0 + "om\\s+)?(?<![\\d.\\p{L}])(" + TOK + ")\\s*(-|–|tot)\\s*(" + TOK + ")(?![\\d.\\p{L}])", (m) => {
        const ok = m[2] === "tot" ? (sterk(m[1]) || sterk(m[3])) : (sterk(m[1]) && sterk(m[3]));
        return ok ? [naarTijd(m[1]), naarTijd(m[3])] : null;
      }]
    ];
    for (const [p, f] of vakPatronen) {
      const r = zoek(p, f);
      if (r) { tijd = r.waarde[0]; eind = r.waarde[1]; neem(r.s, r.e, "tijd", tijd + "–" + eind); break; }
    }

    // 3. alleen een eindtijd: "inleveren vrijdag tot 17:00"
    if (!tijd) {
      const r = zoek(B0 + "tot\\s+(" + TOK + ")" + B1, (m) => sterk(m[1]) ? naarTijd(m[1]) : null);
      if (r) { eind = r.waarde; neem(r.s, r.e, "eind", eind); }
    }

    // 4. losse tijd (vóór de dagen, zodat "zo" naast een tijd herkend kan worden)
    const tijdPatronen = [
      // 14:00, om 14:00, 14:00 uur
      ["(?:" + B0 + "om\\s+)?" + B0 + "([01]?\\d|2[0-3]):([0-5]\\d)" + B1 + "(?:\\s*(?:uur|u)" + B1 + ")?", (m) => pad(+m[1]) + ":" + m[2]],
      // om 14.30 / 14.30 uur (alleen met 'om' of 'uur', zodat "TL 5.10" geen tijd wordt)
      [B0 + "om\\s+([01]?\\d|2[0-3])\\.([0-5]\\d)" + B1 + "(?:\\s*(?:uur|u)" + B1 + ")?", (m) => pad(+m[1]) + ":" + m[2]],
      [B0 + "([01]?\\d|2[0-3])\\.([0-5]\\d)\\s*(?:uur|u)" + B1, (m) => pad(+m[1]) + ":" + m[2]],
      // 9u30
      [B0 + "([01]?\\d|2[0-3])u([0-5]\\d)" + B1, (m) => pad(+m[1]) + ":" + m[2]],
      // 14u, 9 uur, om 9 uur ("2 uur" zonder 'om' is meestal een duur, geen tijd)
      ["(" + B0 + "om\\s+)?" + B0 + "([01]?\\d|2[0-3])\\s*(?:uur|u)" + B1, (m) => (!m[1] && +m[2] <= 6 && /uur/.test(m[0])) ? null : pad(+m[2]) + ":00"],
      // om 9
      [B0 + "om\\s+([01]?\\d|2[0-3])" + B1 + "(?!\\s*[:.])", (m) => pad(+m[1]) + ":00"]
    ];
    if (!tijd && !eind) for (const [p, f] of tijdPatronen) {
      const r = zoek(p, f);
      if (r) { tijd = r.waarde; neem(r.s, r.e, "tijd", tijd); break; }
    }
    const tijdSpan = tijd ? bezet[bezet.length - 1] : null;

    // 5. duur na een begintijd: "1 uur", "1,5 uur", "anderhalf uur", "45 min", "een kwartier"
    if (tijd && !eind) {
      const r = zoek(B0 + "(\\d{1,2}(?:[.,]5)?|een|anderhalf|half)?\\s*(uur|u|min|minuten|kwartier)" + B1, (m) => {
        const g = m[1] === "een" || (!m[1] && m[2] === "kwartier") ? 1 : m[1] === "anderhalf" ? 1.5 : m[1] === "half" ? 0.5 : m[1] ? parseFloat(m[1].replace(",", ".")) : null;
        if (g == null) return null;
        const min = m[2] === "kwartier" ? g * 15 : /^min/.test(m[2]) ? g : g * 60;
        if (!(min > 0 && min < 24 * 60)) return null;
        const [h, mm] = tijd.split(":").map(Number);
        const t = (h * 60 + mm + min) % (24 * 60);
        return pad(Math.floor(t / 60)) + ":" + pad(Math.round(t % 60));
      });
      if (r) { eind = r.waarde; neem(r.s, r.e, "eind", eind); }
    }

    // 5c. standaardduur op trefwoord: "college 10:00" wordt 10:00–11:30
    let eindStandaard = false;
    if (tijd && !eind) {
      const d = DUUR.find(([re]) => re.test(laag));
      if (d) { const [h, mm] = tijd.split(":").map(Number); const t = Math.min(h * 60 + mm + d[1], 23 * 60 + 59); eind = pad(Math.floor(t / 60)) + ":" + pad(t % 60); eindStandaard = true; }
    }

    // 5d. herhaling: "elke dinsdag", "iedere di", "wekelijks", "elke week"; einde "t/m 31 jan", "tot en met 31 januari"
    let herhaal = null;
    const tm = zoek(B0 + "(?:t/m|tm|tot\\s+en\\s+met)\\s+(?:(\\d{1,2})\\s*(" + MAAND_RE + ")\\.?(?:\\s+(\\d{4}))?|(\\d{1,2})[-/](\\d{1,2})(?:[-/](\\d{4}))?)" + B1, (m) => {
      if (m[2]) { const mnd = MAAND[m[2]]; return m[3] ? (geldig(+m[3], mnd, +m[1]) ? new Date(+m[3], mnd, +m[1]) : null) : zonderJaar(van, mnd, +m[1]); }
      const mnd = +m[5] - 1; return m[6] ? (geldig(+m[6], mnd, +m[4]) ? new Date(+m[6], mnd, +m[4]) : null) : zonderJaar(van, mnd, +m[4]);
    });
    const elke = zoek(B0 + "(?:elke|iedere)\\s+(" + DAG_ALLE + ")\\.?" + B1, (m) => WEEKDAG[m[1]]) || zoek(B0 + "(?:wekelijks|elke\\s+week|iedere\\s+week)" + B1, () => -1);
    if (elke) {
      herhaal = { elke: elke.waarde, tm: tm ? iso(tm.waarde) : null };
      neem(elke.s, elke.e, "herhaal", elke.waarde);
      if (tm) neem(tm.s, tm.e, "tm", iso(tm.waarde));
      if (elke.waarde >= 0) { datum = iso(eerstvolgende(van, elke.waarde, false)); }
    }

    // 6. dag
    const datumPatronen = [
      // 2026-11-14
      [B0 + "(\\d{4})-(\\d{1,2})-(\\d{1,2})" + B1, (m) => geldig(+m[1], +m[2] - 1, +m[3]) ? new Date(+m[1], +m[2] - 1, +m[3]) : null],
      // 14-11, 14/11, 14-11-2026 (niet als stukje van "4.1-4.4" of "5.2.1")
      ["(?<![\\d.\\p{L}])(\\d{1,2})[-/](\\d{1,2})(?:[-/](\\d{4}|\\d{2}))?(?![\\d.\\p{L}])", (m) => {
        const d = +m[1], mnd = +m[2] - 1;
        if (m[3]) { const j = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return geldig(j, mnd, d) ? new Date(j, mnd, d) : null; }
        return zonderJaar(van, mnd, d);
      }],
      // 14 nov, 14 november 2027
      [B0 + "(\\d{1,2})\\s*(" + MAAND_RE + ")\\.?" + B1 + "(?:\\s+(\\d{4})" + B1 + ")?", (m) => {
        const d = +m[1], mnd = MAAND[m[2]];
        if (m[3]) return geldig(+m[3], mnd, d) ? new Date(+m[3], mnd, d) : null;
        return zonderJaar(van, mnd, d);
      }],
      // over 3 dagen / over een week / over 2 weken
      [B0 + "over\\s+(\\d{1,2}|" + Object.keys(TELWOORD).join("|") + ")\\s+(dag|dagen|week|weken)" + B1, (m) => {
        const n = TELWOORD[m[1]] || +m[1];
        return plus(van, /^we/.test(m[2]) ? n * 7 : n);
      }],
      // volgende week dinsdag / dinsdag volgende week
      [B0 + "volgende\\s+week\\s+(" + DAG_ALLE + ")\\.?" + B1, (m) => volgendeWeek(van, WEEKDAG[m[1]])],
      [B0 + "(" + DAG_ALLE + ")\\.?\\s+volgende\\s+week" + B1, (m) => volgendeWeek(van, WEEKDAG[m[1]])],
      // volgende week (zonder dag) = maandag
      [B0 + "volgende\\s+week" + B1, () => volgendeWeek(van, 1)],
      // volgende dinsdag / deze vrijdag
      [B0 + "volgende\\s+(" + DAG_ALLE + ")\\.?" + B1, (m) => eerstvolgende(van, WEEKDAG[m[1]], true)],
      [B0 + "deze\\s+(" + DAG_ALLE + ")\\.?" + B1, (m) => eerstvolgende(van, WEEKDAG[m[1]], false)],
      // vandaag / morgen / overmorgen
      [B0 + "(vandaag|overmorgen|morgen)" + B1, (m) => plus(van, { vandaag: 0, morgen: 1, overmorgen: 2 }[m[1]])],
      // maandag .. zondag
      [B0 + "(" + DAG_VOL + ")" + B1, (m) => eerstvolgende(van, WEEKDAG[m[1]], false)],
      // ma .. zo; "zo" alleen als laatste woord of direct naast een tijd (anders is het vaak gewoon het woord "zo")
      [B0 + "(" + DAG_KORT + ")\\.?" + B1, (m, s, e) => {
        if (m[1] === "zo") {
          const laatste = laag.slice(e).trim() === "";
          const naastTijd = tijdSpan && (Math.abs(tijdSpan[0] - e) <= 2 || Math.abs(s - tijdSpan[1]) <= 2);
          if (!laatste && !naastTijd) return null;
        }
        return eerstvolgende(van, WEEKDAG[m[1]], false);
      }]
    ];
    for (const [p, f] of datumPatronen) {
      const r = zoek(p, f);
      if (r) { datum = iso(r.waarde); neem(r.s, r.e, "datum", datum); break; }
    }
    if (herhaal && herhaal.elke < 0) herhaal.elke = new Date((datum || iso(van)) + "T12:00:00").getDay();

    // 7. soort (het woord blijft in de titel staan)
    const s = new RegExp(B0 + "(" + Object.keys(SOORT).join("|") + ")" + B1, "iu").exec(laag);
    if (s) soort = SOORT[s[1]];

    // 8. titel = alles wat over is
    bezet.sort((a, b) => a[0] - b[0]);
    let titel = "", pos = 0;
    for (const [a, b] of bezet) { titel += tekst.slice(pos, a) + " "; pos = b; }
    titel += tekst.slice(pos);
    titel = titel.replace(/\s+/g, " ").trim();
    const rand = /^(?:op|om|de|voor|-|–|—|,|:|@|\|)\s+|\s+(?:op|om|de|voor|tot|-|–|—|,|:|@|\|)$|^[,:;\-–—@|]+|[,:;\-–—@|]+$/i;
    let vorige;
    do { vorige = titel; titel = titel.replace(rand, "").trim(); } while (titel !== vorige);

    const o = opties || {};
    return {
      titel: titel.slice(0, 80),
      datum: datum || o.standaardDatum || iso(van),
      datumHerkend: !!datum,
      tijd,
      eind,
      soort: soort || "opdracht",
      agenda: agenda || o.standaardAgenda || null,
      agendaHerkend: !!agenda,
      eindStandaard,
      herhaal,
      delen
    };
  }

  // Meerdere regels (bijvoorbeeld een geplakte planning)
  function verwerkRegels(tekst, vandaag, opties) {
    return String(tekst || "").split(/\r?\n/).map((r) => r.trim()).filter(Boolean).map((r) => verwerk(r, vandaag, opties));
  }

  const api = { verwerk, verwerkRegels };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.INVOER = api;
})(typeof window !== "undefined" ? window : this);
