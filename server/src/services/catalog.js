// Catálogos de vehículos que vienen con el código: server/catalog/<id>/catalog.json y sus fotos.
// Cada catálogo se carga una sola vez en el inventario. Después se gestiona desde el panel como
// cualquier otro vehículo: si se edita, se vende o se borra, el catálogo no lo vuelve a crear.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { vehicleCode } = require('./codes');

const DEFAULT_DIR = path.join(__dirname, '../../catalog');
const DONE_KEY = 'catalog_imports';
const FUELS = ['gasolina', 'diesel', 'hibrido', 'electrico'];
const TRANSMISSIONS = ['manual', 'automatico'];
const CURRENCIES = ['USD', 'EUR', 'XAF'];
const MAX_PHOTOS = 8;

function isWebp(buf) {
  return buf.length > 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
}

/** Lee y comprueba un catálogo antes de tocar la base de datos: si algo falla, no se carga nada. */
function readCatalog(folder) {
  const catalog = JSON.parse(fs.readFileSync(path.join(folder, 'catalog.json'), 'utf8'));
  if (!catalog.id || !Array.isArray(catalog.vehicles)) throw new Error(`Catálogo sin id o sin vehículos: ${folder}`);
  if (!CURRENCIES.includes(catalog.currency)) throw new Error(`Moneda no válida en ${catalog.id}`);
  const vehicles = catalog.vehicles.map((v, i) => {
    const where = `${catalog.id} #${i + 1}`;
    if (!v.brand || !v.model) throw new Error(`Falta marca o modelo en ${where}`);
    if (!(Number(v.sale_price) > 0)) throw new Error(`Precio no válido en ${where}`);
    if (v.fuel && !FUELS.includes(v.fuel)) throw new Error(`Combustible no válido en ${where}`);
    if (v.transmission && !TRANSMISSIONS.includes(v.transmission)) throw new Error(`Cambio no válido en ${where}`);
    const photos = (v.photos || []).slice(0, MAX_PHOTOS).map((name) => {
      const data = fs.readFileSync(path.join(folder, 'fotos', path.basename(name)));
      if (!isWebp(data)) throw new Error(`La foto ${name} no es WebP`);
      return data;
    });
    return { ...v, photos };
  });
  return { ...catalog, vehicles };
}

/** Carga los catálogos pendientes. Devuelve cuántos vehículos ha creado. */
async function importCatalogs(tenantId, { dir = DEFAULT_DIR } = {}) {
  if (!fs.existsSync(dir)) return 0;
  const folders = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'catalog.json')))
    .map((d) => path.join(dir, d.name))
    .sort();
  let created = 0;
  for (const folder of folders) {
    const catalog = readCatalog(folder);
    created += await db.tx(async (client) => {
      // Si arrancan dos instancias a la vez, solo una carga el catálogo.
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`catalog:${tenantId}`], client);
      const row = await db.one('SELECT value FROM settings WHERE tenant_id = $1 AND key = $2', [tenantId, DONE_KEY], client);
      const done = Array.isArray(row && row.value) ? row.value : [];
      if (done.includes(catalog.id)) return 0;
      for (const v of catalog.vehicles) {
        const id = crypto.randomUUID();
        await db.query(
          `INSERT INTO vehicles (id, tenant_id, code, brand, model, year, mileage_km, color, fuel, transmission, condition, sale_price, currency, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [id, tenantId, await vehicleCode(tenantId, client), v.brand, v.model, v.year || null, v.mileage_km ?? null, v.color || null,
            v.fuel || null, v.transmission || null, v.condition === 'nuevo' ? 'nuevo' : 'usado', v.sale_price, catalog.currency, v.notes || null],
          client
        );
        for (const [position, data] of v.photos.entries()) {
          await db.query(
            "INSERT INTO vehicle_photos (id, tenant_id, vehicle_id, mime, data, size, position) VALUES ($1,$2,$3,'image/webp',$4,$5,$6)",
            [crypto.randomUUID(), tenantId, id, data, data.length, position],
            client
          );
        }
      }
      await db.query(
        `INSERT INTO settings (tenant_id, key, value, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [tenantId, DONE_KEY, JSON.stringify([...done, catalog.id])],
        client
      );
      await db.query(
        `INSERT INTO audit_log (tenant_id, user_name, action, entity, details) VALUES ($1, 'Sistema', 'vehiculo.catalogo', 'vehicle', $2)`,
        [tenantId, JSON.stringify({ catalogo: catalog.id, vehiculos: catalog.vehicles.length })],
        client
      );
      console.log(`[epikaizo] Catálogo «${catalog.name || catalog.id}» cargado: ${catalog.vehicles.length} vehículos.`);
      return catalog.vehicles.length;
    });
  }
  return created;
}

module.exports = { importCatalogs, readCatalog };
