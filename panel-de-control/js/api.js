// Cliente de la API. La sesión va en una cookie HttpOnly: el JavaScript nunca ve ni guarda el token.

export class ApiError extends Error {
  constructor(status, message, fields, code) {
    super(message);
    this.status = status;
    this.fields = fields || null;
    this.code = code || null;
  }
}

// Aviso fijo arriba cuando el panel muestra datos guardados por falta de conexión.
let offlineBar = null;
function setOffline(on) {
  if (on) {
    if (!offlineBar) {
      offlineBar = document.createElement('div');
      offlineBar.className = 'offline-bar';
      offlineBar.setAttribute('role', 'status');
      offlineBar.textContent = 'Sin conexión: estás viendo los últimos datos guardados. Los cambios no se pueden guardar hasta que vuelva la red.';
    }
    // El panel redibuja la página al arrancar: si el aviso se quitó, se vuelve a poner.
    if (!offlineBar.isConnected) document.body.prepend(offlineBar);
  } else if (offlineBar) {
    offlineBar.remove();
    offlineBar = null;
  }
}
window.addEventListener('online', () => setOffline(false));

/** Borra los datos guardados para usar sin conexión (al cerrar sesión). */
export function clearOfflineData() {
  return 'caches' in window ? caches.delete('epk-api').catch(() => false) : Promise.resolve(false);
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    setOffline(true);
    throw new ApiError(0, 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.');
  }
  // Sin conexión, el service worker devuelve los últimos datos guardados y lo marca.
  setOffline(res.headers.get('X-Epk-Offline') === '1');
  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.location.replace(`/panel/login?volver=${encodeURIComponent(location.hash || '#/resumen')}`);
    throw new ApiError(401, 'Tu sesión ha caducado');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || 'Algo ha fallado. Inténtalo de nuevo.', data && data.fields, data && data.code);
  return data;
}

/** Convierte {a: 1, b: ''} en "?a=1" (omite vacíos). */
export function qs(params) {
  const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
}

export const api = {
  get: (path, params) => request('GET', path + qs(params)),
  post: (path, body = {}) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
};
