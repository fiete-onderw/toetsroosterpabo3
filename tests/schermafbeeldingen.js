const { chromium } = require(process.env.PLAYWRIGHT_PAD || "playwright");
const OUT = require("path").join(__dirname, "schermen");
require("fs").mkdirSync(OUT, { recursive: true });
const NU = new Date("2026-10-22T14:20:00");
const DATA = [
  { id: "a1", titel: "Stage-overleg met mentor", datum: "2026-10-22", tijd: "09:00", eind: "10:30", soort: "afspraak", agenda: "school" },
  { id: "a2", titel: "College Taal JK", datum: "2026-10-22", tijd: "13:30", eind: "15:00", soort: "afspraak", agenda: "school" },
  { id: "a3", titel: "Bellen met Lisa", datum: "2026-10-22", tijd: "14:00", eind: "14:30", soort: "afspraak", agenda: "persoonlijk" },
  { id: "a4", titel: "Dienst Essent", datum: "2026-10-22", tijd: "18:00", eind: "21:30", soort: "afspraak", agenda: "werk" },
  { id: "a5", titel: "Tandarts", datum: "2026-10-23", tijd: "08:30", eind: "09:00", soort: "afspraak", agenda: "persoonlijk" },
  { id: "a6", titel: "Werkcollege rekenen", datum: "2026-10-20", tijd: "10:00", eind: "12:00", soort: "afspraak", agenda: "school" },
  { id: "a7", titel: "Dienst", datum: "2026-10-24", tijd: "10:00", eind: "16:00", soort: "afspraak", agenda: "werk" },
  { id: "a8", titel: "Verjaardag oma", datum: "2026-10-25", tijd: "15:00", eind: "18:00", soort: "afspraak", agenda: "persoonlijk" },
  { id: "a9", titel: "Toets oefenen", datum: "2026-10-21", tijd: "19:00", soort: "toets", agenda: "school" },
  { id: "t1", titel: "Lezen RT 6.2.2", datum: "2026-10-22", soort: "opdracht", agenda: "school" },
  { id: "t2", titel: "Casus 3 oefenen (Mees)", datum: "2026-10-22", eind: "17:00", soort: "deadline", agenda: "school" },
  { id: "t3", titel: "Boodschappen", datum: "2026-10-22", soort: "opdracht", agenda: "persoonlijk", klaar: true },
  { id: "t4", titel: "Samenvatting H4", datum: "2026-10-20", soort: "opdracht", agenda: "school" },
  { id: "t5", titel: "Begrippenkaart maken", datum: "2026-10-23", soort: "opdracht", agenda: "school" }
];
const INST = { agendas: ["school", "werk", "persoonlijk"], pabo: true, doelgroep: "jk", welkom: true };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PAD || undefined });
  const fouten = [];
  async function maak(viewport, schema) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: schema || "light", serviceWorkers: "block", hasTouch: viewport.width < 700, isMobile: viewport.width < 700 });
    await ctx.route("https://srfigofpluibrrgcefuq.supabase.co/**", (r) => r.abort());
    await ctx.route("https://fonts.**", (r) => r.abort());
    await ctx.addInitScript(([d, i]) => { if (!localStorage.getItem("gezaaid")) { localStorage.setItem("pabo3-kalender-opdrachten-v1", JSON.stringify(d)); localStorage.setItem("digigenda-instellingen-v1", JSON.stringify(i)); localStorage.setItem("gezaaid", "1"); } }, [DATA, INST]);
    const page = await ctx.newPage();
    await page.clock.setFixedTime(NU);
    page.on("pageerror", (e) => fouten.push(viewport.width + ": " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/fonts|net::|Failed to load resource/.test(m.text())) fouten.push(m.text()); });
    await page.goto((process.env.BASIS || "http://localhost:8766/")); await page.waitForTimeout(400);
    return page;
  }
  const tel = await maak({ width: 390, height: 844 });
  await tel.screenshot({ path: OUT + "/t1-vandaag.png", fullPage: true });
  await tel.click('[data-modus="week"]'); await tel.waitForTimeout(200);
  await tel.screenshot({ path: OUT + "/t2-week.png", fullPage: true });
  await tel.click('[data-weekend="1"]'); await tel.waitForTimeout(200);
  await tel.screenshot({ path: OUT + "/t3-weekend.png", fullPage: true });
  await tel.click('[data-onder="maand"]'); await tel.waitForTimeout(200);
  await tel.screenshot({ path: OUT + "/t4-maand.png", fullPage: true });
  await tel.click('.dag[data-datum="2026-10-23"]'); await tel.waitForTimeout(200);
  await tel.screenshot({ path: OUT + "/t5-dag-na-maandklik.png", fullPage: true });
  await tel.click('[data-onder="lijst"]'); await tel.waitForTimeout(200);
  await tel.screenshot({ path: OUT + "/t6-lijst.png", fullPage: true });
  await tel.click('[data-onder="vandaag"]'); await tel.waitForTimeout(200);
  await tel.click('.uurvak[data-slot="2026-10-22|16:00"]'); await tel.waitForTimeout(200);
  await tel.screenshot({ path: OUT + "/t7-nieuw-uit-uur.png" });
  await tel.click("#f-annuleer"); await tel.waitForTimeout(100);
  await tel.screenshot({ path: OUT + "/t8-scherm.png" });
  await tel.click("#snelInvoer"); await tel.type("#snelInvoer", "morgen 14:00-15:30 overleg stage"); await tel.waitForTimeout(200);
  await tel.screenshot({ path: OUT + "/t9-typen.png" });
  await tel.fill("#snelInvoer", ""); await tel.evaluate(() => document.activeElement.blur()); await tel.waitForTimeout(250);
  const lap = await maak({ width: 1366, height: 900 });
  await lap.screenshot({ path: OUT + "/l1-maand.png", fullPage: true });
  await lap.click('[data-weergave="dag"]'); await lap.waitForTimeout(200);
  await lap.screenshot({ path: OUT + "/l2-dag.png", fullPage: true });
  await lap.click('[data-weergave="week"]'); await lap.waitForTimeout(200);
  await lap.screenshot({ path: OUT + "/l3-week.png", fullPage: true });
  const donker = await maak({ width: 390, height: 844 }, "dark");
  await donker.screenshot({ path: OUT + "/d1-vandaag.png", fullPage: true });
  console.log("fouten:", fouten.length ? fouten : "geen");
  await browser.close();
})();
