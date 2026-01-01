const CACHE = "dfd-checks-alpha-v2";
const ASSETS = ["/", "/index.html", "/styles.css", "/app.js", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // App shell cache-first
  if (ASSETS.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }

  // Always network for API
  if (url.pathname.startsWith("/api")) return;
});
