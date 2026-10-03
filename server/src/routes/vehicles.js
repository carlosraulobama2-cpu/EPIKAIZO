// Vehículos en venta: inventario, reservas y venta con factura.
// El precio de compra (coste) solo lo ven gestores y administradores.
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { route, validate, paging, text, phone, email, number, oneOf, date, bool, HttpError } = require('../lib/http');
const { filters } = require('../lib/list');
const { requireRole, ROLE_RANK } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { upsertClient } = require('../services/clients');
const billing = require('../services/billing');
const { getSettings } = require('../services/settings');

const router = express.Router();
const STATUSES = ['disponible', 'reservado', 'vendido'];
const METHODS = ['efectivo', 'transferencia', 'movil', 'tarjeta'];

const fields = {
  brand: text({ min: 2, max: 40 }),
  model: text({ min: 1, max: 60 }),
  year: number({ min: 1950, max: 2100, optional: true }),
  vin: text({ min: 5, max: 30, optional: true }),
  plate: text({ max: 20, optional: true }),
  mileage_km: number({ min: 0, max: 5_000_000, optional: true }),
  color: text({ max: 30, optional: true }),
  fuel: oneOf(['gasolina', 'diesel', 'hibrido', 'electrico'], { optional: true }),
  transmission: oneOf(['manual', 'automatico'], { optional: true }),
  condition: oneOf(['nuevo', 'usado']),
  purchase_price: number({ min: 0, optional: true }),
  sale_price: number({ min: 1 }),
  notes: text({ max: 1000, optional: true }),
};

const isManager = (req) => ROLE_RANK[req.user.role] >= ROLE_RANK.gestor;
const hideCost = (req, v) => {
  if (!v || isManager(req)) return v;
  const { purchase_price: _cost, ...rest } = v;
  return rest;
};

async function nextCode(tenantId, client) {
  const row = await db.one(
    `INSERT INTO counters (tenant_id, name, value) VALUES ($1, 'vehiculo', 1)
     ON CONFLICT (tenant_id, name) DO UPDATE SET value = counters.value + 1 RETURNING value`,
    [tenantId],
    client
  );
  return `VEH-${String(row.value).padStart(4, '0')}`;
}

/** Texto de la línea de factura con todo lo que identifica al vehículo. */
function describe(v) {
  return [
    `${v.condition === 'nuevo' ? 'Vehículo nuevo' : 'Vehículo de ocasión'} ${v.brand} ${v.model}${v.year ? ` (${v.year})` : ''}`,
    v.vin && `nº de bastidor ${String(v.vin).toUpperCase()}`,
    v.plate && `matrícula ${String(v.plate).toUpperCase()}`,
    v.mileage_km !== null && v.mileage_km !== undefined && `${Number(v.mileage_km).toLocaleString('es-ES')} km`,
    v.color && `color ${v.color}`,
  ].filter(Boolean).join(' · ');
}

router.get(
  '/',
  route(async (req, res) => {
    const { limit, offset } = paging(req.query);
    const f = filters(req.tenantId)
      .eq('status', req.query.status, STATUSES)
      .search(['code', 'brand', 'model', 'vin', 'plate', 'color', 'reserved_for'], req.query.q);
    const [items, count, stock] = await Promise.all([
      db.many(`SELECT *, (SELECT id FROM vehicle_photos p WHERE p.vehicle_id = vehicles.id ORDER BY position, created_at LIMIT 1) AS cover_id FROM vehicles WHERE ${f.sql} ORDER BY CASE status WHEN 'disponible' THEN 0 WHEN 'reservado' THEN 1 ELSE 2 END, created_at DESC LIMIT ${limit} OFFSET ${offset}`, f.params),
      db.one(`SELECT count(*)::int AS n FROM vehicles WHERE ${f.sql}`, f.params),
      db.one(
        `SELECT count(*) FILTER (WHERE status = 'disponible')::int AS disponibles,
                count(*) FILTER (WHERE status = 'reservado')::int AS reservados,
                count(*) FILTER (WHERE status = 'vendido' AND sold_at >= date_trunc('month', now()))::int AS vendidos_mes,
                COALESCE(sum(sale_price) FILTER (WHERE status <> 'vendido'), 0) AS valor_stock
           FROM vehicles WHERE tenant_id = $1`,
        [req.tenantId]
      ),
    ]);
    res.json({ items: items.map((v) => hideCost(req, v)), total: count.n, stock });
  })
);

async function load(req, client) {
  const v = await db.one('SELECT * FROM vehicles WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId], client);
  if (!v) throw new HttpError(404, 'Vehículo no encontrado');
  return v;
}

router.get(
  '/:id',
  route(async (req, res) => {
    const v = await load(req);
    const [invoice, photos] = await Promise.all([
      v.invoice_id ? db.one('SELECT id, number, status, amount, paid_amount, currency, issue_date FROM invoices WHERE id = $1', [v.invoice_id]) : null,
      db.many('SELECT id, size, position FROM vehicle_photos WHERE vehicle_id = $1 ORDER BY position, created_at', [v.id]),
    ]);
    res.json({ vehicle: hideCost(req, v), invoice, photos });
  })
);

router.post(
  '/',
  requireRole('gestor'),
  route(async (req, res) => {
    const input = validate(req.body, { ...fields, register_purchase: bool() });
    const { rates } = await getSettings(req.tenantId);
    const v = await db.tx(async (client) => {
      const row = await db.one(
        `INSERT INTO vehicles (id, tenant_id, code, brand, model, year, vin, plate, mileage_km, color, fuel, transmission, condition, purchase_price, sale_price, currency, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [crypto.randomUUID(), req.tenantId, await nextCode(req.tenantId, client), input.brand, input.model, input.year, input.vin && input.vin.toUpperCase(),
          input.plate && input.plate.toUpperCase(), input.mileage_km, input.color, input.fuel, input.transmission, input.condition, input.purchase_price,
          input.sale_price, rates.currency, input.notes, req.user.id],
        client
      );
      // Opcional: apuntar la compra del vehículo como gasto en Caja.
      if (input.register_purchase && input.purchase_price > 0) {
        await db.query(
          "INSERT INTO cash_movements (id, tenant_id, type, category, concept, amount, currency, date, reference, created_by) VALUES ($1,$2,'gasto','Compra de vehículos',$3,$4,$5,CURRENT_DATE,$6,$7)",
          [crypto.randomUUID(), req.tenantId, `Compra ${row.brand} ${row.model}`, input.purchase_price, rates.currency, row.code, req.user.id],
          client
        );
      }
      await audit(req, 'vehiculo.crear', { entity: 'vehicle', entityId: row.id, details: { codigo: row.code } }, client);
      return row;
    });
    res.status(201).json({ vehicle: v });
  })
);

router.patch(
  '/:id',
  requireRole('gestor'),
  route(async (req, res) => {
    const v = await load(req);
    if (v.status === 'vendido') throw new HttpError(409, 'Un vehículo vendido no se modifica. Si la venta fue un error, anula su factura.');
    const input = validate(req.body, fields, { partial: true });
    const keys = Object.keys(input);
    if (!keys.length) throw new HttpError(422, 'No hay cambios que guardar');
    for (const k of ['vin', 'plate']) if (input[k]) input[k] = input[k].toUpperCase();
    const row = await db.one(
      `UPDATE vehicles SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
      [v.id, ...keys.map((k) => input[k])]
    );
    await audit(req, 'vehiculo.editar', { entity: 'vehicle', entityId: v.id, details: { campos: keys } });
    res.json({ vehicle: row });
  })
);

// ---------- Fotos ----------
const MAX_PHOTOS = 8;
const MAX_BYTES = 1.5 * 1024 * 1024;

/** Comprueba el tipo real por los primeros bytes: no nos fiamos de lo que diga el navegador. */
function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

router.post(
  '/:id/photos',
  requireRole('gestor'),
  route(async (req, res) => {
    const v = await load(req);
    const raw = String((req.body || {}).data || '');
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(raw);
    if (!match) throw new HttpError(422, 'Envía la foto en formato JPEG, PNG o WebP');
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > MAX_BYTES) throw new HttpError(413, 'La foto es demasiado grande (máximo 1,5 MB)');
    const mime = sniff(buf);
    if (!mime) throw new HttpError(422, 'El archivo no es una imagen válida');
    const count = await db.one('SELECT count(*)::int AS n, COALESCE(max(position), -1) AS last FROM vehicle_photos WHERE vehicle_id = $1', [v.id]);
    if (count.n >= MAX_PHOTOS) throw new HttpError(409, `Máximo ${MAX_PHOTOS} fotos por vehículo`);
    const photo = await db.one(
      'INSERT INTO vehicle_photos (id, tenant_id, vehicle_id, mime, data, size, position, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, mime, size, position',
      [crypto.randomUUID(), req.tenantId, v.id, mime, buf, buf.length, Number(count.last) + 1, req.user.id]
    );
    await audit(req, 'vehiculo.foto', { entity: 'vehicle', entityId: v.id, details: { codigo: v.code } });
    res.status(201).json({ photo });
  })
);

router.get(
  '/:id/photos/:photoId',
  route(async (req, res) => {
    const photo = await db.one('SELECT mime, data FROM vehicle_photos WHERE id = $1 AND vehicle_id = $2 AND tenant_id = $3', [req.params.photoId, req.params.id, req.tenantId]);
    if (!photo) throw new HttpError(404, 'Foto no encontrada');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.type(photo.mime).send(photo.data);
  })
);

router.post(
  '/:id/photos/:photoId/cover',
  requireRole('gestor'),
  route(async (req, res) => {
    const v = await load(req);
    const ok = await db.one('SELECT 1 FROM vehicle_photos WHERE id = $1 AND vehicle_id = $2', [req.params.photoId, v.id]);
    if (!ok) throw new HttpError(404, 'Foto no encontrada');
    // La portada pasa a la primera posición; el resto conserva su orden.
    await db.query('UPDATE vehicle_photos SET position = position + 1 WHERE vehicle_id = $1', [v.id]);
    await db.query('UPDATE vehicle_photos SET position = 0 WHERE id = $1', [req.params.photoId]);
    res.json({ ok: true });
  })
);

router.delete(
  '/:id/photos/:photoId',
  requireRole('gestor'),
  route(async (req, res) => {
    const v = await load(req);
    const row = await db.one('DELETE FROM vehicle_photos WHERE id = $1 AND vehicle_id = $2 RETURNING id', [req.params.photoId, v.id]);
    if (!row) throw new HttpError(404, 'Foto no encontrada');
    await audit(req, 'vehiculo.foto_borrar', { entity: 'vehicle', entityId: v.id, details: { codigo: v.code } });
    res.json({ deleted: true });
  })
);

/** Reservar para un cliente (cualquier rol: suele hacerlo quien atiende). */
router.post(
  '/:id/reserve',
  route(async (req, res) => {
    const input = validate(req.body, { client_name: text({ min: 2, max: 120 }), client_phone: phone(), until: date({ optional: true }) });
    const v = await load(req);
    if (v.status !== 'disponible') throw new HttpError(409, `El vehículo está ${v.status}`);
    const row = await db.one(
      "UPDATE vehicles SET status = 'reservado', reserved_for = $2, reserved_phone = $3, reserved_until = $4, updated_at = now() WHERE id = $1 RETURNING *",
      [v.id, input.client_name, input.client_phone, input.until]
    );
    await audit(req, 'vehiculo.reservar', { entity: 'vehicle', entityId: v.id, details: { codigo: v.code, cliente: input.client_name } });
    res.json({ vehicle: hideCost(req, row) });
  })
);

router.post(
  '/:id/release',
  route(async (req, res) => {
    const v = await load(req);
    if (v.status !== 'reservado') throw new HttpError(409, 'El vehículo no está reservado');
    const row = await db.one("UPDATE vehicles SET status = 'disponible', reserved_for = NULL, reserved_phone = NULL, reserved_until = NULL, updated_at = now() WHERE id = $1 RETURNING *", [v.id]);
    await audit(req, 'vehiculo.liberar', { entity: 'vehicle', entityId: v.id, details: { codigo: v.code } });
    res.json({ vehicle: hideCost(req, row) });
  })
);

/**
 * Vender: crea la factura de venta (con bastidor, matrícula y km), marca el vehículo como
 * vendido y, si el cliente paga en el momento, registra el cobro.
 */
router.post(
  '/:id/sell',
  requireRole('gestor'),
  route(async (req, res) => {
    const input = validate(req.body, {
      client_name: text({ min: 2, max: 120 }),
      client_phone: phone(),
      client_email: email({ optional: true }),
      client_document: text({ min: 3, max: 40 }),
      client_address: text({ min: 3, max: 200 }),
      price: number({ min: 1 }),
      tax_rate: number({ min: 0, max: 50 }),
      paid_now: number({ min: 0, optional: true }),
      method: oneOf(METHODS, { optional: true }),
      notes: text({ max: 1000, optional: true }),
    });
    if (input.paid_now && !input.method) throw new HttpError(422, 'Indica la forma de pago del cobro');
    const settings = await getSettings(req.tenantId);
    const result = await db.tx(async (client) => {
      const v = await db.one('SELECT * FROM vehicles WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [req.params.id, req.tenantId], client);
      if (!v) throw new HttpError(404, 'Vehículo no encontrado');
      if (v.status === 'vendido') throw new HttpError(409, 'Este vehículo ya está vendido');
      const clientId = await upsertClient(req.tenantId, { name: input.client_name, phone: input.client_phone, email: input.client_email, document: input.client_document }, client);
      let invoice = await billing.createDocument(
        req.tenantId,
        {
          kind: 'factura',
          client_id: clientId,
          client_name: input.client_name,
          client_phone: input.client_phone,
          client_email: input.client_email,
          client_document: input.client_document,
          client_address: input.client_address,
          concept: `Venta de vehículo ${v.brand} ${v.model} (${v.code})`,
          lines: [{ description: describe(v), quantity: 1, unit_price: input.price, tax_rate: input.tax_rate }],
          vehicle_id: v.id,
          notes: input.notes,
        },
        { userId: req.user.id, client, billing: settings.billing, currency: v.currency }
      );
      if (input.paid_now) {
        invoice = await billing.registerPayment(invoice, { amount: input.paid_now, method: input.method }, { userId: req.user.id, client });
      }
      const vehicle = await db.one(
        "UPDATE vehicles SET status = 'vendido', sold_at = now(), invoice_id = $2, client_id = $3, reserved_for = NULL, reserved_phone = NULL, reserved_until = NULL, updated_at = now() WHERE id = $1 RETURNING *",
        [v.id, invoice.id, clientId],
        client
      );
      await audit(req, 'vehiculo.vender', { entity: 'vehicle', entityId: v.id, details: { codigo: v.code, factura: invoice.number, precio: input.price } }, client);
      return { vehicle, invoice };
    });
    res.status(201).json(result);
  })
);

module.exports = router;
module.exports.describe = describe;
