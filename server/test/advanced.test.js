const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, resetDb, startServer, agent, loggedIn, PASSWORD } = require('./helpers');
const totp = require('../src/lib/totp');
const backup = require('../src/services/backup');

let server;
let users;
let admin;
let gestor;
let operador;

before(async () => {
  users = await resetDb();
  server = await startServer();
  admin = await loggedIn(server.base, users.admin.email);
  gestor = await loggedIn(server.base, users.gestor.email);
  operador = await loggedIn(server.base, users.operador.email);
});
after(async () => {
  await server.close();
  await db.pool.end();
});

test('2FA: activar con la app, entrar con código y con un código de recuperación de un solo uso', async () => {
  const setup = await gestor.post('/api/auth/2fa/setup');
  assert.equal(setup.status, 200);
  assert.match(setup.data.otpauth, /^otpauth:\/\/totp\/Epikaizo/);
  assert.match(setup.data.qr, /^data:image\/png;base64,/);
  assert.equal((await gestor.post('/api/auth/2fa/enable', { code: '000000' })).status, 422);
  const enabled = await gestor.post('/api/auth/2fa/enable', { code: totp.codeAt(setup.data.secret) });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.data.recovery_codes.length, 8);

  // La contraseña ya no basta: se recibe un permiso provisional, sin sesión.
  const a = agent(server.base);
  const step1 = await a.login(users.gestor.email);
  assert.equal(step1.data.two_factor, true);
  assert.equal(step1.data.user, undefined);
  assert.equal((await a.get('/api/auth/me')).status, 401);
  // El permiso provisional no sirve como sesión (ni como cookie ni como cabecera).
  assert.equal((await agent(server.base).get('/api/auth/me', { Authorization: `Bearer ${step1.data.challenge}` })).status, 401);

  assert.equal((await a.post('/api/auth/2fa/verify', { challenge: step1.data.challenge, code: '123456' })).status, 401);
  const ok = await a.post('/api/auth/2fa/verify', { challenge: step1.data.challenge, code: totp.codeAt(setup.data.secret) });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.totp_enabled, true);
  assert.equal((await a.get('/api/shipments')).status, 200);

  // Código de recuperación: entra una vez; la segunda, no.
  const b = agent(server.base);
  const s2 = await b.login(users.gestor.email);
  const rec = enabled.data.recovery_codes[0];
  assert.equal((await b.post('/api/auth/2fa/verify', { challenge: s2.data.challenge, code: rec.toLowerCase() })).status, 200);
  const c = agent(server.base);
  const s3 = await c.login(users.gestor.email);
  assert.equal((await c.post('/api/auth/2fa/verify', { challenge: s3.data.challenge, code: rec })).status, 401);

  // Desactivar exige contraseña y código.
  assert.equal((await a.post('/api/auth/2fa/disable', { password: 'mala', code: totp.codeAt(setup.data.secret) })).status, 400);
  assert.equal((await a.post('/api/auth/2fa/disable', { password: PASSWORD, code: totp.codeAt(setup.data.secret) })).status, 200);
  const plain = await agent(server.base).login(users.gestor.email);
  assert.ok(plain.data.user, 'sin 2FA vuelve a entrar solo con la contraseña');
});

test('2FA obligatoria para administradores y un admin puede quitársela a otro', async () => {
  const current = (await admin.get('/api/settings')).data;
  const save = (security) => admin.put('/api/settings', { company: current.company, rates: current.rates, security });
  assert.equal((await save({ require_admin_2fa: true, idle_minutes: 30 })).status, 409, 'primero la propia');

  const setup = await admin.post('/api/auth/2fa/setup');
  await admin.post('/api/auth/2fa/enable', { code: totp.codeAt(setup.data.secret) });
  const saved = await save({ require_admin_2fa: true, idle_minutes: 20 });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.security.idle_minutes, 20);

  // Otro administrador sin 2FA: solo puede activarla.
  const id = crypto.randomUUID();
  await db.query('INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5, $6)', [id, 'epikaizo', 'Admin Dos', 'admin2@prueba.com', await bcrypt.hash(PASSWORD, 4), 'admin']);
  const second = await loggedIn(server.base, 'admin2@prueba.com');
  const blocked = await second.get('/api/shipments');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'two_factor_setup_required');
  assert.equal((await second.post('/api/auth/2fa/setup')).status, 200);
  // Los demás roles no se ven afectados.
  assert.equal((await operador.get('/api/shipments')).status, 200);

  const s2 = await db.one('SELECT totp_pending FROM users WHERE id = $1', [id]);
  await second.post('/api/auth/2fa/enable', { code: totp.codeAt(s2.totp_pending) });
  assert.equal((await admin.post(`/api/users/${id}/reset-2fa`)).status, 200);
  assert.equal((await db.one('SELECT totp_enabled FROM users WHERE id = $1', [id])).totp_enabled, false);
  await save({ require_admin_2fa: false, idle_minutes: 30 });
});

test('copias de seguridad: manual, registro de errores y la diaria no se repite', async () => {
  const uploads = [];
  backup.setUploader(async (name, buf) => { uploads.push({ name, size: buf.length }); return { destination: 'Prueba', fileId: 'abc' }; });
  const run = await admin.post('/api/backups/run');
  assert.equal(run.status, 201);
  assert.equal(run.data.item.status, 'ok');
  assert.match(uploads[0].name, /^epikaizo-copia-\d{4}-\d{2}-\d{2}-\d{4}\.json\.gz$/);
  assert.ok(uploads[0].size > 100);
  assert.equal(await backup.maybeDailyBackup('epikaizo'), null, 'ya hay una copia de hoy');

  backup.setUploader(async () => { throw new Error('Drive sin espacio'); });
  const failed = await admin.post('/api/backups/run');
  assert.equal(failed.status, 502);
  const list = await admin.get('/api/backups');
  assert.equal(list.data.warning, true, 'el último intento falló: hay que avisar');
  assert.equal(list.data.items[0].error, 'Drive sin espacio');
  assert.equal((await gestor.get('/api/backups')).status, 403);
  backup.setUploader(null);
});

test('inventario y rentabilidad de obra: salida a obra suma su coste; ajuste por recuento; aviso de mínimo', async () => {
  const job = (await gestor.post('/api/jobs', { category: 'construccion', title: 'Reforma de baño', client_name: 'Rosa Mba', client_phone: '+240 222 000 111', budget: 200000, price: 250000 })).data.item;
  const cem = (await gestor.post('/api/materials', { name: 'Cemento 50 kg', unit: 'saco', stock: 10, min_stock: 8, unit_cost: 5000 })).data.item;
  assert.equal((await operador.post('/api/materials', { name: 'X', unit: 'ud', min_stock: 0, unit_cost: 0 })).status, 403);

  const out = await operador.post(`/api/materials/${cem.id}/movements`, { type: 'salida', quantity: 3, job_id: job.id });
  assert.equal(out.status, 201);
  assert.equal(Number(out.data.item.stock), 7);
  assert.equal(Number(out.data.cost.amount), 15000);
  assert.equal((await operador.post(`/api/materials/${cem.id}/movements`, { type: 'salida', quantity: 20 })).status, 409);

  const list = await operador.get('/api/materials');
  assert.equal(list.data.items[0].low, true, 'quedan 7 y el mínimo es 8');
  assert.equal(list.data.low_count, 1);

  const buy = await operador.post(`/api/materials/${cem.id}/movements`, { type: 'entrada', quantity: 7, unit_cost: 6000 });
  assert.equal(Number(buy.data.item.stock), 14);
  assert.equal(Number(buy.data.item.unit_cost), 5500, 'media ponderada: 7×5.000 + 7×6.000');
  const count = await operador.post(`/api/materials/${cem.id}/movements`, { type: 'ajuste', quantity: 13, notes: 'Recuento' });
  assert.equal(Number(count.data.movement.delta), -1);

  await gestor.post(`/api/jobs/${job.id}/costs`, { kind: 'mano_obra', concept: 'Albañil (5 días)', quantity: 5, unit_cost: 15000 });
  const p = await gestor.get(`/api/jobs/${job.id}/costs`);
  assert.equal(p.data.summary.costs, 15000 + 75000);
  assert.equal(p.data.summary.revenue, 250000);
  assert.equal(p.data.summary.revenue_source, 'precio');
  assert.equal(p.data.summary.margin, 160000);
  assert.equal(p.data.summary.margin_pct, 64);
  assert.equal(p.data.summary.budget_used_pct, 45);
  assert.equal((await operador.get(`/api/jobs/${job.id}/costs`)).status, 403, 'los costes son de gestores');

  // Quitar el coste de material devuelve los sacos al almacén.
  const matCost = p.data.costs.find((c) => c.kind === 'materiales');
  const afterDel = await gestor.del(`/api/jobs/${job.id}/costs/${matCost.id}`);
  assert.equal(afterDel.data.summary.costs, 75000);
  assert.equal(Number((await db.one('SELECT stock FROM materials WHERE id = $1', [cem.id])).stock), 16);

  const rep = await gestor.get('/api/reports/jobs?from=2020-01-01&to=2099-12-31');
  const row = rep.data.items.find((j) => j.id === job.id);
  assert.equal(Number(row.costs), 75000);
  assert.equal(row.margin, 175000);
});
