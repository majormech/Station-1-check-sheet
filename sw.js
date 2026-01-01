// sw.js — Decatur Fire PWA
const CACHE_VERSION = "v1.0.3"; // <-- bump this when you deploy changes
const CACHE_NAME = `dfd-checks-${CACHE_VERSION}`;

const ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/manifest.webmanifest"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const req = event.request;

  // Always fetch fresh HTML
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(fetch(req));
    return;
  }

  // Cache-first for JS/CSS
  event.respondWith(
    caches.match(req).then(res => res || fetch(req))
  );
});
