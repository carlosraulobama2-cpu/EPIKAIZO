const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, resetDb, startServer, agent, loggedIn, PACKAGE } = require('./helpers');
const whatsapp = require('../src/services/whatsapp');

// Imagen JPEG mínima válida (1×1) para las fotos.
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

let server;
let users;
let admin;
let operador;

before(async () => {
  users = await resetDb();
  server = await startServer();
  admin = await loggedIn(server.base, users.admin.email);
  operador = await loggedIn(server.base, users.operador.email);
});
after(async () => {
  await server.close();
  await db.pool.end();
});

test('portafolio: no se publica sin fotos; publicado sale en la web con sus fotos', async () => {
  const p = (await admin.post('/api/web/projects', { title: 'Reforma integral de vivienda', category: 'Reforma', city: 'Bata', published: false })).data.item;
  assert.equal((await admin.patch(`/api/web/projects/${p.id}`, { published: true })).status, 409);
  assert.equal((await admin.post(`/api/web/projects/${p.id}/photos`, { kind: 'antes', data: 'data:image/jpeg;base64,AAAA' })).status, 422);
  const before = await admin.post(`/api/web/projects/${p.id}/photos`, { kind: 'antes', data: JPEG });
  assert.equal(before.status, 201);
  await admin.post(`/api/web/projects/${p.id}/photos`, { kind: 'despues', data: JPEG, caption: 'Salón terminado' });
  const pub = agent(server.base);
  assert.equal((await pub.get('/api/public/projects')).data.items.length, 0, 'sin publicar no sale');
  assert.equal((await admin.patch(`/api/web/projects/${p.id}`, { published: true })).status, 200);
  const list = (await pub.get('/api/public/projects')).data.items;
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].photos.map((f) => f.kind).sort(), ['antes', 'despues']);
  const img = await fetch(`${server.base}/api/public/project-photos/${list[0].photos[0].id}`);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal((await operador.post('/api/web/projects', { title: 'No', published: false })).status, 403);
});

test('opiniones: al terminar un trabajo se pide; el cliente la deja una vez; solo sale publicada y sin teléfono', async () => {
  const job = (await admin.post('/api/jobs', { category: 'construccion', title: 'Pintura de fachada', client_name: 'Lucía Mangue Obiang', client_phone: '+240 555 123 456', price: 90000 })).data.item;
  const done = await admin.patch(`/api/jobs/${job.id}`, { status: 'terminado' });
  assert.match(done.data.review.link, /\/opinion\?t=[\w-]{20,}$/);
  assert.match(done.data.review.text, /^Hola Lucía/);
  assert.equal(done.data.review.sent, false, 'sin WhatsApp no se envía, pero queda el enlace');
  const token = done.data.review.link.split('t=')[1];

  const pub = agent(server.base);
  assert.equal((await pub.get(`/api/public/review/${token}`)).data.name, 'Lucía');
  assert.equal((await pub.post(`/api/public/review/${token}`, { rating: 7 })).status, 422);
  assert.equal((await pub.post(`/api/public/review/${token}`, { rating: 5, comment: 'Muy serios y puntuales' })).status, 201);
  assert.equal((await pub.post(`/api/public/review/${token}`, { rating: 1 })).status, 409, 'solo una vez');
  assert.equal((await pub.get('/api/public/reviews')).data.total, 0, 'recibida pero no publicada');

  const panel = await operador.get('/api/web/reviews?status=recibida');
  assert.equal(panel.data.items.length, 1);
  assert.equal((await operador.patch(`/api/web/reviews/${panel.data.items[0].id}`, { status: 'publicada' })).status, 403, 'publica un gestor');
  await admin.patch(`/api/web/reviews/${panel.data.items[0].id}`, { status: 'publicada' });
  const web = (await pub.get('/api/public/reviews')).data;
  assert.equal(web.total, 1);
  assert.equal(web.average, 5);
  assert.equal(web.items[0].client_name, 'Lucía M.');
  assert.equal(JSON.stringify(web).includes('555'), false, 'sin teléfonos');
});

test('presupuesto en línea: datos, fotos en la Bandeja y protección', async () => {
  const pub = agent(server.base);
  const base = { name: 'Pedro Nve', phone: '+240 222 444 555', work_type: 'reforma', property: 'vivienda', area_m2: 85, city: 'Malabo', timeframe: 'mes', description: 'Reformar cocina y dos baños', privacy: true };
  assert.equal((await pub.post('/api/public/quote-request', { ...base, privacy: false })).status, 422);
  assert.equal((await pub.post('/api/public/quote-request', { ...base, photos: ['data:image/png;base64,AAAA'] })).status, 422);
  const ok = await pub.post('/api/public/quote-request', { ...base, photos: [JPEG, JPEG] });
  assert.equal(ok.status, 201);
  const inbox = await operador.get('/api/inbox?status=nuevo');
  const m = inbox.data.items.find((x) => x.topic === 'presupuesto');
  assert.ok(m);
  assert.equal(m.details.superficie_m2, 85);
  assert.equal(m.photos.length, 2);
  assert.match(m.body, /Reforma o rehabilitación \(vivienda, 85 m²\)/);
  const photo = await fetch(`${server.base}/api/inbox/${m.id}/photos/${m.photos[0]}`);
  assert.equal(photo.status, 401, 'las fotos de la Bandeja exigen sesión');
  assert.equal((await operador.get(`/api/inbox/${m.id}/photos/${m.photos[0]}`)).status, 200);
});

test('área de cliente: código por WhatsApp, ve solo lo suyo y avisa de un pago que el equipo confirma', async () => {
  const pub = agent(server.base);
  assert.equal((await pub.post('/api/public/client/code', { phone: '+240 222 111 222' })).status, 503, 'sin WhatsApp no hay códigos');

  // WhatsApp simulado: capturamos el mensaje con el código.
  const sent = [];
  const original = { enabled: whatsapp.enabled, sendText: whatsapp.sendText };
  whatsapp.enabled = () => true;
  whatsapp.sendText = async (to, body) => { sent.push({ to, body }); return 'id'; };
  try {
    await admin.post('/api/shipments', PACKAGE); // remitente +240 222 111 222
    const inv = (await admin.post('/api/invoices', { client_name: 'María Obiang Nguema', client_phone: '222 111 222', concept: 'Reparación', amount: 40000 })).data.invoice;
    await admin.post('/api/invoices', { client_name: 'Otra Persona', client_phone: '+240 999 888 777', concept: 'Otra', amount: 1000 });
    assert.match(sent[0].body, /hemos registrado tu envío EPZ-/, 'el alta del envío avisa al remitente');
    sent.length = 0;

    const unknown = await pub.post('/api/public/client/code', { phone: '+240 111 000 999' });
    assert.equal(unknown.status, 200, 'misma respuesta aunque no sea cliente');
    assert.equal(sent.length, 0, 'a un desconocido no se le manda nada');

    await pub.post('/api/public/client/code', { phone: '222 111 222' });
    assert.equal(sent.length, 1);
    const code = /es (\d{6})\./.exec(sent[0].body)[1];
    assert.equal((await pub.post('/api/public/client/verify', { phone: '222111222', code: code === '000000' ? '111111' : '000000' })).status, 401);
    assert.equal((await pub.post('/api/public/client/verify', { phone: '+240222111222', code })).status, 200);
    assert.equal((await pub.post('/api/public/client/verify', { phone: '+240222111222', code })).status, 401, 'el código vale una vez');

    const me = (await pub.get('/api/public/client/me')).data;
    assert.ok(me.shipments.length >= 1);
    // Sus facturas (la del envío y la de la reparación) y ninguna ajena.
    assert.equal(me.invoices.length, 2);
    assert.ok(me.invoices.some((i) => i.id === inv.id));
    assert.ok(!me.invoices.some((i) => i.concept === 'Otra'), 'nunca las de otro cliente');
    // La sesión de cliente no abre el panel.
    assert.equal((await pub.get('/api/shipments')).status, 401);

    assert.equal((await pub.post('/api/public/client/payments', { invoice_id: inv.id, method: 'movil', amount: 50000, reference: 'MM-123' })).status, 422, 'más que lo pendiente');
    const notice = await pub.post('/api/public/client/payments', { invoice_id: inv.id, method: 'movil', amount: 40000, reference: 'MM-123456' });
    assert.equal(notice.status, 201);
    assert.equal((await pub.post('/api/public/client/payments', { invoice_id: inv.id, method: 'movil', amount: 1, reference: 'MM-2' })).status, 409);

    const list = await admin.get('/api/web/payment-notices');
    assert.equal(list.data.pending, 1);
    const confirmed = await admin.post(`/api/web/payment-notices/${list.data.items[0].id}/confirm`);
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.data.invoice.status, 'pagada');
    assert.equal((await admin.post(`/api/web/payment-notices/${list.data.items[0].id}/confirm`)).status, 409);
    const pay = await db.one('SELECT method, reference FROM invoice_payments WHERE invoice_id = $1', [inv.id]);
    assert.equal(pay.method, 'movil');
    assert.equal(pay.reference, 'MM-123456');

    await pub.post('/api/public/client/logout');
    assert.equal((await pub.get('/api/public/client/me')).status, 401);
  } finally {
    whatsapp.enabled = original.enabled;
    whatsapp.sendText = original.sendText;
  }
});
