// Fase 5: Face ID na X minuten, melding/link opent het juiste item, shortcuts, share-target (POST via service worker), cache-first
const { chromium } = require(process.env.PLAYWRIGHT_PAD || "playwright");
const path = require("path"), fs = require("fs");
const BASE = process.env.BASIS || "http://localhost:8766/";
const NU = new Date("2026-10-22T10:00:00");
const DATA = [
  { id: "t1", titel: "Lezen RT 6.2.2", datum: "2026-10-22", soort: "opdracht", agenda: "school" },
  { id: "a1", titel: "Tandarts", datum: "2026-10-28", tijd: "08:30", eind: "09:00", soort: "afspraak", agenda: "persoonlijk" }
];
const res = []; const check = (n, ok, x) => res.push((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  (" + (typeof x === "string" ? x : JSON.stringify(x)) + ")"));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PAD || undefined });
  const fouten = [];
  async function maak(opties) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" }, opties || {}));
    await ctx.route("https://**", (r) => r.abort());
    await ctx.addInitScript((d) => { if (!localStorage.getItem("z")) { localStorage.setItem("pabo3-kalender-opdrachten-v1", JSON.stringify(d)); localStorage.setItem("digigenda-instellingen-v1", JSON.stringify({ agendas: ["school", "persoonlijk"], pabo: false, welkom: true })); localStorage.setItem("z", "1"); } }, DATA);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => fouten.push(e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/fonts|net::|Failed to load resource/.test(m.text())) fouten.push(m.text()); });
    return { ctx, p };
  }
  const w = (p, ms) => p.waitForTimeout(ms);

  // ---- 1. link / melding opent het juiste item ----
  const { p } = await maak();
  await p.clock.setFixedTime(NU);
  await p.goto(BASE + "?item=a1&datum=2026-10-28"); await w(p, 400);
  check("?item= opent de dag én het venster van die afspraak", (await p.locator(".hero-titel").innerText()).includes("Woensdag 28 oktober") && await p.locator("#venster").isVisible() && (await p.inputValue("#f-titel")) === "Tandarts" && (await p.evaluate(() => location.search)) === "");
  await p.click("#f-annuleer");
  await p.goto(BASE + "?item=bestaatniet&datum=2026-10-28"); await w(p, 400);
  check("?item= van een verwijderd item: dag open, nette toast", (await p.locator("#toast").innerText()).includes("niet (meer)") && !(await p.locator("#venster").isVisible()));
  await p.goto(BASE + "?nieuw=1"); await w(p, 400);
  check("shortcut ?nieuw=1 zet de cursor in de snelle invoer", await p.evaluate(() => document.activeElement && document.activeElement.id === "snelInvoer"));
  await p.goto(BASE + "?scherm=vandaag"); await w(p, 300);
  check("shortcut ?scherm=vandaag opent vandaag", (await p.locator(".hero-titel").innerText()).includes("22 oktober"));
  // bericht van de service worker (tik op een melding terwijl de app open is)
  await p.evaluate(() => { window.__sw = { addEventListener(t, f) { if (t === "message") window.__swMsg = f; } }; });
  // (de echte listener zit op navigator.serviceWorker; die is hier geblokkeerd, dus testen we via de URL-route hierboven)
  const manifest = await (await p.request.get(BASE + "manifest.webmanifest")).json();
  check("manifest: shortcut 'Nieuw item' en share_target met tekst én .ics-bestand", manifest.shortcuts.some((s) => s.name === "Nieuw item" && s.url.includes("nieuw=1")) && manifest.share_target.method === "POST" && manifest.share_target.params.files[0].accept.includes(".ics"));

  // ---- 2. Face ID na X minuten ----
  const S = { users: {}, sessies: {}, data: {}, inst: {} };
  const { ctx: c2, p: q } = await maak({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });
  await c2.unroute("https://**");
  await c2.route("https://srfigofpluibrrgcefuq.supabase.co/**", (route) => {
    const fn = route.request().url().split("/rpc/")[1]; const b = JSON.parse(route.request().postData() || "{}");
    let r = { ok: false };
    if (fn === "kal_registreer") { S.users[b.p_naam] = b.p_pin; S.sessies["tok"] = b.p_naam; r = { ok: true, naam: b.p_naam, token: "tok", opdrachten: [], instellingen: {} }; }
    else if (fn === "kal_lijst") r = S.sessies[b.p_token] ? { ok: true, naam: S.sessies[b.p_token], opdrachten: Object.values(S.data), instellingen: {}, opruimen: [] } : { ok: false, sessie: false };
    else if (fn === "kal_bewaar") { b.p_lijst.forEach((o) => { S.data[o.id] = o; }); r = { ok: true }; }
    else if (fn === "kal_instellingen" || fn === "kal_push_aanmelden" || fn === "kal_imports_lijst") r = { ok: true, imports: [] };
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(r) });
  });
  await c2.route("https://fonts.**", (r) => r.abort());
  const cdp = await c2.newCDPSession(q);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await q.clock.setFixedTime(NU);
  await q.goto(BASE); await w(q, 300);
  await q.click("#instellingenKnop"); await w(q, 150);
  await q.click('#inst-account [data-actie="wissel"]'); await w(q, 80);
  await q.fill("#acc-naam", "gijs"); await q.fill("#acc-pin", "4821"); await q.fill("#acc-pin2", "4821");
  await q.click("#acc-form button[type=submit]"); await w(q, 500);
  await q.click('#instellingen [data-actie="bio-aan"]'); await w(q, 700);
  check("Face ID aan: keuze 'Opnieuw ontgrendelen' staat op 15 minuten", await q.locator("#vergrendel-na").isVisible() && (await q.inputValue("#vergrendel-na")) === "15");
  await q.click("#inst-sluit");
  await q.clock.setFixedTime(new Date(NU.getTime() + 10 * 60000));
  await q.reload(); await w(q, 400);
  check("na 10 minuten: nog ontgrendeld (geen Face ID nodig)", !(await q.locator("#slotBalk").isVisible()) && (await q.locator("#accountKnop").innerText()).includes("gijs"));
  // app naar de achtergrond en na 20 minuten terug: vergrendeld, ook zonder herladen
  await q.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await q.clock.setFixedTime(new Date(NU.getTime() + 31 * 60000));
  await q.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await w(q, 300);
  check("na 20 minuten op de achtergrond: vergrendeld bij terugkomen", await q.locator("#slotBalk").isVisible());
  await q.click('#slotBalk [data-actie="ontgrendel"]'); await w(q, 800);
  check("ontgrendeld met Face ID", !(await q.locator("#slotBalk").isVisible()));
  await q.click("#accountKnop"); await w(q, 150);
  await q.selectOption("#vergrendel-na", "0"); await w(q, 100); await q.click("#inst-sluit");
  await q.reload(); await w(q, 400);
  check("keuze 'altijd bij openen': direct vergrendeld na herladen", await q.locator("#slotBalk").isVisible());
  check("geen JS-fouten", fouten.length === 0, fouten.join(" | "));

  // ---- 3. service worker: push-tag → item-url, share-target (POST), cache-first ----
  const c3 = await browser.newContext({ viewport: { width: 800, height: 700 } });
  await c3.grantPermissions(["notifications"], { origin: "http://localhost:8766" });
  await c3.route("https://**", (r) => r.abort());
  const s = await c3.newPage();
  const cdp3 = await c3.newCDPSession(s);
  let regId = null;
  cdp3.on("ServiceWorker.workerRegistrationUpdated", (e) => { e.registrations.forEach((r) => { if (r.scopeURL.startsWith("http://localhost:8766")) regId = r.registrationId; }); });
  await cdp3.send("ServiceWorker.enable");
  await s.goto(BASE); await w(s, 1500);
  await s.evaluate(() => navigator.serviceWorker.ready);
  await cdp3.send("ServiceWorker.deliverPushMessage", { origin: "http://localhost:8766", registrationId: regId, data: JSON.stringify({ titel: "Tandarts", tekst: "Om 08:30", tag: "af:a1:2026-10-28:08:30" }) });
  await w(s, 800);
  const n = await s.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((x) => ({ tag: x.tag, data: x.data })));
  check("push met afspraak-tag: melding wijst naar ?item=a1&datum=2026-10-28", n.length === 1 && n[0].data.url === "./?item=a1&datum=2026-10-28" && n[0].data.item === "a1", n);
  // cache-first: na de eerste keer staan de bestanden in de cache en komt een herlaad uit de cache
  const sleutels = await s.evaluate(async () => (await caches.keys()));
  check("cache aangemaakt met versienaam", sleutels.some((k) => k.startsWith("digigenda-")), sleutels);
  await s.reload(); await w(s, 600);
  const uitCache = await s.evaluate(() => performance.getEntriesByType("resource").filter((r) => /app\.js|style\.css/.test(r.name)).map((r) => [r.name.split("/").pop(), r.transferSize]));
  check("herladen: app.js en style.css zonder netwerkverkeer (uit de cache)", uitCache.length >= 2 && uitCache.every((x) => x[1] === 0), uitCache);
  // share-target: formulier met een .ics-bestand naar ./ (POST) → service worker → ?gedeeld=1 → importvenster
  const ics = fs.readFileSync(path.join(__dirname, "ics-bestanden", "rooster-utc.ics"), "utf8");
  await s.evaluate((inhoud) => {
    localStorage.setItem("digigenda-instellingen-v1", JSON.stringify({ agendas: ["school", "werk"], pabo: false, welkom: true }));
    const f = document.createElement("form"); f.method = "POST"; f.action = "./"; f.enctype = "multipart/form-data";
    const i = document.createElement("input"); i.type = "file"; i.name = "bestand";
    const dt = new DataTransfer(); dt.items.add(new File([inhoud], "rooster.ics", { type: "text/calendar" })); i.files = dt.files;
    f.appendChild(i); document.body.appendChild(f); f.submit();
  }, ics);
  await w(s, 1200);
  check("share-target: POST met .ics → terug op ./ en importvenster met het rooster", (await s.evaluate(() => location.pathname + location.search)).endsWith("/") && await s.locator("#importVenster").isVisible() && (await s.locator("#imp-inhoud").innerText()).includes("Kassa"), await s.evaluate(() => location.href));
  check("share-target: het gedeelde bestand is daarna uit de tijdelijke cache gehaald", !(await s.evaluate(async () => !!(await (await caches.open("digigenda-gedeeld")).match("./gedeeld")))));
  await s.click("#imp-sluit");
  await s.evaluate(() => {
    const f = document.createElement("form"); f.method = "POST"; f.action = "./"; f.enctype = "multipart/form-data";
    const i = document.createElement("input"); i.name = "tekst"; i.value = "morgen 9:00 tandarts"; f.appendChild(i); document.body.appendChild(f); f.submit();
  });
  await w(s, 1000);
  check("share-target: gedeelde tekst komt in de snelle invoer", (await s.inputValue("#snelInvoer")) === "morgen 9:00 tandarts");

  console.log(res.join("\n"));
  console.log(res.filter((r) => r.startsWith("PASS")).length + " / " + res.length + " geslaagd");
  await browser.close();
  if (res.some((r) => r.startsWith("FAIL"))) process.exit(1);
})().catch((e) => { console.log(res.join("\n")); console.error("CRASH", e); process.exit(1); });
