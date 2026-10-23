const { chromium } = require(process.env.PLAYWRIGHT_PAD || "playwright");
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PAD || undefined });
  const ctx = await b.newContext({ serviceWorkers: "block" });
  await ctx.route("https://**", (r) => r.abort());
  const kwaad = '<img src=x onerror="window.__xss=1">"><script>window.__xss=2</script>\' onmouseover=window.__xss=3';
  await ctx.addInitScript((k) => {
    localStorage.setItem("digigenda-instellingen-v1", JSON.stringify({ agendas: ["school", "werk"], pabo: true, welkom: true }));
    localStorage.setItem("pabo3-kalender-opdrachten-v1", JSON.stringify([
      { id: '"><img src=x onerror=window.__xss=4>', titel: k, datum: "2026-10-22", tijd: '"><b>', soort: "<x>", agenda: "\"><x>", notitie: k, klaar: false },
      { id: '"><img src=x onerror=window.__xss=6>', titel: k, datum: "2026-10-22", tijd: "09:00", eind: "10:00", soort: "afspraak", agenda: "werk", notitie: k, klaar: false },
      { id: "z", titel: k, datum: "2026-10-24", tijd: "11:00", eind: "12:00", soort: "afspraak", agenda: "werk", notitie: "", klaar: false },
      { id: "b", titel: "ok", datum: "2026-10-22\"><img src=x onerror=window.__xss=5>", soort: "opdracht", agenda: "school", notitie: "", klaar: false }
    ]));
  }, kwaad);
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date("2026-10-22T10:00:00"));
  await p.goto((process.env.BASIS || "http://localhost:8766/")); await p.waitForTimeout(300);
  for (const w of ["week", "dag", "lijst", "maand"]) { await p.click('[data-weergave="' + w + '"]'); await p.waitForTimeout(150); }
  await p.click('[data-weergave="dag"]'); await p.waitForTimeout(100);
  await p.click('[data-uitklap="1"]'); await p.waitForTimeout(100);
  await p.click(".dagraster .blok"); await p.waitForTimeout(100); console.log("venster na blok:", await p.locator("#venster").isVisible(), await p.locator("#venstertitel").innerText()); await p.click("#f-annuleer"); await p.waitForTimeout(100); console.log("venster na annuleer:", await p.locator("#venster").isVisible());
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(100);
  console.log("na resize:", await p.locator("#venster").isVisible(), await p.evaluate(() => [getComputedStyle(document.querySelector('.weergave-balk')).display, document.body.dataset.weergave, innerWidth, matchMedia('(max-width: 640px)').matches, document.querySelector('[data-weergave=dag]').getBoundingClientRect().top]));
  await p.click('[data-weergave="dag"]', { timeout: 2000 }).then(() => console.log('tab geklikt')).catch((e) => console.log('tabfout', e.message.split('\n').slice(0,12).join(' / ')));
  console.log("na tab:", await p.locator("#venster").isVisible(), await p.locator("#venstertitel").innerText());
  await p.click('[data-onder="vandaag"]'); await p.waitForTimeout(100);
  await p.click('[data-modus="week"]'); await p.waitForTimeout(100);
  await p.click('[data-weekend="1"]'); await p.waitForTimeout(100);
  await p.fill("#snelInvoer", kwaad + " morgen"); await p.waitForTimeout(150);
  await p.hover(".dag.vandaag").catch(() => {});
  const r = await p.evaluate(() => ({ xss: window.__xss || 0, imgs: document.querySelectorAll("img[src=x]").length, titelAlsTekst: document.body.innerText.includes("<img src=x"), blokken: document.querySelectorAll(".blok").length }));
  console.log(JSON.stringify(r));
  await b.close();
})();
