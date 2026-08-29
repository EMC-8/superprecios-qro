/**
 * Service Worker para SuperPrecios QRO (PWA)
 * Soporte Offline y almacenamiento en caché de activos estáticos.
 */

const CACHE_NAME = 'superprecios-qro-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/main.css',
  './css/responsive.css',
  './js/app.js',
  './js/data.js',
  './js/optimizer.js',
  './js/parser.js',
  './js/pwa.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-cacheando app shell');
      return cache.addAll(ASSETS).catch(err => {
        console.warn('[Service Worker] Error parcial en cacheAll:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Limpiando caché antiguo:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Estrategia Network First con fallback a Cache para páginas y recursos
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clonar y guardar copia en cache si es respuesta válida
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
