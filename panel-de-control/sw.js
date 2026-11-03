// Service worker del panel: que abra aunque no haya red y que muestre los últimos datos vistos.
// - Archivos de la app (HTML, CSS, JS, fuentes, imágenes): primero la red (máx. 4 s) y, si no,
//   la copia guardada, que se actualiza cada vez que la red responde.
// - Datos (GET /api/...): primero la red; sin conexión, la última respuesta guardada, marcada con
//   la cabecera X-Epk-Offline para que el panel avise de que no son datos al momento.
// - Nunca se guardan las peticiones que cambian datos (POST, PATCH, DELETE) ni /api/auth/* salvo /me.
// Al cerrar sesión el panel borra la caché de datos (epk-api).
// Las peticiones a la red usan cache: 'no-cache': el navegador pregunta al servidor si hay versión
// nueva (respuesta 304 muy ligera si no la hay) en vez de usar su caché HTTP de 1 hora.
const APP_CACHE = 'epk-app-v2';
const API_CACHE = 'epk-api';
const SHELL = ['/panel/', '/panel/css/panel.css', '/css/fonts.css', '/panel/js/app.js', '/panel/js/api.js', '/panel/js/ui.js', '/panel/js/format.js', '/img/logo.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('epk-app-') && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isAsset = (url) => url.origin === location.origin && (/^\/panel\/(css|js|img)\//.test(url.pathname) || /^\/(css|fonts|img)\//.test(url.pathname) || url.pathname === '/favicon.svg');

// Archivos de la app: primero la red (así, tras una actualización, nunca se mezcla código viejo con
// el servidor nuevo), pero si la red tarda más de 4 s se usa la copia guardada. La descarga sigue y
// actualiza la copia para la próxima vez.
async function networkFirstAsset(request) {
  const cache = await caches.open(APP_CACHE);
  const fresh = fetch(request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  const slow = new Promise((resolve) => setTimeout(resolve, 4000, null));
  try {
    const first = await Promise.race([fresh, slow]);
    if (first) return first;
    return (await cache.match(request)) || (await fresh);
  } catch {
    return (await cache.match(request)) || new Response('', { status: 504 });
  }
}

async function networkFirstPage(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await fetch(request, { cache: 'no-cache' });
    if (res.ok) cache.put('/panel/', res.clone());
    return res;
  } catch {
    return (await cache.match('/panel/')) || new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (!cached) throw err;
    const headers = new Headers(cached.headers);
    headers.set('X-Epk-Offline', '1');
    return new Response(await cached.blob(), { status: cached.status, headers });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    // De /api/auth/ solo se guarda "quién soy" (para abrir el panel sin red); nada de exportaciones.
    if ((url.pathname.startsWith('/api/auth/') && url.pathname !== '/api/auth/me') || url.pathname.includes('/export') || url.pathname.endsWith('.csv')) return;
    event.respondWith(networkFirstApi(request));
    return;
  }
  if (request.mode === 'navigate' && (url.pathname === '/panel/' || url.pathname === '/panel')) {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (isAsset(url)) event.respondWith(networkFirstAsset(request));
});
