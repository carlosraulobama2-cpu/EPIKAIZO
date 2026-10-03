// Router CRUD para tablas sencillas (empleados, proveedores, caja...). Las columnas salen de una
// lista fija validada, nunca del cuerpo de la petición, y todo se filtra por la empresa del usuario.
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { route, validate, paging, HttpError } = require('./http');
const { filters } = require('./list');
const { requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');

function crudRouter({ table, entity, fields, search = [], order = 'created_at DESC', listFilters = () => {}, roles = {}, hasUpdatedAt = true }) {
  const router = express.Router();
  const canRead = requireRole(roles.read || 'operador');
  const canWrite = requireRole(roles.write || 'operador');
  const canDelete = requireRole(roles.delete || 'gestor');
  const columns = Object.keys(fields);

  router.get(
    '/',
    canRead,
    route(async (req, res) => {
      const { limit, offset } = paging(req.query);
      const f = filters(req.tenantId).search(search, req.query.q);
      listFilters(f, req.query);
      const [items, count] = await Promise.all([
        db.many(`SELECT * FROM ${table} WHERE ${f.sql} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, f.params),
        db.one(`SELECT count(*)::int AS n FROM ${table} WHERE ${f.sql}`, f.params),
      ]);
      res.json({ items, total: count.n });
    })
  );

  router.post(
    '/',
    canWrite,
    route(async (req, res) => {
      const input = validate(req.body, fields);
      const cols = ['id', 'tenant_id', ...columns];
      const values = [crypto.randomUUID(), req.tenantId, ...columns.map((c) => input[c])];
      if (table === 'cash_movements') {
        cols.push('created_by');
        values.push(req.user.id);
      }
      const row = await db.one(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
        values
      );
      await audit(req, `${entity}.crear`, { entity, entityId: row.id });
      res.status(201).json({ item: row });
    })
  );

  router.patch(
    '/:id',
    canWrite,
    route(async (req, res) => {
      const input = validate(req.body, fields, { partial: true });
      const keys = Object.keys(input);
      if (!keys.length) throw new HttpError(422, 'No hay cambios que guardar');
      const sets = keys.map((k, i) => `${k} = $${i + 3}`);
      if (hasUpdatedAt) sets.push('updated_at = now()');
      const row = await db.one(
        `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [req.params.id, req.tenantId, ...keys.map((k) => input[k])]
      );
      if (!row) throw new HttpError(404, 'No encontrado');
      await audit(req, `${entity}.editar`, { entity, entityId: row.id, details: { campos: keys } });
      res.json({ item: row });
    })
  );

  router.delete(
    '/:id',
    canDelete,
    route(async (req, res) => {
      const row = await db.one(`DELETE FROM ${table} WHERE id = $1 AND tenant_id = $2 RETURNING id`, [req.params.id, req.tenantId]);
      if (!row) throw new HttpError(404, 'No encontrado');
      await audit(req, `${entity}.borrar`, { entity, entityId: row.id });
      res.json({ deleted: true });
    })
  );

  return router;
}

module.exports = { crudRouter };
