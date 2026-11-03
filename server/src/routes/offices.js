// Oficinas o sucursales. Las ve cualquiera del equipo; las crea y edita un administrador.
// No se borran: se desactivan, para no perder el historial de envíos, cobros y cajas.
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { route, validate, text, bool, HttpError } = require('../lib/http');
const { requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();
const fields = {
  name: text({ min: 2, max: 60 }),
  city: text({ min: 2, max: 60 }),
  address: text({ max: 200, optional: true }),
  phone: text({ max: 30, optional: true }),
};

router.get('/', route(async (req, res) => {
  res.json({ items: await db.many('SELECT * FROM offices WHERE tenant_id = $1 ORDER BY active DESC, name', [req.tenantId]) });
}));

router.post(
  '/',
  requireRole('admin'),
  route(async (req, res) => {
    const input = validate(req.body, fields);
    const taken = await db.one('SELECT 1 FROM offices WHERE tenant_id = $1 AND lower(name) = lower($2)', [req.tenantId, input.name]);
    if (taken) throw new HttpError(409, 'Ya hay una oficina con ese nombre');
    const office = await db.one(
      'INSERT INTO offices (id, tenant_id, name, city, address, phone) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [crypto.randomUUID(), req.tenantId, input.name, input.city, input.address, input.phone]
    );
    await audit(req, 'oficina.crear', { entity: 'office', entityId: office.id, details: { nombre: office.name } });
    res.status(201).json({ item: office });
  })
);

router.patch(
  '/:id',
  requireRole('admin'),
  route(async (req, res) => {
    const input = validate(req.body, { ...fields, active: bool() }, { partial: true });
    const office = await db.one('SELECT * FROM offices WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    if (!office) throw new HttpError(404, 'Oficina no encontrada');
    if (input.active === false) {
      const open = await db.one("SELECT 1 FROM cash_sessions WHERE office_id = $1 AND status = 'abierta'", [office.id]);
      if (open) throw new HttpError(409, 'Esta oficina tiene la caja abierta: ciérrala antes de desactivarla');
    }
    const keys = Object.keys(input);
    if (!keys.length) throw new HttpError(422, 'No hay cambios que guardar');
    const updated = await db.one(
      `UPDATE offices SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')}, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [office.id, req.tenantId, ...keys.map((k) => input[k])]
    );
    await audit(req, 'oficina.editar', { entity: 'office', entityId: office.id, details: input });
    res.json({ item: updated });
  })
);

module.exports = router;
