const { chromium } = require(process.env.PLAYWRIGHT_PAD || "playwright");
const path = require("path");
const OUT = require("path").join(__dirname, "schermen");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = (process.env.BASIS || "http://localhost:8766/");
const SUPA = "https://srfigofpluibrrgcefuq.supabase.co/**";
const NU = new Date("2026-10-22T10:00:00");

// ---------- nagebootste server ----------
const S = { users: {}, sessies: {}, data: {}, inst: {}, codes: {}, klaar: {}, push: {}, offline: false, calls: [] };
let teller = 0;
const lijstVan = (n) => Object.values(S.data[n] || {}).sort((a, b) => a.datum.localeCompare(b.datum));
const sessie = (n) => { const t = "tok-" + (++teller); S.sessies[t] = n; return t; };
const rpc = {
  kal_registreer({ p_naam, p_pin }) { const n = p_naam.trim().toLowerCase(); if (S.users[n]) return { ok: false, fout: "Deze gebruikersnaam is al bezet." }; S.users[n] = { pin: p_pin }; S.data[n] = {}; S.inst[n] = {}; return { ok: true, naam: n, token: sessie(n), opdrachten: [], instellingen: {} }; },
  kal_inloggen({ p_naam, p_pin }) { const n = p_naam.trim().toLowerCase(); const u = S.users[n]; if (!u || u.pin !== p_pin) return { ok: false, fout: "Gebruikersnaam of pincode klopt niet." }; return { ok: true, naam: n, token: sessie(n), opdrachten: lijstVan(n), instellingen: S.inst[n] }; },
  kal_lijst({ p_token }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; return { ok: true, naam: n, opdrachten: lijstVan(n), instellingen: S.inst[n] }; },
  kal_bewaar({ p_token, p_lijst }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; p_lijst.forEach((o) => { S.data[n][o.id] = { id: o.id, titel: o.titel, datum: o.datum, tijd: o.tijd || null, eind: o.eind || null, soort: o.soort, agenda: o.agenda, notitie: o.notitie || "", klaar: !!o.klaar }; }); return { ok: true }; },
  kal_verwijder({ p_token, p_id }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; delete S.data[n][p_id]; return { ok: true }; },
  kal_uitloggen({ p_token }) { delete S.sessies[p_token]; return { ok: true }; },
  kal_instellingen({ p_token, p_instellingen }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; S.inst[n] = p_instellingen; return { ok: true }; },
  kal_pin_wijzigen({ p_token, p_oud, p_nieuw }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; if (S.users[n].pin !== p_oud) return { ok: false, fout: "Je huidige pincode klopt niet." }; S.users[n].pin = p_nieuw; for (const t in S.sessies) if (S.sessies[t] === n && t !== p_token) delete S.sessies[t]; return { ok: true }; },
  kal_uitloggen_overal({ p_token }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; for (const t in S.sessies) if (S.sessies[t] === n) delete S.sessies[t]; return { ok: true }; },
  kal_push_aanmelden({ p_token, p_abonnement }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; S.push[p_abonnement.endpoint] = { naam: n, actief: true, token: p_token, keys: p_abonnement.keys }; return { ok: true }; },
  kal_push_afmelden({ p_token, p_endpoint }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; if (S.push[p_endpoint]) S.push[p_endpoint].actief = false; return { ok: true }; },
  kal_agenda_link({ p_token, p_nieuw }) { const n = S.sessies[p_token]; if (!n) return { ok: false, sessie: false }; if (!S.codes[n] || p_nieuw) S.codes[n] = ("c" + (++teller)).padEnd(36, "a"); return { ok: true, code: S.codes[n] }; }
};
async function routeer(ctx) {
  await ctx.route(SUPA, async (route) => {
    if (S.offline) return route.abort("internetdisconnected");
    const req = route.request();
    if (req.url().includes("/functions/v1/digigenda-meldingen")) {
      const b = JSON.parse(req.postData() || "{}");
      S.calls.push("testmelding");
      const ok = b.test && S.sessies[b.token];
      const doel = ok && Object.values(S.push).some((x) => x.actief && x.token === b.token);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(!ok ? { ok: false, sessie: false } : doel ? { ok: true, gelukt: 1, mislukt: 0 } : { ok: false, fout: "Op dit account staan nog geen meldingen aan." }) });
    }
    const fn = req.url().split("/rpc/")[1];
    S.calls.push(fn);
    const r = rpc[fn] ? rpc[fn](JSON.parse(req.postData() || "{}")) : null;
    route.fulfill({ status: r ? 200 : 404, contentType: "application/json", body: JSON.stringify(r) });
  });
  await ctx.route("https://fonts.**", (r) => r.abort());
}

const res = [];
const check = (naam, ok, extra) => res.push((ok ? "PASS " : "FAIL ") + naam + (extra && !ok ? "  (" + extra + ")" : ""));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PAD || undefined });

  // ================= A. laptop =================
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await routeer(ctx);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NU);
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && (/Content Security Policy/.test(m.text()) || !/fonts|net::|Failed to load resource/.test(m.text()))) fouten.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  const w = (ms) => page.waitForTimeout(ms);
  const txt = (sel) => page.locator(sel).innerText();

  // 1. startscherm
  await page.goto(BASE); await w(300);
  check("startscherm zichtbaar bij eerste bezoek", await page.locator("#welkom").isVisible());
  await page.screenshot({ path: path.join(OUT, "a1-welkom.png") });
  await page.check('#welkom input[value="werk"]');
  check("Pabo-vinkje zichtbaar bij School", await page.locator("#wk-pabo").isVisible());
  await page.click("#welkom-verder"); await w(150);
  check("stap 2: accountkeuze", await page.locator("#welkom-stap2").isVisible() && await page.locator("#welkom-account #acc-naam").isVisible());
  await page.click("#welkom-zonder"); await w(200);
  check("startscherm dicht na 'zonder account'", !(await page.locator("#welkom").isVisible()));
  check("maand is standaard", (await page.getAttribute('[data-weergave="maand"]', "aria-selected")) === "true");
  check("filters School + Werk", (await page.locator("[data-filter]").count()) === 2);
  check("Pabo: LKT Taal in november zichtbaar na navigeren", true);
  check("geen 'Verlopen' meer", !(await page.locator("body").innerText()).includes("Verlopen"));

  // 2. snelle invoer
  await page.fill("#snelInvoer", "Lezen RT 6.2.2 vrijdag 14:00");
  await w(100);
  const vb = await txt("#snelVoorbeeld");
  check("voorbeeld toont titel, dag en tijd", vb.includes("Lezen RT 6.2.2") && vb.includes("vr 23 okt") && vb.includes("14:00"), vb);
  await page.press("#snelInvoer", "Enter"); await w(200);
  check("toast na toevoegen", (await txt("#toast")).includes("vr 23 okt om 14:00"), await txt("#toast"));
  check("opdracht in maandvak 23 okt", (await page.locator('.dag[data-datum="2026-10-23"] .chip.eigen').innerText()).includes("Lezen RT 6.2.2"));
  check("maandvak toont begintijd bij een blok", (await page.locator('.dag[data-datum="2026-10-23"] .chip.eigen').innerText()).includes("14:00"));
  check("invoerveld leeg na toevoegen", (await page.inputValue("#snelInvoer")) === "");
  await page.click("#toastOngedaan"); await w(150);
  check("ongedaan maken werkt", (await page.locator('.dag[data-datum="2026-10-23"] .chip.eigen').count()) === 0);

  // 3. meerdere regels plakken
  await page.fill("#snelInvoer", "1. Lezen RT 6.2.2 vrijdag 14:00\n2. Casus 2 opnieuw za\n3. werk dienst Essent #werk zo 10u");
  await w(100);
  check("voorbeeld meerdere regels", (await txt("#snelVoorbeeld")).includes("3 items"), await txt("#snelVoorbeeld"));
  await page.press("#snelInvoer", "Enter"); await w(250);
  const lokaal = await page.evaluate(() => JSON.parse(localStorage.getItem("pabo3-kalender-opdrachten-v1")));
  check("3 opdrachten opgeslagen", lokaal.length === 3, JSON.stringify(lokaal));
  const dienst = lokaal.find((o) => o.titel.includes("dienst"));
  check("#werk + zo 10u herkend", dienst && dienst.agenda === "werk" && dienst.datum === "2026-10-25" && dienst.tijd === "10:00", JSON.stringify(dienst));

  // 3b. eindtijd via snelle invoer
  await page.fill("#snelInvoer", "overleg stage morgen 14:00-15:30"); await w(100);
  check("voorbeeld toont 14:00–15:30", (await txt("#snelVoorbeeld")).includes("14:00–15:30"), await txt("#snelVoorbeeld"));
  await page.press("#snelInvoer", "Enter"); await w(200);
  check("toast toont tijdvak", (await txt("#toast")).includes("14:00–15:30"), await txt("#toast"));
  await page.click("#toastOngedaan"); await w(150);
  await page.fill("#snelInvoer", "verslag inleveren vrijdag tot 17:00"); await w(100);
  check("voorbeeld: 'to-do tot 17:00'", (await txt("#snelVoorbeeld")).includes("to-do tot 17:00"), await txt("#snelVoorbeeld"));
  await page.fill("#snelInvoer", ""); await w(50);

  // 4. filter
  await page.click('[data-filter="werk"]'); await w(100);
  check("werk-filter verbergt werkopdracht", (await page.locator('.dag[data-datum="2026-10-25"] .chip.eigen').count()) === 0);
  await page.click('[data-filter="werk"]'); await w(100);
  check("werk-filter weer aan", (await page.locator('.dag[data-datum="2026-10-25"] .chip.eigen').count()) === 1);
  await page.screenshot({ path: path.join(OUT, "a2-maand.png") });

  // 5. week
  await page.click('[data-weergave="week"]'); await w(150);
  check("week (laptop): 7 kolommen met tijdblokken", (await page.locator(".weekblok .kolom").count()) === 7 && (await page.locator(".wk-dag").count()) === 7);
  check("week: blok staat in de vrijdagkolom", (await page.locator('.kolom[data-tijdlijn-datum="2026-10-23"] .blok').count()) === 1);
  check("week: to-do (za) in de to-do-rij", (await page.locator(".hd-cel .hd-chip").filter({ hasText: "Casus 2" }).count()) === 1);
  check("week: rode nu-lijn alleen in vandaag-kolom", (await page.locator('.kolom[data-tijdlijn-datum="2026-10-22"] .nu-lijn').count()) === 1 && (await page.locator(".weekblok .nu-lijn").count()) === 1);
  const weekTekst = await txt("#hoofd");
  check("week: titels en tijd zichtbaar", weekTekst.includes("Lezen RT 6.2.2") && weekTekst.includes("14:00") && weekTekst.includes("10:00"), weekTekst.slice(0, 300));
  check("week: zijpaneel verborgen", !(await page.locator("#zij").isVisible()));
  await page.screenshot({ path: path.join(OUT, "a3-week.png") });
  await page.click('[data-naar-dag="2026-10-23"]'); await w(150);

  // 6. dag
  check("dag: geopend via weekkop", (await page.getAttribute('[data-weergave="dag"]', "aria-selected")) === "true" && (await page.locator(".hero-titel").innerText()).includes("Vrijdag 23 oktober"));
  await page.screenshot({ path: path.join(OUT, "a4-dag.png") });
  const lezenId = lokaal.find((o) => o.titel.startsWith("Lezen")).id;
  check("dag: afspraak is een blok in de agenda", (await page.locator('.dagraster .blok[data-bewerk="' + lezenId + '"]').count()) === 1);
  check("dag: blok heeft geen vinkje", (await page.locator('[data-klaar="' + lezenId + '"]').count()) === 0);
  check("dag: geen Nu-kaart op een andere dag", (await page.locator("#nuKaart").count()) === 0);
  await page.click('[data-kies="2026-10-24"]'); await w(100);
  check("dag: weekstrook kiest zaterdag", (await page.locator(".hero-titel").innerText()).includes("Zaterdag 24 oktober"));
  check("dag: knop terug naar vandaag", await page.locator('.hero [data-nav="0"]').isVisible());
  await page.click('[data-week="1"]'); await w(100);
  check("dag: pijltje = week verder", (await page.locator(".hero-titel").innerText()).includes("Zaterdag 31 oktober"));
  await page.click('[data-week="-1"]'); await w(100);
  const casusId = lokaal.find((o) => o.titel.startsWith("Casus")).id;
  check("dag: to-do staat in de to-do-lijst", (await page.locator('.dag-todo [data-klaar="' + casusId + '"]').count()) === 1);
  await page.click('[data-klaar="' + casusId + '"]'); await w(100);
  check("dag: to-do afvinken", (await page.evaluate((id) => JSON.parse(localStorage.getItem("pabo3-kalender-opdrachten-v1")).find((o) => o.id === id).klaar, casusId)) === true);
  await page.click('[data-klaar="' + casusId + '"]'); await w(100);
  await page.click('[data-schuif="' + casusId + '"]'); await w(100);
  check("dag: → dag later verplaatst", (await page.evaluate((id) => JSON.parse(localStorage.getItem("pabo3-kalender-opdrachten-v1")).find((o) => o.id === id).datum, casusId)) === "2026-10-25");

  // 7. bewerkvenster met tijd + agenda, opdracht in het verleden
  await page.click('[data-weergave="maand"]'); await w(100);
  await page.click('.dag[data-datum="2026-10-20"]'); await w(100);
  await page.click('#dagpaneel [data-nieuw]'); await w(100);
  await page.fill("#f-titel", "Portfolio afmaken");
  await page.fill("#f-tijd", "15:00");
  check("venster: 'Afgerond' verdwijnt bij een begintijd", !(await page.locator("#f-klaar-rij").isVisible()));
  await page.fill("#f-eind", "14:00"); await page.dispatchEvent("#f-eind", "input");
  check("venster: eindtijd vóór begintijd = volgende ochtend (nachtdienst)", (await txt("#f-uitleg")).includes("volgende ochtend om 14:00"), await txt("#f-uitleg"));
  await page.fill("#f-eind", "15:00"); await page.dispatchEvent("#f-eind", "input");
  await page.click("#formulier button[type=submit]"); await w(100);
  check("venster: eindtijd gelijk aan begintijd geweigerd", (await txt("#f-fout")).includes("gelijk aan de begintijd"), await txt("#f-fout"));
  await page.fill("#f-tijd", "");
  await page.dispatchEvent("#f-tijd", "input");
  await page.fill("#f-eind", "17:00");
  await page.selectOption("#f-agenda", "school");
  await page.selectOption("#f-soort", "deadline");
  await page.click("#formulier button[type=submit]"); await w(150);
  const pf = await page.evaluate(() => JSON.parse(localStorage.getItem("pabo3-kalender-opdrachten-v1")).find((o) => o.titel === "Portfolio afmaken"));
  check("venster: to-do met 'tot 17:00' bewaard", pf && pf.tijd === null && pf.eind === "17:00" && pf.soort === "deadline" && pf.datum === "2026-10-20", JSON.stringify(pf));
  // afspraak in het verleden telt niet mee als 'nog open'
  await page.click('.dag[data-datum="2026-10-21"]'); await w(100);
  await page.click('#dagpaneel [data-nieuw]'); await w(100);
  await page.fill("#f-titel", "Werkcollege");
  await page.fill("#f-tijd", "10:00"); await page.dispatchEvent("#f-tijd", "change");
  await page.fill("#f-eind", "11:30");
  await page.click("#formulier button[type=submit]"); await w(150);
  const wc = await page.evaluate(() => JSON.parse(localStorage.getItem("pabo3-kalender-opdrachten-v1")).find((o) => o.titel === "Werkcollege"));
  check("venster: afspraak met begin- en eindtijd", wc && wc.tijd === "10:00" && wc.eind === "11:30", JSON.stringify(wc));
  check("zijpaneel: blok toont 10:00 en 11:30", (await txt("#dagpaneel")).includes("10:00") && (await txt("#dagpaneel")).includes("11:30"));

  // 8. melding 'nog open van eerder'
  await page.reload(); await w(300);
  const balk = await page.locator("#openBalk").isVisible();
  check("melding telt alleen to-do's (1, niet de afspraak)", balk && (await txt("#openBalk")).includes("1 to-do"), balk ? await txt("#openBalk") : "niet zichtbaar");
  check("melding zonder 'te laat'", !(await txt("#openBalk")).toLowerCase().includes("te laat"));
  await page.screenshot({ path: path.join(OUT, "a5-melding.png") });
  await page.click('[data-open="bekijk"]'); await w(150);
  check("Bekijken opent de Lijst", (await page.getAttribute('[data-weergave="lijst"]', "aria-selected")) === "true" && (await txt("#hoofd")).includes("Nog open van eerder"));
  check("lijst: afspraak van eerder staat niet bij 'nog open'", !(await page.locator(".groep").first().innerText()).includes("Werkcollege"));
  await page.screenshot({ path: path.join(OUT, "a6-opdrachten.png") });
  await page.click("[data-alles-vandaag]"); await w(150);
  check("alles naar vandaag", (await page.evaluate(() => JSON.parse(localStorage.getItem("pabo3-kalender-opdrachten-v1")).find((o) => o.titel === "Portfolio afmaken").datum)) === "2026-10-22");
  await page.reload(); await w(250);
  check("melding weg na afhandelen", !(await page.locator("#openBalk").isVisible()));
  check("laptop start altijd op de maand", (await page.getAttribute('[data-weergave="maand"]', "aria-selected")) === "true");
  check("laptop: geen onderbalk", !(await page.locator("#onderbalk").isVisible()));
  await page.click('[data-weergave="maand"]'); await w(100);

  // 9. instellingen
  await page.click("#instellingenKnop"); await w(150);
  check("instellingen open", await page.locator("#instellingen").isVisible());
  await page.screenshot({ path: path.join(OUT, "a7-instellingen.png") });
  await page.check('#instellingen input[value="persoonlijk"]'); await w(100);
  check("persoonlijk aangezet: 3 filters", (await page.locator("[data-filter]").count()) === 3);
  await page.uncheck("#inst-pabo"); await w(100);
  check("pabo uit: jaarstrook weg", !(await page.locator("#jaarstrook").isVisible()));
  await page.check("#inst-pabo"); await w(100);
  check("koppeling vraagt eerst om inloggen", (await txt("#inst-koppeling")).includes("Log eerst in"));

  // 10. account maken in instellingen
  await page.click('#inst-account [data-actie="wissel"]'); await w(80);
  await page.fill("#acc-naam", "gijs"); await page.fill("#acc-pin", "1234"); await page.fill("#acc-pin2", "1234");
  await page.click("#acc-form button[type=submit]"); await w(150);
  check("makkelijke pincode 1234 geweigerd", (await txt("#inst-account")).includes("te makkelijk"), await txt("#inst-account"));
  check("geen server-aanroep bij zwakke pincode", !S.calls.includes("kal_registreer"));
  await page.fill("#acc-naam", "gijs"); await page.fill("#acc-pin", "4821"); await page.fill("#acc-pin2", "4821");
  await page.click("#acc-form button[type=submit]"); await w(500);
  check("ingelogd in instellingen", (await txt("#inst-account")).includes("Ingelogd als gijs"), await txt("#inst-account"));
  check("lokale opdrachten naar server", Object.keys(S.data.gijs).length === 5, Object.keys(S.data.gijs).length);
  check("eindtijd naar server", Object.values(S.data.gijs).some((o) => o.titel === "Werkcollege" && o.eind === "11:30"));
  check("instellingen naar server", Array.isArray(S.inst.gijs.agendas) && S.inst.gijs.agendas.includes("persoonlijk"), JSON.stringify(S.inst.gijs));
  check("tijd + agenda naar server", Object.values(S.data.gijs).some((o) => o.agenda === "werk" && o.tijd === "10:00"));
  check("kopknop toont naam", (await page.innerText("#accountKnop")) === "gijs");
  await page.click('[data-link="maak"]'); await w(250);
  const href = await page.getAttribute("#inst-koppeling a.knop-link", "href");
  check("agenda-link (webcal) gemaakt", /^webcal:\/\/srfigofpluibrrgcefuq\.supabase\.co\/functions\/v1\/digigenda-agenda\?code=c/.test(href || ""), href);
  await page.click('[data-link="nieuw"]'); await w(250);
  const href2 = await page.getAttribute("#inst-koppeling a.knop-link", "href");
  check("nieuwe link is anders", href2 && href2 !== href);
  await page.click('#instellingen [data-actie="bio-aan"]'); await w(700);
  check("Face ID aangezet", (await txt("#inst-account")).includes("staat aan"), await txt("#inst-account"));
  await page.click("#inst-sluit"); await w(100);

  // 11. herladen: vergrendeld, ontgrendelen
  await page.reload(); await w(400);
  check("vergrendeld na herladen", await page.locator("#slotBalk").isVisible());
  check("geen startscherm bij vergrendeld", !(await page.locator("#welkom").isVisible()));
  check("vergrendeld: geen opdrachten", (await page.locator(".chip.eigen").count()) === 0);
  await page.fill("#snelInvoer", "test morgen"); await w(80);
  check("vergrendeld: invoer zegt ontgrendelen", (await txt("#snelVoorbeeld")).includes("Ontgrendel"));
  await page.fill("#snelInvoer", "");
  await page.click('#slotBalk [data-actie="ontgrendel"]'); await w(800);
  check("ontgrendeld: opdrachten terug", (await page.locator(".chip.eigen").count()) >= 3);
  check("slotbalk weg", !(await page.locator("#slotBalk").isVisible()));

  // 12. snelle invoer bij ingelogd -> server
  await page.fill("#snelInvoer", "afspraak tandarts #prive morgen 08:15"); await w(80);
  await page.press("#snelInvoer", "Enter"); await w(400);
  const tand = Object.values(S.data.gijs).find((o) => o.titel.includes("tandarts"));
  check("ingelogd: snelle invoer op server", tand && tand.agenda === "persoonlijk" && tand.tijd === "08:15" && tand.soort === "afspraak" && tand.datum === "2026-10-23", JSON.stringify(tand));

  // 12b. pincode wijzigen
  await page.click("#accountKnop"); await w(150);
  await page.click('#instellingen [data-actie="pin-wijzig"]'); await w(80);
  await page.fill("#pin-oud", "0000"); await page.fill("#pin-nieuw", "5937"); await page.fill("#pin-herhaal", "5937");
  await page.click("#pin-form button[type=submit]"); await w(250);
  check("pin wijzigen: foute huidige pin gemeld", (await txt("#inst-account")).includes("klopt niet"), await txt("#inst-account"));
  await page.fill("#pin-oud", "4821"); await page.fill("#pin-nieuw", "2468"); await page.fill("#pin-herhaal", "2468");
  await page.click("#pin-form button[type=submit]"); await w(150);
  check("pin wijzigen: zwakke nieuwe pin geweigerd", (await txt("#inst-account")).includes("te makkelijk"));
  await page.fill("#pin-oud", "4821"); await page.fill("#pin-nieuw", "5937"); await page.fill("#pin-herhaal", "5937");
  await page.click("#pin-form button[type=submit]"); await w(250);
  check("pin wijzigen gelukt", (await txt("#inst-account")).includes("gewijzigd") && S.users.gijs.pin === "5937", await txt("#inst-account"));
  // 12c. overal uitloggen (eerst bevestigen)
  await page.click('#instellingen [data-actie="overal"]'); await w(100);
  check("overal uitloggen vraagt bevestiging", (await txt("#inst-account")).includes("Klik nogmaals"));
  await page.click('#instellingen [data-actie="overal"]'); await w(300);
  check("overal uitgelogd: geen sessies meer op server", !Object.values(S.sessies).includes("gijs") && (await txt("#inst-account")).includes("al je apparaten uitgelogd"), await txt("#inst-account"));
  await page.fill("#acc-naam", "gijs"); await page.fill("#acc-pin", "5937");
  await page.click("#acc-form button[type=submit]"); await w(500);
  check("weer inloggen met nieuwe pin", (await txt("#inst-account")).includes("Ingelogd als gijs"));
  await page.click("#inst-sluit"); await w(100);

  // 13. uitloggen
  await page.click("#accountKnop"); await w(150);
  await page.click('#instellingen [data-actie="uitloggen"]'); await w(300);
  check("uitgelogd", (await txt("#inst-account")).includes("uitgelogd"));
  await page.click("#inst-sluit");
  check("na uitloggen geen opdrachten", (await page.locator(".chip.eigen").count()) === 0);
  check("geen JS-fouten (laptop)", fouten.length === 0, fouten.join(" | "));

  // ================= B. telefoon =================
  const tel = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: "block" });
  await routeer(tel);
  const p = await tel.newPage();
  await p.clock.setFixedTime(NU);
  const fouten2 = [];
  p.on("pageerror", (e) => fouten2.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && /Content Security Policy/.test(m.text())) fouten2.push(m.text()); });
  await p.goto(BASE); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, "b1-welkom.png") });
  await p.click("#welkom-verder"); await p.waitForTimeout(100);
  await p.click("#welkom-account [data-actie=wissel]"); await p.waitForTimeout(80);
  await p.fill("#acc-naam", "gijs"); await p.fill("#acc-pin", "5937");
  await p.click("#acc-form button[type=submit]"); await p.waitForTimeout(600);
  check("telefoon: inloggen vanuit startscherm sluit startscherm", !(await p.locator("#welkom").isVisible()));
  check("telefoon: instellingen van server overgenomen (3 agenda's)", (await p.locator("[data-filter]").count()) === 3);
  const geenScroll = async (naam) => { const breed = await p.evaluate(() => document.documentElement.scrollWidth); check("telefoon " + naam + ": geen horizontale scroll", breed <= 390, "scrollWidth=" + breed); };
  check("telefoon: onderbalk zichtbaar, tabs bovenin verborgen", await p.locator("#onderbalk").isVisible() && !(await p.locator(".tabs").isVisible()));
  await p.reload(); await p.waitForTimeout(400);
  check("telefoon start op Vandaag (dag)", (await p.getAttribute('[data-onder="vandaag"]', "aria-current")) === "page" && (await p.locator(".dag-todo").count()) === 1);
  check("telefoon: Nu/Hierna-kaart op vandaag", await p.locator("#nuKaart").isVisible());
  check("telefoon: lege dag = geen lege tijdlijn", (await p.locator(".dagraster").count()) === 0 && (await p.locator(".dag-agenda").innerText()).includes("Geen afspraken"));
  await p.click('.dag-agenda [data-uitklap="1"]'); await p.waitForTimeout(100);
  check("telefoon: 'Tijdlijn tonen' toont hele dag met rode nu-lijn 10:00", (await p.locator(".dagraster .nu-lijn span").innerText()) === "10:00" && (await p.locator(".dagraster .uurlabels").innerText()).includes("07:00"));
  await p.click('[data-uitklap="0"]'); await p.waitForTimeout(100);
  check("telefoon: Dag|Week-knop in de kop", await p.locator('#kopModus [data-modus="week"]').isVisible());
  check("telefoon: rustige kop (groet + rond accountknopje, geen tandwiel)", (await p.locator("#kopGroet").innerText()).startsWith("Goede") && !(await p.locator("#instellingenKnop").isVisible()) && (await p.locator("#accountKnop .ak-rond").innerText()) === "G");
  check("telefoon: typbalk onderaan", await p.evaluate(() => { const r = document.getElementById("snelForm").getBoundingClientRect(); return r.top > window.innerHeight * 0.75; }));
  check("telefoon: geen filters en geen 'nog open'-balk op Vandaag", !(await p.locator(".weergave-balk").isVisible()) && !(await p.locator("#openBalk").isVisible()));
  check("telefoon: geen doorschuif-/wijzigknoppen zichtbaar in de rijen", (await p.locator(".rij-acties:visible").count()) === 0);
  await geenScroll("vandaag");
  await p.screenshot({ path: path.join(OUT, "b-vandaag.png"), fullPage: true });
  await p.click('[data-modus="week"]'); await p.waitForTimeout(150);
  check("telefoon week: ma–vr (5 kolommen)", (await p.locator(".weekblok .kolom").count()) === 5);
  check("telefoon week: weekendstrook", await p.locator('[data-weekend="1"]').isVisible() && (await p.locator('[data-weekend="1"]').innerText()).includes("za 24"));
  await geenScroll("week");
  await p.click('[data-weekend="1"]'); await p.waitForTimeout(150);
  check("telefoon weekend: za + zo als tijdblokken", (await p.locator(".weekblok .kolom").count()) === 2 && (await p.locator('.kolom[data-tijdlijn-datum="2026-10-25"]').count()) === 1);
  check("telefoon weekend: blok zondag 10:00", (await p.locator('.kolom[data-tijdlijn-datum="2026-10-25"] .blok').count()) >= 1);
  await p.click('[data-weekend="0"]'); await p.waitForTimeout(100);
  await p.click('[data-onder="maand"]'); await p.waitForTimeout(150);
  check("telefoon: Maand via onderbalk", (await p.getAttribute('[data-onder="maand"]', "aria-current")) === "page" && (await p.locator("#grid").count()) === 1);
  check("telefoon maand: geen zijpaneel", !(await p.locator("#dagpaneel").isVisible()));
  await geenScroll("maand");
  await p.click('.dag[data-datum="2026-10-23"]'); await p.waitForTimeout(150);
  check("telefoon: dag in maand opent dagweergave van die dag", (await p.getAttribute('[data-onder="vandaag"]', "aria-current")) === "page" && (await p.locator(".hero-titel").innerText()).includes("23 oktober"));
  const blok = p.locator(".dagraster .blok").first();
  check("telefoon: afspraak als blok op 23 okt", (await blok.count()) === 1);
  await blok.click(); await p.waitForTimeout(150);
  check("telefoon: tik op blok opent wijzigen", (await p.locator("#venstertitel").innerText()) === "Afspraak wijzigen");
  await p.click("#f-annuleer"); await p.waitForTimeout(80);
  await p.click('.uurvak[data-slot="2026-10-23|15:00"]'); await p.waitForTimeout(150);
  check("telefoon: tik op leeg uur = nieuw blok 15:00–16:00", (await p.inputValue("#f-tijd")) === "15:00" && (await p.inputValue("#f-eind")) === "16:00" && (await p.inputValue("#f-datum")) === "2026-10-23");
  await p.fill("#f-titel", "Sporten");
  await p.click("#formulier button[type=submit]"); await p.waitForTimeout(400);
  check("telefoon: nieuw blok zichtbaar en op server", (await p.locator(".dagraster .blok").filter({ hasText: "Sporten" }).count()) === 1 && Object.values(S.data.gijs).some((o) => o.titel === "Sporten" && o.eind === "16:00"));
  await p.click('[data-kies="2026-10-24"]'); await p.waitForTimeout(100);
  check("telefoon: weekstrook kiest dag", (await p.locator(".hero-titel").innerText()).includes("24 oktober"));
  await p.click('[data-onder="lijst"]'); await p.waitForTimeout(150);
  check("telefoon: Lijst via onderbalk", (await p.locator("#hoofd h2").first().innerText()) === "Lijst");
  await geenScroll("lijst");
  await p.click('[data-onder="vandaag"]'); await p.waitForTimeout(150);
  check("telefoon: huisje = vandaag", (await p.locator(".hero-titel").innerText()).includes("22 oktober"));
  await p.click("#accountKnop"); await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, "b-instellingen.png") });
  check("geen JS-fouten (telefoon)", fouten2.length === 0, fouten2.join(" | "));

  // ================= D. meldingen =================
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await routeer(pc);
  await pc.addInitScript(() => {
    const abonnement = { endpoint: "https://fcm.googleapis.com/fcm/send/test-apparaat", toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "B" + "A".repeat(86), auth: "A".repeat(22) } }; },
      unsubscribe: async () => { localStorage.setItem("nep-afgemeld", String(+(localStorage.getItem("nep-afgemeld") || 0) + 1)); localStorage.removeItem("nep-sub"); return true; } };
    const reg = { pushManager: { getSubscription: async () => (localStorage.getItem("nep-sub") ? abonnement : null),
      subscribe: async (o) => { window.__vapidLengte = o.applicationServerKey.length; localStorage.setItem("nep-sub", "1"); return abonnement; } } };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg), addEventListener() {}, controller: null } });
    let toestemming = localStorage.getItem("nep-toestemming") || "default";
    window.Notification = { get permission() { return toestemming; }, requestPermission: async () => { toestemming = "granted"; localStorage.setItem("nep-toestemming", "granted"); return toestemming; } };
    window.PushManager = function () {};
  });
  const m = await pc.newPage();
  await m.clock.setFixedTime(NU);
  const fouten3 = [];
  m.on("pageerror", (e) => fouten3.push(e.message));
  await m.goto(BASE); await m.waitForTimeout(300);
  await m.click("#welkom-verder"); await m.waitForTimeout(100); await m.click("#welkom-zonder"); await m.waitForTimeout(100);
  await m.click("#accountKnop"); await m.waitForTimeout(200);
  check("meldingen: eerst inloggen", (await m.locator("#inst-meldingen").innerText()).includes("Log eerst in"));
  await m.click('#inst-account [data-actie="wissel"]'); await m.waitForTimeout(80);
  await m.fill("#acc-naam", "gijs"); await m.fill("#acc-pin", "5937");
  await m.click("#acc-form button[type=submit]"); await m.waitForTimeout(500);
  await m.click("#inst-sluit"); await m.click("#accountKnop"); await m.waitForTimeout(250);
  check("meldingen: knop 'Meldingen aanzetten'", await m.locator('[data-push="aan"]').isVisible());
  await m.click('[data-push="aan"]'); await m.waitForTimeout(400);
  const ab = S.push["https://fcm.googleapis.com/fcm/send/test-apparaat"];
  check("meldingen: apparaat aangemeld op server voor gijs", ab && ab.naam === "gijs" && ab.actief, JSON.stringify(ab));
  check("meldingen: publieke VAPID-sleutel is 65 bytes", (await m.evaluate(() => window.__vapidLengte)) === 65);
  check("meldingen: status + keuzes zichtbaar", (await m.locator("#inst-meldingen").innerText()).includes("staan aan") && await m.locator("#push-ochtend").isChecked() && await m.locator("#push-afspraak").isChecked());
  await m.uncheck("#push-ochtend"); await m.waitForTimeout(200);
  check("meldingen: ochtendoverzicht uit → naar server", S.inst.gijs.meldingen && S.inst.gijs.meldingen.ochtend === false && S.inst.gijs.meldingen.afspraak === true, JSON.stringify(S.inst.gijs.meldingen));
  await m.check("#push-ochtend"); await m.waitForTimeout(150);
  await m.click('[data-push="test"]'); await m.waitForTimeout(300);
  check("meldingen: testmelding verstuurd", (await m.locator("#inst-meldingen").innerText()).includes("Testmelding verstuurd"), await m.locator("#inst-meldingen").innerText());
  const voor = S.calls.filter((c) => c === "kal_push_aanmelden").length;
  await m.reload(); await m.waitForTimeout(600);
  check("meldingen: na herladen opnieuw gekoppeld aan inlog", S.calls.filter((c) => c === "kal_push_aanmelden").length > voor);
  await m.click("#accountKnop"); await m.waitForTimeout(300);
  check("meldingen: na herladen nog 'aan'", (await m.locator("#inst-meldingen").innerText()).includes("staan aan"));
  await m.click('[data-push="uit"]'); await m.waitForTimeout(300);
  check("meldingen: uitzetten meldt af en zegt abonnement op", S.push["https://fcm.googleapis.com/fcm/send/test-apparaat"].actief === false && (await m.evaluate(() => localStorage.getItem("nep-afgemeld"))) === "1");
  await m.click('[data-push="aan"]'); await m.waitForTimeout(400);
  await m.click('#instellingen [data-actie="uitloggen"]'); await m.waitForTimeout(400);
  check("meldingen: uitloggen zegt abonnement op dit apparaat op", (await m.evaluate(() => localStorage.getItem("nep-afgemeld"))) === "2" && (await m.evaluate(() => localStorage.getItem("digigenda-meldingen-v1"))) === null);
  check("geen JS-fouten (meldingen)", fouten3.length === 0, fouten3.join(" | "));
  // iPhone zonder beginscherm-app: uitleg
  const ip = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
  await routeer(ip);
  await ip.addInitScript(() => { delete window.PushManager; });
  const i = await ip.newPage();
  await i.goto(BASE); await i.waitForTimeout(300);
  await i.click("#welkom-verder"); await i.waitForTimeout(100); await i.click("#welkom-zonder"); await i.waitForTimeout(100);
  await i.click("#accountKnop"); await i.waitForTimeout(150);
  await i.click('#inst-account [data-actie="wissel"]'); await i.waitForTimeout(80);
  await i.fill("#acc-naam", "gijs"); await i.fill("#acc-pin", "5937");
  await i.click("#acc-form button[type=submit]"); await i.waitForTimeout(500);
  check("iPhone in Safari: uitleg 'op je beginscherm'", (await i.locator("#inst-meldingen").innerText()).includes("op je beginscherm"), await i.locator("#inst-meldingen").innerText());

  // ================= C. app / offline =================
  const app = await browser.newContext({ viewport: { width: 800, height: 700 } });
  await routeer(app);
  const q = await app.newPage();
  await q.goto(BASE); await q.waitForTimeout(1200);
  const sw = await q.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && (r.active || r.installing || r.waiting)); });
  check("service worker geregistreerd", sw);
  await q.reload(); await q.waitForTimeout(800);
  const controller = await q.evaluate(() => !!navigator.serviceWorker.controller);
  check("service worker beheert de pagina", controller);
  await app.setOffline(true);
  await q.reload(); await q.waitForTimeout(600);
  check("offline: app opent nog", (await q.title()) === "Digigenda" && await q.locator("#snelInvoer").isVisible());
  await app.setOffline(false);
  for (const f of ["manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png", "icons/icon.svg"]) {
    const r = await q.request.get(BASE + f);
    check("bestand " + f, r.ok());
  }

  console.log(res.join("\n"));
  console.log(res.filter((r) => r.startsWith("PASS")).length + " / " + res.length + " geslaagd");
  await browser.close();
})().catch((e) => { console.log(res.join("\n")); console.error("CRASH", e); process.exit(1); });
