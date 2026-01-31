// Service Worker for Given to Fly - Secure Message Encryption App
const CACHE_NAME = 'love-messages-v2';

// Core app shell files needed for offline functionality
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './heart-192.png',
  './heart-512.png'
];

// Files that should always be fetched fresh when online
const NETWORK_FIRST = ['./app.js', './style.css', './index.html'];

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
        // Activate immediately without waiting for open tabs to close
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
        // Take control of all clients immediately
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

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Use stale-while-revalidate for critical files (HTML, CSS, JS)
  // This serves cached content immediately while fetching updates in background
  if (NETWORK_FIRST.some(file => event.request.url.endsWith(file.slice(1)))) {
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

  // Fetch in background and update cache
  const fetchPromise = fetch(request)
    .then(networkResponse => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  // Return cached response immediately, or wait for network
  return cachedResponse || fetchPromise;
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
    // Return a fallback response or let the browser handle the error
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}
