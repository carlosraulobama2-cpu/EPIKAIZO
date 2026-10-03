// Crea un administrador o restablece su contraseña desde la terminal (por ejemplo en la Shell de Render):
//   npm run create-admin -- correo@empresa.com "Nombre Apellido"
// La contraseña temporal se muestra una vez; al entrar, el panel obliga a cambiarla.
require('dotenv').config({ path: process.env.ENV_FILE || require('path').join(__dirname, '../.env') });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const db = require('../src/db');

async function main() {
  const [email, name = 'Administración'] = process.argv.slice(2);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    console.error('Uso: npm run create-admin -- correo@empresa.com "Nombre"');
    process.exit(1);
  }
  await db.migrate();
  await db.query('INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [config.tenantId, 'Epikaizo Services']);
  const password = crypto.randomBytes(9).toString('base64url');
  const hash = await bcrypt.hash(password, 12);
  await db.query(
    `INSERT INTO users (id, tenant_id, name, email, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4, $5, 'admin', true)
     ON CONFLICT ((lower(email))) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin', status = 'activo',
       must_change_password = true, failed_logins = 0, locked_until = NULL, token_version = users.token_version + 1`,
    [crypto.randomUUID(), config.tenantId, name, email.toLowerCase(), hash]
  );
  console.log(`Administrador listo: ${email}\nContraseña temporal: ${password}\n(Se pedirá cambiarla al entrar.)`);
  await db.pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
