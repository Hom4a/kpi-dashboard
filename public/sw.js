// ===== KPI Dashboard — Service Worker (Vite-compatible) =====
// No pre-cache (Vite hashes filenames for browser caching)
// Network-First for app files, Cache-First for CDN only

const CACHE_NAME = 'kpi-v8';

const CDN_HOSTS = [
    'cdn.jsdelivr.net', 'unpkg.com',
    'fonts.googleapis.com', 'fonts.gstatic.com',
    'basemaps.cartocdn.com'
];

const API_HOST = 'supabase.co';

// Install: no pre-cache needed (Vite handles asset hashing)
self.addEventListener('install', () => self.skipWaiting());

// Activate: clean old caches, take control immediately
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch strategy
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // API: Network-only (no caching, always fresh)
    if (url.hostname.includes(API_HOST)) return;

    // CDN: Cache-First (libraries don't change)
    if (CDN_HOSTS.some(h => url.hostname.includes(h))) {
        event.respondWith(cacheFirst(event.request));
        return;
    }

    // Own origin: Network-First (always get latest build)
    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(event.request));
    }
});

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const resp = await fetch(request);
        if (resp.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, resp.clone());
        }
        return resp;
    } catch {
        return new Response('Offline', { status: 503 });
    }
}

async function networkFirst(request) {
    try {
        const resp = await fetch(request);
        if (resp.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, resp.clone());
        }
        return resp;
    } catch {
        const cached = await caches.match(request);
        return cached || new Response('Offline', { status: 503 });
    }
}

self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') self.skipWaiting();
});
