const crypto = require('crypto');
const db = require('../db');

/** Guía pública EPZ-000000: aleatoria (no se puede adivinar la siguiente) y única. */
async function newTrackingCode(client) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `EPZ-${String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')}`;
    const taken = await db.one('SELECT 1 FROM shipments WHERE tracking_code = $1', [code], client);
    if (!taken) return code;
  }
  throw new Error('No se pudo generar una guía única');
}

/** Siguiente número de una serie (facturas, trabajos) sin duplicados aunque haya peticiones a la vez. */
async function nextNumber(tenantId, name, client) {
  const row = await db.one(
    `INSERT INTO counters (tenant_id, name, value) VALUES ($1, $2, 1)
     ON CONFLICT (tenant_id, name) DO UPDATE SET value = counters.value + 1
     RETURNING value`,
    [tenantId, name],
    client
  );
  return Number(row.value);
}

async function invoiceNumber(tenantId, client) {
  const year = new Date().getFullYear();
  const n = await nextNumber(tenantId, `factura-${year}`, client);
  return `FAC-${year}-${String(n).padStart(5, '0')}`;
}

async function jobCode(tenantId, client) {
  const n = await nextNumber(tenantId, 'trabajo', client);
  return `SRV-${String(n).padStart(5, '0')}`;
}

module.exports = { newTrackingCode, invoiceNumber, jobCode };
