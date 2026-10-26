/* What Do? service worker — offline play + update handling.
   RELEASING AN UPDATE: VERSION below is set automatically by the repo's git pre-commit hook
   whenever game files are committed (by hand: change it to any new string).
   Players see "NEW VERSION — TAP TO UPDATE" on their next visit. */
const VERSION = 'whatdo-20261026-045202';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './vendor/three.min.js',
  './fonts/press-start-2p.woff2',
  './fonts/bangers.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)));
  // don't skipWaiting automatically: the page asks the player first
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  ); 
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // CDN fallback etc. go straight to network

  // the game page: network first (fresh when online), cached copy when offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // everything else: cache first, then network (and keep a copy)
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
