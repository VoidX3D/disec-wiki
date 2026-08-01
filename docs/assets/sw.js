/**
 * DISEC Research Wiki -- Service Worker v3
 *
 * Aggressive caching for instant loads:
 *   - Static assets: Cache First (instant)
 *   - HTML pages: Stale While Revalidate (fast + fresh)
 *   - Search index: Cache First (instant search)
 *   - PDFs: Cache First (large, rarely change)
 *   - Fonts: Cache First (never change)
 *
 * First visit: caches everything. Repeat visits: instant.
 */
const CACHE = 'disec-v3';
const STATIC = 'disec-static-v3';
const PAGES = 'disec-pages-v3';
const FONTS = 'disec-fonts-v3';

const PRECACHE = [
  '/',
  '/assets/extra.css',
  '/assets/disec-search.js',
  '/assets/disec-main.js',
  '/assets/disec-offline-images.js',
  '/search/flexsearch-index.json',
];

// Install: precache critical assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => ![STATIC, PAGES, FONTS].includes(k)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: route to strategy
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // HTML pages: stale while revalidate (instant first, background refresh)
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('/') || url.pathname === '/') {
    e.respondWith(swr(request, PAGES));
    return;
  }

  // Search index: cache first (instant search)
  if (url.pathname.includes('/search/')) {
    e.respondWith(cf(request, STATIC));
    return;
  }

  // Fonts: cache first forever
  if (url.pathname.includes('/fonts/') || url.pathname.endsWith('.woff2') || url.pathname.endsWith('.woff')) {
    e.respondWith(cf(request, FONTS));
    return;
  }

  // PDFs: cache first
  if (url.pathname.endsWith('.pdf')) {
    e.respondWith(cf(request, STATIC));
    return;
  }

  // All other static assets: cache first
  e.respondWith(cf(request, STATIC));
});

// Cache First -- instant if cached, fetch + cache if not
async function cf(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}

// Stale While Revalidate -- return cache instantly, refresh in background
async function swr(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  const fresh = fetch(request).then(res => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => hit);
  return hit || fresh;
}
