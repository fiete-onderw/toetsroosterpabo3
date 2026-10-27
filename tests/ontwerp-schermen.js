const { chromium } = require(process.env.PLAYWRIGHT_PAD || "playwright");
const path = require("path");
const OUT = process.env.OUT || path.join(__dirname, "schermen");   // in docs/schermen staat een vaste keuze uit deze set
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
    await ctx.addInitScript(([d, i]) => { if (!localStorage.getItem("gezaaid")) { localStorage.setItem("pabo3-kalender-opdrachten-v1", JSON.stringify(d)); localStorage.setItem("digigenda-instellingen-v1", JSON.stringify(i)); localStorage.setItem("digigenda-voorkeur-v1", JSON.stringify({ dagstartGezien: "2026-10-22", openGezien: "2026-10-22" })); localStorage.setItem("gezaaid", "1"); } }, [DATA, INST]);
    const page = await ctx.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });   // vaste klok bevriest CSS-animaties; schermen tonen de eindstand
    await page.clock.setFixedTime(NU);
    page.on("pageerror", (e) => fouten.push(viewport.width + ": " + e.message));
    await page.goto(process.env.BASIS || "http://127.0.0.1:8766/"); await page.waitForTimeout(600);
    return page;
  }
  const scroll = async (p, naam) => { const w = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); if (w[0] > w[1]) fouten.push(naam + ": horizontale overflow " + w[0] + ">" + w[1]); };
  async function reeks(naam, vp, schema, laptop) {
    const p = await maak(vp, schema);
    const shot = async (n, full) => { await p.waitForTimeout(250); await p.screenshot({ path: `${OUT}/${naam}-${n}.png`, fullPage: full !== false }); await scroll(p, naam + "-" + n); };
    await shot("vandaag");
    if (laptop) { await p.click('[data-weergave="week"]'); } else { await p.click('[data-onder="week"]'); }
    await shot("week");
    if (laptop) await p.click('[data-weergave="maand"]'); else await p.click('[data-onder="maand"]');
    await shot("maand");
    if (laptop) await p.click('[data-weergave="lijst"]'); else await p.click('[data-onder="lijst"]');
    await shot("lijst");
    if (laptop) {
      await p.click('[data-weergave="dag"]'); await shot("dag"); await p.click('.uurvak[data-slot="2026-10-22|16:00"]'); await shot("nieuw", false); await p.click("#f-annuleer");
      await p.click("#instellingenKnop"); await shot("instellingen", false); await p.click("#inst-sluit");
    } else {
      await p.click('[data-onder="dag"]'); await p.click("#snelInvoer"); await p.type("#snelInvoer", "morgen 14:00-15:30 overleg stage"); await shot("typen", false);
    }
    await p.context().close();
  }
  await reeks("t390", { width: 390, height: 844 });
  await reeks("t360", { width: 360, height: 740 });
  await reeks("d390", { width: 390, height: 844 }, "dark");
  await reeks("m768", { width: 768, height: 1024 }, "light", true);
  await reeks("l1440", { width: 1440, height: 900 }, "light", true);
  await reeks("dl1440", { width: 1440, height: 900 }, "dark", true);
  console.log("fouten:", fouten.length ? fouten : "geen");
  await browser.close();
})();
