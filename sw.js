/**
 * Service Worker para SuperPrecios QRO (PWA)
 *
 * Objetivo: que la app abra y calcule dentro del supermercado, donde la señal
 * suele ser mala o nula.
 *
 * Estrategia:
 *  - App shell (HTML/CSS/JS/íconos): cache-first. Nunca depende de la red.
 *  - Precios (data/prices.json): network-first con respaldo en caché, porque
 *    un precio viejo sigue siendo útil pero uno nuevo es mejor.
 *  - Navegaciones: si la red falla, se sirve el index cacheado.
 */

const CACHE_NAME = 'superprecios-qro-v6';

// Si algo de aquí falla, falla TODO el precache (cache.addAll es atómico).
// Solo debe contener rutas que de verdad existan en el repo.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/main.css',
  './css/responsive.css',
  './js/app.js',
  './js/data.js',
  './js/optimizer.js',
  './js/parser.js',
  './js/prices.js',
  './js/config.js',
  './js/checkout.js',
  './js/profile.js',
  './js/pwa.js',
  './data/prices.json',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

const PRICES_PATH = '/data/prices.json';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Se cachea uno por uno para que un recurso caído no tumbe el resto,
    // pero se avisa fuerte porque significa que el repo y esta lista no coinciden.
    const results = await Promise.allSettled(APP_SHELL.map(url => cache.add(url)));
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? APP_SHELL[i] : null))
      .filter(Boolean);
    if (failed.length) {
      console.error('[SW] No se pudieron precachear:', failed);
    } else {
      console.log('[SW] App shell precacheado completo');
    }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 1. Navegaciones: red primero, y si no hay, el index cacheado.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (e) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // 2. Precios: red primero (se quiere el dato fresco), caché como respaldo.
  if (url.pathname.endsWith(PRICES_PATH)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const res = await fetch(request);
        if (res && res.ok) cache.put(request, res.clone());
        return res;
      } catch (e) {
        const cached = await cache.match(request);
        if (cached) return cached;
        return new Response(
          JSON.stringify({ error: 'offline', products: {} }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
    })());
    return;
  }

  // 3. Todo lo demás (app shell): caché primero, y se revalida en segundo plano.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    const network = fetch(request)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
        return res;
      })
      .catch(() => null);

    return cached || (await network) || Response.error();
  })());
});
