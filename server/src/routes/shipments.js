// Envíos de paquetes y de dinero: alta con guía EPZ, cambios de estado con historial y factura automática.
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { route, validate, paging, text, phone, number, oneOf, bool, HttpError } = require('../lib/http');
const { filters } = require('../lib/list');
const { requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { upsertClient } = require('../services/clients');
const { newTrackingCode } = require('../services/codes');
const billing = require('../services/billing');
const { createInvoice, sendInvoiceWhatsApp } = require('../services/invoices');
const { getSettings, quote } = require('../services/settings');

const router = express.Router();

const KINDS = ['paquete', 'dinero'];
const SCOPES = ['local', 'nacional', 'internacional'];
const STATUSES = ['registrado', 'en_transito', 'en_reparto', 'entregado', 'cancelado'];
// Cambios de estado permitidos: un envío entregado o cancelado ya no cambia.
const NEXT = {
  registrado: ['en_transito', 'en_reparto', 'entregado', 'cancelado'],
  en_transito: ['en_reparto', 'entregado', 'cancelado'],
  en_reparto: ['en_transito', 'entregado', 'cancelado'],
  entregado: [],
  cancelado: [],
};

const fields = {
  kind: oneOf(KINDS),
  scope: oneOf(SCOPES),
  sender_name: text({ min: 2, max: 120 }),
  sender_phone: phone(),
  sender_document: text({ max: 40, optional: true }),
  receiver_name: text({ min: 2, max: 120 }),
  receiver_phone: phone(),
  origin: text({ max: 80 }),
  destination: text({ max: 80 }),
  description: text({ max: 300, optional: true }),
  weight_kg: number({ min: 0.1, max: 1000, optional: true }),
  amount: number({ min: 1, max: 1e9, optional: true }),
  fee: number({ min: 0, max: 1e9, optional: true }),
  paid: bool(),
  payment_method: oneOf(['efectivo', 'transferencia', 'movil', 'tarjeta'], { optional: true }),
  notes: text({ max: 500, optional: true }),
};
const EDITABLE = ['sender_name', 'sender_phone', 'sender_document', 'receiver_name', 'receiver_phone', 'origin', 'destination', 'description', 'paid', 'payment_method', 'notes'];

router.get(
  '/',
  route(async (req, res) => {
    const { limit, offset } = paging(req.query);
    const f = filters(req.tenantId)
      .eq('kind', req.query.kind, KINDS)
      .eq('status', req.query.status, STATUSES)
      .range('created_at', req.query.from, req.query.to)
      .search(['tracking_code', 'sender_name', 'receiver_name', 'sender_phone', 'receiver_phone', 'destination'], req.query.q);
    if (req.query.status === 'pendientes') f.raw("status NOT IN ('entregado', 'cancelado')");
    const [items, count] = await Promise.all([
      db.many(`SELECT * FROM shipments WHERE ${f.sql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, f.params),
      db.one(`SELECT count(*)::int AS n FROM shipments WHERE ${f.sql}`, f.params),
    ]);
    res.json({ items, total: count.n });
  })
);

router.get(
  '/quote',
  route(async (req, res) => {
    const input = validate(req.query, { kind: oneOf(KINDS), scope: oneOf(SCOPES), weight_kg: number({ optional: true }), amount: number({ optional: true }) });
    const { rates } = await getSettings(req.tenantId);
    res.json({ ...quote(rates, { kind: input.kind, scope: input.scope, weightKg: input.weight_kg, amount: input.amount }), currency: rates.currency });
  })
);

async function loadShipment(req) {
  const shipment = await db.one('SELECT * FROM shipments WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!shipment) throw new HttpError(404, 'Envío no encontrado');
  return shipment;
}

router.get(
  '/:id',
  route(async (req, res) => {
    const shipment = await loadShipment(req);
    const [events, invoice] = await Promise.all([
      db.many(
        `SELECT e.status, e.location, e.note, e.created_at, u.name AS user_name
           FROM shipment_events e LEFT JOIN users u ON u.id = e.created_by
          WHERE e.shipment_id = $1 ORDER BY e.created_at, e.id`,
        [shipment.id]
      ),
      db.one("SELECT id, number, status, amount, currency FROM invoices WHERE shipment_id = $1 AND kind = 'factura' ORDER BY created_at LIMIT 1", [shipment.id]),
    ]);
    res.json({ shipment, events, invoice, next_statuses: NEXT[shipment.status] });
  })
);

router.post(
  '/',
  route(async (req, res) => {
    const input = validate(req.body, fields);
    if (input.kind === 'paquete' && !input.weight_kg) throw new HttpError(422, 'Indica el peso del paquete');
    if (input.kind === 'dinero' && !input.amount) throw new HttpError(422, 'Indica el importe que se envía');
    const { rates, company } = await getSettings(req.tenantId);
    const priced = quote(rates, { kind: input.kind, scope: input.scope, weightKg: input.weight_kg, amount: input.amount });
    const fee = input.fee ?? priced.fee;
    const total = input.kind === 'dinero' ? input.amount + fee : fee;

    const result = await db.tx(async (client) => {
      const clientId = await upsertClient(req.tenantId, { name: input.sender_name, phone: input.sender_phone, city: input.origin, document: input.sender_document }, client);
      const shipment = await db.one(
        `INSERT INTO shipments (id, tenant_id, tracking_code, kind, scope, client_id, sender_name, sender_phone, sender_document, receiver_name, receiver_phone,
                                origin, destination, description, weight_kg, amount, fee, total, currency, paid, payment_method, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
        [crypto.randomUUID(), req.tenantId, await newTrackingCode(client), input.kind, input.scope, clientId, input.sender_name, input.sender_phone,
          input.sender_document, input.receiver_name, input.receiver_phone, input.origin, input.destination, input.description,
          input.kind === 'paquete' ? input.weight_kg : null, input.kind === 'dinero' ? input.amount : null, fee, total, rates.currency,
          input.paid, input.payment_method, input.notes, req.user.id],
        client
      );
      await db.query('INSERT INTO shipment_events (shipment_id, status, location, created_by) VALUES ($1, $2, $3, $4)', [shipment.id, 'registrado', input.origin, req.user.id], client);
      let invoice = fee > 0
        ? await createInvoice(
          req.tenantId,
          {
            client_id: clientId,
            client_name: input.sender_name,
            client_phone: input.sender_phone,
            concept: input.kind === 'paquete' ? `Envío de paquete ${shipment.tracking_code} a ${input.destination}` : `Envío de dinero ${shipment.tracking_code} a ${input.destination}`,
            amount: total,
            currency: rates.currency,
            shipment_id: shipment.id,
          },
          { userId: req.user.id, client }
        )
        : null;
      // Cobrado en el mostrador: la factura queda pagada con su forma de pago.
      if (invoice && input.paid) {
        invoice = await billing.registerPayment(invoice, { amount: Number(invoice.amount), method: input.payment_method || 'efectivo' }, { userId: req.user.id, client });
      }
      await audit(req, 'envio.crear', { entity: 'shipment', entityId: shipment.id, details: { guia: shipment.tracking_code, tipo: shipment.kind, total } }, client);
      return { shipment, invoice };
    });
    res.status(201).json({ ...result, company: company.name });
  })
);

router.patch(
  '/:id',
  route(async (req, res) => {
    const shipment = await loadShipment(req);
    const input = validate(req.body, Object.fromEntries(EDITABLE.map((k) => [k, fields[k]])), { partial: true });
    const keys = Object.keys(input);
    if (!keys.length) return res.json({ shipment });
    const sets = keys.map((k, i) => `${k} = $${i + 3}`);
    const updated = await db.one(
      `UPDATE shipments SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [shipment.id, req.tenantId, ...keys.map((k) => input[k])]
    );
    await audit(req, 'envio.editar', { entity: 'shipment', entityId: shipment.id, details: { campos: keys } });
    res.json({ shipment: updated });
  })
);

router.post(
  '/:id/status',
  route(async (req, res) => {
    const shipment = await loadShipment(req);
    const input = validate(req.body, {
      status: oneOf(STATUSES),
      location: text({ max: 80, optional: true }),
      note: text({ max: 300, optional: true }),
      notify: bool(),
    });
    if (!NEXT[shipment.status].includes(input.status)) {
      throw new HttpError(409, `Un envío "${shipment.status.replace('_', ' ')}" no puede pasar a "${input.status.replace('_', ' ')}"`);
    }
    const updated = await db.tx(async (client) => {
      const row = await db.one(
        `UPDATE shipments SET status = $3, updated_at = now(), delivered_at = CASE WHEN $3 = 'entregado' THEN now() ELSE delivered_at END
          WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [shipment.id, req.tenantId, input.status],
        client
      );
      await db.query('INSERT INTO shipment_events (shipment_id, status, location, note, created_by) VALUES ($1,$2,$3,$4,$5)', [shipment.id, input.status, input.location, input.note, req.user.id], client);
      if (input.status === 'cancelado') {
        // La factura no se borra: se anula con su rectificativa.
        const invoice = await db.one("SELECT * FROM invoices WHERE shipment_id = $1 AND kind = 'factura' AND status <> 'anulada' ORDER BY created_at LIMIT 1", [shipment.id], client);
        if (invoice) {
          const { billing: billingSettings } = await getSettings(req.tenantId);
          const reason = Number(invoice.paid_amount) > 0 ? 'Envío cancelado (importe cobrado devuelto al cliente)' : 'Envío cancelado';
          await billing.annul({ ...invoice, paid_amount: 0 }, reason, { userId: req.user.id, client, billing: billingSettings });
        }
      }
      await audit(req, 'envio.estado', { entity: 'shipment', entityId: shipment.id, details: { de: shipment.status, a: input.status } }, client);
      return row;
    });

    // Aviso por WhatsApp al entregar: si falla, el cambio de estado ya está guardado y lo decimos.
    let notified = null;
    if (input.notify && input.status === 'entregado') {
      const invoice = await db.one("SELECT * FROM invoices WHERE shipment_id = $1 AND kind = 'factura' ORDER BY created_at LIMIT 1", [shipment.id]);
      if (invoice) {
        try {
          const { company } = await getSettings(req.tenantId);
          await sendInvoiceWhatsApp(invoice, company.name);
          notified = true;
        } catch (err) {
          notified = false;
          await audit(req, 'whatsapp.error', { entity: 'invoice', entityId: invoice.id, details: { error: err.message } });
        }
      }
    }
    res.json({ shipment: updated, notified });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  route(async (req, res) => {
    const shipment = await loadShipment(req);
    await db.tx(async (client) => {
      await db.query('DELETE FROM shipments WHERE id = $1 AND tenant_id = $2', [shipment.id, req.tenantId], client);
      await audit(req, 'envio.borrar', { entity: 'shipment', entityId: shipment.id, details: { guia: shipment.tracking_code } }, client);
    });
    res.json({ deleted: true });
  })
);

module.exports = router;
