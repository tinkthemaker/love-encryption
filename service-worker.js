// Service Worker for CIPHER - Secure Message Encryption App
// version.js exposes APP_VERSION and CACHE_NAME; bump APP_VERSION there
// to force a cache invalidation on next deploy.
//
// Note: version.js wraps its declarations in an IIFE so they don't
// leak into the script's global lexical environment (which would
// collide with other <script>-loaded files in browser pages). In a
// service worker the only way to access them is via the published
// global (self.CIPHER_VERSION), so we read CACHE_NAME from there.
importScripts('./version.js');
const CACHE_NAME = self.CIPHER_VERSION.CACHE_NAME;

// Core app shell files needed for offline functionality
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './crypto.js',
  './version.js',
  './vendor/qrcode.js',
  './vendor/wordlist.js',
  './heart-192.png',
  './heart-512.png'
];

// Files that should always be revalidated when online, matched on the
// request pathname so query strings (`/app.js?v=2`) and the bare root
// navigation are handled too. Suffix matching missed both.
const NETWORK_FIRST_PATHS = new Set(
  ['./', './index.html', './style.css', './app.js', './crypto.js', './version.js', './vendor/qrcode.js', './vendor/wordlist.js']
    .map(file => new URL(file, self.location.href).pathname),
);

/**
 * Install event: Cache the app shell files.
 */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Cache install failed:', err);
      })
  );
});

/**
 * Activate event: Clean up old caches and take control.
 */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

/**
 * Fetch event: Implements stale-while-revalidate for critical files,
 * cache-first for static assets.
 */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // The Cache API only stores GET responses; anything else must pass through
  if (event.request.method !== 'GET') {
    return;
  }

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Use stale-while-revalidate for critical files (HTML, CSS, JS) and for
  // any navigation, so a returning visitor never gets a stale app shell.
  if (event.request.mode === 'navigate' || NETWORK_FIRST_PATHS.has(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Use cache-first for static assets (images, icons)
  event.respondWith(cacheFirst(event.request));
});

/**
 * Stale-while-revalidate strategy:
 * Returns cached response immediately, then updates cache in background.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(networkResponse => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  if (cachedResponse) return cachedResponse;
  // Nothing cached and the network is gone: respondWith(null) would reject
  // and surface a browser error page, so return an explicit offline response.
  return (await fetchPromise) || offlineResponse();
}

/**
 * Fallback response used when a request can be served from neither the
 * cache nor the network.
 */
function offlineResponse() {
  return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
}

/**
 * Cache-first strategy:
 * Returns cached response if available, otherwise fetches from network.
 */
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.error('[SW] Fetch failed:', err);
    return offlineResponse();
  }
}