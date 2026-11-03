// Web pública (sin sesión de empleado): portafolio, opiniones, presupuesto en línea con fotos y el
// área de cliente (entrar con un código por WhatsApp, ver envíos/facturas y avisar de un pago).
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { route, validate, text, phone, email, number, oneOf, bool, uuid, HttpError } = require('../lib/http');
const { rateLimit, parseCookies } = require('../lib/security');
const { decodeImage } = require('../lib/images');
const whatsapp = require('../services/whatsapp');
const { getSettings } = require('../services/settings');

const router = express.Router();
const tenantId = config.tenantId;
const shortName = (name) => {
  const parts = String(name || '').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0] || '';
};
// Los teléfonos se guardan normalizados, con o sin prefijo: se comparan por sus 9 últimas cifras.
const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);

// ---------- Portafolio ----------
router.get('/projects', route(async (req, res) => {
  const items = await db.many(
    `SELECT p.id, p.title, p.category, p.city, p.description, p.completed_on,
            COALESCE(json_agg(json_build_object('id', f.id, 'kind', f.kind, 'caption', f.caption) ORDER BY f.kind, f.position) FILTER (WHERE f.id IS NOT NULL), '[]') AS photos
       FROM projects p LEFT JOIN project_photos f ON f.project_id = p.id
      WHERE p.tenant_id = $1 AND p.published GROUP BY p.id ORDER BY p.position, p.completed_on DESC NULLS LAST LIMIT 24`,
    [tenantId]
  );
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ items });
}));

router.get('/project-photos/:id', route(async (req, res) => {
  const photo = await db.one(
    'SELECT f.mime, f.data FROM project_photos f JOIN projects p ON p.id = f.project_id WHERE f.id = $1 AND p.tenant_id = $2 AND p.published',
    [req.params.id, tenantId]
  );
  if (!photo) throw new HttpError(404, 'Foto no encontrada');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.type(photo.mime).send(photo.data);
}));

// ---------- Opiniones ----------
router.get('/reviews', route(async (req, res) => {
  const [items, stats] = await Promise.all([
    db.many("SELECT client_name, rating, comment, source, submitted_at FROM reviews WHERE tenant_id = $1 AND status = 'publicada' ORDER BY published_at DESC LIMIT 12", [tenantId]),
    db.one("SELECT round(avg(rating), 1) AS average, count(*)::int AS total FROM reviews WHERE tenant_id = $1 AND status = 'publicada'", [tenantId]),
  ]);
  res.setHeader('Cache-Control', 'public, max-age=300');
  // Solo nombre y la inicial del apellido; nunca el teléfono.
  res.json({ items: items.map((r) => ({ ...r, client_name: shortName(r.client_name) })), average: stats.average ? Number(stats.average) : null, total: stats.total });
}));

const reviewLimiter = rateLimit({ windowMs: 10 * 60_000, max: 20 });
async function loadReview(token) {
  if (!/^[\w-]{20,40}$/.test(token || '')) throw new HttpError(404, 'Este enlace no es válido');
  const review = await db.one('SELECT * FROM reviews WHERE token = $1 AND tenant_id = $2', [token, tenantId]);
  if (!review) throw new HttpError(404, 'Este enlace no es válido');
  return review;
}

router.get('/review/:token', reviewLimiter, route(async (req, res) => {
  const r = await loadReview(req.params.token);
  res.json({ name: shortName(r.client_name).split(' ')[0], source: r.source, done: r.status !== 'solicitada' });
}));

router.post('/review/:token', reviewLimiter, route(async (req, res) => {
  const r = await loadReview(req.params.token);
  if (r.status !== 'solicitada') throw new HttpError(409, 'Ya nos dejaste tu opinión. ¡Gracias!');
  const input = validate(req.body, { rating: number({ min: 1, max: 5 }), comment: text({ max: 1000, optional: true }) });
  await db.query("UPDATE reviews SET rating = $2, comment = $3, status = 'recibida', submitted_at = now() WHERE id = $1", [r.id, Math.round(input.rating), input.comment]);
  res.status(201).json({ ok: true });
}));

// ---------- Presupuesto en línea (obras) ----------
const quoteLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5, message: 'Has enviado varias solicitudes seguidas. Te responderemos pronto.' });
const WORK_TYPES = {
  construccion: 'Construcción nueva', reforma: 'Reforma o rehabilitación', pintura: 'Pintura', electricidad: 'Electricidad',
  fontaneria: 'Fontanería', cubierta: 'Cubierta o tejado', mantenimiento: 'Mantenimiento', otro: 'Otro',
};
const TIMEFRAMES = { urgente: 'Urgente (esta semana)', mes: 'Este mes', trimestre: 'En los próximos 3 meses', sin_prisa: 'Sin prisa' };

router.post('/quote-request', quoteLimiter, route(async (req, res) => {
  const input = validate(req.body, {
    name: text({ min: 2, max: 120 }),
    phone: phone(),
    email: email({ optional: true }),
    work_type: oneOf(Object.keys(WORK_TYPES)),
    property: oneOf(['vivienda', 'local', 'oficina', 'nave', 'edificio', 'otro']),
    area_m2: number({ min: 1, max: 1e6, optional: true }),
    city: text({ min: 2, max: 60 }),
    address: text({ max: 200, optional: true }),
    timeframe: oneOf(Object.keys(TIMEFRAMES)),
    budget: number({ min: 0, max: 1e12, optional: true }),
    description: text({ min: 10, max: 3000 }),
    privacy: bool(),
    website: text({ max: 200, optional: true }),
  });
  if (!input.privacy) throw new HttpError(422, 'Acepta la política de privacidad para enviar la solicitud');
  if (input.website) return res.status(201).json({ ok: true });
  const photos = Array.isArray(req.body.photos) ? req.body.photos.slice(0, 6) : [];
  const decoded = photos.map((p) => decodeImage(p, 1.2 * 1024 * 1024));
  const details = { tipo: WORK_TYPES[input.work_type], inmueble: input.property, superficie_m2: input.area_m2, ciudad: input.city, direccion: input.address, plazo: TIMEFRAMES[input.timeframe], presupuesto_cliente: input.budget, fotos: decoded.length };
  const body = [
    `📐 Solicitud de presupuesto: ${WORK_TYPES[input.work_type]} (${input.property}${input.area_m2 ? `, ${input.area_m2} m²` : ''})`,
    `📍 ${input.city}${input.address ? `, ${input.address}` : ''} · ⏱ ${TIMEFRAMES[input.timeframe]}${input.budget ? ` · Presupuesto orientativo del cliente: ${input.budget} FCFA` : ''}`,
    decoded.length ? `📷 ${decoded.length} ${decoded.length === 1 ? 'foto adjunta' : 'fotos adjuntas'}` : null,
    '',
    input.description,
  ].filter((l) => l !== null).join('\n');
  const id = crypto.randomUUID();
  await db.tx(async (client) => {
    await db.query(
      "INSERT INTO messages (id, tenant_id, channel, name, phone, email, topic, body, details) VALUES ($1, $2, 'web', $3, $4, $5, 'presupuesto', $6, $7)",
      [id, tenantId, input.name, input.phone, input.email, body, JSON.stringify(details)],
      client
    );
    for (const [i, { buf, mime }] of decoded.entries()) {
      await db.query('INSERT INTO message_photos (id, tenant_id, message_id, mime, data, size, position) VALUES ($1,$2,$3,$4,$5,$6,$7)', [crypto.randomUUID(), tenantId, id, mime, buf, buf.length, i], client);
    }
  });
  res.status(201).json({ ok: true });
}));

// ---------- Área de cliente ----------
const CLIENT_COOKIE = 'epk_cliente';
const CLIENT_DAYS = 7;
const codeLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5, key: (req) => `${req.ip}:${last9((req.body || {}).phone)}`, message: 'Has pedido varios códigos seguidos. Espera 15 minutos.' });
const verifyLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10 });
const hashCode = (phoneDigits, code) => crypto.createHmac('sha256', config.jwtSecret).update(`${phoneDigits}:${code}`).digest('hex');

async function phoneKnown(digits) {
  const row = await db.one(
    `SELECT (EXISTS (SELECT 1 FROM shipments WHERE tenant_id = $1 AND (right(regexp_replace(sender_phone, '\\D', '', 'g'), 9) = $2 OR right(regexp_replace(receiver_phone, '\\D', '', 'g'), 9) = $2))
          OR EXISTS (SELECT 1 FROM invoices WHERE tenant_id = $1 AND right(regexp_replace(client_phone, '\\D', '', 'g'), 9) = $2)
          OR EXISTS (SELECT 1 FROM clients WHERE tenant_id = $1 AND right(regexp_replace(phone, '\\D', '', 'g'), 9) = $2)) AS known`,
    [tenantId, digits]
  );
  return row.known;
}

// Pedir el código. Siempre responde lo mismo, exista o no el teléfono (no revela quién es cliente).
router.post('/client/code', codeLimiter, route(async (req, res) => {
  const input = validate(req.body, { phone: phone() });
  if (!whatsapp.enabled()) throw new HttpError(503, 'El acceso con código por WhatsApp aún no está disponible. Llámanos o escríbenos y te ayudamos.');
  const digits = last9(input.phone);
  if (await phoneKnown(digits)) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await db.query("INSERT INTO client_codes (id, tenant_id, phone, code_hash, expires_at) VALUES ($1, $2, $3, $4, now() + interval '10 minutes')", [crypto.randomUUID(), tenantId, digits, hashCode(digits, code)]);
    const { company } = await getSettings(tenantId);
    await whatsapp.sendText(input.phone, `Tu código para entrar en el área de cliente de ${company.name} es ${code}. Caduca en 10 minutos. No se lo des a nadie.`).catch(() => {});
  }
  res.json({ ok: true, message: 'Si tu número está en nuestros envíos o facturas, te hemos mandado un código por WhatsApp.' });
}));

router.post('/client/verify', verifyLimiter, route(async (req, res) => {
  const input = validate(req.body, { phone: phone(), code: text({ min: 6, max: 6 }) });
  const digits = last9(input.phone);
  const row = await db.one('SELECT * FROM client_codes WHERE tenant_id = $1 AND phone = $2 AND NOT used AND expires_at > now() ORDER BY created_at DESC LIMIT 1', [tenantId, digits]);
  const wrong = new HttpError(401, 'El código no es correcto o ha caducado. Pide uno nuevo.');
  if (!row || row.attempts >= 5) throw wrong;
  const a = Buffer.from(row.code_hash);
  const b = Buffer.from(hashCode(digits, input.code));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await db.query('UPDATE client_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    throw wrong;
  }
  await db.query('UPDATE client_codes SET used = true WHERE id = $1', [row.id]);
  const token = jwt.sign({ sub: digits, purpose: 'client', t: tenantId }, config.jwtSecret, { expiresIn: `${CLIENT_DAYS}d`, issuer: 'epikaizo' });
  res.setHeader('Set-Cookie', `${CLIENT_COOKIE}=${token}; Path=/api/public/client; HttpOnly; SameSite=Strict; Max-Age=${CLIENT_DAYS * 86400}${config.isProduction ? '; Secure' : ''}`);
  res.json({ ok: true });
}));

router.post('/client/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${CLIENT_COOKIE}=; Path=/api/public/client; HttpOnly; SameSite=Strict; Max-Age=0${config.isProduction ? '; Secure' : ''}`);
  res.json({ ok: true });
});

/** El teléfono (9 cifras) de la sesión de cliente, o 401. */
function clientPhone(req) {
  const token = parseCookies(req)[CLIENT_COOKIE];
  if (!token) throw new HttpError(401, 'Entra con tu teléfono para ver tus envíos y facturas');
  try {
    const p = jwt.verify(token, config.jwtSecret, { issuer: 'epikaizo' });
    if (p.purpose !== 'client' || p.t !== tenantId || !/^\d{6,9}$/.test(p.sub)) throw new Error('no');
    return p.sub;
  } catch {
    throw new HttpError(401, 'Tu sesión ha caducado. Vuelve a entrar con tu teléfono.');
  }
}

router.get('/client/me', route(async (req, res) => {
  const digits = clientPhone(req);
  const phoneMatch = (col) => `right(regexp_replace(${col}, '\\D', '', 'g'), 9) = $2`;
  const [shipments, invoices, notices, settings] = await Promise.all([
    db.many(
      `SELECT id, tracking_code, kind, status, origin, destination, sender_name, receiver_name, total, paid, created_at,
              (${phoneMatch('sender_phone')}) AS as_sender
         FROM shipments WHERE tenant_id = $1 AND (${phoneMatch('sender_phone')} OR ${phoneMatch('receiver_phone')})
        ORDER BY created_at DESC LIMIT 50`,
      [tenantId, digits]
    ),
    db.many(
      `SELECT id, kind, number, status, concept, amount, paid_amount, issue_date, due_date, valid_until
         FROM invoices WHERE tenant_id = $1 AND ${phoneMatch('client_phone')} AND kind IN ('factura', 'presupuesto')
        ORDER BY issue_date DESC, created_at DESC LIMIT 50`,
      [tenantId, digits]
    ),
    db.many(
      `SELECT n.id, n.invoice_id, n.amount, n.method, n.reference, n.status, n.note, n.created_at FROM payment_notices n JOIN invoices i ON i.id = n.invoice_id
        WHERE n.tenant_id = $1 AND ${phoneMatch('i.client_phone')} ORDER BY n.created_at DESC LIMIT 20`,
      [tenantId, digits]
    ),
    getSettings(tenantId),
  ]);
  // Para el envío: el destinatario solo ve su nombre recortado si él no es quien envía.
  res.json({
    phone_end: digits.slice(-3),
    shipments: shipments.map((s) => ({ ...s, sender_name: shortName(s.sender_name), receiver_name: shortName(s.receiver_name), total: s.as_sender ? s.total : null })),
    invoices,
    notices,
    payment: { bank_account: settings.billing.bank_account, mobile: settings.payments.mobile_number, mobile_name: settings.payments.mobile_name, instructions: settings.payments.instructions },
  });
}));

// "He pagado": el cliente avisa de un pago por pago móvil o transferencia; el equipo lo confirma.
router.post('/client/payments', verifyLimiter, route(async (req, res) => {
  const digits = clientPhone(req);
  const input = validate(req.body, { invoice_id: uuid(), method: oneOf(['movil', 'transferencia']), amount: number({ min: 1, max: 1e12 }), reference: text({ min: 3, max: 80 }) });
  const invoice = await db.one(
    `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 AND kind = 'factura' AND status IN ('emitida', 'enviada', 'parcial')
       AND right(regexp_replace(client_phone, '\\D', '', 'g'), 9) = $3`,
    [input.invoice_id, tenantId, digits]
  );
  if (!invoice) throw new HttpError(404, 'No encontramos esa factura pendiente');
  const pending = Number(invoice.amount) - Number(invoice.paid_amount);
  if (input.amount > pending) throw new HttpError(422, `El importe supera lo pendiente (${pending} FCFA)`);
  const open = await db.one("SELECT 1 FROM payment_notices WHERE invoice_id = $1 AND status = 'pendiente'", [invoice.id]);
  if (open) throw new HttpError(409, 'Ya nos avisaste de un pago de esta factura: lo estamos comprobando');
  const notice = await db.one(
    'INSERT INTO payment_notices (id, tenant_id, invoice_id, amount, method, reference, payer_phone) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, amount, method, reference, status, created_at',
    [crypto.randomUUID(), tenantId, invoice.id, input.amount, input.method, input.reference, digits]
  );
  res.status(201).json({ notice });
}));

module.exports = router;
