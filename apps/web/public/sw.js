// Woltron service worker — minimal app-shell cache so the PWA installs and opens offline-ish.
// API calls are never cached (they are live state).
const CACHE = 'woltron-shell-v2'; // bump to drop old caches

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;
  // Navigations: network first, fall back to cached shell.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/')));
    return;
  }
  // Hashed build files (/assets/*-<hash>.js|css) never change: cache-first.
  // Everything else (mascot art, icons, stickers) keeps its URL across releases: network-first,
  // so new artwork shows up immediately and the cache is only an offline fallback.
  const hashed = url.pathname.startsWith('/assets/');
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request);
      if (hashed && hit) return hit;
      try {
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      } catch (err) {
        if (hit) return hit;
        throw err;
      }
    }),
  );
});
