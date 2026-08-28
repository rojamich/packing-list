// Service worker. BUILD_ID is stamped in at build time by vite.config.js.
//
// Deliberately network-first for the page itself. A cache-first shell is the
// classic way a PWA ends up showing month-old code on a phone, which is the
// exact problem this app already had — so freshness wins over a few ms.

const VERSION  = '__APP_VERSION__';
const BUILD_ID = '__BUILD_ID__';
const CACHE    = `packlist-${VERSION}-${BUILD_ID}`;

self.addEventListener('install', (event) => {
  // Take over as soon as the new worker is ready rather than waiting for every
  // tab to close — on a phone the app is rarely fully closed.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['/', '/index.html'])).catch(() => {}),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Firestore, Auth and the exchange-rate API must never be intercepted.
  if (url.origin !== self.location.origin) return;

  // The update check has to see the server, always.
  if (url.pathname === '/version.json') return;

  // Page loads: network first, cache only as an offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        // Only cache a real page. Caching a 500 here would make it the shell
        // every subsequent offline launch serves.
        if (fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put('/index.html', fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await caches.match('/index.html');
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Build assets carry a content hash in the filename, so a hit is always
  // correct and a new build simply requests a new name.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const fresh = await fetch(req);
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    })());
    return;
  }

  // Icons, manifest and friends: serve fast, refresh in the background.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(() => cached);
    return cached || network;
  })());
});
