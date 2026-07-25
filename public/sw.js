/* Field app service worker: installability + Web Push. No asset caching — Next's
   hashed bundles make that risky, and the field app is online-first. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// A fetch handler must exist for the app to be installable; pass through untouched.
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: "Let's Get Quoted", body: event.data ? event.data.text() : '' };
  }
  const title = data.title || "Let's Get Quoted";
  const options = {
    body: data.body || '',
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: data.tag,
    data: { url: data.url || '/field' },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/field';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/field') && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
