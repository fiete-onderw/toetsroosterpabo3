const { chromium } = require(process.env.PLAYWRIGHT_PAD || "playwright");
const DATA = [
  { id: "t1", titel: "Lezen RT 6.2.2", datum: "2026-10-22", soort: "opdracht", agenda: "school" },
  { id: "t2", titel: "Samenvatting H4", datum: "2026-10-22", soort: "opdracht", agenda: "school" },
  { id: "a1", titel: "College", datum: "2026-10-22", tijd: "13:30", eind: "15:00", soort: "afspraak", agenda: "school" }
];
const res = []; const check = (n, ok, x) => res.push((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  " + (x || "")));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PAD || undefined });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await ctx.route("https://**", (r) => r.abort());
  await ctx.addInitScript((d) => { if (!localStorage.getItem("z")) { localStorage.setItem("pabo3-kalender-opdrachten-v1", JSON.stringify(d)); localStorage.setItem("digigenda-instellingen-v1", JSON.stringify({ agendas: ["school"], pabo: false, welkom: true })); localStorage.setItem("z", "1"); } }, DATA);
  const p = await ctx.newPage();
  const fouten = []; p.on("pageerror", (e) => fouten.push(e.message));
  await p.clock.setFixedTime(new Date("2026-10-22T14:20:00"));
  await p.goto((process.env.BASIS || "http://localhost:8766/")); await p.waitForTimeout(400);
  const aanraak = (sel, stappen, wacht) => p.evaluate(async ([sel, stappen, wacht]) => {
    const el = document.querySelector(sel); const r = el.getBoundingClientRect();
    const maak = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    const x0 = r.left + r.width * 0.6, y0 = r.top + r.height / 2;
    el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [maak(x0, y0)], changedTouches: [maak(x0, y0)] }));
    if (wacht) await new Promise((k) => setTimeout(k, wacht));
    let x = x0;
    for (const dx of stappen) { x = x0 + dx; el.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [maak(x, y0)], changedTouches: [maak(x, y0)] })); }
    el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], changedTouches: [maak(x, y0)] }));
  }, [sel, stappen, wacht]);
  const data = () => p.evaluate(() => JSON.parse(localStorage.getItem("pabo3-kalender-opdrachten-v1")));
  // 1. vegen naar links -> naar morgen
  await aanraak('.rij[data-id="t1"]', [-20, -50, -90, -120], 0);
  await p.waitForTimeout(500);
  check("vegen naar links schuift naar morgen", (await data()).find((o) => o.id === "t1").datum === "2026-10-23");
  check("toast met ongedaan maken", (await p.locator("#toast").innerText()).includes("Verplaatst"));
  check("na vegen geen wijzigvenster", !(await p.locator("#venster").isVisible()));
  // 2. kort vegen -> niets
  await aanraak('.rij[data-id="t2"]', [-20, -40], 0);
  await p.waitForTimeout(400);
  check("kort vegen doet niets", (await data()).find((o) => o.id === "t2").datum === "2026-10-22");
  // 3. lang indrukken -> menu -> afvinken
  await aanraak('.rij[data-id="t2"]', [], 700);
  await p.waitForTimeout(150);
  check("lang indrukken opent menu", await p.locator("#rijMenu").isVisible() && (await p.locator("#rijMenuTitel").innerText()) === "Samenvatting H4");
  await p.click('#rijMenu [data-menu="klaar"]'); await p.waitForTimeout(200);
  check("menu: afvinken", (await data()).find((o) => o.id === "t2").klaar === true && !(await p.locator("#rijMenu").isVisible()));
  // 4. gewone tik op tekst = wijzigen
  await p.tap('.rij[data-id="t2"] .rij-tekst'); await p.waitForTimeout(200);
  check("tik op tekst opent wijzigen", (await p.locator("#venstertitel").innerText()) === "To-do wijzigen");
  await p.click("#f-annuleer");
  // 5. vegen op de weekstrook -> volgende week
  await aanraak(".weekstrip", [-30, -80, -120], 0); await p.waitForTimeout(200);
  check("vegen op weekstrook = volgende week", (await p.locator(".hero-titel").innerText()).includes("29 oktober"));
  // 6. blok (afspraak) niet veegbaar
  check("afspraak heeft geen veegactie", (await p.locator('.rij.veegbaar[data-id="a1"]').count()) === 0);
  check("geen JS-fouten", fouten.length === 0, fouten.join(" | "));
  console.log(res.join("\n"));
  await b.close();
})();
