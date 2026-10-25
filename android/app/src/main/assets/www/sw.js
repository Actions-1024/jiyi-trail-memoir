const CACHE = 'jiyi-v12';
const CORE = [
  './',
  './index.html',
  './assets/css/app.css',
  './assets/css/pages.css',
  './manifest.webmanifest',
  './assets/icons/logo.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/demo/hero.jpg',
  './js/app.js',
  './js/pwa.js',
  './js/geo.js',
  './js/db.js',
  './js/demo.js',
  './js/map.js',
  './js/media.js',
  './js/recorder.js',
  './js/themes.js',
  './js/timeline.js',
  './js/ui.js',
  './js/icons.js',
  './js/data.js',
  './js/pages/home.js',
  './js/pages/helpers.js',
  './js/pages/record.js',
  './js/pages/trip.js',
  './js/pages/export.js',
  './js/pages/profile.js',
  './js/vlog.js',
  './js/audio.js',
  './js/webm.js',
  './assets/demo/lake-dawn.jpg',
  './assets/demo/lake-lotus.jpg',
  './assets/demo/lake-autumn.jpg',
  './assets/demo/lake-dusk.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch(() => {
        if (request.mode === 'navigate') return caches.match('./index.html');
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    }),
  );
});
