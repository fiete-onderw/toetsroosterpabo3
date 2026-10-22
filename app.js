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
  const WEERGAVEN = ["maand", "week", "dag", "opdrachten"];

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

  function normaal(o) {
    if (!o || typeof o.titel !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.datum || "")) return null;
    return {
      id: String(o.id || nieuwId()).slice(0, 40),
      titel: o.titel.slice(0, 80),
      datum: o.datum,
      tijd: /^([01]\d|2[0-3]):[0-5]\d$/.test(o.tijd || "") ? o.tijd : null,
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
      welkom: !!x.welkom
    };
  }
  let instellingen = normaleInstellingen(laad(INST, null), laad(OUDE_VOORKEUR, null));
  let voorkeur = laad(VOORKEUR, null);
  if (!voorkeur || typeof voorkeur !== "object") voorkeur = {};
  if (!WEERGAVEN.includes(voorkeur.weergave)) voorkeur.weergave = "maand";
  if (!Array.isArray(voorkeur.verborgen)) voorkeur.verborgen = [];
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
  const nogOpen = () => { const v = vandaag(); return opdrachten.filter((o) => !o.klaar && o.datum < v && zichtbaar(o)).sort(opVolgorde); };

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
    document.querySelectorAll("[data-weergave]").forEach((b) => {
      const ja = b.dataset.weergave === voorkeur.weergave;
      b.setAttribute("aria-selected", String(ja));
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

  // Eén regel in de dag- en lijstweergave
  function rij(o, metDatum) {
    const meta = [];
    if (metDatum) meta.push(dagKort(o.datum));
    if (instellingen.agendas.length > 1) meta.push(AGENDA_NAAM[o.agenda]);
    if (o.soort !== "opdracht") meta.push(SOORT_LABEL[o.soort]);
    return '<li class="rij' + (o.klaar ? " klaar" : "") + '" style="--c:' + agendaKleur(o.agenda) + '">' +
      '<button type="button" class="vink" data-klaar="' + esc(o.id) + '" aria-pressed="' + o.klaar + '" aria-label="' + (o.klaar ? "Weer openzetten: " : "Afvinken: ") + esc(o.titel) + '">' + vinkSvg + "</button>" +
      '<div class="rij-tekst">' +
      (o.tijd ? '<span class="rij-tijd">' + o.tijd + "</span>" : "") +
      '<span class="rij-titel">' + esc(o.titel) + "</span>" +
      (meta.length ? '<span class="rij-meta">' + esc(meta.join(" · ")) + "</span>" : "") +
      (o.notitie ? '<p class="rij-notitie">' + esc(o.notitie) + "</p>" : "") +
      "</div>" +
      '<div class="rij-acties">' +
      (!o.klaar ? '<button type="button" class="mini" data-schuif="' + esc(o.id) + '">' + schuifLabel(o) + "</button>" : "") +
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
          if (aantal++ < max) chips += '<button type="button" class="chip eigen' + (o.klaar ? " klaar" : "") + (o.soort !== "opdracht" ? " nadruk" : "") + '" data-id="' + esc(o.id) + '" style="--c:' + agendaKleur(o.agenda) + '" title="' + esc((o.tijd ? o.tijd + " " : "") + o.titel) + '"><span>' + esc(o.titel) + "</span></button>";
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

  // ---------- weekweergave ----------
  function tekenWeek() {
    const ma = maandagVan(gekozen);
    const zo = plusDagen(ma, 6);
    const vs = vandaag();
    const d1 = ontleed(ma), d2 = ontleed(zo);
    const titel = d1.getMonth() === d2.getMonth()
      ? d1.getDate() + " – " + d2.getDate() + " " + MAANDEN[d2.getMonth()]
      : d1.getDate() + " " + KORT[d1.getMonth()] + " – " + d2.getDate() + " " + KORT[d2.getMonth()];
    let kolommen = "";
    for (let i = 0; i < 7; i++) {
      const s = plusDagen(ma, i);
      const d = ontleed(s);
      const vak = vakantieOp(s);
      const vast = vastOp(s);
      const eigen = eigenOp(s);
      const vakLabel = vak && (i === 0 || s === vak.start);
      kolommen += '<section class="weekdag' + (s === vs ? " vandaag" : "") + (i >= 5 ? " weekend" : "") + (vak ? " vakantie" : "") + '">' +
        '<button type="button" class="weekdag-kop" data-naar-dag="' + s + '"><span class="wd">' + DAGEN[i] + '</span><span class="nr">' + d.getDate() + "</span>" +
        (vakLabel ? '<span class="vaklabel">' + esc(vak.naam) + "</span>" : "") + "</button>" +
        '<ul class="weeklijst">' +
        vast.map((v) => '<li class="wchip vast" style="--c:' + vastKleur(v.soort) + '">' + slot() + "<span>" + esc(v.titel) + "</span></li>").join("") +
        eigen.map((o) => '<li><button type="button" class="wchip' + (o.klaar ? " klaar" : "") + (o.soort !== "opdracht" ? " nadruk" : "") + '" data-bewerk="' + esc(o.id) + '" style="--c:' + agendaKleur(o.agenda) + '">' +
          (o.tijd ? "<b>" + o.tijd + "</b> " : "") + "<span>" + esc(o.titel) + "</span></button></li>").join("") +
        "</ul>" +
        '<button type="button" class="plus" data-nieuw="' + s + '" aria-label="Opdracht toevoegen op ' + langDatum(s) + '">+</button>' +
        "</section>";
    }
    const kortTitel = d1.getDate() + (d1.getMonth() === d2.getMonth() ? "" : " " + KORT[d1.getMonth()]) + "–" + d2.getDate() + " " + KORT[d2.getMonth()] + " · wk " + weeknummer(d1);
    $("hoofd").innerHTML = navBalk(titel + " " + d2.getFullYear() + " · week " + weeknummer(d1), "Deze week", kortTitel) +
      '<div class="weekraster">' + kolommen + "</div>";
  }

  // ---------- dagweergave (rustige lijst) ----------
  function tekenDag() {
    const s = gekozen;
    const vak = vakantieOp(s);
    const per = periodeOp(s);
    const vast = vastOp(s);
    const eigen = eigenOp(s);
    const zonderTijd = eigen.filter((o) => !o.tijd);
    const metTijd = eigen.filter((o) => o.tijd);
    const info = [per ? per.naam : "", vak ? vak.naam : ""].filter(Boolean).join(" · ");
    let html = navBalk(dagTitel(s) + (s === vandaag() ? " · vandaag" : ""), "Vandaag", hoofd(dagKort(s)));
    if (info) html += '<p class="label dag-info">' + esc(info) + "</p>";
    if (!vast.length && !eigen.length) {
      html += '<p class="leeg groot-leeg">Niets gepland. Typ hierboven iets als <em>“' + esc(s === vandaag() ? "vandaag" : DAGEN_LANG[ontleed(s).getDay()]) + ' boodschappen doen”</em>.</p>';
    } else {
      if (vast.length) html += '<ul class="rijen">' + vast.map(vastRij).join("") + "</ul>";
      if (zonderTijd.length) html += '<h3 class="groep-kop">Hele dag</h3><ul class="rijen">' + zonderTijd.map((o) => rij(o, false)).join("") + "</ul>";
      if (metTijd.length) html += '<h3 class="groep-kop">Met tijd</h3><ul class="rijen">' + metTijd.map((o) => rij(o, false)).join("") + "</ul>";
    }
    html += '<div class="knoppen"><button type="button" class="hoofd" data-nieuw="' + s + '">+ Opdracht op deze dag</button></div>';
    $("hoofd").innerHTML = html;
  }

  // ---------- opdrachtenlijst (apart kopje) ----------
  function tekenOpdrachten() {
    const v = vandaag();
    const over7 = plusDagen(v, 7);
    const zicht = opdrachten.filter(zichtbaar).sort(opVolgorde);
    const eerder = zicht.filter((o) => !o.klaar && o.datum < v);
    const nuDag = zicht.filter((o) => o.datum === v);
    const komend = zicht.filter((o) => !o.klaar && o.datum > v && o.datum <= over7);
    const later = zicht.filter((o) => !o.klaar && o.datum > over7);
    const af = zicht.filter((o) => o.klaar && o.datum !== v).sort((a, b) => b.datum.localeCompare(a.datum));

    const groep = (titel, lijst, extra, leeg) => '<section class="groep"><div class="groep-titel"><h3>' + titel + ' <span class="aantal">' + lijst.length + "</span></h3>" + (extra || "") + "</div>" +
      (lijst.length ? '<ul class="rijen">' + lijst.map((o) => rij(o, true)).join("") + "</ul>" : '<p class="leeg">' + (leeg || "Niets.") + "</p>") + "</section>";

    let html = '<div class="balk"><h2>Opdrachten</h2></div>';
    if (!zicht.length) {
      html += '<p class="leeg groot-leeg">Nog geen opdrachten. Typ hierboven bijvoorbeeld <em>“morgen 14:00 tandarts”</em> en druk op Enter.</p>';
    } else {
      if (eerder.length) html += groep("Nog open van eerder", eerder, '<button type="button" class="mini" data-alles-vandaag>Alles naar vandaag</button>');
      html += groep("Vandaag", nuDag, "", "Niets voor vandaag.");
      html += groep("Komende 7 dagen", komend, "", "Niets gepland voor de komende week.");
      if (later.length) html += groep("Later", later);
      if (af.length) html += '<details class="groep"><summary><h3>Afgerond <span class="aantal">' + af.length + '</span></h3></summary><ul class="rijen">' + af.slice(0, 100).map((o) => rij(o, true)).join("") + "</ul></details>";
    }
    $("hoofd").innerHTML = html;
  }

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
    if (!open.length || voorkeur.openGezien === vandaag() || voorkeur.weergave === "opdrachten" || (sessie && !ontgrendeld)) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = "<p>Je hebt <strong>" + open.length + "</strong> opdracht" + (open.length === 1 ? "" : "en") + " van eerdere dagen die nog " + (open.length === 1 ? "openstaat" : "openstaan") + ".</p>" +
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
    else tekenOpdrachten();
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
    return voorkeur.weergave === "opdrachten" ? vandaag() : gekozen;
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
    if (r.tijd) delen.push(r.tijd);
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
    el.innerHTML = "<strong>" + goed.length + " opdrachten</strong> worden toegevoegd:" +
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
    const nieuw = lijst.map((r) => normaal({ id: nieuwId() + Math.random().toString(36).slice(2, 4), titel: r.titel, datum: r.datum, tijd: r.tijd, soort: r.soort, agenda: r.agenda, notitie: "", klaar: false }));
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
    toast(nieuw.length === 1 ? "Toegevoegd op " + dagKort(nieuw[0].datum) + (nieuw[0].tijd ? " om " + nieuw[0].tijd : "") : nieuw.length + " opdrachten toegevoegd", () => {
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
  function openVenster(id, datum) {
    if (sessie && !ontgrendeld) { toast("Ontgrendel eerst je account."); return; }
    bewerkId = id || null;
    verwijderStap = 0;
    const o = id ? opdrachten.find((x) => x.id === id) : null;
    $("venstertitel").textContent = o ? "Opdracht wijzigen" : "Opdracht toevoegen";
    $("f-titel").value = o ? o.titel : "";
    $("f-datum").value = o ? o.datum : (datum || gekozen);
    $("f-tijd").value = o && o.tijd ? o.tijd : "";
    const agendaLijst = AGENDAS.filter((a) => agendaAan(a) || (o && o.agenda === a));
    $("f-agenda").innerHTML = agendaLijst.map((a) => '<option value="' + a + '">' + AGENDA_NAAM[a] + "</option>").join("");
    $("f-agenda").value = o ? o.agenda : (voorkeur.snelAgenda && agendaAan(voorkeur.snelAgenda) ? voorkeur.snelAgenda : instellingen.agendas[0]);
    $("f-agenda-rij").hidden = agendaLijst.length < 2;
    $("f-soort").value = o ? o.soort : "opdracht";
    $("f-notitie").value = o ? (o.notitie || "") : "";
    $("f-klaar").checked = o ? !!o.klaar : false;
    $("f-fout").textContent = "";
    $("f-verwijder").hidden = !o;
    $("f-verwijder").textContent = "Verwijderen";
    if (typeof venster.showModal === "function") venster.showModal(); else venster.setAttribute("open", "");
    $("f-titel").focus();
  }
  function sluitVenster() { if (typeof venster.close === "function") venster.close(); else venster.removeAttribute("open"); }

  $("formulier").addEventListener("submit", (e) => {
    e.preventDefault();
    const titel = $("f-titel").value.trim();
    const datum = $("f-datum").value;
    if (!titel) { $("f-fout").textContent = "Vul een titel in."; $("f-titel").focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) { $("f-fout").textContent = "Kies een datum."; $("f-datum").focus(); return; }
    const tijd = $("f-tijd").value;
    const gegevens = { titel, datum, tijd: /^\d{2}:\d{2}$/.test(tijd) ? tijd : null, soort: $("f-soort").value, agenda: $("f-agenda").value || instellingen.agendas[0], notitie: $("f-notitie").value.trim(), klaar: $("f-klaar").checked };
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
    voorkeur.weergave = w;
    bewaarVoorkeur();
    if (w === "maand") { const d = ontleed(gekozen); maand = { j: d.getFullYear(), m: d.getMonth() }; }
    tekenAlles();
    tekenVoorbeeld();
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
    const t = e.target.closest("[data-klaar],[data-bewerk],[data-nieuw],[data-schuif],[data-nav],[data-naar-dag],[data-filter],[data-open],[data-alles-vandaag],.chip.eigen,.dag,[data-j]");
    if (!t) return;
    if (t.closest("#venster")) return;
    if (t.matches(".chip.eigen")) { e.stopPropagation(); kiesDag(t.closest(".dag").dataset.datum); openVenster(t.dataset.id); return; }
    if (t.matches(".dag")) { kiesDag(t.dataset.datum); return; }
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
    if (t.dataset.open === "bekijk") { voorkeur.openGezien = vandaag(); bewaarVoorkeur(); return zetWeergave("opdrachten"); }
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
    tekenAccount();
    tekenInstellingen();
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
  });
  inst.addEventListener("click", (e) => {
    const t = e.target.closest("[data-dg],[data-link],[data-installeer]");
    if (!t) return;
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
    const { naam, token } = sessie;
    CLOUD.uitloggen(token).catch(() => {});
    weg(SESSIE); weg(CACHE + naam); weg(WACHT + naam);
    sessie = null; ontgrendeld = false; uitlogStap = 0; agendaLink = null; linkMelding = "";
    syncStatus = ""; formModus = "inloggen";
    accountMelding = "Je bent uitgelogd. Je opdrachten staan veilig online.";
    accountFout = false;
    laadEigen();
    tekenAlles();
  }

  function tekenAccount(vulNaam) {
    const el = accountPlek;
    if (!el) return;
    if (!window.CLOUD || !CLOUD.aan) { el.innerHTML = ""; return; }
    const inWelkom = el.id === "welkom-account";
    const kop = (t, l) => inWelkom ? "" : '<div class="dagkop"><h4>' + t + "</h4>" + (l ? '<span class="label">' + l + "</span>" : "") + "</div>";
    const melding = accountMelding ? '<p class="klein acc-melding' + (accountFout ? " te-laat" : "") + '" role="status">' + esc(accountMelding) + "</p>" : "";

    if (actief()) {
      const status = { bezig: "Bezig met opslaan…", ok: "Alles staat online.", fout: "Niet alles staat online. Wordt opnieuw geprobeerd zodra er verbinding is." }[syncStatus] || "";
      el.innerHTML = kop("Account", "Online") +
        '<p class="klein">Ingelogd als <strong>' + esc(sessie.naam) + "</strong>." + (status ? " " + esc(status) : "") + "</p>" + melding +
        '<div class="knoppen">' +
        (bioMogelijk ? (sessie.faceid
          ? '<button type="button" class="zacht" data-actie="bio-uit">' + esc(hoofd(BIO.naam)) + " uitzetten</button>"
          : '<button type="button" class="zacht" data-actie="bio-aan">' + esc(hoofd(BIO.naam)) + " aanzetten</button>") : "") +
        '<button type="button" class="zacht" data-actie="uitloggen">Uitloggen</button></div>';
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
    if (actie === "wissel") { formModus = formModus === "registreren" ? "inloggen" : "registreren"; accountMelding = ""; tekenAccount($("acc-naam") ? $("acc-naam").value : ""); }
    else if (actie === "ontgrendel") ontgrendel();
    else if (actie === "toon-pin") { toonPinFormulier = true; formModus = "inloggen"; accountMelding = ""; tekenAccount(); }
    else if (actie === "pin-in-instellingen") { toonPinFormulier = true; formModus = "inloggen"; accountMelding = ""; openInstellingen(true); }
    else if (actie === "toon-bio") { toonPinFormulier = false; accountMelding = ""; tekenAccount(); }
    else if (actie === "bio-aan") bioAanzetten();
    else if (actie === "bio-uit") bioUitzetten();
    else if (actie === "uitloggen") uitloggen();
  });

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { vernieuw(); tekenOpenBalk(); } });
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
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
