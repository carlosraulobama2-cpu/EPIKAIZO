// Opiniones de clientes reales: al terminar un trabajo o entregar un envío se crea un enlace único
// (/opinion?t=…) y se manda por WhatsApp. Lo que escribe el cliente queda "recibido" y solo sale en
// la web cuando el equipo lo publica.
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const whatsapp = require('./whatsapp');
const { getSettings } = require('./settings');

const linkFor = (token) => `${config.publicUrl}/opinion?t=${token}`;
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

function requestText(review, companyName) {
  const what = review.source === 'envio' ? 'tu envío' : review.source === 'trabajo' ? 'el trabajo que te hicimos' : 'nuestro servicio';
  return `Hola ${firstName(review.client_name)}, gracias por confiar en ${companyName}. ¿Qué te pareció ${what}? Tu opinión nos ayuda mucho (1 minuto): ${linkFor(review.token)}`;
}

/**
 * Crea (o reutiliza) la petición de opinión y la manda por WhatsApp si se puede.
 * Devuelve { review, link, text, sent }. Nunca lanza por un fallo de WhatsApp.
 */
async function requestReview(tenantId, { source, jobId = null, shipmentId = null, name, phone, send = true }) {
  let review = null;
  if (jobId) review = await db.one('SELECT * FROM reviews WHERE job_id = $1', [jobId]);
  if (shipmentId) review = await db.one('SELECT * FROM reviews WHERE shipment_id = $1', [shipmentId]);
  if (!review) {
    review = await db.one(
      `INSERT INTO reviews (id, tenant_id, token, source, job_id, shipment_id, client_name, client_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [crypto.randomUUID(), tenantId, crypto.randomBytes(18).toString('base64url'), source, jobId, shipmentId, name, phone]
    );
  }
  const { company, notifications } = await getSettings(tenantId);
  const text = requestText(review, company.name);
  let sent = false;
  if (send && review.status === 'solicitada' && phone && whatsapp.enabled() && notifications.review_request !== false) {
    sent = await whatsapp.sendText(phone, text).then(() => true, () => false);
  }
  return { review, link: linkFor(review.token), text, sent };
}

module.exports = { requestReview, requestText, linkFor };
