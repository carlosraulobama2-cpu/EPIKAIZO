// Cliente mínimo de la API de WhatsApp Cloud (Meta).
const crypto = require('crypto');
const config = require('../config');
const { HttpError } = require('../lib/http');

const enabled = () => Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId);

async function send(payload) {
  if (!enabled()) {
    throw new HttpError(503, 'WhatsApp no está configurado en el servidor');
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
    // Mensaje visible en el panel (p. ej. «token caducado» o «fuera de la ventana de 24 horas»).
    throw new HttpError(502, `WhatsApp rechazó el mensaje: ${(result.error && result.error.message) || 'sin detalle'}`);
  }
  return result.messages && result.messages[0] && result.messages[0].id;
}

const toNumber = (phone) => String(phone).replace(/\D/g, '');

const sendText = (to, body) => send({ to: toNumber(to), type: 'text', text: { body } });

/**
 * Plantilla aprobada por Meta. Hace falta para escribir a quien no nos ha escrito en las últimas
 * 24 horas (avisos de envío, recordatorios). params: textos que sustituyen {{1}}, {{2}}…
 */
const sendTemplate = (to, name, params = [], language = 'es') =>
  send({
    to: toNumber(to),
    type: 'template',
    template: { name, language: { code: language }, components: params.length ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }] : [] },
  });
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

module.exports = { enabled, sendText, sendTemplate, sendImage, validSignature, toNumber };
