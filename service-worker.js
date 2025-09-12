const CACHE = 'love-v1';
const ASSETS = [
  './', './index.html',
  './app.js', './lovecrypto-browser.js',
  './manifest.webmanifest', './heart-192.png', './heart-512.png'
];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('fetch', e=>{
  e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
});
