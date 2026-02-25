// ===== KPI Dashboard — Service Worker =====
// Cache-First for static assets, Network-First for API data

const CACHE_NAME = 'kpi-dashboard-v2';
const API_CACHE = 'kpi-api-v1';

// Static assets to pre-cache on install
const STATIC_ASSETS = [
    '/',
    '/css/variables.css',
    '/css/base.css',
    '/css/layout.css',
    '/css/components.css',
    '/css/mobile.css',
    '/css/forest-dashboard.css',
    '/css/executive.css',
    '/css/data-entry.css',
    '/css/builder.css',
    '/css/api-system.css',
    '/css/gis.css'
];

// CDN resources to cache on first use
const CDN_HOSTS = [
    'cdn.jsdelivr.net',
    'unpkg.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'basemaps.cartocdn.com'
];

// Supabase API host (for Network-First caching)
const API_HOST = 'supabase.co';

// ===== Install: pre-cache static assets =====
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
            .catch(err => console.warn('SW install cache failed:', err))
    );
});

// ===== Activate: cleanup old caches =====
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME && k !== API_CACHE)
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ===== Fetch: route requests to appropriate strategy =====
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Strategy 1: Network-First for Supabase API (always try fresh data)
    if (url.hostname.includes(API_HOST)) {
        event.respondWith(networkFirst(event.request, API_CACHE));
        return;
    }

    // Strategy 2: Cache-First for CDN resources
    if (CDN_HOSTS.some(h => url.hostname.includes(h))) {
        event.respondWith(cacheFirst(event.request, CACHE_NAME));
        return;
    }

    // Strategy 3: same-origin assets
    if (url.origin === self.location.origin) {
        // JS and HTML: Network-First (always get latest code after deployments)
        if (url.pathname.endsWith('.js') || url.pathname === '/' || url.pathname.endsWith('.html')) {
            event.respondWith(networkFirst(event.request, CACHE_NAME));
        } else {
            // CSS, images, fonts: Cache-First
            event.respondWith(cacheFirst(event.request, CACHE_NAME));
        }
        return;
    }
});

// ===== Cache-First: serve from cache, fallback to network =====
async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('Offline', { status: 503 });
    }
}

// ===== Network-First: try network, fallback to cache =====
async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// ===== Broadcast offline/online status to clients =====
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
