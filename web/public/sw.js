// Waypoint Dispatch service worker — keeps the loader and driver screens usable without signal.
// Static assets: cache first. Pages and GET API calls: network first, falling back to the last copy.
const CACHE = 'wp-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  const field = /^\/(driver|loader|store)(\/|$)/.test(url.pathname) || /^\/api\/(driver|loader)\//.test(url.pathname);
  if (!field) return;
  e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone())); return r; }).catch(async () => (await caches.match(req)) || new Response('Offline', { status: 503 })));
});
