// Directorio de clientes. Se rellena solo con cada envío o trabajo y se puede editar a mano.
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { route, validate, paging, text, phone, email, HttpError } = require('../lib/http');
const { filters } = require('../lib/list');
const { requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();

const fields = {
  name: text({ min: 2, max: 120 }),
  phone: phone(),
  email: email({ optional: true }),
  city: text({ max: 80, optional: true }),
  address: text({ max: 200, optional: true }),
  document: text({ max: 40, optional: true }),
  notes: text({ max: 500, optional: true }),
};

// Actividad de cada cliente: envíos y trabajos, con lo que ha pagado en total.
const ACTIVITY = `
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS shipments, COALESCE(sum(total) FILTER (WHERE status <> 'cancelado'), 0) AS shipments_total, max(created_at) AS last_shipment
      FROM shipments s WHERE s.client_id = c.id
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS jobs, COALESCE(sum(price) FILTER (WHERE status <> 'cancelado'), 0) AS jobs_total, max(created_at) AS last_job
      FROM jobs j WHERE j.client_id = c.id
  ) j ON true`;

router.get(
  '/',
  route(async (req, res) => {
    const { limit, offset } = paging(req.query);
    const f = filters(req.tenantId, 'c').search(['name', 'phone', 'email', 'city'], req.query.q);
    const order = req.query.sort === 'valor' ? '(s.shipments_total + j.jobs_total) DESC' : 'GREATEST(s.last_shipment, j.last_job, c.created_at) DESC';
    const [items, count] = await Promise.all([
      db.many(
        `SELECT c.*, s.shipments, s.shipments_total, s.last_shipment, j.jobs, j.jobs_total, j.last_job,
                (s.shipments_total + j.jobs_total) AS lifetime_value, GREATEST(s.last_shipment, j.last_job) AS last_activity
           FROM clients c ${ACTIVITY}
          WHERE ${f.sql} ORDER BY ${order} NULLS LAST LIMIT ${limit} OFFSET ${offset}`,
        f.params
      ),
      db.one(`SELECT count(*)::int AS n FROM clients c WHERE ${f.sql}`, f.params),
    ]);
    res.json({ items, total: count.n });
  })
);

router.get(
  '/:id',
  route(async (req, res) => {
    const client = await db.one(
      `SELECT c.*, s.shipments, s.shipments_total, j.jobs, j.jobs_total FROM clients c ${ACTIVITY} WHERE c.id = $1 AND c.tenant_id = $2`,
      [req.params.id, req.tenantId]
    );
    if (!client) throw new HttpError(404, 'Cliente no encontrado');
    const [shipments, jobs] = await Promise.all([
      db.many('SELECT id, tracking_code, kind, status, destination, total, currency, created_at FROM shipments WHERE client_id = $1 ORDER BY created_at DESC LIMIT 20', [client.id]),
      db.many('SELECT id, code, title, category, status, price, currency, created_at FROM jobs WHERE client_id = $1 ORDER BY created_at DESC LIMIT 20', [client.id]),
    ]);
    res.json({ client, shipments, jobs });
  })
);

router.post(
  '/',
  route(async (req, res) => {
    const input = validate(req.body, fields);
    const exists = await db.one('SELECT id FROM clients WHERE tenant_id = $1 AND phone = $2', [req.tenantId, input.phone]);
    if (exists) throw new HttpError(409, 'Ya hay un cliente con ese teléfono');
    const keys = Object.keys(fields);
    const row = await db.one(
      `INSERT INTO clients (id, tenant_id, ${keys.join(', ')}) VALUES ($1, $2, ${keys.map((_, i) => `$${i + 3}`).join(', ')}) RETURNING *`,
      [crypto.randomUUID(), req.tenantId, ...keys.map((k) => input[k])]
    );
    await audit(req, 'cliente.crear', { entity: 'client', entityId: row.id });
    res.status(201).json({ item: row });
  })
);

router.patch(
  '/:id',
  route(async (req, res) => {
    const input = validate(req.body, fields, { partial: true });
    const keys = Object.keys(input);
    if (!keys.length) throw new HttpError(422, 'No hay cambios que guardar');
    const row = await db.one(
      `UPDATE clients SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')}, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenantId, ...keys.map((k) => input[k])]
    );
    if (!row) throw new HttpError(404, 'Cliente no encontrado');
    await audit(req, 'cliente.editar', { entity: 'client', entityId: row.id, details: { campos: keys } });
    res.json({ item: row });
  })
);

router.delete(
  '/:id',
  requireRole('gestor'),
  route(async (req, res) => {
    const used = await db.one('SELECT (SELECT count(*) FROM shipments WHERE client_id = $1) + (SELECT count(*) FROM jobs WHERE client_id = $1) AS n', [req.params.id]);
    if (used && used.n > 0) throw new HttpError(409, 'Este cliente tiene envíos o trabajos: no se puede borrar');
    const row = await db.one('DELETE FROM clients WHERE id = $1 AND tenant_id = $2 RETURNING id', [req.params.id, req.tenantId]);
    if (!row) throw new HttpError(404, 'Cliente no encontrado');
    await audit(req, 'cliente.borrar', { entity: 'client', entityId: row.id });
    res.json({ deleted: true });
  })
);

module.exports = router;
