// Primer arranque: crea la empresa y, si no hay ningún usuario, el administrador inicial desde
// ADMIN_EMAIL y ADMIN_PASSWORD. No existe ninguna contraseña por defecto.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('./config');
const db = require('./db');

async function bootstrap() {
  await db.query('INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [config.tenantId, 'Epikaizo Services']);
  const users = await db.one('SELECT count(*)::int AS n FROM users WHERE tenant_id = $1', [config.tenantId]);
  if (users.n > 0) return;

  const { email, password, name } = config.admin;
  if (!email || !password) {
    console.warn('[epikaizo] No hay usuarios. Define ADMIN_EMAIL y ADMIN_PASSWORD (mín. 12 caracteres) y reinicia para crear el administrador.');
    return;
  }
  if (password.length < 12) throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres');
  await db.query(
    `INSERT INTO users (id, tenant_id, name, email, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4, $5, 'admin', true)`,
    [crypto.randomUUID(), config.tenantId, name, email.toLowerCase(), await bcrypt.hash(password, 12)]
  );
  console.log(`[epikaizo] Administrador inicial creado: ${email}. Se le pedirá cambiar la contraseña al entrar.`);
}

module.exports = { bootstrap };
