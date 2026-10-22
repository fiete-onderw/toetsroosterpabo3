/*
  Digigenda service worker: zorgt dat de app ook offline opent.
  Eerst het netwerk (zodat je altijd de nieuwste versie krijgt), bij geen verbinding de opgeslagen kopie.
  Verhoog VERSIE als je bestanden toevoegt aan BESTANDEN.
*/
const VERSIE = "digigenda-20261023a";
const BESTANDEN = [
  "./", "index.html", "style.css", "app.js", "parse.js", "cloud.js", "toetsen.js", "manifest.webmanifest",
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

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase en lettertypen: gewoon via het netwerk
  e.respondWith(
    fetch(req)
      .then((antwoord) => {
        if (antwoord && antwoord.ok) {
          const kopie = antwoord.clone();
          caches.open(VERSIE).then((c) => c.put(req, kopie));
        }
        return antwoord;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((r) => r || (req.mode === "navigate" ? caches.match("index.html") : undefined)))
  );
});

// Pushmelding binnengekomen (ook als de app dicht is). Altijd een melding tonen: iOS eist dat.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { tekst: e.data ? e.data.text() : "" }; }
  const titel = (typeof d.titel === "string" && d.titel) ? d.titel.slice(0, 80) : "Digigenda";
  e.waitUntil(self.registration.showNotification(titel, {
    body: typeof d.tekst === "string" ? d.tekst.slice(0, 200) : "",
    tag: typeof d.tag === "string" ? d.tag : undefined,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    data: { url: "./" }
  }));
});

// Tik op de melding: open (of toon) Digigenda op het scherm van vandaag
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const lijst = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of lijst) {
      if (new URL(c.url).origin === self.location.origin) {
        c.postMessage({ type: "naar-vandaag" });
        return c.focus();
      }
    }
    return self.clients.openWindow(self.registration.scope);
  })());
});
