/* Service worker : application installable + fonctionnement hors connexion.
   Pages et fichiers du site : réseau d'abord (toujours la dernière version), cache en secours.
   Bibliothèques Firebase et polices : cache d'abord (adresses versionnées). Les données Firebase ne passent jamais par le cache. */
const VERSION = "b2b-v1";
const SHELL = [
  "./", "index.html", "catalogue.html", "connexion.html", "entreprise.html", "fournisseur.html", "admin.html", "offline.html",
  "manifest.webmanifest", "assets/css/style.css", "assets/css/home.css",
  "assets/js/config.js", "assets/js/firebase.js", "assets/js/ui.js", "assets/js/site.js", "assets/js/effects.js", "assets/js/pwa.js",
  "assets/js/catalogue.js", "assets/js/auth-page.js", "assets/js/entreprise.js", "assets/js/fournisseur.js", "assets/js/admin.js",
  "assets/img/logo.svg", "assets/img/icon-192.png", "assets/img/icon-512.png",
];
// Hôtes externes mis en cache (bibliothèques versionnées et polices)
const STATIC_HOSTS = ["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  if (!sameOrigin && !STATIC_HOSTS.includes(url.hostname)) return; // Firestore, Auth… : toujours en direct

  // Fichiers du site : réseau d'abord (jamais de version périmée), cache si hors connexion
  if (sameOrigin) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(async () => (await caches.match(req, { ignoreSearch: true }))
      || (req.mode === "navigate" ? caches.match("offline.html") : Response.error())));
    return;
  }

  // Bibliothèques versionnées et polices : cache d'abord
  e.respondWith(caches.match(req).then(cached => cached || fetch(req).then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
