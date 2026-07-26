// Bump on every deploy - forces the "activate" handler below to purge the old cache.
const CACHE_NAME = 'fuhren-tracker-v4';
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icon27-favicon-32.png',
  './icon27-180.png',
  './icon27-192.png',
  './icon27-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Never intercept GPS or other cross-origin requests - only cache same-origin app-shell files.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  const isAppShellDocument = event.request.mode === 'navigate' || url.pathname.endsWith('index.html');

  if (isAppShellDocument) {
    // Network-first: online users always get the latest deploy. Cache is only a fallback
    // for offline use, never a permanent substitute for a fresh fetch (that was the bug -
    // a cache-first policy here meant updates never reached devices that had already cached it).
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Static assets (icons, manifest): stale-while-revalidate. Serves the cached copy immediately
  // (fast, works offline) but always refetches in the background and updates the cache for next
  // time - so editing an icon's *content* without renaming the file self-heals within one extra
  // load instead of being stuck forever (that was the bug: pure cache-first never revalidated).
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});
