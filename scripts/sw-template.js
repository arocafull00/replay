/* Generated into out/sw.js after each production build. No camera media is cached. */
const VERSION = '__VERSION__';
const NAME = 'voley-shell-' + VERSION;
const ASSETS = __ASSETS__;
const PATHS = new Set(ASSETS);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try { const cache = await caches.open(NAME); await cache.addAll(ASSETS); }
    catch (error) { await caches.delete(NAME); throw error; }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('voley-shell-') && name !== NAME) await caches.delete(name);
    await self.clients.claim();
  })());
});
async function clientIdle(client) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); resolve(false); }, 2000);
    channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); resolve(event.data?.busy === false); };
    client.postMessage({ type: 'SESSION_STATUS' }, [channel.port2]);
  });
}
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_WHEN_IDLE') event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if ((await Promise.all(clients.map(clientIdle))).every(Boolean)) await self.skipWaiting();
  })());
  if (event.data?.type === 'CHECK_OFFLINE') event.waitUntil((async () => {
    const cache = await caches.open(NAME);
    const complete = (await Promise.all(ASSETS.map(url => cache.match(url)))).every(Boolean);
    event.ports[0]?.postMessage({ ready: complete, version: VERSION });
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Only exact build assets: never cache arbitrary requests or media.
  if (PATHS.has(url.pathname)) event.respondWith((async () => {
    const cache = await caches.open(NAME);
    return await cache.match(url.pathname) || fetch(event.request);
  })());
  else if (event.request.mode === 'navigate') event.respondWith((async () => {
    try { return await fetch(event.request); }
    catch { const cache = await caches.open(NAME); const response = await cache.match('/404.html'); return new Response(response ? await response.blob() : 'Página no encontrada', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }); }
  })());
});
