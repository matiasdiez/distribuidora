/**
 * sw.js — Service Worker v10
 *
 * Estrategia:
 *  - App shell (HTML, CSS, JS): Cache-first con invalidación por versión
 *  - API calls a Supabase: Network-only (datos offline viven en IndexedDB)
 *  - Auto-update: cuando hay una nueva versión del SW, notifica a todos los
 *    clientes abiertos para que muestren el banner "Nueva versión disponible"
 *
 * IMPORTANTE: cambiar SW_VERSION en cada deploy para invalidar el caché.
 * En CI/CD esto puede generarse automáticamente con el hash del build.
 */

const SW_VERSION  = 'v10';
const CACHE_NAME  = `deposito-${SW_VERSION}`;
const OFFLINE_URL = '/';

const SHELL_ASSETS = [
  '/',
  '/swipe',
  '/marcas',
  '/tareas',
  '/ajustes',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
];

// ── Instalación ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
  // NO llamar skipWaiting() aquí — esperamos confirmación del usuario
  // antes de activar para no interrumpir una operación en curso.
});

// ── Activación ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Borrar cachés de versiones anteriores
      caches.keys().then(keys =>
        Promise.all(
          keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        )
      ),
      // Tomar control de todos los clientes inmediatamente
      self.clients.claim(),
    ])
  );

  // Notificar a todos los clientes que hay una nueva versión activa
  self.clients.matchAll({ type: 'window' }).then(clients => {
    clients.forEach(client =>
      client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION })
    );
  });
});

// ── Mensaje desde cliente ─────────────────────────────────────
// El cliente puede pedir activación inmediata cuando el usuario acepta
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Intercepción de requests ──────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(response => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          if (request.destination === 'document') {
            return caches.match(OFFLINE_URL);
          }
        });
    })
  );
});
