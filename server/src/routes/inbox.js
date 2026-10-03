// Bandeja única: mensajes del formulario de la web y de WhatsApp, con estado y respuesta.
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { route, validate, paging, text, oneOf, HttpError } = require('../lib/http');
const { filters } = require('../lib/list');
const { audit } = require('../services/audit');
const { upsertClient } = require('../services/clients');
const { jobCode } = require('../services/codes');
const { getSettings } = require('../services/settings');
const whatsapp = require('../services/whatsapp');
const { CATEGORIES } = require('./jobs');

const router = express.Router();

router.get(
  '/',
  route(async (req, res) => {
    const { limit, offset } = paging(req.query);
    const f = filters(req.tenantId)
      .eq('status', req.query.status, ['nuevo', 'en_proceso', 'atendido'])
      .eq('channel', req.query.channel, ['web', 'whatsapp'])
      .search(['name', 'phone', 'email', 'body', 'topic'], req.query.q);
    const [items, count, unread] = await Promise.all([
      db.many(`SELECT * FROM messages WHERE ${f.sql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, f.params),
      db.one(`SELECT count(*)::int AS n FROM messages WHERE ${f.sql}`, f.params),
      db.one("SELECT count(*)::int AS n FROM messages WHERE tenant_id = $1 AND status = 'nuevo' AND direction = 'entrante'", [req.tenantId]),
    ]);
    res.json({ items, total: count.n, unread: unread.n, whatsapp_enabled: whatsapp.enabled() });
  })
);

router.patch(
  '/:id',
  route(async (req, res) => {
    const input = validate(req.body, { status: oneOf(['nuevo', 'en_proceso', 'atendido']) });
    const row = await db.one('UPDATE messages SET status = $3, handled_by = $4 WHERE id = $1 AND tenant_id = $2 RETURNING *', [req.params.id, req.tenantId, input.status, req.user.id]);
    if (!row) throw new HttpError(404, 'Mensaje no encontrado');
    await audit(req, 'mensaje.estado', { entity: 'message', entityId: row.id, details: { estado: input.status } });
    res.json({ item: row });
  })
);

/** Responder por WhatsApp a quien escribió. */
router.post(
  '/:id/reply',
  route(async (req, res) => {
    const input = validate(req.body, { body: text({ min: 1, max: 1000 }) });
    const message = await db.one('SELECT * FROM messages WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    if (!message) throw new HttpError(404, 'Mensaje no encontrado');
    if (!message.phone) throw new HttpError(422, 'Este mensaje no tiene teléfono al que responder');
    const externalId = await whatsapp.sendText(message.phone, input.body);
    const reply = await db.one(
      `INSERT INTO messages (id, tenant_id, channel, direction, name, phone, body, status, external_id, handled_by)
       VALUES ($1, $2, 'whatsapp', 'saliente', $3, $4, $5, 'atendido', $6, $7) RETURNING *`,
      [crypto.randomUUID(), req.tenantId, message.name, message.phone, input.body, externalId || null, req.user.id]
    );
    await db.query("UPDATE messages SET status = 'atendido', handled_by = $2 WHERE id = $1", [message.id, req.user.id]);
    await audit(req, 'mensaje.responder', { entity: 'message', entityId: message.id });
    res.status(201).json({ item: reply });
  })
);

/** Convertir una petición de la web en un trabajo, sin volver a teclear los datos. */
router.post(
  '/:id/job',
  route(async (req, res) => {
    const input = validate(req.body, { category: oneOf(Object.keys(CATEGORIES)), title: text({ min: 3, max: 140 }) });
    const message = await db.one('SELECT * FROM messages WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    if (!message) throw new HttpError(404, 'Mensaje no encontrado');
    if (message.job_id) throw new HttpError(409, 'Este mensaje ya tiene un trabajo creado');
    if (!message.phone || !message.name) throw new HttpError(422, 'Faltan el nombre o el teléfono del cliente');
    const { rates } = await getSettings(req.tenantId);
    const job = await db.tx(async (client) => {
      const clientId = await upsertClient(req.tenantId, { name: message.name, phone: message.phone, email: message.email }, client);
      const row = await db.one(
        `INSERT INTO jobs (id, tenant_id, code, category, title, client_id, client_name, client_phone, description, currency, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [crypto.randomUUID(), req.tenantId, await jobCode(req.tenantId, client), input.category, input.title, clientId, message.name, message.phone, message.body, rates.currency, req.user.id],
        client
      );
      await db.query("UPDATE messages SET job_id = $2, status = 'en_proceso', handled_by = $3 WHERE id = $1", [message.id, row.id, req.user.id], client);
      await audit(req, 'trabajo.desde_mensaje', { entity: 'job', entityId: row.id, details: { codigo: row.code } }, client);
      return row;
    });
    res.status(201).json({ item: job });
  })
);

module.exports = router;
