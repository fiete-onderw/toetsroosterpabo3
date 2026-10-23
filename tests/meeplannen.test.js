// Fase 4: vrije tijd, 'Plan in', studieblokken, dagstart en avondblik
const { chromium } = require(process.env.PLAYWRIGHT_PAD || "playwright");
const path = require("path"), fs = require("fs");
const OUT = path.join(__dirname, "schermen"); fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASIS || "http://localhost:8766/";
const NU = new Date("2026-10-22T14:20:00");   // donderdag
const DATA = [
  { id: "a1", titel: "College Taal", datum: "2026-10-22", tijd: "09:00", eind: "12:00", soort: "afspraak", agenda: "school" },
  { id: "a2", titel: "Dienst Essent", datum: "2026-10-22", tijd: "18:00", eind: "21:30", soort: "afspraak", agenda: "werk", bron: "imp-rooster" },
  { id: "a3", titel: "Dienst Essent", datum: "2026-10-23", tijd: "13:00", eind: "22:00", soort: "afspraak", agenda: "werk", bron: "imp-rooster" },
  { id: "a4", titel: "Werkcollege", datum: "2026-10-26", tijd: "09:00", eind: "17:00", soort: "afspraak", agenda: "school" },
  { id: "b1", titel: "Ochtendoverleg", datum: "2026-10-23", tijd: "09:00", eind: "10:00", soort: "afspraak", agenda: "school" },
  { id: "t1", titel: "Samenvatting H4", datum: "2026-10-22", soort: "opdracht", agenda: "school" },
  { id: "t2", titel: "Casus 3 inleveren", datum: "2026-10-23", eind: "12:00", soort: "deadline", agenda: "school" },
  { id: "t3", titel: "Lezen RT 6.2.2", datum: "2026-10-20", soort: "opdracht", agenda: "school" },
  { id: "t4", titel: "Boodschappen", datum: "2026-10-21", soort: "opdracht", agenda: "persoonlijk" },
  { id: "t5", titel: "Oma bellen", datum: "2026-10-23", soort: "opdracht", agenda: "persoonlijk" },
  { id: "x1", titel: "Toets rekenen", datum: "2026-11-05", soort: "toets", agenda: "school" },
  { id: "x2", titel: "Deadline over 2 dagen", datum: "2026-10-24", soort: "deadline", agenda: "school" }
];
const res = []; const check = (n, ok, x) => res.push((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  (" + (typeof x === "string" ? x : JSON.stringify(x)) + ")"));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PAD || undefined });
  const fouten = [];
  async function maak(viewport, nu, inst) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: viewport.width < 700, isMobile: viewport.width < 700 });
    await ctx.route("https://**", (r) => r.abort());
    await ctx.addInitScript(([d, i]) => { if (!localStorage.getItem("z")) { localStorage.setItem("pabo3-kalender-opdrachten-v1", JSON.stringify(d)); localStorage.setItem("digigenda-instellingen-v1", JSON.stringify(i)); localStorage.setItem("digigenda-imports-v1", JSON.stringify([{ id: "imp-rooster", naam: "Rooster Essent", soort: "link", agenda: "werk", alleenBezet: false, actief: true }])); localStorage.setItem("z", "1"); } }, [DATA, inst || { agendas: ["school", "werk", "persoonlijk"], pabo: true, welkom: true }]);
    const p = await ctx.newPage();
    await p.clock.setFixedTime(nu || NU);
    p.on("pageerror", (e) => fouten.push(viewport.width + ": " + e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/fonts|net::|Failed to load resource/.test(m.text())) fouten.push(m.text()); });
    await p.goto(BASE); await p.waitForTimeout(300);
    return p;
  }
  const data = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("pabo3-kalender-opdrachten-v1")));
  const w = (p, ms) => p.waitForTimeout(ms);

  // ---- telefoon: dagstart, gaten, plan in via menu ----
  const t = await maak({ width: 390, height: 844 });
  check("dagstart: kaart met to-do's van eerder (2)", await t.locator(".dagstart").isVisible() && (await t.locator(".dagstart").innerText()).includes("Nog open van eerder · 2") && (await t.locator(".dagstart .ds-rij").count()) === 2);
  check("dagstart: de to-do-lijst toont ze niet dubbel", (await t.locator('.dag-todo .rij[data-id="t3"]').count()) === 0);
  await t.screenshot({ path: path.join(OUT, "m1-dagstart.png"), fullPage: true });
  await t.click('[data-ds="later"][data-id="t4"]'); await w(t, 200);
  check("dagstart: 'Later' zet naar morgen", (await data(t)).find((o) => o.id === "t4").datum === "2026-10-23");
  await t.click('[data-ds="weg"][data-id="t3"]'); await w(t, 200);
  check("dagstart: 'Weg' verwijdert met ongedaan-toast", !(await data(t)).some((o) => o.id === "t3") && (await t.locator("#toast").innerText()).includes("Weggehaald"));
  await t.click("#toastOngedaan"); await w(t, 200);
  check("dagstart: ongedaan maken brengt hem terug", (await data(t)).some((o) => o.id === "t3") && await t.locator(".dagstart").isVisible());
  await t.click('[data-dagstart="sluit"]'); await w(t, 200);
  check("dagstart: 'Laat maar' sluit de kaart en de to-do's staan weer in de lijst", !(await t.locator(".dagstart").isVisible()) && (await t.locator('.dag-todo .rij[data-id="t3"]').count()) === 1);
  await t.reload(); await w(t, 300);
  check("dagstart: blijft weg na herladen op dezelfde dag", !(await t.locator(".dagstart").isVisible()));
  // gaten in de tijdlijn (vandaag vanaf 14:30 tot 18:00 = vrij, en 21:30–22:00 is < 1 uur)
  const gaten = await t.locator(".dagraster .gat").allInnerTexts();
  check("gaten: vandaag 14:30–18:00 vrij (werkdienst uit import telt als bezet)", gaten.length === 1 && gaten[0].includes("14:30–18:00 vrij"), gaten);
  // plan in via lang indrukken-menu
  const aanraak = (sel, wacht) => t.evaluate(async ([sel, wacht]) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); const maak = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y }); const x0 = r.left + r.width * 0.6, y0 = r.top + r.height / 2; el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [maak(x0, y0)], changedTouches: [maak(x0, y0)] })); await new Promise((k) => setTimeout(k, wacht)); el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], changedTouches: [maak(x0, y0)] })); }, [sel, wacht]);
  await aanraak('.rij[data-id="t1"]', 700); await w(t, 150);
  check("menu: 'Plan in' staat erin", await t.locator('#rijMenu [data-menu="plan"]').isVisible());
  await t.click('#rijMenu [data-menu="plan"]'); await w(t, 250);
  const t1 = (await data(t)).find((o) => o.id === "t1");
  check("plan in: to-do in het eerste gat (14:30–15:30) als blok", t1.tijd === "14:30" && t1.eind === "15:30" && t1.datum === "2026-10-22", t1);
  check("plan in: toast met Aanpassen en Ongedaan maken", (await t.locator("#toast").innerText()).includes("Ingepland") && await t.locator("#toastExtra").isVisible() && await t.locator("#toastOngedaan").isVisible());
  await t.screenshot({ path: path.join(OUT, "m2-planin.png"), fullPage: true });
  await t.click("#toastExtra"); await w(t, 150);
  check("toast 'Aanpassen' opent het venster van het item", (await t.locator("#venstertitel").innerText()) === "Afspraak wijzigen" && (await t.inputValue("#f-tijd")) === "14:30");
  await t.click("#f-annuleer");
  const gaten2 = await t.locator(".dagraster .gat").allInnerTexts();
  check("gaten: na inplannen begint het gat om 15:30", gaten2.length === 1 && gaten2[0].includes("15:30–18:00"), gaten2);
  // deadline met eindtijd: plan in vóór die tijd, op die dag
  await t.click('[data-kies="2026-10-23"]'); await w(t, 150);
  await t.click('.rij[data-id="t2"] .rij-tekst'); await w(t, 150);
  check("venster: 'Plan in'-knop bij een to-do", await t.locator("#f-plan").isVisible());
  await t.click("#f-plan"); await w(t, 250);
  const t2 = (await data(t)).find((o) => o.id === "t2");
  check("plan in met 'tot 12:00': eerste vrije uur op die dag vóór de deadline (08:00–09:00)", t2.datum === "2026-10-23" && t2.tijd === "08:00" && t2.eind === "09:00", t2);
  // tik op een gat → nieuw item met die begintijd
  await t.click('[data-kies="2026-10-22"]'); await w(t, 150);
  await t.click(".dagraster .gat span"); await w(t, 150);
  check("tik op gat: nieuw venster met 15:30–16:30", (await t.inputValue("#f-tijd")) === "15:30" && (await t.inputValue("#f-eind")) === "16:30");
  await t.click("#f-annuleer");
  // instellingen: gaten uit
  await t.click("#accountKnop"); await w(t, 150);
  check("instellingen: blok Meeplannen met 3 vinkjes", (await t.locator("#inst-meeplannen").innerText()).includes("Meeplannen") && (await t.locator("#inst-meeplannen input").count()) === 3);
  await t.uncheck("#mp-gaten"); await w(t, 150); await t.click("#inst-sluit"); await w(t, 100);
  check("gaten uit: geen vrij-labels meer", (await t.locator(".dagraster .gat").count()) === 0 && (await t.evaluate(() => JSON.parse(localStorage.getItem("digigenda-instellingen-v1")).meeplannen.gaten)) === false);
  check("geen JS-fouten (telefoon)", fouten.length === 0, fouten.join(" | "));

  // ---- studieblokken (laptop) ----
  const l = await maak({ width: 1366, height: 900 });
  await l.click('[data-weergave="dag"]'); await w(l, 150);
  await l.click('[data-dagstart="sluit"]').catch(() => {}); await w(l, 100);
  await l.click('[data-weergave="lijst"]'); await w(l, 150);
  await l.click('.rij[data-id="x1"] .rij-tekst'); await w(l, 150);
  check("toets: knop 'Studieblokken plannen' in het venster", await l.locator("#f-studie").isVisible());
  await l.click("#f-studie"); await w(l, 200);
  check("studievenster open met toets en standaard 4 blokken van 1,5 uur", await l.locator("#studieVenster").isVisible() && (await l.locator("#studieVenster").innerText()).includes("Toets rekenen") && (await l.inputValue("#studie-aantal")) === "4" && (await l.inputValue("#studie-duur")) === "90");
  await l.click("#studie-form button[type=submit]"); await w(l, 200);
  const vs = await l.locator(".studie-lijst .rij").allInnerTexts();
  check("voorstel: 4 blokken, allemaal vóór 5 nov, op verschillende dagen", vs.length === 4 && new Set(vs.map((x) => x.split(" ").slice(0, 3).join(" "))).size === 4, vs);
  const blokDatums = await l.evaluate(() => [...document.querySelectorAll(".studie-lijst strong")].map((x) => x.innerText));
  check("voorstel: laatste blok op de dag vóór de toets (wo 4 nov)", blokDatums[blokDatums.length - 1] === "wo 4 nov", blokDatums);
  check("voorstel: vr 23 okt (dienst 13–22) niet 's avonds, ma 26 (college 9–17) niet overdag", vs.every((x) => !(x.startsWith("vr 23 okt") && /1[3-9]:|2[01]:/.test(x.split(" ")[3])) && !(x.startsWith("ma 26 okt") && /^(09|1[0-6]):/.test(x.split(" ")[3]))), vs);
  await l.screenshot({ path: path.join(OUT, "m3-studieblokken.png") });
  await l.uncheck('[data-studie-vink="0"]'); await w(l, 100);
  check("vinkje uit: knop telt 3", (await l.locator("[data-studie-plan]").innerText()).startsWith("3 blokken"));
  await l.click("[data-studie-plan]"); await w(l, 250);
  const studie = (await data(l)).filter((o) => o.titel === "Studeren: Toets rekenen");
  check("3 studieblokken aangemaakt in agenda School, met tijd en notitie", studie.length === 3 && studie.every((o) => o.agenda === "school" && o.tijd && o.eind && o.notitie.includes("Toets rekenen")), studie);
  check("toast met ongedaan maken", (await l.locator("#toast").innerText()).includes("3 studieblokken ingepland") && await l.locator("#toastOngedaan").isVisible());
  // Pabo-toets (vast) krijgt ook de knop
  await l.click('[data-weergave="dag"]'); await w(l, 100);
  for (let i = 0; i < 4; i++) await l.click('[data-week="1"]');
  await l.click('[data-kies="2026-11-17"]'); await w(l, 200);
  check("Pabo-toets (LKT Taal 17 nov): knop 'Studieblokken plannen' op de vaste rij", await l.locator(".rij.vast [data-studie-titel=\"LKT Taal\"]").isVisible());
  await l.click('.rij.vast [data-studie-titel="LKT Taal"]'); await w(l, 150);
  check("studievenster voor LKT Taal", (await l.locator("#studieVenster").innerText()).includes("LKT Taal") && (await l.locator("#studieVenster").innerText()).includes("di 17 nov"));
  await l.fill("#studie-aantal", "2"); await l.selectOption("#studie-duur", "120");
  await l.click("#studie-form button[type=submit]"); await w(l, 200);
  const vs2 = await l.locator(".studie-lijst .rij").allInnerTexts();
  check("2 blokken van 2 uur", vs2.length === 2 && vs2.every((x) => { const [a, b] = x.split(" ").pop().split("–"); return (+b.slice(0, 2) * 60 + +b.slice(3)) - (+a.slice(0, 2) * 60 + +a.slice(3)) === 120; }), vs2);
  await l.click("[data-studie-sluit]");
  // deadline over 2 dagen met weinig ruimte: minder blokken dan gevraagd → melding
  await l.click('[data-weergave="lijst"]'); await w(l, 150);
  await l.click('.rij[data-id="x2"] .rij-tekst'); await w(l, 150);
  await l.click("#f-studie"); await w(l, 150);
  await l.fill("#studie-aantal", "6"); await l.click("#studie-form button[type=submit]"); await w(l, 200);
  const vs3 = await l.locator(".studie-lijst .rij").count();
  check("te weinig dagen: meerdere blokken per dag, en melding als het niet past", vs3 >= 2 && vs3 <= 6 && ((await l.locator("#studieVenster").innerText()).includes("ruimte vóór die dag") || vs3 === 6), vs3);
  await l.click("[data-studie-sluit]");
  check("geen JS-fouten (laptop)", fouten.length === 0, fouten.join(" | "));

  // ---- avondblik (na 20:00) ----
  const a = await maak({ width: 390, height: 844 }, new Date("2026-10-22T21:45:00"));
  await a.click('[data-dagstart="sluit"]').catch(() => {}); await w(a, 100);
  const nk = await a.locator("#nuKaart").innerText();
  check("avondblik: Nu-kaart toont hoe morgen begint", nk.includes("Morgen") && nk.includes("Begint met 09:00 Ochtendoverleg") && nk.includes("to-do"), nk);
  await a.screenshot({ path: path.join(OUT, "m4-avondblik.png") });
  await a.click("#nuKaart .nu-hoofd"); await w(a, 150);
  check("tik op avondblik opent morgen", (await a.locator(".hero-titel").innerText()).includes("Vrijdag 23 oktober"));
  // avondblik uit
  await a.click('[data-nav="0"]'); await w(a, 100);
  await a.click("#accountKnop"); await w(a, 150); await a.uncheck("#mp-avond"); await w(a, 100); await a.click("#inst-sluit"); await w(a, 100);
  check("avondblik uit: gewone 'rest van de dag'-kaart", (await a.locator("#nuKaart").innerText()).includes("Geen afspraken meer"));
  // dagstart uit
  const b = await maak({ width: 390, height: 844 }, NU, { agendas: ["school", "werk", "persoonlijk"], pabo: true, welkom: true, meeplannen: { dagstart: false } });
  check("dagstart uit: geen kaart, to-do's van eerder gewoon in de lijst", !(await b.locator(".dagstart").isVisible()) && (await b.locator('.dag-todo .rij[data-id="t3"]').count()) === 1);
  check("geen JS-fouten (avond)", fouten.length === 0, fouten.join(" | "));

  console.log(res.join("\n"));
  console.log(res.filter((r) => r.startsWith("PASS")).length + " / " + res.length + " geslaagd");
  await browser.close();
  if (res.some((r) => r.startsWith("FAIL"))) process.exit(1);
})().catch((e) => { console.log(res.join("\n")); console.error("CRASH", e); process.exit(1); });
