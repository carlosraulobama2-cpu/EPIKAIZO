// Inventario de materiales: entradas (compras), salidas (a una obra, que suman su coste a la obra)
// y ajustes por recuento. Aviso cuando un material baja de su mínimo.
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { route, validate, paging, text, number, oneOf, uuid, bool, HttpError } = require('../lib/http');
const { filters } = require('../lib/list');
const { requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { today } = require('../lib/dates');

const router = express.Router();
const UNITS = ['ud', 'kg', 'saco', 'm', 'm2', 'm3', 'l', 'caja', 'rollo', 'bote'];
const fields = {
  name: text({ min: 2, max: 120 }),
  category: text({ max: 60, optional: true }),
  unit: oneOf(UNITS),
  min_stock: number({ min: 0, max: 1e9 }),
  unit_cost: number({ min: 0, max: 1e10 }),
  office_id: uuid({ optional: true }),
  notes: text({ max: 500, optional: true }),
};
const round = (n, d = 3) => Math.round(Number(n) * 10 ** d) / 10 ** d;

const LIST = `SELECT m.*, (m.min_stock > 0 AND m.stock <= m.min_stock) AS low, o.name AS office_name
  FROM materials m LEFT JOIN offices o ON o.id = m.office_id`;

router.get(
  '/',
  route(async (req, res) => {
    const { limit, offset } = paging(req.query);
    const f = filters(req.tenantId, 'm').search(['name', 'category'], req.query.q);
    if (req.query.low === '1') f.raw('m.min_stock > 0 AND m.stock <= m.min_stock');
    if (req.query.active !== 'all') f.raw('m.active');
    const [items, count, value] = await Promise.all([
      db.many(`${LIST} WHERE ${f.sql} ORDER BY (m.min_stock > 0 AND m.stock <= m.min_stock) DESC, m.name LIMIT ${limit} OFFSET ${offset}`, f.params),
      db.one(`SELECT count(*)::int AS n FROM materials m WHERE ${f.sql}`, f.params),
      db.one("SELECT COALESCE(sum(stock * unit_cost), 0) AS total, count(*) FILTER (WHERE min_stock > 0 AND stock <= min_stock)::int AS low FROM materials WHERE tenant_id = $1 AND active", [req.tenantId]),
    ]);
    res.json({ items, total: count.n, stock_value: Number(value.total), low_count: value.low, units: UNITS });
  })
);

async function loadMaterial(req, client, lock = false) {
  const m = await db.one(`SELECT * FROM materials WHERE id = $1 AND tenant_id = $2${lock ? ' FOR UPDATE' : ''}`, [req.params.id, req.tenantId], client);
  if (!m) throw new HttpError(404, 'Material no encontrado');
  return m;
}

router.get(
  '/:id',
  route(async (req, res) => {
    const material = await db.one(`${LIST} WHERE m.id = $1 AND m.tenant_id = $2`, [req.params.id, req.tenantId]);
    if (!material) throw new HttpError(404, 'Material no encontrado');
    const movements = await db.many(
      `SELECT s.*, u.name AS user_name, j.code AS job_code, j.title AS job_title, p.name AS provider_name
         FROM stock_movements s LEFT JOIN users u ON u.id = s.created_by LEFT JOIN jobs j ON j.id = s.job_id LEFT JOIN providers p ON p.id = s.provider_id
        WHERE s.material_id = $1 ORDER BY s.created_at DESC LIMIT 60`,
      [material.id]
    );
    res.json({ item: material, movements });
  })
);

router.post(
  '/',
  requireRole('gestor'),
  route(async (req, res) => {
    const input = validate(req.body, { ...fields, stock: number({ min: 0, max: 1e9, optional: true }) });
    const taken = await db.one('SELECT 1 FROM materials WHERE tenant_id = $1 AND lower(name) = lower($2)', [req.tenantId, input.name]);
    if (taken) throw new HttpError(409, 'Ya hay un material con ese nombre');
    const item = await db.tx(async (client) => {
      const m = await db.one(
        `INSERT INTO materials (id, tenant_id, name, category, unit, stock, min_stock, unit_cost, office_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [crypto.randomUUID(), req.tenantId, input.name, input.category, input.unit, round(input.stock || 0), input.min_stock, input.unit_cost, input.office_id || req.user.office_id || null, input.notes],
        client
      );
      if (Number(m.stock) > 0) {
        await db.query(
          "INSERT INTO stock_movements (id, tenant_id, material_id, type, quantity, delta, unit_cost, notes, created_by) VALUES ($1,$2,$3,'ajuste',$4,$4,$5,'Existencias iniciales',$6)",
          [crypto.randomUUID(), req.tenantId, m.id, m.stock, m.unit_cost, req.user.id],
          client
        );
      }
      await audit(req, 'material.crear', { entity: 'material', entityId: m.id, details: { nombre: m.name } }, client);
      return m;
    });
    res.status(201).json({ item });
  })
);

router.patch(
  '/:id',
  requireRole('gestor'),
  route(async (req, res) => {
    const material = await loadMaterial(req);
    const input = validate(req.body, { ...fields, active: bool() }, { partial: true });
    const keys = Object.keys(input);
    if (!keys.length) throw new HttpError(422, 'No hay cambios que guardar');
    const item = await db.one(
      `UPDATE materials SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')}, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [material.id, req.tenantId, ...keys.map((k) => input[k])]
    );
    await audit(req, 'material.editar', { entity: 'material', entityId: material.id, details: { campos: keys } });
    res.json({ item });
  })
);

// Movimiento de existencias. Una salida a una obra apunta también su coste en la obra.
router.post(
  '/:id/movements',
  route(async (req, res) => {
    const input = validate(req.body, {
      type: oneOf(['entrada', 'salida', 'ajuste']),
      quantity: number({ min: 0, max: 1e9 }),
      unit_cost: number({ min: 0, max: 1e10, optional: true }),
      job_id: uuid({ optional: true }),
      provider_id: uuid({ optional: true }),
      notes: text({ max: 300, optional: true }),
    });
    if (input.type !== 'ajuste' && !(input.quantity > 0)) throw new HttpError(422, 'Indica una cantidad mayor que cero', { quantity: 'mayor que cero' });
    const result = await db.tx(async (client) => {
      const m = await loadMaterial(req, client, true);
      const stock = Number(m.stock);
      let delta;
      if (input.type === 'entrada') delta = input.quantity;
      else if (input.type === 'salida') {
        if (input.quantity > stock) throw new HttpError(409, `Solo quedan ${round(stock)} ${m.unit} de ${m.name}`);
        delta = -input.quantity;
      } else delta = input.quantity - stock; // ajuste: la cantidad es lo contado
      let job = null;
      if (input.job_id) {
        job = await db.one('SELECT id, code FROM jobs WHERE id = $1 AND tenant_id = $2', [input.job_id, req.tenantId], client);
        if (!job) throw new HttpError(422, 'Esa obra no existe');
      }
      if (input.provider_id) {
        const provider = await db.one('SELECT id FROM providers WHERE id = $1 AND tenant_id = $2', [input.provider_id, req.tenantId], client);
        if (!provider) throw new HttpError(422, 'Ese proveedor no existe');
      }
      const unitCost = input.unit_cost ?? Number(m.unit_cost);
      const movement = await db.one(
        `INSERT INTO stock_movements (id, tenant_id, material_id, type, quantity, delta, unit_cost, job_id, provider_id, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [crypto.randomUUID(), req.tenantId, m.id, input.type, round(input.quantity), round(delta), unitCost, job && job.id, input.provider_id, input.notes, req.user.id],
        client
      );
      // Una compra actualiza el coste unitario (media ponderada con lo que había).
      let newCost = Number(m.unit_cost);
      if (input.type === 'entrada' && input.unit_cost !== undefined && input.unit_cost !== null) {
        newCost = stock > 0 ? (stock * Number(m.unit_cost) + input.quantity * input.unit_cost) / (stock + input.quantity) : input.unit_cost;
      }
      const updated = await db.one('UPDATE materials SET stock = stock + $2, unit_cost = $3, updated_at = now() WHERE id = $1 RETURNING *', [m.id, round(delta), Math.round(newCost * 100) / 100], client);
      let cost = null;
      if (job && input.type === 'salida') {
        cost = await db.one(
          `INSERT INTO job_costs (id, tenant_id, job_id, kind, concept, quantity, unit_cost, amount, material_id, movement_id, cost_date, created_by)
           VALUES ($1,$2,$3,'materiales',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [crypto.randomUUID(), req.tenantId, job.id, `${m.name} (${round(input.quantity)} ${m.unit})`, round(input.quantity), unitCost, Math.round(input.quantity * unitCost), m.id, movement.id, today(), req.user.id],
          client
        );
      }
      await audit(req, `material.${input.type}`, { entity: 'material', entityId: m.id, details: { cantidad: input.quantity, obra: job && job.code } }, client);
      return { item: updated, movement, cost };
    });
    res.status(201).json(result);
  })
);

module.exports = router;
