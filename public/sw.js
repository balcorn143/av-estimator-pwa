const CACHE_NAME = 'av-estimator-1.1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install - cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch - network first for HTML/JSON, cache first for static assets
self.addEventListener('fetch', event => {
  // Only intercept GET requests. POST/PUT/DELETE/etc. pass through
  // to the network natively — they can't be cached anyway, and trying
  // crashes the service worker.
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Pass through Supabase API requests without caching (always fresh data).
  // Returning without respondWith lets the browser handle it natively.
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // The app is online-only — never cache data JSON files. They're used only for
  // first-time team seeding and must reflect the latest server state.
  if (url.pathname.endsWith('av_catalog.json') || url.pathname.endsWith('av_packages.json')) {
    return;
  }

  // For HTML and other JSON files (manifest), always try network first.
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('.json') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // For hashed assets (Vite output like index-abc123.js), cache aggressively.
  // For other static assets, try cache first then network.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
