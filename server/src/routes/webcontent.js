// Contenido de la web gestionado desde el panel: portafolio de obras (con fotos de antes y después),
// opiniones de clientes y avisos de pago que mandan los clientes desde su área.
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { route, validate, text, number, oneOf, bool, date, uuid, phone, HttpError } = require('../lib/http');
const { requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { decodeImage } = require('../lib/images');
const { requestReview } = require('../services/reviews');
const billing = require('../services/billing');

const router = express.Router();
const gestor = requireRole('gestor');

// ---------- Portafolio ----------
const projectFields = {
  title: text({ min: 3, max: 120 }),
  category: text({ max: 60, optional: true }),
  city: text({ max: 60, optional: true }),
  description: text({ max: 2000, optional: true }),
  completed_on: date({ optional: true }),
  job_id: uuid({ optional: true }),
  published: bool(),
  position: number({ min: 0, max: 1000, optional: true }),
};
const MAX_PROJECT_PHOTOS = 12;

router.get('/projects', route(async (req, res) => {
  const items = await db.many(
    `SELECT p.*, COALESCE(json_agg(json_build_object('id', f.id, 'kind', f.kind, 'caption', f.caption) ORDER BY f.kind, f.position) FILTER (WHERE f.id IS NOT NULL), '[]') AS photos
       FROM projects p LEFT JOIN project_photos f ON f.project_id = p.id
      WHERE p.tenant_id = $1 GROUP BY p.id ORDER BY p.position, p.completed_on DESC NULLS LAST, p.created_at DESC`,
    [req.tenantId]
  );
  res.json({ items });
}));

async function loadProject(req) {
  const p = await db.one('SELECT * FROM projects WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!p) throw new HttpError(404, 'Obra no encontrada');
  return p;
}

router.post('/projects', gestor, route(async (req, res) => {
  const input = validate(req.body, projectFields);
  const item = await db.one(
    `INSERT INTO projects (id, tenant_id, title, category, city, description, completed_on, job_id, published, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [crypto.randomUUID(), req.tenantId, input.title, input.category, input.city, input.description, input.completed_on, input.job_id, input.published, input.position || 0]
  );
  await audit(req, 'portafolio.crear', { entity: 'project', entityId: item.id, details: { titulo: item.title } });
  res.status(201).json({ item });
}));

router.patch('/projects/:id', gestor, route(async (req, res) => {
  const p = await loadProject(req);
  const input = validate(req.body, projectFields, { partial: true });
  const keys = Object.keys(input);
  if (!keys.length) throw new HttpError(422, 'No hay cambios que guardar');
  if (input.published) {
    const n = await db.one("SELECT count(*)::int AS n FROM project_photos WHERE project_id = $1", [p.id]);
    if (!n.n) throw new HttpError(409, 'Sube al menos una foto antes de publicar la obra');
  }
  const item = await db.one(
    `UPDATE projects SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')}, updated_at = now() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [p.id, req.tenantId, ...keys.map((k) => input[k])]
  );
  await audit(req, 'portafolio.editar', { entity: 'project', entityId: p.id, details: { campos: keys } });
  res.json({ item });
}));

router.delete('/projects/:id', gestor, route(async (req, res) => {
  const p = await loadProject(req);
  await db.query('DELETE FROM projects WHERE id = $1', [p.id]);
  await audit(req, 'portafolio.borrar', { entity: 'project', entityId: p.id, details: { titulo: p.title } });
  res.json({ deleted: true });
}));

router.post('/projects/:id/photos', gestor, route(async (req, res) => {
  const p = await loadProject(req);
  const input = validate(req.body, { kind: oneOf(['antes', 'despues', 'otra']), caption: text({ max: 120, optional: true }) });
  const { buf, mime } = decodeImage((req.body || {}).data);
  const count = await db.one('SELECT count(*)::int AS n, COALESCE(max(position), -1) AS last FROM project_photos WHERE project_id = $1', [p.id]);
  if (count.n >= MAX_PROJECT_PHOTOS) throw new HttpError(409, `Máximo ${MAX_PROJECT_PHOTOS} fotos por obra`);
  const photo = await db.one(
    'INSERT INTO project_photos (id, tenant_id, project_id, kind, caption, mime, data, size, position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, kind, caption, size, position',
    [crypto.randomUUID(), req.tenantId, p.id, input.kind, input.caption, mime, buf, buf.length, Number(count.last) + 1]
  );
  res.status(201).json({ photo });
}));

router.delete('/projects/:id/photos/:photoId', gestor, route(async (req, res) => {
  const p = await loadProject(req);
  const row = await db.one('DELETE FROM project_photos WHERE id = $1 AND project_id = $2 RETURNING id', [req.params.photoId, p.id]);
  if (!row) throw new HttpError(404, 'Foto no encontrada');
  const left = await db.one('SELECT count(*)::int AS n FROM project_photos WHERE project_id = $1', [p.id]);
  if (!left.n) await db.query('UPDATE projects SET published = false WHERE id = $1', [p.id]);
  res.json({ deleted: true });
}));

router.get('/projects/:id/photos/:photoId', route(async (req, res) => {
  const photo = await db.one('SELECT mime, data FROM project_photos WHERE id = $1 AND project_id = $2 AND tenant_id = $3', [req.params.photoId, req.params.id, req.tenantId]);
  if (!photo) throw new HttpError(404, 'Foto no encontrada');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.type(photo.mime).send(photo.data);
}));

// ---------- Opiniones ----------
router.get('/reviews', route(async (req, res) => {
  const status = ['solicitada', 'recibida', 'publicada', 'oculta'].includes(req.query.status) ? req.query.status : null;
  const items = await db.many(
    `SELECT r.*, j.code AS job_code, s.tracking_code FROM reviews r
       LEFT JOIN jobs j ON j.id = r.job_id LEFT JOIN shipments s ON s.id = r.shipment_id
      WHERE r.tenant_id = $1 ${status ? 'AND r.status = $2' : ''}
      ORDER BY COALESCE(r.submitted_at, r.requested_at) DESC LIMIT 200`,
    status ? [req.tenantId, status] : [req.tenantId]
  );
  const stats = await db.one(
    "SELECT count(*) FILTER (WHERE status = 'recibida')::int AS pending, round(avg(rating) FILTER (WHERE rating IS NOT NULL), 1) AS average, count(rating)::int AS rated FROM reviews WHERE tenant_id = $1",
    [req.tenantId]
  );
  res.json({ items, stats });
}));

// Pedir una opinión a mano (a un cliente cualquiera, o para un trabajo/envío concreto).
router.post('/reviews/request', route(async (req, res) => {
  const input = validate(req.body, { name: text({ min: 2, max: 120 }), phone: phone(), job_id: uuid({ optional: true }), shipment_id: uuid({ optional: true }) });
  const result = await requestReview(req.tenantId, {
    source: input.job_id ? 'trabajo' : input.shipment_id ? 'envio' : 'manual',
    jobId: input.job_id, shipmentId: input.shipment_id, name: input.name, phone: input.phone,
  });
  await audit(req, 'opinion.pedir', { entity: 'review', entityId: result.review.id });
  res.status(201).json(result);
}));

router.patch('/reviews/:id', gestor, route(async (req, res) => {
  const input = validate(req.body, { status: oneOf(['publicada', 'oculta', 'recibida']) });
  const review = await db.one('SELECT * FROM reviews WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!review) throw new HttpError(404, 'Opinión no encontrada');
  if (!review.rating) throw new HttpError(409, 'El cliente aún no ha escrito su opinión');
  const item = await db.one(
    "UPDATE reviews SET status = $2, published_at = CASE WHEN $2 = 'publicada' THEN now() ELSE published_at END WHERE id = $1 RETURNING *",
    [review.id, input.status]
  );
  await audit(req, `opinion.${input.status}`, { entity: 'review', entityId: review.id });
  res.json({ item });
}));

// ---------- Avisos de pago de los clientes ----------
router.get('/payment-notices', gestor, route(async (req, res) => {
  const items = await db.many(
    `SELECT n.*, i.number, i.client_name, i.amount AS invoice_amount, i.paid_amount, u.name AS handled_by_name
       FROM payment_notices n JOIN invoices i ON i.id = n.invoice_id LEFT JOIN users u ON u.id = n.handled_by
      WHERE n.tenant_id = $1 ORDER BY (n.status = 'pendiente') DESC, n.created_at DESC LIMIT 100`,
    [req.tenantId]
  );
  res.json({ items, pending: items.filter((n) => n.status === 'pendiente').length });
}));

router.post('/payment-notices/:id/confirm', gestor, route(async (req, res) => {
  const result = await db.tx(async (client) => {
    const notice = await db.one("SELECT * FROM payment_notices WHERE id = $1 AND tenant_id = $2 AND status = 'pendiente' FOR UPDATE", [req.params.id, req.tenantId], client);
    if (!notice) throw new HttpError(409, 'Este aviso ya se ha tramitado');
    const invoice = await db.one('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [notice.invoice_id], client);
    const pending = Number(invoice.amount) - Number(invoice.paid_amount);
    const amount = Math.min(Number(notice.amount), pending);
    if (!(amount > 0)) throw new HttpError(409, 'La factura ya está cobrada del todo');
    const updated = await billing.registerPayment(invoice, { amount, method: notice.method, reference: notice.reference }, { userId: req.user.id, client });
    const done = await db.one("UPDATE payment_notices SET status = 'confirmado', handled_by = $2, handled_at = now() WHERE id = $1 RETURNING *", [notice.id, req.user.id], client);
    await audit(req, 'pago.confirmar', { entity: 'invoice', entityId: invoice.id, details: { numero: invoice.number, importe: amount, referencia: notice.reference } }, client);
    return { notice: done, invoice: updated };
  });
  res.json(result);
}));

router.post('/payment-notices/:id/reject', gestor, route(async (req, res) => {
  const input = validate(req.body, { note: text({ min: 3, max: 300 }) });
  const notice = await db.one(
    "UPDATE payment_notices SET status = 'rechazado', note = $3, handled_by = $4, handled_at = now() WHERE id = $1 AND tenant_id = $2 AND status = 'pendiente' RETURNING *",
    [req.params.id, req.tenantId, input.note, req.user.id]
  );
  if (!notice) throw new HttpError(409, 'Este aviso ya se ha tramitado');
  await audit(req, 'pago.rechazar', { entity: 'invoice', entityId: notice.invoice_id, details: { motivo: input.note } });
  res.json({ notice });
}));

module.exports = router;
