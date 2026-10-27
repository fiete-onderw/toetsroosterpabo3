// Echte doorloop van de app op een nagebootste iPhone (Chromium, aanraakbediening) en op een laptop:
// eerste keer openen, agenda's kiezen, typen en toevoegen, afvinken, vegen, weergaven wisselen, uiterlijk aanpassen, reeks toevoegen en verwijderen.
// Schrijft schermafbeeldingen naar OUT en meldt JS-fouten en horizontale overflow. Geen nagebootste klok: dit is de echte 'nu'.
const { chromium, devices } = require(process.env.PLAYWRIGHT_PAD || "playwright");
const path = require("path");
const OUT = process.env.OUT || path.join(__dirname, "schermen", "doorloop");
require("fs").mkdirSync(OUT, { recursive: true });
const BASIS = process.env.BASIS || "http://127.0.0.1:8766/";
const stappen = []; const fouten = [];
const stap = (t) => { stappen.push(t); console.log("• " + t); };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PAD || undefined });
  // ---- iPhone ----
  const iphone = devices["iPhone 14"];
  const ctx = await browser.newContext(Object.assign({}, iphone, { serviceWorkers: "block", locale: "nl-NL", timezoneId: "Europe/Amsterdam" }));
  await ctx.route("https://srfigofpluibrrgcefuq.supabase.co/**", (r) => r.abort());
  const p = await ctx.newPage();
  p.on("pageerror", (e) => fouten.push("iPhone: " + e.message));
  const overflow = async (naam) => { const [sw, cw] = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); if (sw > cw) fouten.push("iPhone " + naam + ": horizontale overflow " + sw + ">" + cw); };
  const foto = async (n) => { await p.waitForTimeout(250); await p.screenshot({ path: path.join(OUT, "iphone-" + n + ".png") }); await overflow(n); };
  await p.goto(BASIS); await p.waitForTimeout(500);
  stap("iPhone: eerste keer openen → startscherm met agendakeuze"); await foto("01-start");
  await p.tap('#welkom-agendas input[value="werk"]'); await p.tap("#welkom-verder"); await p.waitForTimeout(200);
  await p.tap("#welkom-zonder"); await p.waitForTimeout(300);
  stap("iPhone: agenda's School en Werk gekozen, zonder account verder → Vandaag"); await foto("02-vandaag-leeg");
  await p.tap("#snelInvoer"); await p.keyboard.type("morgen 10:00 werkcollege rekenen"); await p.waitForTimeout(300);
  stap("iPhone: typen in de typbalk, voorbeeld toont dag, tijd en standaardduur"); await foto("03-typen");
  await p.keyboard.press("Enter"); await p.waitForTimeout(400);
  await p.tap("#snelInvoer"); await p.keyboard.type("elke vrijdag lesvoorbereiding inleveren tot 17:00"); await p.keyboard.press("Enter"); await p.waitForTimeout(400);
  await p.tap("#snelInvoer"); await p.keyboard.type("boodschappen vandaag"); await p.keyboard.press("Enter"); await p.waitForTimeout(400);
  await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(300);
  stap("iPhone: drie items toegevoegd (afspraak morgen, wekelijkse reeks, to-do vandaag)"); await foto("04-vandaag-items");
  const vinkje = p.locator('.rij .vink').first();
  if (await vinkje.count()) { await vinkje.tap(); await p.waitForTimeout(300); stap("iPhone: to-do afgevinkt met één tik"); await foto("05-afgevinkt"); await vinkje.tap(); await p.waitForTimeout(200); }
  await p.tap('[data-onder="week"]'); await p.waitForTimeout(300);
  stap("iPhone: Week-tab → zeven dagen onder elkaar"); await foto("06-week");
  await p.tap(".weeklijst .wl-dag:nth-child(2) .wl-kop"); await p.waitForTimeout(300);
  stap("iPhone: dagkop in de week tikken opent die dag"); await foto("07-dag-uit-week");
  await p.tap('[data-onder="maand"]'); await p.waitForTimeout(300);
  stap("iPhone: Maand-tab"); await foto("08-maand");
  await p.tap('[data-onder="lijst"]'); await p.waitForTimeout(300);
  stap("iPhone: Lijst-tab met Daarna"); await foto("09-lijst");
  await p.tap("#accountKnop"); await p.waitForTimeout(300);
  await p.locator('[data-thema-keuze="donker"]').scrollIntoViewIfNeeded(); await p.tap('[data-thema-keuze="donker"]'); await p.waitForTimeout(300);
  await p.tap('[data-accent="pruim"]'); await p.waitForTimeout(200);
  await p.tap('[data-agkleur="werk"][data-kleur="oker"]'); await p.waitForTimeout(200);
  await p.tap('[data-start="week"]'); await p.waitForTimeout(200);
  stap("iPhone: Instellingen → Uiterlijk: donker, accent pruim, werk oker, opent op Week"); await foto("10-uiterlijk");
  await p.locator("#ritme-pauze").scrollIntoViewIfNeeded(); await p.selectOption("#ritme-pauze", "15"); await p.waitForTimeout(200);
  await p.tap("#inst-sluit"); await p.waitForTimeout(300);
  await p.reload(); await p.waitForTimeout(600);
  const weergave = await p.evaluate(() => document.body.dataset.scherm);
  const thema = await p.evaluate(() => document.documentElement.dataset.thema);
  stap("iPhone: herladen → opent op " + weergave + ", thema " + thema); await foto("11-herladen-donker");
  if (weergave !== "week" || thema !== "donker") fouten.push("iPhone: voorkeuren niet bewaard (" + weergave + ", " + thema + ")");
  // reeks verwijderen vanaf de tweede vrijdag
  const reeksItems = await p.evaluate(() => JSON.parse(localStorage.getItem("pabo3-kalender-opdrachten-v1")).filter((o) => /^r[a-z0-9]+-\d{2}$/.test(o.id)).map((o) => o.id));
  if (reeksItems.length > 1) {
    await p.tap('[data-onder="lijst"]'); await p.waitForTimeout(300);
    const rij = p.locator('.rij[data-id="' + reeksItems[0] + '"] .rij-tekst');   // vanaf de eerste: dan zijn er nog 'volgende'
    if (await rij.count()) { await rij.scrollIntoViewIfNeeded(); await rij.tap(); await p.waitForTimeout(300); }
    if (await p.locator("#f-verwijder-reeks").isVisible()) {
      stap("iPhone: item uit de reeks openen → uitleg en 'Deze en volgende verwijderen'"); await foto("12-reeks-venster");
      await p.tap("#f-verwijder-reeks"); await p.tap("#f-verwijder-reeks"); await p.waitForTimeout(400);
      const over = await p.evaluate(() => JSON.parse(localStorage.getItem("pabo3-kalender-opdrachten-v1")).filter((o) => /^r[a-z0-9]+-\d{2}$/.test(o.id)).length);
      stap("iPhone: hele reeks (deze en volgende) verwijderd, over: " + over);
      if (over !== 0) fouten.push("iPhone: reeks verwijderen: verwacht 0 over, kreeg " + over);
    } else fouten.push("iPhone: reeksknop niet zichtbaar");
  } else fouten.push("iPhone: reeks niet aangemaakt (" + reeksItems.length + ")");
  await ctx.close();

  // ---- laptop ----
  const lctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", locale: "nl-NL", timezoneId: "Europe/Amsterdam" });
  await lctx.route("https://srfigofpluibrrgcefuq.supabase.co/**", (r) => r.abort());
  const l = await lctx.newPage(); l.on("pageerror", (e) => fouten.push("laptop: " + e.message));
  await l.goto(BASIS); await l.waitForTimeout(500);
  await l.click("#welkom-verder"); await l.click("#welkom-zonder"); await l.waitForTimeout(300);
  await l.fill("#snelInvoer", "college taal maandag 10:00\nelke dinsdag 9:00-15:30 stage t/m eind van de periode\ntoets rekenen over 2 weken"); await l.waitForTimeout(300);
  await l.screenshot({ path: path.join(OUT, "laptop-01-voorbeeld-3-regels.png") });
  stap("laptop: drie regels tegelijk, voorbeeld toont elke regel");
  await l.keyboard.press("Enter"); await l.waitForTimeout(400);
  await l.click('[data-weergave="week"]'); await l.waitForTimeout(300); await l.screenshot({ path: path.join(OUT, "laptop-02-week.png"), fullPage: true });
  await l.click('[data-weergave="dag"]'); await l.waitForTimeout(300);
  const uur = l.locator(".uurvak").nth(3); if (await uur.count()) { await uur.click(); await l.waitForTimeout(300); await l.screenshot({ path: path.join(OUT, "laptop-03-nieuw-uit-uur.png") }); await l.click("#f-annuleer"); }
  stap("laptop: klik op een uur in de tijdlijn opent Toevoegen met die tijd");
  await l.click("#instellingenKnop"); await l.waitForTimeout(300); await l.click('[data-thema-keuze="licht"]'); await l.click('[data-accent="roest"]'); await l.waitForTimeout(300);
  await l.screenshot({ path: path.join(OUT, "laptop-04-uiterlijk.png") }); await l.click("#inst-sluit");
  stap("laptop: thema licht geforceerd, accent roest");
  await lctx.close();
  await browser.close();
  console.log("\nStappen: " + stappen.length + "\nFouten: " + (fouten.length ? "\n- " + fouten.join("\n- ") : "geen"));
  process.exit(fouten.length ? 1 : 0);
})();
