/*
  Digigenda: iCalendar (.ics, RFC 5545) lezen zonder bibliotheken.
  Werkt in de browser (window.ICS), in Node (module.exports) en in Deno (globalThis.ICS).

  Wat het kan:
  - regels ontvouwen, parameters (TZID, VALUE=DATE, aanhalingstekens), escapes (\n \, \;)
  - VTIMEZONE (ook Windows-namen uit Outlook, zoals "W. Europe Standard Time") en IANA-zones via Intl
  - herhalingen (RRULE: DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH, BYSETPOS, WKST),
    EXDATE, RDATE, uitzonderingen (RECURRENCE-ID), geannuleerde afspraken (STATUS:CANCELLED)
  - hele dag (VALUE=DATE, DTEND exclusief) en afspraken met tijd (DTEND of DURATION), ook over middernacht
  - alles wordt omgerekend naar één doeltijdzone (standaard Europe/Amsterdam) en uitgerold binnen een venster

  Uitkomst: een lijst 'voorvallen' { sleutel, uid, titel, locatie, omschrijving, datum, tijd, eind, heledag, bezet }.
  De sleutel (uid + oorspronkelijke start) is stabiel: dezelfde afspraak krijgt bij elke import dezelfde sleutel.
*/
(function () {
  "use strict";

  const WEEKDAGEN = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const DAG_MS = 864e5;
  const MAX_VOORVALLEN_PER_REEKS = 1000;
  const MAX_TOTAAL = 5000;

  // Windows-tijdzonenamen (Outlook) naar IANA. Alleen de gangbare; onbekende namen vallen terug op de VTIMEZONE in het bestand.
  const WINDOWS_ZONES = {
    "W. Europe Standard Time": "Europe/Berlin", "Romance Standard Time": "Europe/Paris", "Central Europe Standard Time": "Europe/Budapest",
    "Central European Standard Time": "Europe/Warsaw", "GMT Standard Time": "Europe/London", "Greenwich Standard Time": "Atlantic/Reykjavik",
    "E. Europe Standard Time": "Europe/Chisinau", "FLE Standard Time": "Europe/Kiev", "GTB Standard Time": "Europe/Bucharest",
    "Russian Standard Time": "Europe/Moscow", "Turkey Standard Time": "Europe/Istanbul", "UTC": "UTC", "Coordinated Universal Time": "UTC",
    "Eastern Standard Time": "America/New_York", "Central Standard Time": "America/Chicago", "Mountain Standard Time": "America/Denver",
    "Pacific Standard Time": "America/Los_Angeles", "Atlantic Standard Time": "America/Halifax", "SA Pacific Standard Time": "America/Bogota",
    "E. South America Standard Time": "America/Sao_Paulo", "Argentina Standard Time": "America/Buenos_Aires",
    "India Standard Time": "Asia/Kolkata", "China Standard Time": "Asia/Shanghai", "Singapore Standard Time": "Asia/Singapore",
    "Tokyo Standard Time": "Asia/Tokyo", "Korea Standard Time": "Asia/Seoul", "AUS Eastern Standard Time": "Australia/Sydney",
    "W. Australia Standard Time": "Australia/Perth", "New Zealand Standard Time": "Pacific/Auckland", "South Africa Standard Time": "Africa/Johannesburg",
    "Egypt Standard Time": "Africa/Cairo", "Israel Standard Time": "Asia/Jerusalem", "Arabian Standard Time": "Asia/Dubai",
    "Morocco Standard Time": "Africa/Casablanca", "Arab Standard Time": "Asia/Riyadh", "Cape Verde Standard Time": "Atlantic/Cape_Verde",
    "Azores Standard Time": "Atlantic/Azores", "Hawaiian Standard Time": "Pacific/Honolulu", "Alaskan Standard Time": "America/Anchorage",
    "Mexico Standard Time": "America/Mexico_City", "Central America Standard Time": "America/Guatemala", "Canada Central Standard Time": "America/Regina"
  };

  // ---------- tekst → componenten ----------
  function ontvouw(tekst) {
    const regels = String(tekst || "").replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
    const uit = [];
    for (const r of regels) {
      if ((r[0] === " " || r[0] === "\t") && uit.length) uit[uit.length - 1] += r.slice(1);
      else if (r.length) uit.push(r);
    }
    return uit;
  }

  // "DTSTART;TZID=Europe/Amsterdam;VALUE=DATE-TIME:20261103T090000" → { naam, params, waarde }
  function leesRegel(regel) {
    let i = 0, naam = "";
    while (i < regel.length && regel[i] !== ":" && regel[i] !== ";") i++;
    naam = regel.slice(0, i).toUpperCase().trim();
    const params = {};
    while (i < regel.length && regel[i] === ";") {
      i++;
      let p = "";
      while (i < regel.length && regel[i] !== "=" && regel[i] !== ":" && regel[i] !== ";") p += regel[i++];
      let v = "";
      if (regel[i] === "=") {
        i++;
        if (regel[i] === '"') { i++; while (i < regel.length && regel[i] !== '"') v += regel[i++]; i++; }
        else while (i < regel.length && regel[i] !== ":" && regel[i] !== ";") v += regel[i++];
      }
      const sleutel = p.toUpperCase().trim();
      if (params[sleutel]) params[sleutel] += "," + v; else params[sleutel] = v;
    }
    const waarde = regel[i] === ":" ? regel.slice(i + 1) : "";
    return { naam, params, waarde };
  }

  const ontEscape = (s) => String(s).replace(/\\(n|N|,|;|\\)/g, (m, c) => (c === "n" || c === "N") ? "\n" : c);

  // Boom van componenten: { naam, props: { NAAM: [ {params, waarde} ] }, kinderen: [] }
  function ontleedComponenten(tekst) {
    const wortel = { naam: "ROOT", props: {}, kinderen: [] };
    const stapel = [wortel];
    for (const regel of ontvouw(tekst)) {
      const r = leesRegel(regel);
      if (!r.naam) continue;
      if (r.naam === "BEGIN") { const c = { naam: r.waarde.toUpperCase().trim(), props: {}, kinderen: [] }; stapel[stapel.length - 1].kinderen.push(c); stapel.push(c); continue; }
      if (r.naam === "END") { if (stapel.length > 1) stapel.pop(); continue; }
      const huidig = stapel[stapel.length - 1];
      (huidig.props[r.naam] = huidig.props[r.naam] || []).push({ params: r.params, waarde: r.waarde });
    }
    return wortel;
  }
  const eerste = (c, naam) => (c.props[naam] && c.props[naam][0]) || null;
  const tekstVan = (c, naam) => { const p = eerste(c, naam); return p ? ontEscape(p.waarde).trim() : ""; };

  // ---------- tijdzones ----------
  const intlCache = {};
  function intlFormatter(zone) {
    if (!intlCache[zone]) {
      intlCache[zone] = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    }
    return intlCache[zone];
  }
  function zoneBestaat(zone) {
    try { intlFormatter(zone); return true; } catch (e) { return false; }
  }
  // Verschil (minuten) tussen de lokale tijd in 'zone' en UTC, op een bepaald UTC-moment
  function intlOffset(zone, utcMs) {
    const delen = {};
    intlFormatter(zone).formatToParts(new Date(utcMs)).forEach((p) => { delen[p.type] = p.value; });
    const lokaal = Date.UTC(+delen.year, +delen.month - 1, +delen.day, +delen.hour % 24, +delen.minute, +delen.second);
    return Math.round((lokaal - Math.floor(utcMs / 1000) * 1000) / 60000);
  }

  const offsetNaarMinuten = (s) => { const m = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(String(s).trim()); return m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0; };

  // VTIMEZONE uit het bestand → functie offset(utcMs)
  function maakVtimezone(comp) {
    const observaties = [];
    for (const k of comp.kinderen) {
      if (k.naam !== "STANDARD" && k.naam !== "DAYLIGHT") continue;
      const start = eerste(k, "DTSTART");
      const van = offsetNaarMinuten(tekstVan(k, "TZOFFSETFROM"));
      const naar = offsetNaarMinuten(tekstVan(k, "TZOFFSETTO"));
      const rrule = tekstVan(k, "RRULE");
      const rdates = (k.props.RDATE || []).flatMap((p) => p.waarde.split(","));
      if (!start) continue;
      const w = leesWallTime(start.waarde);
      if (!w) continue;
      observaties.push({ van, naar, start: w, rrule: rrule ? leesRrule(rrule) : null, rdates });
    }
    if (!observaties.length) return null;
    const cache = {};
    // Overgangen (UTC-ms) per jaar
    function overgangen(jaar) {
      if (cache[jaar]) return cache[jaar];
      const lijst = [];
      for (const o of observaties) {
        const kandidaten = [];
        if (o.rrule) {
          const r = o.rrule;
          const maanden = r.BYMONTH && r.BYMONTH.length ? r.BYMONTH : [o.start.m + 1];
          for (const mnd of maanden) {
            if (r.BYDAY && r.BYDAY.length) {
              const dagen = dagenInMaandMetByday(jaar, mnd - 1, r.BYDAY);
              dagen.forEach((d) => kandidaten.push({ j: jaar, m: mnd - 1, d }));
            } else if (r.BYMONTHDAY && r.BYMONTHDAY.length) {
              r.BYMONTHDAY.forEach((d) => kandidaten.push({ j: jaar, m: mnd - 1, d }));
            } else kandidaten.push({ j: jaar, m: mnd - 1, d: o.start.d });
          }
          if (r.UNTIL && r.UNTIL.j < jaar) continue;
        } else if (o.rdates.length) {
          o.rdates.forEach((rd) => { const w = leesWallTime(rd); if (w && w.j === jaar) kandidaten.push(w); });
          if (o.start.j === jaar) kandidaten.push(o.start);
        } else if (o.start.j === jaar || jaar === o.start.j + 1) {
          if (o.start.j === jaar) kandidaten.push(o.start);
        }
        for (const k of kandidaten) {
          if (k.j < o.start.j || (k.j === o.start.j && (k.m < o.start.m || (k.m === o.start.m && k.d < o.start.d)))) continue;
          const lokaalMs = Date.UTC(k.j, k.m, k.d, o.start.h, o.start.mi, 0);
          lijst.push({ utc: lokaalMs - o.van * 60000, naar: o.naar });
        }
      }
      lijst.sort((a, b) => a.utc - b.utc);
      cache[jaar] = lijst;
      return lijst;
    }
    const eersteStart = observaties.reduce((m, o) => Math.min(m, Date.UTC(o.start.j, o.start.m, o.start.d)), Infinity);
    return function (utcMs) {
      const jaar = new Date(utcMs).getUTCFullYear();
      let laatste = null;
      for (const j of [jaar - 1, jaar]) {
        for (const t of overgangen(j)) if (t.utc <= utcMs) laatste = t;
      }
      if (laatste) return laatste.naar;
      // vóór de eerste overgang: neem de 'van'-offset van de vroegste observatie
      const vroegste = observaties.find((o) => Date.UTC(o.start.j, o.start.m, o.start.d) === eersteStart) || observaties[0];
      return vroegste.van;
    };
  }

  // Tijdzone-register per bestand: TZID → offsetfunctie
  function maakZones(wortel, doelZone) {
    const zones = {};
    const kalenders = wortel.kinderen.filter((c) => c.naam === "VCALENDAR");
    for (const kal of kalenders) {
      for (const k of kal.kinderen) {
        if (k.naam !== "VTIMEZONE") continue;
        const id = tekstVan(k, "TZID");
        if (!id) continue;
        const f = maakVtimezone(k);
        if (f) zones[id] = f;
      }
    }
    function offsetVoor(tzid) {
      if (!tzid) return null;
      if (zones[tzid]) return zones[tzid];
      let naam = tzid.replace(/^\/(?:[^/]+\/){0,2}/, "");   // "/mozilla.org/20050126_1/Europe/Amsterdam"
      if (WINDOWS_ZONES[naam]) naam = WINDOWS_ZONES[naam];
      if (WINDOWS_ZONES[tzid]) naam = WINDOWS_ZONES[tzid];
      if (/^(?:\(UTC[+-]\d\d:\d\d\)\s*)?/.test(naam)) naam = naam.replace(/^\(UTC[+-]\d\d:\d\d\)\s*/, "");
      if (zoneBestaat(naam)) { zones[tzid] = (ms) => intlOffset(naam, ms); return zones[tzid]; }
      const m = /^(?:UTC|GMT)?([+-]\d{1,2})(?::?(\d{2}))?$/.exec(naam);
      if (m) { const off = (+m[1]) * 60 + (m[1][0] === "-" ? -1 : 1) * (+(m[2] || 0)); zones[tzid] = () => off; return zones[tzid]; }
      // Onbekende zone: doeltijdzone (beter dan niets; wordt gemeld)
      zones[tzid] = (ms) => intlOffset(doelZone, ms);
      zones[tzid].onbekend = true;
      return zones[tzid];
    }
    return { offsetVoor, doel: (ms) => intlOffset(doelZone, ms) };
  }

  // ---------- datums ----------
  // "20261103T090000" / "20261103" / "20261103T090000Z" → wall time { j, m, d, h, mi, s, utc, alleenDatum }
  function leesWallTime(s) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(s).trim());
    if (!m) return null;
    return { j: +m[1], m: +m[2] - 1, d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0), utc: !!m[7], alleenDatum: !m[4] };
  }
  const wallMs = (w) => Date.UTC(w.j, w.m, w.d, w.h, w.mi, w.s || 0);
  // wall time in een zone → UTC-ms
  function naarUtc(w, offsetFn) {
    const lokaal = wallMs(w);
    if (w.utc || !offsetFn) return lokaal;
    const gok = lokaal - offsetFn(lokaal) * 60000;
    return lokaal - offsetFn(gok) * 60000;
  }
  // UTC-ms → { datum, tijd } in de doelzone
  function naarDoel(utcMs, zones) {
    const lokaal = utcMs + zones.doel(utcMs) * 60000;
    const d = new Date(lokaal);
    const pad = (n) => String(n).padStart(2, "0");
    return { datum: d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()), tijd: pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()), ms: lokaal };
  }
  const isoDatum = (j, m, d) => j + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  const dagenInMaand = (j, m) => new Date(Date.UTC(j, m + 1, 0)).getUTCDate();

  // DURATION "P1DT2H30M" → ms
  function leesDuur(s) {
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(s).trim());
    if (!m) return null;
    const ms = ((+m[2] || 0) * 7 + (+m[3] || 0)) * DAG_MS + (+m[4] || 0) * 36e5 + (+m[5] || 0) * 6e4 + (+m[6] || 0) * 1e3;
    return m[1] === "-" ? -ms : ms;
  }

  // ---------- RRULE ----------
  function leesRrule(s) {
    const r = {};
    String(s).split(";").forEach((deel) => {
      const i = deel.indexOf("=");
      if (i < 0) return;
      const k = deel.slice(0, i).toUpperCase().trim(), v = deel.slice(i + 1).trim();
      if (k === "FREQ" || k === "WKST") r[k] = v.toUpperCase();
      else if (k === "UNTIL") r.UNTIL = leesWallTime(v);
      else if (k === "COUNT" || k === "INTERVAL") r[k] = Math.max(1, parseInt(v, 10) || 1);
      else if (k === "BYDAY") r.BYDAY = v.toUpperCase().split(",").map((x) => { const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x.trim()); return m ? { n: m[1] ? +m[1] : 0, dag: WEEKDAGEN.indexOf(m[2]) } : null; }).filter(Boolean);
      else if (/^BY(MONTHDAY|MONTH|SETPOS|YEARDAY|WEEKNO|HOUR|MINUTE)$/.test(k)) r[k] = v.split(",").map(Number).filter((n) => !isNaN(n));
    });
    if (!r.FREQ) return null;
    return r;
  }
  // Dagen (dagnummers) in een maand die bij BYDAY passen (met ordinaal: 2MO = tweede maandag, -1FR = laatste vrijdag)
  function dagenInMaandMetByday(j, m, byday) {
    const n = dagenInMaand(j, m);
    const uit = new Set();
    for (const b of byday) {
      const lijst = [];
      for (let d = 1; d <= n; d++) if (new Date(Date.UTC(j, m, d)).getUTCDay() === b.dag) lijst.push(d);
      if (!b.n) lijst.forEach((d) => uit.add(d));
      else { const k = b.n > 0 ? lijst[b.n - 1] : lijst[lijst.length + b.n]; if (k) uit.add(k); }
    }
    return Array.from(uit).sort((a, b) => a - b);
  }

  // Alle starts (wall time ms, als UTC-getal) van een reeks binnen [vanMs, totMs] (ook wall time)
  function rolUit(start, rrule, vanMs, totMs) {
    const uit = [];
    const startMs = wallMs(start);
    const freq = rrule.FREQ, interval = rrule.INTERVAL || 1;
    const wkst = WEEKDAGEN.indexOf(rrule.WKST || "MO");
    const untilMs = rrule.UNTIL ? (rrule.UNTIL.alleenDatum ? wallMs(Object.assign({}, rrule.UNTIL, { h: 23, mi: 59, s: 59 })) : wallMs(rrule.UNTIL)) : null;
    const tijdMs = (start.h * 60 + start.mi) * 60000 + (start.s || 0) * 1000;
    const grens = Math.min(totMs, untilMs == null ? totMs : untilMs + (rrule.UNTIL && rrule.UNTIL.utc ? 14 * 36e5 : 0));
    let teller = 0, aantalGegenereerd = 0;
    const neem = (dagMs) => {
      const ms = dagMs + tijdMs;
      if (ms < startMs) return true;
      if (untilMs != null && ms > untilMs + (rrule.UNTIL && rrule.UNTIL.utc ? 14 * 36e5 : 0)) return false;
      teller++;
      if (rrule.COUNT && teller > rrule.COUNT) return false;
      if (ms >= vanMs && ms <= totMs) { uit.push(ms); if (uit.length >= MAX_VOORVALLEN_PER_REEKS) return false; }
      return true;
    };
    const pastBij = (j, m, d) => {
      if (rrule.BYMONTH && rrule.BYMONTH.length && !rrule.BYMONTH.includes(m + 1)) return false;
      if (rrule.BYMONTHDAY && rrule.BYMONTHDAY.length) {
        const n = dagenInMaand(j, m);
        if (!rrule.BYMONTHDAY.some((x) => x === d || (x < 0 && n + x + 1 === d))) return false;
      }
      return true;
    };
    const bydayDagen = (rrule.BYDAY || []).map((b) => b.dag);
    const maxStappen = 20000;
    let stappen = 0;
    if (freq === "DAILY") {
      for (let dag = Date.UTC(start.j, start.m, start.d); dag <= grens && stappen++ < maxStappen; dag += interval * DAG_MS) {
        const x = new Date(dag);
        if (!pastBij(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())) continue;
        if (bydayDagen.length && !bydayDagen.includes(x.getUTCDay())) continue;
        if (!neem(dag)) break;
      }
    } else if (freq === "WEEKLY") {
      const dagen = bydayDagen.length ? bydayDagen : [new Date(startMs).getUTCDay()];
      const startDag = Date.UTC(start.j, start.m, start.d);
      const verschuiving = (new Date(startDag).getUTCDay() - wkst + 7) % 7;
      const weekStart = startDag - verschuiving * DAG_MS;
      let klaar = false;
      for (let w = weekStart; w <= grens && !klaar && stappen++ < maxStappen; w += interval * 7 * DAG_MS) {
        const kandidaten = dagen.map((dg) => w + ((dg - wkst + 7) % 7) * DAG_MS).sort((a, b) => a - b);
        for (const dag of kandidaten) {
          const x = new Date(dag);
          if (!pastBij(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())) continue;
          if (!neem(dag)) { klaar = true; break; }
        }
      }
    } else if (freq === "MONTHLY" || freq === "YEARLY") {
      let j = start.j, m = start.m, klaar = false;
      const stapMaanden = freq === "MONTHLY" ? interval : 12 * interval;
      while (!klaar && stappen++ < maxStappen) {
        const maanden = freq === "YEARLY" && rrule.BYMONTH && rrule.BYMONTH.length ? rrule.BYMONTH.map((x) => x - 1) : [m];
        for (const mnd of maanden) {
          if (Date.UTC(j, mnd, 1) > grens) { klaar = true; break; }
          let dagen = [];
          if (rrule.BYDAY && rrule.BYDAY.length && (freq === "MONTHLY" || (rrule.BYMONTH && rrule.BYMONTH.length))) dagen = dagenInMaandMetByday(j, mnd, rrule.BYDAY);
          else if (rrule.BYDAY && rrule.BYDAY.length && freq === "YEARLY") {
            // n-de weekdag van het jaar (zeldzaam): alle passende weekdagen in het jaar
            const n = (j % 4 === 0 && (j % 100 !== 0 || j % 400 === 0)) ? 366 : 365;
            const alle = [];
            for (let dd = 0; dd < n; dd++) { const x = new Date(Date.UTC(j, 0, 1 + dd)); if (rrule.BYDAY.some((b) => b.dag === x.getUTCDay())) alle.push(x); }
            const gekozen = rrule.BYDAY.every((b) => !b.n) ? alle : rrule.BYDAY.map((b) => { const l = alle.filter((x) => x.getUTCDay() === b.dag); return b.n > 0 ? l[b.n - 1] : l[l.length + b.n]; }).filter(Boolean);
            for (const x of gekozen) { if (x.getUTCMonth() === mnd) dagen.push(x.getUTCDate()); }
            if (!rrule.BYMONTH || !rrule.BYMONTH.length) {
              // zonder BYMONTH: alle maanden van het jaar in één keer
              const perMaand = {};
              gekozen.forEach((x) => { (perMaand[x.getUTCMonth()] = perMaand[x.getUTCMonth()] || []).push(x.getUTCDate()); });
              dagen = []; Object.keys(perMaand).forEach((mm) => perMaand[mm].forEach((d) => dagen.push({ mm: +mm, d })));
            }
          } else if (rrule.BYMONTHDAY && rrule.BYMONTHDAY.length) {
            const n = dagenInMaand(j, mnd);
            dagen = rrule.BYMONTHDAY.map((x) => (x < 0 ? n + x + 1 : x)).filter((d) => d >= 1 && d <= n);
          } else if (rrule.BYYEARDAY && rrule.BYYEARDAY.length && freq === "YEARLY") {
            dagen = [];
            rrule.BYYEARDAY.forEach((yd) => { const x = new Date(Date.UTC(j, 0, yd > 0 ? yd : 366 + yd + ((j % 4 === 0 && (j % 100 !== 0 || j % 400 === 0)) ? 1 : 0))); if (x.getUTCFullYear() === j) dagen.push({ mm: x.getUTCMonth(), d: x.getUTCDate() }); });
          } else {
            dagen = start.d <= dagenInMaand(j, mnd) ? [start.d] : [];
          }
          let kandidaten = dagen.map((d) => (typeof d === "object" ? Date.UTC(j, d.mm, d.d) : Date.UTC(j, mnd, d))).sort((a, b) => a - b);
          if (rrule.BYSETPOS && rrule.BYSETPOS.length) kandidaten = rrule.BYSETPOS.map((p) => (p > 0 ? kandidaten[p - 1] : kandidaten[kandidaten.length + p])).filter((x) => x != null).sort((a, b) => a - b);
          for (const dag of kandidaten) {
            const x = new Date(dag);
            if (freq === "MONTHLY" && !pastBij(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())) continue;
            if (!neem(dag)) { klaar = true; break; }
          }
          if (klaar) break;
          if (freq === "YEARLY" && (!rrule.BYMONTH || !rrule.BYMONTH.length)) break;
        }
        m += stapMaanden;
        while (m > 11) { m -= 12; j++; }
        aantalGegenereerd++;
        if (j > 2100) break;
      }
    } else {
      // SECONDLY/MINUTELY/HOURLY: niet ondersteund → alleen de eerste
      if (startMs >= vanMs && startMs <= totMs) uit.push(startMs);
    }
    return uit;
  }

  // ---------- VEVENT → voorvallen ----------
  function hashSleutel(s) {
    // twee 32-bits FNV-1a-hashes → 16 hex-tekens (stabiel, geen bibliotheek nodig)
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x7f4a7c15;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= c; h2 = Math.imul(h2, 0x27d4eb2f) >>> 0; h2 ^= h2 >>> 15;
    }
    return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
  }

  function leesDatumProp(prop, zones, fallbackTzid) {
    if (!prop) return null;
    const w = leesWallTime(prop.waarde);
    if (!w) return null;
    const tzid = prop.params.TZID || (w.utc ? null : fallbackTzid);
    const zweeft = !w.utc && !tzid;
    return { w, tzid, offsetFn: w.utc ? null : (tzid ? zones.offsetVoor(tzid) : zones.doel), zweeft };
  }

  function voorvallenVan(ev, zones, venster, meldingen) {
    const uid = tekstVan(ev, "UID") || "zonder-uid-" + hashSleutel(tekstVan(ev, "SUMMARY") + (eerste(ev, "DTSTART") || {}).waarde);
    const status = tekstVan(ev, "STATUS").toUpperCase();
    const geannuleerd = status === "CANCELLED";
    const startProp = eerste(ev, "DTSTART");
    const start = leesDatumProp(startProp, zones);
    if (!start) { meldingen.push("Afspraak zonder geldige begindatum overgeslagen (" + (tekstVan(ev, "SUMMARY") || uid).slice(0, 40) + ")"); return []; }
    if (start.offsetFn && start.offsetFn.onbekend) meldingen.push("Onbekende tijdzone '" + start.tzid + "': tijden zijn als Nederlandse tijd gelezen");
    const heledag = start.w.alleenDatum;
    const eindProp = eerste(ev, "DTEND");
    const duurProp = eerste(ev, "DURATION");
    let duurMs;
    if (eindProp) {
      const e = leesDatumProp(eindProp, zones, start.tzid);
      duurMs = e ? naarUtc(e.w, e.offsetFn) - naarUtc(start.w, start.offsetFn) : null;
      if (heledag && e && e.w.alleenDatum) duurMs = wallMs(e.w) - wallMs(start.w);
    } else if (duurProp) duurMs = leesDuur(duurProp.waarde);
    if (duurMs == null || isNaN(duurMs)) duurMs = heledag ? DAG_MS : 0;
    if (duurMs < 0) duurMs = 0;

    const titel = tekstVan(ev, "SUMMARY");
    const locatie = tekstVan(ev, "LOCATION");
    const omschrijving = tekstVan(ev, "DESCRIPTION");
    const transp = tekstVan(ev, "TRANSP").toUpperCase();
    const bezetStatus = tekstVan(ev, "X-MICROSOFT-CDO-BUSYSTATUS").toUpperCase();
    const bezet = transp !== "TRANSPARENT" && bezetStatus !== "FREE";
    const recId = eerste(ev, "RECURRENCE-ID");
    const rruleTekst = tekstVan(ev, "RRULE");
    const rrule = rruleTekst ? leesRrule(rruleTekst) : null;

    // Sleutel van een voorval: uid + de oorspronkelijke start (UTC-ISO, of datum bij hele dag)
    const sleutelVan = (w, offsetFn) => uid + "|" + (w.alleenDatum ? isoDatum(w.j, w.m, w.d) : new Date(naarUtc(w, offsetFn)).toISOString().slice(0, 16));

    const maak = (startW, origineelW, origineelOffset) => {
      const sleutel = sleutelVan(origineelW, origineelOffset);
      const items = [];
      if (heledag) {
        const dagen = Math.max(1, Math.min(31, Math.round(duurMs / DAG_MS)));
        for (let i = 0; i < dagen; i++) {
          const d = new Date(Date.UTC(startW.j, startW.m, startW.d + i));
          items.push({ sleutel: sleutel + (i ? "#" + i : ""), uid, titel, locatie, omschrijving, datum: isoDatum(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), tijd: null, eind: null, heledag: true, bezet, geannuleerd, dagVan: i + 1, dagen });
        }
        return items;
      }
      const utc = naarUtc(startW, start.offsetFn);
      const b = naarDoel(utc, zones);
      const e = naarDoel(utc + duurMs, zones);
      let eind = e.tijd;
      if (duurMs === 0) eind = null;
      else if (e.ms - b.ms > DAG_MS) {
        // Langer dan 24 uur met tijd: elke dag een heledag-item
        const dagen = Math.min(31, Math.ceil((e.ms - b.ms) / DAG_MS) + 1);
        for (let i = 0; i < dagen; i++) {
          const d = new Date(b.ms + i * DAG_MS);
          const datum = isoDatum(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
          if (datum > e.datum || (datum === e.datum && e.tijd === "00:00")) break;
          items.push({ sleutel: sleutel + (i ? "#" + i : ""), uid, titel, locatie, omschrijving, datum, tijd: i === 0 ? b.tijd : null, eind: datum === e.datum ? e.tijd : null, heledag: i !== 0, bezet, geannuleerd });
        }
        return items;
      } else if (e.datum !== b.datum && e.tijd === "00:00") eind = "00:00";   // eindigt precies om middernacht
      if (eind === b.tijd && e.datum === b.datum) eind = null;
      items.push({ sleutel, uid, titel, locatie, omschrijving, datum: b.datum, tijd: b.tijd, eind, heledag: false, bezet, geannuleerd });
      return items;
    };

    // Uitzondering op een reeks (RECURRENCE-ID): één voorval, vervangt het gegenereerde
    if (recId) {
      const r = leesDatumProp(recId, zones, start.tzid);
      if (!r) return [];
      return maak(start.w, r.w, r.offsetFn).map((x) => Object.assign(x, { uitzondering: true, bereik: (recId.params.RANGE || "").toUpperCase() }));
    }
    const heeftRdate = !!(ev.props.RDATE && ev.props.RDATE.length);
    if (!rrule && !heeftRdate) return maak(start.w, start.w, start.offsetFn);

    // Reeks: uitrollen binnen het venster (in wall time van de reeks zelf)
    const vanLokaal = venster.vanMs + (start.offsetFn ? start.offsetFn(venster.vanMs) : 0) * 60000 - DAG_MS;
    const totLokaal = venster.totMs + (start.offsetFn ? start.offsetFn(venster.totMs) : 0) * 60000 + DAG_MS;
    const exdates = new Set();
    (ev.props.EXDATE || []).forEach((p) => p.waarde.split(",").forEach((v) => {
      const w = leesWallTime(v);
      if (!w) return;
      const tz = p.params.TZID || start.tzid;
      const fn = w.utc ? null : (tz ? zones.offsetVoor(tz) : zones.doel);
      exdates.add(w.alleenDatum ? isoDatum(w.j, w.m, w.d) : new Date(naarUtc(w, fn)).toISOString().slice(0, 16));
    }));
    const starts = rrule ? rolUit(start.w, rrule, vanLokaal, totLokaal) : [wallMs(start.w)];
    (ev.props.RDATE || []).forEach((p) => p.waarde.split(",").forEach((v) => {
      const w = leesWallTime(v.split("/")[0]);
      if (w) starts.push(wallMs(Object.assign(w, w.alleenDatum ? { h: start.w.h, mi: start.w.mi } : {})));
    }));
    const uit = [];
    const gezien = new Set();
    for (const ms of starts.sort((a, b) => a - b)) {
      const d = new Date(ms);
      const w = { j: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: 0, utc: !!start.w.utc, alleenDatum: heledag };
      const sl = heledag ? isoDatum(w.j, w.m, w.d) : new Date(naarUtc(w, start.offsetFn)).toISOString().slice(0, 16);
      if (exdates.has(sl) || exdates.has(isoDatum(w.j, w.m, w.d)) && heledag) continue;
      if (gezien.has(sl)) continue;
      gezien.add(sl);
      // alleen binnen het echte venster (UTC)
      const utc = heledag ? wallMs(w) : naarUtc(w, start.offsetFn);
      if (utc < venster.vanMs - DAG_MS || utc > venster.totMs + DAG_MS) continue;
      uit.push(...maak(w, w, start.offsetFn));
    }
    return uit;
  }

  // ---------- hoofdfunctie ----------
  // opties: { doelZone, van (Date), tot (Date) }
  function lees(tekst, opties) {
    const o = opties || {};
    const doelZone = o.doelZone || "Europe/Amsterdam";
    const nu = o.nu ? new Date(o.nu) : new Date();
    const van = o.van ? new Date(o.van) : new Date(nu.getTime() - 30 * DAG_MS);
    const tot = o.tot ? new Date(o.tot) : new Date(nu.getTime() + 400 * DAG_MS);
    const venster = { vanMs: van.getTime(), totMs: tot.getTime() };
    const meldingen = [];
    const wortel = ontleedComponenten(tekst);
    const kalenders = wortel.kinderen.filter((c) => c.naam === "VCALENDAR");
    if (!kalenders.length) return { ok: false, fout: "Dit is geen agendabestand (geen BEGIN:VCALENDAR gevonden).", voorvallen: [], meldingen };
    const zones = maakZones(wortel, doelZone);
    const naam = tekstVan(kalenders[0], "X-WR-CALNAME") || tekstVan(kalenders[0], "NAME") || "";
    const bronZone = tekstVan(kalenders[0], "X-WR-TIMEZONE");
    const events = [];
    kalenders.forEach((k) => k.kinderen.forEach((c) => { if (c.naam === "VEVENT") events.push(c); }));
    // Zwevende tijden (zonder TZID/Z) horen in de X-WR-TIMEZONE van het bestand, als die er is
    if (bronZone && zoneBestaat(bronZone)) {
      const bronOffset = (ms) => intlOffset(bronZone, ms);
      events.forEach((ev) => ["DTSTART", "DTEND", "RECURRENCE-ID"].forEach((n) => (ev.props[n] || []).forEach((p) => { if (!p.params.TZID && !/Z$/.test(p.waarde) && /T/.test(p.waarde)) p.params.TZID = bronZone; })));
      zones.offsetVoor(bronZone) || null;
      void bronOffset;
    }
    const perSleutel = new Map();
    const geannuleerdeReeksen = new Set();
    let totaal = 0, afgekapt = false;
    // Eerst de reeksen en losse afspraken, daarna de uitzonderingen (die overschrijven)
    const gewoon = events.filter((e) => !eerste(e, "RECURRENCE-ID"));
    const uitzonderingen = events.filter((e) => eerste(e, "RECURRENCE-ID"));
    for (const ev of gewoon) {
      const lijst = voorvallenVan(ev, zones, venster, meldingen);
      const uid = lijst[0] ? lijst[0].uid : null;
      if (uid && lijst.length && lijst[0].geannuleerd && tekstVan(ev, "RRULE")) geannuleerdeReeksen.add(uid);
      for (const v of lijst) {
        if (totaal >= MAX_TOTAAL) { afgekapt = true; break; }
        perSleutel.set(v.sleutel, v); totaal++;
      }
    }
    for (const ev of uitzonderingen) {
      for (const v of voorvallenVan(ev, zones, venster, meldingen)) {
        if (v.bereik === "THISANDFUTURE") {
          // alles vanaf dit voorval van dezelfde reeks weg, en dit voorval ernaast
          for (const [k, x] of perSleutel) if (x.uid === v.uid && k >= v.sleutel && !x.uitzondering) perSleutel.delete(k);
        }
        perSleutel.set(v.sleutel, v);
      }
    }
    const voorvallen = [];
    for (const v of perSleutel.values()) {
      if (v.geannuleerd || geannuleerdeReeksen.has(v.uid)) continue;
      if (v.datum < isoDatumVanDate(van) || v.datum > isoDatumVanDate(tot)) continue;
      voorvallen.push(v);
    }
    voorvallen.sort((a, b) => a.datum.localeCompare(b.datum) || (a.tijd || "").localeCompare(b.tijd || "") || a.sleutel.localeCompare(b.sleutel));
    if (afgekapt) meldingen.push("Meer dan " + MAX_TOTAAL + " afspraken: de rest is niet meegenomen.");
    return { ok: true, naam, aantalAfspraken: events.length, voorvallen, meldingen: Array.from(new Set(meldingen)).slice(0, 10) };
  }
  function isoDatumVanDate(d) { return isoDatum(d.getFullYear(), d.getMonth(), d.getDate()); }

  // Voorval → Digigenda-opdracht. bron = id van de import; alleenBezet = geen titels/locaties bewaren.
  function naarOpdracht(v, bron, agenda, alleenBezet) {
    const id = "i" + hashSleutel(bron + "|" + v.sleutel) + hashSleutel(v.sleutel + "|" + bron).slice(0, 6);
    const titel = alleenBezet ? (agenda === "werk" ? "Werk" : "Bezet") : (v.titel || "(zonder titel)").replace(/\s+/g, " ").slice(0, 80);
    const notitie = alleenBezet ? "" : [v.locatie ? "📍 " + v.locatie : "", v.omschrijving || ""].filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").slice(0, 400);
    return { id, titel, datum: v.datum, tijd: v.tijd, eind: v.eind, soort: "afspraak", agenda: agenda || "werk", notitie, klaar: false, bron };
  }

  const api = { lees, naarOpdracht, leesRrule, rolUit, leesWallTime, hashSleutel, WINDOWS_ZONES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof globalThis !== "undefined") globalThis.ICS = api;
})();
