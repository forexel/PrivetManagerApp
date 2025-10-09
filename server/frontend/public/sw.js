const VERSION = 'v3';
const RUNTIME = `privet-runtime-${VERSION}`;

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== RUNTIME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isSameOrigin(url) {
  try { const u = new URL(url); return u.origin === self.location.origin; } catch { return true; }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Не кэшируем API и не-GET
  if (req.method !== 'GET' || (isSameOrigin(req.url) && url.pathname.startsWith('/api/'))) {
    return; // сеть по умолчанию
  }

  // HTML (навигация) — network-first, чтобы видеть обновления без очистки кэша
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(RUNTIME);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match('/index.html');
      }
    })());
    return;
  }

  // Ассеты из /assets — stale-while-revalidate
  if (isSameOrigin(req.url) && url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req).then((resp) => {
        if (resp && resp.status === 200) cache.put(req, resp.clone()).catch(() => {});
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    })());
    return;
  }

  // Остальное — сеть с фолбэком на кэш (например, иконки)
  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch {
      const cached = await caches.match(req);
      return cached || Response.error();
    }
  })());
});
