// Define a cache name for our app files.
const CACHE_NAME = 'love-messages-v1';

// List the files that make up the "app shell" - everything needed to run offline.
const urlsToCache = [
  './', // This represents the root, which will serve index.html
  './index.html',
  './heart-192.png',
  './heart-512.png'
];

// Install event: fires when the service worker is first installed.
self.addEventListener('install', event => {
  // We wait until the installation is complete.
  event.waitUntil(
    // Open the cache.
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Add all the app shell files to the cache.
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event: fires after install. Used to clean up old caches.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // If a cache exists that is not our current one, delete it.
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event: fires for every network request the page makes.
self.addEventListener('fetch', event => {
  // We respond to the request with our own logic.
  event.respondWith(
    // Try to find a matching request in the cache.
    caches.match(event.request)
      .then(response => {
        // If a cached response is found, return it.
        if (response) {
          return response;
        }
        // If not found in cache, try to fetch it from the network.
        return fetch(event.request);
      })
  );
});
