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
  // Uiterlijk: kleuren per agenda en accent, elk met een lichte en een donkere variant (alle paren halen 4,5:1)
  const KLEUREN = {
    blauw: ["Inktblauw", "#2b5a86", "#8ab6e4"], groen: ["Mosgroen", "#2f6b4f", "#7fcba3"], teal: ["Zeegroen", "#1f6e6a", "#5fc4bd"],
    pruim: ["Pruim", "#8e3a63", "#e58ab8"], paars: ["Lavendel", "#6450a8", "#b9a3ee"], roest: ["Roest", "#a3472a", "#f0a07f"],
    oker: ["Oker", "#8a6414", "#e2b858"], leisteen: ["Leisteen", "#4a5568", "#a9b6cb"]
  };
  const ACCENTEN = ["blauw", "groen", "pruim", "roest", "leisteen"];
  const THEMAS = { auto: "Automatisch", licht: "Licht", donker: "Donker" };
  const STANDAARD_KLEUR = { school: "blauw", werk: "teal", persoonlijk: "pruim" };
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
  const isTodo = (o) => !o.tijd && !o.bron;
  const isHeleDag = (o) => !o.tijd && !!o.bron;
  const tijdTekst = (o) => o.tijd ? o.tijd + (o.eind ? "–" + o.eind : "") : (o.eind ? "tot " + o.eind : (o.bron ? "hele dag" : ""));
  // Eindigt een afspraak de volgende dag (bijv. een nachtdienst 22:00–06:00)?
  const overMiddernacht = (o) => !!(o.tijd && o.eind && o.eind < o.tijd);
  const eindMinuten = (o) => { const s = minuten(o.tijd); let e = o.eind ? minuten(o.eind) : s + 60; if (e <= s) e += 24 * 60; return e; };

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
    if (tijd && eind && eind === tijd) eind = null;
    return {
      id: String(o.id || nieuwId()).slice(0, 40),
      titel: o.titel.slice(0, 80),
      datum: o.datum,
      tijd,
      eind,
      soort: SOORTEN.includes(o.soort) ? o.soort : "opdracht",
      agenda: AGENDAS.includes(o.agenda) ? o.agenda : "school",
      notitie: String(o.notitie || "").slice(0, 400),
      klaar: !!o.klaar,
      bron: /^[a-z0-9-]{4,40}$/.test(o.bron || "") ? o.bron : null
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
      },
      meeplannen: {
        gaten: !(x.meeplannen && x.meeplannen.gaten === false),
        dagstart: !(x.meeplannen && x.meeplannen.dagstart === false),
        avond: !(x.meeplannen && x.meeplannen.avond === false)
      },
      uiterlijk: normaalUiterlijk(x.uiterlijk),
      ritme: normaalRitme(x.ritme)
    };
  }
  // Dagritme: wanneer loopt je dag, wanneer studeer je het liefst, hoeveel pauze tussen afspraken
  const RITME_STUDEREN = { ochtend: "’s ochtends", middag: "’s middags", avond: "’s avonds" };
  function normaalRitme(r) {
    const x = r && typeof r === "object" ? r : {};
    const van = Number.isInteger(x.van) && x.van >= 5 && x.van <= 12 ? x.van : 8;
    const tot = Number.isInteger(x.tot) && x.tot >= 17 && x.tot <= 24 ? x.tot : 22;
    return { van, tot: Math.max(tot, van + 6), studeren: RITME_STUDEREN[x.studeren] ? x.studeren : "middag", pauze: [0, 15, 30].includes(x.pauze) ? x.pauze : 0 };
  }
  function normaalUiterlijk(u) {
    const x = u && typeof u === "object" ? u : {};
    const k = x.kleuren && typeof x.kleuren === "object" ? x.kleuren : {};
    const kleuren = {};
    AGENDAS.forEach((a) => { kleuren[a] = KLEUREN[k[a]] ? k[a] : STANDAARD_KLEUR[a]; });
    return { thema: THEMAS[x.thema] ? x.thema : "auto", accent: ACCENTEN.includes(x.accent) ? x.accent : "blauw", kleuren, start: ["auto", "dag", "week", "maand", "lijst"].includes(x.start) ? x.start : "auto" };
  }
  // Zet thema, accent en agendakleuren op de pagina; donker volgt het toestel tenzij de gebruiker kiest
  const donkerGewenst = () => !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  function pasUiterlijkToe() {
    const u = instellingen.uiterlijk;
    const html = document.documentElement;
    html.dataset.thema = u.thema;
    const donker = u.thema === "donker" || (u.thema === "auto" && donkerGewenst());
    const kies = (sleutel) => KLEUREN[sleutel][donker ? 2 : 1];
    html.style.setProperty("--accent", kies(u.accent));
    html.style.setProperty("--toets", kies(u.accent));
    AGENDAS.forEach((a) => html.style.setProperty("--ag-" + a, kies(u.kleuren[a])));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", donker ? "#14161c" : "#f5f1ec");
  }
  let instellingen = normaleInstellingen(laad(INST, null), laad(OUDE_VOORKEUR, null));
  pasUiterlijkToe();
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", pasUiterlijkToe);
  let voorkeur = laad(VOORKEUR, null);
  if (!voorkeur || typeof voorkeur !== "object") voorkeur = {};
  if (!Array.isArray(voorkeur.verborgen)) voorkeur.verborgen = [];
  // Startscherm: telefoon opent op Vandaag (dag), laptop op de maand
  const telefoon = () => !!(window.matchMedia && window.matchMedia("(max-width: 640px)").matches);
  const smalScherm = () => !!(window.matchMedia && window.matchMedia("(max-width: 760px)").matches);
  voorkeur.weergave = instellingen.uiterlijk.start !== "auto" ? instellingen.uiterlijk.start : (telefoon() ? "dag" : "maand");
  let weekendTonen = false;
  const bewaarVoorkeur = () => bewaar(VOORKEUR, voorkeur);

  // ---------- sessie en opdrachten ----------
  let sessie = laad(SESSIE, null);
  if (!sessie || typeof sessie.token !== "string" || typeof sessie.naam !== "string") sessie = null;
  if (!window.CLOUD || !CLOUD.aan) sessie = null;
  // Face ID: pas na een tijd zonder gebruik opnieuw ontgrendelen (standaard 15 minuten, instelbaar per apparaat)
  const VERGRENDEL_KEUZES = [[0, "altijd bij openen"], [5, "na 5 minuten"], [15, "na 15 minuten"], [60, "na 1 uur"], [240, "na 4 uur"]];
  const vergrendelNa = () => { const n = voorkeur.vergrendelNa; return VERGRENDEL_KEUZES.some(([m]) => m === n) ? n : 15; };
  const laatstActief = () => { const t = laad(SESSIE, null); return t && typeof t.laatstActief === "number" ? t.laatstActief : 0; };
  const nogVers = () => !!sessie && !!sessie.faceid && vergrendelNa() > 0 && Date.now() - laatstActief() < vergrendelNa() * 60000;
  let ontgrendeld = !!sessie && (!sessie.faceid || nogVers());
  const actief = () => !!sessie && ontgrendeld;
  function noteerActief() { if (sessie && ontgrendeld) { sessie.laatstActief = Date.now(); bewaar(SESSIE, sessie); } }
  function vergrendelAlsNodig() {
    if (!sessie || !sessie.faceid || !ontgrendeld) return;
    if (vergrendelNa() === 0 || Date.now() - laatstActief() >= vergrendelNa() * 60000) {
      ontgrendeld = false;
      if (venster.open) sluitVenster();
      if (inst.open) sluitInstellingen();
      laadEigen(); tekenAlles();
    }
  }

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
  const ICOON_PERSOON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 19.5c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICOON_SLOT = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  function tekenKop() {
    $("ondertitel").textContent = paboAan() ? "HAN Pabo 3 · studiejaar " + P.schooljaar : "School, werk en privé in één agenda";
    $("kopGroet").textContent = groet();
    const k = $("accountKnop");
    document.body.classList.toggle("zonder-account", !window.CLOUD || !CLOUD.aan);
    if (!window.CLOUD || !CLOUD.aan) { k.hidden = true; return; }
    k.hidden = false;
    let lang, rond, label;
    if (actief()) { lang = sessie.naam; rond = esc(sessie.naam.charAt(0).toUpperCase()); label = "Account en instellingen (" + sessie.naam + ")"; }
    else if (sessie) { lang = "Vergrendeld"; rond = ICOON_SLOT; label = "Vergrendeld: ontgrendelen"; }
    else { lang = "Inloggen"; rond = ICOON_PERSOON; label = "Inloggen en instellingen"; }
    k.innerHTML = '<span class="ak-rond" aria-hidden="true">' + rond + '</span><span class="ak-lang">' + esc(lang) + "</span>";
    k.setAttribute("aria-label", label);
    k.classList.toggle("ingelogd", actief());
  }

  function tekenTabs() {
    const w = voorkeur.weergave;
    document.body.dataset.scherm = w;
    $("kopModus").innerHTML = "";
    document.querySelectorAll("[data-weergave]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.weergave === w)));
    const onder = w;
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

  // Eén regel in de dag-, lijst- en zijweergave. To-do's hebben een rondje om af te vinken, blokken (met tijd) een tijdstip.
  // Tik op de tekst = wijzigen. Op de telefoon: naar links vegen = doorschuiven, lang indrukken = menu.
  const vanLabel = (s) => { const dagen = Math.round((ontleed(vandaag()) - ontleed(s)) / 864e5); return dagen === 1 ? "van gisteren" : dagen < 7 ? "van " + DAGEN_KORT_ZO[ontleed(s).getDay()] : "van " + kortDatum(s); };
  // "over 6 dagen" bij deadlines en toetsen; alleen de komende twee weken
  function aftelling(datum) {
    const n = Math.round((ontleed(datum) - ontleed(vandaag())) / 864e5);
    if (n <= 0 || n > 14) return "";
    return " · " + (n === 1 ? "morgen" : "over " + n + " dagen");
  }
  function rij(o, metDatum, opties) {
    const blok = !isTodo(o);
    const klaar = !blok && o.klaar;
    const meta = [];
    if (opties && opties.van) meta.push(vanLabel(o.datum));
    else if (metDatum) meta.push(dagKort(o.datum));
    if (o.soort !== "opdracht" && o.soort !== "afspraak") meta.push(SOORT_LABEL[o.soort] + (["deadline", "toets", "herkansing"].includes(o.soort) ? aftelling(o.datum) : ""));
    if (!blok && o.eind) meta.push("tot " + o.eind);
    if (blok && overMiddernacht(o)) meta.push("tot de volgende ochtend");
    if (o.bron) meta.push("via " + importNaam(o.bron));
    const links = blok
      ? '<span class="tijdstip' + (o.tijd ? "" : " heledag") + '" aria-label="' + esc(tijdTekst(o)) + '">' + (o.tijd ? o.tijd + (o.eind ? "<small>" + o.eind + "</small>" : "") : "dag") + "</span>"
      : '<button type="button" class="vink" data-klaar="' + esc(o.id) + '" aria-pressed="' + klaar + '" aria-label="' + (klaar ? "Weer openzetten: " : "Afvinken: ") + esc(o.titel) + '">' + vinkSvg + "</button>";
    const veeg = !blok && !o.klaar;
    return '<li class="rij' + (klaar ? " klaar" : "") + (blok ? " blokrij" : "") + (veeg ? " veegbaar" : "") + (o.bron ? " import" : "") + '" style="--c:' + agendaKleur(o.agenda) + '" data-id="' + esc(o.id) + '"' +
      (veeg ? ' data-veeg="' + esc(schuifLabel(o)) + '"' : "") + ">" + links +
      '<div class="rij-tekst" data-bewerk="' + esc(o.id) + '" role="button" tabindex="0" aria-label="Wijzigen: ' + esc(o.titel) + '">' +
      '<span class="rij-titel">' + esc(o.titel) + "</span>" +
      (meta.length ? '<span class="rij-meta">' + esc(meta.join(" · ")) + "</span>" : "") +
      (o.notitie ? '<p class="rij-notitie">' + esc(o.notitie) + "</p>" : "") +
      "</div>" +
      (veeg ? '<div class="rij-acties"><button type="button" class="mini" data-plan="' + esc(o.id) + '">Plan in</button><button type="button" class="mini" data-schuif="' + esc(o.id) + '">' + schuifLabel(o) + "</button></div>" : "") +
      "</li>";
  }

  function vastRij(v, metDatum) {
    const studie = (v.soort === "lkt" || v.soort === "toets") && v.datum && v.datum > vandaag();
    const meta = (metDatum && v.datum ? dagKort(v.datum) + " · " : "") + (VAST_LABEL[v.soort] || "") + (v.datum && v.soort !== "periode" ? aftelling(v.datum) : "");
    return '<li class="rij vast' + (studie ? " met-studie" : "") + '" style="--c:' + vastKleur(v.soort) + '"><span class="vast-blok">' + slot() + "</span>" +
      '<div class="rij-tekst"><span class="rij-titel">' + esc(v.titel) + '</span><span class="rij-meta">' + esc(meta) + "</span>" +
      (v.uitleg ? '<p class="rij-notitie">' + esc(v.uitleg) + "</p>" : "") +
      (studie ? '<button type="button" class="tekstknop klein-knop studie-knop" data-studie-titel="' + esc(v.titel) + '" data-studie-datum="' + esc(v.datum) + '">Studieblokken plannen</button>' : "") + "</div></li>";
  }

  // Bovenkant van elk scherm: grote titel, één rustige regel eronder
  function heroHtml(o) {
    return '<div class="hero">' +
      (o.groet ? '<p class="hero-groet">' + esc(groet()) + "</p>" : "") +
      '<div class="hero-rij"><h2 class="hero-titel">' + esc(o.titel) + "</h2>" +
      (o.nav ? '<div class="hero-nav">' + (o.terug ? '<button type="button" class="terugknop' + (o.huidig ? " huidig" : "") + '" data-nav="0"' + (o.huidig ? ' aria-disabled="true"' : "") + ">" + esc(o.terug) + "</button>" : "") +
        '<button type="button" class="pijl-zacht" data-nav="-1" aria-label="Vorige">‹</button><button type="button" class="pijl-zacht" data-nav="1" aria-label="Volgende">›</button></div>' : "") +
      "</div>" +
      (o.sub || (o.terug && !o.nav) ? '<div class="hero-sub"><span class="hero-tekst">' + (o.sub || "") + "</span>" +
        (o.terug && !o.nav ? '<button type="button" class="terugknop" data-nav="0">' + esc(o.terug) + "</button>" : "") + "</div>" : "") +
      "</div>";
  }
  const waarTypen = () => telefoon() ? "onderin" : "hierboven";

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

    const nu2 = new Date();
    const dezeMaand = maand.j === nu2.getFullYear() && maand.m === nu2.getMonth();
    const per = periodeOp(maand.j + "-" + pad(maand.m + 1) + "-15");
    $("hoofd").innerHTML = heroHtml({ titel: hoofd(MAANDEN[maand.m]) + " " + maand.j, nav: true, terug: "Vandaag", huidig: dezeMaand, sub: per ? esc(per.naam) : "" }) +
      '<div class="grid-scroll"><div class="grid" id="grid" role="grid">' + html + "</div></div>" +
      '<ul class="legenda" aria-label="Legenda">' + legenda + "</ul>";
  }

  // ---------- tijdblokken (dag en week) ----------
  const UUR_BEGIN = 7, UUR_EIND = 22;

  // Zet afspraken om in blokken met kolommen, zodat afspraken die overlappen naast elkaar staan
  function blokkenVan(lijst, datum) {
    const blokken = lijst.filter((o) => o.tijd).map((o) => {
      const s = minuten(o.tijd);
      const e = eindMinuten(o);
      return { o, s, e, ev: Math.min(24 * 60, Math.max(e, s + 30)) };
    });
    // Nachtdiensten van gisteren lopen door tot hun eindtijd vandaag
    if (datum) opdrachten.forEach((o) => {
      if (o.datum === plusDagen(datum, -1) && !isTodo(o) && overMiddernacht(o) && zichtbaar(o)) {
        const e = minuten(o.eind);
        blokken.push({ o, s: 0, e, ev: Math.max(e, 30), vervolg: true });
      }
    });
    blokken.sort((a, b) => a.s - b.s || b.ev - a.ev);
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
  // Alle blokken op een dag: afspraken met begintijd, plus het vervolg van een nachtdienst van gisteren
  const blokkenOp = (d) => blokkenVan(eigenOp(d).filter((o) => !isTodo(o)), d);
  function blokHtml(x, b, datum, e) {
    const o = x.o;
    if (x.ev <= b * 60 || x.s >= e * 60) return "";
    const s0 = Math.max(x.s, b * 60);
    const hoog = (Math.min(x.ev, e * 60) - s0) / 60;
    const kort = Math.min(x.ev, e * 60) - s0 < 50;
    const extra = o.soort !== "opdracht" && o.soort !== "afspraak" ? SOORT_LABEL[o.soort] : "";
    return '<button type="button" class="blok' + blokStatus(x, datum) + (kort ? " kort" : "") + (extra ? " nadruk" : "") + (x.n > 1 ? " deel" : "") + (x.vervolg ? " vervolg" : "") + (o.bron ? " import" : "") + '" data-bewerk="' + esc(o.id) + '" data-s="' + x.s + '" data-e="' + x.e + '"' +
      ' aria-label="' + esc((x.vervolg ? "Sinds gisteren " + o.tijd + ", tot " + o.eind : tijdTekst(o)) + " " + o.titel) + '"' +
      ' style="--c:' + agendaKleur(o.agenda) + ";top:calc(var(--uurh) * " + ((s0 - b * 60) / 60).toFixed(4) + ");height:calc(var(--uurh) * " + hoog.toFixed(4) + " - 2px);" +
      "left:calc(" + (x.kol / x.n * 100).toFixed(3) + "% + 2px);width:calc(" + (100 / x.n).toFixed(3) + '% - 4px)">' +
      '<span class="blok-tijd">' + (x.vervolg ? "tot " + o.eind : o.tijd + (o.eind ? '<span class="tot">–' + o.eind + "</span>" : "")) + "</span>" +
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
    if (metTijd && instellingen.meeplannen.gaten) {
      gatenOp(d, 60).forEach((g) => {
        const s0 = Math.max(g.s, b * 60), e0 = Math.min(g.e, e * 60);
        if (e0 - s0 < 60) return;
        h += '<button type="button" class="gat" data-gat="' + d + "|" + klok(s0) + "|" + klok(e0) + '" style="top:calc(var(--uurh) * ' + ((s0 - b * 60) / 60).toFixed(4) + ");height:calc(var(--uurh) * " + ((e0 - s0) / 60).toFixed(4) + ' - 2px)" aria-label="Vrij van ' + klok(s0) + " tot " + klok(e0) + ', iets inplannen"><span>' + klok(s0) + "–" + klok(e0) + " vrij</span></button>";
      });
    }
    h += blokken.map((x) => blokHtml(x, b, d, e)).join("");
    if (d === vandaag()) h += nuLijnHtml(b, e, metTijd);
    return h + "</div>";
  }

  // ---------- meeplannen: vrije tijd, inplannen, studieblokken ----------
  const planBegin = () => instellingen.ritme.van * 60, planEind = () => instellingen.ritme.tot * 60;
  // Vrije stukken op een dag tussen 08:00 en 22:00 (vandaag: vanaf nu, afgerond op een kwartier), minstens minDuur minuten
  function gatenOp(d, minDuur, venster) {
    const van = venster ? venster[0] : planBegin(), tot = venster ? venster[1] : planEind();
    const pauze = instellingen.ritme.pauze;
    let start = van;
    if (d === vandaag()) start = Math.max(start, Math.ceil(nuMinuten() / 15) * 15);
    if (d < vandaag()) return [];
    const bezet = blokkenOp(d).map((x) => [x.s - pauze, Math.min(x.e, 24 * 60) + pauze]).sort((a, b) => a[0] - b[0]);
    const uit = [];
    let p = start;
    for (const [bs, be] of bezet) {
      if (be <= p) continue;
      if (bs > p && bs - p >= minDuur) uit.push({ s: p, e: Math.min(bs, tot) });
      p = Math.max(p, be);
      if (p >= tot) break;
    }
    if (p < tot && tot - p >= minDuur) uit.push({ s: p, e: tot });
    return uit.filter((g) => g.e - g.s >= minDuur);
  }
  // Eerste gat van 'duur' minuten op of na een datum (hoogstens 'dagen' dagen vooruit); 'uiterlijk' = eindtijd die niet overschreden mag worden
  function eersteGat(d, duur, dagen, uiterlijk) {
    for (let i = 0; i <= dagen; i++) {
      const dag = plusDagen(d, i);
      const g = gatenOp(dag, duur, uiterlijk ? [planBegin(), Math.min(planEind(), minuten(uiterlijk))] : null).find((x) => x.e - x.s >= duur);
      if (g) return { datum: dag, s: g.s, e: g.s + duur };
    }
    return null;
  }
  // To-do met één tik inplannen in het eerste passende gat (wordt een blok in de agenda)
  function planIn(id) {
    const o = opdrachten.find((x) => x.id === id);
    if (!o || o.tijd) return;
    const v = vandaag();
    const d = o.datum < v ? v : o.datum;
    const duur = 60;
    // Met een deadline-tijd: alleen die dag vóór die tijd; anders die dag, en pas daarna de dagen erna
    const gat = eersteGat(d, duur, 0, o.eind) || (o.eind ? null : eersteGat(d, duur, 7, null));
    if (!gat) { toast("Geen vrij uur gevonden op " + dagKort(d) + ". Kies zelf een tijd."); return openVenster(id); }
    const oud = { datum: o.datum, tijd: o.tijd, eind: o.eind };
    o.datum = gat.datum; o.tijd = klok(gat.s); o.eind = klok(gat.e);
    opslaan([o.id]);
    toast("Ingepland: " + dagKort(gat.datum) + " " + o.tijd + "–" + o.eind, () => { Object.assign(o, oud); opslaan([o.id]); }, { label: "Aanpassen", fn: () => openVenster(id) });
  }
  // Studieblokken vóór een toets of deadline: verspreid over verschillende dagen, liefst 's middags/'s avonds
  function studieVoorstel(datum, aantal, duur) {
    const v = vandaag();
    const eerste = nuMinuten() >= 21 * 60 ? plusDagen(v, 1) : v;
    const laatste = plusDagen(datum, -1);
    const dagen = [];
    for (let d = eerste; d <= laatste && dagen.length < 120; d = plusDagen(d, 1)) {
      const voorkeurVenster = { ochtend: [planBegin(), 13 * 60], middag: [13 * 60, 18 * 60], avond: [18 * 60, planEind()] }[instellingen.ritme.studeren];
      const g = gatenOp(d, duur, voorkeurVenster).concat(gatenOp(d, duur, [planBegin(), planEind()]));
      if (g.length) dagen.push({ datum: d, gaten: g });
    }
    const uit = [];
    if (!dagen.length) return uit;
    if (dagen.length >= aantal) {
      // gelijkmatig verdelen, het laatste blok op de laatste vrije dag vóór de toets
      for (let i = 0; i < aantal; i++) {
        const idx = aantal === 1 ? dagen.length - 1 : Math.round(i * (dagen.length - 1) / (aantal - 1));
        const dag = dagen[idx];
        const g = dag.gaten[0];
        uit.push({ datum: dag.datum, tijd: klok(g.s), eind: klok(g.s + duur) });
      }
    } else {
      // minder vrije dagen dan blokken: meerdere per dag, zolang er gaten zijn
      let rest = aantal;
      while (rest > 0) {
        let erbij = 0;
        for (const dag of dagen) {
          if (rest <= 0) break;
          const g = dag.gaten.find((x) => x.e - x.s >= duur);
          if (!g) continue;
          uit.push({ datum: dag.datum, tijd: klok(g.s), eind: klok(g.s + duur) });
          g.s += duur + 30; rest--; erbij++;
        }
        if (!erbij) break;
      }
      uit.sort((a, b) => a.datum.localeCompare(b.datum) || a.tijd.localeCompare(b.tijd));
    }
    return uit;
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
    let h = '<div class="weekstrip" role="group" aria-label="Kies een dag"><button type="button" class="ws-pijl" data-week="-1" aria-label="Vorige week">‹</button>';
    for (let i = 0; i < 7; i++) {
      const d = plusDagen(ma, i);
      const items = vastOp(d).map((x) => vastKleur(x.soort)).concat(eigenOp(d).filter((o) => !(isTodo(o) && o.klaar)).map((o) => agendaKleur(o.agenda)));
      h += '<button type="button" data-kies="' + d + '" class="ws' + (d === v ? " vandaag" : "") + (d === s ? " gekozen" : "") + (i >= 5 ? " weekend" : "") + '"' +
        (d === s ? ' aria-current="date"' : "") + ' aria-label="' + langDatum(d) + (items.length ? ", " + items.length + " items" : "") + '">' +
        '<span class="ws-d">' + DAGEN[i] + '</span><span class="ws-n">' + ontleed(d).getDate() + "</span>" +
        '<span class="ws-stip">' + items.slice(0, 3).map((c) => '<i style="background:' + c + '"></i>').join("") + "</span></button>";
    }
    return h + '<button type="button" class="ws-pijl" data-week="1" aria-label="Volgende week">›</button></div>';
  }

  function nuKaartInhoud() {
    const v = vandaag(), nm = nuMinuten();
    const blokken = blokkenOp(v);
    const bezig = blokken.filter((x) => x.s <= nm && nm < x.e);
    const komend = blokken.filter((x) => x.s > nm);
    const hoofdX = bezig[0] || komend[0];
    if (!hoofdX) {
      const open = eigenOp(v).filter((o) => isTodo(o) && !o.klaar).length + nogOpen().length;
      // Avondblik: na 20:00 laten zien hoe morgen begint
      if (new Date().getHours() >= 20 && instellingen.meeplannen.avond) {
        const m = plusDagen(v, 1);
        const eersteM = blokkenOp(m).filter((x) => !x.vervolg)[0];
        const todosM = eigenOp(m).filter((o) => isTodo(o) && !o.klaar).length;
        const vastM = vastOp(m);
        const tekstM = eersteM ? "Begint met " + eersteM.o.tijd + " " + eersteM.o.titel : (vastM.length ? vastM[0].titel : "Geen afspraken");
        return '<div class="nu-binnen avondblik" style="--c:' + (eersteM ? agendaKleur(eersteM.o.agenda) : "var(--accent)") + '"><button type="button" class="nu-hoofd" data-kies="' + m + '">' +
          '<span class="nu-wanneer">Morgen · ' + esc(DAGEN_LANG[ontleed(m).getDay()]) + '</span><span class="nu-titel">' + esc(tekstM) + "</span>" +
          '<span class="nu-rest">' + (todosM ? todosM + (todosM === 1 ? " to-do" : " to-do’s") : "geen to-do’s") + (open ? " · vandaag nog " + open + " open" : "") + "</span></button></div>";
      }
      return '<div class="nu-binnen leeg-nu"><span class="nu-wanneer">Rest van de dag</span><span class="nu-titel">Geen afspraken meer</span>' +
        '<span class="nu-rest">' + (open ? "Tijd voor je to-do’s." : (new Date().getHours() >= 15 ? "Vanavond vrij." : "Lekker vrij.")) + "</span></div>";
    }
    const o = hoofdX.o;
    let h = '<div class="nu-binnen" style="--c:' + agendaKleur(o.agenda) + '"><button type="button" class="nu-hoofd" data-bewerk="' + esc(o.id) + '">';
    if (bezig.length) {
      const pct = Math.max(2, Math.min(100, Math.round((nm - hoofdX.s) / (hoofdX.e - hoofdX.s) * 100)));
      h += '<span class="nu-wanneer"><i class="nu-stip"></i>Nu' + (o.eind ? " · tot " + o.eind + (hoofdX.e > 24 * 60 ? " (morgen)" : "") : " · sinds " + o.tijd) + "</span>" +
        '<span class="nu-titel">' + esc(o.titel) + "</span>" +
        (o.eind ? '<span class="nu-balk"><i style="width:' + pct + '%"></i></span><span class="nu-rest">nog ' + duurTekst(hoofdX.e - nm) + "</span>" : "");
    } else {
      h += '<span class="nu-wanneer">Straks · over ' + duurTekst(hoofdX.s - nm) + "</span>" +
        '<span class="nu-titel">' + esc(o.titel) + "</span>" +
        '<span class="nu-rest">' + esc(tijdTekst(o)) + "</span>";
    }
    h += "</button>";
    bezig.slice(1).forEach((x) => { h += '<button type="button" class="nu-regel" data-bewerk="' + esc(x.o.id) + '">Ook nu · ' + esc(x.o.titel) + (x.o.eind ? " · tot " + x.o.eind : "") + "</button>"; });
    const daarna = bezig.length ? komend[0] : komend[1];
    if (daarna) h += '<button type="button" class="nu-regel" data-bewerk="' + esc(daarna.o.id) + '">Daarna ' + daarna.o.tijd + " · " + esc(daarna.o.titel) + "</button>";
    return h + "</div>";
  }

  // Tijdlijn van één dag: lege uren ingeklapt (vandaag: vanaf nu; andere dagen: rond de afspraken)
  let dagUitgeklapt = false, todoAlles = false;
  const TODO_MAX = 12;
  function zetDag(d) { if (d !== gekozen) { dagUitgeklapt = false; todoAlles = false; } gekozen = d; }
  function dagBereik(s, blokken) {
    const vol = urenBereik(blokken);
    if (dagUitgeklapt) return { b: vol.b, e: vol.e, verborgen: 0, vol: true };
    if (!blokken.length) return null;
    let b, e = Math.min(24, Math.max.apply(null, blokken.map((x) => Math.ceil(x.ev / 60))) + (s === vandaag() ? 0 : 1));
    if (s === vandaag()) {
      const nm = nuMinuten();
      const lopend = blokken.filter((x) => x.e > nm);
      b = Math.floor(Math.min.apply(null, [nm].concat(lopend.map((x) => x.s))) / 60);
    } else {
      b = Math.max(0, Math.floor(Math.min.apply(null, blokken.map((x) => x.s)) / 60) - 1);
    }
    e = Math.min(24, Math.max(e, b + 3));
    b = Math.min(b, e - 3);
    return { b, e, verborgen: blokken.filter((x) => x.ev <= b * 60).length, vol: b <= vol.b && e >= vol.e };
  }

  function tekenDag() {
    const s = gekozen;
    const v = vandaag();
    const isVandaag = s === v;
    const vak = vakantieOp(s);
    const vast = vastOp(s);
    const eigen = eigenOp(s);
    let eerder = isVandaag ? nogOpen() : [];
    const dagstart = isVandaag && instellingen.meeplannen.dagstart && voorkeur.dagstartGezien !== v && eerder.length ? eerder : null;
    if (dagstart) eerder = [];   // de kaart toont ze al
    const heleDag = eigen.filter(isHeleDag);
    const todos = eigen.filter(isTodo);
    const open = todos.filter((o) => !o.klaar);
    const klaarLijst = todos.filter((o) => o.klaar);
    const blokken = blokkenOp(s);
    const nOpen = open.length + eerder.length;

    const sub = [];
    if (vak) sub.push(vak.naam);
    sub.push(nOpen ? nOpen + (nOpen === 1 ? " to-do" : " to-do’s") : (klaarLijst.length ? "alles afgevinkt" : "geen to-do’s"));
    sub.push(blokken.length ? blokken.length + (blokken.length === 1 ? " afspraak" : " afspraken") : "geen afspraken");
    const jaar = ontleed(s).getFullYear() === new Date().getFullYear() ? "" : " " + ontleed(s).getFullYear();

    let html = heroHtml({ titel: dagTitel(s) + jaar, sub: esc(sub.join(" · ")), terug: isVandaag ? null : "Vandaag", groet: isVandaag }) +
      weekstripHtml(s);

    html += '<div class="dagindeling">';
    if (isVandaag) html += '<section class="nu-kaart" id="nuKaart" aria-live="polite">' + nuKaartInhoud() + "</section>";
    if (dagstart) {
      html += '<section class="dagstart" aria-label="To-do’s van eerder"><div class="sectie-kop"><h3 class="sectie-label">Nog open van eerder · ' + dagstart.length + '</h3>' +
        '<button type="button" class="tekstknop klein-knop" data-dagstart="sluit">Laat maar</button></div><ul class="rijen">' +
        dagstart.slice(0, 8).map((o) => '<li class="rij ds-rij" style="--c:' + agendaKleur(o.agenda) + '"><span class="ds-stip"></span><div class="rij-tekst" data-bewerk="' + esc(o.id) + '" role="button" tabindex="0" aria-label="Wijzigen: ' + esc(o.titel) + '"><span class="rij-titel">' + esc(o.titel) + '</span><span class="rij-meta">' + esc(vanLabel(o.datum)) + "</span></div>" +
          '<div class="ds-knoppen"><button type="button" class="mini" data-ds="vandaag" data-id="' + esc(o.id) + '">Vandaag</button><button type="button" class="mini" data-ds="later" data-id="' + esc(o.id) + '">Later</button><button type="button" class="mini" data-ds="weg" data-id="' + esc(o.id) + '" aria-label="Weg: ' + esc(o.titel) + '">Weg</button></div></li>').join("") +
        (dagstart.length > 8 ? '<li class="klein">… en nog ' + (dagstart.length - 8) + "</li>" : "") + "</ul>" +
        (dagstart.length > 1 ? '<div class="knoppen"><button type="button" class="tekstknop klein-knop" data-ds="alles">Alles naar vandaag</button></div>' : "") + "</section>";
    }

    // To-do's: eerst wat nog openstaat van eerder, dan vandaag, afgevinkt onderaan
    html += '<section class="dag-todo"><h3 class="sectie-label">To-do</h3>';
    if (vast.length || eerder.length || todos.length || heleDag.length) {
      // Meer dan 12 open to-do's: de rest achter één knop, zodat de agenda eronder bereikbaar blijft
      let rijen = eerder.map((o) => rij(o, false, { van: true })).concat(open.map((o) => rij(o, false)));
      let meer = "";
      if (!todoAlles && rijen.length > TODO_MAX + 2) { meer = '<button type="button" class="toon-meer" data-todo-alles="1">Nog ' + (rijen.length - TODO_MAX) + ' to-do’s tonen</button>'; rijen = rijen.slice(0, TODO_MAX); }
      html += '<ul class="rijen">' + vast.map(vastRij).join("") + heleDag.map((o) => rij(o, false)).join("") + rijen.join("") +
        (meer ? "" : klaarLijst.map((o) => rij(o, false)).join("")) + "</ul>" + meer;
    } else {
      html += '<p class="leeg">Niets te doen. Typ ' + waarTypen() + ' bijvoorbeeld <em>“' + esc(isVandaag ? "vandaag" : DAGEN_LANG[ontleed(s).getDay()]) + ' samenvatting schrijven”</em>.</p>';
    }
    html += '<button type="button" class="nieuwe-rij" data-nieuw="' + s + '"><span aria-hidden="true">+</span> Toevoegen</button></section>';

    // Agenda: tijdblokken, lege uren ingeklapt
    const r = dagBereik(s, blokken);
    let knop = "";
    if (dagUitgeklapt) knop = '<button type="button" class="tekstknop klein-knop" data-uitklap="0">Inklappen</button>';
    else if (r && r.verborgen) knop = '<button type="button" class="tekstknop klein-knop" data-uitklap="1">Eerder vandaag: ' + r.verborgen + " ▾</button>";
    else if (r && !r.vol) knop = '<button type="button" class="tekstknop klein-knop" data-uitklap="1">Hele dag</button>';
    html += '<section class="dag-agenda"><div class="sectie-kop"><h3 class="sectie-label">Agenda</h3>' + knop + "</div>" +
      (r ? rasterHtml([s], [blokken], r, "dagraster", true)
        : '<p class="leeg">Geen afspraken. <button type="button" class="tekstknop" data-uitklap="1">Tijdlijn tonen</button> om iets in te plannen.</p>') +
      "</section></div>";
    $("hoofd").innerHTML = html;
  }

  // ---------- weekweergave met tijdblokken ----------
  function tekenWeek() {
    const ma = maandagVan(gekozen);
    const zo = plusDagen(ma, 6);
    const d1 = ontleed(ma), d2 = ontleed(zo);
    const smal = smalScherm();
    const v = vandaag();
    const titel = d1.getMonth() === d2.getMonth()
      ? d1.getDate() + " – " + d2.getDate() + " " + MAANDEN[d2.getMonth()]
      : d1.getDate() + " " + KORT[d1.getMonth()] + " – " + d2.getDate() + " " + KORT[d2.getMonth()];
    const dezeWeek = maandagVan(v) === ma;
    let werkMin = 0;
    if (agendaZichtbaar("werk")) for (let i = 0; i < 7; i++) blokkenOp(plusDagen(ma, i)).forEach((x) => { if (!x.vervolg && x.o.agenda === "werk") werkMin += Math.max(0, x.e - x.s); });
    const werkTekst = werkMin ? " · werk " + (Math.round(werkMin / 30) / 2).toString().replace(".", ",") + " u" : "";
    let html = heroHtml({ titel, nav: true, sub: "Week " + weeknummer(d1) + (d2.getFullYear() !== new Date().getFullYear() ? " · " + d2.getFullYear() : "") + werkTekst, terug: "Vandaag", huidig: dezeWeek });

    if (smal) {
      // Telefoon: zeven dagen onder elkaar als rustige lijst; tik op de dagkop om de dag te openen
      const dagen = [0, 1, 2, 3, 4, 5, 6].map((i) => plusDagen(ma, i));
      let leegAlles = true;
      html += '<div class="weeklijst">' + dagen.map((d, i) => {
        const dag = ontleed(d);
        const vak = vakantieOp(d);
        const vast = vastOp(d);
        const eigen = eigenOp(d);
        const vervolg = eigenOp(plusDagen(d, -1)).filter((o) => !isTodo(o) && overMiddernacht(o)).map((o) =>
          '<li class="rij blokrij vervolg" style="--c:' + agendaKleur(o.agenda) + '" data-id="' + esc(o.id) + '"><span class="tijdstip" aria-label="tot ' + esc(o.eind) + '">tot<small>' + esc(o.eind) + '</small></span>' +
          '<div class="rij-tekst" data-bewerk="' + esc(o.id) + '" role="button" tabindex="0" aria-label="Wijzigen: ' + esc(o.titel) + '"><span class="rij-titel">' + esc(o.titel) + '</span><span class="rij-meta">van gisteren</span></div></li>');
        const items = vervolg.concat(vast.map(vastRij), eigen.map((o) => rij(o, false)));
        if (items.length) leegAlles = false;
        return '<section class="wl-dag' + (d === v ? " vandaag" : "") + (i >= 5 ? " weekend" : "") + (vak ? " vakantie" : "") + '">' +
          '<button type="button" class="wl-kop" data-naar-dag="' + d + '" aria-label="' + langDatum(d) + ' openen">' +
          '<span class="wl-d">' + DAGEN[i] + '</span><span class="wl-n">' + dag.getDate() + "</span>" +
          '<span class="wl-info">' + (d === v ? "vandaag" : vak ? ((i === 0 || d === vak.start) ? esc(vak.naam) : "vakantie") : "") + "</span>" +
          '<span class="wl-pijl" aria-hidden="true">›</span></button>' +
          (items.length ? '<ul class="rijen">' + items.join("") + "</ul>" : '<p class="wl-leeg">vrij</p>') + "</section>";
      }).join("") + "</div>";
      if (leegAlles) html += '<p class="leeg">Niets gepland deze week. Typ ' + waarTypen() + ' bijvoorbeeld <em>“dinsdag 10:00 werkcollege”</em>.</p>';
      $("hoofd").innerHTML = html;
      return;
    }

    const idx = [0, 1, 2, 3, 4, 5, 6];
    const datums = idx.map((i) => plusDagen(ma, i));
    const perDag = datums.map(blokkenOp);
    const alle = [].concat.apply([], perDag);
    const bereik = {
      b: Math.min(8, alle.length ? Math.floor(Math.min.apply(null, alle.map((x) => x.s)) / 60) : 8),
      e: Math.max(18, alle.length ? Math.min(24, Math.ceil(Math.max.apply(null, alle.map((x) => x.ev)) / 60)) : 18)
    };

    let kop = '<div class="wk-kop" style="--dagen:' + datums.length + '"><span></span>';
    let heledag = '<div class="wk-heledag" style="--dagen:' + datums.length + '"><span class="wk-hoek">to-do</span>';
    let aantalTodos = 0;
    datums.forEach((d, i) => {
      const dag = ontleed(d);
      const vak = vakantieOp(d);
      kop += '<button type="button" class="wk-dag' + (d === v ? " vandaag" : "") + (idx[i] >= 5 ? " weekend" : "") + (vak ? " vakantie" : "") + '" data-naar-dag="' + d + '" aria-label="' + langDatum(d) + ' openen">' +
        '<span class="wd">' + DAGEN[idx[i]] + '</span><span class="nr">' + dag.getDate() + "</span></button>";
      const vast = vastOp(d);
      const todos = eigenOp(d).filter((o) => isTodo(o) || isHeleDag(o));
      aantalTodos += todos.length + vast.length;
      heledag += '<div class="hd-cel' + (vak ? " vakantie" : "") + '">' +
        (vak && (i === 0 || d === vak.start) ? '<span class="vaklabel">' + esc(vak.naam) + "</span>" : "") +
        vast.map((x) => '<span class="hd-chip vast" style="--c:' + vastKleur(x.soort) + '" title="' + esc(x.titel) + '">' + slot() + "<span>" + esc(x.titel) + "</span></span>").join("") +
        todos.slice(0, 3).map((o) => '<button type="button" class="hd-chip' + (o.klaar ? " klaar" : "") + '" data-bewerk="' + esc(o.id) + '" style="--c:' + agendaKleur(o.agenda) + '" title="' + esc(o.titel) + '"><span>' + esc(o.titel) + "</span></button>").join("") +
        (todos.length > 3 ? '<button type="button" class="hd-meer" data-naar-dag="' + d + '" aria-label="Nog ' + (todos.length - 3) + ' to-do’s, dag openen">+' + (todos.length - 3) + "</button>" : "") +
        "</div>";
    });
    kop += "</div>";
    heledag += "</div>";

    if (!alle.length && !aantalTodos) html += '<p class="leeg week-leeg">Niets gepland deze week. Typ ' + waarTypen() + ' bijvoorbeeld <em>“dinsdag 10:00 werkcollege”</em>, of tik op een uur in het raster.</p>';
    html += '<div class="weekblok">' + kop + heledag + rasterHtml(datums, perDag, bereik, "weekraster-tijd", false) + "</div>";
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

    const groep = (titel, lijst, extra, leeg, zonderDatum) => '<section class="groep"><div class="groep-titel"><h3>' + titel + ' <span class="aantal">' + lijst.length + "</span></h3>" + (extra || "") + "</div>" +
      (lijst.length ? '<ul class="rijen">' + lijst.map((o) => rij(o, !zonderDatum)).join("") + "</ul>" : '<p class="leeg">' + (leeg || "Niets.") + "</p>") + "</section>";

    const per = periodeOp(v);
    const toetsenPer = per && paboZichtbaar() ? P.toetsen.filter((t) => t.datum >= v && t.datum <= per.eind && pastBij(t.doelgroep)).length : 0;
    const wekenPer = per ? Math.max(0, Math.round((ontleed(per.eind) - ontleed(v)) / 6048e5)) : 0;
    const subLijst = per ? per.naam + " · nog " + wekenPer + (wekenPer === 1 ? " week" : " weken") + (toetsenPer ? " · " + toetsenPer + (toetsenPer === 1 ? " toets" : " toetsen") : "") : "Alles wat eraan komt";
    let html = heroHtml({ titel: "Lijst", sub: esc(subLijst) });
    if (!zicht.length) {
      html += '<p class="leeg groot-leeg">Nog niets gepland. Typ ' + waarTypen() + ' bijvoorbeeld <em>“morgen 14:00-15:00 tandarts”</em> en druk op Enter.</p>';
    } else {
      if (eerder.length) html += groep("Nog open van eerder", eerder, '<button type="button" class="mini" data-alles-vandaag>Alles naar vandaag</button>');
      html += groep("Vandaag", nuDag, "", "Niets voor vandaag.", true);
      html += groep("Komende 7 dagen", komend, "", "Niets gepland voor de komende week.");
      // Daarna: de eerstvolgende toetsen en deadlines voorbij deze week, zodat ze niet pas in het maandraster opduiken
      const daarnaEigen = later.filter((o) => ["deadline", "toets", "herkansing"].includes(o.soort)).map((o) => ({ datum: o.datum, html: rij(o, true) }));
      const daarnaVast = paboZichtbaar() ? P.toetsen.filter((t) => t.datum > over7 && pastBij(t.doelgroep)).map((t) => ({ datum: t.datum, html: vastRij(t, true) })) : [];
      const daarna = daarnaEigen.concat(daarnaVast).sort((a, b) => a.datum.localeCompare(b.datum)).slice(0, 3);
      if (daarna.length) html += '<section class="groep"><div class="groep-titel"><h3>Daarna <span class="aantal">' + daarna.length + '</span></h3></div><ul class="rijen">' + daarna.map((x) => x.html).join("") + "</ul></section>";
      if (later.length) html += groep("Later", later);
      if (af.length) html += '<details class="groep"><summary><h3>Afgerond <span class="aantal">' + af.length + '</span></h3></summary><ul class="rijen">' + af.slice(0, 100).map((o) => rij(o, true)).join("") + "</ul></details>";
    }
    $("hoofd").innerHTML = html;
  }

  // Elke halve minuut: rode nu-lijn, afgelopen blokken en de Nu/Hierna-kaart bijwerken
  let laatsteDag = vandaag();
  // Heel zachte achtergrondtint die meeloopt met het dagdeel
  function zetDagdeel() {
    const u = new Date().getHours();
    document.documentElement.dataset.dagdeel = u < 6 || u >= 23 ? "nacht" : u < 12 ? "ochtend" : u < 18 ? "middag" : "avond";
  }
  zetDagdeel();
  function werkNuBij() {
    zetDagdeel();
    if ($("kopGroet")) $("kopGroet").textContent = groet();
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
    if (kaart) { const n = nuKaartInhoud(); if (kaart.innerHTML !== n) kaart.innerHTML = n; }
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
    const jaarZij = ontleed(s).getFullYear() === new Date().getFullYear() ? "" : " " + ontleed(s).getFullYear();
    let html = '<div class="dagkop"><h3>' + dagTitel(s) + jaarZij + "</h3>" + (label ? '<span class="label">' + esc(label) + "</span>" : "") + "</div>";
    if (!vast.length && !eigen.length) html += '<p class="leeg">Niets gepland op deze dag.</p>';
    else html += '<ul class="rijen">' + vast.map(vastRij).join("") + eigen.map((o) => rij(o, false)).join("") + "</ul>";
    html += '<div class="knoppen"><button type="button" class="hoofd" data-nieuw="' + s + '">+ Toevoegen op deze dag</button><button type="button" class="zacht" data-naar-dag="' + s + '">Dag openen</button></div>';
    $("dagpaneel").innerHTML = html;
  }

  function tekenZonderDatum() {
    const paneel = $("zonderDatumPaneel");
    const lijst = paboZichtbaar() ? P.zonderDatum.filter((t) => pastBij(t.doelgroep) && !opdrachten.some((o) => o.soort === "toets" && o.titel === t.titel)) : [];
    paneel.hidden = !lijst.length;
    if (!lijst.length) return;
    $("zonderDatumUitleg").textContent = "Deze toetsen vallen in de tentamenweek van periode 2, die begint op maandag 11 januari. De exacte dag per toets volgt nog.";
    $("zonderdatum").innerHTML = lijst.map((t) =>
      '<li class="item" style="--c:var(--toets)"><span class="datumblok"><b>' + esc(t.periode) + "</b><small>datum?</small></span>" +
      "<div><h4>" + esc(t.titel) + "</h4><p>" + esc(t.uitleg) + "</p>" +
      '<span class="tag">' + esc(t.vorm) + '</span><span class="tag">' + DG_LABEL[t.doelgroep || "alle"] + '</span><span class="tag">Herk. ' + esc(t.herkansing) + "</span>" +
      '<button type="button" class="tekstknop klein-knop" data-toets-datum="' + esc(t.titel) + '" aria-label="Datum bekend van ' + esc(t.titel) + '? Zet hem in je agenda">Datum bekend? Zet hem in je agenda</button></div><span></span></li>'
    ).join("");
  }

  // ---------- meldingen bovenaan ----------
  function tekenOpenBalk() {
    const el = $("openBalk");
    const open = nogOpen();
    if (!open.length || voorkeur.openGezien === vandaag() || voorkeur.weergave !== "maand" || telefoon() || (sessie && !ontgrendeld)) { el.hidden = true; return; }
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
  function toast(tekst, ongedaan, extra) {
    const el = $("toast");
    el.innerHTML = "<span>" + esc(tekst) + "</span>" + (extra ? '<button type="button" class="tekstknop" id="toastExtra">' + esc(extra.label) + "</button>" : "") +
      (ongedaan ? '<button type="button" class="tekstknop" id="toastOngedaan">Ongedaan maken</button>' : "");
    el.hidden = false;
    if (ongedaan) $("toastOngedaan").onclick = () => { ongedaan(); el.hidden = true; };
    if (extra) $("toastExtra").onclick = () => { el.hidden = true; extra.fn(); };
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
    if (r.tijd) delen.push(r.tijd + (r.eind ? "–" + r.eind + (r.eindStandaard ? " (standaard)" : "") : ""));
    else delen.push(r.eind ? "to-do tot " + r.eind : "to-do");
    if (r.herhaal) { const reeks = reeksDatums(r); delen.push("elke " + DAGEN_KORT_ZO[r.herhaal.elke] + " t/m " + kortDatum(reeks[reeks.length - 1]) + " · " + reeks.length + "×"); }
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
    snel.style.height = Math.min(snel.scrollHeight, telefoon() ? 132 : 220) + "px";
    $("snelForm").classList.toggle("heeft-tekst", !!snel.value.trim());
  }
  // Datums van een wekelijkse reeks; hoogstens 30 stuks
  function reeksDatums(r) {
    const per = periodeOp(r.datum);
    const tm = r.herhaal.tm || (per ? per.eind : plusDagen(r.datum, 7 * 8 - 1));
    const uit = [];
    for (let d = r.datum; d <= tm && uit.length < 30; d = plusDagen(d, 7)) uit.push(d);
    return uit.length ? uit : [r.datum];
  }
  // Items van één reeks hebben hetzelfde begin van hun id: "r<reeks>-<nr>"
  const reeksVan = (id) => { const m = /^(r[a-z0-9]{6,12})-\d{2}$/.exec(String(id || "")); return m ? m[1] : null; };
  function snelToevoegen() {
    if (sessie && !ontgrendeld) { tekenVoorbeeld(); return; }
    const lijst = snelResultaten().filter((r) => r.titel);
    if (!lijst.length) { tekenVoorbeeld(); snel.focus(); return; }
    const nieuw = [];
    lijst.forEach((r) => {
      if (r.herhaal) {
        const reeks = "r" + nieuwId().slice(-8);
        reeksDatums(r).forEach((d, i) => nieuw.push(normaal({ id: reeks + "-" + pad(i + 1), titel: r.titel, datum: d, tijd: r.tijd, eind: r.eind, soort: r.soort, agenda: r.agenda, notitie: "", klaar: false })));
      } else {
        nieuw.push(normaal({ id: nieuwId() + Math.random().toString(36).slice(2, 4), titel: r.titel, datum: r.datum, tijd: r.tijd, eind: r.eind, soort: r.soort, agenda: r.agenda, notitie: "", klaar: false }));
      }
    });
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
  snel.addEventListener("input", () => {
    if (/BEGIN:VCALENDAR/i.test(snel.value) && snel.value.length > 60) { const t = snel.value; snel.value = ""; groeiVeld(); tekenVoorbeeld(); return openImportVenster("tekst", { tekst: t }); }
    groeiVeld(); tekenVoorbeeld();
  });
  // Telefoon: tijdens het typen verdwijnt de onderbalk en schuift de typbalk mee met het toetsenbord
  snel.addEventListener("focus", () => document.body.classList.add("typt"));
  snel.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== snel && !$("snelForm").contains(document.activeElement)) document.body.classList.remove("typt"); }, 150));
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const zetToetsenbord = () => document.documentElement.style.setProperty("--toetsenbord", Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) + "px");
    vv.addEventListener("resize", zetToetsenbord);
    vv.addEventListener("scroll", zetToetsenbord);
  }
  $("snelAgenda").addEventListener("change", (e) => { voorkeur.snelAgenda = e.target.value; bewaarVoorkeur(); tekenSnelAgenda(); tekenVoorbeeld(); });

  // ---------- venster: opdracht toevoegen / wijzigen ----------
  const venster = $("venster");
  let verwijderStap = 0;
  function openVenster(id, datum, tijd) {
    if (sessie && !ontgrendeld) { toast("Ontgrendel eerst je account."); return; }
    bewerkId = id || null;
    verwijderStap = 0; verwijderReeksStap = 0;
    const o = id ? opdrachten.find((x) => x.id === id) : null;
    $("venstertitel").textContent = o ? "Wijzigen" : "Toevoegen";
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
    toonNachtUitleg();
    $("f-fout").textContent = "";
    $("f-verwijder").hidden = !o;
    $("f-verwijder").textContent = "Verwijderen";
    // Geïmporteerd uit een agenda: alleen lezen (bij verversen zou een wijziging toch overschreven worden)
    const geimporteerd = !!(o && o.bron);
    venster.classList.toggle("alleen-lezen", geimporteerd);
    venster.querySelectorAll("input, select, textarea").forEach((el) => { el.disabled = geimporteerd; });
    $("f-import-uitleg").hidden = !geimporteerd;
    $("f-uitleg").hidden = geimporteerd;
    if (geimporteerd) {
      const imp = importVan(o.bron);
      $("f-import-uitleg").innerHTML = "Uit <strong>" + esc(imp ? imp.naam : "een geïmporteerde agenda") + "</strong>. Wijzig dit in de bron; Digigenda neemt het over bij het verversen. " +
        '<button type="button" class="tekstknop" data-import-beheer="' + esc(o.bron) + '">Import beheren</button>';
      $("venstertitel").textContent = o.tijd ? "Afspraak (geïmporteerd)" : "Hele dag (geïmporteerd)";
    }
    $("f-verwijder").hidden = !o || geimporteerd;
    const reeks = o && !geimporteerd ? reeksVan(o.id) : null;
    const reeksRest = reeks ? opdrachten.filter((x) => reeksVan(x.id) === reeks && x.datum >= o.datum).length : 0;
    $("f-verwijder-reeks").hidden = !(reeks && reeksRest > 1);
    $("f-verwijder-reeks").textContent = "Deze en volgende verwijderen (" + reeksRest + ")";
    $("f-reeks-uitleg").hidden = !reeks;
    if (reeks) $("f-reeks-uitleg").textContent = "Hoort bij een wekelijkse reeks (elke " + DAGEN_LANG[ontleed(o.datum).getDay()] + "). Wijzigen geldt alleen voor deze dag.";
    venster.querySelector('button[type="submit"]').hidden = geimporteerd;
    $("f-plan").hidden = !(o && !geimporteerd && isTodo(o) && !o.klaar);
    $("f-studie").hidden = !(o && !geimporteerd && ["toets", "herkansing", "deadline"].includes(o.soort) && o.datum > vandaag());
    if (typeof venster.showModal === "function") venster.showModal(); else venster.setAttribute("open", "");
    if (!geimporteerd) $("f-titel").focus(); else $("f-annuleer").focus();
  }
  // Begintijd verschuift: eindtijd schuift mee (zelfde duur). Afvinken kan alleen bij to-do's.
  let vorigeBegin = "";
  $("f-tijd").addEventListener("change", () => {
    const nieuw = $("f-tijd").value, eind = $("f-eind").value;
    if (vorigeBegin && nieuw && TIJD.test(eind) && TIJD.test(vorigeBegin)) {
      const e = ((minuten(eind) + minuten(nieuw) - minuten(vorigeBegin)) % (24 * 60) + 24 * 60) % (24 * 60);
      if (e !== minuten(nieuw)) $("f-eind").value = klok(e);
    }
    vorigeBegin = nieuw;
    $("f-klaar-rij").hidden = !!nieuw;
  });
  $("f-tijd").addEventListener("input", () => { $("f-klaar-rij").hidden = !!$("f-tijd").value; });
  function toonNachtUitleg() {
    const t = $("f-tijd").value, e = $("f-eind").value;
    $("f-uitleg").textContent = TIJD.test(t) && TIJD.test(e) && e < t
      ? "Eindigt de volgende ochtend om " + e + " (bijvoorbeeld een nachtdienst)."
      : "Zonder begintijd is het een to-do die je kunt afvinken. Met begintijd wordt het een blok in je agenda.";
  }
  ["f-tijd", "f-eind"].forEach((id) => { $(id).addEventListener("input", toonNachtUitleg); $(id).addEventListener("change", toonNachtUitleg); });
  function sluitVenster() { if (typeof venster.close === "function") venster.close(); else venster.removeAttribute("open"); }

  $("formulier").addEventListener("submit", (e) => {
    e.preventDefault();
    const titel = $("f-titel").value.trim();
    const datum = $("f-datum").value;
    if (!titel) { $("f-fout").textContent = "Vul een titel in."; $("f-titel").focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) { $("f-fout").textContent = "Kies een datum."; $("f-datum").focus(); return; }
    const tijd = TIJD.test($("f-tijd").value) ? $("f-tijd").value : null;
    const eind = TIJD.test($("f-eind").value) ? $("f-eind").value : null;
    if (tijd && eind && eind === tijd) { $("f-fout").textContent = "De eindtijd is gelijk aan de begintijd. Kies een latere eindtijd (of een vroegere: dan eindigt het de volgende dag)."; $("f-eind").focus(); return; }
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
  $("f-plan").addEventListener("click", () => { const id = bewerkId; sluitVenster(); planIn(id); });
  $("f-studie").addEventListener("click", () => { const o = opdrachten.find((x) => x.id === bewerkId); if (!o) return; sluitVenster(); openStudie(o.id, o.titel, o.datum); });
  venster.addEventListener("click", (e) => { const k = e.target.closest("[data-import-beheer]"); if (k) { sluitVenster(); openImportVenster("lijst"); } });
  $("f-verwijder").addEventListener("click", () => {
    if (verwijderStap === 0) { verwijderStap = 1; $("f-verwijder").textContent = "Zeker weten? Klik nogmaals"; return; }
    const id = bewerkId;
    opdrachten = opdrachten.filter((x) => x.id !== id);
    sluitVenster();
    opslaan([], [id]);
  });
  let verwijderReeksStap = 0;
  $("f-verwijder-reeks").addEventListener("click", () => {
    if (verwijderReeksStap === 0) { verwijderReeksStap = 1; $("f-verwijder-reeks").textContent = "Zeker weten? Klik nogmaals"; return; }
    const o = opdrachten.find((x) => x.id === bewerkId);
    if (!o) return;
    const reeks = reeksVan(o.id);
    const weg = opdrachten.filter((x) => reeksVan(x.id) === reeks && x.datum >= o.datum).map((x) => x.id);
    opdrachten = opdrachten.filter((x) => !weg.includes(x.id));
    sluitVenster();
    opslaan([], weg);
    toast(weg.length + " items uit de reeks verwijderd");
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
  function dagstartActie(actie, id) {
    const v = vandaag();
    if (actie === "alles") return allesNaarVandaag();
    const o = opdrachten.find((x) => x.id === id);
    if (!o) return;
    if (actie === "weg") {
      const kopie = Object.assign({}, o);
      opdrachten = opdrachten.filter((x) => x.id !== id);
      opslaan([], [id]);
      return toast("Weggehaald: " + kopie.titel, () => { opdrachten.push(kopie); opslaan([id]); });
    }
    const oud = o.datum;
    o.datum = actie === "later" ? plusDagen(v, 1) : v;
    opslaan([o.id]);
    toast((actie === "later" ? "Naar morgen: " : "Naar vandaag: ") + o.titel, () => { o.datum = oud; opslaan([o.id]); });
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
    if (stap === 0) { zetDag(vandaag()); const d = new Date(); maand = { j: d.getFullYear(), m: d.getMonth() }; }
    else if (w === "maand") { maand = maand.m + stap < 0 ? { j: maand.j - 1, m: 11 } : maand.m + stap > 11 ? { j: maand.j + 1, m: 0 } : { j: maand.j, m: maand.m + stap }; }
    else if (w === "week") gekozen = plusDagen(gekozen, 7 * stap);
    else if (w === "dag") zetDag(plusDagen(gekozen, stap));
    tekenJaarstrook(); tekenHoofd(); tekenVoorbeeld();
  }

  document.querySelectorAll("[data-weergave]").forEach((b) => b.addEventListener("click", () => zetWeergave(b.dataset.weergave)));

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-klaar],[data-bewerk],[data-nieuw],[data-schuif],[data-nav],[data-naar-dag],[data-filter],[data-open],[data-alles-vandaag],[data-onder],[data-modus],[data-kies],[data-slot],[data-weekend],[data-week],[data-uitklap],[data-todo-alles],[data-gat],[data-plan],[data-dagstart],[data-ds],[data-studie-titel],[data-toets-datum],.chip.eigen,.dag,[data-j]");
    if (!t) return;
    if (t.closest("#venster")) return;
    // Maand: op de telefoon opent een dag de dagweergave, op de laptop het zijpaneel
    if (t.matches(".chip.eigen") || t.matches(".dag")) {
      const cel = t.closest(".dag");
      if (telefoon()) { zetDag(cel.dataset.datum); return zetWeergave("dag"); }
      if (t.matches(".chip.eigen")) { e.stopPropagation(); kiesDag(cel.dataset.datum); openVenster(t.dataset.id); return; }
      kiesDag(cel.dataset.datum); return;
    }
    if (t.dataset.onder) {
      if (t.dataset.onder === "vandaag" || (t.dataset.onder === "dag" && voorkeur.weergave === "dag")) { zetDag(vandaag()); const d = new Date(); maand = { j: d.getFullYear(), m: d.getMonth() }; weekendTonen = false; return zetWeergave("dag"); }
      return zetWeergave(t.dataset.onder);
    }
    if (t.dataset.modus) { if (t.dataset.modus === "week") weekendTonen = ontleed(gekozen).getDay() % 6 === 0; return zetWeergave(t.dataset.modus); }
    if (t.dataset.kies) { zetDag(t.dataset.kies); tekenHoofd(); tekenVoorbeeld(); return; }
    if (t.dataset.week) { zetDag(plusDagen(gekozen, 7 * +t.dataset.week)); tekenHoofd(); tekenVoorbeeld(); return; }
    if (t.dataset.uitklap) { dagUitgeklapt = t.dataset.uitklap === "1"; return tekenHoofd(); }
    if (t.dataset.todoAlles) { todoAlles = true; return tekenHoofd(); }
    if (t.dataset.gat) { const [d, van, tot] = t.dataset.gat.split("|"); openVenster(null, d, van); if (minuten(tot) - minuten(van) < 60) $("f-eind").value = tot; return; }
    if (t.dataset.plan) return planIn(t.dataset.plan);
    if (t.dataset.dagstart === "sluit") { voorkeur.dagstartGezien = vandaag(); bewaarVoorkeur(); return tekenHoofd(); }
    if (t.dataset.ds) return dagstartActie(t.dataset.ds, t.dataset.id);
    if (t.dataset.studieTitel) return openStudie(null, t.dataset.studieTitel, t.dataset.studieDatum);
    if (t.dataset.toetsDatum) { openVenster(null, gekozen); $("f-titel").value = t.dataset.toetsDatum; $("f-soort").value = "toets"; if (agendaAan("school")) $("f-agenda").value = "school"; $("f-datum").focus(); return; }
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

  // ---------- to-do's: vegen, lang indrukken, toetsenbord ----------
  const rijMenu = $("rijMenu");
  let menuId = null;
  function openRijMenu(id) {
    const o = opdrachten.find((x) => x.id === id);
    if (!o || !isTodo(o)) return;
    menuId = id;
    $("rijMenuTitel").textContent = o.titel;
    rijMenu.querySelector('[data-menu="klaar"]').textContent = o.klaar ? "Weer openzetten" : "Afvinken";
    const sb = rijMenu.querySelector('[data-menu="schuif"]');
    sb.hidden = o.klaar;
    sb.textContent = o.datum < vandaag() ? "Naar vandaag" : o.datum === vandaag() ? "Naar morgen" : "Een dag later";
    rijMenu.querySelector('[data-menu="plan"]').hidden = o.klaar;
    if (typeof rijMenu.showModal === "function") rijMenu.showModal(); else rijMenu.setAttribute("open", "");
  }
  function sluitRijMenu() { if (typeof rijMenu.close === "function") rijMenu.close(); else rijMenu.removeAttribute("open"); }
  rijMenu.addEventListener("click", (e) => {
    if (e.target === rijMenu) return sluitRijMenu();
    const k = e.target.closest("[data-menu]");
    if (!k) return;
    const id = menuId;
    sluitRijMenu();
    if (k.dataset.menu === "klaar") wisselKlaar(id);
    else if (k.dataset.menu === "schuif") schuif(id);
    else if (k.dataset.menu === "wijzig") openVenster(id);
    else if (k.dataset.menu === "plan") planIn(id);
  });

  let veeg = null, langTimer = null, klikNegeren = false;
  const negeerKlik = () => { klikNegeren = true; setTimeout(() => { klikNegeren = false; }, 450); };
  document.addEventListener("touchstart", (e) => {
    const r = e.target.closest(".rij.veegbaar, .rij[data-id]:not(.blokrij)");
    const strip = e.target.closest(".weekstrip");
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (strip && !r) { veeg = { strip: true, x: t.clientX, y: t.clientY }; return; }
    if (!r || e.target.closest(".vink")) return;
    veeg = { r, x: t.clientX, y: t.clientY, dx: 0, bezig: false };
    clearTimeout(langTimer);
    langTimer = setTimeout(() => { if (veeg && veeg.r === r && !veeg.bezig) { veeg = null; negeerKlik(); if (navigator.vibrate) navigator.vibrate(10); openRijMenu(r.dataset.id); } }, 550);
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!veeg || veeg.strip) return;
    const t = e.touches[0];
    const dx = t.clientX - veeg.x, dy = t.clientY - veeg.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(langTimer);
    if (!veeg.bezig && veeg.r.classList.contains("veegbaar") && dx < -12 && Math.abs(dx) > Math.abs(dy) * 1.5) { veeg.bezig = true; veeg.r.classList.add("veegt"); }
    if (veeg.bezig) {
      veeg.dx = Math.max(-140, Math.min(0, dx));
      veeg.r.style.transform = "translateX(" + veeg.dx + "px)";
      veeg.r.classList.toggle("ver-genoeg", veeg.dx < -80);
    }
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    clearTimeout(langTimer);
    if (!veeg) return;
    const v = veeg; veeg = null;
    if (v.strip) {
      const t = e.changedTouches[0], dx = t.clientX - v.x, dy = t.clientY - v.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { zetDag(plusDagen(gekozen, dx < 0 ? 7 : -7)); tekenHoofd(); negeerKlik(); }
      return;
    }
    if (!v.bezig) return;
    negeerKlik();
    v.r.classList.remove("veegt", "ver-genoeg");
    if (v.dx < -80) { v.r.style.transform = "translateX(-100%)"; setTimeout(() => schuif(v.r.dataset.id), 160); }
    else v.r.style.transform = "";
  });
  document.addEventListener("touchcancel", () => { clearTimeout(langTimer); if (veeg && veeg.r) { veeg.r.style.transform = ""; veeg.r.classList.remove("veegt", "ver-genoeg"); } veeg = null; });
  // Na vegen of lang indrukken geen 'klik' meer doorgeven (anders opent ook het wijzigvenster)
  document.addEventListener("click", (e) => { if (klikNegeren && !e.target.closest("dialog")) { klikNegeren = false; e.stopPropagation(); e.preventDefault(); } }, true);
  document.addEventListener("contextmenu", (e) => { if (e.target.closest(".rij[data-id]") && telefoon()) e.preventDefault(); });
  // Toetsenbord: Enter op een regel = wijzigen
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if ((e.key === "Enter" || e.key === " ") && t && t.matches && t.matches('[role="button"][data-bewerk]')) { e.preventDefault(); openVenster(t.dataset.bewerk); }
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
      '<span class="label dg-label"' + (pabo ? "" : " hidden") + '>Toetsen tonen voor</span>' +
      '<div class="doelgroep" role="group" aria-label="Toetsen tonen voor"' + (pabo ? "" : " hidden") + ">" +
      ["alle", "jk", "ok"].map((d) => '<button type="button" data-dg="' + d + '" data-dg-plek="' + prefix + '" aria-pressed="' + (doelgroep === d) + '">' + { alle: "Alle", jk: "Jongere kind", ok: "Oudere kind" }[d] + "</button>").join("") +
      "</div></div>";
  }

  function tekenInstellingen() {
    tekenMeldingen();
    // Agenda's
    $("inst-agendas").innerHTML = "<h4>Agenda’s</h4>" +
      '<div class="agenda-keuze">' + agendaKeuzeHtml("inst-ag", instellingen.agendas) + "</div>" +
      paboKeuzeHtml("inst", instellingen.pabo, instellingen.doelgroep, agendaAan("school"));

    tekenImportBlok();
    // Uiterlijk: thema, accent, kleur per agenda
    const u = instellingen.uiterlijk;
    const stalen = (gekozenKleur, data, extra) => '<div class="stalen" role="group">' + Object.keys(KLEUREN).map((k) =>
      '<button type="button" class="staal" ' + data + '="' + k + '"' + extra + ' style="--c:' + KLEUREN[k][1] + ';--cd:' + KLEUREN[k][2] + '" aria-pressed="' + (gekozenKleur === k) + '" aria-label="' + KLEUREN[k][0] + '" title="' + KLEUREN[k][0] + '"></button>').join("") + "</div>";
    $("inst-uiterlijk").innerHTML = "<h4>Uiterlijk</h4>" +
      '<span class="label">Thema</span><div class="doelgroep" role="group" aria-label="Thema">' + Object.keys(THEMAS).map((t) => '<button type="button" data-thema-keuze="' + t + '" aria-pressed="' + (u.thema === t) + '">' + THEMAS[t] + "</button>").join("") + "</div>" +
      '<span class="label">Accentkleur</span><div class="stalen" role="group" aria-label="Accentkleur">' + ACCENTEN.map((k) =>
        '<button type="button" class="staal" data-accent="' + k + '" style="--c:' + KLEUREN[k][1] + ';--cd:' + KLEUREN[k][2] + '" aria-pressed="' + (u.accent === k) + '" aria-label="' + KLEUREN[k][0] + '" title="' + KLEUREN[k][0] + '"></button>').join("") + "</div>" +
      instellingen.agendas.map((a) => '<span class="label">Kleur van ' + AGENDA_NAAM[a].toLowerCase() + "</span>" + stalen(u.kleuren[a], 'data-agkleur="' + a + '" data-kleur', "")).join("") +
      '<span class="label">Opent op</span><div class="doelgroep" role="group" aria-label="Startscherm">' + [["auto", "Automatisch"], ["dag", "Dag"], ["week", "Week"], ["maand", "Maand"], ["lijst", "Lijst"]].map(([k, n]) => '<button type="button" data-start="' + k + '" aria-pressed="' + (u.start === k) + '">' + n + "</button>").join("") + "</div>" +
      '<p class="klein">Elke kleur is leesbaar in licht en donker. De keuze gaat mee naar je andere apparaten als je bent ingelogd.</p>';
    // Meeplannen
    const mp = instellingen.meeplannen;
    $("inst-meeplannen").innerHTML = "<h4>Meeplannen</h4>" +
      '<p class="klein">Digigenda doet stille voorstellen. Alles is wegtikbaar; hier zet je het uit.</p>' +
      '<label class="vink-label"><input type="checkbox" id="mp-gaten"' + (mp.gaten ? " checked" : "") + '><span>Vrije tijd tonen in de dagweergave <span class="klein">(“15:00–18:00 vrij”; to-do’s met <em>Plan in</em> in een gat zetten)</span></span></label>' +
      '<label class="vink-label"><input type="checkbox" id="mp-dagstart"' + (mp.dagstart ? " checked" : "") + '><span>Dagstart <span class="klein">(eerste keer per dag: to-do’s van eerder → vandaag, later of weg)</span></span></label>' +
      '<label class="vink-label"><input type="checkbox" id="mp-avond"' + (mp.avond ? " checked" : "") + '><span>Avondblik <span class="klein">(na 20:00 laat de Nu-kaart zien hoe morgen begint)</span></span></label>' +
      '<span class="label">Mijn dagritme</span><div class="ritme">' +
      '<label>Mijn dag loopt van <select id="ritme-van">' + [5, 6, 7, 8, 9, 10, 11, 12].map((h) => '<option value="' + h + '"' + (instellingen.ritme.van === h ? " selected" : "") + ">" + pad(h) + ":00</option>").join("") + "</select>" +
      ' tot <select id="ritme-tot">' + [17, 18, 19, 20, 21, 22, 23, 24].map((h) => '<option value="' + h + '"' + (instellingen.ritme.tot === h ? " selected" : "") + ">" + (h === 24 ? "24:00" : pad(h) + ":00") + "</option>").join("") + "</select></label>" +
      '<label>Studeren liefst <select id="ritme-studeren">' + Object.keys(RITME_STUDEREN).map((k) => '<option value="' + k + '"' + (instellingen.ritme.studeren === k ? " selected" : "") + ">" + RITME_STUDEREN[k] + "</option>").join("") + "</select></label>" +
      '<label>Pauze tussen afspraken <select id="ritme-pauze">' + [0, 15, 30].map((m) => '<option value="' + m + '"' + (instellingen.ritme.pauze === m ? " selected" : "") + ">" + (m ? m + " min" : "geen") + "</option>").join("") + "</select></label>" +
      '</div><p class="klein">Vrije tijd, Plan in en studieblokken houden hier rekening mee.</p>';
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
    if (t.id === "vergrendel-na") { voorkeur.vergrendelNa = +t.value; bewaarVoorkeur(); noteerActief(); }
    if (t.id === "mp-gaten" || t.id === "mp-dagstart" || t.id === "mp-avond") { instellingen.meeplannen[t.id.slice(3)] = t.checked; bewaarInstellingen(); tekenHoofd(); }
    if (/^ritme-/.test(t.id)) {
      const r = Object.assign({}, instellingen.ritme);
      if (t.id === "ritme-van") r.van = +t.value; if (t.id === "ritme-tot") r.tot = +t.value; if (t.id === "ritme-studeren") r.studeren = t.value; if (t.id === "ritme-pauze") r.pauze = +t.value;
      instellingen.ritme = normaalRitme(r); bewaarInstellingen(); tekenInstellingen(); tekenHoofd();
    }
    if (t.id === "push-ochtend" || t.id === "push-afspraak") {
      instellingen.meldingen[t.id === "push-ochtend" ? "ochtend" : "afspraak"] = t.checked;
      bewaarInstellingen();
      pushFout = false; pushMelding = "Opgeslagen."; tekenMeldingen();
    }
  });
  inst.addEventListener("click", (e) => {
    const t = e.target.closest("[data-dg],[data-link],[data-installeer],[data-push],[data-thema-keuze],[data-accent],[data-agkleur],[data-start]");
    if (!t) return;
    if (t.dataset.start) { instellingen.uiterlijk.start = t.dataset.start; bewaarInstellingen(); tekenInstellingen(); return; }
    if (t.dataset.themaKeuze) { instellingen.uiterlijk.thema = t.dataset.themaKeuze; bewaarInstellingen(); pasUiterlijkToe(); tekenInstellingen(); return; }
    if (t.dataset.accent) { instellingen.uiterlijk.accent = t.dataset.accent; bewaarInstellingen(); pasUiterlijkToe(); tekenInstellingen(); return; }
    if (t.dataset.agkleur) { instellingen.uiterlijk.kleuren[t.dataset.agkleur] = t.dataset.kleur; bewaarInstellingen(); pasUiterlijkToe(); tekenInstellingen(); tekenAlles(); return; }
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
    toast("Tip: typ " + (telefoon() ? "onderin" : "bovenin") + " ‘morgen 14:00 tandarts’ en druk op Enter.");
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
  let stilTekenen = false;
  const stil = (fn) => { stilTekenen = true; try { fn(); } finally { stilTekenen = false; } };
  async function synchroniseer() {
    if (!actief()) return;
    if (syncBezig) { syncNogEens = true; return; }
    const naam = sessie.naam;
    const token = sessie.token;
    const w = wachtrij(naam);
    if (!w.bewaar.length && !w.verwijder.length) { syncStatus = "ok"; if (accountPlek) stil(tekenAccount); return; }
    syncBezig = true;
    syncStatus = "bezig";
    if (accountPlek) stil(tekenAccount);
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
      if (accountPlek) stil(tekenAccount);
      return;
    }
    syncBezig = false;
    if (syncNogEens) { syncNogEens = false; return synchroniseer(); }
    if (accountPlek) stil(tekenAccount);
  }

  function neemServerInstellingen(i) {
    if (i && Array.isArray(i.agendas) && i.agendas.length) {
      instellingen = normaleInstellingen(Object.assign({}, i, { welkom: true }));
      bewaar(INST, instellingen);
      pasUiterlijkToe();
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
      // Rijen die de server als 'ongeldig' heeft gemarkeerd (ververste of verwijderde import) echt weghalen
      if (Array.isArray(r.opruimen) && r.opruimen.length) {
        const w = wachtrij(sessie.naam);
        r.opruimen.forEach((id) => { if (typeof id === "string" && !w.verwijder.includes(id)) w.verwijder.push(id); });
        bewaar(WACHT + sessie.naam, w);
        synchroniseer();
      }
      laadImports();
      stil(tekenAlles);
    } catch (fout) {
      if (fout.verlopen) return sessieVerlopen();
      syncStatus = "fout";
      if (accountPlek) stil(tekenAccount);
    }
  }

  async function naInloggen(r) {
    const faceid = (sessie && sessie.naam === r.naam && sessie.faceid) || (vorigeNaam === r.naam ? vorigeFaceid : null) || null;
    sessie = { naam: r.naam, token: r.token, faceid, laatstActief: Date.now() };
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
    laadImports();
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
      noteerActief();
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
      sessie.laatstActief = Date.now();
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
    imports = [];
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
    // Stille verversing (sync op de achtergrond): niet opnieuw tekenen terwijl iemand een pincode of naam typt
    if (stilTekenen && document.activeElement && el.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
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
        '<div class="knoppen"><button type="button" class="tekstknop" data-actie="overal">Uitloggen op alle apparaten</button></div>' +
        (bioMogelijk && sessie.faceid ? '<label class="vink-label vergrendel-keuze" for="vergrendel-na"><span>Opnieuw ontgrendelen</span><select id="vergrendel-na">' +
          VERGRENDEL_KEUZES.map(([m, t]) => '<option value="' + m + '"' + (m === vergrendelNa() ? " selected" : "") + ">" + t + "</option>").join("") + "</select></label>" : "");
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

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { vergrendelAlsNodig(); vernieuw(); tekenOpenBalk(); werkNuBij(); }
    else noteerActief();
  });
  window.addEventListener("pagehide", noteerActief);
  setInterval(() => { if (document.visibilityState === "visible") noteerActief(); }, 60000);
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
        let erbij = 0, teVeel = 0;
        const ids = [];
        lijst.forEach((o) => {
          const schoon = normaal(o);
          if (!schoon) return;
          if (opdrachten.length >= 1000 && !opdrachten.some((x) => x.id === schoon.id)) { teVeel++; return; }
          const bestaand = opdrachten.findIndex((x) => x.id === schoon.id);
          if (bestaand >= 0) opdrachten[bestaand] = schoon; else { opdrachten.push(schoon); erbij++; }
          ids.push(schoon.id);
        });
        opslaan(ids);
        meld("Back-up teruggezet: " + erbij + " nieuwe opdrachten toegevoegd." + (teVeel ? " " + teVeel + " overgeslagen: het maximum is 1000 opdrachten." : ""));
      } catch (err) {
        meld("Dit bestand is geen geldige back-up. Kies het .json-bestand dat je eerder hebt gedownload.");
      }
      e.target.value = "";
    };
    lezer.readAsText(bestand);
  });


  // ---------- agenda's binnenhalen (import via link, bestand of tekst) ----------
  const IMPORTS_LOKAAL = "digigenda-imports-v1";     // zonder account: imports alleen in deze browser (bestand/tekst)
  let imports = [];
  const importVan = (id) => imports.find((i) => i.id === id) || null;
  const importNaam = (id) => { const i = importVan(id); return i ? i.naam : "geïmporteerde agenda"; };
  const nieuwImportId = () => "imp-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const importsLokaal = () => (laad(IMPORTS_LOKAAL, []) || []).filter((i) => i && typeof i.id === "string");
  function laadImports() {
    if (actief()) {
      imports = (laad(CACHE + "imports:" + sessie.naam, []) || []);
      CLOUD.importsLijst(sessie.token).then((r) => {
        if (r && r.ok && Array.isArray(r.imports)) { imports = r.imports; bewaar(CACHE + "imports:" + sessie.naam, imports); if (inst.open) tekenImportBlok(); if (impVenster.open && impStap === "lijst") tekenImportVenster(); tekenHoofd(); }
      }).catch(() => {});
    } else if (!sessie) imports = importsLokaal();
    else imports = [];
  }
  function bewaarImportsLokaal() { if (!sessie) bewaar(IMPORTS_LOKAAL, imports); else bewaar(CACHE + "imports:" + sessie.naam, imports); }
  const wanneer = (iso) => {
    if (!iso) return "nog niet ververst";
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    return min < 1 ? "zojuist ververst" : min < 60 ? min + " min geleden ververst" : min < 48 * 60 ? Math.round(min / 60) + " uur geleden ververst" : "op " + dagKort(iso.slice(0, 10)) + " ververst";
  };

  function tekenImportBlok(doel) {
    const el = doel || $("inst-import");
    if (!el) return;
    let h = "<h4>Agenda’s binnenhalen</h4>";
    if (!imports.length) {
      h += '<p class="klein">Haal je werkrooster, schoolrooster of een andere agenda binnen. Via een link blijft hij vanzelf bijgewerkt; een bestand of geplakte tekst haal je één keer binnen.</p>';
    } else {
      h += '<ul class="import-lijst">' + imports.map((i) => {
        const items = opdrachten.filter((o) => o.bron === i.id).length;
        const status = i.soort === "link" ? (i.laatsteFout ? '<span class="te-laat">' + esc(i.laatsteFout) + "</span>" : esc(wanneer(i.laatstVerverst))) : "bestand, eenmalig";
        return '<li class="import-rij" style="--c:' + agendaKleur(i.agenda) + '"><i class="ak-stip"></i><div class="import-tekst"><strong>' + esc(i.naam) + "</strong>" +
          '<span class="klein">' + esc(AGENDA_NAAM[i.agenda] || "Werk") + (i.alleenBezet ? " · alleen als bezet" : "") + " · " + items + (items === 1 ? " item" : " items") + " · " + status + "</span></div>" +
          '<div class="knoppen">' + (i.soort === "link" && actief() ? '<button type="button" class="mini" data-import-ververs="' + esc(i.id) + '">Verversen</button>' : "") +
          '<button type="button" class="mini" data-import-weg="' + esc(i.id) + '">Verwijderen</button></div></li>';
      }).join("") + "</ul>";
    }
    h += '<div class="knoppen"><button type="button" class="hoofd" data-import-nieuw>Agenda toevoegen</button></div>';
    if (importMelding) h += '<p class="klein' + (importFout ? " te-laat" : "") + '" role="status">' + esc(importMelding) + "</p>";
    el.innerHTML = h;
    if (!doel && impVenster.open && impStap === "lijst" && $("imp-lijst-blok")) $("imp-lijst-blok").innerHTML = h;
  }
  let importMelding = "", importFout = false, importBezig = false, importWegStap = null;

  async function importVerversen(id) {
    if (!actief() || importBezig) return;
    importBezig = true; importMelding = "Verversen…"; importFout = false; tekenImportBlok();
    try {
      const r = await CLOUD.importVerversen(sessie.token, id);
      if (r && r.sessie === false) { importBezig = false; sluitInstellingen(); return sessieVerlopen(); }
      if (!r || !r.ok) throw new Error((r && r.fout) || "Verversen is niet gelukt.");
      importMelding = r.aantal + " afspraken bijgewerkt." + (r.meldingen && r.meldingen.length ? " " + r.meldingen[0] : "");
      await vernieuw();
    } catch (e) { importFout = true; importMelding = e.message || "Verversen is niet gelukt."; }
    importBezig = false; tekenImportBlok();
  }
  async function importVerwijderen(id) {
    const imp = importVan(id);
    if (!imp) return;
    if (importWegStap !== id) { importWegStap = id; importMelding = "Alle " + opdrachten.filter((o) => o.bron === id).length + " afspraken uit ‘" + imp.naam + "’ worden verwijderd. Klik nogmaals op Verwijderen om dat te bevestigen."; importFout = true; tekenImportBlok(); return; }
    importWegStap = null;
    const ids = opdrachten.filter((o) => o.bron === id).map((o) => o.id);
    try {
      if (actief()) {
        const r = await CLOUD.importVerwijder(sessie.token, id);
        if (r && r.sessie === false) { sluitInstellingen(); return sessieVerlopen(); }
        if (!r || !r.ok) throw new Error((r && r.fout) || "Verwijderen is niet gelukt.");
        (Array.isArray(r.opruimen) ? r.opruimen : []).forEach((x) => { if (typeof x === "string" && !ids.includes(x)) ids.push(x); });
      }
      imports = imports.filter((i) => i.id !== id);
      bewaarImportsLokaal();
      opdrachten = opdrachten.filter((o) => o.bron !== id);
      opslaan([], ids);
      importMelding = "‘" + imp.naam + "’ is verwijderd (" + ids.length + " afspraken)."; importFout = false;
    } catch (e) { importMelding = e.message || "Verwijderen is niet gelukt."; importFout = true; }
    tekenImportBlok();
  }
  inst.addEventListener("click", (e) => {
    const t = e.target.closest("[data-import-nieuw],[data-import-ververs],[data-import-weg]");
    if (!t) return;
    if (t.hasAttribute("data-import-nieuw")) { importMelding = ""; return openImportVenster("keuze"); }
    if (t.dataset.importVervers) return importVerversen(t.dataset.importVervers);
    if (t.dataset.importWeg) return importVerwijderen(t.dataset.importWeg);
  });

  // ---- het importvenster: keuze → voorbeeld → klaar ----
  const impVenster = $("importVenster");
  let impStap = "keuze", impData = null;   // impData: { soort, url?, tekst?, bestandsnaam?, uitkomst?, naam, agenda, alleenBezet, vervang? }
  function openImportVenster(stap, data) {
    if (sessie && !ontgrendeld) { toast("Ontgrendel eerst je account."); return; }
    impData = Object.assign({ soort: "link", naam: "", agenda: agendaAan("werk") ? "werk" : instellingen.agendas[0], alleenBezet: false }, data || {});
    impStap = stap || "keuze";
    if (impStap === "tekst" && impData.tekst) { leesLokaal(impData.tekst, "tekst"); return; }
    tekenImportVenster();
    if (typeof impVenster.showModal === "function") { if (!impVenster.open) impVenster.showModal(); } else impVenster.setAttribute("open", "");
  }
  function sluitImportVenster() { if (typeof impVenster.close === "function") impVenster.close(); else impVenster.removeAttribute("open"); if (inst.open) tekenImportBlok(); }
  $("imp-sluit").addEventListener("click", sluitImportVenster);

  const HULP = [
    { kop: "Outlook / Microsoft 365 (werk)", tekst: "Outlook op het web → Instellingen → Agenda → <em>Gedeelde agenda’s</em> → <em>Een agenda publiceren</em>. Kies de agenda en bijvoorbeeld <em>Kan alle details zien</em>, klik <em>Publiceren</em> en kopieer de <strong>ICS-link</strong>.",
      niet: "Staat het kopje er niet, of alleen ‘Kan zien wanneer ik bezet ben’? Dan heeft de IT-beheerder publiceren uitgezet. Probeer dan <em>Bestand importeren</em>: in Outlook op Windows via <em>Bestand → Agenda opslaan</em> (kies een datumbereik en ‘Volledige details’). Microsoft levert via de link ongeveer een half jaar vooruit." },
    { kop: "Google Agenda", tekst: "Op een computer: Instellingen → klik links op je agenda → <em>Agenda integreren</em> → kopieer het <strong>Geheime adres in iCal-indeling</strong>.",
      niet: "Ontbreekt dat adres bij een werk- of schoolaccount? Dan heeft de beheerder het uitgezet. Gebruik dan Instellingen → <em>Importeren en exporteren</em> → <em>Exporteren</em> (een .zip; pak hem uit en kies het .ics-bestand hieronder)." },
    { kop: "iPhone / iCloud", tekst: "Agenda-app → tik op de (i) naast de agenda → zet <em>Openbare agenda</em> aan → <em>Deel link</em> → kopieer. De link begint met webcal://.",
      niet: "Alleen iCloud-agenda’s kunnen dit; een werkagenda die via Exchange op je iPhone staat niet. Iedereen met de link kan je agenda lezen: deel hem dus alleen hier." },
    { kop: "Rooster-app van je werk (Shiftbase, Planday, Het Rooster, Bedrijfsrooster…)", tekst: "Zoek in de app of website naar <em>Agenda synchroniseren</em>, <em>iCal</em> of <em>Koppelingen</em> (vaak onder je profiel of bij het rooster) en kopieer de link.",
      niet: "Is er geen link? Dan heeft je werkgever dat uitgezet, of zit het rooster in een salarispakket (Nmbrs, AFAS, Youforce) dat geen agendalink heeft. Vraag de roosterplanner om het rooster als bestand of mail; de tekst kun je ook in de snelle invoer plakken (‘ma 9:00-17:00 kassa’)." },
    { kop: "HAN-rooster (MyX / Osiris)", tekst: "Kijk in MyX of bij het rooster in Osiris naar <em>Exporteren</em> of <em>Agenda</em>. Is er een .ics-export, kies die dan hieronder bij <em>Bestand importeren</em>.",
      niet: "Een vaste abonnementslink voor studenten is bij de HAN niet gedocumenteerd. Een geëxporteerd bestand verwerkt roosterwijzigingen niet: importeer het opnieuw als het rooster verandert (dezelfde afspraken worden dan bijgewerkt, niet verdubbeld)." }
  ];
  function hulpHtml() {
    return '<details class="imp-hulp"><summary>Waar vind ik de link? En wat als het niet werkt?</summary>' +
      HULP.map((h) => "<h5>" + h.kop + "</h5><p>" + h.tekst + "</p><p class=\"klein\"><strong>Werkt dit niet?</strong> " + h.niet + "</p>").join("") +
      "<h5>Waarom geen knop ‘Inloggen met Microsoft of Google’?</h5><p class=\"klein\">Dat vereist bij werk- en schoolaccounts meestal goedkeuring van de IT-beheerder (en bij Google een verificatie van de app). Dat werkt dus niet betrouwbaar zonder beheerder, en daarom zit het niet in Digigenda.</p></details>";
  }
  const privacyHtml = () => '<p class="klein imp-privacy">Werkgevers en scholen kunnen regels hebben over het delen van agenda’s buiten de organisatie. Twijfel je? Kies <em>alleen als bezet tonen</em>: dan bewaart Digigenda geen titels, plaatsen of notities, alleen de tijden.</p>';

  function tekenImportVenster() {
    const el = $("imp-inhoud");
    const d = impData || {};
    if (impStap === "lijst") {
      $("imp-titel").textContent = "Binnengehaalde agenda’s";
      el.innerHTML = '<section class="inst-blok" id="imp-lijst-blok"></section>';
      tekenImportBlok($("imp-lijst-blok"));   // zelfde weergave als in de instellingen
      return;
    }
    if (impStap === "keuze") {
      $("imp-titel").textContent = "Agenda binnenhalen";
      const linkKan = actief();
      el.innerHTML = '<div class="imp-stappen">' +
        '<section class="imp-route"><h4>1. Abonneren via een link</h4><p class="klein">De beste manier: Digigenda ververst de agenda elk uur vanzelf. Werkt met Outlook/Microsoft 365, Google Agenda, iCloud en de meeste rooster-apps.</p>' +
        (linkKan ? '<form id="imp-link-form" class="imp-form" novalidate><label class="vh" for="imp-url">Link</label><input id="imp-url" type="url" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="webcal://… of https://…/agenda.ics" value="' + esc(d.url || "") + '"><button type="submit" class="hoofd">Ophalen</button></form>'
          : '<p class="klein te-laat">Hiervoor is een account nodig: de link wordt op de server bewaard (versleuteld) en daar elk uur ververst. Log in via Instellingen → Account.</p>') +
        hulpHtml() + "</section>" +
        '<section class="imp-route"><h4>2. Bestand importeren (.ics)</h4><p class="klein">Werkt dit niet via een link? Exporteer een .ics-bestand uit Outlook, Google (uitgepakte .zip), iCloud of je rooster-app en kies het hier. Je moet dit herhalen als het rooster verandert.</p>' +
        '<div class="knoppen"><label class="zacht knop-label" for="imp-bestand">Bestand kiezen</label><input type="file" id="imp-bestand" accept=".ics,text/calendar,.ical,.ifb" hidden></div></section>' +
        '<section class="imp-route"><h4>3. Tekst plakken</h4><p class="klein">Een uitnodiging (.ics-bijlage) of agenda die je als tekst hebt gekopieerd. Je kunt zo’n tekst ook rechtstreeks in de snelle invoer plakken.</p>' +
        '<form id="imp-tekst-form" class="imp-form kolom" novalidate><label class="vh" for="imp-tekst">Agendatekst</label><textarea id="imp-tekst" rows="4" placeholder="BEGIN:VCALENDAR…"></textarea><div class="knoppen eind"><span class="ruimte"></span><button type="submit" class="zacht">Lezen</button></div></form></section>' +
        (d.fout ? '<p class="klein te-laat" role="alert">' + esc(d.fout) + "</p>" : "") + "</div>";
      return;
    }
    if (impStap === "bezig") {
      $("imp-titel").textContent = "Agenda binnenhalen";
      el.innerHTML = '<p class="klein" role="status">' + esc(d.bezigTekst || "Even geduld…") + "</p>";
      return;
    }
    if (impStap === "voorbeeld") {
      $("imp-titel").textContent = "Klopt dit?";
      const u = d.uitkomst;
      const bestaand = imports.filter((i) => i.soort !== "link");
      el.innerHTML = '<div class="imp-voorbeeld">' +
        "<p><strong>" + u.aantal + "</strong> " + (u.aantal === 1 ? "afspraak" : "afspraken") + (u.eersteDatum ? " van " + dagKort(u.eersteDatum) + " tot " + dagKort(u.laatsteDatum) : "") +
        (u.aantalAfspraken && u.aantalAfspraken !== u.aantal ? ' <span class="klein">(' + u.aantalAfspraken + " in het bestand; herhalingen uitgerold van 30 dagen terug tot 400 dagen vooruit)</span>" : "") + "</p>" +
        (u.meldingen && u.meldingen.length ? '<ul class="klein imp-meldingen">' + u.meldingen.map((m) => "<li>" + esc(m) + "</li>").join("") + "</ul>" : "") +
        (u.voorbeeld.length ? '<ul class="rijen imp-rijen">' + u.voorbeeld.map((v) => '<li class="rij blokrij"><span class="tijdstip' + (v.tijd ? "" : " heledag") + '">' + (v.tijd ? v.tijd + (v.eind ? "<small>" + v.eind + "</small>" : "") : "dag") + '</span><div class="rij-tekst"><span class="rij-titel">' + esc(d.alleenBezet ? "Bezet" : (v.titel || "(zonder titel)")) + '</span><span class="rij-meta">' + esc(dagKort(v.datum)) + "</span></div></li>").join("") +
          (u.aantal > u.voorbeeld.length ? '<li class="klein">… en nog ' + (u.aantal - u.voorbeeld.length) + "</li>" : "") + "</ul>" : '<p class="leeg">Geen afspraken in de komende periode.</p>') +
        '<form id="imp-vorm" class="imp-form kolom" novalidate>' +
        '<label for="imp-naam">Naam</label><input id="imp-naam" type="text" maxlength="60" value="' + esc(d.naam || u.naam || (d.soort === "link" ? (d.host || "Agenda") : (d.bestandsnaam || "Geplakte agenda"))) + '">' +
        '<label for="imp-agenda">Zet in agenda</label><select id="imp-agenda">' + instellingen.agendas.map((a) => '<option value="' + a + '"' + (a === d.agenda ? " selected" : "") + ">" + AGENDA_NAAM[a] + "</option>").join("") + "</select>" +
        '<label class="vink-label"><input type="checkbox" id="imp-bezet"' + (d.alleenBezet ? " checked" : "") + '><span>Alleen als bezet tonen <span class="klein">(geen titels, plaatsen of notities bewaren)</span></span></label>' +
        (d.soort !== "link" && bestaand.length ? '<label for="imp-vervang">Dit is een nieuwere versie van</label><select id="imp-vervang"><option value="">— nieuwe import —</option>' + bestaand.map((i) => '<option value="' + esc(i.id) + '"' + (d.vervang === i.id ? " selected" : "") + ">" + esc(i.naam) + "</option>").join("") + "</select>" : "") +
        privacyHtml() +
        '<div class="knoppen eind"><button type="button" class="zacht" data-imp-terug>Terug</button><span class="ruimte"></span><button type="submit" class="hoofd">' + (u.aantal ? "Toevoegen" : "Toch toevoegen") + "</button></div></form></div>";
      return;
    }
    if (impStap === "klaar") {
      $("imp-titel").textContent = "Gelukt";
      el.innerHTML = '<div class="imp-klaar"><p><strong>' + esc(d.naam) + "</strong> is binnengehaald: " + d.aantal + (d.aantal === 1 ? " afspraak" : " afspraken") + " in je agenda <em>" + esc(AGENDA_NAAM[d.agenda]) + "</em>." +
        (d.soort === "link" ? " Digigenda ververst de link elk uur." : " Verandert het rooster? Importeer het bestand dan opnieuw; dezelfde afspraken worden bijgewerkt.") + "</p>" +
        (d.meldingen && d.meldingen.length ? '<ul class="klein imp-meldingen">' + d.meldingen.map((m) => "<li>" + esc(m) + "</li>").join("") + "</ul>" : "") +
        '<div class="knoppen eind"><button type="button" class="zacht" data-imp-nog>Nog een agenda</button><span class="ruimte"></span><button type="button" class="hoofd" data-imp-klaar>Klaar</button></div></div>';
    }
  }

  // Bestand of tekst lokaal lezen (in de browser, niets gaat naar de server)
  function leesLokaal(tekst, soort, bestandsnaam) {
    const u = ICS.lees(tekst, {});
    if (!u.ok) { impData.fout = u.fout; impStap = "keuze"; tekenImportVenster(); if (!impVenster.open) openImportVenster("keuze", impData); return; }
    impData = Object.assign(impData || {}, { soort, tekst, bestandsnaam: bestandsnaam ? bestandsnaam.replace(/\.(ics|ical|ifb)$/i, "") : "", fout: "",
      uitkomst: { aantal: u.voorvallen.length, aantalAfspraken: u.aantalAfspraken, naam: u.naam, voorbeeld: u.voorvallen.slice(0, 12), meldingen: u.meldingen, eersteDatum: u.voorvallen[0] ? u.voorvallen[0].datum : null, laatsteDatum: u.voorvallen.length ? u.voorvallen[u.voorvallen.length - 1].datum : null }, voorvallen: u.voorvallen });
    impStap = "voorbeeld"; tekenImportVenster();
    if (!impVenster.open) { if (typeof impVenster.showModal === "function") impVenster.showModal(); else impVenster.setAttribute("open", ""); }
  }
  async function leesLink(url) {
    impData = Object.assign(impData || {}, { soort: "link", url, bezigTekst: "Link ophalen…", fout: "" });
    impStap = "bezig"; tekenImportVenster();
    try {
      const r = await CLOUD.importVoorbeeld(sessie.token, url);
      if (r && r.sessie === false) { sluitImportVenster(); return sessieVerlopen(); }
      if (!r || !r.ok) throw new Error((r && r.fout) || "Ophalen is niet gelukt.");
      let host = ""; try { host = new URL(url.replace(/^webcal:/i, "https:")).hostname; } catch (e) { /* niets */ }
      impData.host = host; impData.uitkomst = r;
      impStap = "voorbeeld";
    } catch (e) { impData.fout = e.message || "Ophalen is niet gelukt."; impStap = "keuze"; }
    tekenImportVenster();
  }
  async function importToevoegen() {
    const d = impData;
    const naam = ($("imp-naam").value || "").trim().slice(0, 60) || "Agenda";
    const agenda = $("imp-agenda").value;
    const alleenBezet = $("imp-bezet").checked;
    const vervang = $("imp-vervang") ? $("imp-vervang").value : "";
    const id = vervang || nieuwImportId();
    const def = { id, naam, soort: d.soort, agenda, alleenBezet, host: d.host || null, laatstVerverst: null, laatsteFout: null, aantal: 0, gemaakt: new Date().toISOString() };
    if (d.soort === "link") def.url = d.url;
    impStap = "bezig"; d.bezigTekst = "Toevoegen…"; tekenImportVenster();
    try {
      if (actief()) {
        const r = await CLOUD.importBewaar(sessie.token, def);
        if (r && r.sessie === false) { sluitImportVenster(); return sessieVerlopen(); }
        if (!r || !r.ok) throw new Error((r && r.fout) || "Opslaan is niet gelukt.");
      } else if (imports.length >= 10 && !vervang) throw new Error("Je kunt maximaal 10 agenda’s binnenhalen. Verwijder er eerst een.");
      delete def.url;
      imports = imports.filter((i) => i.id !== id).concat([def]);
      bewaarImportsLokaal();
      let aantal = 0, meldingen = d.uitkomst.meldingen || [];
      if (d.soort === "link") {
        const r = await CLOUD.importVerversen(sessie.token, id);
        if (!r || !r.ok) throw new Error((r && r.fout) || "Ophalen is niet gelukt.");
        aantal = r.aantal; meldingen = r.meldingen || meldingen;
        await vernieuw();
      } else {
        const nieuw = d.voorvallen.slice(0, 1500).map((v) => normaal(ICS.naarOpdracht(v, id, agenda, alleenBezet))).filter(Boolean);
        if (d.voorvallen.length > 1500) meldingen = meldingen.concat(["Meer dan 1500 afspraken: alleen de eerste 1500 zijn meegenomen."]);
        const nieuweIds = new Set(nieuw.map((o) => o.id));
        const weg = opdrachten.filter((o) => o.bron === id && !nieuweIds.has(o.id)).map((o) => o.id);
        opdrachten = opdrachten.filter((o) => o.bron !== id).concat(nieuw);
        if (opdrachten.length > 3000) throw new Error("Daarmee kom je boven de 3000 opdrachten. Verwijder eerst een oude import.");
        aantal = nieuw.length;
        if (!agendaAan(agenda)) { instellingen.agendas = AGENDAS.filter((a) => a === agenda || instellingen.agendas.includes(a)); bewaarInstellingen(); }
        opslaan(nieuw.map((o) => o.id), weg);
        def.aantal = aantal; def.laatstVerverst = new Date().toISOString();
      }
      impData = { naam, agenda, soort: d.soort, aantal, meldingen };
      impStap = "klaar";
    } catch (e) {
      d.fout = e.message || "Toevoegen is niet gelukt."; impStap = "voorbeeld"; tekenImportVenster();
      const f = document.createElement("p"); f.className = "klein te-laat"; f.setAttribute("role", "alert"); f.textContent = d.fout; $("imp-vorm").prepend(f);
      return;
    }
    tekenImportVenster();
    laadImports();
  }
  impVenster.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "imp-link-form") { const u = ($("imp-url").value || "").trim(); if (!/^(webcal|https):\/\//i.test(u)) { impData.fout = "Plak een link die begint met webcal:// of https://."; return tekenImportVenster(); } return leesLink(u); }
    if (e.target.id === "imp-tekst-form") { const t = $("imp-tekst").value || ""; if (!t.trim()) return; return leesLokaal(t, "tekst"); }
    if (e.target.id === "imp-vorm") return importToevoegen();
  });
  impVenster.addEventListener("change", (e) => {
    if (e.target.id === "imp-bestand") {
      const bestand = e.target.files && e.target.files[0];
      if (!bestand) return;
      if (bestand.size > 5 * 1024 * 1024) { impData.fout = "Dit bestand is groter dan 5 MB."; e.target.value = ""; return tekenImportVenster(); }
      const lezer = new FileReader();
      lezer.onload = () => leesLokaal(String(lezer.result || ""), "bestand", bestand.name);
      lezer.readAsText(bestand);
      e.target.value = "";
    }
    if (e.target.id === "imp-bezet" && impData) { impData.alleenBezet = e.target.checked; impData.naam = $("imp-naam").value; impData.agenda = $("imp-agenda").value; tekenImportVenster(); }
  });
  impVenster.addEventListener("click", (e) => {
    const t = e.target.closest("[data-imp-terug],[data-imp-nog],[data-imp-klaar],[data-import-nieuw],[data-import-ververs],[data-import-weg]");
    if (!t) return;
    if (t.hasAttribute("data-imp-terug")) { impStap = "keuze"; impData.fout = ""; return tekenImportVenster(); }
    if (t.hasAttribute("data-imp-nog") || t.hasAttribute("data-import-nieuw")) { impData = { soort: "link", naam: "", agenda: impData && impData.agenda || "werk", alleenBezet: false }; impStap = "keuze"; return tekenImportVenster(); }
    if (t.hasAttribute("data-imp-klaar")) return sluitImportVenster();
    if (t.dataset.importVervers) return importVerversen(t.dataset.importVervers).then(() => { if (impStap === "lijst") tekenImportVenster(); });
    if (t.dataset.importWeg) return importVerwijderen(t.dataset.importWeg).then(() => { if (impStap === "lijst") tekenImportVenster(); });
  });

  // Gedeeld naar de app (Android share-target) of geopend met ?tekst=…: agenda-tekst → import, anders → snelle invoer
  // Een melding (of een link) wijst naar één item: toon die dag en open het item
  function openItem(id, datum) {
    const o = opdrachten.find((x) => x.id === id);
    const d = o ? o.datum : (/^\d{4}-\d{2}-\d{2}$/.test(datum || "") ? datum : vandaag());
    zetDag(d); weekendTonen = false;
    const dt = ontleed(d); maand = { j: dt.getFullYear(), m: dt.getMonth() };
    zetWeergave("dag");
    if (o && !(sessie && !ontgrendeld)) openVenster(o.id);
    else if (!o) toast("Deze afspraak staat niet (meer) in je agenda.");
  }
  function verwerkStartParameters() {
    let q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    const tekst = (q.get("tekst") || q.get("text") || "").trim(), url = (q.get("url") || "").trim(), titel = (q.get("titel") || q.get("title") || "").trim();
    const item = (q.get("item") || "").trim();
    if (!tekst && !url && !titel && !item && !q.get("nieuw") && !q.get("gedeeld") && !q.get("scherm")) return;
    try { history.replaceState(null, "", location.pathname); } catch (e) { /* niets */ }
    if (item) return openItem(item, q.get("datum"));
    if (q.get("scherm") === "vandaag") { gekozen = vandaag(); return zetWeergave("dag"); }
    if (q.get("nieuw")) { if (telefoon()) window.scrollTo(0, 0); snel.focus(); return; }
    if (q.get("gedeeld")) {
      // Gedeeld via de share-target (Android): de service worker heeft het bestand of de tekst klaargezet
      if (!("caches" in window)) return;
      caches.open("digigenda-gedeeld").then((c) => c.match("./gedeeld")).then((r) => r ? r.text() : "").then((t) => {
        caches.open("digigenda-gedeeld").then((c) => c.delete("./gedeeld")).catch(() => {});
        if (!t) return;
        if (/BEGIN:VCALENDAR/i.test(t)) return openImportVenster("tekst", { tekst: t });
        const link = /^(webcal|https):\/\/\S+/i.exec(t.trim());
        if (link && /\.(ics|ical)(\?|$)|webcal:/i.test(link[0])) return openImportVenster("keuze", { url: link[0] });
        snel.value = t.slice(0, 4000); groeiVeld(); tekenVoorbeeld(); snel.focus();
      }).catch(() => {});
      return;
    }
    if (/BEGIN:VCALENDAR/i.test(tekst)) return openImportVenster("tekst", { tekst });
    const link = [url, tekst, titel].find((x) => /^(webcal|https):\/\/\S+/i.test(x));
    if (link && /\.(ics|ical)(\?|$)|webcal:|calendar|agenda|rooster|ical/i.test(link)) return openImportVenster("keuze", { url: link.match(/^(webcal|https):\/\/\S+/i)[0] });
    snel.value = [titel, tekst].filter(Boolean).join(" ").slice(0, 4000);
    groeiVeld(); tekenVoorbeeld(); snel.focus();
  }

  // ---------- studieblokken-venster ----------
  const studieVenster = $("studieVenster");
  let studieData = null;
  function openStudie(id, titel, datum) {
    if (sessie && !ontgrendeld) { toast("Ontgrendel eerst je account."); return; }
    studieData = { id, titel, datum, aantal: 4, duur: 90, voorstel: null };
    tekenStudie();
    if (typeof studieVenster.showModal === "function") studieVenster.showModal(); else studieVenster.setAttribute("open", "");
  }
  function sluitStudie() { if (typeof studieVenster.close === "function") studieVenster.close(); else studieVenster.removeAttribute("open"); }
  function tekenStudie() {
    const d = studieData;
    const dagen = Math.round((ontleed(d.datum) - ontleed(vandaag())) / 864e5);
    let h = '<div class="venster-kop"><h3 id="studie-titel">Studieblokken</h3><button type="button" class="pijl" data-studie-sluit aria-label="Sluiten">×</button></div><div class="venster-inhoud studie-inhoud">' +
      "<p>Voor <strong>" + esc(d.titel) + "</strong> op " + esc(dagKort(d.datum)) + " (over " + dagen + (dagen === 1 ? " dag" : " dagen") + "). Digigenda zoekt vrije tijd vóór die dag, liefst ’s middags of ’s avonds en verspreid over verschillende dagen.</p>" +
      '<form id="studie-form" class="imp-form" novalidate><div><label for="studie-aantal">Blokken</label><input id="studie-aantal" type="number" min="1" max="12" value="' + d.aantal + '"></div>' +
      '<div><label for="studie-duur">Duur</label><select id="studie-duur">' + [45, 60, 90, 120].map((m) => '<option value="' + m + '"' + (m === d.duur ? " selected" : "") + ">" + duurTekst(m) + "</option>").join("") + "</select></div>" +
      '<div class="studie-knop"><button type="submit" class="hoofd">' + (d.voorstel ? "Opnieuw" : "Voorstel maken") + "</button></div></form>";
    if (d.voorstel) {
      h += d.voorstel.length ? '<ul class="rijen studie-lijst">' + d.voorstel.map((b, i) => '<li class="rij"><label class="vink-label"><input type="checkbox" data-studie-vink="' + i + '"' + (b.aan ? " checked" : "") + '><span><strong>' + esc(dagKort(b.datum)) + "</strong> " + b.tijd + "–" + b.eind + "</span></label></li>").join("") + "</ul>" +
        (d.voorstel.length < d.aantal ? '<p class="klein te-laat">Er is maar voor ' + d.voorstel.length + " blok" + (d.voorstel.length === 1 ? "" : "ken") + " ruimte vóór die dag.</p>" : "") +
        '<div class="knoppen eind"><span class="ruimte"></span><button type="button" class="hoofd" data-studie-plan>' + (d.voorstel.filter((b) => b.aan).length || 0) + " blokken inplannen</button></div>"
        : '<p class="leeg">Geen vrije tijd gevonden vóór die dag. Maak eerst ruimte, of plan zelf een blok.</p>';
    }
    studieVenster.innerHTML = h + "</div>";
  }
  studieVenster.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = studieData;
    d.aantal = Math.max(1, Math.min(12, parseInt($("studie-aantal").value, 10) || 4));
    d.duur = +$("studie-duur").value || 90;
    d.voorstel = studieVoorstel(d.datum, d.aantal, d.duur).map((b) => Object.assign(b, { aan: true }));
    tekenStudie();
  });
  studieVenster.addEventListener("change", (e) => { if (e.target.dataset.studieVink != null && studieData.voorstel) { studieData.voorstel[+e.target.dataset.studieVink].aan = e.target.checked; const k = studieVenster.querySelector("[data-studie-plan]"); if (k) k.textContent = studieData.voorstel.filter((b) => b.aan).length + " blokken inplannen"; } });
  studieVenster.addEventListener("click", (e) => {
    if (e.target === studieVenster || e.target.closest("[data-studie-sluit]")) return sluitStudie();
    if (!e.target.closest("[data-studie-plan]")) return;
    const d = studieData;
    const gekozen = (d.voorstel || []).filter((b) => b.aan);
    if (!gekozen.length) return;
    const nieuw = gekozen.map((b) => normaal({ id: nieuwId() + Math.random().toString(36).slice(2, 4), titel: ("Studeren: " + d.titel).slice(0, 80), datum: b.datum, tijd: b.tijd, eind: b.eind, soort: "opdracht", agenda: agendaAan("school") ? "school" : instellingen.agendas[0], notitie: "Voor " + d.titel + " op " + dagKort(d.datum), klaar: false }));
    opdrachten.push(...nieuw);
    sluitStudie();
    opslaan(nieuw.map((o) => o.id));
    const ids = nieuw.map((o) => o.id);
    toast(nieuw.length + (nieuw.length === 1 ? " studieblok ingepland" : " studieblokken ingepland"), () => { opdrachten = opdrachten.filter((o) => !ids.includes(o.id)); opslaan([], ids); });
  });

  // ---------- start ----------
  if (telefoon()) snel.placeholder = "Typ iets… ‘morgen 14:00 tandarts’";
  if (!opslagWerkt) toast("Let op: deze browser staat opslaan niet toe (bijvoorbeeld een privévenster).");
  laadImports();
  tekenAlles();
  if (!instellingen.welkom && !sessie) toonWelkom();
  verwerkStartParameters();
  if (window.BIO) BIO.beschikbaar().then((ja) => { bioMogelijk = ja; if (accountPlek) tekenAccount(); });
  vernieuw();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").then(() => pushVernieuwen()).catch(() => {}));
    // Tik op een melding terwijl de app al open is: naar vandaag
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "naar-vandaag") { gekozen = vandaag(); weekendTonen = false; zetWeergave("dag"); }
      if (e.data && e.data.type === "open-item") openItem(e.data.id, e.data.datum);
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
