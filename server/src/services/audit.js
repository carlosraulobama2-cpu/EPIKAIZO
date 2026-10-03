const db = require('../db');

/** Deja constancia de quién hizo qué. Nunca guarda contraseñas ni tokens. */
async function audit(req, action, { entity = null, entityId = null, details = null } = {}, client) {
  const user = req.user || {};
  await db.query(
    'INSERT INTO audit_log (tenant_id, user_id, user_name, action, entity, entity_id, details, ip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [req.tenantId || user.tenant_id || '-', user.id || null, user.name || null, action, entity, entityId ? String(entityId) : null, details, req.ip],
    client
  );
}

module.exports = { audit };
