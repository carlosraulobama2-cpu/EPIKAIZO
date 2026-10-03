// Registro de actividad: quién hizo qué y cuándo. Solo lectura (no se puede borrar desde el panel).
const express = require('express');
const db = require('../db');
const { route, paging } = require('../lib/http');
const { filters } = require('../lib/list');

const router = express.Router();

router.get(
  '/',
  route(async (req, res) => {
    const { limit, offset } = paging(req.query);
    const f = filters(req.tenantId).range('created_at', req.query.from, req.query.to).search(['action', 'user_name', 'entity_id', 'details'], req.query.q);
    const [items, count] = await Promise.all([
      db.many(`SELECT id, user_name, action, entity, entity_id, details, ip, created_at FROM audit_log WHERE ${f.sql} ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`, f.params),
      db.one(`SELECT count(*)::int AS n FROM audit_log WHERE ${f.sql}`, f.params),
    ]);
    res.json({ items, total: count.n });
  })
);

module.exports = router;
