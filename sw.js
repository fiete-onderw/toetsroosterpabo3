/*
  Digigenda service worker: de app opent direct uit de cache en ververst zichzelf op de achtergrond.
  - Eigen bestanden: eerst de opgeslagen kopie (snel, ook offline), tegelijk ophalen van het netwerk voor de volgende keer.
  - Een nieuwe versie (andere VERSIE of ?v=) wordt bij installatie compleet opgehaald en vervangt de oude cache.
  - Delen naar de app (Android share-target, POST): het gedeelde bestand of de tekst wordt tijdelijk bewaard en de app
    opent met ?gedeeld=1.
  Verhoog VERSIE bij elke oplevering.
*/
const VERSIE = "digigenda-20261027b";
const BESTANDEN = [
  "./", "index.html", "style.css", "app.js", "parse.js", "ics.js", "cloud.js", "toetsen.js", "manifest.webmanifest",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSIE).then((c) => c.addAll(BESTANDEN)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== VERSIE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

const DEEL_CACHE = "digigenda-gedeeld";

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase en lettertypen: gewoon via het netwerk

  // Share-target (Android): POST met tekst en/of een .ics-bestand → bewaren en doorsturen naar de app
  if (req.method === "POST" && req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const vorm = await req.formData();
        const bestand = vorm.get("bestand");
        const delen = [vorm.get("titel"), vorm.get("tekst"), vorm.get("url")].map((x) => (typeof x === "string" ? x : "")).filter(Boolean);
        let tekst = delen.join("\n");
        if (bestand && typeof bestand.text === "function") tekst = (await bestand.text()).slice(0, 5 * 1024 * 1024);
        const c = await caches.open(DEEL_CACHE);
        await c.put("./gedeeld", new Response(tekst, { headers: { "Content-Type": "text/plain; charset=utf-8" } }));
      } catch (_) { /* dan opent de app gewoon */ }
      return Response.redirect(new URL("./?gedeeld=1", self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== "GET") return;

  // Eigen bestanden: cache eerst, netwerk op de achtergrond
  e.respondWith((async () => {
    const cache = await caches.open(VERSIE);
    const opgeslagen = await cache.match(req, { ignoreSearch: true });
    const vers = fetch(req).then((antwoord) => {
      if (antwoord && antwoord.ok && antwoord.type === "basic") cache.put(req, antwoord.clone());
      return antwoord;
    }).catch(() => null);
    if (opgeslagen) { e.waitUntil(vers); return opgeslagen; }
    const antwoord = await vers;
    if (antwoord) return antwoord;
    return (req.mode === "navigate" ? cache.match("index.html") : undefined) || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  })());
});

// Pushmelding binnengekomen (ook als de app dicht is). Altijd een melding tonen: iOS eist dat.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { tekst: e.data ? e.data.text() : "" }; }
  const titel = (typeof d.titel === "string" && d.titel) ? d.titel.slice(0, 80) : "Digigenda";
  // De tag 'af:<id>:<datum>:<tijd>' hoort bij één afspraak: een tik op de melding opent precies die afspraak
  const tag = typeof d.tag === "string" ? d.tag : "";
  const m = /^af:([A-Za-z0-9_.-]{1,40}):(\d{4}-\d{2}-\d{2}):/.exec(tag);
  const doel = m ? "./?item=" + encodeURIComponent(m[1]) + "&datum=" + m[2] : "./";
  e.waitUntil(self.registration.showNotification(titel, {
    body: typeof d.tekst === "string" ? d.tekst.slice(0, 200) : "",
    tag: tag || undefined,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    data: { url: doel, item: m ? m[1] : null, datum: m ? m[2] : null }
  }));
});

// Tik op de melding: open (of toon) Digigenda, bij een afspraak-melding direct op die afspraak
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const d = (e.notification && e.notification.data) || {};
  e.waitUntil((async () => {
    const lijst = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of lijst) {
      if (new URL(c.url).origin === self.location.origin) {
        c.postMessage(d.item ? { type: "open-item", id: d.item, datum: d.datum } : { type: "naar-vandaag" });
        return c.focus();
      }
    }
    return self.clients.openWindow(new URL(d.url || "./", self.registration.scope).href);
  })());
});
