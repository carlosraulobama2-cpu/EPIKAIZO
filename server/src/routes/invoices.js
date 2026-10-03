// Facturas: listado, alta manual, cobro, anulación y envío por WhatsApp. Solo gestores y administradores.
const express = require('express');
const db = require('../db');
const { route, validate, paging, text, phone, email, number, oneOf, HttpError } = require('../lib/http');
const { filters } = require('../lib/list');
const { audit } = require('../services/audit');
const { createInvoice, sendInvoiceWhatsApp, qrPng } = require('../services/invoices');
const { getSettings } = require('../services/settings');

const router = express.Router();

router.get(
  '/',
  route(async (req, res) => {
    const { limit, offset } = paging(req.query);
    const f = filters(req.tenantId)
      .eq('status', req.query.status, ['emitida', 'enviada', 'pagada', 'anulada'])
      .range('created_at', req.query.from, req.query.to)
      .search(['number', 'client_name', 'client_phone', 'concept'], req.query.q);
    const [items, count, totals] = await Promise.all([
      db.many(`SELECT * FROM invoices WHERE ${f.sql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, f.params),
      db.one(`SELECT count(*)::int AS n FROM invoices WHERE ${f.sql}`, f.params),
      db.one(
        `SELECT COALESCE(sum(amount) FILTER (WHERE status IN ('emitida', 'enviada')), 0) AS pending,
                COALESCE(sum(amount) FILTER (WHERE status = 'pagada'), 0) AS paid
           FROM invoices WHERE ${f.sql}`,
        f.params
      ),
    ]);
    res.json({ items, total: count.n, totals });
  })
);

router.post(
  '/',
  route(async (req, res) => {
    const input = validate(req.body, {
      client_name: text({ min: 2, max: 120 }),
      client_phone: phone(),
      client_email: email({ optional: true }),
      concept: text({ min: 3, max: 200 }),
      amount: number({ min: 0.01 }),
    });
    const { rates } = await getSettings(req.tenantId);
    const invoice = await createInvoice(req.tenantId, { ...input, currency: rates.currency }, { userId: req.user.id });
    await audit(req, 'factura.crear', { entity: 'invoice', entityId: invoice.id, details: { numero: invoice.number, importe: invoice.amount } });
    res.status(201).json({ invoice });
  })
);

async function load(req) {
  const invoice = await db.one('SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!invoice) throw new HttpError(404, 'Factura no encontrada');
  return invoice;
}

router.get('/:id/qr.png', route(async (req, res) => {
  const invoice = await load(req);
  res.type('png').send(await qrPng(invoice));
}));

router.post(
  '/:id/status',
  route(async (req, res) => {
    const input = validate(req.body, { status: oneOf(['pagada', 'anulada']) });
    const invoice = await load(req);
    if (invoice.status === 'anulada') throw new HttpError(409, 'La factura está anulada');
    if (invoice.status === input.status) return res.json({ invoice });
    const updated = await db.one('UPDATE invoices SET status = $2 WHERE id = $1 RETURNING *', [invoice.id, input.status]);
    await audit(req, `factura.${input.status}`, { entity: 'invoice', entityId: invoice.id, details: { numero: invoice.number } });
    res.json({ invoice: updated });
  })
);

router.post(
  '/:id/send',
  route(async (req, res) => {
    const invoice = await load(req);
    if (invoice.status === 'anulada') throw new HttpError(409, 'No se envía una factura anulada');
    const { company } = await getSettings(req.tenantId);
    const updated = await sendInvoiceWhatsApp(invoice, company.name);
    await audit(req, 'factura.enviar', { entity: 'invoice', entityId: invoice.id, details: { numero: invoice.number } });
    res.json({ invoice: updated });
  })
);

module.exports = router;
