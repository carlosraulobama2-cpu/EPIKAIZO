// Cliente de la API. La sesión va en una cookie HttpOnly: el JavaScript nunca ve ni guarda el token.

export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || null;
  }
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
    throw new ApiError(0, 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.');
  }
  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.location.replace(`/login.html?volver=${encodeURIComponent(location.hash || '#/resumen')}`);
    throw new ApiError(401, 'Tu sesión ha caducado');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || 'Algo ha fallado. Inténtalo de nuevo.', data && data.fields);
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
