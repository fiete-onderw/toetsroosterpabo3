/*
  Digigenda service worker: zorgt dat de app ook offline opent.
  Eerst het netwerk (zodat je altijd de nieuwste versie krijgt), bij geen verbinding de opgeslagen kopie.
  Verhoog VERSIE als je bestanden toevoegt aan BESTANDEN.
*/
const VERSIE = "digigenda-20261022b";
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
