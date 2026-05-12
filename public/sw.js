// GullySports Service Worker — v2 (adds Web Push for "Need Players Now")
const CACHE = 'gullysports-v2';
const PRECACHE = ['/', '/offline', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Web Push ──────────────────────────────────────────────────────────────
// Payload from server (src/lib/push.ts):
//   { title, body, url, tag, icon }
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Some browsers send a malformed payload; fall through with defaults.
  }
  const title = payload.title || 'GullySports';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192',
    badge: '/icon-192',
    data: { url: payload.url || '/' },
    tag: payload.tag,             // coalesce duplicate notifications
    renotify: !!payload.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Focus an existing tab if it's open at the same URL; otherwise open a new one.
      for (const w of wins) {
        try {
          const u = new URL(w.url);
          if (u.pathname === url || w.url.endsWith(url)) {
            return w.focus();
          }
        } catch { /* ignore */ }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache Supabase / external API calls
  if (url.origin !== self.location.origin) return;

  // Never cache Next.js internal data / auth endpoints
  if (url.pathname.startsWith('/_next/data/') || url.pathname.startsWith('/auth/')) return;

  // Network-first for HTML navigations (always try fresh, fall back to cache)
  const isNav = request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');

  if (isNav) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('/offline'))
        )
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
