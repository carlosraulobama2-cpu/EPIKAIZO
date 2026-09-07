const API_BASE = 'http://localhost:3001/api';

async function apiCall(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  const res = await fetch(API_BASE + endpoint, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error' }));
    throw new Error(err.error || 'Error en la petición');
  }
  return res.json();
}

module.exports = { apiCall };
