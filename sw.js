/* Offline shell for the Advent reading plan.
   Bump CACHE when replacing precached images. HTML, CSS, JS and JSON
   are fetched from the network first so a new deploy shows up online,
   and fall back to this cache when the phone is offline. */

const CACHE = "advent-2026-v11";

const ASSETS = [
  "./",
  "./index.html",
  "./config.js",
  "./ui-strings.json",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./css/style-tokens.css",
  "./js/app.js",
  "./js/logic.js",
  "./js/storage.js",
  "./js/stats.js",
  "./js/speech.js",
  "./js/bgm.js",
  "./js/csv.js",
  "./js/sheet.js",
  "./data/plan.json",
  "./data/feelings.json",
  "./assets/watercolor_bg.png",
  "./assets/emotion_wheel.svg",
  "./assets/emotion_wheel_nolabels.svg",
  "./assets/emotion_wheel.png",
  "./assets/emotion_wheel_nolabels.png",
  "./assets/candles_week0.svg",
  "./assets/candles_week1.svg",
  "./assets/candles_week2.svg",
  "./assets/candles_week3.svg",
  "./assets/candles_week4.svg",
  "./assets/candles_week0.png",
  "./assets/candles_week1.png",
  "./assets/candles_week2.png",
  "./assets/candles_week3.png",
  "./assets/candles_week4.png",
  "./assets/style-tokens.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

/* Background music is not in ASSETS. A played mp3 is cached here on the
   first successful fetch, so only tracks the reader has heard stay offline. */

function isImage(url) {
  return /\.(png|svg|webp|jpe?g)$/i.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const statsPage = url.pathname.endsWith("/stats.html");
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!statsPage && response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match(statsPage ? request : "./index.html"))
    );
    return;
  }

  if (isImage(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
