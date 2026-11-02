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
  // Tarifa por defecto en FCFA: 3.000 de base + 5.500 por kg nacional
  assert.equal(shipment.currency, 'XAF');
  assert.equal(Number(shipment.fee), 3000 + 3 * 5500);
  assert.equal(Number(shipment.total), 19500);
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
  const res = await admin.post('/api/shipments', { ...PACKAGE, kind: 'dinero', scope: 'internacional', weight_kg: undefined, amount: 100000 });
  assert.equal(res.status, 201);
  assert.equal(Number(res.data.shipment.fee), 6000);
  assert.equal(Number(res.data.shipment.total), 106000);
  // El franco CFA no tiene céntimos: 3,5 % de 123.456 = 4.320,96 → 4.321
  const quote = await agent(server.base).get('/api/public/quote?kind=dinero&scope=nacional&value=123456');
  assert.equal(quote.data.fee, 4321);
  assert.equal(quote.data.total, 127777);
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
  const inv = await db.one("SELECT id, status FROM invoices WHERE shipment_id = $1 AND kind = 'factura'", [data.shipment.id]);
  assert.equal(inv.status, 'anulada');
  // No se borra: queda su factura rectificativa (REC) que la compensa
  const rec = await db.one("SELECT number FROM invoices WHERE rectifies_id = $1 AND kind = 'rectificativa'", [inv.id]);
  assert.match(rec.number, /^REC-\d{4}-\d{5}$/);
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
  // Precio del trabajo = base imponible; se añade el IVA de Ajustes (15 % por defecto)
  assert.equal(Number(invoice.data.invoice.subtotal), 1500);
  assert.equal(Number(invoice.data.invoice.tax_amount), 225);
  assert.equal(Number(invoice.data.invoice.amount), 1725);
});

test('resumen e informes: ingresos = comisiones + trabajos + caja; gastos de caja', async () => {
  await admin.post('/api/cash', { type: 'gasto', category: 'Combustible', concept: 'Gasoil furgoneta', amount: 40, date: new Date().toISOString().slice(0, 10) });
  const dash = await admin.get('/api/reports/dashboard');
  assert.equal(dash.status, 200);
  assert.equal(dash.data.chart.length, 6);
  assert.equal(Number(dash.data.month.expense), 40);
  // 32 + 60 (dinero) + 32 (entregado) + 1500 (trabajo) + 8 facturas manuales de 100; el cancelado no cuenta
  assert.equal(Number(dash.data.month.income), 19500 + 6000 + 19500 + 1500 + 800);

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

test('pedir cita desde la web: la fecha llega a la bandeja y no se admite una pasada', async () => {
  const a = agent(server.base);
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const ok = await a.post('/api/public/contact', { name: 'Pedro Ndong', phone: '222606060', topic: 'vehiculos', appointment: day, message: 'Quiero ver una furgoneta', privacy: true });
  assert.equal(ok.status, 201);
  const row = await db.one("SELECT topic, body FROM messages WHERE phone = '222606060'");
  assert.equal(row.topic, 'vehiculos');
  assert.match(row.body, /^📅 Cita solicitada para el /);
  const past = await a.post('/api/public/contact', { name: 'Pedro Ndong', phone: '222606061', topic: 'electronica', appointment: '2020-01-01', message: 'Reparar televisor', privacy: true });
  assert.equal(past.status, 422);
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
  const nueva = agent(server.base);
  const login = await nueva.login('nueva@prueba.com', created.data.temporary_password);
  assert.equal(login.status, 200);
  assert.equal(login.data.user.must_change_password, true);
  // Con la contraseña temporal solo funciona /api/auth/*: el resto exige cambiarla antes.
  assert.equal((await nueva.get('/api/auth/me')).status, 200);
  const blocked = await nueva.get('/api/shipments');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'must_change_password');
  const changed = await nueva.post('/api/auth/password', { current: created.data.temporary_password, password: 'una-frase-nueva-larga' });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.user.must_change_password, false);
  assert.equal((await nueva.get('/api/shipments')).status, 200);
});

test('actividad: queda registro de las acciones', async () => {
  const log = await admin.get('/api/audit');
  const actions = new Set(log.data.items.map((i) => i.action));
  for (const a of ['auth.login', 'envio.crear', 'envio.estado', 'usuario.crear', 'ajustes.guardar']) assert.ok(actions.has(a), a);
});

// ---------- Al final: estas pruebas crean envíos y facturas que cambiarían los totales de los informes ----------

test('editar un envío: datos sí, cobro no; cancelado solo notas', async () => {
  const { data } = await admin.post('/api/shipments', { ...PACKAGE, paid: false });
  const id = data.shipment.id;
  const edited = await admin.patch(`/api/shipments/${id}`, { receiver_phone: '+240 222 999 888', notes: 'Llamar antes' });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.shipment.receiver_phone, '+240222999888', 'el teléfono se guarda normalizado');
  // "paid" ya no se edita aquí: el cobro va por su factura.
  const paid = await admin.patch(`/api/shipments/${id}`, { paid: true });
  assert.equal(paid.status, 200);
  assert.equal(paid.data.shipment.paid, false);
  await admin.post(`/api/shipments/${id}/status`, { status: 'cancelado' });
  assert.equal((await admin.patch(`/api/shipments/${id}`, { receiver_name: 'Otra Persona' })).status, 409);
  assert.equal((await admin.patch(`/api/shipments/${id}`, { notes: 'Cancelado por el cliente' })).status, 200);
});

test('cobrar la factura de un envío lo marca como pagado', async () => {
  const { data } = await admin.post('/api/shipments', { ...PACKAGE, paid: false });
  assert.equal(data.shipment.paid, false);
  const pay = await admin.post(`/api/invoices/${data.invoice.id}/payments`, { amount: Number(data.invoice.amount), method: 'movil' });
  assert.equal(pay.status, 201);
  const row = await db.one('SELECT paid, payment_method FROM shipments WHERE id = $1', [data.shipment.id]);
  assert.equal(row.paid, true);
  assert.equal(row.payment_method, 'movil');
});

test('borrar: un envío con factura vigente no se borra; uno cancelado sí', async () => {
  const { data } = await admin.post('/api/shipments', PACKAGE);
  const blocked = await admin.del(`/api/shipments/${data.shipment.id}`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.data.error, /Cancélalo/);
  await admin.post(`/api/shipments/${data.shipment.id}/status`, { status: 'cancelado' });
  assert.equal((await admin.del(`/api/shipments/${data.shipment.id}`)).status, 200);
  // La factura anulada y su rectificativa se conservan.
  assert.equal((await db.many("SELECT id FROM invoices WHERE number LIKE 'FAC-%' AND shipment_id IS NULL AND status = 'anulada'")).length >= 1, true);
});

test('recibo: el QR del envío lleva al rastreo', async () => {
  const { data } = await admin.post('/api/shipments', PACKAGE);
  const qr = await admin.get(`/api/shipments/${data.shipment.id}/qr.png`);
  assert.equal(qr.status, 200);
  assert.equal(qr.headers.get('content-type'), 'image/png');
  assert.equal((await agent(server.base).get(`/api/shipments/${data.shipment.id}/qr.png`)).status, 401, 'el QR del recibo exige sesión');
});

test('borrar cliente: no si tiene envíos, trabajos o facturas', async () => {
  const withShipments = await db.one('SELECT id FROM clients WHERE phone = $1', ['+240222111222']);
  assert.equal((await admin.del(`/api/clients/${withShipments.id}`)).status, 409);
  const onlyInvoice = await admin.post('/api/clients', { name: 'Cliente Con Factura', phone: '+240 555 000 111' });
  // La factura se asocia al cliente por su teléfono.
  const inv = await admin.post('/api/invoices', { client_name: 'Cliente Con Factura', client_phone: '+240 555 000 111', concept: 'Revisión', amount: 100 });
  assert.equal(inv.data.invoice.client_id, onlyInvoice.data.item.id);
  assert.equal((await admin.del(`/api/clients/${onlyInvoice.data.item.id}`)).status, 409);
  const empty = await admin.post('/api/clients', { name: 'Cliente Sin Nada', phone: '+240 555 000 222' });
  assert.equal((await admin.del(`/api/clients/${empty.data.item.id}`)).status, 200);
});

test('equipo: cambiar el correo de un acceso; no se puede repetir', async () => {
  const created = await admin.post('/api/users', { name: 'Correo Viejo', email: 'viejo@prueba.com', role: 'operador' });
  const id = created.data.item.id;
  const changed = await admin.patch(`/api/users/${id}`, { email: 'Nuevo@Prueba.com' });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.item.email, 'nuevo@prueba.com', 'se guarda en minúsculas');
  assert.equal((await agent(server.base).login('nuevo@prueba.com', created.data.temporary_password)).status, 200);
  assert.equal((await agent(server.base).login('viejo@prueba.com', created.data.temporary_password)).status, 401);
  const dup = await admin.patch(`/api/users/${id}`, { email: users.admin.email });
  assert.equal(dup.status, 409);
});

test('fechas: la factura sale con el día de Malabo y las fechas llegan como AAAA-MM-DD', async () => {
  const { today } = require('../src/lib/dates');
  const res = await admin.post('/api/invoices', { client_name: 'Fecha Correcta', client_phone: '+240 555 000 333', concept: 'Revisión', amount: 100 });
  assert.equal(res.status, 201);
  assert.equal(res.data.invoice.issue_date, today());
  assert.match(res.data.invoice.due_date, /^\d{4}-\d{2}-\d{2}$/);
  // A las 23:30 UTC del 31 de diciembre en Malabo ya es 1 de enero.
  assert.equal(today(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
});
