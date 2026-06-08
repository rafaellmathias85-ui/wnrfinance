const CACHE_NAME = 'wnr-finance-v4';
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const withBasePath = (path) => `${BASE_PATH}${path}`;
const OFFLINE_URL = withBasePath('/login');

const PRECACHE_URLS = [
  OFFLINE_URL,
  withBasePath('/icons/icon-192x192.png'),
  withBasePath('/icons/icon-512x512.png'),
  withBasePath('/favicon.svg'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (
    event.request.mode === 'navigate' ||
    url.pathname.includes('/_next/') ||
    event.request.headers.get('accept')?.includes('text/html')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone).catch(() => {}));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match(OFFLINE_URL))
      )
  );
});

// Push Notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'WNR Finance', body: event.data.text() }; }

  const options = {
    body: data.body || 'Nova notificação',
    icon: withBasePath('/icons/icon-192x192.png'),
    badge: withBasePath('/icons/icon-72x72.png'),
    vibrate: [200, 100, 200],
    data: { url: data.url || withBasePath('/dashboard'), ...data },
    actions: data.actions || [],
    tag: data.tag || 'wnr-notification',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title || 'WNR Finance', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || withBasePath('/dashboard');
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncOfflineTransactions());
  }
});

async function syncOfflineTransactions() {
  try {
    const cache = await caches.open('wnr-offline-queue');
    const keys = await cache.keys();
    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const body = await response.json();
        await fetch(request, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        await cache.delete(request);
      }
    }
  } catch (err) {
    console.error('[SW] sync failed', err);
  }
}
