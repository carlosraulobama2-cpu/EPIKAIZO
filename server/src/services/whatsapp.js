// Cliente mínimo de la API de WhatsApp Cloud (Meta).
const crypto = require('crypto');
const config = require('../config');

const enabled = () => Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId);

async function send(payload) {
  if (!enabled()) {
    const err = new Error('WhatsApp no está configurado en el servidor');
    err.status = 503;
    throw err;
  }
  const url = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whatsapp.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error((result.error && result.error.message) || 'WhatsApp rechazó el mensaje');
    err.status = 502;
    throw err;
  }
  return result.messages && result.messages[0] && result.messages[0].id;
}

const toNumber = (phone) => String(phone).replace(/\D/g, '');

const sendText = (to, body) => send({ to: toNumber(to), type: 'text', text: { body } });
const sendImage = (to, link, caption) => send({ to: toNumber(to), type: 'image', image: { link, caption } });

/** Comprueba que el webhook viene de Meta (cabecera X-Hub-Signature-256 firmada con el App Secret). */
function validSignature(rawBody, header) {
  if (!config.whatsapp.appSecret) return !config.isProduction;
  if (!header || !rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', config.whatsapp.appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { enabled, sendText, sendImage, validSignature };
