/* ============================================================
   TestNotify — Service Worker
   Offline caching · Background sync
   ============================================================ */

const CACHE_NAME = 'testnotify-v1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
];

// Install: cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: clear old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first strategy
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

// Push notification handler
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'TestNotify', {
      body: data.body || 'มีการแจ้งเตือนการทดสอบ',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: data.tag || 'testnotify',
      data: { url: data.url || '/' },
    })
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(wins => {
      if (wins.length > 0) { wins[0].focus(); return; }
      return clients.openWindow('./index.html');
    })
  );
});

// Periodic check (if supported)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'check-tests') {
    event.waitUntil(checkAndNotify());
  }
});

async function checkAndNotify() {
  // Open IndexedDB from service worker context
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('testnotify-db', 1);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });

  const items = await new Promise((resolve, reject) => {
    const tx  = db.transaction('items', 'readonly');
    const req = tx.objectStore('items').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });

  const today = new Date(); today.setHours(0,0,0,0);
  const addDays = (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r; };
  const diffDays = (a,b) => Math.round((new Date(a)-new Date(b))/86400000);

  const alerts = items.filter(item => {
    const next = addDays(new Date(item.last), item.freq);
    const d = diffDays(next, today);
    return d <= 7;
  });

  for (const item of alerts) {
    const next = addDays(new Date(item.last), item.freq);
    const d    = diffDays(next, today);
    const msg  = d < 0 ? `เกินกำหนด ${Math.abs(d)} วัน` : d === 0 ? 'ถึงกำหนดวันนี้!' : `อีก ${d} วันถึงกำหนด`;
    await self.registration.showNotification(`TestNotify — ${item.id}`, {
      body: `${item.name}\n${item.test} · ${msg}`,
      icon: './icons/icon-192.png',
      tag: `notify-${item.id}`,
    });
  }
}
