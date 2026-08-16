// Minimal service worker: makes B-Side installable and lets the
// app shell load offline. (Camera + Spotify still need a connection.)
const CACHE = "bside-v2";
const ASSETS = [
  ".",
  "index.html",
  "styles.css",
  "js/config.js",
  "js/spotify.js",
  "js/app.js",
  "manifest.webmanifest",
  "icons/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  // Only cache-serve our own same-origin GET requests; never intercept
  // Spotify / map API calls.
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) {
    return;
  }
  // Network-first: always try the live file (so edits show up immediately),
  // and fall back to the cached copy when offline.
  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request))
  );
});
