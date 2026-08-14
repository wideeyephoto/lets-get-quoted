/* Field app service worker: installability, offline, a write queue, and Web Push.
 *
 * WHAT THIS USED TO SAY: "No asset caching — Next's hashed bundles make that
 * risky, and the field app is online-first." Both halves were wrong in the place
 * this app is actually used. Hashed bundles are the SAFEST thing to cache —
 * the hash IS the cache key, so a stale one is impossible. And a roofer in a
 * valley, a basement, a steel-framed warehouse or forty miles up a county road
 * is not online-first; they are online-sometimes. The app went white, and the
 * hours they'd just worked went with it.
 *
 * Three caches, each with a different rule, because they answer different
 * questions:
 *
 *   assets — /_next/static and icons. Content-addressed, so cache-first forever.
 *   pages  — /field screens. Network-first: the network is the truth when there
 *            is one, and last-known-good beats a dinosaur when there isn't.
 *   shell  — the offline fallback, precached at install so it exists before it
 *            is needed. A fallback fetched on demand is a fallback that isn't
 *            there in the one situation it exists for.
 *
 * And a queue: clock in/out, notes and materials POSTed to /field/api/queue are
 * held in IndexedDB when the network drops and replayed when it comes back.
 * Every one of those writes carries an idempotency key, so replaying one twice
 * costs nothing — which is what makes retrying safe enough to do automatically.
 */

const VERSION = 'field-v2';
const ASSET_CACHE = `${VERSION}-assets`;
const PAGE_CACHE = `${VERSION}-pages`;
const SHELL_CACHE = `${VERSION}-shell`;
const CURRENT_CACHES = [ASSET_CACHE, PAGE_CACHE, SHELL_CACHE];

const OFFLINE_URL = '/field/offline';
const QUEUE_PATH = '/field/api/queue';
const SYNC_TAG = 'field-queue';

// How many /field pages to keep. Today's route plus its jobs plus My pay is a
// dozen at most; the cap stops a long-lived install quietly hoarding every job
// this person has ever opened.
const MAX_PAGES = 40;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, '/favicon.png']))
      // A precache miss must not block activation — an app with no offline
      // fallback still beats no app.
      .catch((err) => console.error('Field SW precache failed:', err))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// -- the write queue ---------------------------------------------------------

const DB_NAME = 'field-queue';
const DB_VERSION = 1;
const STORE = 'requests';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(db, mode, run) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const request = run(store);
    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function enqueue(record) {
  const db = await openDb();
  await tx(db, 'readwrite', (store) => store.add(record));
  db.close();
}

async function queued() {
  const db = await openDb();
  const rows = await tx(db, 'readonly', (store) => store.getAll());
  db.close();
  return rows || [];
}

async function forget(id) {
  const db = await openDb();
  await tx(db, 'readwrite', (store) => store.delete(id));
  db.close();
}

async function emptyQueue() {
  const db = await openDb();
  await tx(db, 'readwrite', (store) => store.clear());
  db.close();
}

async function tell(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) client.postMessage(message);
}

async function askForSync() {
  try {
    await self.registration.sync.register(SYNC_TAG);
  } catch (err) {
    // Background Sync isn't everywhere (Safari, most notably). The page nudges
    // us on its own 'online' event instead — see FieldOfflineWarm.
  }
}

/**
 * Send it, or keep it.
 *
 * A 4xx is an ANSWER — the server read the request and refused it — so it goes
 * back to the page untouched. Only a request that never reached anybody is
 * queued, because that is the only kind where trying again later is honest.
 */
async function sendOrQueue(request) {
  const copy = request.clone();
  try {
    return await fetch(request);
  } catch (err) {
    let body = '';
    try {
      body = await copy.text();
    } catch (readError) {
      // Nothing to queue if the body can't be read; fail loudly rather than
      // storing an empty write that would look like a successful one.
      return new Response(JSON.stringify({ queued: false, error: 'unreadable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    await enqueue({ url: copy.url, body, queuedAt: Date.now() });
    await askForSync();
    const pending = (await queued()).length;
    await tell({ type: 'field-queue-changed', pending });
    return new Response(JSON.stringify({ queued: true, pending }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function drainQueue() {
  const rows = await queued();
  if (rows.length === 0) return;

  let sent = 0;
  for (const row of rows) {
    let response;
    try {
      response = await fetch(row.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: row.body,
        credentials: 'include',
      });
    } catch (err) {
      // Still offline. Keep everything, in order, and stop — draining half a
      // queue out of order is how a clock-out lands before its clock-in.
      break;
    }
    if (response.ok) {
      await forget(row.id);
      sent += 1;
      continue;
    }
    if (response.status >= 400 && response.status < 500) {
      // The server has looked at it and said no. It will say no again in an
      // hour, so this is dropped rather than retried forever — and the page is
      // told, so somebody can be shown that it didn't take.
      await forget(row.id);
      await tell({ type: 'field-queue-rejected', status: response.status });
      continue;
    }
    break; // 5xx: their problem, and it may pass. Keep it.
  }

  const pending = (await queued()).length;
  await tell({ type: 'field-queue-changed', pending, sent });
}

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(drainQueue());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'field-drain') {
    event.waitUntil(drainQueue());
    return;
  }
  if (data.type === 'field-warm' && Array.isArray(data.urls)) {
    event.waitUntil(warm(data.urls));
    return;
  }
  if (data.type === 'field-queue-count') {
    event.waitUntil(queued().then((rows) => tell({ type: 'field-queue-changed', pending: rows.length })));
  }
});

// -- caching -----------------------------------------------------------------

/**
 * Pull today's work in while there's still signal.
 *
 * The pages a crew member needs offline are the ones they haven't opened yet:
 * stop three's scope, on the drive to stop two. Waiting for them to visit each
 * one first would mean the cache is always exactly one screen behind where they
 * are going.
 */
async function warm(urls) {
  const cache = await caches.open(PAGE_CACHE);
  for (const url of urls.slice(0, MAX_PAGES)) {
    try {
      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) await cache.put(url, response.clone());
    } catch (err) {
      // Warming is opportunistic by definition.
    }
  }
  await trim(cache);
}

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_PAGES) return;
  for (const key of keys.slice(0, keys.length - MAX_PAGES)) await cache.delete(key);
}

async function pageFirstFromNetwork(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);

    // THE SESSION BEHIND THE CACHE IS GONE. Cached /field pages are somebody's
    // customer names, site addresses and phone numbers, and the only purge used
    // to be an explicit sign-out — which is the one thing nobody does to an app
    // that lives on their home screen. A session that has expired, or access
    // that an owner has revoked, both surface here: as a 401/403, or as a
    // redirect to the sign-in wall. Either is the signal to forget.
    if (response.status === 401 || response.status === 403 || redirectedToLogin(response)) {
      await forgetPages();
      return response;
    }

    if (response.ok) {
      await cache.put(request, response.clone());
      await trim(cache);
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const fallback = await caches.match(OFFLINE_URL);
    return (
      fallback ||
      new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    );
  }
}

async function assetFirstFromCache(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

/** A page response that ended up at the sign-in wall. */
function redirectedToLogin(response) {
  if (!response.redirected || !response.url) return false;
  try {
    return new URL(response.url).pathname.startsWith('/field/login');
  } catch (err) {
    return false;
  }
}

/**
 * Drop the cached pages, keeping the queue.
 *
 * Used when the ACCOUNT changes rather than the person: switching business, or
 * a session that has lapsed. The queued writes still belong to the crew member
 * who made them and are still addressed to the job they named, so throwing them
 * away would lose work that a sign-in is about to make deliverable.
 */
async function forgetPages() {
  await caches.delete(PAGE_CACHE);
}

/** Everything a signed-out device must not keep. */
async function forgetEverything() {
  await Promise.all([caches.delete(PAGE_CACHE), emptyQueue().catch(() => {})]);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === 'POST') {
    if (url.pathname === QUEUE_PATH) {
      event.respondWith(sendOrQueue(request));
      return;
    }
    // Signing out has to take the cached pages with it. They are somebody's
    // customer addresses and phone numbers, and a phone that changes hands
    // between crews should not still have them.
    if (url.pathname === '/auth/signout') event.waitUntil(forgetEverything());
    // Switching business is the same problem wearing different clothes: the
    // person is still entitled to the app, but every cached page belongs to the
    // account they are leaving, and serving one offline afterwards would show
    // account A's customers under account B's name. The queue survives — those
    // writes name their own job and are still owed to whoever they were for.
    if (url.pathname === '/field/choose') event.waitUntil(forgetPages());
    return;
  }

  if (request.method !== 'GET') return;

  // Hashed bundles, icons, fonts: the URL changes when the content does, so
  // cache-first is exact rather than merely fast.
  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/favicon.png' || url.pathname === '/manifest.webmanifest') {
    event.respondWith(assetFirstFromCache(request));
    return;
  }

  // Full page loads inside the field app. Deliberately NOT the router's own
  // RSC fetches (mode 'cors'/'same-origin', not 'navigate'): those return a
  // flight payload, and caching one under a page URL would hand back a stream
  // of component data where a document belongs.
  if (
    request.mode === 'navigate' &&
    url.pathname.startsWith('/field') &&
    // The sign-in and business-picker screens are decisions, not content.
    // Serving a cached one would show a stale answer to a live question.
    !url.pathname.startsWith('/field/login') &&
    !url.pathname.startsWith('/field/choose')
  ) {
    event.respondWith(pageFirstFromNetwork(request));
  }
});

// -- push --------------------------------------------------------------------

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

/**
 * Open the thing the notification was ABOUT.
 *
 * This used to focus any open /field window and stop there, so a "new job
 * assigned" tap landed on whatever screen happened to be open — usually
 * yesterday's job. An existing window is still reused (a second copy of the app
 * is nobody's idea of an improvement), but it is navigated to the target first.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/field';
  const targetUrl = new URL(target, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (!client.url.includes('/field')) continue;
        if ('navigate' in client && client.url !== targetUrl) {
          try {
            const navigated = await client.navigate(targetUrl);
            if (navigated && 'focus' in navigated) return navigated.focus();
          } catch (err) {
            // Some browsers refuse navigate() on a client they didn't control
            // at load. Focusing is still better than opening a duplicate.
          }
        }
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
