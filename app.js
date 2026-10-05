/*
  Pabo 3 Kalender
  - Vaste toetsen, periodes en vakanties komen uit toetsen.js.
  - Eigen opdrachten worden bewaard in localStorage (alleen in deze browser).
*/
(function () {
  "use strict";

  const P = window.PLANNING;
  const OPSLAG = "pabo3-kalender-opdrachten-v1";
  const VOORKEUR = "pabo3-kalender-voorkeur-v1";

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

  // ---------- toestand ----------
  let opdrachten = laad(OPSLAG, []);
  if (!Array.isArray(opdrachten)) opdrachten = [];
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
    if (!opslagWerkt) $("opslagtekst").innerHTML = '<strong class="te-laat">Let op:</strong> deze browser staat opslaan niet toe (bijvoorbeeld een privévenster). Je opdrachten verdwijnen als je de pagina sluit.';
  }

  // ---------- opslaan ----------
  function opslaan() {
    bewaar(OPSLAG, opdrachten);
    tekenAlles();
  }
  function nieuwId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---------- venster ----------
  const venster = $("venster");
  let verwijderStap = 0;

  function openVenster(id, datum) {
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
    if (bewerkId) {
      const o = opdrachten.find((x) => x.id === bewerkId);
      if (o) Object.assign(o, gegevens);
    } else {
      opdrachten.push(Object.assign({ id: nieuwId() }, gegevens));
    }
    gekozen = datum;
    const d = ontleed(datum);
    maand = { j: d.getFullYear(), m: d.getMonth() };
    sluitVenster();
    opslaan();
  });
  $("f-annuleer").addEventListener("click", sluitVenster);
  $("f-verwijder").addEventListener("click", () => {
    if (verwijderStap === 0) { verwijderStap = 1; $("f-verwijder").textContent = "Zeker weten? Klik nogmaals"; return; }
    opdrachten = opdrachten.filter((x) => x.id !== bewerkId);
    sluitVenster();
    opslaan();
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
    if (o) { o.klaar = !o.klaar; opslaan(); }
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
      try {
        const data = JSON.parse(lezer.result);
        const lijst = Array.isArray(data) ? data : data.opdrachten;
        if (!Array.isArray(lijst)) throw new Error("geen lijst");
        let erbij = 0;
        lijst.forEach((o) => {
          if (!o || typeof o.titel !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.datum || "")) return;
          const schoon = { id: String(o.id || nieuwId()), titel: o.titel.slice(0, 80), datum: o.datum, soort: SOORT_LABEL[o.soort] && ["opdracht", "deadline", "herkansing", "overig"].includes(o.soort) ? o.soort : "opdracht", notitie: String(o.notitie || "").slice(0, 400), klaar: !!o.klaar };
          const bestaand = opdrachten.findIndex((x) => x.id === schoon.id);
          if (bestaand >= 0) opdrachten[bestaand] = schoon; else { opdrachten.push(schoon); erbij++; }
        });
        opslaan();
        meld("Back-up teruggezet: " + erbij + " nieuwe opdrachten toegevoegd.");
      } catch (err) {
        meld("Dit bestand is geen geldige back-up van de Pabo 3 Kalender. Kies het .json-bestand dat je eerder hebt gedownload.");
      }
      e.target.value = "";
    };
    lezer.readAsText(bestand);
  });

  // ---------- start ----------
  $("schooljaar").textContent = "studiejaar " + P.schooljaar;
  tekenAlles();
})();
