/*
  Pabo 3 Kalender
  - Vaste toetsen, periodes en vakanties komen uit toetsen.js.
  - Zonder account: eigen opdrachten staan in localStorage (alleen in deze browser).
  - Met account (gebruikersnaam + pincode): opdrachten staan online in Supabase
    (zie cloud.js) en zijn op elk apparaat te zien. Een kopie blijft in de browser,
    zodat de kalender ook zonder internet te bekijken is.
*/
(function () {
  "use strict";

  const P = window.PLANNING;
  const OPSLAG = "pabo3-kalender-opdrachten-v1";
  const VOORKEUR = "pabo3-kalender-voorkeur-v1";
  const SESSIE = "pabo3-kalender-sessie-v1";
  const CACHE = "pabo3-kalender-cache-v1:";
  const WACHT = "pabo3-kalender-wacht-v1:";
  const EIGEN_SOORTEN = ["opdracht", "deadline", "herkansing", "toets", "overig"];

  const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const DAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"];
  const DAGEN_LANG = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
  const SOORT_LABEL = { opdracht: "Opdracht", deadline: "Deadline", herkansing: "Herkansing", overig: "Overig", lkt: "Landelijke kennistoets", toets: "Cursustoets", periode: "Periode", vakantie: "Vakantie" };
  const DG_LABEL = { alle: "JK + OK", jk: "Jongere kind", ok: "Oudere kind" };

  // ---------- hulpfuncties ----------
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const ontleed = (s) => { const [j, m, d] = s.split("-").map(Number); return new Date(j, m - 1, d); };
  const vandaag = () => iso(new Date());
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const kleur = (soort) => "var(--" + soort + ")";
  const kortDatum = (s) => { const d = ontleed(s); return d.getDate() + " " + KORT[d.getMonth()]; };
  const langDatum = (s) => { const d = ontleed(s); return DAGEN_LANG[d.getDay()] + " " + d.getDate() + " " + MAANDEN[d.getMonth()] + " " + d.getFullYear(); };

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

  const hoofd = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  function weg(sleutel) { try { localStorage.removeItem(sleutel); } catch (e) { /* niets */ } }

  // ---------- toestand ----------
  // sessie = { naam, token, faceid } als je bent ingelogd (faceid = sleutel-id of null)
  let sessie = laad(SESSIE, null);
  if (!sessie || typeof sessie.token !== "string" || typeof sessie.naam !== "string") sessie = null;
  if (!window.CLOUD || !CLOUD.aan) sessie = null;
  let ontgrendeld = !!sessie && !sessie.faceid;
  const actief = () => !!sessie && ontgrendeld;

  let opdrachten = [];
  function laadEigen() {
    if (actief()) opdrachten = laad(CACHE + sessie.naam, []);
    else if (sessie) opdrachten = [];            // vergrendeld: niets tonen
    else opdrachten = laad(OPSLAG, []);
    if (!Array.isArray(opdrachten)) opdrachten = [];
  }
  laadEigen();

  let voorkeur = laad(VOORKEUR, { doelgroep: "alle" });

  const nu = new Date();
  let maand = { j: nu.getFullYear(), m: nu.getMonth() };
  let gekozen = vandaag();
  let bewerkId = null;

  // ---------- gegevens per dag ----------
  const pastBij = (dg) => !dg || dg === "alle" || voorkeur.doelgroep === "alle" || dg === voorkeur.doelgroep;
  const vakantieOp = (s) => P.vakanties.find((v) => s >= v.start && s <= v.eind);
  const periodeOp = (s) => P.periodes.find((p) => s >= p.start && s <= p.eind);

  function vastOp(s) {
    const uit = [];
    P.periodes.forEach((p) => { if (p.start === s) uit.push({ titel: "Start " + p.naam, soort: "periode", uitleg: p.uitleg || "" }); });
    P.toetsen.forEach((t) => { if (t.datum === s && pastBij(t.doelgroep)) uit.push(t); });
    return uit;
  }
  const eigenOp = (s) => opdrachten.filter((o) => o.datum === s);

  // ---------- jaarstrook ----------
  function maandenVanJaar() {
    // Periode 1 begint op 31 augustus; de strook start bij de maand ná die eerste dag (september) en loopt t/m juli.
    const start = ontleed(P.periodes[0].start);
    start.setDate(start.getDate() + 1);
    const lijst = [];
    for (let i = 0; i < 11; i++) lijst.push({ j: start.getFullYear() + Math.floor((start.getMonth() + i) / 12), m: (start.getMonth() + i) % 12 });
    return lijst;
  }
  function tekenJaarstrook() {
    $("jaarstrook").innerHTML = maandenVanJaar().map((mm) => {
      const prefix = mm.j + "-" + pad(mm.m + 1);
      const p = periodeOp(prefix + "-15");
      const stippen = [];
      P.toetsen.forEach((t) => { if (t.datum.startsWith(prefix) && pastBij(t.doelgroep)) stippen.push(t.soort); });
      opdrachten.forEach((o) => { if (o.datum.startsWith(prefix) && !o.klaar) stippen.push(o.soort); });
      const actief = mm.j === maand.j && mm.m === maand.m;
      return '<button type="button" data-j="' + mm.j + '" data-m="' + mm.m + '"' + (actief ? ' aria-current="true"' : "") + '>' +
        '<span class="m">' + KORT[mm.m] + "</span>" +
        '<span class="p">' + (p ? p.kort : "–") + "</span>" +
        '<span class="stippen">' + stippen.slice(0, 5).map((s) => '<i style="background:' + kleur(s) + '"></i>').join("") + "</span></button>";
    }).join("");
  }

  // ---------- maandraster ----------
  function tekenRaster() {
    $("maandtitel").textContent = MAANDEN[maand.m] + " " + maand.j;
    const eerste = new Date(maand.j, maand.m, 1);
    const verschuiving = (eerste.getDay() + 6) % 7;
    const dagenInMaand = new Date(maand.j, maand.m + 1, 0).getDate();
    const weken = Math.ceil((verschuiving + dagenInMaand) / 7);
    const vandaagS = vandaag();

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
        if (s === vandaagS) klassen.push("vandaag");
        if (s === gekozen) klassen.push("gekozen");

        const vast = vastOp(s);
        const eigen = eigenOp(s);
        const max = 3;
        let chips = "";
        let aantal = 0;
        vast.forEach((v) => {
          if (aantal++ < max) chips += '<div class="chip vast" style="--c:' + kleur(v.soort) + '" title="' + esc(v.titel) + '">' + slot() + "<span>" + esc(v.titel) + "</span></div>";
        });
        eigen.forEach((o) => {
          if (aantal++ < max) chips += '<button type="button" class="chip eigen' + (o.klaar ? " klaar" : "") + '" data-id="' + esc(o.id) + '" style="--c:' + kleur(o.soort) + '" title="' + esc(o.titel) + '"><span>' + esc(o.titel) + "</span></button>";
        });
        if (aantal > max) chips += '<span class="meer">+' + (aantal - max) + " meer</span>";

        const vakLabel = vak && (s === vak.start || d.getDate() === 1 || i === 0) ? '<span class="vaklabel">' + esc(vak.naam) + "</span>" : "";
        html += '<div class="' + klassen.join(" ") + '" role="gridcell" tabindex="0" data-datum="' + s + '" aria-label="' + langDatum(s) + (vast.length + eigen.length ? ", " + (vast.length + eigen.length) + " items" : "") + '">' +
          '<span class="nr">' + d.getDate() + "</span>" + vakLabel + chips + "</div>";
      }
    }
    $("grid").innerHTML = html;
  }

  function slot() {
    return '<svg class="slot" viewBox="0 0 10 10" aria-label="vast"><rect x="1.5" y="4.5" width="7" height="5" rx="1" fill="currentColor"/><path d="M3 4.5V3a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
  }

  // ---------- dagpaneel ----------
  function tekenDagpaneel() {
    const s = gekozen;
    const p = periodeOp(s);
    const vak = vakantieOp(s);
    const vast = vastOp(s);
    const eigen = eigenOp(s);

    let html = '<div class="dagkop"><h3>' + langDatum(s) + "</h3>" +
      '<span class="label">' + (p ? p.naam : "Buiten het schooljaar") + (vak ? " · " + esc(vak.naam) : "") + "</span></div>";

    if (!vast.length && !eigen.length) {
      html += '<p class="leeg">Niets gepland op deze dag.</p>';
    } else {
      html += '<ul class="lijst">';
      vast.forEach((v) => {
        html += '<li class="item" style="--c:' + kleur(v.soort) + '"><span class="streep"></span><div><h4>' + esc(v.titel) + "</h4>" +
          (v.uitleg ? "<p>" + esc(v.uitleg) + "</p>" : "") + '<span class="tag">Vast</span><span class="tag">' + SOORT_LABEL[v.soort] + "</span></div><span></span></li>";
      });
      eigen.forEach((o) => { html += eigenItem(o, false); });
      html += "</ul>";
    }
    html += '<div class="knoppen"><button type="button" class="hoofd" data-nieuw="' + s + '">+ Opdracht op deze dag</button></div>';
    $("dagpaneel").innerHTML = html;
  }

  function eigenItem(o, metDatum) {
    const telaat = !o.klaar && o.datum < vandaag();
    const d = ontleed(o.datum);
    const links = metDatum
      ? '<span class="datumblok" style="--c:' + kleur(o.soort) + '"><b>' + d.getDate() + "</b><small>" + KORT[d.getMonth()] + "</small></span>"
      : '<span class="streep"></span>';
    return '<li class="item' + (o.klaar ? " klaar" : "") + '" style="--c:' + kleur(o.soort) + '">' + links +
      "<div><h4>" + esc(o.titel) + "</h4>" + (o.notitie ? "<p>" + esc(o.notitie) + "</p>" : "") +
      '<span class="tag">' + (SOORT_LABEL[o.soort] || "Opdracht") + "</span>" + (telaat ? '<span class="tag te-laat">Verlopen</span>' : "") + "</div>" +
      '<span class="acties"><button type="button" class="mini" data-klaar="' + esc(o.id) + '" aria-pressed="' + !!o.klaar + '">' + (o.klaar ? "Heropen" : "Klaar") + "</button>" +
      '<button type="button" class="mini" data-bewerk="' + esc(o.id) + '">Wijzig</button></span></li>';
  }

  // ---------- lijsten ----------
  function tekenMijnLijst() {
    const vs = vandaag();
    const open = opdrachten.filter((o) => !o.klaar).sort((a, b) => a.datum.localeCompare(b.datum));
    const verlopen = open.filter((o) => o.datum < vs);
    const komend = open.filter((o) => o.datum >= vs);
    const lijst = verlopen.concat(komend).slice(0, 10);
    const klaar = opdrachten.filter((o) => o.klaar).length;
    if (!opdrachten.length) {
      $("mijnlijst").innerHTML = '<li class="leeg">Nog geen eigen opdrachten. Klik op een dag in de kalender of op “+ Opdracht”.</li>';
      return;
    }
    $("mijnlijst").innerHTML = (lijst.length ? lijst.map((o) => eigenItem(o, true)).join("") : '<li class="leeg">Alles is afgerond.</li>') +
      (klaar ? '<li class="klein">' + klaar + " afgeronde opdracht" + (klaar === 1 ? "" : "en") + " verborgen in deze lijst.</li>" : "") +
      (open.length > 10 ? '<li class="klein">En nog ' + (open.length - 10) + " later in het jaar.</li>" : "");
  }

  function tekenZonderDatum() {
    const lijst = P.zonderDatum.filter((t) => pastBij(t.doelgroep));
    $("zonderdatum").innerHTML = lijst.map((t) =>
      '<li class="item" style="--c:var(--toets)"><span class="datumblok"><b>' + esc(t.periode) + "</b><small>datum?</small></span>" +
      "<div><h4>" + esc(t.titel) + "</h4><p>" + esc(t.uitleg) + "</p>" +
      '<span class="tag">' + esc(t.vorm) + '</span><span class="tag">' + DG_LABEL[t.doelgroep || "alle"] + '</span><span class="tag">Herk. ' + esc(t.herkansing) + "</span></div><span></span></li>"
    ).join("");
  }

  function tekenDoelgroep() {
    document.querySelectorAll(".doelgroep button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.dg === voorkeur.doelgroep)));
  }

  function tekenAlles() {
    tekenDoelgroep();
    tekenJaarstrook();
    tekenRaster();
    tekenDagpaneel();
    tekenMijnLijst();
    tekenZonderDatum();
    tekenAccount();
    $("opslagtekst").textContent = actief()
      ? "Je opdrachten staan online in je account. Log op een ander apparaat in met dezelfde gebruikersnaam en pincode om ze daar te zien. Een back-up downloaden kan nog steeds."
      : "Je eigen opdrachten worden alleen in deze browser op dit apparaat bewaard. Anderen zien ze niet. Log in om ze op al je apparaten te zien, of maak een back-up.";
    if (!opslagWerkt) $("opslagtekst").innerHTML = '<strong class="te-laat">Let op:</strong> deze browser staat opslaan niet toe (bijvoorbeeld een privévenster). Je opdrachten verdwijnen als je de pagina sluit.';
  }

  // ---------- opslaan ----------
  // gewijzigd = id's die nieuw of aangepast zijn, verwijderd = id's die weg zijn.
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
  function nieuwId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---------- venster ----------
  const venster = $("venster");
  let verwijderStap = 0;

  function openVenster(id, datum) {
    if (sessie && !ontgrendeld) {
      accountMelding = "Ontgrendel eerst je account om opdrachten toe te voegen of te wijzigen.";
      tekenAccount();
      const k = document.querySelector("#account [data-actie]");
      if (k) { k.focus(); k.scrollIntoView({ block: "center", behavior: "smooth" }); }
      return;
    }
    bewerkId = id || null;
    verwijderStap = 0;
    const o = id ? opdrachten.find((x) => x.id === id) : null;
    $("venstertitel").textContent = o ? "Opdracht wijzigen" : "Opdracht toevoegen";
    $("f-titel").value = o ? o.titel : "";
    $("f-datum").value = o ? o.datum : (datum || gekozen);
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
    const gegevens = { titel, datum, soort: $("f-soort").value, notitie: $("f-notitie").value.trim(), klaar: $("f-klaar").checked };
    let id = bewerkId;
    if (bewerkId) {
      const o = opdrachten.find((x) => x.id === bewerkId);
      if (o) Object.assign(o, gegevens);
    } else {
      id = nieuwId();
      opdrachten.push(Object.assign({ id }, gegevens));
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

  // ---------- klikken ----------
  function kiesDag(s) {
    gekozen = s;
    const d = ontleed(s);
    if (d.getMonth() !== maand.m || d.getFullYear() !== maand.j) maand = { j: d.getFullYear(), m: d.getMonth() };
    tekenJaarstrook(); tekenRaster(); tekenDagpaneel();
  }

  $("grid").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip.eigen");
    if (chip) { e.stopPropagation(); kiesDag(chip.closest(".dag").dataset.datum); openVenster(chip.dataset.id); return; }
    const cel = e.target.closest(".dag");
    if (cel) kiesDag(cel.dataset.datum);
  });
  $("grid").addEventListener("keydown", (e) => {
    const cel = e.target.closest(".dag");
    if (!cel) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); kiesDag(cel.dataset.datum); }
    const stap = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (stap) {
      e.preventDefault();
      const d = ontleed(cel.dataset.datum); d.setDate(d.getDate() + stap);
      kiesDag(iso(d));
      const nieuw = $("grid").querySelector('[data-datum="' + iso(d) + '"]');
      if (nieuw) nieuw.focus();
    }
  });

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-klaar],[data-bewerk],[data-nieuw]");
    if (!t) return;
    if (t.dataset.nieuw) return openVenster(null, t.dataset.nieuw);
    if (t.dataset.bewerk) return openVenster(t.dataset.bewerk);
    const o = opdrachten.find((x) => x.id === t.dataset.klaar);
    if (o) { o.klaar = !o.klaar; opslaan([o.id]); }
  });

  $("jaarstrook").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    maand = { j: +b.dataset.j, m: +b.dataset.m };
    tekenJaarstrook(); tekenRaster();
  });
  $("vorige").addEventListener("click", () => { maand = maand.m === 0 ? { j: maand.j - 1, m: 11 } : { j: maand.j, m: maand.m - 1 }; tekenJaarstrook(); tekenRaster(); });
  $("volgende").addEventListener("click", () => { maand = maand.m === 11 ? { j: maand.j + 1, m: 0 } : { j: maand.j, m: maand.m + 1 }; tekenJaarstrook(); tekenRaster(); });
  $("naarVandaag").addEventListener("click", () => kiesDag(vandaag()));
  $("nieuw").addEventListener("click", () => openVenster(null, gekozen));

  document.querySelectorAll(".doelgroep button").forEach((b) => b.addEventListener("click", () => {
    voorkeur.doelgroep = b.dataset.dg;
    bewaar(VOORKEUR, voorkeur);
    tekenAlles();
  }));

  // ---------- back-up ----------
  function meld(tekst) { $("melding").textContent = tekst; }

  $("exporteer").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app: "pabo3-kalender", versie: 1, opdrachten }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pabo3-kalender-backup-" + vandaag() + ".json";
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
          if (!o || typeof o.titel !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.datum || "")) return;
          const schoon = { id: String(o.id || nieuwId()), titel: o.titel.slice(0, 80), datum: o.datum, soort: EIGEN_SOORTEN.includes(o.soort) ? o.soort : "opdracht", notitie: String(o.notitie || "").slice(0, 400), klaar: !!o.klaar };
          const bestaand = opdrachten.findIndex((x) => x.id === schoon.id);
          if (bestaand >= 0) opdrachten[bestaand] = schoon; else { opdrachten.push(schoon); erbij++; }
          ids.push(schoon.id);
        });
        opslaan(ids);
        meld("Back-up teruggezet: " + erbij + " nieuwe opdrachten toegevoegd.");
      } catch (err) {
        meld("Dit bestand is geen geldige back-up van de Pabo 3 Kalender. Kies het .json-bestand dat je eerder hebt gedownload.");
      }
      e.target.value = "";
    };
    lezer.readAsText(bestand);
  });

  // ---------- account: online opslaan ----------
  let accountMelding = "";
  let accountFout = false;
  let formModus = "inloggen";      // "inloggen" of "registreren"
  let toonPinFormulier = false;    // bij vergrendeld account: toch met pincode inloggen
  let bezigMetVerzoek = false;
  let syncStatus = "";             // "", "bezig", "ok", "fout"
  let bioMogelijk = false;
  let uitlogStap = 0;
  let ingevuldeNaam = "";          // wat je in het naamveld typte, blijft staan na een foutmelding

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
    // Inlogbewijs is verlopen: opnieuw inloggen. De wachtrij blijft bewaard en wordt
    // na het inloggen alsnog verstuurd.
    const naam = sessie ? sessie.naam : "";
    const faceid = sessie ? sessie.faceid : null;
    sessie = null;
    weg(SESSIE);
    ontgrendeld = false;
    laadEigen();
    formModus = "inloggen";
    accountMelding = "Je inlog is verlopen. Log opnieuw in met je pincode.";
    accountFout = true;
    vorigeNaam = naam;
    vorigeFaceid = faceid;
    tekenAlles();
  }
  let vorigeNaam = "";
  let vorigeFaceid = null;

  let syncBezig = false;
  let syncNogEens = false;
  async function synchroniseer() {
    if (!actief()) return;
    if (syncBezig) { syncNogEens = true; return; }
    const naam = sessie.naam;
    const token = sessie.token;
    const w = wachtrij(naam);
    if (!w.bewaar.length && !w.verwijder.length) { syncStatus = "ok"; tekenAccount(); return; }

    syncBezig = true;
    syncStatus = "bezig";
    tekenAccount();
    bewaar(WACHT + naam, { bewaar: [], verwijder: [] });   // wat nu verandert, komt in een nieuwe ronde
    try {
      const lijst = opdrachten.filter((o) => w.bewaar.includes(o.id));
      for (let i = 0; i < lijst.length; i += 200) controleer(await CLOUD.bewaar(token, lijst.slice(i, i + 200)));
      for (const id of w.verwijder) controleer(await CLOUD.verwijder(token, id));
      syncStatus = "ok";
    } catch (fout) {
      // terugzetten in de wachtrij, zodat het later opnieuw geprobeerd wordt
      const nu = wachtrij(naam);
      w.bewaar.forEach((id) => { if (!nu.bewaar.includes(id) && !nu.verwijder.includes(id)) nu.bewaar.push(id); });
      w.verwijder.forEach((id) => { if (!nu.bewaar.includes(id) && !nu.verwijder.includes(id)) nu.verwijder.push(id); });
      bewaar(WACHT + naam, nu);
      syncStatus = "fout";
      syncBezig = false;
      if (fout.verlopen) return sessieVerlopen();
      tekenAccount();
      return;
    }
    syncBezig = false;
    if (syncNogEens) { syncNogEens = false; return synchroniseer(); }
    tekenAccount();
  }

  // Wijzigingen versturen en daarna de lijst van de server ophalen (bijv. van je andere apparaat).
  async function vernieuw() {
    if (!actief()) return;
    await synchroniseer();
    if (!actief() || !wachtrijLeeg(sessie.naam)) return;   // eerst onverstuurde wijzigingen kwijt
    try {
      const r = controleer(await CLOUD.lijst(sessie.token));
      if (!actief() || !wachtrijLeeg(sessie.naam)) return;
      opdrachten = Array.isArray(r.opdrachten) ? r.opdrachten : [];
      bewaar(CACHE + sessie.naam, opdrachten);
      syncStatus = "ok";
      tekenAlles();
    } catch (fout) {
      if (fout.verlopen) return sessieVerlopen();
      syncStatus = "fout";
      tekenAccount();
    }
  }

  async function naInloggen(r) {
    const faceid = (sessie && sessie.naam === r.naam && sessie.faceid) || (vorigeNaam === r.naam ? vorigeFaceid : null) || null;
    sessie = { naam: r.naam, token: r.token, faceid };
    bewaar(SESSIE, sessie);
    ontgrendeld = true;
    toonPinFormulier = false;
    vorigeNaam = ""; vorigeFaceid = null; ingevuldeNaam = "";

    // Serverlijst + eventuele onverstuurde wijzigingen van eerder op dit apparaat
    const cache = laad(CACHE + r.naam, []);
    const w = wachtrij(r.naam);
    let lijst = Array.isArray(r.opdrachten) ? r.opdrachten : [];
    lijst = lijst.filter((o) => !w.verwijder.includes(o.id));
    (Array.isArray(cache) ? cache : []).forEach((o) => {
      if (!w.bewaar.includes(o.id)) return;
      const i = lijst.findIndex((x) => x.id === o.id);
      if (i >= 0) lijst[i] = o; else lijst.push(o);
    });

    // Opdrachten die je zonder account op dit apparaat had, gaan mee naar je account
    const lokaal = laad(OPSLAG, []);
    let meegenomen = 0;
    if (Array.isArray(lokaal) && lokaal.length) {
      lokaal.forEach((o) => {
        if (!o || !o.id) return;
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
    accountFout = false;
    accountMelding = meegenomen
      ? meegenomen + " opdracht" + (meegenomen === 1 ? " van dit apparaat is" : "en van dit apparaat zijn") + " aan je account toegevoegd."
      : "";
    tekenAlles();
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
      accountMelding = "Ontgrendelen met " + BIO.naam + " is niet gelukt. Probeer het opnieuw of log in met je pincode.";
      accountFout = true;
      tekenAccount();
    }
  }

  async function bioAanzetten() {
    if (!actief()) return;
    try {
      const id = await BIO.aanzetten(sessie.naam);
      sessie.faceid = id;
      bewaar(SESSIE, sessie);
      accountMelding = hoofd(BIO.naam) + " staat aan. Als je de kalender op dit apparaat opent, ontgrendel je met " + BIO.naam + ".";
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
    sessie = null; ontgrendeld = false; uitlogStap = 0;
    syncStatus = ""; formModus = "inloggen";
    accountMelding = "Je bent uitgelogd. Je opdrachten staan veilig online.";
    accountFout = false;
    laadEigen();
    tekenAlles();
  }

  function tekenAccount(vulNaam) {
    const el = $("account");
    if (!el) return;
    if (!window.CLOUD || !CLOUD.aan) { el.hidden = true; return; }
    el.hidden = false;
    const melding = accountMelding ? '<p class="klein acc-melding' + (accountFout ? " te-laat" : "") + '" role="status">' + esc(accountMelding) + "</p>" : "";

    // 1. Ingelogd en ontgrendeld
    if (actief()) {
      const status = { bezig: "Bezig met opslaan…", ok: "Alles staat online.", fout: "Niet alles staat online. Wordt opnieuw geprobeerd zodra er verbinding is." }[syncStatus] || "";
      el.innerHTML = '<div class="dagkop"><h3>Mijn account</h3><span class="label">Online</span></div>' +
        '<p class="klein">Ingelogd als <strong>' + esc(sessie.naam) + "</strong>." + (status ? " " + esc(status) : "") + "</p>" +
        melding +
        '<div class="knoppen">' +
        (bioMogelijk ? (sessie.faceid
          ? '<button type="button" class="zacht" data-actie="bio-uit">' + esc(hoofd(BIO.naam)) + " uitzetten</button>"
          : '<button type="button" class="zacht" data-actie="bio-aan">' + esc(hoofd(BIO.naam)) + " aanzetten</button>") : "") +
        '<button type="button" class="zacht" data-actie="uitloggen">Uitloggen</button></div>';
      return;
    }

    // 2. Ingelogd maar vergrendeld (Face ID staat aan)
    if (sessie && !toonPinFormulier) {
      el.innerHTML = '<div class="dagkop"><h3>Mijn account</h3><span class="label">Vergrendeld</span></div>' +
        '<p class="klein">Ingelogd als <strong>' + esc(sessie.naam) + "</strong>. Ontgrendel om je opdrachten te zien.</p>" +
        melding +
        '<div class="knoppen"><button type="button" class="hoofd" data-actie="ontgrendel">Ontgrendel met ' + esc(BIO.naam) + "</button>" +
        '<button type="button" class="zacht" data-actie="toon-pin">Pincode gebruiken</button></div>';
      return;
    }

    // 3. Inloggen of account maken
    const reg = formModus === "registreren";
    const naamWaarde = vulNaam || ingevuldeNaam || (sessie ? sessie.naam : vorigeNaam) || "";
    el.innerHTML = '<div class="dagkop"><h3>' + (reg ? "Account maken" : "Inloggen") + '</h3><span class="label">Optioneel</span></div>' +
      '<p class="klein">' + (reg
        ? "Kies een gebruikersnaam en een pincode van 4 cijfers. Onthoud je pincode goed."
        : "Log in om je opdrachten op al je apparaten te zien. Zonder account blijven ze alleen in deze browser.") + "</p>" +
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

  $("account").addEventListener("submit", (e) => {
    e.preventDefault();
    verstuurFormulier(formModus);
  });
  $("account").addEventListener("input", (e) => {
    if (e.target.classList.contains("pin")) e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (e.target.id === "acc-naam") ingevuldeNaam = e.target.value;
  });
  $("account").addEventListener("click", (e) => {
    const k = e.target.closest("[data-actie]");
    if (!k) return;
    const actie = k.dataset.actie;
    if (actie !== "uitloggen") uitlogStap = 0;
    if (actie === "wissel") { formModus = formModus === "registreren" ? "inloggen" : "registreren"; accountMelding = ""; tekenAccount($("acc-naam") ? $("acc-naam").value : ""); }
    else if (actie === "ontgrendel") ontgrendel();
    else if (actie === "toon-pin") { toonPinFormulier = true; formModus = "inloggen"; accountMelding = ""; tekenAccount(); }
    else if (actie === "toon-bio") { toonPinFormulier = false; accountMelding = ""; tekenAccount(); }
    else if (actie === "bio-aan") bioAanzetten();
    else if (actie === "bio-uit") bioUitzetten();
    else if (actie === "uitloggen") uitloggen();
  });

  // Opnieuw ophalen als je terugkomt naar de pagina of weer online bent
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") vernieuw(); });
  window.addEventListener("online", () => vernieuw());

  // ---------- start ----------
  $("schooljaar").textContent = "studiejaar " + P.schooljaar;
  tekenAlles();
  if (window.BIO) BIO.beschikbaar().then((ja) => { bioMogelijk = ja; tekenAccount(); });
  vernieuw();
})();
