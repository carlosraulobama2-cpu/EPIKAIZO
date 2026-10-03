// Endpoints de la web pública: sin sesión, con límites de peticiones y sin datos personales de más.
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const db = require('../db');
const { route, validate, text, phone, email, oneOf, bool, date, HttpError } = require('../lib/http');
const { rateLimit } = require('../lib/security');
const { getSettings, quote } = require('../services/settings');
const { qrPng } = require('../services/invoices');

const router = express.Router();
const tenantId = config.tenantId;

const contactLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5, message: 'Has enviado varios mensajes seguidos. Te responderemos pronto.' });
const trackLimiter = rateLimit({ windowMs: 10 * 60_000, max: 30 });
const analyticsLimiter = rateLimit({ windowMs: 60_000, max: 60 });

/** Tarifas y datos de contacto para el cotizador y la web: una sola fuente, la de Ajustes. */
router.get(
  '/config',
  route(async (req, res) => {
    const { company, rates, cities } = await getSettings(tenantId);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ company, rates, cities });
  })
);

router.get(
  '/quote',
  route(async (req, res) => {
    const { rates } = await getSettings(tenantId);
    const kind = req.query.kind === 'dinero' ? 'dinero' : 'paquete';
    const scope = ['local', 'nacional', 'internacional'].includes(req.query.scope) ? req.query.scope : 'nacional';
    const value = Number(req.query.value);
    if (!(value > 0) || value > 1e9) throw new HttpError(422, kind === 'paquete' ? 'Indica un peso válido' : 'Indica un importe válido');
    res.json({ ...quote(rates, { kind, scope, weightKg: value, amount: value }), currency: rates.currency });
  })
);

const STEP_LABELS = {
  paquete: { registrado: 'Recibido en oficina', en_transito: 'En tránsito', en_reparto: 'En reparto', entregado: 'Entregado', cancelado: 'Cancelado' },
  dinero: { registrado: 'Envío registrado', en_transito: 'En proceso', en_reparto: 'Listo para cobrar', entregado: 'Cobrado', cancelado: 'Cancelado' },
};

/** "María Obiang Nguema" -> "María O.": suficiente para reconocer el envío sin exponer el nombre completo. */
const maskName = (name) => {
  const [first, second] = String(name || '').trim().split(/\s+/);
  return second ? `${first} ${second[0]}.` : first || '';
};

router.get(
  '/track/:code',
  trackLimiter,
  route(async (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!/^EPZ-\d{6}$/.test(code)) throw new HttpError(400, 'La guía tiene el formato EPZ-000000');
    const shipment = await db.one('SELECT id, tracking_code, kind, status, receiver_name, origin, destination, created_at, delivered_at FROM shipments WHERE tracking_code = $1 AND tenant_id = $2', [code, tenantId]);
    if (!shipment) return res.json({ found: false });
    const events = await db.many('SELECT status, location, created_at FROM shipment_events WHERE shipment_id = $1 ORDER BY created_at, id', [shipment.id]);
    const labels = STEP_LABELS[shipment.kind];
    res.json({
      found: true,
      code: shipment.tracking_code,
      kind: shipment.kind,
      status: shipment.status,
      status_label: labels[shipment.status],
      receiver: maskName(shipment.receiver_name),
      origin: shipment.origin,
      destination: shipment.destination,
      created_at: shipment.created_at,
      delivered_at: shipment.delivered_at,
      steps: ['registrado', 'en_transito', 'en_reparto', 'entregado'].map((s) => ({ status: s, label: labels[s] })),
      events: events.map((e) => ({ status: e.status, label: labels[e.status], location: e.location, at: e.created_at })),
    });
  })
);

const TOPICS = ['construccion', 'mantenimiento', 'electronica', 'paquete', 'dinero', 'vehiculos', 'gestion', 'empresa', 'otro'];

router.post(
  '/contact',
  contactLimiter,
  route(async (req, res) => {
    const input = validate(req.body, {
      name: text({ min: 2, max: 120 }),
      phone: phone(),
      email: email({ optional: true }),
      topic: oneOf(TOPICS, { optional: true }),
      message: text({ min: 5, max: 2000 }),
      appointment: date({ optional: true }),
      privacy: bool(),
      website: text({ max: 200, optional: true }), // campo trampa invisible para bots
    });
    if (!input.privacy) throw new HttpError(422, 'Acepta la política de privacidad para enviar el mensaje');
    if (input.website) return res.status(201).json({ ok: true }); // bot: respondemos bien pero no guardamos
    // "Pide tu cita": la fecha preferida va al principio del mensaje para que el equipo la vea en la Bandeja.
    let body = input.message;
    if (input.appointment) {
      if (input.appointment < new Date().toISOString().slice(0, 10)) throw new HttpError(422, 'Elige una fecha de cita a partir de hoy');
      const day = new Date(`${input.appointment}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
      body = `📅 Cita solicitada para el ${day}\n\n${input.message}`;
    }
    await db.query(
      `INSERT INTO messages (id, tenant_id, channel, name, phone, email, topic, body) VALUES ($1, $2, 'web', $3, $4, $5, $6, $7)`,
      [crypto.randomUUID(), tenantId, input.name, input.phone, input.email, input.topic || 'otro', body]
    );
    res.status(201).json({ ok: true });
  })
);

/** Coches en venta para la web: solo datos de anuncio (nunca coste, bastidor completo ni comprador). */
router.get(
  '/vehicles',
  route(async (req, res) => {
    const rows = await db.many(
      `SELECT code, brand, model, year, mileage_km, color, fuel, transmission, condition, sale_price, currency, status, notes,
              COALESCE((SELECT array_agg(p.id ORDER BY p.position, p.created_at) FROM vehicle_photos p WHERE p.vehicle_id = vehicles.id), '{}') AS photos
         FROM vehicles WHERE tenant_id = $1 AND status IN ('disponible', 'reservado')
        ORDER BY CASE status WHEN 'disponible' THEN 0 ELSE 1 END, created_at DESC LIMIT 60`,
      [tenantId]
    );
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.json({ items: rows });
  })
);

/** Foto de un coche anunciado (no se sirven fotos de vehículos ya vendidos). */
router.get(
  '/vehicle-photos/:id',
  route(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(404, 'Foto no encontrada');
    const photo = await db.one(
      `SELECT p.mime, p.data FROM vehicle_photos p JOIN vehicles v ON v.id = p.vehicle_id
        WHERE p.id = $1 AND v.tenant_id = $2 AND v.status IN ('disponible', 'reservado')`,
      [req.params.id, tenantId]
    );
    if (!photo) throw new HttpError(404, 'Foto no encontrada');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type(photo.mime).send(photo.data);
  })
);

const EVENTS = ['quote_package', 'quote_money', 'track', 'contact', 'whatsapp_click', 'cta_click'];

router.post(
  '/analytics',
  analyticsLimiter,
  route(async (req, res) => {
    const { event, data, path } = req.body || {};
    if (EVENTS.includes(event)) {
      const safe = data && typeof data === 'object' ? JSON.stringify(data).slice(0, 500) : null;
      await db.query('INSERT INTO analytics_events (event, data, path) VALUES ($1, $2, $3)', [event, safe, String(path || '').slice(0, 200)]);
    }
    res.status(204).end();
  })
);

/** Página de verificación del QR de una factura: confirma que es auténtica, sin teléfono ni correo. */
router.get(
  '/invoices/:id',
  route(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(404, 'Factura no encontrada');
    const invoice = await db.one('SELECT kind, number, client_name, concept, subtotal, tax_amount, amount, paid_amount, currency, status, issue_date, created_at FROM invoices WHERE id = $1', [req.params.id]);
    if (!invoice) throw new HttpError(404, 'Factura no encontrada');
    const { company } = await getSettings(tenantId);
    res.json({ invoice: { ...invoice, client_name: maskName(invoice.client_name) }, company: { name: company.name, phone: company.phone } });
  })
);

router.get(
  '/invoices/:id/qr.png',
  route(async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(404, 'Factura no encontrada');
    const invoice = await db.one('SELECT id FROM invoices WHERE id = $1', [req.params.id]);
    if (!invoice) throw new HttpError(404, 'Factura no encontrada');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type('png').send(await qrPng(invoice));
  })
);

module.exports = router;
