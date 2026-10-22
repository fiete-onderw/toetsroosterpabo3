/*
  Digigenda
  - Vaste toetsen, periodes en vakanties (HAN Pabo 3) komen uit toetsen.js en zijn optioneel.
  - Agenda's: school, werk en persoonlijk. Je kiest er één of meer bij het startscherm.
  - Snelle invoer: parse.js zet een regel als "morgen 14:00 tandarts #prive" om.
  - Zonder account: opdrachten in localStorage (alleen deze browser).
  - Met account: online in Supabase (cloud.js), met een kopie in de browser voor offline gebruik.
*/
(function () {
  "use strict";

  const P = window.PLANNING;
  const OPSLAG = "pabo3-kalender-opdrachten-v1";
  const OUDE_VOORKEUR = "pabo3-kalender-voorkeur-v1";
  const VOORKEUR = "digigenda-voorkeur-v1";
  const INST = "digigenda-instellingen-v1";
  const SESSIE = "pabo3-kalender-sessie-v1";
  const CACHE = "pabo3-kalender-cache-v1:";
  const WACHT = "pabo3-kalender-wacht-v1:";

  const AGENDAS = ["school", "werk", "persoonlijk"];
  const AGENDA_NAAM = { school: "School", werk: "Werk", persoonlijk: "Persoonlijk" };
  const AGENDA_UITLEG = { school: "Opdrachten, deadlines en toetsen", werk: "Diensten, taken en afspraken", persoonlijk: "Afspraken, verjaardagen en de rest" };
  const SOORTEN = ["opdracht", "deadline", "toets", "herkansing", "afspraak", "overig"];
  const SOORT_LABEL = { opdracht: "Opdracht", deadline: "Deadline", toets: "Toets", herkansing: "Herkansing", afspraak: "Afspraak", overig: "Overig" };
  const VAST_LABEL = { lkt: "Landelijke kennistoets", toets: "Cursustoets", periode: "Periode" };
  const DG_LABEL = { alle: "JK + OK", jk: "Jongere kind", ok: "Oudere kind" };
  const WEERGAVEN = ["maand", "week", "dag", "lijst"];

  const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const DAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"];
  const DAGEN_LANG = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
  const DAGEN_KORT_ZO = ["zo", "ma", "di", "wo", "do", "vr", "za"];

  // ---------- hulpfuncties ----------
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const ontleed = (s) => { const [j, m, d] = s.split("-").map(Number); return new Date(j, m - 1, d); };
  const vandaag = () => iso(new Date());
  const plusDagen = (s, n) => { const d = ontleed(s); d.setDate(d.getDate() + n); return iso(d); };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hoofd = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const kortDatum = (s) => { const d = ontleed(s); return d.getDate() + " " + KORT[d.getMonth()]; };
  const dagKort = (s) => { const d = ontleed(s); return DAGEN_KORT_ZO[d.getDay()] + " " + d.getDate() + " " + KORT[d.getMonth()]; };
  const langDatum = (s) => { const d = ontleed(s); return DAGEN_LANG[d.getDay()] + " " + d.getDate() + " " + MAANDEN[d.getMonth()] + " " + d.getFullYear(); };
  const dagTitel = (s) => { const d = ontleed(s); return hoofd(DAGEN_LANG[d.getDay()]) + " " + d.getDate() + " " + MAANDEN[d.getMonth()]; };
  const agendaKleur = (a) => "var(--ag-" + (AGENDAS.includes(a) ? a : "school") + ")";
  const vastKleur = (soort) => "var(--" + soort + ")";
  const maandagVan = (s) => { const d = ontleed(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
  const minuten = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const klok = (m) => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
  const nuMinuten = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const duurTekst = (m) => m < 60 ? m + " min" : Math.floor(m / 60) + " u" + (m % 60 ? " " + (m % 60) + " min" : "");
  // Zonder begintijd = to-do (afvinkbaar). Met begintijd = blok in de agenda.
  const isTodo = (o) => !o.tijd;
  const tijdTekst = (o) => o.tijd ? o.tijd + (o.eind ? "–" + o.eind : "") : (o.eind ? "tot " + o.eind : "");

  function weeknummer(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dag = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dag);
    const begin = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - begin) / 864e5 + 1) / 7);
  }

  let opslagWerkt = true;
  function laad(sleutel, standaard) {
    try { const v = localStorage.getItem(sleutel); return v ? JSON.parse(v) : standaard; }
    catch (e) { opslagWerkt = false; return standaard; }
  }
  function bewaar(sleutel, waarde) {
    try { localStorage.setItem(sleutel, JSON.stringify(waarde)); return true; }
    catch (e) { opslagWerkt = false; return false; }
  }
  function weg(sleutel) { try { localStorage.removeItem(sleutel); } catch (e) { /* niets */ } }

  const TIJD = /^([01]\d|2[0-3]):[0-5]\d$/;
  function normaal(o) {
    if (!o || typeof o.titel !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.datum || "")) return null;
    const tijd = TIJD.test(o.tijd || "") ? o.tijd : null;
    let eind = TIJD.test(o.eind || "") ? o.eind : null;
    if (tijd && eind && eind <= tijd) eind = null;
    return {
      id: String(o.id || nieuwId()).slice(0, 40),
      titel: o.titel.slice(0, 80),
      datum: o.datum,
      tijd,
      eind,
      soort: SOORTEN.includes(o.soort) ? o.soort : "opdracht",
      agenda: AGENDAS.includes(o.agenda) ? o.agenda : "school",
      notitie: String(o.notitie || "").slice(0, 400),
      klaar: !!o.klaar
    };
  }
  const normaleLijst = (l) => (Array.isArray(l) ? l : []).map(normaal).filter(Boolean);
  function nieuwId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---------- instellingen en voorkeuren ----------
  function normaleInstellingen(i, oud) {
    const x = i && typeof i === "object" ? i : {};
    let agendas = Array.isArray(x.agendas) ? x.agendas.filter((a) => AGENDAS.includes(a)) : [];
    if (!agendas.length) agendas = ["school"];
    return {
      agendas: AGENDAS.filter((a) => agendas.includes(a)),
      pabo: typeof x.pabo === "boolean" ? x.pabo : true,
      doelgroep: ["alle", "jk", "ok"].includes(x.doelgroep) ? x.doelgroep : (oud && ["alle", "jk", "ok"].includes(oud.doelgroep) ? oud.doelgroep : "alle"),
      welkom: !!x.welkom,
      meldingen: {
        ochtend: !(x.meldingen && x.meldingen.ochtend === false),
        afspraak: !(x.meldingen && x.meldingen.afspraak === false)
      }
    };
  }
  let instellingen = normaleInstellingen(laad(INST, null), laad(OUDE_VOORKEUR, null));
  let voorkeur = laad(VOORKEUR, null);
  if (!voorkeur || typeof voorkeur !== "object") voorkeur = {};
  if (!Array.isArray(voorkeur.verborgen)) voorkeur.verborgen = [];
  // Startscherm: telefoon opent op Vandaag (dag), laptop op de maand
  const telefoon = () => !!(window.matchMedia && window.matchMedia("(max-width: 640px)").matches);
  const smalScherm = () => !!(window.matchMedia && window.matchMedia("(max-width: 760px)").matches);
  voorkeur.weergave = telefoon() ? "dag" : "maand";
  let weekendTonen = false;
  const bewaarVoorkeur = () => bewaar(VOORKEUR, voorkeur);

  // ---------- sessie en opdrachten ----------
  let sessie = laad(SESSIE, null);
  if (!sessie || typeof sessie.token !== "string" || typeof sessie.naam !== "string") sessie = null;
  if (!window.CLOUD || !CLOUD.aan) sessie = null;
  let ontgrendeld = !!sessie && !sessie.faceid;
  const actief = () => !!sessie && ontgrendeld;

  let opdrachten = [];
  function laadEigen() {
    if (actief()) opdrachten = normaleLijst(laad(CACHE + sessie.naam, []));
    else if (sessie) opdrachten = [];
    else opdrachten = normaleLijst(laad(OPSLAG, []));
  }
  laadEigen();

  const nu = new Date();
  let maand = { j: nu.getFullYear(), m: nu.getMonth() };
  let gekozen = vandaag();
  let bewerkId = null;

  // ---------- wat is zichtbaar ----------
  const agendaAan = (a) => instellingen.agendas.includes(a);
  const agendaZichtbaar = (a) => agendaAan(a) && !voorkeur.verborgen.includes(a);
  const zichtbaar = (o) => agendaZichtbaar(o.agenda);
  const paboAan = () => instellingen.pabo && agendaAan("school");
  const paboZichtbaar = () => paboAan() && agendaZichtbaar("school");
  const pastBij = (dg) => !dg || dg === "alle" || instellingen.doelgroep === "alle" || dg === instellingen.doelgroep;
  const vakantieOp = (s) => paboZichtbaar() ? P.vakanties.find((v) => s >= v.start && s <= v.eind) : null;
  const periodeOp = (s) => paboAan() ? P.periodes.find((p) => s >= p.start && s <= p.eind) : null;

  function vastOp(s) {
    if (!paboZichtbaar()) return [];
    const uit = [];
    P.periodes.forEach((p) => { if (p.start === s) uit.push({ titel: "Start " + p.naam, soort: "periode", uitleg: p.uitleg || "" }); });
    P.toetsen.forEach((t) => { if (t.datum === s && pastBij(t.doelgroep)) uit.push(t); });
    return uit;
  }
  const opVolgorde = (a, b) => (a.datum.localeCompare(b.datum)) || ((a.tijd || "").localeCompare(b.tijd || ""));
  const eigenOp = (s) => opdrachten.filter((o) => o.datum === s && zichtbaar(o)).sort(opVolgorde);
  const nogOpen = () => { const v = vandaag(); return opdrachten.filter((o) => isTodo(o) && !o.klaar && o.datum < v && zichtbaar(o)).sort(opVolgorde); };

  // ---------- kop, filters, tabs ----------
  function tekenKop() {
    $("ondertitel").textContent = paboAan() ? "HAN Pabo 3 · studiejaar " + P.schooljaar : "School, werk en privé in één agenda";
    const k = $("accountKnop");
    if (!window.CLOUD || !CLOUD.aan) { k.hidden = true; return; }
    k.hidden = false;
    if (actief()) { k.textContent = sessie.naam; k.setAttribute("aria-label", "Account: " + sessie.naam); }
    else if (sessie) { k.textContent = "Vergrendeld"; k.removeAttribute("aria-label"); }
    else { k.textContent = "Inloggen"; k.removeAttribute("aria-label"); }
  }

  function tekenTabs() {
    const w = voorkeur.weergave;
    document.querySelectorAll("[data-weergave]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.weergave === w)));
    const onder = w === "dag" || w === "week" ? "vandaag" : w;
    document.querySelectorAll("[data-onder]").forEach((b) => {
      if (b.dataset.onder === onder) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    $("layout").classList.toggle("enkel", voorkeur.weergave !== "maand");
    $("zij").hidden = voorkeur.weergave !== "maand";
    $("jaarstrook").hidden = !(voorkeur.weergave === "maand" && paboAan());
  }

  function tekenFilters() {
    const el = $("agendaFilters");
    if (instellingen.agendas.length < 2) { el.innerHTML = ""; return; }
    el.innerHTML = instellingen.agendas.map((a) => {
      const aan = !voorkeur.verborgen.includes(a);
      return '<button type="button" class="filter" data-filter="' + a + '" aria-pressed="' + aan + '" style="--c:' + agendaKleur(a) + '"><i></i>' + AGENDA_NAAM[a] + "</button>";
    }).join("");
  }

  function tekenSnelAgenda() {
    const sel = $("snelAgenda");
    const lijst = instellingen.agendas;
    if (!lijst.includes(voorkeur.snelAgenda)) voorkeur.snelAgenda = lijst[0];
    sel.innerHTML = lijst.map((a) => '<option value="' + a + '"' + (a === voorkeur.snelAgenda ? " selected" : "") + ">" + AGENDA_NAAM[a] + "</option>").join("");
    sel.hidden = lijst.length < 2;
    sel.style.setProperty("--c", agendaKleur(voorkeur.snelAgenda));
  }

  // ---------- jaarstrook (alleen met Pabo-toetsrooster) ----------
  function maandenVanJaar() {
    const start = ontleed(P.periodes[0].start);
    start.setDate(start.getDate() + 1);
    const lijst = [];
    for (let i = 0; i < 11; i++) lijst.push({ j: start.getFullYear() + Math.floor((start.getMonth() + i) / 12), m: (start.getMonth() + i) % 12 });
    return lijst;
  }
  function tekenJaarstrook() {
    if ($("jaarstrook").hidden) return;
    $("jaarstrook").innerHTML = maandenVanJaar().map((mm) => {
      const prefix = mm.j + "-" + pad(mm.m + 1);
      const p = P.periodes.find((x) => prefix + "-15" >= x.start && prefix + "-15" <= x.eind);
      const stippen = [];
      if (paboZichtbaar()) P.toetsen.forEach((t) => { if (t.datum.startsWith(prefix) && pastBij(t.doelgroep)) stippen.push(vastKleur(t.soort)); });
      opdrachten.forEach((o) => { if (o.datum.startsWith(prefix) && !o.klaar && zichtbaar(o)) stippen.push(agendaKleur(o.agenda)); });
      const actiefM = mm.j === maand.j && mm.m === maand.m;
      return '<button type="button" data-j="' + mm.j + '" data-m="' + mm.m + '"' + (actiefM ? ' aria-current="true"' : "") + ">" +
        '<span class="m">' + KORT[mm.m] + "</span>" +
        '<span class="p">' + (p ? p.kort : "–") + "</span>" +
        '<span class="stippen">' + stippen.slice(0, 5).map((c) => '<i style="background:' + c + '"></i>').join("") + "</span></button>";
    }).join("");
  }

  // ---------- gedeelde stukjes ----------
  function slot() {
    return '<svg class="slot" viewBox="0 0 10 10" aria-label="vast"><rect x="1.5" y="4.5" width="7" height="5" rx="1" fill="currentColor"/><path d="M3 4.5V3a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
  }
  const vinkSvg = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function schuifLabel(o) {
    const v = vandaag();
    if (o.datum < v) return "→ vandaag";
    if (o.datum === v) return "→ morgen";
    return "→ dag later";
  }

  // Eén regel in de dag-, lijst- en zijweergave. To-do's hebben een vinkje, blokken (met tijd) een tijdstip.
  function rij(o, metDatum) {
    const blok = !isTodo(o);
    const klaar = !blok && o.klaar;
    const meta = [];
    if (metDatum) meta.push(dagKort(o.datum));
    if (instellingen.agendas.length > 1) meta.push(AGENDA_NAAM[o.agenda]);
    if (o.soort !== "opdracht") meta.push(SOORT_LABEL[o.soort]);
    if (!blok && o.eind) meta.push("tot " + o.eind);
    const links = blok
      ? '<span class="tijdstip" aria-label="' + esc(tijdTekst(o)) + '">' + o.tijd + (o.eind ? "<small>" + o.eind + "</small>" : "") + "</span>"
      : '<button type="button" class="vink" data-klaar="' + esc(o.id) + '" aria-pressed="' + klaar + '" aria-label="' + (klaar ? "Weer openzetten: " : "Afvinken: ") + esc(o.titel) + '">' + vinkSvg + "</button>";
    return '<li class="rij' + (klaar ? " klaar" : "") + (blok ? " blokrij" : "") + '" style="--c:' + agendaKleur(o.agenda) + '">' + links +
      '<div class="rij-tekst">' +
      '<span class="rij-titel">' + esc(o.titel) + "</span>" +
      (meta.length ? '<span class="rij-meta">' + esc(meta.join(" · ")) + "</span>" : "") +
      (o.notitie ? '<p class="rij-notitie">' + esc(o.notitie) + "</p>" : "") +
      "</div>" +
      '<div class="rij-acties">' +
      (!blok && !o.klaar ? '<button type="button" class="mini" data-schuif="' + esc(o.id) + '">' + schuifLabel(o) + "</button>" : "") +
      '<button type="button" class="mini" data-bewerk="' + esc(o.id) + '">Wijzig</button></div></li>';
  }

  function vastRij(v) {
    return '<li class="rij vast" style="--c:' + vastKleur(v.soort) + '"><span class="vast-blok">' + slot() + "</span>" +
      '<div class="rij-tekst"><span class="rij-titel">' + esc(v.titel) + '</span><span class="rij-meta">' + esc(VAST_LABEL[v.soort] || "") + "</span>" +
      (v.uitleg ? '<p class="rij-notitie">' + esc(v.uitleg) + "</p>" : "") + "</div></li>";
  }

  function navBalk(titel, extra, kort) {
    const kop = kort ? '<span class="lang">' + esc(titel) + '</span><span class="kort" aria-hidden="true">' + esc(kort) + "</span>" : esc(titel);
    return '<div class="balk">' +
      '<button type="button" class="pijl" data-nav="-1" aria-label="Vorige">‹</button>' +
      "<h2>" + kop + "</h2>" +
      '<button type="button" class="pijl" data-nav="1" aria-label="Volgende">›</button>' +
      '<button type="button" class="zacht" data-nav="0">' + (extra || "Vandaag") + "</button>" +
      "</div>";
  }

  // ---------- maandweergave ----------
  function tekenMaand() {
    const eerste = new Date(maand.j, maand.m, 1);
    const verschuiving = (eerste.getDay() + 6) % 7;
    const dagenInMaand = new Date(maand.j, maand.m + 1, 0).getDate();
    const weken = Math.ceil((verschuiving + dagenInMaand) / 7);
    const vs = vandaag();

    let html = '<div class="dagnaam" aria-hidden="true">wk</div>' + DAGEN.map((d) => '<div class="dagnaam" role="columnheader">' + d + "</div>").join("");
    for (let w = 0; w < weken; w++) {
      const maandag = new Date(maand.j, maand.m, 1 - verschuiving + w * 7);
      html += '<div class="wk" aria-hidden="true">' + weeknummer(maandag) + "</div>";
      for (let i = 0; i < 7; i++) {
        const d = new Date(maand.j, maand.m, 1 - verschuiving + w * 7 + i);
        const s = iso(d);
        const vak = vakantieOp(s);
        const klassen = ["dag"];
        if (i >= 5) klassen.push("weekend");
        if (d.getMonth() !== maand.m) klassen.push("buiten");
        if (vak) klassen.push("vakantie");
        if (s === vs) klassen.push("vandaag");
        if (s === gekozen) klassen.push("gekozen");
        const vast = vastOp(s);
        const eigen = eigenOp(s);
        const max = 3;
        let chips = "", aantal = 0;
        vast.forEach((v) => {
          if (aantal++ < max) chips += '<div class="chip vast" style="--c:' + vastKleur(v.soort) + '" title="' + esc(v.titel) + '">' + slot() + "<span>" + esc(v.titel) + "</span></div>";
        });
        eigen.forEach((o) => {
          if (aantal++ < max) chips += '<button type="button" class="chip eigen' + (isTodo(o) && o.klaar ? " klaar" : "") + (o.soort !== "opdracht" ? " nadruk" : "") + (isTodo(o) ? "" : " getimed") + '" data-id="' + esc(o.id) + '" style="--c:' + agendaKleur(o.agenda) + '" title="' + esc((tijdTekst(o) ? tijdTekst(o) + " " : "") + o.titel) + '">' + (o.tijd ? "<b>" + o.tijd + "</b>" : "") + "<span>" + esc(o.titel) + "</span></button>";
        });
        if (aantal > max) chips += '<span class="meer">+' + (aantal - max) + " meer</span>";
        const vakLabel = vak && (s === vak.start || d.getDate() === 1 || i === 0) ? '<span class="vaklabel">' + esc(vak.naam) + "</span>" : "";
        html += '<div class="' + klassen.join(" ") + '" role="gridcell" tabindex="0" data-datum="' + s + '" aria-label="' + langDatum(s) + (vast.length + eigen.length ? ", " + (vast.length + eigen.length) + " items" : "") + '">' +
          '<span class="nr">' + d.getDate() + "</span>" + vakLabel + chips + "</div>";
      }
    }

    const legenda = instellingen.agendas.map((a) => '<li><i style="background:' + agendaKleur(a) + '"></i>' + AGENDA_NAAM[a] + "</li>").join("") +
      (paboZichtbaar() ? '<li><i class="kl-lkt"></i>Landelijke kennistoets</li><li><i class="kl-toets"></i>Cursustoets</li><li><i class="kl-periode"></i>Start periode</li><li><i class="kl-vakantie"></i>Vakantie</li>' : "");

    $("hoofd").innerHTML = navBalk(hoofd(MAANDEN[maand.m]) + " " + maand.j) +
      '<div class="grid-scroll"><div class="grid" id="grid" role="grid">' + html + "</div></div>" +
      '<ul class="legenda" aria-label="Legenda">' + legenda + "</ul>";
  }

  // ---------- tijdblokken (dag en week) ----------
  const UUR_BEGIN = 7, UUR_EIND = 22;

  // Zet afspraken om in blokken met kolommen, zodat afspraken die overlappen naast elkaar staan
  function blokkenVan(lijst) {
    const blokken = lijst.filter((o) => o.tijd).map((o) => {
      const s = minuten(o.tijd);
      let e = o.eind ? minuten(o.eind) : s + 60;
      if (e <= s) e = s + 60;
      e = Math.min(e, 24 * 60);
      return { o, s, e, ev: Math.min(24 * 60, Math.max(e, s + 30)) };
    }).sort((a, b) => a.s - b.s || b.ev - a.ev);
    let groep = [], groepEind = -1;
    const sluit = () => { const n = groep.reduce((m, x) => Math.max(m, x.kol + 1), 1); groep.forEach((x) => { x.n = n; }); groep = []; groepEind = -1; };
    blokken.forEach((x) => {
      if (groep.length && x.s >= groepEind) sluit();
      const bezet = [];
      groep.forEach((y) => { if (y.ev > x.s) bezet[y.kol] = true; });
      let k = 0;
      while (bezet[k]) k++;
      x.kol = k;
      groep.push(x);
      groepEind = Math.max(groepEind, x.ev);
    });
    if (groep.length) sluit();
    return blokken;
  }
  function urenBereik(blokken) {
    let b = UUR_BEGIN, e = UUR_EIND;
    blokken.forEach((x) => { b = Math.min(b, Math.floor(x.s / 60)); e = Math.max(e, Math.ceil(x.ev / 60)); });
    return { b, e: Math.min(24, e) };
  }
  function blokStatus(x, datum) {
    const v = vandaag();
    if (datum < v) return " voorbij";
    if (datum > v) return "";
    const nm = nuMinuten();
    return x.e <= nm ? " voorbij" : (x.s <= nm ? " bezig" : "");
  }
  function blokHtml(x, b, datum) {
    const o = x.o;
    const hoog = (x.ev - x.s) / 60;
    const kort = x.ev - x.s < 50;
    const extra = o.soort !== "opdracht" && o.soort !== "afspraak" ? SOORT_LABEL[o.soort] : "";
    return '<button type="button" class="blok' + blokStatus(x, datum) + (kort ? " kort" : "") + (extra ? " nadruk" : "") + (x.n > 1 ? " deel" : "") + '" data-bewerk="' + esc(o.id) + '" data-s="' + x.s + '" data-e="' + x.e + '"' +
      ' aria-label="' + esc(tijdTekst(o) + " " + o.titel) + '"' +
      ' style="--c:' + agendaKleur(o.agenda) + ";top:calc(var(--uurh) * " + ((x.s - b * 60) / 60).toFixed(4) + ");height:calc(var(--uurh) * " + hoog.toFixed(4) + " - 2px);" +
      "left:calc(" + (x.kol / x.n * 100).toFixed(3) + "% + 2px);width:calc(" + (100 / x.n).toFixed(3) + '% - 4px)">' +
      '<span class="blok-tijd">' + o.tijd + (o.eind ? '<span class="tot">–' + o.eind + "</span>" : "") + "</span>" +
      '<span class="blok-titel">' + esc(o.titel) + "</span>" +
      (extra && !kort ? '<span class="blok-soort">' + esc(extra) + "</span>" : "") + "</button>";
  }
  function nuLijnHtml(b, e, metTijd) {
    const nm = nuMinuten();
    if (nm < b * 60 || nm >= e * 60) return "";
    return '<div class="nu-lijn" style="top:calc(var(--uurh) * ' + ((nm - b * 60) / 60).toFixed(4) + ')" aria-hidden="true">' + (metTijd ? "<span>" + klok(nm) + "</span>" : "") + "</div>";
  }
  function kolomHtml(d, blokken, b, e, metTijd) {
    let h = '<div class="kolom' + (d === vandaag() ? " vandaag" : "") + '" data-tijdlijn-datum="' + d + '" data-begin="' + b + '" data-eind="' + e + '"' + (metTijd ? ' data-met-tijd="1"' : "") + ">";
    for (let u = b; u < e; u++) h += '<button type="button" class="uurvak" data-slot="' + d + "|" + pad(u) + ':00" aria-label="Toevoegen op ' + dagKort(d) + " om " + pad(u) + ':00"></button>';
    h += blokken.map((x) => blokHtml(x, b, d)).join("");
    if (d === vandaag()) h += nuLijnHtml(b, e, metTijd);
    return h + "</div>";
  }
  function rasterHtml(datums, perDag, bereik, klasse, metTijd) {
    const { b, e } = bereik;
    let labels = "";
    for (let u = b; u < e; u++) labels += '<span style="top:calc(var(--uurh) * ' + (u - b) + ')">' + pad(u) + ":00</span>";
    return '<div class="raster ' + klasse + '" style="--uren:' + (e - b) + ";--dagen:" + datums.length + '">' +
      '<div class="uurlabels" aria-hidden="true">' + labels + "</div>" +
      datums.map((d, i) => kolomHtml(d, perDag[i], b, e, metTijd)).join("") + "</div>";
  }

  // Wisselknop Dag | Week (op de telefoon; op de laptop staan de tabs bovenin)
  function modusKnop() {
    const w = voorkeur.weergave;
    return '<div class="modus" role="group" aria-label="Weergave">' +
      '<button type="button" data-modus="dag" aria-pressed="' + (w === "dag") + '">Dag</button>' +
      '<button type="button" data-modus="week" aria-pressed="' + (w === "week") + '">Week</button></div>';
  }
  function groet() {
    const u = new Date().getHours();
    const g = u < 6 ? "Goedenacht" : u < 12 ? "Goedemorgen" : u < 18 ? "Goedemiddag" : "Goedenavond";
    return g + (actief() ? ", " + sessie.naam : "");
  }

  // ---------- Vandaag / dagweergave ----------
  function weekstripHtml(s) {
    const ma = maandagVan(s);
    const v = vandaag();
    let h = '<div class="weekstrip" role="group" aria-label="Kies een dag">';
    for (let i = 0; i < 7; i++) {
      const d = plusDagen(ma, i);
      const items = vastOp(d).map((x) => vastKleur(x.soort)).concat(eigenOp(d).filter((o) => !(isTodo(o) && o.klaar)).map((o) => agendaKleur(o.agenda)));
      h += '<button type="button" data-kies="' + d + '" class="ws' + (d === v ? " vandaag" : "") + (d === s ? " gekozen" : "") + (i >= 5 ? " weekend" : "") + '"' +
        (d === s ? ' aria-current="date"' : "") + ' aria-label="' + langDatum(d) + (items.length ? ", " + items.length + " items" : "") + '">' +
        '<span class="ws-d">' + DAGEN[i] + '</span><span class="ws-n">' + ontleed(d).getDate() + "</span>" +
        '<span class="ws-stip">' + items.slice(0, 3).map((c) => '<i style="background:' + c + '"></i>').join("") + "</span></button>";
    }
    return h + "</div>";
  }

  function nuKaartInhoud() {
    const v = vandaag(), nm = nuMinuten();
    const eigen = eigenOp(v);
    const blokken = blokkenVan(eigen.filter((o) => !isTodo(o)));
    const bezig = blokken.filter((x) => x.s <= nm && nm < x.e);
    const volgend = blokken.filter((x) => x.s > nm)[0];
    const open = eigen.filter((o) => isTodo(o) && !o.klaar).length;
    const regel = (label, x, sub, klasse) => '<button type="button" class="nu-regel ' + klasse + '" data-bewerk="' + esc(x.o.id) + '" style="--c:' + agendaKleur(x.o.agenda) + '">' +
      '<span class="nu-label">' + label + '</span><span class="nu-tekst"><strong>' + esc(x.o.titel) + '</strong><span class="klein">' + esc(sub) + "</span></span></button>";
    let h = "";
    bezig.forEach((x) => { h += regel("Nu", x, x.o.eind ? "tot " + x.o.eind + " · nog " + duurTekst(x.e - nm) : "begon om " + x.o.tijd, "nu"); });
    if (volgend) h += regel("Hierna", volgend, tijdTekst(volgend.o) + " · over " + duurTekst(volgend.s - nm), "hierna");
    if (!h) h = '<p class="nu-vrij"><strong>Geen afspraken meer vandaag.</strong> ' + (open ? "Tijd voor je to-do’s." : "Lekker vrij!") + "</p>";
    return h;
  }

  function tekenDag() {
    const s = gekozen;
    const v = vandaag();
    const isVandaag = s === v;
    const vak = vakantieOp(s);
    const per = periodeOp(s);
    const vast = vastOp(s);
    const eigen = eigenOp(s);
    const todos = eigen.filter(isTodo).sort((a, b) => (a.klaar - b.klaar) || opVolgorde(a, b));
    const blokken = blokkenVan(eigen.filter((o) => !isTodo(o)));
    const open = todos.filter((o) => !o.klaar).length;
    const info = [per ? per.naam : "", vak ? vak.naam : ""].filter(Boolean).join(" · ");

    let html = '<div class="dag-boven"><p class="groet">' + esc(isVandaag ? groet() : info || "") + "</p>" + modusKnop() + "</div>" +
      navBalk(dagTitel(s) + (isVandaag ? "" : " " + ontleed(s).getFullYear()), "Vandaag", hoofd(dagKort(s))) +
      (isVandaag && info ? '<p class="label dag-info">' + esc(info) + "</p>" : "") +
      weekstripHtml(s);

    html += '<div class="dagindeling">';
    if (isVandaag) html += '<section class="nu-kaart" id="nuKaart" aria-live="polite">' + nuKaartInhoud() + "</section>";

    // To-do's
    html += '<section class="dag-todo"><div class="sectie-kop"><h3>To-do' + (todos.length ? ' <span class="aantal">' + open + " open</span>" : "") + "</h3>" +
      '<button type="button" class="mini" data-nieuw="' + s + '">+ To-do</button></div>';
    if (vast.length || todos.length) html += '<ul class="rijen">' + vast.map(vastRij).join("") + todos.map((o) => rij(o, false)).join("") + "</ul>";
    else html += '<p class="leeg">Geen to-do’s. Typ hierboven bijvoorbeeld <em>“' + esc(isVandaag ? "vandaag" : DAGEN_LANG[ontleed(s).getDay()]) + ' samenvatting schrijven”</em>.</p>';
    html += "</section>";

    // Agenda met tijdblokken
    html += '<section class="dag-agenda"><div class="sectie-kop"><h3>Agenda</h3><span class="klein">' + (blokken.length ? blokken.length + (blokken.length === 1 ? " afspraak" : " afspraken") : "Tik op een uur om iets te plannen") + "</span></div>" +
      rasterHtml([s], [blokken], urenBereik(blokken), "dagraster", true) + "</section>";
    html += "</div>";
    $("hoofd").innerHTML = html;
  }

  // ---------- weekweergave met tijdblokken ----------
  function tekenWeek() {
    const ma = maandagVan(gekozen);
    const zo = plusDagen(ma, 6);
    const d1 = ontleed(ma), d2 = ontleed(zo);
    const smal = smalScherm();
    const idx = smal ? (weekendTonen ? [5, 6] : [0, 1, 2, 3, 4]) : [0, 1, 2, 3, 4, 5, 6];
    const datums = idx.map((i) => plusDagen(ma, i));
    const perDag = datums.map((d) => blokkenVan(eigenOp(d).filter((o) => !isTodo(o))));
    const bereik = urenBereik([].concat.apply([], perDag));
    const v = vandaag();
    const titel = d1.getMonth() === d2.getMonth()
      ? d1.getDate() + " – " + d2.getDate() + " " + MAANDEN[d2.getMonth()]
      : d1.getDate() + " " + KORT[d1.getMonth()] + " – " + d2.getDate() + " " + KORT[d2.getMonth()];
    const kortTitel = d1.getDate() + (d1.getMonth() === d2.getMonth() ? "" : " " + KORT[d1.getMonth()]) + "–" + d2.getDate() + " " + KORT[d2.getMonth()];

    let kop = '<div class="wk-kop" style="--dagen:' + datums.length + '"><span></span>';
    let heledag = '<div class="wk-heledag" style="--dagen:' + datums.length + '"><span class="wk-hoek">to-do</span>';
    datums.forEach((d, i) => {
      const dag = ontleed(d);
      const vak = vakantieOp(d);
      kop += '<button type="button" class="wk-dag' + (d === v ? " vandaag" : "") + (idx[i] >= 5 ? " weekend" : "") + (vak ? " vakantie" : "") + '" data-naar-dag="' + d + '" aria-label="' + langDatum(d) + ' openen">' +
        '<span class="wd">' + DAGEN[idx[i]] + '</span><span class="nr">' + dag.getDate() + "</span></button>";
      const vast = vastOp(d);
      const todos = eigenOp(d).filter(isTodo);
      heledag += '<div class="hd-cel' + (vak ? " vakantie" : "") + '">' +
        (vak && (i === 0 || d === vak.start) ? '<span class="vaklabel">' + esc(vak.naam) + "</span>" : "") +
        vast.map((x) => '<span class="hd-chip vast" style="--c:' + vastKleur(x.soort) + '" title="' + esc(x.titel) + '">' + slot() + "<span>" + esc(x.titel) + "</span></span>").join("") +
        todos.map((o) => '<button type="button" class="hd-chip' + (o.klaar ? " klaar" : "") + '" data-bewerk="' + esc(o.id) + '" style="--c:' + agendaKleur(o.agenda) + '" title="' + esc(o.titel) + '"><span>' + esc(o.titel) + "</span></button>").join("") +
        "</div>";
    });
    kop += "</div>";
    heledag += "</div>";

    let html = '<div class="dag-boven"><p class="groet"></p>' + modusKnop() + "</div>" +
      navBalk(titel + " " + d2.getFullYear() + " · week " + weeknummer(d1), "Deze week", kortTitel) +
      '<div class="weekblok">' + kop + heledag + rasterHtml(datums, perDag, bereik, "weekraster-tijd", false) + "</div>";

    if (smal) {
      const za = plusDagen(ma, 5), zon = plusDagen(ma, 6);
      const samenvatting = (d) => {
        const lijst = vastOp(d).map((x) => x.titel).concat(eigenOp(d).map((o) => (o.tijd ? o.tijd + " " : "") + o.titel));
        return lijst.length ? esc(lijst[0]) + (lijst.length > 1 ? " +" + (lijst.length - 1) : "") : "vrij";
      };
      html += weekendTonen
        ? '<button type="button" class="weekendstrook terug" data-weekend="0"><span class="ws-pijl">‹</span><span><strong>Maandag – vrijdag</strong></span></button>'
        : '<button type="button" class="weekendstrook" data-weekend="1"><span class="ws-titel">Weekend</span><span class="ws-dagen">' +
          '<span class="ws-dag"><b>za ' + ontleed(za).getDate() + "</b> " + samenvatting(za) + "</span>" +
          '<span class="ws-dag"><b>zo ' + ontleed(zon).getDate() + "</b> " + samenvatting(zon) + '</span></span><span class="ws-pijl">›</span></button>';
    }
    $("hoofd").innerHTML = html;
  }

  // ---------- lijst (alles wat eraan komt) ----------
  function tekenLijst() {
    const v = vandaag();
    const over7 = plusDagen(v, 7);
    const zicht = opdrachten.filter(zichtbaar).sort(opVolgorde);
    const nogTeDoen = (o) => !isTodo(o) || !o.klaar;
    const eerder = zicht.filter((o) => isTodo(o) && !o.klaar && o.datum < v);
    const nuDag = zicht.filter((o) => o.datum === v);
    const komend = zicht.filter((o) => nogTeDoen(o) && o.datum > v && o.datum <= over7);
    const later = zicht.filter((o) => nogTeDoen(o) && o.datum > over7);
    const af = zicht.filter((o) => isTodo(o) && o.klaar && o.datum !== v).sort((a, b) => b.datum.localeCompare(a.datum));

    const groep = (titel, lijst, extra, leeg) => '<section class="groep"><div class="groep-titel"><h3>' + titel + ' <span class="aantal">' + lijst.length + "</span></h3>" + (extra || "") + "</div>" +
      (lijst.length ? '<ul class="rijen">' + lijst.map((o) => rij(o, true)).join("") + "</ul>" : '<p class="leeg">' + (leeg || "Niets.") + "</p>") + "</section>";

    let html = '<div class="balk"><h2>Lijst</h2><span class="klein lijst-uitleg">Alles wat eraan komt</span></div>';
    if (!zicht.length) {
      html += '<p class="leeg groot-leeg">Nog niets gepland. Typ hierboven bijvoorbeeld <em>“morgen 14:00-15:00 tandarts”</em> en druk op Enter.</p>';
    } else {
      if (eerder.length) html += groep("Nog open van eerder", eerder, '<button type="button" class="mini" data-alles-vandaag>Alles naar vandaag</button>');
      html += groep("Vandaag", nuDag, "", "Niets voor vandaag.");
      html += groep("Komende 7 dagen", komend, "", "Niets gepland voor de komende week.");
      if (later.length) html += groep("Later", later);
      if (af.length) html += '<details class="groep"><summary><h3>Afgerond <span class="aantal">' + af.length + '</span></h3></summary><ul class="rijen">' + af.slice(0, 100).map((o) => rij(o, true)).join("") + "</ul></details>";
    }
    $("hoofd").innerHTML = html;
  }

  // Elke halve minuut: rode nu-lijn, afgelopen blokken en de Nu/Hierna-kaart bijwerken
  let laatsteDag = vandaag();
  function werkNuBij() {
    const v = vandaag();
    if (v !== laatsteDag) {
      laatsteDag = v;
      if (!venster.open && !inst.open) { if (voorkeur.weergave === "dag" && gekozen === plusDagen(v, -1)) gekozen = v; tekenAlles(); }
      return;
    }
    const nm = nuMinuten();
    document.querySelectorAll('.kolom[data-tijdlijn-datum="' + v + '"]').forEach((k) => {
      const b = +k.dataset.begin, e = +k.dataset.eind;
      let lijn = k.querySelector(".nu-lijn");
      if (nm < b * 60 || nm >= e * 60) { if (lijn) lijn.remove(); }
      else {
        if (!lijn) { lijn = document.createElement("div"); lijn.className = "nu-lijn"; lijn.setAttribute("aria-hidden", "true"); if (k.dataset.metTijd) lijn.appendChild(document.createElement("span")); k.appendChild(lijn); }
        lijn.style.top = "calc(var(--uurh) * " + ((nm - b * 60) / 60).toFixed(4) + ")";
        const sp = lijn.querySelector("span");
        if (sp) sp.textContent = klok(nm);
      }
      k.querySelectorAll(".blok").forEach((bl) => {
        const s = +bl.dataset.s, en = +bl.dataset.e;
        bl.classList.toggle("voorbij", en <= nm);
        bl.classList.toggle("bezig", s <= nm && nm < en);
      });
    });
    const kaart = $("nuKaart");
    if (kaart) kaart.innerHTML = nuKaartInhoud();
  }
  setInterval(werkNuBij, 30000);

  // ---------- zijpaneel bij de maand ----------
  function tekenDagpaneel() {
    const s = gekozen;
    const per = periodeOp(s);
    const vak = vakantieOp(s);
    const vast = vastOp(s);
    const eigen = eigenOp(s);
    const label = [per ? per.naam : "", vak ? vak.naam : ""].filter(Boolean).join(" · ");
    let html = '<div class="dagkop"><h3>' + langDatum(s) + "</h3>" + (label ? '<span class="label">' + esc(label) + "</span>" : "") + "</div>";
    if (!vast.length && !eigen.length) html += '<p class="leeg">Niets gepland op deze dag.</p>';
    else html += '<ul class="rijen">' + vast.map(vastRij).join("") + eigen.map((o) => rij(o, false)).join("") + "</ul>";
    html += '<div class="knoppen"><button type="button" class="hoofd" data-nieuw="' + s + '">+ Opdracht op deze dag</button><button type="button" class="zacht" data-naar-dag="' + s + '">Dag openen</button></div>';
    $("dagpaneel").innerHTML = html;
  }

  function tekenZonderDatum() {
    const paneel = $("zonderDatumPaneel");
    const lijst = paboZichtbaar() ? P.zonderDatum.filter((t) => pastBij(t.doelgroep)) : [];
    paneel.hidden = !lijst.length;
    if (!lijst.length) return;
    $("zonderDatumUitleg").textContent = "Deze toetsen vallen in de tentamenweek van periode 2, die begint op maandag 11 januari. De exacte dag per toets volgt nog.";
    $("zonderdatum").innerHTML = lijst.map((t) =>
      '<li class="item" style="--c:var(--toets)"><span class="datumblok"><b>' + esc(t.periode) + "</b><small>datum?</small></span>" +
      "<div><h4>" + esc(t.titel) + "</h4><p>" + esc(t.uitleg) + "</p>" +
      '<span class="tag">' + esc(t.vorm) + '</span><span class="tag">' + DG_LABEL[t.doelgroep || "alle"] + '</span><span class="tag">Herk. ' + esc(t.herkansing) + "</span></div><span></span></li>"
    ).join("");
  }

  // ---------- meldingen bovenaan ----------
  function tekenOpenBalk() {
    const el = $("openBalk");
    const open = nogOpen();
    if (!open.length || voorkeur.openGezien === vandaag() || voorkeur.weergave === "lijst" || (sessie && !ontgrendeld)) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = "<p>Je hebt <strong>" + open.length + "</strong> to-do" + (open.length === 1 ? "" : "’s") + " van eerdere dagen die nog " + (open.length === 1 ? "openstaat" : "openstaan") + ".</p>" +
      '<div class="knoppen"><button type="button" class="hoofd" data-open="bekijk">Bekijken</button><button type="button" class="zacht" data-open="later">Later</button></div>';
  }

  function tekenSlotBalk() {
    const el = $("slotBalk");
    if (!(sessie && !ontgrendeld)) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = "<p>Digigenda is vergrendeld. Ontgrendel om je opdrachten van <strong>" + esc(sessie.naam) + "</strong> te zien.</p>" +
      '<div class="knoppen"><button type="button" class="hoofd" data-actie="ontgrendel">Ontgrendel met ' + esc(BIO.naam) + '</button><button type="button" class="zacht" data-actie="pin-in-instellingen">Pincode gebruiken</button></div>' +
      (accountMelding && accountPlek === null ? '<p class="klein te-laat">' + esc(accountMelding) + "</p>" : "");
  }

  function tekenVoet() {
    $("voet").innerHTML = paboAan()
      ? 'Toetsdata: Conceptoverzicht OWE’s Kernfase Voltijd jaar 3 (26-27) en het <a href="https://www.han.nl/studeren/jaarrooster/" target="_blank" rel="noopener">HAN-jaarrooster</a>. Check data altijd in Osiris.'
      : "Digigenda · je opdrachten blijven van jou. Zet er niets gevoeligs in.";
  }

  function tekenHoofd() {
    const w = voorkeur.weergave;
    if (w === "maand") { tekenMaand(); tekenDagpaneel(); tekenZonderDatum(); }
    else if (w === "week") tekenWeek();
    else if (w === "dag") tekenDag();
    else tekenLijst();
  }

  function tekenAlles() {
    tekenKop();
    tekenTabs();
    tekenFilters();
    tekenSnelAgenda();
    tekenJaarstrook();
    tekenSlotBalk();
    tekenOpenBalk();
    tekenHoofd();
    tekenVoet();
    if (accountPlek) tekenAccount();
    if ($("instellingen").open) tekenInstellingen();
  }

  // ---------- opslaan ----------
  function opslaan(gewijzigd, verwijderd) {
    if (actief()) {
      bewaar(CACHE + sessie.naam, opdrachten);
      const w = wachtrij(sessie.naam);
      (gewijzigd || []).forEach((id) => { w.verwijder = w.verwijder.filter((x) => x !== id); if (!w.bewaar.includes(id)) w.bewaar.push(id); });
      (verwijderd || []).forEach((id) => { w.bewaar = w.bewaar.filter((x) => x !== id); if (!w.verwijder.includes(id)) w.verwijder.push(id); });
      bewaar(WACHT + sessie.naam, w);
      synchroniseer();
    } else {
      bewaar(OPSLAG, opdrachten);
    }
    tekenAlles();
  }

  // ---------- toast ----------
  let toastTimer = null;
  function toast(tekst, ongedaan) {
    const el = $("toast");
    el.innerHTML = "<span>" + esc(tekst) + "</span>" + (ongedaan ? '<button type="button" class="tekstknop" id="toastOngedaan">Ongedaan maken</button>' : "");
    el.hidden = false;
    if (ongedaan) $("toastOngedaan").onclick = () => { ongedaan(); el.hidden = true; };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ongedaan ? 6000 : 3500);
  }

  // ---------- snelle invoer ----------
  const snel = $("snelInvoer");
  function standaardDatum() {
    return voorkeur.weergave === "lijst" ? vandaag() : gekozen;
  }
  function snelResultaten() {
    const opties = { standaardDatum: standaardDatum(), standaardAgenda: voorkeur.snelAgenda || instellingen.agendas[0] };
    return INVOER.verwerkRegels(snel.value, new Date(), opties).map((r) => {
      if (!agendaAan(r.agenda)) r.agendaUit = true;
      return r;
    });
  }
  function beschrijf(r) {
    const delen = [dagKort(r.datum) + (r.datumHerkend ? "" : (r.datum === vandaag() ? " (vandaag)" : " (gekozen dag)"))];
    if (r.tijd) delen.push(r.tijd + (r.eind ? "–" + r.eind : ""));
    else delen.push(r.eind ? "to-do tot " + r.eind : "to-do");
    if (instellingen.agendas.length > 1 || r.agendaUit) delen.push(AGENDA_NAAM[r.agenda]);
    if (r.soort !== "opdracht") delen.push(SOORT_LABEL[r.soort]);
    return delen;
  }
  function tekenVoorbeeld() {
    const el = $("snelVoorbeeld");
    if (!snel.value.trim()) { el.innerHTML = ""; el.classList.remove("zichtbaar"); return; }
    el.classList.add("zichtbaar");
    if (sessie && !ontgrendeld) { el.innerHTML = '<span class="te-laat">Ontgrendel eerst je account om iets toe te voegen.</span>'; return; }
    const lijst = snelResultaten();
    if (!lijst.length) { el.innerHTML = ""; return; }
    if (lijst.length === 1) {
      const r = lijst[0];
      if (!r.titel) { el.innerHTML = '<span class="te-laat">Typ ook wát je moet doen.</span>'; return; }
      el.innerHTML = '<span class="pijltje">↳</span> <strong>' + esc(r.titel) + "</strong> " + beschrijf(r).map((d) => '<span class="pil" style="--c:' + agendaKleur(r.agenda) + '">' + esc(d) + "</span>").join(" ") +
        (r.agendaUit ? ' <span class="klein te-laat">Deze agenda staat uit; zet hem aan in de instellingen.</span>' : "") +
        '<span class="klein enter-tip">Enter = toevoegen</span>';
      return;
    }
    const goed = lijst.filter((r) => r.titel);
    el.innerHTML = "<strong>" + goed.length + " items</strong> worden toegevoegd:" +
      '<ul class="voorbeeldlijst">' + goed.slice(0, 6).map((r) => "<li>" + esc(r.titel) + ' <span class="klein">' + esc(beschrijf(r).join(" · ")) + "</span></li>").join("") +
      (goed.length > 6 ? '<li class="klein">en nog ' + (goed.length - 6) + "…</li>" : "") + "</ul>" +
      (goed.length < lijst.length ? '<p class="klein">' + (lijst.length - goed.length) + " regel(s) zonder titel worden overgeslagen.</p>" : "") +
      '<span class="klein enter-tip">Enter = alles toevoegen</span>';
  }
  function groeiVeld() {
    snel.style.height = "auto";
    snel.style.height = Math.min(snel.scrollHeight, 220) + "px";
  }
  function snelToevoegen() {
    if (sessie && !ontgrendeld) { tekenVoorbeeld(); return; }
    const lijst = snelResultaten().filter((r) => r.titel);
    if (!lijst.length) { tekenVoorbeeld(); snel.focus(); return; }
    const nieuw = lijst.map((r) => normaal({ id: nieuwId() + Math.random().toString(36).slice(2, 4), titel: r.titel, datum: r.datum, tijd: r.tijd, eind: r.eind, soort: r.soort, agenda: r.agenda, notitie: "", klaar: false }));
    // agenda die uit stond: aanzetten, anders zie je de opdracht niet
    let aangezet = false;
    nieuw.forEach((o) => { if (!agendaAan(o.agenda)) { instellingen.agendas = AGENDAS.filter((a) => a === o.agenda || instellingen.agendas.includes(a)); aangezet = true; } voorkeur.verborgen = voorkeur.verborgen.filter((a) => a !== o.agenda); });
    if (aangezet) bewaarInstellingen();
    bewaarVoorkeur();
    opdrachten.push(...nieuw);
    snel.value = "";
    groeiVeld();
    tekenVoorbeeld();
    opslaan(nieuw.map((o) => o.id));
    const ids = nieuw.map((o) => o.id);
    toast(nieuw.length === 1 ? "Toegevoegd op " + dagKort(nieuw[0].datum) + (nieuw[0].tijd ? " om " + tijdTekst(nieuw[0]) : (nieuw[0].eind ? ", " + tijdTekst(nieuw[0]) : "")) : nieuw.length + " items toegevoegd", () => {
      opdrachten = opdrachten.filter((o) => !ids.includes(o.id));
      opslaan([], ids);
    });
  }
  $("snelForm").addEventListener("submit", (e) => { e.preventDefault(); snelToevoegen(); });
  snel.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); snelToevoegen(); }
  });
  snel.addEventListener("input", () => { groeiVeld(); tekenVoorbeeld(); });
  $("snelAgenda").addEventListener("change", (e) => { voorkeur.snelAgenda = e.target.value; bewaarVoorkeur(); tekenSnelAgenda(); tekenVoorbeeld(); });

  // ---------- venster: opdracht toevoegen / wijzigen ----------
  const venster = $("venster");
  let verwijderStap = 0;
  function openVenster(id, datum, tijd) {
    if (sessie && !ontgrendeld) { toast("Ontgrendel eerst je account."); return; }
    bewerkId = id || null;
    verwijderStap = 0;
    const o = id ? opdrachten.find((x) => x.id === id) : null;
    $("venstertitel").textContent = o ? (isTodo(o) ? "To-do wijzigen" : "Afspraak wijzigen") : (tijd ? "Afspraak toevoegen" : "Toevoegen");
    $("f-titel").value = o ? o.titel : "";
    $("f-datum").value = o ? o.datum : (datum || gekozen);
    $("f-tijd").value = o && o.tijd ? o.tijd : (tijd || "");
    $("f-eind").value = o && o.eind ? o.eind : (tijd ? klok(Math.min(minuten(tijd) + 60, 23 * 60 + 59)) : "");
    vorigeBegin = $("f-tijd").value;
    const agendaLijst = AGENDAS.filter((a) => agendaAan(a) || (o && o.agenda === a));
    $("f-agenda").innerHTML = agendaLijst.map((a) => '<option value="' + a + '">' + AGENDA_NAAM[a] + "</option>").join("");
    $("f-agenda").value = o ? o.agenda : (voorkeur.snelAgenda && agendaAan(voorkeur.snelAgenda) ? voorkeur.snelAgenda : instellingen.agendas[0]);
    $("f-agenda-rij").hidden = agendaLijst.length < 2;
    $("f-soort").value = o ? o.soort : (tijd ? "afspraak" : "opdracht");
    $("f-notitie").value = o ? (o.notitie || "") : "";
    $("f-klaar").checked = o ? !!o.klaar : false;
    $("f-klaar-rij").hidden = !!$("f-tijd").value;
    $("f-fout").textContent = "";
    $("f-verwijder").hidden = !o;
    $("f-verwijder").textContent = "Verwijderen";
    if (typeof venster.showModal === "function") venster.showModal(); else venster.setAttribute("open", "");
    $("f-titel").focus();
  }
  // Begintijd verschuift: eindtijd schuift mee (zelfde duur). Afvinken kan alleen bij to-do's.
  let vorigeBegin = "";
  $("f-tijd").addEventListener("change", () => {
    const nieuw = $("f-tijd").value, eind = $("f-eind").value;
    if (vorigeBegin && nieuw && TIJD.test(eind) && TIJD.test(vorigeBegin)) {
      const e = minuten(eind) + minuten(nieuw) - minuten(vorigeBegin);
      if (e > minuten(nieuw) && e < 24 * 60) $("f-eind").value = klok(e);
    }
    vorigeBegin = nieuw;
    $("f-klaar-rij").hidden = !!nieuw;
  });
  $("f-tijd").addEventListener("input", () => { $("f-klaar-rij").hidden = !!$("f-tijd").value; });
  function sluitVenster() { if (typeof venster.close === "function") venster.close(); else venster.removeAttribute("open"); }

  $("formulier").addEventListener("submit", (e) => {
    e.preventDefault();
    const titel = $("f-titel").value.trim();
    const datum = $("f-datum").value;
    if (!titel) { $("f-fout").textContent = "Vul een titel in."; $("f-titel").focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) { $("f-fout").textContent = "Kies een datum."; $("f-datum").focus(); return; }
    const tijd = TIJD.test($("f-tijd").value) ? $("f-tijd").value : null;
    const eind = TIJD.test($("f-eind").value) ? $("f-eind").value : null;
    if (tijd && eind && eind <= tijd) { $("f-fout").textContent = "De eindtijd moet na de begintijd liggen."; $("f-eind").focus(); return; }
    const gegevens = { titel, datum, tijd, eind, soort: $("f-soort").value, agenda: $("f-agenda").value || instellingen.agendas[0], notitie: $("f-notitie").value.trim(), klaar: tijd ? false : $("f-klaar").checked };
    let id = bewerkId;
    if (bewerkId) {
      const o = opdrachten.find((x) => x.id === bewerkId);
      if (o) Object.assign(o, normaal(Object.assign({}, o, gegevens)));
    } else {
      id = nieuwId();
      opdrachten.push(normaal(Object.assign({ id }, gegevens)));
    }
    gekozen = datum;
    const d = ontleed(datum);
    maand = { j: d.getFullYear(), m: d.getMonth() };
    sluitVenster();
    opslaan([id]);
  });
  $("f-annuleer").addEventListener("click", sluitVenster);
  $("f-verwijder").addEventListener("click", () => {
    if (verwijderStap === 0) { verwijderStap = 1; $("f-verwijder").textContent = "Zeker weten? Klik nogmaals"; return; }
    const id = bewerkId;
    opdrachten = opdrachten.filter((x) => x.id !== id);
    sluitVenster();
    opslaan([], [id]);
  });

  // ---------- acties op opdrachten ----------
  function wisselKlaar(id) {
    const o = opdrachten.find((x) => x.id === id);
    if (!o) return;
    o.klaar = !o.klaar;
    opslaan([o.id]);
  }
  function schuif(id) {
    const o = opdrachten.find((x) => x.id === id);
    if (!o) return;
    const v = vandaag();
    const oud = o.datum;
    o.datum = o.datum < v ? v : plusDagen(o.datum, 1);
    opslaan([o.id]);
    toast("Verplaatst naar " + dagKort(o.datum), () => { o.datum = oud; opslaan([o.id]); });
  }
  function allesNaarVandaag() {
    const v = vandaag();
    const lijst = nogOpen();
    const oud = lijst.map((o) => [o, o.datum]);
    lijst.forEach((o) => { o.datum = v; });
    opslaan(lijst.map((o) => o.id));
    toast(lijst.length + " opdracht" + (lijst.length === 1 ? "" : "en") + " naar vandaag verplaatst", () => { oud.forEach(([o, d]) => { o.datum = d; }); opslaan(oud.map(([o]) => o.id)); });
  }

  // ---------- navigeren ----------
  function kiesDag(s) {
    gekozen = s;
    const d = ontleed(s);
    if (d.getMonth() !== maand.m || d.getFullYear() !== maand.j) maand = { j: d.getFullYear(), m: d.getMonth() };
    tekenJaarstrook(); tekenHoofd(); tekenVoorbeeld();
  }
  function zetWeergave(w) {
    if (!WEERGAVEN.includes(w)) return;
    const anders = voorkeur.weergave !== w;
    voorkeur.weergave = w;
    if (w === "maand") { const d = ontleed(gekozen); maand = { j: d.getFullYear(), m: d.getMonth() }; }
    tekenAlles();
    tekenVoorbeeld();
    if (anders && telefoon()) window.scrollTo(0, 0);
  }
  function navigeer(stap) {
    const w = voorkeur.weergave;
    if (stap === 0) { gekozen = vandaag(); const d = new Date(); maand = { j: d.getFullYear(), m: d.getMonth() }; }
    else if (w === "maand") { maand = maand.m + stap < 0 ? { j: maand.j - 1, m: 11 } : maand.m + stap > 11 ? { j: maand.j + 1, m: 0 } : { j: maand.j, m: maand.m + stap }; }
    else if (w === "week") gekozen = plusDagen(gekozen, 7 * stap);
    else if (w === "dag") gekozen = plusDagen(gekozen, stap);
    tekenJaarstrook(); tekenHoofd(); tekenVoorbeeld();
  }

  document.querySelectorAll("[data-weergave]").forEach((b) => b.addEventListener("click", () => zetWeergave(b.dataset.weergave)));

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-klaar],[data-bewerk],[data-nieuw],[data-schuif],[data-nav],[data-naar-dag],[data-filter],[data-open],[data-alles-vandaag],[data-onder],[data-modus],[data-kies],[data-slot],[data-weekend],.chip.eigen,.dag,[data-j]");
    if (!t) return;
    if (t.closest("#venster")) return;
    // Maand: op de telefoon opent een dag de dagweergave, op de laptop het zijpaneel
    if (t.matches(".chip.eigen") || t.matches(".dag")) {
      const cel = t.closest(".dag");
      if (telefoon()) { gekozen = cel.dataset.datum; return zetWeergave("dag"); }
      if (t.matches(".chip.eigen")) { e.stopPropagation(); kiesDag(cel.dataset.datum); openVenster(t.dataset.id); return; }
      kiesDag(cel.dataset.datum); return;
    }
    if (t.dataset.onder) {
      if (t.dataset.onder === "vandaag") { gekozen = vandaag(); const d = new Date(); maand = { j: d.getFullYear(), m: d.getMonth() }; weekendTonen = false; return zetWeergave("dag"); }
      return zetWeergave(t.dataset.onder);
    }
    if (t.dataset.modus) { if (t.dataset.modus === "week") weekendTonen = ontleed(gekozen).getDay() % 6 === 0; return zetWeergave(t.dataset.modus); }
    if (t.dataset.kies) { gekozen = t.dataset.kies; tekenHoofd(); tekenVoorbeeld(); return; }
    if (t.dataset.slot) { const [d, tijd] = t.dataset.slot.split("|"); return openVenster(null, d, tijd); }
    if (t.dataset.weekend) { weekendTonen = t.dataset.weekend === "1"; return tekenHoofd(); }
    if (t.dataset.j !== undefined && t.closest("#jaarstrook")) { maand = { j: +t.dataset.j, m: +t.dataset.m }; tekenJaarstrook(); tekenHoofd(); return; }
    if (t.dataset.klaar) return wisselKlaar(t.dataset.klaar);
    if (t.dataset.schuif) return schuif(t.dataset.schuif);
    if (t.dataset.bewerk) return openVenster(t.dataset.bewerk);
    if (t.dataset.nieuw) return openVenster(null, t.dataset.nieuw);
    if (t.dataset.nav !== undefined) return navigeer(+t.dataset.nav);
    if (t.dataset.naarDag) { gekozen = t.dataset.naarDag; return zetWeergave("dag"); }
    if (t.dataset.filter) {
      const a = t.dataset.filter;
      voorkeur.verborgen = voorkeur.verborgen.includes(a) ? voorkeur.verborgen.filter((x) => x !== a) : voorkeur.verborgen.concat(a);
      bewaarVoorkeur(); tekenAlles(); return;
    }
    if (t.dataset.open === "bekijk") { voorkeur.openGezien = vandaag(); bewaarVoorkeur(); return zetWeergave("lijst"); }
    if (t.dataset.open === "later") { voorkeur.openGezien = vandaag(); bewaarVoorkeur(); tekenOpenBalk(); return; }
    if (t.hasAttribute("data-alles-vandaag")) return allesNaarVandaag();
  });

  $("hoofd").addEventListener("keydown", (e) => {
    const cel = e.target.closest(".dag");
    if (!cel) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); kiesDag(cel.dataset.datum); }
    const stap = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (stap) {
      e.preventDefault();
      const s = plusDagen(cel.dataset.datum, stap);
      kiesDag(s);
      const nieuw = $("hoofd").querySelector('[data-datum="' + s + '"]');
      if (nieuw) nieuw.focus();
    }
  });

  // ---------- instellingen ----------
  function bewaarInstellingen() {
    bewaar(INST, instellingen);
    if (actief() && CLOUD.aan) CLOUD.instellingen(sessie.token, instellingen).catch(() => {});
  }

  const inst = $("instellingen");
  function openInstellingen(focusAccount) {
    accountPlek = $("inst-account");
    $("welkom-account").innerHTML = "";
    if (!pushBezig) { pushMelding = ""; pushFout = false; }
    tekenAccount();
    tekenInstellingen();
    pushControleren();
    if (typeof inst.showModal === "function") inst.showModal(); else inst.setAttribute("open", "");
    if (focusAccount) { const v = inst.querySelector("#acc-naam, [data-actie]"); if (v) v.focus(); }
  }
  function sluitInstellingen() {
    if (typeof inst.close === "function") inst.close(); else inst.removeAttribute("open");
    accountPlek = null;
    tekenSlotBalk();
  }
  inst.addEventListener("close", () => { accountPlek = null; });
  $("inst-sluit").addEventListener("click", sluitInstellingen);
  $("instellingenKnop").addEventListener("click", () => openInstellingen(false));
  $("accountKnop").addEventListener("click", () => openInstellingen(true));

  function agendaKeuzeHtml(naam, gekozenLijst) {
    return AGENDAS.map((a) =>
      '<label class="agenda-kaart" style="--c:' + agendaKleur(a) + '"><input type="checkbox" name="' + naam + '" value="' + a + '"' + (gekozenLijst.includes(a) ? " checked" : "") + ">" +
      '<span class="ak-stip"></span><span><strong>' + AGENDA_NAAM[a] + '</strong><small>' + AGENDA_UITLEG[a] + "</small></span></label>").join("");
  }
  function paboKeuzeHtml(prefix, pabo, doelgroep, zichtbaarBlok) {
    return '<div class="pabo-keuze"' + (zichtbaarBlok ? "" : " hidden") + '>' +
      '<label class="vink-label"><input type="checkbox" id="' + prefix + '-pabo"' + (pabo ? " checked" : "") + "><span>HAN Pabo 3-toetsrooster tonen <span class=\"klein\">(toetsen, periodes en vakanties)</span></span></label>" +
      '<div class="doelgroep" role="group" aria-label="Toon toetsen voor"' + (pabo ? "" : " hidden") + ">" +
      ["alle", "jk", "ok"].map((d) => '<button type="button" data-dg="' + d + '" data-dg-plek="' + prefix + '" aria-pressed="' + (doelgroep === d) + '">' + { alle: "Alle", jk: "Jongere kind", ok: "Oudere kind" }[d] + "</button>").join("") +
      "</div></div>";
  }

  function tekenInstellingen() {
    tekenMeldingen();
    // Agenda's
    $("inst-agendas").innerHTML = "<h4>Agenda’s</h4>" +
      '<div class="agenda-keuze">' + agendaKeuzeHtml("inst-ag", instellingen.agendas) + "</div>" +
      paboKeuzeHtml("inst", instellingen.pabo, instellingen.doelgroep, agendaAan("school"));

    // Koppelen aan iPhone-agenda
    let k = "<h4>Koppelen aan je iPhone-agenda</h4>";
    if (!actief()) {
      k += '<p class="klein">Log eerst in. Dan kun je je opdrachten in de Agenda-app van je iPhone, Mac of Google Agenda laten verschijnen.</p>';
    } else if (!agendaLink) {
      k += '<p class="klein">Je opdrachten' + (paboAan() ? " en de Pabo-toetsen" : "") + ' verschijnen dan in je gewone agenda-app. Je iPhone ververst die zelf, ongeveer elk uur.</p>' +
        '<div class="knoppen"><button type="button" class="hoofd" data-link="maak">Agenda-link maken</button></div>';
    } else {
      const https = CLOUD.agendaUrl(agendaLink);
      const webcal = https.replace(/^https:/, "webcal:");
      k += '<p class="klein">Tik op <strong>Abonneren</strong> op je iPhone of Mac en kies daarna <em>Abonneer</em>. Voor Google Agenda: kopieer de link en kies daar <em>Andere agenda’s → Via URL</em>.</p>' +
        '<div class="knoppen"><a class="hoofd knop-link" href="' + esc(webcal) + '">Abonneren</a>' +
        '<button type="button" class="zacht" data-link="kopieer" data-url="' + esc(https) + '">Link kopiëren</button>' +
        '<button type="button" class="zacht" data-link="nieuw">Nieuwe link maken</button></div>' +
        '<p class="klein">Deel deze link met niemand: wie hem heeft, kan je opdrachten lezen. Een nieuwe link maken zet de oude uit.</p>';
    }
    if (linkMelding) k += '<p class="klein' + (linkFout ? " te-laat" : "") + '" role="status">' + esc(linkMelding) + "</p>";
    $("inst-koppeling").innerHTML = k;

    // Op beginscherm
    const standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    $("inst-beginscherm").innerHTML = "<h4>Als app op je beginscherm</h4>" +
      (standalone ? '<p class="klein">Digigenda staat al als app op je beginscherm.</p>'
        : '<p class="klein"><strong>iPhone:</strong> open deze pagina in Safari, tik op <em>Deel</em> (vierkantje met pijl omhoog) en kies <em>Zet op beginscherm</em>.<br><strong>Android / laptop:</strong> kies in het browsermenu <em>App installeren</em>.</p>' +
          (installPrompt ? '<div class="knoppen"><button type="button" class="hoofd" data-installeer>Installeren</button></div>' : ""));
  }

  let agendaLink = null, linkMelding = "", linkFout = false;
  async function agendaLinkActie(nieuw) {
    if (!actief()) return;
    linkMelding = nieuw ? "Nieuwe link maken…" : "Link ophalen…"; linkFout = false; tekenInstellingen();
    try {
      const r = controleer(await CLOUD.agendaLink(sessie.token, nieuw));
      agendaLink = r.code;
      linkMelding = nieuw ? "Nieuwe link gemaakt. De oude werkt niet meer; abonneer opnieuw op je iPhone." : "";
    } catch (fout) {
      if (fout.verlopen) { sluitInstellingen(); return sessieVerlopen(); }
      linkMelding = fout.message || "Dat lukte niet."; linkFout = true;
    }
    tekenInstellingen();
  }

  // ---------- meldingen (pushberichten op telefoon en laptop) ----------
  const PUSH_VLAG = "digigenda-meldingen-v1";   // wie op dit apparaat meldingen heeft aangezet
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const losseApp = () => !!((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true);
  const pushKan = () => !!(window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
  let pushAan = false, pushMelding = "", pushFout = false, pushBezig = false;

  function naarBytes(s) {
    const t = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(t + "===".slice((t.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  async function huidigAbonnement() {
    if (!pushKan()) return null;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? await reg.pushManager.getSubscription() : null;
    } catch (e) { return null; }
  }
  async function pushControleren() {
    const sub = await huidigAbonnement();
    pushAan = !!sub && !!sessie && laad(PUSH_VLAG, "") === sessie.naam;
    if (inst.open) tekenMeldingen();
  }
  // Bij openen en na inloggen: dit apparaat opnieuw aan het (nieuwe) inlogbewijs koppelen
  async function pushVernieuwen() {
    if (!actief() || !pushKan() || Notification.permission !== "granted" || laad(PUSH_VLAG, "") !== sessie.naam) return;
    const sub = await huidigAbonnement();
    if (!sub) { weg(PUSH_VLAG); return; }
    try { const r = await CLOUD.pushAanmelden(sessie.token, sub.toJSON()); if (r && r.ok) pushAan = true; } catch (e) { /* later opnieuw */ }
  }
  async function meldingenAanzetten() {
    if (!actief() || pushBezig) return;
    pushBezig = true; pushFout = false; pushMelding = "Toestemming vragen…"; tekenMeldingen();
    try {
      const toestemming = await Notification.requestPermission();
      if (toestemming !== "granted") {
        throw new Error(toestemming === "denied"
          ? "Je hebt meldingen geblokkeerd. Zet ze aan bij de instellingen van je " + (ios ? "iPhone (Instellingen → Meldingen → Digigenda)" : "browser (slotje naast het adres)") + " en probeer het opnieuw."
          : "Je hebt (nog) geen toestemming gegeven.");
      }
      pushMelding = "Aanzetten…"; tekenMeldingen();
      if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register("sw.js");
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: naarBytes(CLOUD.VAPID) });
      controleer(await CLOUD.pushAanmelden(sessie.token, sub.toJSON()));
      bewaar(PUSH_VLAG, sessie.naam);
      pushAan = true;
      pushMelding = "Meldingen staan aan op dit apparaat. Stuur een testmelding om te kijken of het werkt.";
    } catch (fout) {
      pushBezig = false;
      if (fout.verlopen) { sluitInstellingen(); return sessieVerlopen(); }
      pushFout = true;
      pushMelding = fout && fout.name === "Error" ? fout.message : "Aanzetten is niet gelukt (" + ((fout && fout.name) || "fout") + "). Probeer het nog eens.";
    }
    pushBezig = false;
    tekenMeldingen();
  }
  async function meldingenUitzetten() {
    if (pushBezig) return;
    pushBezig = true; tekenMeldingen();
    const sub = await huidigAbonnement();
    if (sub) {
      if (actief()) { try { await CLOUD.pushAfmelden(sessie.token, sub.endpoint); } catch (e) { /* niets */ } }
      try { await sub.unsubscribe(); } catch (e) { /* niets */ }
    }
    weg(PUSH_VLAG);
    pushAan = false; pushBezig = false; pushFout = false;
    pushMelding = "Meldingen staan uit op dit apparaat.";
    tekenMeldingen();
  }
  async function testMelding() {
    if (!actief() || pushBezig) return;
    pushBezig = true; pushFout = false; pushMelding = "Testmelding versturen…"; tekenMeldingen();
    try {
      const r = await CLOUD.testMelding(sessie.token);
      if (r && r.sessie === false) { pushBezig = false; sluitInstellingen(); return sessieVerlopen(); }
      if (!r || !r.ok) throw new Error((r && r.fout) || "Versturen is niet gelukt.");
      if (!r.gelukt) throw new Error("De meldingendienst van je toestel nam de melding niet aan. Zet meldingen uit en weer aan.");
      pushMelding = "Testmelding verstuurd. Komt hij niet binnen? Kijk of meldingen voor Digigenda aanstaan in de instellingen van je toestel.";
    } catch (e) { pushFout = true; pushMelding = e.message || "Versturen is niet gelukt."; }
    pushBezig = false;
    tekenMeldingen();
  }
  function tekenMeldingen() {
    const el = $("inst-meldingen");
    if (!el) return;
    if (!window.CLOUD || !CLOUD.aan) { el.innerHTML = ""; return; }
    const uit = pushBezig ? " disabled" : "";
    let h = "<h4>Meldingen</h4>";
    if (!actief()) {
      h += '<p class="klein">Log eerst in. Dan krijg je een seintje 15 minuten vóór een afspraak en elke ochtend om 07:30 een overzicht van je dag.</p>';
    } else if (!pushKan()) {
      h += ios && !losseApp()
        ? '<p class="klein">Op de iPhone werken meldingen alleen als Digigenda <strong>op je beginscherm</strong> staat (iOS 16.4 of nieuwer). Zet hem daar eerst op (zie hieronder), open Digigenda vanaf je beginscherm en zet meldingen dan hier aan.</p>'
        : '<p class="klein">Deze browser kan geen meldingen ontvangen. Probeer Safari, Chrome, Edge of Firefox.</p>';
    } else if (!pushAan && Notification.permission === "denied") {
      h += '<p class="klein te-laat">Meldingen zijn geblokkeerd voor Digigenda.</p><p class="klein">' +
        (ios ? "Ga naar <em>Instellingen → Meldingen → Digigenda</em> en zet <em>Sta meldingen toe</em> aan." : "Klik op het slotje naast het adres en zet <em>Meldingen</em> op <em>Toestaan</em>.") + "</p>";
    } else if (!pushAan) {
      h += '<p class="klein">Krijg een seintje 15 minuten vóór een afspraak en elke ochtend om 07:30 een overzicht van je dag.</p>' +
        '<div class="knoppen"><button type="button" class="hoofd" data-push="aan"' + uit + ">Meldingen aanzetten</button></div>";
    } else {
      h += '<p class="klein">Meldingen staan aan op dit apparaat. Deze keuzes gelden voor al je apparaten:</p>' +
        '<label class="vink-label"><input type="checkbox" id="push-ochtend"' + (instellingen.meldingen.ochtend ? " checked" : "") + "><span>Ochtendoverzicht om 07:30</span></label>" +
        '<label class="vink-label"><input type="checkbox" id="push-afspraak"' + (instellingen.meldingen.afspraak ? " checked" : "") + "><span>15 minuten vóór een afspraak</span></label>" +
        '<div class="knoppen"><button type="button" class="zacht" data-push="test"' + uit + '>Testmelding sturen</button><button type="button" class="zacht" data-push="uit"' + uit + ">Uitzetten op dit apparaat</button></div>";
    }
    if (pushMelding) h += '<p class="klein' + (pushFout ? " te-laat" : "") + '" role="status">' + esc(pushMelding) + "</p>";
    el.innerHTML = h;
  }

  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; if (inst.open) tekenInstellingen(); });

  inst.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "inst-ag") {
      const gekozenAg = Array.from(inst.querySelectorAll('input[name="inst-ag"]:checked')).map((x) => x.value);
      if (!gekozenAg.length) { t.checked = true; toast("Kies minstens één agenda."); return; }
      instellingen.agendas = AGENDAS.filter((a) => gekozenAg.includes(a));
      voorkeur.verborgen = voorkeur.verborgen.filter((a) => instellingen.agendas.includes(a));
      bewaarVoorkeur(); bewaarInstellingen(); tekenAlles();
    }
    if (t.id === "inst-pabo") { instellingen.pabo = t.checked; bewaarInstellingen(); tekenAlles(); }
    if (t.id === "push-ochtend" || t.id === "push-afspraak") {
      instellingen.meldingen[t.id === "push-ochtend" ? "ochtend" : "afspraak"] = t.checked;
      bewaarInstellingen();
      pushFout = false; pushMelding = "Opgeslagen."; tekenMeldingen();
    }
  });
  inst.addEventListener("click", (e) => {
    const t = e.target.closest("[data-dg],[data-link],[data-installeer],[data-push]");
    if (!t) return;
    if (t.dataset.push === "aan") return meldingenAanzetten();
    if (t.dataset.push === "uit") return meldingenUitzetten();
    if (t.dataset.push === "test") return testMelding();
    if (t.dataset.dg && t.dataset.dgPlek === "inst") { instellingen.doelgroep = t.dataset.dg; bewaarInstellingen(); tekenAlles(); }
    if (t.dataset.link === "maak") agendaLinkActie(false);
    if (t.dataset.link === "nieuw") agendaLinkActie(true);
    if (t.dataset.link === "kopieer") {
      const url = t.dataset.url;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast("Link gekopieerd"), () => { window.prompt("Kopieer deze link:", url); });
    }
    if (t.hasAttribute("data-installeer") && installPrompt) { installPrompt.prompt(); installPrompt = null; }
  });

  // ---------- startscherm ----------
  let welkomKeuze = null;
  function toonWelkom() {
    welkomKeuze = { agendas: instellingen.agendas.slice(), pabo: instellingen.pabo, doelgroep: instellingen.doelgroep };
    $("welkom-agendas").innerHTML = agendaKeuzeHtml("welkom-ag", welkomKeuze.agendas);
    tekenWelkomPabo();
    $("welkom-fout").textContent = "";
    $("welkom-stap1").hidden = false;
    $("welkom-stap2").hidden = true;
    $("welkom").hidden = false;
    document.body.classList.add("geen-scroll");
    const eerste = $("welkom").querySelector("input");
    if (eerste) eerste.focus();
  }
  function tekenWelkomPabo() {
    $("welkom-pabo").innerHTML = paboKeuzeHtml("wk", welkomKeuze.pabo, welkomKeuze.doelgroep, welkomKeuze.agendas.includes("school"));
  }
  function sluitWelkom() {
    instellingen.welkom = true;
    bewaarInstellingen();
    $("welkom").hidden = true;
    document.body.classList.remove("geen-scroll");
    if (accountPlek === $("welkom-account")) accountPlek = null;
    $("welkom-account").innerHTML = "";
    tekenAlles();
    toast("Tip: typ bovenin ‘morgen 14:00 tandarts’ en druk op Enter.");
  }
  $("welkom").addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "welkom-ag") {
      welkomKeuze.agendas = Array.from($("welkom").querySelectorAll('input[name="welkom-ag"]:checked')).map((x) => x.value);
      tekenWelkomPabo();
    }
    if (t.id === "wk-pabo") { welkomKeuze.pabo = t.checked; tekenWelkomPabo(); }
  });
  $("welkom").addEventListener("click", (e) => {
    const t = e.target.closest("[data-dg]");
    if (t && t.dataset.dgPlek === "wk") { welkomKeuze.doelgroep = t.dataset.dg; tekenWelkomPabo(); }
  });
  $("welkom-verder").addEventListener("click", () => {
    if (!welkomKeuze.agendas.length) { $("welkom-fout").textContent = "Kies minstens één agenda."; return; }
    instellingen.agendas = AGENDAS.filter((a) => welkomKeuze.agendas.includes(a));
    instellingen.pabo = welkomKeuze.pabo;
    instellingen.doelgroep = welkomKeuze.doelgroep;
    bewaarInstellingen();
    if (actief() || !window.CLOUD || !CLOUD.aan) return sluitWelkom();
    $("welkom-stap1").hidden = true;
    $("welkom-stap2").hidden = false;
    accountPlek = $("welkom-account");
    formModus = "registreren";
    tekenAccount();
  });
  $("welkom-terug").addEventListener("click", () => { $("welkom-stap2").hidden = true; $("welkom-stap1").hidden = false; accountPlek = null; $("welkom-account").innerHTML = ""; });
  $("welkom-zonder").addEventListener("click", sluitWelkom);
  $("welkomOpnieuw").addEventListener("click", () => { sluitInstellingen(); toonWelkom(); });

  // ---------- account: online opslaan ----------
  let accountPlek = null;          // element waarin het accountformulier nu staat
  let accountMelding = "";
  let accountFout = false;
  let formModus = "inloggen";
  let toonPinFormulier = false;
  let bezigMetVerzoek = false;
  let syncStatus = "";
  let bioMogelijk = false;
  let uitlogStap = 0;
  let ingevuldeNaam = "";
  let vorigeNaam = "";
  let vorigeFaceid = null;

  // Pincodes die te makkelijk te raden zijn (dezelfde regels als op de server)
  const ZWAK = ["0123","1234","2345","3456","4567","5678","6789","7890","0987","9876","8765","7654","6543","5432","4321","3210",
    "1212","1313","2121","1122","2211","1010","0101","1001","6969","2580","0852","1357","2468","1004","4200","1230","0007"];
  const zwakkePin = (p) => /^(\d)\1{3}$/.test(p) || /^(19|20)\d\d$/.test(p) || ZWAK.includes(p);
  const ZWAK_TEKST = "Deze pincode is te makkelijk te raden. Kies geen 1234, 0000, een jaartal of een reeks.";
  let pinFormulier = false;
  let overalStap = 0;

  function wachtrij(naam) {
    const w = laad(WACHT + naam, null);
    return w && Array.isArray(w.bewaar) && Array.isArray(w.verwijder) ? w : { bewaar: [], verwijder: [] };
  }
  const wachtrijLeeg = (naam) => { const w = wachtrij(naam); return !w.bewaar.length && !w.verwijder.length; };

  function controleer(r) {
    if (r && r.ok) return r;
    if (r && r.sessie === false) { const f = new Error("sessie"); f.verlopen = true; throw f; }
    throw new Error((r && r.fout) || "Er ging iets mis.");
  }

  function sessieVerlopen() {
    const naam = sessie ? sessie.naam : "";
    const faceid = sessie ? sessie.faceid : null;
    sessie = null;
    weg(SESSIE);
    ontgrendeld = false;
    agendaLink = null;
    laadEigen();
    formModus = "inloggen";
    accountMelding = "Je inlog is verlopen. Log opnieuw in met je pincode.";
    accountFout = true;
    vorigeNaam = naam;
    vorigeFaceid = faceid;
    tekenAlles();
    toast("Je inlog is verlopen. Log opnieuw in via ‘Inloggen’.");
  }

  let syncBezig = false;
  let syncNogEens = false;
  async function synchroniseer() {
    if (!actief()) return;
    if (syncBezig) { syncNogEens = true; return; }
    const naam = sessie.naam;
    const token = sessie.token;
    const w = wachtrij(naam);
    if (!w.bewaar.length && !w.verwijder.length) { syncStatus = "ok"; if (accountPlek) tekenAccount(); return; }
    syncBezig = true;
    syncStatus = "bezig";
    if (accountPlek) tekenAccount();
    bewaar(WACHT + naam, { bewaar: [], verwijder: [] });
    try {
      const lijst = opdrachten.filter((o) => w.bewaar.includes(o.id));
      for (let i = 0; i < lijst.length; i += 200) controleer(await CLOUD.bewaar(token, lijst.slice(i, i + 200)));
      for (const id of w.verwijder) controleer(await CLOUD.verwijder(token, id));
      syncStatus = "ok";
    } catch (fout) {
      const nu2 = wachtrij(naam);
      w.bewaar.forEach((id) => { if (!nu2.bewaar.includes(id) && !nu2.verwijder.includes(id)) nu2.bewaar.push(id); });
      w.verwijder.forEach((id) => { if (!nu2.bewaar.includes(id) && !nu2.verwijder.includes(id)) nu2.verwijder.push(id); });
      bewaar(WACHT + naam, nu2);
      syncStatus = "fout";
      syncBezig = false;
      if (fout.verlopen) return sessieVerlopen();
      if (accountPlek) tekenAccount();
      return;
    }
    syncBezig = false;
    if (syncNogEens) { syncNogEens = false; return synchroniseer(); }
    if (accountPlek) tekenAccount();
  }

  function neemServerInstellingen(i) {
    if (i && Array.isArray(i.agendas) && i.agendas.length) {
      instellingen = normaleInstellingen(Object.assign({}, i, { welkom: true }));
      bewaar(INST, instellingen);
    } else if (actief()) {
      CLOUD.instellingen(sessie.token, instellingen).catch(() => {});
    }
  }

  async function vernieuw() {
    if (!actief()) return;
    await synchroniseer();
    if (!actief() || !wachtrijLeeg(sessie.naam)) return;
    try {
      const r = controleer(await CLOUD.lijst(sessie.token));
      if (!actief() || !wachtrijLeeg(sessie.naam)) return;
      opdrachten = normaleLijst(r.opdrachten);
      bewaar(CACHE + sessie.naam, opdrachten);
      neemServerInstellingen(r.instellingen);
      syncStatus = "ok";
      tekenAlles();
    } catch (fout) {
      if (fout.verlopen) return sessieVerlopen();
      syncStatus = "fout";
      if (accountPlek) tekenAccount();
    }
  }

  async function naInloggen(r) {
    const faceid = (sessie && sessie.naam === r.naam && sessie.faceid) || (vorigeNaam === r.naam ? vorigeFaceid : null) || null;
    sessie = { naam: r.naam, token: r.token, faceid };
    bewaar(SESSIE, sessie);
    ontgrendeld = true;
    toonPinFormulier = false;
    vorigeNaam = ""; vorigeFaceid = null; ingevuldeNaam = "";
    agendaLink = null;

    const cache = normaleLijst(laad(CACHE + r.naam, []));
    const w = wachtrij(r.naam);
    let lijst = normaleLijst(r.opdrachten).filter((o) => !w.verwijder.includes(o.id));
    cache.forEach((o) => {
      if (!w.bewaar.includes(o.id)) return;
      const i = lijst.findIndex((x) => x.id === o.id);
      if (i >= 0) lijst[i] = o; else lijst.push(o);
    });

    const lokaal = normaleLijst(laad(OPSLAG, []));
    let meegenomen = 0;
    if (lokaal.length) {
      lokaal.forEach((o) => {
        const i = lijst.findIndex((x) => x.id === o.id);
        if (i >= 0) lijst[i] = o; else lijst.push(o);
        if (!w.bewaar.includes(o.id)) w.bewaar.push(o.id);
        meegenomen++;
      });
      bewaar(WACHT + r.naam, w);
      bewaar(OPSLAG, []);
    }

    opdrachten = lijst;
    bewaar(CACHE + r.naam, opdrachten);
    neemServerInstellingen(r.instellingen);
    accountFout = false;
    accountMelding = meegenomen
      ? meegenomen + " opdracht" + (meegenomen === 1 ? " van dit apparaat is" : "en van dit apparaat zijn") + " aan je account toegevoegd."
      : "";
    const welkomOpen = !$("welkom").hidden;
    if (welkomOpen) sluitWelkom(); else tekenAlles();
    pushVernieuwen();
    await synchroniseer();
  }

  async function verstuurFormulier(modus) {
    if (bezigMetVerzoek) return;
    const naam = ($("acc-naam").value || "").trim().toLowerCase();
    const pin = ($("acc-pin").value || "").trim();
    const fout = (t, veld) => { accountMelding = t; accountFout = true; tekenAccount(); const v = $(veld); if (v) v.focus(); };
    if (!/^[a-z0-9]{3,20}$/.test(naam)) return fout("Gebruikersnaam: 3 tot 20 letters of cijfers, zonder spaties.", "acc-naam");
    if (!/^\d{4}$/.test(pin)) return fout("De pincode bestaat uit precies 4 cijfers.", "acc-pin");
    if (modus === "registreren") {
      if (zwakkePin(pin)) return fout(ZWAK_TEKST, "acc-pin");
      const herhaal = ($("acc-pin2") ? $("acc-pin2").value : "").trim();
      if (herhaal !== pin) return fout("De twee pincodes zijn niet hetzelfde.", "acc-pin2");
    }
    bezigMetVerzoek = true;
    accountMelding = modus === "registreren" ? "Account maken…" : "Inloggen…";
    accountFout = false;
    tekenAccount(naam);
    try {
      const r = await (modus === "registreren" ? CLOUD.registreer(naam, pin) : CLOUD.inloggen(naam, pin));
      bezigMetVerzoek = false;
      if (!r || !r.ok) return fout((r && r.fout) || "Inloggen is niet gelukt.", "acc-pin");
      await naInloggen(r);
    } catch (e) {
      bezigMetVerzoek = false;
      fout(e.message || "Er ging iets mis.", "acc-naam");
    }
  }

  async function ontgrendel() {
    if (!sessie || !sessie.faceid) return;
    try {
      const gelukt = await BIO.controleer(sessie.faceid);
      if (!gelukt) throw new Error("niet geverifieerd");
      ontgrendeld = true;
      accountMelding = ""; accountFout = false;
      laadEigen();
      tekenAlles();
      vernieuw();
      pushVernieuwen();
    } catch (e) {
      accountMelding = "Ontgrendelen met " + BIO.naam + " is niet gelukt. Probeer het opnieuw of gebruik je pincode.";
      accountFout = true;
      tekenAlles();
    }
  }

  async function bioAanzetten() {
    if (!actief()) return;
    try {
      sessie.faceid = await BIO.aanzetten(sessie.naam);
      bewaar(SESSIE, sessie);
      accountMelding = hoofd(BIO.naam) + " staat aan. Als je Digigenda op dit apparaat opent, ontgrendel je met " + BIO.naam + ".";
      accountFout = false;
    } catch (e) {
      accountMelding = hoofd(BIO.naam) + " aanzetten is niet gelukt of geannuleerd.";
      accountFout = true;
    }
    tekenAccount();
  }
  function bioUitzetten() {
    if (!sessie) return;
    sessie.faceid = null;
    bewaar(SESSIE, sessie);
    accountMelding = hoofd(BIO.naam) + " staat uit op dit apparaat.";
    accountFout = false;
    tekenAccount();
  }

  async function uitloggen() {
    if (!sessie) return;
    if (ontgrendeld && !wachtrijLeeg(sessie.naam) && uitlogStap === 0) {
      uitlogStap = 1;
      accountMelding = "Er zijn nog wijzigingen die niet online staan. Klik nogmaals op Uitloggen om ze te laten vervallen.";
      accountFout = true;
      return tekenAccount();
    }
    CLOUD.uitloggen(sessie.token).catch(() => {});
    lokaalUitloggen("Je bent uitgelogd. Je opdrachten staan veilig online.");
  }

  function lokaalUitloggen(melding) {
    const naam = sessie ? sessie.naam : "";
    huidigAbonnement().then((sub) => { if (sub) sub.unsubscribe().catch(() => {}); });
    weg(PUSH_VLAG); pushAan = false; pushMelding = "";
    weg(SESSIE); weg(CACHE + naam); weg(WACHT + naam);
    sessie = null; ontgrendeld = false; uitlogStap = 0; overalStap = 0; pinFormulier = false; agendaLink = null; linkMelding = "";
    syncStatus = ""; formModus = "inloggen";
    accountMelding = melding;
    accountFout = false;
    laadEigen();
    tekenAlles();
  }

  async function uitloggenOveral() {
    if (!actief()) return;
    if (overalStap === 0) {
      overalStap = 1;
      accountMelding = "Hiermee log je uit op al je apparaten, ook deze. Klik nogmaals om te bevestigen.";
      accountFout = true;
      return tekenAccount();
    }
    await synchroniseer();
    try {
      controleer(await CLOUD.uitloggenOveral(sessie.token));
      lokaalUitloggen("Je bent op al je apparaten uitgelogd.");
    } catch (fout) {
      overalStap = 0;
      if (fout.verlopen) return sessieVerlopen();
      accountMelding = fout.message || "Dat lukte niet."; accountFout = true; tekenAccount();
    }
  }

  async function pinWijzigen() {
    if (!actief() || bezigMetVerzoek) return;
    const oud = ($("pin-oud").value || "").trim(), nieuw = ($("pin-nieuw").value || "").trim(), herhaal = ($("pin-herhaal").value || "").trim();
    const fout = (t, veld) => { accountMelding = t; accountFout = true; tekenAccount(); const v = $(veld); if (v) v.focus(); };
    if (!/^\d{4}$/.test(oud)) return fout("Vul je huidige pincode in (4 cijfers).", "pin-oud");
    if (!/^\d{4}$/.test(nieuw)) return fout("De nieuwe pincode bestaat uit precies 4 cijfers.", "pin-nieuw");
    if (zwakkePin(nieuw)) return fout(ZWAK_TEKST, "pin-nieuw");
    if (nieuw !== herhaal) return fout("De twee nieuwe pincodes zijn niet hetzelfde.", "pin-herhaal");
    bezigMetVerzoek = true;
    try {
      const r = await CLOUD.pinWijzigen(sessie.token, oud, nieuw);
      bezigMetVerzoek = false;
      if (r && r.sessie === false) return sessieVerlopen();
      if (!r || !r.ok) return fout((r && r.fout) || "Wijzigen is niet gelukt.", "pin-oud");
      pinFormulier = false;
      accountMelding = "Je pincode is gewijzigd. Op je andere apparaten moet je opnieuw inloggen.";
      accountFout = false;
      tekenAccount();
    } catch (e) {
      bezigMetVerzoek = false;
      fout(e.message || "Er ging iets mis.", "pin-oud");
    }
  }

  function tekenAccount(vulNaam) {
    const el = accountPlek;
    if (!el) return;
    if (!window.CLOUD || !CLOUD.aan) { el.innerHTML = ""; return; }
    const inWelkom = el.id === "welkom-account";
    const kop = (t, l) => inWelkom ? "" : '<div class="dagkop"><h4>' + t + "</h4>" + (l ? '<span class="label">' + l + "</span>" : "") + "</div>";
    const melding = accountMelding ? '<p class="klein acc-melding' + (accountFout ? " te-laat" : "") + '" role="status">' + esc(accountMelding) + "</p>" : "";

    if (actief() && pinFormulier) {
      el.innerHTML = kop("Pincode wijzigen", "") +
        '<form id="pin-form" class="acc-form" novalidate>' +
        '<input type="text" autocomplete="username" value="' + esc(sessie.naam) + '" hidden>' +
        '<label for="pin-oud">Huidige pincode</label><input id="pin-oud" class="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="current-password">' +
        '<label for="pin-nieuw">Nieuwe pincode</label><input id="pin-nieuw" class="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password">' +
        '<label for="pin-herhaal">Herhaal nieuwe pincode</label><input id="pin-herhaal" class="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password">' +
        melding +
        '<div class="knoppen"><button type="submit" class="hoofd">Opslaan</button><button type="button" class="zacht" data-actie="pin-annuleer">Annuleren</button></div></form>';
      return;
    }
    if (actief()) {
      const status = { bezig: "Bezig met opslaan…", ok: "Alles staat online.", fout: "Niet alles staat online. Wordt opnieuw geprobeerd zodra er verbinding is." }[syncStatus] || "";
      el.innerHTML = kop("Account", "Online") +
        '<p class="klein">Ingelogd als <strong>' + esc(sessie.naam) + "</strong>." + (status ? " " + esc(status) : "") + "</p>" + melding +
        '<div class="knoppen">' +
        (bioMogelijk ? (sessie.faceid
          ? '<button type="button" class="zacht" data-actie="bio-uit">' + esc(hoofd(BIO.naam)) + " uitzetten</button>"
          : '<button type="button" class="zacht" data-actie="bio-aan">' + esc(hoofd(BIO.naam)) + " aanzetten</button>") : "") +
        '<button type="button" class="zacht" data-actie="pin-wijzig">Pincode wijzigen</button>' +
        '<button type="button" class="zacht" data-actie="uitloggen">Uitloggen</button></div>' +
        '<div class="knoppen"><button type="button" class="tekstknop" data-actie="overal">Uitloggen op alle apparaten</button></div>';
      return;
    }
    if (sessie && !toonPinFormulier) {
      el.innerHTML = kop("Account", "Vergrendeld") +
        '<p class="klein">Ingelogd als <strong>' + esc(sessie.naam) + "</strong>. Ontgrendel om je opdrachten te zien.</p>" + melding +
        '<div class="knoppen"><button type="button" class="hoofd" data-actie="ontgrendel">Ontgrendel met ' + esc(BIO.naam) + "</button>" +
        '<button type="button" class="zacht" data-actie="toon-pin">Pincode gebruiken</button></div>';
      return;
    }
    const reg = formModus === "registreren";
    const naamWaarde = vulNaam || ingevuldeNaam || (sessie ? sessie.naam : vorigeNaam) || "";
    el.innerHTML = kop(reg ? "Account maken" : "Inloggen", "Optioneel") +
      '<p class="klein">' + (reg
        ? "Kies een gebruikersnaam en een pincode van 4 cijfers. Onthoud je pincode goed: er is geen herstelknop."
        : "Log in om je agenda op al je apparaten te zien.") + "</p>" +
      '<form id="acc-form" class="acc-form" novalidate>' +
      '<label for="acc-naam">Gebruikersnaam</label>' +
      '<input id="acc-naam" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="20" value="' + esc(naamWaarde) + '">' +
      '<label for="acc-pin">Pincode</label>' +
      '<input id="acc-pin" class="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="' + (reg ? "new-password" : "current-password") + '">' +
      (reg ? '<label for="acc-pin2">Herhaal pincode</label><input id="acc-pin2" class="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password">' : "") +
      melding +
      '<div class="knoppen"><button type="submit" class="hoofd"' + (bezigMetVerzoek ? " disabled" : "") + ">" + (reg ? "Account maken" : "Inloggen") + "</button>" +
      '<button type="button" class="zacht" data-actie="wissel">' + (reg ? "Ik heb al een account" : "Nieuw account") + "</button>" +
      (sessie ? '<button type="button" class="zacht" data-actie="toon-bio">Terug</button>' : "") +
      "</div></form>";
  }

  document.addEventListener("submit", (e) => {
    if (e.target.id === "pin-form") { e.preventDefault(); return pinWijzigen(); }
    if (e.target.id !== "acc-form") return;
    e.preventDefault();
    verstuurFormulier(formModus);
  });
  document.addEventListener("input", (e) => {
    if (!e.target.closest || !e.target.closest(".acc-form")) return;
    if (e.target.classList.contains("pin")) e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (e.target.id === "acc-naam") ingevuldeNaam = e.target.value;
  });
  document.addEventListener("click", (e) => {
    const k = e.target.closest("[data-actie]");
    if (!k) return;
    const actie = k.dataset.actie;
    if (actie !== "uitloggen") uitlogStap = 0;
    if (actie !== "overal") overalStap = 0;
    if (actie === "wissel") { formModus = formModus === "registreren" ? "inloggen" : "registreren"; accountMelding = ""; tekenAccount($("acc-naam") ? $("acc-naam").value : ""); }
    else if (actie === "ontgrendel") ontgrendel();
    else if (actie === "toon-pin") { toonPinFormulier = true; formModus = "inloggen"; accountMelding = ""; tekenAccount(); }
    else if (actie === "pin-in-instellingen") { toonPinFormulier = true; formModus = "inloggen"; accountMelding = ""; openInstellingen(true); }
    else if (actie === "toon-bio") { toonPinFormulier = false; accountMelding = ""; tekenAccount(); }
    else if (actie === "bio-aan") bioAanzetten();
    else if (actie === "bio-uit") bioUitzetten();
    else if (actie === "uitloggen") uitloggen();
    else if (actie === "overal") uitloggenOveral();
    else if (actie === "pin-wijzig") { pinFormulier = true; accountMelding = ""; tekenAccount(); const v = $("pin-oud"); if (v) v.focus(); }
    else if (actie === "pin-annuleer") { pinFormulier = false; accountMelding = ""; tekenAccount(); }
  });

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { vernieuw(); tekenOpenBalk(); werkNuBij(); } });
  window.addEventListener("online", () => vernieuw());

  // ---------- back-up ----------
  function meld(tekst) { $("melding").textContent = tekst; }
  $("exporteer").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app: "digigenda", versie: 2, opdrachten }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "digigenda-backup-" + vandaag() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    meld("Back-up gedownload (" + opdrachten.length + " opdrachten).");
  });
  $("importeer").addEventListener("change", (e) => {
    const bestand = e.target.files && e.target.files[0];
    if (!bestand) return;
    const lezer = new FileReader();
    lezer.onload = () => {
      if (sessie && !ontgrendeld) { meld("Ontgrendel eerst je account."); e.target.value = ""; return; }
      try {
        const data = JSON.parse(lezer.result);
        const lijst = Array.isArray(data) ? data : data.opdrachten;
        if (!Array.isArray(lijst)) throw new Error("geen lijst");
        let erbij = 0;
        const ids = [];
        lijst.forEach((o) => {
          const schoon = normaal(o);
          if (!schoon) return;
          const bestaand = opdrachten.findIndex((x) => x.id === schoon.id);
          if (bestaand >= 0) opdrachten[bestaand] = schoon; else { opdrachten.push(schoon); erbij++; }
          ids.push(schoon.id);
        });
        opslaan(ids);
        meld("Back-up teruggezet: " + erbij + " nieuwe opdrachten toegevoegd.");
      } catch (err) {
        meld("Dit bestand is geen geldige back-up. Kies het .json-bestand dat je eerder hebt gedownload.");
      }
      e.target.value = "";
    };
    lezer.readAsText(bestand);
  });

  // ---------- start ----------
  if (window.matchMedia && window.matchMedia("(max-width: 640px)").matches) snel.placeholder = "Bijv. ‘morgen 14:00 tandarts’";
  if (!opslagWerkt) toast("Let op: deze browser staat opslaan niet toe (bijvoorbeeld een privévenster).");
  tekenAlles();
  if (!instellingen.welkom && !sessie) toonWelkom();
  if (window.BIO) BIO.beschikbaar().then((ja) => { bioMogelijk = ja; if (accountPlek) tekenAccount(); });
  vernieuw();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").then(() => pushVernieuwen()).catch(() => {}));
    // Tik op een melding terwijl de app al open is: naar vandaag
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "naar-vandaag") { gekozen = vandaag(); weekendTonen = false; zetWeergave("dag"); }
    });
  }
  // Schermbreedte verandert (draaien, venster smaller): week en maand opnieuw tekenen
  if (window.matchMedia) {
    const opnieuw = () => { if (voorkeur.weergave === "week" || voorkeur.weergave === "maand") tekenHoofd(); };
    [window.matchMedia("(max-width: 760px)"), window.matchMedia("(max-width: 640px)")].forEach((m) => {
      if (m.addEventListener) m.addEventListener("change", opnieuw); else if (m.addListener) m.addListener(opnieuw);
    });
  }
})();
