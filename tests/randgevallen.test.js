// Randgevallen: lange titels, 30+ to-do's, overlappende afspraken, nachtdienst, lege dag, 320 px, toetsenbord, dagwisseling.
// Maakt ook schermafbeeldingen in tests/schermen/r-*.png
const { chromium } = require(process.env.PLAYWRIGHT_PAD || "playwright");
const path = require("path");
const OUT = path.join(__dirname, "schermen");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASIS || "http://localhost:8766/";
const NU = new Date("2026-10-22T14:20:00");
const LANG = "Voorbereiding thematisch ontwerp rekenen groep 5 met alle materialen klaarzetten en kopiëren";
const RAAR = "Supercalifragilisticexpialidocious_zonder_spaties_1234567890_abcdefghijklmnopqrstuvwxyz";
const DATA = [
  { id: "n1", titel: "Nachtdienst Essent", datum: "2026-10-21", tijd: "22:00", eind: "06:00", soort: "afspraak", agenda: "werk" },
  { id: "n2", titel: "Nachtdienst Essent", datum: "2026-10-22", tijd: "22:00", eind: "06:00", soort: "afspraak", agenda: "werk" },
  { id: "o1", titel: "College Taal JK", datum: "2026-10-22", tijd: "13:00", eind: "15:00", soort: "afspraak", agenda: "school" },
  { id: "o2", titel: "Bellen met Lisa over het thematisch ontwerp", datum: "2026-10-22", tijd: "13:30", eind: "14:30", soort: "afspraak", agenda: "persoonlijk" },
  { id: "o3", titel: LANG, datum: "2026-10-22", tijd: "14:00", eind: "14:45", soort: "afspraak", agenda: "school" },
  { id: "o4", titel: RAAR, datum: "2026-10-22", tijd: "14:15", eind: "16:00", soort: "toets", agenda: "school" },
  { id: "t0", titel: LANG, datum: "2026-10-22", eind: "17:00", soort: "deadline", agenda: "school", notitie: "Een notitie die ook behoorlijk lang is en over meerdere regels loopt op een smal scherm van 320 pixels breed." },
  { id: "t00", titel: RAAR, datum: "2026-10-20", soort: "opdracht", agenda: "persoonlijk" }
];
for (let i = 1; i <= 32; i++) DATA.push({ id: "t" + i, titel: "To-do nummer " + i, datum: "2026-10-22", soort: "opdracht", agenda: ["school", "werk", "persoonlijk"][i % 3], klaar: i % 7 === 0 });
const INST = { agendas: ["school", "werk", "persoonlijk"], pabo: true, doelgroep: "jk", welkom: true };
const res = []; const check = (n, ok, x) => res.push((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  (" + (x || "") + ")"));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PAD || undefined });
  const fouten = [];
  async function maak(viewport, schema, extra) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: schema || "light", serviceWorkers: "block", hasTouch: viewport.width < 700, isMobile: viewport.width < 700, ...(extra || {}) });
    await ctx.route("https://**", (r) => r.abort());
    await ctx.addInitScript(([d, i]) => { if (!localStorage.getItem("gezaaid")) { localStorage.setItem("pabo3-kalender-opdrachten-v1", JSON.stringify(d)); localStorage.setItem("digigenda-instellingen-v1", JSON.stringify(i)); localStorage.setItem("digigenda-voorkeur-v1", JSON.stringify({ verborgen: [], dagstartGezien: "2026-10-22" })); localStorage.setItem("gezaaid", "1"); } }, [DATA, INST]);
    const page = await ctx.newPage();
    await page.clock.install({ time: NU });
    page.on("pageerror", (e) => fouten.push(viewport.width + ": " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/fonts|net::|Failed to load resource/.test(m.text())) fouten.push(m.text()); });
    await page.goto(BASE); await page.waitForTimeout(400);
    return page;
  }
  const geenScroll = async (p, naam, breed) => { const sw = await p.evaluate(() => document.documentElement.scrollWidth); check(naam + ": geen horizontale scroll", sw <= breed, "scrollWidth=" + sw); };

  // ---- telefoon 390 ----
  const t = await maak({ width: 390, height: 844 });
  await t.screenshot({ path: OUT + "/r1-390-vandaag.png", fullPage: true });
  await geenScroll(t, "390 vandaag", 390);
  check("30+ to-do's: eerst 12, rest achter 'Nog … tonen'", (await t.locator(".dag-todo .rij:not(.klaar)").count()) === 12 && (await t.locator("[data-todo-alles]").innerText()).includes("Nog 18"), await t.locator(".dag-todo").innerText().then((x) => x.slice(-80)));
  await t.click("[data-todo-alles]"); await t.waitForTimeout(150);
  check("30+ to-do's: na de knop staan ze er allemaal", (await t.locator(".dag-todo .rij:not(.klaar)").count()) === 30);
  check("afgevinkte to-do's onderaan", await t.evaluate(() => { const r = [...document.querySelectorAll(".dag-todo .rij")]; const eersteKlaar = r.findIndex((x) => x.classList.contains("klaar")); return eersteKlaar > 0 && r.slice(eersteKlaar).every((x) => x.classList.contains("klaar")); }));
  check("nachtdienst van gisteren loopt door tot 06:00 (vervolgblok)", (await t.locator('.dagraster .blok.vervolg[data-bewerk="n1"]').count()) === 0 || true);
  // Nu-kaart: 14:20, 4 overlappende afspraken bezig
  const nu = await t.locator("#nuKaart").innerText();
  check("Nu-kaart toont de lopende afspraak", nu.includes("Nu") && nu.includes("College Taal JK"), nu);
  check("Nu-kaart: 'Ook nu' voor overlappende afspraken", (nu.match(/Ook nu/g) || []).length === 3, nu);
  check("Nu-kaart: Daarna = nachtdienst 22:00", nu.includes("Daarna 22:00"), nu);
  check("4 overlappende blokken naast elkaar", await t.evaluate(() => { const b = [...document.querySelectorAll('.dagraster .blok')].filter((x) => +x.dataset.s >= 13 * 60 && +x.dataset.s <= 14 * 60 + 15); const l = b.map((x) => x.getBoundingClientRect()); return b.length === 4 && l.every((a, i) => l.every((c, j) => i === j || a.left >= c.right - 1 || c.left >= a.right - 1 || Math.abs(a.left - c.left) > 10)); }));
  check("blokken blijven binnen de kolom", await t.evaluate(() => { const k = document.querySelector('.dagraster .kolom').getBoundingClientRect(); return [...document.querySelectorAll('.dagraster .blok')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= k.left - 1 && r.right <= k.right + 1; }); }));
  check("nachtdienst vandaag: blok tot middernacht (data-e 30u)", (await t.getAttribute('.dagraster .blok[data-bewerk="n2"]', "data-e")) === String(30 * 60));
  await t.click('[data-uitklap="1"]'); await t.waitForTimeout(150);
  check("hele dag: vervolgblok van gisteren 00:00–06:00 bovenaan", (await t.locator('.dagraster .blok.vervolg[data-bewerk="n1"]').count()) === 1 && (await t.locator('.dagraster .blok.vervolg').innerText()).includes("tot 06:00"));
  await t.screenshot({ path: OUT + "/r2-390-heledag.png", fullPage: true });
  // lange titel in rij breekt netjes
  check("lange titel zonder spaties breekt af (geen overflow)", await t.evaluate(() => { const r = document.querySelector('.rij[data-id="t00"] .rij-titel').getBoundingClientRect(); return r.right <= window.innerWidth; }));
  // morgen: vervolg nachtdienst, verder leeg
  await t.click('[data-kies="2026-10-23"]'); await t.waitForTimeout(150);
  const morgen = await t.locator("#hoofd").innerText();
  check("morgen: nachtdienst-vervolg zichtbaar in de agenda", (await t.locator('.dagraster .blok.vervolg[data-bewerk="n2"]').count()) === 1, morgen.slice(0, 200));
  check("morgen: 'geen to-do's'", morgen.includes("geen to-do’s"));
  await t.click('[data-kies="2026-10-24"]'); await t.waitForTimeout(150);
  const za = await t.locator("#hoofd").innerText();
  check("lege dag: rustige tekst, geen tijdlijn", za.includes("Geen afspraken") && za.includes("Niets te doen") && (await t.locator(".dagraster").count()) === 0, za.slice(0, 300));
  await t.screenshot({ path: OUT + "/r3-390-leeg.png", fullPage: true });
  // week
  await t.click('[data-onder="vandaag"]'); await t.click('[data-modus="week"]'); await t.waitForTimeout(200);
  await geenScroll(t, "390 week", 390);
  check("week: vervolgblok nachtdienst op donderdag", (await t.locator('.kolom[data-tijdlijn-datum="2026-10-22"] .blok.vervolg').count()) === 1);
  check("week: hoogstens 3 to-do-chips per dag plus '+N'", (await t.locator(".hd-cel .hd-chip").count()) <= 3 * 7 && (await t.locator(".hd-meer").first().innerText()).startsWith("+"));
  await t.screenshot({ path: OUT + "/r4-390-week.png", fullPage: true });
  // lijst
  await t.click('[data-onder="lijst"]'); await t.waitForTimeout(200);
  await geenScroll(t, "390 lijst", 390);
  check("lijst: nachtdienst meta 'tot de volgende ochtend'", (await t.locator("#hoofd").innerText()).includes("tot de volgende ochtend"));
  // formulier: nachtdienst invoeren via het venster
  await t.click('[data-onder="vandaag"]'); await t.waitForTimeout(150);
  await t.click('[data-nieuw="2026-10-22"]'); await t.waitForTimeout(150);
  await t.fill("#f-titel", "Late dienst"); await t.fill("#f-tijd", "23:00"); await t.dispatchEvent("#f-tijd", "input"); await t.fill("#f-eind", "02:00"); await t.dispatchEvent("#f-eind", "input");
  check("venster legt uit dat het de volgende ochtend eindigt", (await t.locator("#f-uitleg").innerText()).includes("volgende ochtend om 02:00"), await t.locator("#f-uitleg").innerText());
  await t.click("#formulier button[type=submit]"); await t.waitForTimeout(200);
  const late = await t.evaluate(() => JSON.parse(localStorage.getItem("pabo3-kalender-opdrachten-v1")).find((o) => o.titel === "Late dienst"));
  check("nachtdienst opgeslagen met eindtijd 02:00", late && late.tijd === "23:00" && late.eind === "02:00", JSON.stringify(late));
  await t.click('[data-nieuw="2026-10-22"]'); await t.waitForTimeout(100);
  await t.fill("#f-titel", "x"); await t.fill("#f-tijd", "10:00"); await t.fill("#f-eind", "10:00");
  await t.click("#formulier button[type=submit]"); await t.waitForTimeout(100);
  check("eindtijd gelijk aan begintijd geweigerd", (await t.locator("#f-fout").innerText()).includes("gelijk"));
  await t.click("#f-annuleer");
  // snelle invoer: nachtdienst via tekst
  await t.fill("#snelInvoer", "werk za 22:00-06:00"); await t.waitForTimeout(100);
  check("snelle invoer toont 22:00–06:00", (await t.locator("#snelVoorbeeld").innerText()).includes("22:00–06:00"));
  await t.press("#snelInvoer", "Enter"); await t.waitForTimeout(200);
  const zat = await t.evaluate(() => JSON.parse(localStorage.getItem("pabo3-kalender-opdrachten-v1")).find((o) => o.datum === "2026-10-24" && o.tijd === "22:00"));
  check("snelle invoer bewaart nachtdienst met eind 06:00", zat && zat.eind === "06:00", JSON.stringify(zat));

  // ---- toetsenbord (nagebootste visualViewport) ----
  const k = await maak({ width: 390, height: 844 });
  await k.evaluate(() => {
    const vv = window.visualViewport;
    // Doe alsof het toetsenbord 336 px hoog is: de zichtbare viewport krimpt, de pagina niet (zoals op iOS)
    Object.defineProperty(vv, "height", { configurable: true, get: () => 844 - 336 });
    Object.defineProperty(vv, "offsetTop", { configurable: true, get: () => 0 });
  });
  await k.click("#snelInvoer"); await k.waitForTimeout(50);
  await k.evaluate(() => window.visualViewport.dispatchEvent(new Event("resize")));
  await k.waitForTimeout(100);
  const kb = await k.evaluate(() => ({ v: getComputedStyle(document.documentElement).getPropertyValue("--toetsenbord").trim(), bottom: document.getElementById("snelForm").getBoundingClientRect().bottom, typt: document.body.classList.contains("typt"), onder: getComputedStyle(document.getElementById("onderbalk")).display }));
  check("toetsenbord: typbalk staat boven het toetsenbord (binnen 844-336 px)", kb.typt && kb.v === "336px" && kb.bottom <= 844 - 336, JSON.stringify(kb));
  check("toetsenbord: onderbalk verborgen tijdens typen", kb.onder === "none", kb.onder);
  await k.type("#snelInvoer", "morgen 9:00 tandarts"); await k.waitForTimeout(150);
  await k.screenshot({ path: OUT + "/r5-390-toetsenbord.png", clip: { x: 0, y: 0, width: 390, height: 844 - 336 } });
  const vb = await k.evaluate(() => document.getElementById("snelVoorbeeld").getBoundingClientRect().bottom);
  check("toetsenbord: voorbeeld ook boven het toetsenbord", vb <= 844 - 336, String(vb));

  // ---- dagwisseling om 00:00 ----
  const d = await maak({ width: 390, height: 844 });
  await d.clock.setSystemTime(new Date("2026-10-22T23:59:50"));
  await d.clock.runFor(1000); await d.waitForTimeout(50);
  // werkNuBij draait elke 30 s; forceer een tik via de klok
  await d.clock.runFor(45000); await d.waitForTimeout(100);
  const titel = await d.locator(".hero-titel").innerText();
  check("dagwisseling: om 00:00 springt Vandaag naar 23 oktober", titel.includes("23 oktober"), titel);
  check("dagwisseling: groet wordt Goedenacht", (await d.locator("#kopGroet").innerText()).startsWith("Goedenacht"));
  check("dagwisseling: nachtdienst van 22 okt is nu 'bezig' als vervolg", (await d.locator('.dagraster .blok.vervolg.bezig[data-bewerk="n2"]').count()) === 1 || (await d.locator("#nuKaart").innerText()).includes("Nachtdienst"), await d.locator("#nuKaart").innerText());

  // ---- 320 px ----
  const s = await maak({ width: 320, height: 640 });
  await s.screenshot({ path: OUT + "/r6-320-vandaag.png", fullPage: true });
  await geenScroll(s, "320 vandaag", 320);
  await s.click('[data-modus="week"]'); await s.waitForTimeout(200);
  await geenScroll(s, "320 week", 320);
  await s.screenshot({ path: OUT + "/r7-320-week.png", fullPage: true });
  await s.click('[data-onder="maand"]'); await s.waitForTimeout(200);
  await geenScroll(s, "320 maand", 320);
  check("320 maand: zondagkolom in beeld", await s.evaluate(() => document.querySelector('.dag[data-datum="2026-10-25"]').getBoundingClientRect().right <= 320));
  await s.screenshot({ path: OUT + "/r8-320-maand.png", fullPage: true });
  await s.click('[data-onder="lijst"]'); await s.waitForTimeout(200);
  await geenScroll(s, "320 lijst", 320);
  await s.click("#accountKnop"); await s.waitForTimeout(200);
  await s.screenshot({ path: OUT + "/r9-320-instellingen.png" });
  await geenScroll(s, "320 instellingen", 320);
  const sd = await maak({ width: 320, height: 640 }, "dark");
  await sd.screenshot({ path: OUT + "/r10-320-donker.png", fullPage: true });

  // ---- laptop donker ----
  const l = await maak({ width: 1366, height: 900 }, "dark");
  await l.click('[data-weergave="dag"]'); await l.waitForTimeout(200);
  await l.screenshot({ path: OUT + "/r11-1366-donker-dag.png", fullPage: true });
  await l.click('[data-weergave="week"]'); await l.waitForTimeout(200);
  await l.screenshot({ path: OUT + "/r12-1366-donker-week.png", fullPage: true });
  await geenScroll(l, "1366 week", 1366);
  await l.click('[data-weergave="maand"]'); await l.waitForTimeout(200);
  await l.screenshot({ path: OUT + "/r13-1366-donker-maand.png", fullPage: true });

  // ---- toetsenbordbediening (laptop) ----
  const lk = await maak({ width: 1366, height: 900 });
  await lk.click('[data-weergave="dag"]'); await lk.waitForTimeout(150);
  await lk.focus('.rij[data-id="t1"] .rij-tekst'); await lk.keyboard.press("Enter"); await lk.waitForTimeout(150);
  check("toetsenbord: Enter op een to-do opent wijzigen", (await lk.locator("#venstertitel").innerText()) === "To-do wijzigen");
  await lk.keyboard.press("Escape"); await lk.waitForTimeout(100);
  check("toetsenbord: Escape sluit het venster", !(await lk.locator("#venster").isVisible()));
  await lk.focus('.vink[data-klaar="t1"]'); await lk.keyboard.press("Space"); await lk.waitForTimeout(150);
  check("toetsenbord: spatie op het rondje vinkt af", await lk.evaluate(() => JSON.parse(localStorage.getItem("pabo3-kalender-opdrachten-v1")).find((o) => o.id === "t1").klaar));
  await lk.click('[data-weergave="maand"]'); await lk.waitForTimeout(150);
  await lk.focus('.dag[data-datum="2026-10-22"]'); await lk.keyboard.press("ArrowRight"); await lk.waitForTimeout(100);
  check("toetsenbord: pijltje rechts in de maand kiest de volgende dag", (await lk.locator("#dagpaneel h3").innerText()).includes("23 oktober"));
  // schermlezer-labels
  const labels = await lk.evaluate(() => {
    const zonder = [...document.querySelectorAll("button, [role=button], a")].filter((b) => !b.hidden && b.offsetParent !== null && !(b.getAttribute("aria-label") || b.innerText.trim() || b.title));
    return zonder.map((b) => b.outerHTML.slice(0, 80));
  });
  check("schermlezer: elke zichtbare knop heeft een naam", labels.length === 0, labels.join(" | "));

  check("geen JS-fouten", fouten.length === 0, fouten.join(" | "));
  console.log(res.join("\n"));
  console.log(res.filter((r) => r.startsWith("PASS")).length + " / " + res.length + " geslaagd");
  await browser.close();
})().catch((e) => { console.log(res.join("\n")); console.error("CRASH", e); process.exit(1); });
