const crypto = require('crypto');
const db = require('../db');

/** Busca el cliente por teléfono o lo crea; así el directorio de clientes se llena solo con cada envío o trabajo. */
async function upsertClient(tenantId, { name, phone, email = null, city = null, document = null }, client) {
  const row = await db.one(
    `INSERT INTO clients (id, tenant_id, name, phone, email, city, document)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tenant_id, phone) DO UPDATE SET
       name = EXCLUDED.name,
       email = COALESCE(EXCLUDED.email, clients.email),
       city = COALESCE(EXCLUDED.city, clients.city),
       document = COALESCE(EXCLUDED.document, clients.document),
       updated_at = now()
     RETURNING id`,
    [crypto.randomUUID(), tenantId, name, phone, email, city, document],
    client
  );
  return row.id;
}

module.exports = { upsertClient };
