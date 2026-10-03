const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { db, resetDb, startServer, agent, loggedIn, PACKAGE } = require('./helpers');

let server;
let users;

before(async () => {
  users = await resetDb();
  server = await startServer();
});
after(async () => {
  await server.close();
  await db.pool.end();
});

test('no se sirven el código del servidor, .env ni archivos ocultos', async () => {
  const a = agent(server.base);
  for (const path of ['/server/src/config.js', '/server/.env', '/.env', '/server/package.json', '/.git/config', '/../server/src/db.js']) {
    const res = await a.get(path);
    assert.notEqual(res.status, 200, path);
    assert.ok(!String(res.data).includes('DATABASE_URL'), path);
  }
});

test('la web lleva cabeceras de seguridad', async () => {
  const res = await agent(server.base).get('/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('no existe registro público', async () => {
  const res = await agent(server.base).post('/api/auth/register', { name: 'X', email: 'x@x.com', password: '12345678', role: 'admin' });
  assert.notEqual(res.status, 201);
  const row = await db.one("SELECT 1 FROM users WHERE email = 'x@x.com'");
  assert.equal(row, null);
});

test('login: error genérico, cookie HttpOnly y bloqueo tras 5 fallos', async () => {
  const a = agent(server.base);
  const unknown = await a.login('nadie@prueba.com', 'loquesea');
  const wrong = await a.login(users.operador.email, 'mala');
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(unknown.data.error, wrong.data.error, 'no debe delatar si el correo existe');

  const ok = await a.login(users.gestor.email);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/);
  assert.match(ok.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal(ok.data.user.password_hash, undefined);

  const victim = agent(server.base);
  for (let i = 0; i < 5; i += 1) await victim.login(users.operador.email, `mala-${i}`);
  const locked = await victim.login(users.operador.email);
  assert.equal(locked.status, 423);
  await db.query('UPDATE users SET locked_until = NULL WHERE id = $1', [users.operador.id]);
});

test('sin sesión no hay acceso a la API privada', async () => {
  const a = agent(server.base);
  for (const path of ['/api/shipments', '/api/clients', '/api/users', '/api/reports/dashboard', '/api/settings/export']) {
    assert.equal((await a.get(path)).status, 401, path);
  }
  const forged = await a.get('/api/shipments', { Authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.' });
  assert.equal(forged.status, 401);
});

test('los roles limitan lo que cada uno puede hacer', async () => {
  const operador = await loggedIn(server.base, users.operador.email);
  const gestor = await loggedIn(server.base, users.gestor.email);
  assert.equal((await operador.get('/api/shipments')).status, 200);
  assert.equal((await operador.get('/api/invoices')).status, 403);
  assert.equal((await operador.get('/api/cash')).status, 403);
  assert.equal((await operador.get('/api/users')).status, 403);
  assert.equal((await gestor.get('/api/invoices')).status, 200);
  assert.equal((await gestor.get('/api/users')).status, 403);
  assert.equal((await gestor.post('/api/users', { name: 'Nuevo', email: 'n@prueba.com', role: 'admin' })).status, 403);
  assert.equal((await gestor.get('/api/settings/export')).status, 403);
  // El operador ve la operación del día, pero no los importes de la empresa
  const dash = await operador.get('/api/reports/dashboard');
  assert.equal(dash.status, 200);
  assert.equal(dash.data.finance, false);
  assert.equal(dash.data.month, null);
  assert.equal(dash.data.chart, null);
  assert.equal(dash.data.counts.invoices_pending, undefined);
  assert.equal((await operador.get('/api/reports/summary')).status, 403);
  assert.equal((await gestor.get('/api/reports/dashboard')).data.finance, true);
});

test('cada empresa solo ve lo suyo, aunque mande la cabecera x-tenant-id', async () => {
  const mine = await loggedIn(server.base, users.admin.email);
  const other = await loggedIn(server.base, users.otra.email);
  const created = await mine.post('/api/shipments', PACKAGE);
  assert.equal(created.status, 201);
  const list = await other.get('/api/shipments', { 'x-tenant-id': 'epikaizo' });
  assert.equal(list.data.total, 0);
  assert.equal((await other.get(`/api/shipments/${created.data.shipment.id}`)).status, 404);
  assert.equal((await other.patch(`/api/shipments/${created.data.shipment.id}`, { notes: 'hack' })).status, 404);
});

test('protección CSRF: solo JSON y solo desde nuestro origen', async () => {
  const a = await loggedIn(server.base, users.admin.email);
  const form = await a.post('/api/shipments', 'kind=paquete', { 'Content-Type': 'application/x-www-form-urlencoded' });
  assert.equal(form.status, 415);
  const foreign = await a.post('/api/shipments', PACKAGE, { Origin: 'https://otra-web.com' });
  assert.equal(foreign.status, 403);
});

test('los filtros no permiten inyección SQL', async () => {
  const a = await loggedIn(server.base, users.admin.email);
  const res = await a.get(`/api/shipments?q=${encodeURIComponent("' OR 1=1; DROP TABLE users; --")}&status=${encodeURIComponent("x' OR '1'='1")}`);
  assert.equal(res.status, 200);
  assert.equal(res.data.total, 0);
  assert.ok(await db.one('SELECT 1 FROM users LIMIT 1'));
});

test('validación: los campos desconocidos se ignoran y los inválidos se rechazan', async () => {
  const a = await loggedIn(server.base, users.admin.email);
  const bad = await a.post('/api/shipments', { ...PACKAGE, sender_phone: 'abc' });
  assert.equal(bad.status, 422);
  const sneaky = await a.post('/api/shipments', { ...PACKAGE, tenant_id: 'otra', created_by: users.otra.id, total: 0.01 });
  assert.equal(sneaky.status, 201);
  assert.equal((await db.one('SELECT tenant_id FROM shipments WHERE id = $1', [sneaky.data.shipment.id])).tenant_id, 'epikaizo');
  assert.ok(Number(sneaky.data.shipment.total) > 1, 'el total lo calcula el servidor');
});

test('el último administrador no se puede degradar y nadie se cambia su propio rol', async () => {
  const admin = await loggedIn(server.base, users.admin.email);
  assert.equal((await admin.patch(`/api/users/${users.admin.id}`, { role: 'operador' })).status, 409);
});

test('al cambiar la contraseña se cierran las demás sesiones', async () => {
  const first = await loggedIn(server.base, users.gestor.email);
  const second = await loggedIn(server.base, users.gestor.email);
  const changed = await first.post('/api/auth/password', { current: 'Contrasena-de-prueba-1', password: 'Otra-Contrasena-Larga-2' });
  assert.equal(changed.status, 200);
  assert.equal((await first.get('/api/auth/me')).status, 200);
  assert.equal((await second.get('/api/auth/me')).status, 401);
});

test('webhook de WhatsApp: verificación y firma obligatorias', async () => {
  const a = agent(server.base);
  assert.equal((await a.get('/api/whatsapp?hub.mode=subscribe&hub.verify_token=mal&hub.challenge=1')).status, 403);
  const ok = await a.get('/api/whatsapp?hub.mode=subscribe&hub.verify_token=verify-de-prueba&hub.challenge=42');
  assert.equal(ok.data, '42');

  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { contacts: [{ wa_id: '240222000111', profile: { name: 'Pedro' } }], messages: [{ id: 'wamid.1', from: '240222000111', type: 'text', text: { body: 'Hola, precio a Bata?' } }] } }] }],
  });
  assert.equal((await a.post('/api/whatsapp', payload, { 'X-Hub-Signature-256': 'sha256=falsa' })).status, 401);
  const signature = 'sha256=' + crypto.createHmac('sha256', 'app-secret-de-prueba').update(payload).digest('hex');
  assert.equal((await a.post('/api/whatsapp', payload, { 'X-Hub-Signature-256': signature })).status, 200);
  await a.post('/api/whatsapp', payload, { 'X-Hub-Signature-256': signature }); // Meta reenvía: no se duplica
  await new Promise((r) => setTimeout(r, 200));
  const rows = await db.many("SELECT name, phone, body FROM messages WHERE channel = 'whatsapp'");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Pedro');
});

test('formulario de contacto público: guarda el mensaje, exige privacidad y frena el spam', async () => {
  const a = agent(server.base);
  const noPrivacy = await a.post('/api/public/contact', { name: 'Ana', phone: '222555666', message: 'Quiero un presupuesto' });
  assert.equal(noPrivacy.status, 422);
  const ok = await a.post('/api/public/contact', { name: 'Ana', phone: '222555666', topic: 'construccion', message: 'Quiero reformar el baño', privacy: true });
  assert.equal(ok.status, 201);
  const statuses = [];
  for (let i = 0; i < 6; i += 1) statuses.push((await a.post('/api/public/contact', { name: 'Ana', phone: '222555666', message: 'otra vez', privacy: true })).status);
  assert.ok(statuses.includes(429));
});

test('chatbot sin clave configurada responde 503, no un error interno', async () => {
  const res = await agent(server.base).post('/api/chatbot', { message: 'hola' });
  assert.equal(res.status, 503);
});
