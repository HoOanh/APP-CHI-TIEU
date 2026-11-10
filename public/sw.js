const CACHE_PREFIX = 'arc-irobot-';
const STATIC_CACHE = `${CACHE_PREFIX}static-v2`;
const OFFLINE_URL = '/offline.html';
const APP_ASSETS = [OFFLINE_URL, '/arc-irobot.png', '/pwa-icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then(async (cache) => {
        await cache.add(OFFLINE_URL);
        await Promise.all(
          APP_ASSETS.filter((asset) => asset !== OFFLINE_URL).map((asset) =>
            cache.add(asset).catch(() => undefined),
          ),
        );
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== STATIC_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        const offlinePage = await cache.match(OFFLINE_URL);
        return offlinePage || Response.error();
      }),
    );
    return;
  }

  const isNextStaticAsset = requestUrl.pathname.startsWith('/_next/static/');
  const isAppAsset = [
    '/arc-irobot.png',
    '/favicon.ico',
    '/icon.png',
    '/manifest.webmanifest',
    '/pwa-icon.svg',
  ].includes(requestUrl.pathname);

  if (!isNextStaticAsset && !isAppAsset) return;

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) return cachedResponse;

      const networkResponse = await fetch(request);
      if (networkResponse.ok && networkResponse.type === 'basic') {
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    }),
  );
});

self.addEventListener('push', (event) => {
  let notification = {
    title: 'ARC Irobot',
    body: 'Có cập nhật mới cho ĐẠI CA.',
    url: '/',
    tag: 'arc-irobot-notification',
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      notification = { ...notification, ...payload };
    } catch {
      notification.body = event.data.text();
    }
  }

  const target = new URL(
    typeof notification.url === 'string' ? notification.url : '/',
    self.location.origin,
  );
  const safeUrl = target.origin === self.location.origin ? target.href : self.location.origin;
  event.waitUntil(self.registration.showNotification(notification.title, {
    body: notification.body,
    icon: '/arc-irobot.png',
    badge: '/pwa-icon.svg',
    tag: notification.tag,
    data: { url: safeUrl },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data && typeof event.notification.data.url === 'string'
    ? event.notification.data.url
    : '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if ('focus' in client && new URL(client.url).origin === self.location.origin) {
        return client.navigate(target).then(() => client.focus());
      }
    }
    return self.clients.openWindow(target);
  }));
});
