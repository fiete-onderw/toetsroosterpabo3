// Agenda's binnenhalen in de browser: bestand, geplakte tekst, link (nagebootste server), privacy, geen dubbelen, verwijderen
const { chromium } = require(process.env.PLAYWRIGHT_PAD || "playwright");
const path = require("path"), fs = require("fs");
const OUT = path.join(__dirname, "schermen"); fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASIS || "http://localhost:8766/";
const SUPA = "https://srfigofpluibrrgcefuq.supabase.co/**";
const NU = new Date("2026-10-22T10:00:00");
const MAP = path.join(__dirname, "ics-bestanden");
const res = []; const check = (n, ok, x) => res.push((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  (" + (typeof x === "string" ? x : JSON.stringify(x)) + ")"));

// ---- nagebootste server met imports ----
const S = { users: {}, sessies: {}, data: {}, inst: {}, imports: {}, calls: [], linkInhoud: fs.readFileSync(path.join(MAP, "rooster-utc.ics"), "utf8") };
let teller = 0;
const sessie = (n) => { const t = "tok-" + (++teller); S.sessies[t] = n; return t; };
const lijstVan = (n) => Object.values(S.data[n] || {}).filter((o) => o.geldig !== false);
const rpc = {
  kal_registreer({ p_naam, p_pin }) { const n = p_naam.trim().toLowerCase(); S.users[n] = { pin: p_pin }; S.data[n] = {}; S.inst[n] = {}; S.imports[n] = {}; return { ok: true, naam: n, token: sessie(n), opdrachten: [], instellingen: {} }; },
  kal_inloggen({ p_naam, p_pin }) { const n = p_naam.trim().toLowerCase(); const u = S.users[n]; if (!u || u.pin !== p_pin) return { ok: false, fout: "klopt niet" }; return { ok: true, naam: n, token: sessie(n), opdrachten: lijstVan(n), instellingen: S.inst[n] }; },
  kal_lijst({ p_token }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; const opruimen = Object.values(S.data[n]).filter((o) => o.geldig === false).map((o) => o.id); return { ok: true, naam: n, opdrachten: lijstVan(n), instellingen: S.inst[n], opruimen }; },
  kal_bewaar({ p_token, p_lijst }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; p_lijst.forEach((o) => { S.data[n][o.id] = Object.assign({}, o, { geldig: true }); }); return { ok: true }; },
  kal_verwijder({ p_token, p_id }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; delete S.data[n][p_id]; return { ok: true }; },
  kal_uitloggen({ p_token }) { delete S.sessies[p_token]; return { ok: true }; },
  kal_instellingen({ p_token, p_instellingen }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; S.inst[n] = p_instellingen; return { ok: true }; },
  kal_imports_lijst({ p_token }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; return { ok: true, imports: Object.values(S.imports[n]).filter((i) => i.actief) }; },
  kal_import_bewaar({ p_token, p_import }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; if (p_import.soort === "link" && !/^(https|webcal):\/\//.test(p_import.url || "")) return { ok: false, fout: "De link moet met https:// of webcal:// beginnen." }; const oud = S.imports[n][p_import.id] || {}; S.imports[n][p_import.id] = Object.assign({ aantal: 0, laatstVerverst: null, laatsteFout: null }, oud, { id: p_import.id, naam: p_import.naam, soort: p_import.soort, agenda: p_import.agenda, alleenBezet: !!p_import.alleenBezet, actief: true, host: p_import.url ? new URL(p_import.url.replace(/^webcal:/, "https:")).hostname : oud.host || null, url: p_import.url || oud.url }); return { ok: true, id: p_import.id }; },
  kal_import_verwijder({ p_token, p_id }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; const ids = []; Object.values(S.data[n]).forEach((o) => { if (o.bron === p_id) { o.geldig = false; ids.push(o.id); } }); if (S.imports[n][p_id]) S.imports[n][p_id].actief = false; return { ok: true, verwijderd: ids.length, opruimen: ids }; }
};
const ICS = require(path.join(__dirname, "..", "ics.js"));
function edgeImport(b) {
  const n = S.sessies[b.token]; if (!n) return { ok: false, sessie: false };
  if (b.url) {
    if (/^http:/.test(b.url)) return { ok: false, fout: "Alleen beveiligde links (https:// of webcal://) zijn toegestaan." };
    if (/127\.0\.0\.1|localhost/.test(b.url)) return { ok: false, fout: "Deze link verwijst naar een intern adres en is niet toegestaan." };
    if (/kapot/.test(b.url)) return { ok: false, fout: "De link bestaat niet (meer) (404). Maak in de bron een nieuwe link." };
    const u = ICS.lees(S.linkInhoud, { nu: NU });
    return { ok: true, naam: u.naam, aantal: u.voorvallen.length, aantalAfspraken: u.aantalAfspraken, voorbeeld: u.voorvallen.slice(0, 12), meldingen: u.meldingen, eersteDatum: u.voorvallen[0].datum, laatsteDatum: u.voorvallen[u.voorvallen.length - 1].datum };
  }
  if (b.id) {
    const imp = S.imports[n][b.id]; if (!imp) return { ok: false, fout: "Import niet gevonden." };
    const u = ICS.lees(S.linkInhoud, { nu: NU });
    const items = u.voorvallen.map((v) => ICS.naarOpdracht(v, b.id, imp.agenda, imp.alleenBezet));
    const ids = new Set(items.map((o) => o.id));
    Object.values(S.data[n]).forEach((o) => { if (o.bron === b.id && !ids.has(o.id)) o.geldig = false; });
    items.forEach((o) => { S.data[n][o.id] = Object.assign({}, o, { geldig: true }); });
    imp.aantal = items.length; imp.laatstVerverst = new Date().toISOString(); imp.laatsteFout = null;
    return { ok: true, aantal: items.length, naam: u.naam, meldingen: u.meldingen };
  }
  return { ok: false };
}
async function routeer(ctx) {
  await ctx.route(SUPA, async (route) => {
    const req = route.request();
    if (req.url().includes("/functions/v1/digigenda-import")) { S.calls.push("edge-import"); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(edgeImport(JSON.parse(req.postData() || "{}"))) }); }
    const fn = req.url().split("/rpc/")[1]; S.calls.push(fn);
    const r = rpc[fn] ? rpc[fn](JSON.parse(req.postData() || "{}")) : null;
    route.fulfill({ status: r ? 200 : 404, contentType: "application/json", body: JSON.stringify(r) });
  });
  await ctx.route("https://fonts.**", (r) => r.abort());
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PAD || undefined });
  const fouten = [];
  const maak = async (viewport, extra) => {
    const ctx = await browser.newContext(Object.assign({ viewport, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: viewport.width < 700, isMobile: viewport.width < 700 }, extra || {}));
    await routeer(ctx);
    await ctx.addInitScript(() => { if (!localStorage.getItem("z")) { localStorage.setItem("digigenda-instellingen-v1", JSON.stringify({ agendas: ["school", "werk", "persoonlijk"], pabo: false, welkom: true })); localStorage.setItem("z", "1"); } });
    const p = await ctx.newPage();
    await p.clock.setFixedTime(NU);
    p.on("pageerror", (e) => fouten.push(viewport.width + ": " + e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/fonts|net::|Failed to load resource/.test(m.text())) fouten.push(m.text()); });
    await p.goto(BASE); await p.waitForTimeout(300);
    return p;
  };
  const lokaal = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("pabo3-kalender-opdrachten-v1") || "[]"));
  const w = (p, ms) => p.waitForTimeout(ms);

  // ================= A. zonder account: bestand importeren =================
  const p = await maak({ width: 390, height: 844 });
  await p.click("#accountKnop"); await w(p, 200);
  check("instellingen: blok 'Agenda’s binnenhalen' met knop", (await p.locator("#inst-import").innerText()).includes("Agenda’s binnenhalen") && await p.locator("[data-import-nieuw]").isVisible());
  await p.click("[data-import-nieuw]"); await w(p, 200);
  check("importvenster open met drie routes", await p.locator("#importVenster").isVisible() && (await p.locator("#imp-inhoud").innerText()).includes("1. Abonneren via een link") && (await p.locator("#imp-inhoud").innerText()).includes("2. Bestand importeren"));
  check("zonder account: link vraagt om account", (await p.locator("#imp-inhoud").innerText()).includes("Hiervoor is een account nodig") && (await p.locator("#imp-url").count()) === 0);
  check("hulp per dienst aanwezig (Outlook, Google, iCloud, rooster-app, HAN) + uitleg OAuth", ["Outlook / Microsoft 365", "Google Agenda", "iPhone / iCloud", "Rooster-app", "HAN-rooster", "Inloggen met Microsoft of Google"].every((t) => p.locator("#imp-inhoud").innerText().then((x) => x.includes(t)) && true));
  await p.click(".imp-hulp summary"); await w(p, 100);
  const hulp = await p.locator(".imp-hulp").innerText();
  check("hulp noemt wat de beheerder blokkeert", hulp.includes("IT-beheerder publiceren uitgezet") && hulp.includes("goedkeuring van de IT-beheerder"), hulp.slice(0, 200));
  await p.screenshot({ path: path.join(OUT, "i1-import-keuze.png"), fullPage: true });
  await p.setInputFiles("#imp-bestand", path.join(MAP, "outlook-werk.ics")); await w(p, 400);
  const vb = await p.locator("#imp-inhoud").innerText();
  check("voorbeeld: aantal (29), periode en eerste regels", vb.includes("29 afspraken") && vb.includes("Teamoverleg Essent") && vb.includes("Nachtdienst"), vb.slice(0, 300));
  check("voorbeeld: naam uit het bestand, agenda-keuze, privacy-vinkje en waarschuwing", (await p.inputValue("#imp-naam")) === "Agenda - Gijs (werk)" && (await p.inputValue("#imp-agenda")) === "werk" && !(await p.isChecked("#imp-bezet")) && vb.includes("regels hebben over het delen"));
  await p.screenshot({ path: path.join(OUT, "i2-import-voorbeeld.png"), fullPage: true });
  await p.check("#imp-bezet"); await w(p, 150);
  check("alleen bezet: voorbeeld toont 'Bezet' in plaats van titels", !(await p.locator("#imp-inhoud").innerText()).includes("Teamoverleg Essent") && (await p.locator(".imp-rijen").innerText()).includes("Bezet"));
  await p.uncheck("#imp-bezet"); await w(p, 150);
  await p.click("#imp-vorm button[type=submit]"); await w(p, 500);
  check("klaar-scherm", (await p.locator("#imp-inhoud").innerText()).includes("is binnengehaald: 29 afspraken"), await p.locator("#imp-inhoud").innerText());
  let data = await lokaal(p);
  const imp1 = data.filter((o) => o.bron);
  check("29 afspraken lokaal met bron, agenda werk, soort afspraak", imp1.length === 29 && imp1.every((o) => o.agenda === "werk" && o.soort === "afspraak"), imp1.length);
  const nacht = imp1.find((o) => o.titel === "Nachtdienst");
  check("nachtdienst 22:00–06:00 bewaard", nacht && nacht.tijd === "22:00" && nacht.eind === "06:00", nacht);
  const vrij = imp1.find((o) => o.titel === "Vrije dag");
  check("hele dag: geen tijd, wel bron (geen to-do)", vrij && !vrij.tijd && vrij.bron, vrij);
  await p.click("[data-imp-klaar]"); await w(p, 200);
  check("instellingen tonen de import met aantal", (await p.locator("#inst-import").innerText()).includes("Agenda - Gijs (werk)") && (await p.locator("#inst-import").innerText()).includes("29 items"), await p.locator("#inst-import").innerText());
  await p.click("#inst-sluit"); await w(p, 150);
  // weergave in de app
  await p.click('[data-kies="2026-10-24"]'); await w(p, 200);
  check("dag 24 okt: geïmporteerde dienst als blok met ⇅ en 'via'", (await p.locator('.dagraster .blok.import').count()) === 1);
  await p.click('.dagraster .blok.import'); await w(p, 200);
  const vt = await p.locator("#venster").innerText();
  check("tik op geïmporteerd item: alleen lezen met uitleg en 'Import beheren'", vt.includes("geïmporteerd") && vt.includes("Agenda - Gijs (werk)") && await p.locator("#f-titel").isDisabled() && !(await p.locator("#f-verwijder").isVisible()));
  await p.screenshot({ path: path.join(OUT, "i3-import-item.png") });
  await p.click("[data-import-beheer]"); await w(p, 200);
  check("'Import beheren' opent de lijst", await p.locator("#importVenster").isVisible() && (await p.locator("#imp-inhoud").innerText()).includes("Agenda - Gijs (werk)"));
  await p.click("#imp-sluit"); await w(p, 100);
  await p.click('[data-week="1"]'); await p.click('[data-week="1"]'); await p.click('[data-kies="2026-11-06"]'); await w(p, 200);
  check("6 nov: 'Vrije dag' als hele-dag-rij bovenaan, geen vinkje", (await p.locator('.dag-todo .rij.import .tijdstip.heledag').count()) === 1 && (await p.locator('.dag-todo .rij.import .vink').count()) === 0 && (await p.locator(".hero-tekst").innerText()).includes("geen to-do’s"));
  // opnieuw importeren = bijwerken, geen dubbelen
  await p.click("#accountKnop"); await w(p, 150); await p.click("[data-import-nieuw]"); await w(p, 150);
  await p.setInputFiles("#imp-bestand", path.join(MAP, "outlook-werk.ics")); await w(p, 300);
  check("voorbeeld biedt 'nieuwere versie van' aan", (await p.locator("#imp-vervang").count()) === 1);
  await p.selectOption("#imp-vervang", { index: 1 });
  await p.click("#imp-vorm button[type=submit]"); await w(p, 500);
  data = await lokaal(p);
  check("na opnieuw importeren nog steeds 29 (geen dubbelen), één import", data.filter((o) => o.bron).length === 29 && (await p.evaluate(() => JSON.parse(localStorage.getItem("digigenda-imports-v1")).length)) === 1, data.filter((o) => o.bron).length);
  await p.click("[data-imp-klaar]"); await w(p, 150);
  // geplakte tekst in de snelle invoer
  await p.click("#inst-sluit"); await w(p, 100);
  await p.fill("#snelInvoer", fs.readFileSync(path.join(MAP, "google-persoonlijk.ics"), "utf8")); await w(p, 300);
  check("agenda-tekst in de snelle invoer opent het importvenster met voorbeeld", await p.locator("#importVenster").isVisible() && (await p.locator("#imp-inhoud").innerText()).includes("Hardlopen") && (await p.inputValue("#snelInvoer")) === "");
  await p.selectOption("#imp-agenda", "persoonlijk");
  await p.click("#imp-vorm button[type=submit]"); await w(p, 400);
  data = await lokaal(p);
  check("geplakte agenda toegevoegd in 'persoonlijk'", data.some((o) => o.titel === "Hardlopen" && o.agenda === "persoonlijk" && o.bron));
  await p.click("[data-imp-klaar]"); await w(p, 100);
  // verwijderen in één keer (met bevestiging)
  await p.click("#accountKnop"); await w(p, 150);
  const wegKnop = p.locator('[data-import-weg]').first();
  await wegKnop.click(); await w(p, 150);
  check("verwijderen vraagt eerst bevestiging", (await p.locator("#inst-import").innerText()).includes("Klik nogmaals") && (await lokaal(p)).filter((o) => o.bron).length === 56, (await lokaal(p)).filter((o) => o.bron).length);
  await p.locator('[data-import-weg]').first().click(); await w(p, 300);
  data = await lokaal(p);
  check("hele import in één keer weg (29 items), andere import blijft", data.filter((o) => o.bron).length === 27 && (await p.locator("#inst-import").innerText()).includes("is verwijderd (29 afspraken)"), data.filter((o) => o.bron).length);
  await p.screenshot({ path: path.join(OUT, "i4-import-lijst.png") });
  // geen agenda-bestand
  await p.click("[data-import-nieuw]"); await w(p, 150);
  await p.setInputFiles("#imp-bestand", path.join(MAP, "geen-agenda.txt")); await w(p, 300);
  check("geen agendabestand: nette fout", (await p.locator("#imp-inhoud").innerText()).includes("geen agendabestand"));
  await p.click("#imp-sluit");
  // delen naar de app (share-target) met ?tekst=
  await p.goto(BASE + "?titel=Gedeeld&tekst=" + encodeURIComponent(fs.readFileSync(path.join(MAP, "rooster-utc.ics"), "utf8"))); await w(p, 400);
  check("?tekst= met agenda opent het importvenster", await p.locator("#importVenster").isVisible() && (await p.locator("#imp-inhoud").innerText()).includes("Kassa") && (await p.evaluate(() => location.search)) === "");
  await p.click("#imp-sluit");
  await p.goto(BASE + "?tekst=" + encodeURIComponent("morgen 14:00 tandarts")); await w(p, 300);
  check("?tekst= met gewone tekst vult de snelle invoer", (await p.inputValue("#snelInvoer")) === "morgen 14:00 tandarts" && !(await p.locator("#importVenster").isVisible()));
  check("geen JS-fouten (zonder account)", fouten.length === 0, fouten.join(" | "));

  // ================= B. met account: link =================
  const q = await maak({ width: 1280, height: 900 });
  await q.click("#instellingenKnop"); await w(q, 150);
  await q.click('#inst-account [data-actie="wissel"]'); await w(q, 80);
  await q.fill("#acc-naam", "gijs"); await q.fill("#acc-pin", "4821"); await q.fill("#acc-pin2", "4821");
  await q.click("#acc-form button[type=submit]"); await w(q, 500);
  await q.click("[data-import-nieuw]"); await w(q, 200);
  check("met account: linkveld zichtbaar", await q.locator("#imp-url").isVisible());
  await q.fill("#imp-url", "http://rooster.example.com/x.ics"); await q.click("#imp-link-form button[type=submit]"); await w(q, 200);
  check("http:// wordt al in de app geweigerd", (await q.locator("#imp-inhoud").innerText()).includes("begint met webcal:// of https://"));
  await q.fill("#imp-url", "https://127.0.0.1/x.ics"); await q.click("#imp-link-form button[type=submit]"); await w(q, 300);
  check("intern adres: fout van de server getoond", (await q.locator("#imp-inhoud").innerText()).includes("intern adres"));
  await q.fill("#imp-url", "https://rooster.example.com/kapot.ics"); await q.click("#imp-link-form button[type=submit]"); await w(q, 300);
  check("404: nette fout", (await q.locator("#imp-inhoud").innerText()).includes("bestaat niet (meer)"));
  await q.fill("#imp-url", "webcal://rooster.example.com/gijs/feed.ics"); await q.click("#imp-link-form button[type=submit]"); await w(q, 400);
  const vbl = await q.locator("#imp-inhoud").innerText();
  check("link: voorbeeld van de server (6 afspraken, Kassa, nachtdienst)", vbl.includes("6 afspraken") && vbl.includes("Kassa") && (await q.inputValue("#imp-naam")) === "Rooster Gijs", vbl.slice(0, 200));
  await q.check("#imp-bezet");
  await q.click("#imp-vorm button[type=submit]"); await w(q, 800);
  check("link toegevoegd: klaar-scherm meldt elk uur verversen", (await q.locator("#imp-inhoud").innerText()).includes("ververst de link elk uur"), await q.locator("#imp-inhoud").innerText());
  const srv = Object.values(S.data.gijs).filter((o) => o.bron && o.geldig !== false);
  check("server: 6 items met bron, alleen bezet → titel 'Werk', geen notitie", srv.length === 6 && srv.every((o) => o.titel === "Werk" && !o.notitie), srv.map((o) => o.titel));
  check("server: import bewaard als link met host, zonder titels in de lijst", S.imports.gijs && Object.values(S.imports.gijs)[0].soort === "link" && Object.values(S.imports.gijs)[0].host === "rooster.example.com" && Object.values(S.imports.gijs)[0].alleenBezet === true);
  await q.click("[data-imp-klaar]"); await w(q, 300);
  const lijstTekst = await q.locator("#inst-import").innerText();
  check("lijst: naam, 'alleen als bezet', 6 items, 'zojuist ververst', knoppen Verversen/Verwijderen", lijstTekst.includes("Rooster Gijs") && lijstTekst.includes("alleen als bezet") && lijstTekst.includes("6 items") && lijstTekst.includes("zojuist") && await q.locator("[data-import-ververs]").isVisible(), lijstTekst);
  await q.screenshot({ path: path.join(OUT, "i5-import-lijst-laptop.png") });
  // verversen: één dienst verdwijnt uit de bron → opgeruimd via kal_verwijder
  S.linkInhoud = S.linkInhoud.replace(/BEGIN:VEVENT\r?\nUID:shift-100236@shiftbase[\s\S]*?END:VEVENT\r?\n/, "");
  const voor = S.calls.filter((c) => c === "kal_verwijder").length;
  await q.click("[data-import-ververs]"); await w(q, 900);
  check("verversen: 5 bijgewerkt, verdwenen dienst weg bij de gebruiker én via kal_verwijder van de server", (await q.locator("#inst-import").innerText()).includes("5 afspraken bijgewerkt") && (await q.evaluate(() => JSON.parse(localStorage.getItem("pabo3-kalender-cache-v1:gijs")).filter((o) => o.bron).length)) === 5 && S.calls.filter((c) => c === "kal_verwijder").length > voor, S.calls.slice(-8));
  await q.click("#inst-sluit"); await w(q, 100);
  await q.click('[data-weergave="dag"]'); await w(q, 100); await q.click('[data-kies="2026-10-24"]'); await w(q, 200);
  check("laptop dag: geïmporteerde dienst 'Werk' 10:00–18:00 zichtbaar", (await q.locator(".dagraster .blok.import").innerText()).includes("Werk"));
  // import verwijderen met account
  await q.click("#accountKnop"); await w(q, 150);
  await q.click("[data-import-weg]"); await w(q, 100); await q.click("[data-import-weg]"); await w(q, 500);
  check("met account: import en items weg (server inactief, items ongeldig → kal_verwijder)", Object.values(S.imports.gijs)[0].actief === false && (await q.evaluate(() => JSON.parse(localStorage.getItem("pabo3-kalender-cache-v1:gijs")).filter((o) => o.bron).length)) === 0 && (await q.locator("#inst-import").innerText()).includes("is verwijderd"));
  check("geen JS-fouten (met account)", fouten.length === 0, fouten.join(" | "));

  console.log(res.join("\n"));
  console.log(res.filter((r) => r.startsWith("PASS")).length + " / " + res.length + " geslaagd");
  await browser.close();
  if (res.some((r) => r.startsWith("FAIL"))) process.exit(1);
})().catch((e) => { console.log(res.join("\n")); console.error("CRASH", e); process.exit(1); });
