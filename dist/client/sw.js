/**
 * sw.ts / sw.js — Service Worker
 *
 * Estrategia:
 *  - App shell (HTML, CSS, JS): Cache-first
 *  - API calls a Supabase: Network-only (los datos offline viven en IndexedDB)
 */

const CACHE_NAME    = 'deposito-v1';
const OFFLINE_URL   = '/';

// Recursos del app shell a cachear en la instalación
const SHELL_ASSETS = [
  '/',
  '/styles/global.css',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
];

// ── Instalación ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
  // Activa inmediatamente sin esperar a que cierren las pestañas anteriores
  self.skipWaiting();
});

// ── Activación ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Intercepción de requests ──────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests que no son GET
  if (request.method !== 'GET') return;

  // Supabase: siempre network (los datos van a IndexedDB, no al cache del SW)
  if (url.hostname.includes('supabase.co')) return;

  // Chrome extensions y otros protocolos raros: ignorar
  if (!url.protocol.startsWith('http')) return;

  // App shell: cache-first con fallback a network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(response => {
          // Solo cachear respuestas válidas
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          // Guardar copia en cache
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // Offline y no hay cache: devolver la página principal
          if (request.destination === 'document') {
            return caches.match(OFFLINE_URL);
          }
        });
    })
  );
});
