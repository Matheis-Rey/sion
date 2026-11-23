var VERSION = "sion-v9";
var FICHIERS = [
  "./",
  "index.html",
  "manifest.json",
  "css/style.css",
  "js/config.js",
  "js/supabase.js",
  "js/api.js",
  "js/photo.js",
  "js/app.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/logo.webp"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return Promise.all(
        FICHIERS.map(function (f) {
          return cache.add(f).catch(function () {});
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (noms) {
      return Promise.all(
        noms
          .filter(function (n) { return n !== VERSION; })
          .map(function (n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then(function (reponse) {
        var copie = reponse.clone();
        caches.open(VERSION).then(function (cache) {
          cache.put(e.request, copie);
        });
        return reponse;
      })
      .catch(function () {
        return caches.match(e.request, { ignoreSearch: true });
      })
  );
});
