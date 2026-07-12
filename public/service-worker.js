// Bump cache version whenever you deploy new code so the SW refreshes all caches
const CACHE_NAME = 'oxy-ai-cache-v4';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/chat.html',
    '/app.js',
    '/style.css',
    '/auth.js',
    '/firebase-config.js',
    '/pdf-viewer.js',
    '/widget-renderer.js',
    '/persistence.js',
    '/manifest.json',
    // PWA icon set
    '/apple-touch-icon.png',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/maskable-icon-512.png',
    // Transparent favicon (no background)
    '/favicon.svg',
    '/favicon.png',
    '/logo.svg'
];

self.addEventListener('install', (event) => {
    // Force the new service worker to become the active service worker immediately
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Use try/catch so if a file is missing it doesn't fail the whole install
            return Promise.allSettled(
                ASSETS_TO_CACHE.map(url => cache.add(url).catch(err => console.log(`[SW] Failed to cache ${url}:`, err)))
            );
        })
    );
});

self.addEventListener('activate', (event) => {
    // Tell the active service worker to take control of the page immediately
    self.clients.claim();

    // Automatically clear old caches
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName.startsWith('oxy-ai-cache')) {
                        console.log('[SW] Clearing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Only intercept GET requests
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    // Ignore API and Admin requests completely
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/')) return;
    // Ignore browser extensions and other non-http schemes
    if (!url.protocol.startsWith('http')) return;

    // NETWORK FIRST STRATEGY
    // This ensures users ALWAYS get the latest files from Vercel (instant updates)
    // and only falls back to cache if the network fails (offline support).
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // If the response is good, clone it and update the cache
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // If network fails (offline), fall back to cache
                return caches.match(event.request);
            })
    );
});
