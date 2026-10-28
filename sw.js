// Service worker minimal : l'interface reste disponible hors ligne (réseau d'abord, cache en secours).
const CACHE = 'clap-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })()
  )
);

self.addEventListener('fetch', (e) => {
  const r = e.request;
  const u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(
    (async () => {
      try {
        const res = await fetch(r);
        if (res.ok && !res.redirected) (await caches.open(CACHE)).put(r, res.clone());
        return res;
      } catch {
        const hit = (await caches.match(r)) || (r.mode === 'navigate' ? await caches.match('/') : null);
        if (hit) return hit;
        return new Response('Hors ligne', { status: 503 });
      }
    })()
  );
});
