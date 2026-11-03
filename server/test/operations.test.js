const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetDb, startServer, loggedIn, PACKAGE } = require('./helpers');

let server;
let users;
let admin;
let operador;
let malabo;
let bata;

before(async () => {
  users = await resetDb();
  server = await startServer();
  admin = await loggedIn(server.base, users.admin.email);
  operador = await loggedIn(server.base, users.operador.email);
  malabo = users.offices.find((o) => o.name === 'Malabo');
  bata = users.offices.find((o) => o.name === 'Bata');
});
after(async () => {
  await server.close();
  await db.pool.end();
});

test('oficinas: Malabo y Bata de partida; los ajustes las incluyen; el admin crea y desactiva', async () => {
  const settings = await operador.get('/api/settings');
  assert.deepEqual(settings.data.offices.map((o) => o.name).sort(), ['Bata', 'Malabo']);
  assert.equal(settings.data.notifications.shipment_status, true);
  assert.equal((await operador.post('/api/offices', { name: 'Ebebiyín', city: 'Ebebiyín' })).status, 403);
  const created = await admin.post('/api/offices', { name: 'Ebebiyín', city: 'Ebebiyín' });
  assert.equal(created.status, 201);
  assert.equal((await admin.post('/api/offices', { name: 'ebebiyín', city: 'Ebebiyín' })).status, 409);
  const off = await admin.patch(`/api/offices/${created.data.item.id}`, { active: false });
  assert.equal(off.data.item.active, false);
});

test('envíos: la oficina sale del empleado o de la elegida; se filtra por oficina', async () => {
  const own = await operador.post('/api/shipments', PACKAGE);
  assert.equal(own.data.shipment.office_id, malabo.id);
  assert.equal(own.data.notified, null, 'sin WhatsApp configurado no se avisa ni falla');
  const chosen = await admin.post('/api/shipments', { ...PACKAGE, office_id: bata.id });
  assert.equal(chosen.data.shipment.office_id, bata.id);
  const list = await admin.get(`/api/shipments?office_id=${bata.id}`);
  assert.ok(list.data.items.every((s) => s.office_id === bata.id));
  assert.ok(list.data.items.length >= 1);
});

test('caja: abrir, lo esperado suma cobros en efectivo y caja, y cerrar con descuadre exige explicarlo', async () => {
  const opened = await operador.post('/api/cash-sessions/open', { opening_amount: 50000 });
  assert.equal(opened.status, 201);
  assert.equal((await operador.post('/api/cash-sessions/open', { opening_amount: 1 })).status, 409, 'solo una caja abierta por oficina');
  assert.equal((await operador.post('/api/cash-sessions/open', { office_id: bata.id, opening_amount: 1 })).status, 403, 'un operador solo abre la de su oficina');

  // Cobro en efectivo en el mostrador (19.500) + gasto de caja en efectivo (2.000) + cobro por transferencia (no cuenta).
  await operador.post('/api/shipments', { ...PACKAGE, paid: true, payment_method: 'efectivo' });
  await operador.post('/api/shipments', { ...PACKAGE, paid: true, payment_method: 'transferencia' });
  await admin.post('/api/cash', { type: 'gasto', category: 'Combustible', concept: 'Gasolina moto', amount: 2000, date: '2026-11-03', method: 'efectivo' });

  const state = await operador.get('/api/cash-sessions');
  assert.equal(state.data.current.live.cash_payments, 19500);
  assert.equal(state.data.current.live.cash_expenses, 2000);
  assert.equal(state.data.current.live.expected, 50000 + 19500 - 2000);

  const id = opened.data.session.id;
  const short = await operador.post(`/api/cash-sessions/${id}/close`, { counted_amount: 67000 });
  assert.equal(short.status, 422, 'faltan 500 y no hay explicación');
  const closed = await operador.post(`/api/cash-sessions/${id}/close`, { counted_amount: 67000, notes: 'Cambio dado de más a un cliente' });
  assert.equal(closed.status, 200);
  assert.equal(Number(closed.data.session.expected_amount), 67500);
  assert.equal(Number(closed.data.session.difference), -500);
  assert.equal((await operador.post(`/api/cash-sessions/${id}/close`, { counted_amount: 1, notes: 'x' })).status, 409);

  const overview = await admin.get('/api/cash-sessions/overview');
  const m = overview.data.items.find((o) => o.name === 'Malabo');
  assert.equal(Number(m.last_close.difference), -500);
  assert.equal((await operador.get('/api/cash-sessions/overview')).status, 403);
});

test('viajes: cargar paquetes, salir (en tránsito), llegar (listo para entregar) y no tocar envíos ajenos', async () => {
  const a = (await operador.post('/api/shipments', PACKAGE)).data.shipment;
  const b = (await operador.post('/api/shipments', PACKAGE)).data.shipment;
  const money = (await operador.post('/api/shipments', { ...PACKAGE, kind: 'dinero', weight_kg: undefined, amount: 100000 })).data.shipment;

  const trip = (await operador.post('/api/trips', { mode: 'barco', origin: 'Malabo', destination: 'Bata', carrier: 'Naviera Ecuatorial' })).data.item;
  assert.match(trip.code, /^VIA-\d{4}$/);
  assert.equal((await operador.post(`/api/trips/${trip.id}/depart`)).status, 409, 'sin envíos no sale');

  const available = await operador.get('/api/shipments?trip=none&limit=100');
  assert.ok(available.data.items.some((s) => s.id === a.id));
  assert.ok(!available.data.items.some((s) => s.id === money.id), 'el dinero no viaja en un manifiesto');

  const load = await operador.post(`/api/trips/${trip.id}/shipments`, { ids: [a.id, b.id, money.id] });
  assert.equal(load.data.added, 2);
  assert.equal(load.data.skipped, 1);
  assert.equal((await operador.del(`/api/trips/${trip.id}/shipments/${b.id}`)).status, 200);
  await operador.post(`/api/trips/${trip.id}/shipments`, { ids: [b.id] });

  const depart = await operador.post(`/api/trips/${trip.id}/depart`);
  assert.equal(depart.data.moved, 2);
  const detail = await operador.get(`/api/trips/${trip.id}`);
  assert.equal(detail.data.trip.status, 'en_ruta');
  assert.ok(detail.data.shipments.every((s) => s.status === 'en_transito'));
  const events = await db.many('SELECT note FROM shipment_events WHERE shipment_id = $1 ORDER BY id', [a.id]);
  assert.match(events[events.length - 1].note, /Salida en barco \(VIA-/);
  assert.equal((await operador.post(`/api/trips/${trip.id}/shipments`, { ids: [money.id] })).status, 409, 'ya salió');

  const arrive = await operador.post(`/api/trips/${trip.id}/arrive`);
  assert.equal(arrive.data.moved, 2);
  const after = await operador.get(`/api/trips/${trip.id}`);
  assert.ok(after.data.shipments.every((s) => s.status === 'en_reparto'));
});

test('recordatorio de cobro: texto con el pendiente en FCFA; WhatsApp sin configurar responde 503', async () => {
  const inv = (await admin.post('/api/invoices', { client_name: 'Lucía Mangue Obiang', client_phone: '+240 555 123 456', concept: 'Pintura', amount: 125000 })).data.invoice;
  await admin.post(`/api/invoices/${inv.id}/payments`, { amount: 25000, method: 'efectivo' });
  const manual = await admin.post(`/api/invoices/${inv.id}/remind`, { channel: 'manual' });
  assert.equal(manual.status, 200);
  assert.match(manual.data.text, /^Hola Lucía/);
  assert.match(manual.data.text, /100\.000 FCFA/);
  assert.equal(manual.data.phone, '240555123456');
  assert.equal(manual.data.invoice.reminder_count, 1);
  assert.equal((await admin.post(`/api/invoices/${inv.id}/remind`, { channel: 'whatsapp' })).status, 503);
  assert.equal((await operador.post(`/api/invoices/${inv.id}/remind`, { channel: 'manual' })).status, 403, 'facturación es de gestores');
});

test('informe por oficina', async () => {
  const res = await admin.get('/api/reports/offices?from=2020-01-01&to=2099-12-31');
  assert.equal(res.status, 200);
  const m = res.data.items.find((o) => o.name === 'Malabo');
  assert.ok(m.shipments >= 5);
  assert.ok(Number(m.collected_cash) >= 19500);
  assert.equal(Number(m.cash_difference), -500);
  assert.equal(m.closures, 1);
  assert.equal((await operador.get('/api/reports/offices')).status, 403);
});

test('los avisos de estado se pueden desactivar en Ajustes', async () => {
  const current = (await admin.get('/api/settings')).data;
  const res = await admin.put('/api/settings', { company: current.company, rates: current.rates, notifications: { shipment_status: false, shipment_created: true } });
  assert.equal(res.status, 200);
  assert.equal(res.data.notifications.shipment_status, false);
  assert.equal(res.data.rates.currency, 'XAF', 'la moneda siempre es FCFA');
});
