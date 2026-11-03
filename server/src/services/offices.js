// Oficinas o sucursales. Toda empresa arranca con Malabo y Bata; después se gestionan en Ajustes.
const crypto = require('crypto');
const db = require('../db');

const DEFAULT_OFFICES = [
  ['Malabo', 'Malabo'],
  ['Bata', 'Bata'],
];

/** Crea las oficinas de partida si la empresa aún no tiene ninguna. Devuelve las oficinas. */
async function ensureOffices(tenantId, client) {
  const existing = await db.one('SELECT count(*)::int AS n FROM offices WHERE tenant_id = $1', [tenantId], client);
  if (!existing.n) {
    for (const [name, city] of DEFAULT_OFFICES) {
      await db.query('INSERT INTO offices (id, tenant_id, name, city) VALUES ($1, $2, $3, $4) ON CONFLICT (tenant_id, name) DO NOTHING', [crypto.randomUUID(), tenantId, name, city], client);
    }
  }
  return db.many('SELECT * FROM offices WHERE tenant_id = $1 ORDER BY name', [tenantId], client);
}

/** Oficina de trabajo de una petición: la indicada (si existe y está activa) o la del usuario. */
async function resolveOffice(req, officeId, client) {
  const id = officeId || req.user.office_id;
  if (!id) return null;
  const office = await db.one('SELECT id FROM offices WHERE id = $1 AND tenant_id = $2 AND active', [id, req.tenantId], client);
  return office ? office.id : null;
}

module.exports = { ensureOffices, resolveOffice, DEFAULT_OFFICES };
