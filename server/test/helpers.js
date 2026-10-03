// Utilidades de prueba: base de datos de pruebas limpia, servidor en un puerto libre y sesiones por rol.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://epk:epk@localhost:5432/epikaizo_test';
process.env.JWT_SECRET = 'test-secret-que-solo-se-usa-en-pruebas-0123456789';
process.env.PUBLIC_URL = 'http://localhost';
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-de-prueba';
process.env.WHATSAPP_APP_SECRET = 'app-secret-de-prueba';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const config = require('../src/config');
const { createApp } = require('../src/app');

const PASSWORD = 'Contrasena-de-prueba-1';

async function resetDb() {
  await db.query('DROP SCHEMA public CASCADE');
  await db.query('CREATE SCHEMA public');
  await db.migrate();
  await db.query('INSERT INTO tenants (id, name) VALUES ($1, $2), ($3, $4)', [config.tenantId, 'Epikaizo', 'otra', 'Otra empresa']);
  const hash = await bcrypt.hash(PASSWORD, 4);
  const users = {};
  for (const [role, tenant] of [['admin', config.tenantId], ['gestor', config.tenantId], ['operador', config.tenantId], ['otra', 'otra']]) {
    const id = crypto.randomUUID();
    await db.query('INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5,$6)', [
      id, tenant, `Usuario ${role}`, `${role}@prueba.com`, hash, role === 'otra' ? 'admin' : role,
    ]);
    users[role] = { id, email: `${role}@prueba.com` };
  }
  return users;
}

async function startServer() {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Cliente HTTP con su propia cookie de sesión. */
function agent(base) {
  let cookie = '';
  const request = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      redirect: 'manual',
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  };
  return {
    get: (p, h) => request('GET', p, undefined, h),
    post: (p, b, h) => request('POST', p, b ?? {}, h),
    patch: (p, b) => request('PATCH', p, b),
    put: (p, b) => request('PUT', p, b),
    del: (p) => request('DELETE', p),
    login: (email, password = PASSWORD) => request('POST', '/api/auth/login', { email, password }),
  };
}

async function loggedIn(base, email) {
  const a = agent(base);
  const res = await a.login(email);
  if (res.status !== 200) throw new Error(`Login de prueba fallido: ${JSON.stringify(res.data)}`);
  return a;
}

const PACKAGE = {
  kind: 'paquete',
  scope: 'nacional',
  sender_name: 'María Obiang Nguema',
  sender_phone: '+240 222 111 222',
  receiver_name: 'Juan Esono',
  receiver_phone: '222 333 444',
  origin: 'Malabo',
  destination: 'Bata',
  weight_kg: 3,
  paid: true,
  payment_method: 'efectivo',
};

module.exports = { db, config, resetDb, startServer, agent, loggedIn, PASSWORD, PACKAGE };
