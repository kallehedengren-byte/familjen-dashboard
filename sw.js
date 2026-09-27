// Hedengrens Vecka service worker. Byt CACHE-version vid varje ändring av appskalet.
const CACHE = 'hedengren-v3';
const ASSETS = ['./', './index.html', './data.json', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const NET_TIMEOUT_MS = 7000;

self.addEventListener('install', e => {
  // Hämta förbi HTTP-cachen (GitHub Pages har max-age=600) och låt inte en enskild fil stoppa installationen.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(u =>
        fetch(new Request(u, { cache: 'reload' }))
          .then(r => (r && r.ok ? c.put(u, r) : null))
          .catch(() => null)
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  const isData = path.endsWith('/data.json');
  const isHtml = req.mode === 'navigate' || path.endsWith('/') || path.endsWith('/index.html');

  if (isData || isHtml) {
    // Nätverk först (med timeout), sparad kopia som reserv. Nyckel utan ?t=/v= så reserven faktiskt hittas.
    const key = isData ? new URL('./data.json', self.registration.scope).href : url.origin + path;
    const net = (isData ? fetch(req.url, { cache: 'no-store' }) : fetch(req)).then(r => {
      if (r && r.ok && !r.redirected) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(key, copy)).catch(() => {});
      }
      return r;
    });
    e.respondWith(
      withTimeout(net, NET_TIMEOUT_MS).catch(() =>
        caches.match(key).then(hit => hit || net)
      )
    );
    return;
  }

  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
