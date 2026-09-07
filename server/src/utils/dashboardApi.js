const API_BASE = 'http://localhost:3001/api';

async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-tenant-id': getTenantId(),
    ...options.headers
  };
  const res = await fetch(API_BASE + endpoint, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error' }));
    throw new Error(err.error || 'Error en la petición');
  }
  return res.json();
}

function getTenantId() {
  try { return JSON.parse(localStorage.getItem('epk_tenant')).id; } catch (e) { return ''; }
}

async function fetchAll(table) {
  return api('/' + table);
}

async function createItem(table, data) {
  return api('/' + table, { method: 'POST', body: JSON.stringify(data) });
}

async function updateItem(table, id, data) {
  return api('/' + table + '/' + id, { method: 'PUT', body: JSON.stringify(data) });
}

async function deleteItem(table, id) {
  return api('/' + table + '/' + id, { method: 'DELETE' });
}

module.exports = {
  api, fetchAll, createItem, updateItem, deleteItem, getTenantId
};
