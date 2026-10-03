// Trabajos: construcción, mantenimiento, oficios (fontanería, electricidad...) y gestión administrativa.
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { route, validate, paging, text, phone, number, oneOf, bool, date, uuid, HttpError } = require('../lib/http');
const { filters } = require('../lib/list');
const { requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { upsertClient } = require('../services/clients');
const { jobCode } = require('../services/codes');
const { createInvoice } = require('../services/invoices');
const { getSettings } = require('../services/settings');

const router = express.Router();

const CATEGORIES = {
  construccion: 'Construcción',
  mantenimiento: 'Mantenimiento general',
  electronica: 'Reparación de electrónica',
  fontaneria: 'Fontanería',
  electricidad: 'Electricidad',
  climatizacion: 'Climatización',
  carpinteria: 'Carpintería y reformas',
  mudanza: 'Mudanzas y transporte',
  gestion: 'Gestión administrativa',
  vehiculos: 'Venta de vehículos',
  otro: 'Otro',
};
const STATUSES = ['nuevo', 'presupuestado', 'en_curso', 'terminado', 'cancelado'];

const fields = {
  category: oneOf(Object.keys(CATEGORIES)),
  title: text({ min: 3, max: 140 }),
  client_name: text({ min: 2, max: 120 }),
  client_phone: phone(),
  city: text({ max: 80, optional: true }),
  address: text({ max: 200, optional: true }),
  description: text({ max: 2000, optional: true }),
  budget: number({ min: 0, optional: true }),
  price: number({ min: 0, optional: true }),
  paid: bool(),
  scheduled_for: date({ optional: true }),
  assigned_to: uuid({ optional: true }),
  status: oneOf(STATUSES, { optional: true }),
};

router.get('/categories', (req, res) => res.json({ categories: CATEGORIES }));

router.get(
  '/',
  route(async (req, res) => {
    const { limit, offset } = paging(req.query);
    const f = filters(req.tenantId, 'j')
      .eq('status', req.query.status, STATUSES)
      .eq('category', req.query.category, Object.keys(CATEGORIES))
      .range('created_at', req.query.from, req.query.to)
      .search(['code', 'title', 'client_name', 'client_phone', 'city'], req.query.q);
    if (req.query.status === 'abiertos') f.raw("j.status NOT IN ('terminado', 'cancelado')");
    const [items, count] = await Promise.all([
      db.many(
        `SELECT j.*, e.name AS assigned_name FROM jobs j LEFT JOIN employees e ON e.id = j.assigned_to
          WHERE ${f.sql} ORDER BY j.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
        f.params
      ),
      db.one(`SELECT count(*)::int AS n FROM jobs j WHERE ${f.sql}`, f.params),
    ]);
    res.json({ items, total: count.n, categories: CATEGORIES });
  })
);

router.get(
  '/:id',
  route(async (req, res) => {
    const job = await db.one(
      'SELECT j.*, e.name AS assigned_name FROM jobs j LEFT JOIN employees e ON e.id = j.assigned_to WHERE j.id = $1 AND j.tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!job) throw new HttpError(404, 'Trabajo no encontrado');
    res.json({ item: job });
  })
);

async function checkEmployee(req, id) {
  if (!id) return;
  const ok = await db.one('SELECT 1 FROM employees WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
  if (!ok) throw new HttpError(422, 'El empleado asignado no existe');
}

router.post(
  '/',
  route(async (req, res) => {
    const input = validate(req.body, fields);
    await checkEmployee(req, input.assigned_to);
    const { rates } = await getSettings(req.tenantId);
    const job = await db.tx(async (client) => {
      const clientId = await upsertClient(req.tenantId, { name: input.client_name, phone: input.client_phone, city: input.city }, client);
      const row = await db.one(
        `INSERT INTO jobs (id, tenant_id, code, category, title, status, client_id, client_name, client_phone, city, address, description,
                           budget, price, currency, paid, scheduled_for, assigned_to, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
        [crypto.randomUUID(), req.tenantId, await jobCode(req.tenantId, client), input.category, input.title, input.status || 'nuevo', clientId,
          input.client_name, input.client_phone, input.city, input.address, input.description, input.budget, input.price, rates.currency,
          input.paid, input.scheduled_for, input.assigned_to, req.user.id],
        client
      );
      await audit(req, 'trabajo.crear', { entity: 'job', entityId: row.id, details: { codigo: row.code } }, client);
      return row;
    });
    res.status(201).json({ item: job });
  })
);

router.patch(
  '/:id',
  route(async (req, res) => {
    const input = validate(req.body, fields, { partial: true });
    if ('assigned_to' in input) await checkEmployee(req, input.assigned_to);
    const keys = Object.keys(input);
    if (!keys.length) throw new HttpError(422, 'No hay cambios que guardar');
    const sets = keys.map((k, i) => `${k} = $${i + 3}`);
    if (input.status === 'terminado') sets.push('finished_at = COALESCE(finished_at, now())');
    const row = await db.one(
      `UPDATE jobs SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenantId, ...keys.map((k) => input[k])]
    );
    if (!row) throw new HttpError(404, 'Trabajo no encontrado');
    await audit(req, 'trabajo.editar', { entity: 'job', entityId: row.id, details: { campos: keys } });
    res.json({ item: row });
  })
);

router.post(
  '/:id/invoice',
  requireRole('gestor'),
  route(async (req, res) => {
    const job = await db.one('SELECT * FROM jobs WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    if (!job) throw new HttpError(404, 'Trabajo no encontrado');
    const amount = Number(job.price || job.budget || 0);
    if (!(amount > 0)) throw new HttpError(422, 'Pon un precio al trabajo antes de facturarlo');
    const existing = await db.one("SELECT * FROM invoices WHERE job_id = $1 AND status <> 'anulada'", [job.id]);
    if (existing) return res.json({ invoice: existing, existing: true });
    const invoice = await createInvoice(
      req.tenantId,
      { client_name: job.client_name, client_phone: job.client_phone, concept: `${CATEGORIES[job.category]}: ${job.title} (${job.code})`, amount, currency: job.currency, job_id: job.id },
      { userId: req.user.id }
    );
    await audit(req, 'factura.crear', { entity: 'invoice', entityId: invoice.id, details: { numero: invoice.number, trabajo: job.code } });
    res.status(201).json({ invoice });
  })
);

router.delete(
  '/:id',
  requireRole('gestor'),
  route(async (req, res) => {
    const row = await db.one('DELETE FROM jobs WHERE id = $1 AND tenant_id = $2 RETURNING id, code', [req.params.id, req.tenantId]);
    if (!row) throw new HttpError(404, 'Trabajo no encontrado');
    await audit(req, 'trabajo.borrar', { entity: 'job', entityId: row.id, details: { codigo: row.code } });
    res.json({ deleted: true });
  })
);

module.exports = router;
module.exports.CATEGORIES = CATEGORIES;
