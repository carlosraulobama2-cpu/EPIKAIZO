const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetDb, startServer, agent, loggedIn, PACKAGE } = require('./helpers');

let server;
let users;
let admin;

before(async () => {
  users = await resetDb();
  server = await startServer();
  admin = await loggedIn(server.base, users.admin.email);
});
after(async () => {
  await server.close();
  await db.pool.end();
});

test('envío de paquete: guía, precio según tarifas, cliente, factura y rastreo público', async () => {
  const res = await admin.post('/api/shipments', PACKAGE);
  assert.equal(res.status, 201);
  const { shipment, invoice } = res.data;
  assert.match(shipment.tracking_code, /^EPZ-\d{6}$/);
  // Tarifa por defecto: 5 de base + 9 por kg nacional
  assert.equal(Number(shipment.fee), 5 + 3 * 9);
  assert.equal(Number(shipment.total), 32);
  assert.match(invoice.number, /^FAC-\d{4}-00001$/);

  const client = await db.one('SELECT * FROM clients WHERE phone = $1', ['+240222111222']);
  assert.equal(client.name, 'María Obiang Nguema');

  const moved = await admin.post(`/api/shipments/${shipment.id}/status`, { status: 'en_transito', location: 'Puerto de Malabo' });
  assert.equal(moved.status, 200);
  const track = await agent(server.base).get(`/api/public/track/${shipment.tracking_code.toLowerCase()}`);
  assert.equal(track.status, 200);
  assert.equal(track.data.found, true);
  assert.equal(track.data.status_label, 'En tránsito');
  assert.equal(track.data.receiver, 'Juan E.', 'el nombre se muestra recortado');
  assert.equal(track.data.events.length, 2);
  assert.equal(JSON.stringify(track.data).includes('222'), false, 'sin teléfonos en el rastreo público');

  const missing = await agent(server.base).get('/api/public/track/EPZ-000000');
  assert.equal(missing.data.found, false);
});

test('envío de dinero: la comisión es el ingreso, el total incluye lo enviado', async () => {
  const res = await admin.post('/api/shipments', { ...PACKAGE, kind: 'dinero', scope: 'internacional', weight_kg: undefined, amount: 1000 });
  assert.equal(res.status, 201);
  assert.equal(Number(res.data.shipment.fee), 60);
  assert.equal(Number(res.data.shipment.total), 1060);
});

test('los estados siguen un orden: un envío entregado no vuelve atrás', async () => {
  const { data } = await admin.post('/api/shipments', PACKAGE);
  const id = data.shipment.id;
  assert.equal((await admin.post(`/api/shipments/${id}/status`, { status: 'entregado' })).status, 200);
  const back = await admin.post(`/api/shipments/${id}/status`, { status: 'en_transito' });
  assert.equal(back.status, 409);
  const detail = await admin.get(`/api/shipments/${id}`);
  assert.ok(detail.data.shipment.delivered_at);
  assert.deepEqual(detail.data.next_statuses, []);
});

test('cancelar un envío anula su factura', async () => {
  const { data } = await admin.post('/api/shipments', PACKAGE);
  await admin.post(`/api/shipments/${data.shipment.id}/status`, { status: 'cancelado' });
  const inv = await db.one('SELECT status FROM invoices WHERE shipment_id = $1', [data.shipment.id]);
  assert.equal(inv.status, 'anulada');
});

test('las facturas se numeran sin duplicados aunque lleguen a la vez', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => admin.post('/api/invoices', { client_name: 'Empresa X', client_phone: '222999888', concept: 'Gestión mensual', amount: 100 })));
  const numbers = results.map((r) => r.data.invoice.number);
  assert.equal(new Set(numbers).size, numbers.length);
});

test('mensaje de la web convertido en trabajo, facturado y terminado', async () => {
  await agent(server.base).post('/api/public/contact', { name: 'Luis Ndong', phone: '222444555', topic: 'construccion', message: 'Necesito levantar un muro', privacy: true });
  const inbox = await admin.get('/api/inbox?status=nuevo');
  assert.equal(inbox.data.unread, 1);
  const message = inbox.data.items[0];
  const job = await admin.post(`/api/inbox/${message.id}/job`, { category: 'construccion', title: 'Muro de cerramiento' });
  assert.equal(job.status, 201);
  assert.match(job.data.item.code, /^SRV-\d{5}$/);
  assert.equal((await admin.post(`/api/inbox/${message.id}/job`, { category: 'construccion', title: 'Otra vez' })).status, 409);

  const noPrice = await admin.post(`/api/jobs/${job.data.item.id}/invoice`);
  assert.equal(noPrice.status, 422);
  await admin.patch(`/api/jobs/${job.data.item.id}`, { price: 1500, status: 'terminado' });
  const invoice = await admin.post(`/api/jobs/${job.data.item.id}/invoice`);
  assert.equal(invoice.status, 201);
  assert.equal(Number(invoice.data.invoice.amount), 1500);
});

test('resumen e informes: ingresos = comisiones + trabajos + caja; gastos de caja', async () => {
  await admin.post('/api/cash', { type: 'gasto', category: 'Combustible', concept: 'Gasoil furgoneta', amount: 40, date: new Date().toISOString().slice(0, 10) });
  const dash = await admin.get('/api/reports/dashboard');
  assert.equal(dash.status, 200);
  assert.equal(dash.data.chart.length, 6);
  assert.equal(Number(dash.data.month.expense), 40);
  // 32 + 60 (dinero) + 32 (entregado) + 1500 (trabajo); el cancelado no cuenta
  assert.equal(Number(dash.data.month.income), 32 + 60 + 32 + 1500);

  const summary = await admin.get('/api/reports/summary');
  assert.equal(summary.status, 200);
  assert.ok(summary.data.by_city.find((c) => c.city === 'Bata'));

  const csv = await admin.get('/api/reports/export/envios.csv');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.data, /guia;tipo;estado/);
});

test('el CSV neutraliza fórmulas de Excel', async () => {
  await admin.post('/api/shipments', { ...PACKAGE, sender_name: '=HYPERLINK("http://x")', sender_phone: '222000999' });
  const csv = await admin.get('/api/reports/export/envios.csv');
  assert.ok(csv.data.includes(`'=HYPERLINK`));
});

test('ajustes: el admin cambia tarifas y la web pública las usa', async () => {
  const current = (await admin.get('/api/settings')).data;
  const rates = { ...current.rates, currency: 'XAF', package_base_fee: 1000, package_per_kg: { local: 500, nacional: 1000, internacional: 5000 } };
  const res = await admin.put('/api/settings', { company: current.company, rates, cities: current.cities });
  assert.equal(res.status, 200);
  const config = await agent(server.base).get('/api/public/config');
  assert.equal(config.data.rates.currency, 'XAF');
  const quote = await agent(server.base).get('/api/public/quote?kind=paquete&scope=nacional&value=2');
  assert.equal(quote.data.total, 3000);
});

test('verificación pública de factura y QR', async () => {
  const { data } = await admin.post('/api/invoices', { client_name: 'Rosa Mba Ondo', client_phone: '222111000', concept: 'Mudanza', amount: 250 });
  const pub = await agent(server.base).get(`/api/public/invoices/${data.invoice.id}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.data.invoice.client_name, 'Rosa M.');
  assert.equal(pub.data.invoice.client_phone, undefined);
  const qr = await fetch(`${server.base}/api/public/invoices/${data.invoice.id}/qr.png`);
  assert.equal(qr.headers.get('content-type'), 'image/png');
  assert.equal((await agent(server.base).get('/api/public/invoices/no-existe')).status, 404);
});

test('equipo: el admin crea un acceso con contraseña temporal que obliga a cambiarla', async () => {
  const created = await admin.post('/api/users', { name: 'Nueva Operadora', email: 'nueva@prueba.com', role: 'operador' });
  assert.equal(created.status, 201);
  assert.ok(created.data.temporary_password.length >= 12);
  const login = await agent(server.base).login('nueva@prueba.com', created.data.temporary_password);
  assert.equal(login.status, 200);
  assert.equal(login.data.user.must_change_password, true);
});

test('actividad: queda registro de las acciones', async () => {
  const log = await admin.get('/api/audit');
  const actions = new Set(log.data.items.map((i) => i.action));
  for (const a of ['auth.login', 'envio.crear', 'envio.estado', 'usuario.crear', 'ajustes.guardar']) assert.ok(actions.has(a), a);
});
