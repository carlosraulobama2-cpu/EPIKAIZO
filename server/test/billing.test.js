const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetDb, startServer, loggedIn } = require('./helpers');

let server;
let users;
let gestor;
let operador;

const CLIENT = { client_name: 'Ana Bela Nsang', client_phone: '+240555112233', client_document: 'DIP 123456', client_address: 'Barrio Ela Nguema, Malabo' };

before(async () => {
  users = await resetDb();
  server = await startServer();
  gestor = await loggedIn(server.base, users.gestor.email);
  operador = await loggedIn(server.base, users.operador.email);
});
after(async () => {
  await server.close();
  await db.pool.end();
});

test('factura con varias líneas: el servidor calcula base, IVA y total e ignora los totales del navegador', async () => {
  const res = await gestor.post('/api/invoices', {
    ...CLIENT,
    kind: 'factura',
    amount: 1,
    lines: [
      { description: 'Reparación de televisor', quantity: 1, unit_price: 80, tax_rate: 15 },
      { description: 'Pieza: placa base', quantity: 2, unit_price: 35, tax_rate: 15 },
    ],
  });
  assert.equal(res.status, 201);
  const inv = res.data.invoice;
  assert.match(inv.number, /^FAC-\d{4}-\d{5}$/);
  assert.equal(Number(inv.subtotal), 150);
  assert.equal(Number(inv.tax_amount), 22.5);
  assert.equal(Number(inv.amount), 172.5);
  assert.ok(inv.due_date, 'tiene vencimiento según los días de pago de Ajustes');
  const bad = await gestor.post('/api/invoices', { ...CLIENT, lines: [{ description: 'x', quantity: -1, unit_price: 10, tax_rate: 15 }] });
  assert.equal(bad.status, 422);
});

test('cobros parciales: la factura pasa a parcial y luego a pagada; no se puede cobrar de más', async () => {
  const { data } = await gestor.post('/api/invoices', { ...CLIENT, lines: [{ description: 'Mantenimiento mensual', quantity: 1, unit_price: 100, tax_rate: 15 }] });
  const id = data.invoice.id;
  const first = await gestor.post(`/api/invoices/${id}/payments`, { amount: 50, method: 'efectivo' });
  assert.equal(first.data.invoice.status, 'parcial');
  const over = await gestor.post(`/api/invoices/${id}/payments`, { amount: 100, method: 'efectivo' });
  assert.equal(over.status, 422);
  const rest = await gestor.post(`/api/invoices/${id}/payments`, { amount: 65, method: 'transferencia', reference: 'TRF-889' });
  assert.equal(rest.data.invoice.status, 'pagada');
  const detail = await gestor.get(`/api/invoices/${id}`);
  assert.equal(detail.data.payments.length, 2);
});

test('anular: crea una rectificativa; con cobros exige confirmar la devolución', async () => {
  const { data } = await gestor.post('/api/invoices', { ...CLIENT, lines: [{ description: 'Gestión de licencia', quantity: 1, unit_price: 200, tax_rate: 15 }] });
  const id = data.invoice.id;
  await gestor.post(`/api/invoices/${id}/payments`, { amount: 50, method: 'efectivo' });
  const blocked = await gestor.post(`/api/invoices/${id}/annul`, { reason: 'Error en el cliente' });
  assert.equal(blocked.status, 409);
  const ok = await gestor.post(`/api/invoices/${id}/annul`, { reason: 'Error en el cliente', refunded: true });
  assert.equal(ok.status, 201);
  assert.match(ok.data.rectification.number, /^REC-/);
  assert.equal(Number(ok.data.rectification.amount), 230);
  const original = await gestor.get(`/api/invoices/${id}`);
  assert.equal(original.data.invoice.status, 'anulada');
  assert.equal(original.data.rectification.number, ok.data.rectification.number);
  assert.equal((await gestor.post(`/api/invoices/${id}/annul`, { reason: 'Otra vez' })).status, 409);
});

test('obra: presupuesto aceptado → anticipo 30 % → certificación 50 % → resto 20 %, sin pasar del 100 %', async () => {
  const job = await gestor.post('/api/jobs', { category: 'construccion', title: 'Vivienda unifamiliar en Sampaka', client_name: CLIENT.client_name, client_phone: CLIENT.client_phone });
  const quote = await gestor.post('/api/invoices', {
    ...CLIENT,
    kind: 'presupuesto',
    job_id: job.data.item.id,
    lines: [
      { description: 'Cimentación y estructura', quantity: 1, unit_price: 20000, tax_rate: 15 },
      { description: 'Cerramientos y cubierta', quantity: 1, unit_price: 10000, tax_rate: 15 },
    ],
  });
  assert.equal(quote.status, 201);
  const q = quote.data.invoice;
  assert.match(q.number, /^PRE-/);
  assert.equal(q.status, 'pendiente');
  assert.ok(q.valid_until);
  // No se factura sin aceptar
  assert.equal((await gestor.post(`/api/invoices/${q.id}/invoice`, { mode: 'total' })).status, 409);
  await gestor.post(`/api/invoices/${q.id}/decision`, { decision: 'aceptado' });
  const jobAfter = await db.one('SELECT status, price FROM jobs WHERE id = $1', [job.data.item.id]);
  assert.equal(jobAfter.status, 'en_curso');
  assert.equal(Number(jobAfter.price), 30000);

  const advance = await gestor.post(`/api/invoices/${q.id}/invoice`, { mode: 'porcentaje', pct: 30 });
  assert.equal(advance.status, 201);
  assert.equal(Number(advance.data.invoice.subtotal), 9000);
  assert.match(advance.data.invoice.lines[0].description, /^Anticipo del 30 %/);
  assert.equal((await gestor.post(`/api/invoices/${q.id}/invoice`, { mode: 'total' })).status, 409);
  assert.equal((await gestor.post(`/api/invoices/${q.id}/invoice`, { mode: 'porcentaje', pct: 80 })).status, 422);
  const cert = await gestor.post(`/api/invoices/${q.id}/invoice`, { mode: 'porcentaje', pct: 50 });
  assert.match(cert.data.invoice.lines[0].description, /^Certificación del 50 %/);
  const rest = await gestor.post(`/api/invoices/${q.id}/invoice`, { mode: 'resto' });
  assert.equal(Number(rest.data.invoice.subtotal), 6000);
  const detail = await gestor.get(`/api/invoices/${q.id}`);
  assert.equal(detail.data.invoice.status, 'facturado');
  assert.equal(detail.data.invoiced_pct, 100);
  assert.equal(detail.data.invoices.length, 3);
  // Anular la última reabre el presupuesto
  await gestor.post(`/api/invoices/${rest.data.invoice.id}/annul`, { reason: 'Importe mal calculado' });
  const reopened = await gestor.get(`/api/invoices/${q.id}`);
  assert.equal(reopened.data.invoice.status, 'aceptado');
  assert.equal(reopened.data.invoiced_pct, 80);
});

test('venta de vehículo: factura con bastidor y matrícula, cobro, vendido; el operador no ve el coste ni vende', async () => {
  const created = await gestor.post('/api/vehicles', {
    brand: 'Toyota', model: 'Hilux', year: 2019, vin: 'jtfst22p800012345', plate: 'ks-1234-a', mileage_km: 85000, color: 'Blanco',
    fuel: 'diesel', transmission: 'manual', condition: 'usado', purchase_price: 14000, sale_price: 18500, register_purchase: true,
  });
  assert.equal(created.status, 201);
  const v = created.data.vehicle;
  assert.match(v.code, /^VEH-\d{4}$/);
  const cash = await db.one("SELECT amount FROM cash_movements WHERE reference = $1", [v.code]);
  assert.equal(Number(cash.amount), 14000);

  const seen = await operador.get('/api/vehicles');
  assert.equal(seen.status, 200);
  assert.equal(seen.data.items[0].purchase_price, undefined);
  assert.equal((await operador.post(`/api/vehicles/${v.id}/sell`, { ...CLIENT, price: 18500, tax_rate: 0 })).status, 403);
  const reserved = await operador.post(`/api/vehicles/${v.id}/reserve`, { client_name: CLIENT.client_name, client_phone: CLIENT.client_phone });
  assert.equal(reserved.data.vehicle.status, 'reservado');

  const sold = await gestor.post(`/api/vehicles/${v.id}/sell`, { ...CLIENT, price: 18000, tax_rate: 15, paid_now: 10000, method: 'transferencia' });
  assert.equal(sold.status, 201);
  assert.equal(sold.data.vehicle.status, 'vendido');
  const inv = sold.data.invoice;
  assert.equal(inv.status, 'parcial');
  assert.equal(Number(inv.amount), 20700);
  assert.match(inv.lines[0].description, /Toyota Hilux \(2019\)/);
  assert.match(inv.lines[0].description, /bastidor JTFST22P800012345/);
  assert.match(inv.lines[0].description, /matrícula KS-1234-A/);
  assert.equal((await gestor.post(`/api/vehicles/${v.id}/sell`, { ...CLIENT, price: 18000, tax_rate: 15 })).status, 409);

  const doc = await gestor.get(`/api/invoices/${inv.id}/document`);
  assert.equal(doc.data.vehicle.code, v.code);
  assert.ok(doc.data.company.name);

  // Anular la venta (con devolución) deja el vehículo disponible otra vez
  await gestor.post(`/api/invoices/${inv.id}/annul`, { reason: 'El cliente desiste de la compra', refunded: true });
  const back = await gestor.get(`/api/vehicles/${v.id}`);
  assert.equal(back.data.vehicle.status, 'disponible');
});

test('informes: la venta cuenta por su base imponible y la rectificativa la compensa; el operador no puede facturar', async () => {
  assert.equal((await operador.get('/api/invoices')).status, 403);
  const csv = await gestor.get('/api/reports/export/facturas.csv');
  assert.match(csv.data, /numero;tipo;fecha;cliente;documento/);
  assert.match(csv.data, /rectificativa/);
});
