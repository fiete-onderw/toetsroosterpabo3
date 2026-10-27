// Ronde 2: reeksen in de snelle invoer, dagritme, aftelling en 'Daarna', uiterlijk (thema, accent, agendakleur, startscherm), toets zonder datum.
const { chromium } = require(process.env.PLAYWRIGHT_PAD || "playwright");
const NU = new Date("2026-10-22T14:20:00");
const DATA = [
  { id: "a2", titel: "College Taal JK", datum: "2026-10-22", tijd: "13:30", eind: "15:00", soort: "afspraak", agenda: "school" },
  { id: "t2", titel: "Casus 3 oefenen", datum: "2026-10-22", eind: "17:00", soort: "deadline", agenda: "school" },
  { id: "d9", titel: "Portfolio inleveren", datum: "2026-11-05", soort: "deadline", agenda: "school" }
];
const INST = { agendas: ["school", "werk", "persoonlijk"], pabo: true, doelgroep: "jk", welkom: true };
let goed = 0, fout = 0;
const check = (naam, ok, extra) => { if (ok) { goed++; console.log("PASS " + naam); } else { fout++; console.log("FAIL " + naam + "  (" + (extra === undefined ? "" : JSON.stringify(extra)) + ")"); } };
const w = (p, ms) => p.waitForTimeout(ms);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PAD || undefined });
  const fouten = [];
  async function maak(viewport, extra) {
    const ctx = await browser.newContext(Object.assign({ viewport, serviceWorkers: "block" }, extra || {}));
    await ctx.route("https://srfigofpluibrrgcefuq.supabase.co/**", (r) => r.abort());
    await ctx.addInitScript(([d, i]) => { if (localStorage.getItem("gezaaid")) return; localStorage.setItem("pabo3-kalender-opdrachten-v1", JSON.stringify(d)); localStorage.setItem("digigenda-instellingen-v1", JSON.stringify(i)); localStorage.setItem("digigenda-voorkeur-v1", JSON.stringify({ dagstartGezien: "2026-10-22", openGezien: "2026-10-22" })); localStorage.setItem("gezaaid", "1"); }, [DATA, INST]);
    const p = await ctx.newPage();
    await p.emulateMedia({ reducedMotion: "reduce" });   // geen overgang van 1,5 s op de achtergrondkleur
    await p.clock.setFixedTime(NU);
    p.on("pageerror", (e) => fouten.push(e.message));
    await p.goto(process.env.BASIS || "http://localhost:8766/"); await w(p, 400);
    return p;
  }
  const data = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("pabo3-kalender-opdrachten-v1") || "[]"));
  const l = await maak({ width: 1366, height: 900 });

  // ---- reeksen ----
  await l.fill("#snelInvoer", "elke dinsdag 9:00-15:30 stage t/m 18 nov"); await w(l, 200);
  const vb = await l.locator("#snelVoorbeeld").innerText();
  check("voorbeeld: reeks-chip met einddatum en aantal", vb.includes("elke di") && vb.includes("17 nov") && vb.includes("4×"), vb);
  await l.keyboard.press("Enter"); await w(l, 300);
  const reeks = (await data(l)).filter((o) => o.titel === "stage");
  check("reeks: 4 items op dinsdagen, zelfde id-begin", reeks.length === 4 && reeks.every((o) => /^r[a-z0-9]+-\d{2}$/.test(o.id) && new Date(o.datum + "T12:00").getDay() === 2) && new Set(reeks.map((o) => o.id.split("-")[0])).size === 1, reeks.map((o) => o.id + " " + o.datum));
  await l.fill("#snelInvoer", "wekelijks lesvoorbereiding inleveren vrijdag tot 17:00"); await w(l, 150); await l.keyboard.press("Enter"); await w(l, 300);
  const lv = (await data(l)).filter((o) => o.titel === "lesvoorbereiding inleveren");
  check("reeks zonder einddatum: tot het einde van de periode (P1 t/m 8 nov → 3 vrijdagen), to-do met eindtijd", lv.length === 3 && lv.every((o) => !o.tijd && o.eind === "17:00"), lv.map((o) => o.datum));
  // standaardduur
  await l.fill("#snelInvoer", "college rekenen maandag 10:00"); await w(l, 150);
  check("standaardduur: college 1,5 uur, gemarkeerd als standaard", (await l.locator("#snelVoorbeeld").innerText()).includes("10:00–11:30 (standaard)"));
  await l.fill("#snelInvoer", ""); await w(l, 100);
  // deze en volgende verwijderen vanaf het tweede item
  await l.click('[data-weergave="dag"]'); await w(l, 150);
  await l.click('[data-kies="' + reeks[1].datum + '"]').catch(() => {});
  await l.evaluate((id) => document.querySelector('[data-bewerk="' + id + '"]') && document.querySelector('[data-bewerk="' + id + '"]').click(), reeks[1].id);
  await w(l, 200);
  if (!(await l.locator("#venster").isVisible())) { await l.click('[data-weergave="lijst"]'); await w(l, 150); await l.click('.rij[data-id="' + reeks[1].id + '"] .rij-tekst'); await w(l, 200); }
  check("venster: reeks-uitleg en knop 'Deze en volgende (3)'", await l.locator("#f-reeks-uitleg").isVisible() && (await l.locator("#f-verwijder-reeks").innerText()).includes("(3)"));
  await l.click("#f-verwijder-reeks"); await w(l, 100); await l.click("#f-verwijder-reeks"); await w(l, 300);
  const over = (await data(l)).filter((o) => o.titel === "stage");
  check("deze en volgende verwijderd: 1 item over (de eerste dinsdag)", over.length === 1 && over[0].datum === reeks[0].datum, over.map((o) => o.datum));

  // ---- aftelling en Daarna ----
  await l.click('[data-weergave="lijst"]'); await w(l, 200);
  const lijstTekst = await l.locator("#hoofd").innerText();
  check("lijst: periode-regel met weken en toetsen", /Periode 1 · nog \d+ weken/.test(lijstTekst), lijstTekst.slice(0, 120));
  check("lijst: 'Daarna' met Portfolio (over 14 dagen) en een Pabo-toets (LKT Taal)", lijstTekst.includes("Daarna") && lijstTekst.includes("Portfolio inleveren") && lijstTekst.includes("over 14 dagen") && lijstTekst.includes("LKT Taal"), lijstTekst.slice(lijstTekst.indexOf("Daarna"), lijstTekst.indexOf("Daarna") + 200));
  // week: werkuren
  await l.fill("#snelInvoer", "dienst za 10:00-16:00 #werk"); await w(l, 100); await l.keyboard.press("Enter"); await w(l, 300);
  await l.click('[data-weergave="week"]'); await w(l, 200);
  check("week: werkuren in het bijschrift", (await l.locator(".hero-sub").innerText()).includes("werk 6 u"), await l.locator(".hero-sub").innerText());
  check("week: Vandaag-knop altijd zichtbaar, stil in de huidige week", await l.locator('.hero-nav [data-nav="0"]').isVisible() && (await l.getAttribute('.hero-nav [data-nav="0"]', "aria-disabled")) === "true");

  // ---- dagritme ----
  await l.click('[data-weergave="dag"]'); await w(l, 150);
  if (await l.locator('[data-uitklap="1"]').count()) { await l.click('[data-uitklap="1"]'); await w(l, 150); }
  const gatenVoor = await l.locator(".dagraster .gat").allInnerTexts();
  await l.click("#instellingenKnop"); await w(l, 150);
  await l.selectOption("#ritme-pauze", "30"); await w(l, 150);
  await l.selectOption("#ritme-tot", "20"); await w(l, 150);
  await l.click("#inst-sluit"); await w(l, 150);
  if (await l.locator('[data-uitklap="1"]').count()) { await l.click('[data-uitklap="1"]'); await w(l, 150); }
  const gatenNa = await l.locator(".dagraster .gat").allInnerTexts();
  check("dagritme: pauze 30 min en dag tot 20:00 verschuiven het vrije blok", gatenVoor.some((g) => g.includes("15:00–22:00")) && gatenNa.some((g) => g.includes("15:30–20:00")), { gatenVoor, gatenNa });
  const inst1 = await l.evaluate(() => JSON.parse(localStorage.getItem("digigenda-instellingen-v1")));
  check("dagritme opgeslagen", inst1.ritme.pauze === 30 && inst1.ritme.tot === 20 && inst1.ritme.van === 8);

  // ---- uiterlijk ----
  await l.click("#instellingenKnop"); await w(l, 150);
  check("uiterlijk: thema, accent, kleur per agenda en startscherm", (await l.locator("#inst-uiterlijk").innerText()).toLowerCase().includes("thema") && (await l.locator("#inst-uiterlijk [data-accent]").count()) === 5 && (await l.locator('#inst-uiterlijk [data-agkleur="werk"]').count()) === 8 && (await l.locator("#inst-uiterlijk [data-start]").count()) === 5);
  await l.click('[data-thema-keuze="donker"]'); await w(l, 150);
  const bgDonker = await l.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check("thema donker gekozen: donkere achtergrond ondanks licht toestel", (await l.evaluate(() => document.documentElement.dataset.thema)) === "donker" && bgDonker === "rgb(20, 22, 28)", bgDonker);
  await l.click('[data-thema-keuze="licht"]'); await w(l, 150);
  check("thema licht: papier terug", (await l.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(245, 241, 236)");
  await l.click('[data-accent="groen"]'); await w(l, 150);
  check("accent groen: knoppen en vandaag volgen", (await l.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim())) === "#2f6b4f");
  await l.click('[data-agkleur="werk"][data-kleur="roest"]'); await w(l, 200);
  check("agendakleur werk = roest", (await l.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ag-werk").trim())) === "#a3472a");
  await l.click('[data-start="lijst"]'); await w(l, 150);
  const inst2 = await l.evaluate(() => JSON.parse(localStorage.getItem("digigenda-instellingen-v1")));
  check("uiterlijk opgeslagen (thema, accent, kleur, start)", inst2.uiterlijk.thema === "licht" && inst2.uiterlijk.accent === "groen" && inst2.uiterlijk.kleuren.werk === "roest" && inst2.uiterlijk.start === "lijst");
  await l.click("#inst-sluit"); await l.reload(); await w(l, 400);
  check("na herladen: opent op Lijst met gekozen accent", (await l.getAttribute('[data-weergave="lijst"]', "aria-selected")) === "true" && (await l.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim())) === "#2f6b4f");
  // toets zonder datum
  await l.click('[data-weergave="maand"]'); await w(l, 150);
  await l.click("#zonderDatumPaneel summary"); await w(l, 100);
  const nZonder = await l.locator("[data-toets-datum]").count();
  await l.locator("[data-toets-datum]").first().click(); await w(l, 150);
  const titelToets = await l.inputValue("#f-titel");
  check("toets zonder datum: venster vooringevuld als toets", await l.locator("#venster").isVisible() && titelToets.length > 3 && (await l.inputValue("#f-soort")) === "toets", titelToets);
  await l.fill("#f-datum", "2027-01-12"); await l.click('#formulier button[type="submit"]'); await w(l, 300);
  check("toets met datum opgeslagen en uit de lijst 'zonder datum' verdwenen", (await data(l)).some((o) => o.titel === titelToets && o.soort === "toets" && o.datum === "2027-01-12") && (await l.locator("[data-toets-datum]").count()) === nZonder - 1);

  // ---- telefoon: Nu-kaart 'vanavond vrij', Dag-tab, filters ----
  const t = await maak({ width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  await t.evaluate(() => { localStorage.setItem("pabo3-kalender-opdrachten-v1", "[]"); }); await t.clock.setFixedTime(new Date("2026-10-22T15:30:00")); await t.reload(); await w(t, 400);
  check("telefoon: Nu-kaart zegt 'Vanavond vrij' zonder afspraken na 15:00", (await t.locator("#nuKaart").innerText()).includes("Vanavond vrij"));
  check("telefoon: filters op het dagscherm", (await t.locator(".weergave-balk .filter").count()) === 3);
  check("geen JS-fouten", fouten.length === 0, fouten.join(" | "));
  console.log(goed + " / " + (goed + fout) + " geslaagd");
  await browser.close();
  process.exit(fout ? 1 : 0);
})();
