self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

// pass-through fetch — no offline caching, just enough to satisfy installability
self.addEventListener("fetch", () => {});
