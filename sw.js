// sw.js: the service worker. It runs in the background, separately from the page,
// and sits between the app and the network. Its job is to keep a copy of the app's
// own files so Gene Explorer opens and the Toolkit and Learn tabs work with no signal.
//
// IMPORTANT: change CACHE_VERSION every time you publish changed files. That is how
// phones notice there is a new version and replace their saved copy.
const CACHE_VERSION = 'gene-explorer-v2';

// The app's own files, saved when the app is first opened ("precache")
const APP_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/toolkit.js',
  './js/learn.js',
  './js/api.js',
  './js/strand.js',
  './js/structure.js',
  './js/explore.js',
  './assets/fonts/press-start-2p-latin.woff2',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png'
];

// The 3D viewer library: saved the first time it is used, then reused offline
const LIBRARY_HOST = 'cdnjs.cloudflare.com';

// Install: download and save every app file. If any one fails, installing fails and
// the browser tries again later, so we never end up with half an app.
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();   // use the new version straight away
});

// Activate: delete saved copies from older versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Every request the page makes passes through here.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // App files: answer from the saved copy instantly, and refresh it in the background
  // when online ("stale-while-revalidate").
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async cache => {
        const saved = await cache.match(request, { ignoreSearch: true });
        const fresh = fetch(request)
          .then(response => { if (response.ok) cache.put(request, response.clone()); return response; })
          .catch(() => null);
        return saved || (await fresh) || cache.match('./index.html');
      })
    );
    return;
  }

  // 3D viewer library: saved copy if we have one, otherwise download and save it
  if (url.hostname === LIBRARY_HOST) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async cache =>
        (await cache.match(request)) ||
        fetch(request).then(response => { cache.put(request, response.clone()); return response; })
      )
    );
  }

  // Everything else (UniProt, Ensembl, NCBI, AlphaFold) goes straight to the network.
  // Those answers are live data; the page caches them itself for the session.
});
