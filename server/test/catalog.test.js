const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { db, config, resetDb, startServer, agent, loggedIn } = require('./helpers');
const { importCatalogs, readCatalog } = require('../src/services/catalog');

const CATALOG_DIR = path.join(__dirname, '../catalog');
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

test('el catálogo de Autos Epikaizo es válido: precios, datos y fotos WebP', () => {
  const catalog = readCatalog(path.join(CATALOG_DIR, 'autos-epikaizo-2026'));
  assert.equal(catalog.currency, 'XAF');
  assert.equal(catalog.vehicles.length, 44);
  for (const v of catalog.vehicles) {
    assert.ok(v.photos.length >= 1 && v.photos.length <= 8, `${v.brand} ${v.model} tiene fotos`);
    assert.ok(v.sale_price > 1_000_000, `${v.brand} ${v.model} tiene precio en FCFA`);
  }
});

test('el catálogo se carga una sola vez y sale en la web con sus fotos y su precio en FCFA', async () => {
  assert.equal(await importCatalogs(config.tenantId, { dir: CATALOG_DIR }), 44);
  assert.equal(await importCatalogs(config.tenantId, { dir: CATALOG_DIR }), 0, 'el segundo arranque no duplica');

  const pub = await agent(server.base).get('/api/public/vehicles');
  assert.equal(pub.status, 200);
  assert.equal(pub.data.items.length, 44);
  const first = pub.data.items[0];
  assert.equal(first.brand, 'Jetour', 'mantiene el orden del catálogo');
  assert.equal(first.currency, 'XAF');
  assert.equal(Number(first.sale_price), 12014851);
  assert.equal(first.photos.length, 6);
  const photo = await fetch(`${server.base}/api/public/vehicle-photos/${first.photos[0]}`);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/webp');

  // Lo que se quita desde el panel no vuelve en el siguiente arranque.
  const gestor = await loggedIn(server.base, users.gestor.email);
  const list = await gestor.get('/api/vehicles?q=Dashing');
  const id = list.data.items[0].id;
  assert.equal((await gestor.del(`/api/vehicles/${id}`)).status, 200);
  assert.equal(await importCatalogs(config.tenantId, { dir: CATALOG_DIR }), 0);
  assert.equal((await gestor.get('/api/vehicles?q=Dashing')).data.items.length, 0);
  const photos = await db.one('SELECT count(*)::int AS n FROM vehicle_photos WHERE vehicle_id = $1', [id]);
  assert.equal(photos.n, 0, 'sus fotos se borran con él');
});

test('un catálogo con errores no carga nada', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epk-cat-'));
  fs.mkdirSync(path.join(dir, 'roto', 'fotos'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'roto', 'fotos', 'a.webp'), 'no soy una imagen');
  fs.writeFileSync(
    path.join(dir, 'roto', 'catalog.json'),
    JSON.stringify({ id: 'roto', currency: 'XAF', vehicles: [{ brand: 'Kia', model: 'Rio', sale_price: 100, photos: ['a.webp'] }] })
  );
  const before = await db.one('SELECT count(*)::int AS n FROM vehicles');
  await assert.rejects(importCatalogs(config.tenantId, { dir }), /no es WebP/);
  assert.equal((await db.one('SELECT count(*)::int AS n FROM vehicles')).n, before.n);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('moneda por vehículo y no se borra un vehículo vendido', async () => {
  const gestor = await loggedIn(server.base, users.gestor.email);
  const res = await gestor.post('/api/vehicles', { brand: 'Toyota', model: 'Hilux', condition: 'usado', sale_price: 9_500_000, currency: 'XAF' });
  assert.equal(res.status, 201);
  assert.equal(res.data.vehicle.currency, 'XAF');
  assert.equal((await gestor.post('/api/vehicles', { brand: 'Toyota', model: 'Hilux', condition: 'usado', sale_price: 1, currency: 'BTC' })).status, 422);
  const id = res.data.vehicle.id;
  const sold = await gestor.post(`/api/vehicles/${id}/sell`, { client_name: 'Pedro Ndong', client_phone: '+240555000111', client_document: 'DIP 778899', client_address: 'Bata', price: 9_500_000, tax_rate: 0 });
  assert.equal(sold.status, 201, JSON.stringify(sold.data));
  assert.equal((await gestor.del(`/api/vehicles/${id}`)).status, 409);
  const operador = await loggedIn(server.base, users.operador.email);
  const other = (await gestor.get('/api/vehicles?q=Uni-K')).data.items[0];
  assert.equal((await operador.del(`/api/vehicles/${other.id}`)).status, 403);
});
