// Facturación: presupuestos, facturas, rectificativas y cobros. Solo gestores y administradores.
const express = require('express');
const db = require('../db');
const { route, validate, paging, text, phone, email, number, oneOf, date, uuid, bool, HttpError } = require('../lib/http');
const { filters } = require('../lib/list');
const { audit } = require('../services/audit');
const { upsertClient } = require('../services/clients');
const billing = require('../services/billing');
const { sendInvoiceWhatsApp, qrPng, verifyUrl } = require('../services/invoices');
const { getSettings } = require('../services/settings');

const router = express.Router();
const KINDS = ['factura', 'presupuesto', 'rectificativa'];
const STATUSES = ['emitida', 'enviada', 'parcial', 'pagada', 'anulada', 'pendiente', 'aceptado', 'rechazado', 'facturado'];
const METHODS = ['efectivo', 'transferencia', 'movil', 'tarjeta'];

router.get(
  '/',
  route(async (req, res) => {
    const { limit, offset } = paging(req.query);
    const f = filters(req.tenantId)
      .eq('kind', req.query.kind, KINDS)
      .eq('status', req.query.status, STATUSES)
      .range('issue_date', req.query.from, req.query.to)
      .search(['number', 'client_name', 'client_phone', 'concept'], req.query.q);
    if (req.query.status === 'pendientes') f.raw("kind = 'factura' AND status IN ('emitida', 'enviada', 'parcial')");
    if (req.query.status === 'vencidas') f.raw("kind = 'factura' AND status IN ('emitida', 'enviada', 'parcial') AND due_date < CURRENT_DATE");
    const all = filters(req.tenantId);
    const [items, count, totals] = await Promise.all([
      db.many(
        `SELECT id, kind, number, status, client_name, client_phone, concept, subtotal, tax_amount, amount, paid_amount, currency,
                issue_date, due_date, valid_until, invoiced_pct, quote_id, vehicle_id, job_id, shipment_id, created_at,
                (kind = 'factura' AND status IN ('emitida', 'enviada', 'parcial') AND due_date < CURRENT_DATE) AS overdue
           FROM invoices WHERE ${f.sql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
        f.params
      ),
      db.one(`SELECT count(*)::int AS n FROM invoices WHERE ${f.sql}`, f.params),
      db.one(
        `SELECT COALESCE(sum(amount - paid_amount) FILTER (WHERE kind = 'factura' AND status IN ('emitida', 'enviada', 'parcial')), 0) AS pending,
                COALESCE(sum(amount - paid_amount) FILTER (WHERE kind = 'factura' AND status IN ('emitida', 'enviada', 'parcial') AND due_date < CURRENT_DATE), 0) AS overdue,
                COALESCE(sum(paid_amount) FILTER (WHERE kind = 'factura' AND date_trunc('month', issue_date) = date_trunc('month', CURRENT_DATE)), 0) AS paid_month,
                COALESCE(sum(amount) FILTER (WHERE kind = 'presupuesto' AND status IN ('pendiente', 'aceptado')), 0) AS quotes_open
           FROM invoices WHERE ${all.sql}`,
        all.params
      ),
    ]);
    res.json({ items, total: count.n, totals });
  })
);

const lineSchema = (l) => {
  if (!l || typeof l !== 'object') throw new HttpError(422, 'Línea no válida');
  return { description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate };
};

router.post(
  '/',
  route(async (req, res) => {
    const body = req.body || {};
    const input = validate(body, {
      kind: oneOf(['factura', 'presupuesto'], { optional: true }),
      client_name: text({ min: 2, max: 120 }),
      client_phone: phone(),
      client_email: email({ optional: true }),
      client_document: text({ max: 40, optional: true }),
      client_address: text({ max: 200, optional: true }),
      concept: text({ min: 3, max: 200, optional: true }),
      amount: number({ min: 0.01, optional: true }),
      due_date: date({ optional: true }),
      valid_until: date({ optional: true }),
      notes: text({ max: 1000, optional: true }),
      job_id: uuid({ optional: true }),
    });
    // Compatibilidad: "concepto + importe" equivale a una sola línea sin impuesto.
    let lines = Array.isArray(body.lines) ? body.lines.map(lineSchema) : null;
    if (!lines) {
      if (!input.concept || !input.amount) throw new HttpError(422, 'Añade al menos una línea');
      lines = [{ description: input.concept, quantity: 1, unit_price: input.amount, tax_rate: 0 }];
    }
    if (input.job_id) {
      const job = await db.one('SELECT id FROM jobs WHERE id = $1 AND tenant_id = $2', [input.job_id, req.tenantId]);
      if (!job) throw new HttpError(422, 'El trabajo no existe');
    }
    const settings = await getSettings(req.tenantId);
    const doc = await db.tx(async (client) => {
      const clientId = await upsertClient(req.tenantId, { name: input.client_name, phone: input.client_phone, email: input.client_email, document: input.client_document }, client);
      const created = await billing.createDocument(req.tenantId, { ...input, kind: input.kind || 'factura', client_id: clientId, lines }, {
        userId: req.user.id, client, billing: settings.billing, currency: settings.rates.currency,
      });
      if (created.kind === 'presupuesto' && input.job_id) {
        await db.query("UPDATE jobs SET budget = $2, status = CASE WHEN status = 'nuevo' THEN 'presupuestado' ELSE status END, updated_at = now() WHERE id = $1", [input.job_id, created.subtotal], client);
      }
      await audit(req, `${created.kind}.crear`, { entity: 'invoice', entityId: created.id, details: { numero: created.number, importe: created.amount } }, client);
      return created;
    });
    res.status(201).json({ invoice: doc });
  })
);

async function load(req, client) {
  const invoice = await db.one('SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId], client);
  if (!invoice) throw new HttpError(404, 'Documento no encontrado');
  return invoice;
}

async function related(invoice) {
  const [payments, children, rectification, rectifies, quote, vehicle, job] = await Promise.all([
    db.many('SELECT p.amount, p.method, p.paid_on, p.reference, p.created_at, u.name AS user_name FROM invoice_payments p LEFT JOIN users u ON u.id = p.created_by WHERE p.invoice_id = $1 ORDER BY p.paid_on, p.created_at', [invoice.id]),
    invoice.kind === 'presupuesto'
      ? db.many("SELECT id, number, status, amount, invoiced_pct, issue_date FROM invoices WHERE quote_id = $1 AND kind = 'factura' ORDER BY created_at", [invoice.id])
      : [],
    db.one("SELECT id, number, issue_date FROM invoices WHERE rectifies_id = $1 AND kind = 'rectificativa'", [invoice.id]),
    invoice.rectifies_id ? db.one('SELECT id, number, issue_date FROM invoices WHERE id = $1', [invoice.rectifies_id]) : null,
    invoice.quote_id ? db.one('SELECT id, number, amount FROM invoices WHERE id = $1', [invoice.quote_id]) : null,
    invoice.vehicle_id ? db.one('SELECT * FROM vehicles WHERE id = $1', [invoice.vehicle_id]) : null,
    invoice.job_id ? db.one('SELECT id, code, title, category, address, city FROM jobs WHERE id = $1', [invoice.job_id]) : null,
  ]);
  const invoicedPct = invoice.kind === 'presupuesto' ? await billing.invoicedPct(invoice.id) : null;
  return { payments, invoices: children, rectification, rectifies, quote, vehicle, job, invoiced_pct: invoicedPct };
}

router.get(
  '/:id',
  route(async (req, res) => {
    const invoice = await load(req);
    res.json({ invoice, ...(await related(invoice)) });
  })
);

/** Todo lo necesario para imprimir el documento o guardarlo en PDF. */
router.get(
  '/:id/document',
  route(async (req, res) => {
    const invoice = await load(req);
    const { company, billing: billingSettings } = await getSettings(req.tenantId);
    res.json({ invoice, ...(await related(invoice)), company, billing: billingSettings, verify_url: verifyUrl(invoice) });
  })
);

router.get('/:id/qr.png', route(async (req, res) => {
  const invoice = await load(req);
  res.type('png').send(await qrPng(invoice));
}));

router.post(
  '/:id/payments',
  route(async (req, res) => {
    const input = validate(req.body, {
      amount: number({ min: 0.01 }),
      method: oneOf(METHODS),
      paid_on: date({ optional: true }),
      reference: text({ max: 80, optional: true }),
    });
    const updated = await db.tx(async (client) => {
      const invoice = await db.one('SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [req.params.id, req.tenantId], client);
      if (!invoice) throw new HttpError(404, 'Documento no encontrado');
      const row = await billing.registerPayment(invoice, input, { userId: req.user.id, client });
      await audit(req, 'factura.cobro', { entity: 'invoice', entityId: invoice.id, details: { numero: invoice.number, importe: input.amount, metodo: input.method } }, client);
      return row;
    });
    res.status(201).json({ invoice: updated });
  })
);

router.post(
  '/:id/annul',
  route(async (req, res) => {
    const input = validate(req.body, { reason: text({ min: 5, max: 300 }), refunded: bool() });
    const settings = await getSettings(req.tenantId);
    const rect = await db.tx(async (client) => {
      const invoice = await db.one('SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [req.params.id, req.tenantId], client);
      if (!invoice) throw new HttpError(404, 'Documento no encontrado');
      // Con cobros, solo si se confirma que el dinero ya se devolvió al cliente.
      if (Number(invoice.paid_amount) > 0 && !input.refunded) {
        throw new HttpError(409, `Esta factura tiene ${invoice.paid_amount} cobrados. Devuelve el dinero al cliente y confirma la devolución para anularla.`);
      }
      const r = await billing.annul({ ...invoice, paid_amount: 0 }, input.refunded ? `${input.reason} (importe cobrado devuelto al cliente)` : input.reason, {
        userId: req.user.id, client, billing: settings.billing,
      });
      await audit(req, 'factura.anular', { entity: 'invoice', entityId: invoice.id, details: { numero: invoice.number, rectificativa: r.number, motivo: input.reason } }, client);
      return r;
    });
    res.status(201).json({ rectification: rect });
  })
);

router.post(
  '/:id/decision',
  route(async (req, res) => {
    const input = validate(req.body, { decision: oneOf(['aceptado', 'rechazado', 'pendiente']) });
    const quote = await load(req);
    if (quote.kind !== 'presupuesto') throw new HttpError(409, 'Solo los presupuestos se aceptan o rechazan');
    if (quote.status === 'facturado') throw new HttpError(409, 'El presupuesto ya está facturado');
    if (input.decision !== 'aceptado' && (await billing.invoicedPct(quote.id)) > 0) throw new HttpError(409, 'El presupuesto ya tiene facturas: no se puede rechazar');
    const updated = await db.tx(async (client) => {
      const row = await db.one('UPDATE invoices SET status = $2, decided_at = now() WHERE id = $1 RETURNING *', [quote.id, input.decision], client);
      if (input.decision === 'aceptado' && quote.job_id) {
        // El trabajo pasa a "en curso" con el precio del presupuesto (base, sin impuestos).
        await db.query(
          "UPDATE jobs SET price = $2, budget = $2, status = CASE WHEN status IN ('nuevo', 'presupuestado') THEN 'en_curso' ELSE status END, updated_at = now() WHERE id = $1",
          [quote.job_id, quote.subtotal],
          client
        );
      }
      await audit(req, `presupuesto.${input.decision}`, { entity: 'invoice', entityId: quote.id, details: { numero: quote.number } }, client);
      return row;
    });
    res.json({ invoice: updated });
  })
);

router.post(
  '/:id/invoice',
  route(async (req, res) => {
    const input = validate(req.body, {
      mode: oneOf(['total', 'porcentaje', 'resto']),
      pct: number({ min: 0.01, max: 100, optional: true }),
      label: text({ max: 60, optional: true }),
    });
    if (input.mode === 'porcentaje' && !input.pct) throw new HttpError(422, 'Indica el porcentaje a facturar');
    const settings = await getSettings(req.tenantId);
    const invoice = await db.tx(async (client) => {
      const quote = await db.one('SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [req.params.id, req.tenantId], client);
      if (!quote) throw new HttpError(404, 'Documento no encontrado');
      const inv = await billing.invoiceFromQuote(quote, input, { userId: req.user.id, client, billing: settings.billing });
      await audit(req, 'factura.desde_presupuesto', { entity: 'invoice', entityId: inv.id, details: { numero: inv.number, presupuesto: quote.number, porcentaje: inv.invoiced_pct } }, client);
      return inv;
    });
    res.status(201).json({ invoice });
  })
);

router.post(
  '/:id/send',
  route(async (req, res) => {
    const invoice = await load(req);
    if (invoice.status === 'anulada') throw new HttpError(409, 'No se envía un documento anulado');
    const { company } = await getSettings(req.tenantId);
    const updated = await sendInvoiceWhatsApp(invoice, company.name);
    await audit(req, 'factura.enviar', { entity: 'invoice', entityId: invoice.id, details: { numero: invoice.number } });
    res.json({ invoice: updated });
  })
);

module.exports = router;
