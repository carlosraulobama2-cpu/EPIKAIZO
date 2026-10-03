// Webhook de WhatsApp Cloud: Meta lo llama sin sesión, así que es público pero verifica la firma.
// Los mensajes se guardan en la base de datos (bandeja del panel), no en un archivo.
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const db = require('../db');
const whatsapp = require('../services/whatsapp');
const { getSettings } = require('../services/settings');

const router = express.Router();

router.get('/', (req, res) => {
  const ok = config.whatsapp.verifyToken && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.whatsapp.verifyToken;
  if (ok) return res.status(200).send(String(req.query['hub.challenge'] || ''));
  return res.sendStatus(403);
});

function autoReply(text, company) {
  const t = text.trim().toLowerCase();
  if (/precio|tarifa|cotiz/.test(t)) return `Puedes calcular el precio de tu envío en ${config.publicUrl}/#envios o decirnos peso y ciudad de destino.`;
  if (/gu[ií]a|rastre|seguim/.test(t)) return `Rastrea tu envío con tu guía EPZ-000000 en ${config.publicUrl}/#rastreo.`;
  if (/horario|abiert|atenci/.test(t)) return `Nuestro horario: ${company.hours}. ${company.address}.`;
  return `Hola, gracias por escribir a ${company.name}. Te atendemos en horario laboral (${company.hours}). Escribe "precio" para cotizar o "guía" para rastrear.`;
}

router.post('/', async (req, res) => {
  if (!whatsapp.validSignature(req.rawBody, req.headers['x-hub-signature-256'])) return res.sendStatus(401);
  // Respondemos enseguida (Meta reintenta si tardamos) y procesamos después.
  res.sendStatus(200);
  try {
    const body = req.body || {};
    if (body.object !== 'whatsapp_business_account') return;
    const { company } = await getSettings(config.tenantId);
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const names = Object.fromEntries((value.contacts || []).map((c) => [c.wa_id, c.profile && c.profile.name]));
        for (const message of value.messages || []) {
          const text = (message.text && message.text.body) || `[${message.type}]`;
          // external_id único: si Meta reenvía el mismo mensaje, no se duplica ni se responde dos veces.
          const saved = await db.one(
            `INSERT INTO messages (id, tenant_id, channel, name, phone, body, external_id) VALUES ($1, $2, 'whatsapp', $3, $4, $5, $6)
             ON CONFLICT (external_id) DO NOTHING RETURNING id`,
            [crypto.randomUUID(), config.tenantId, names[message.from] || null, `+${message.from}`, text.slice(0, 4000), message.id]
          );
          if (saved && message.type === 'text' && whatsapp.enabled()) {
            await whatsapp.sendText(message.from, autoReply(text, company)).catch((err) => console.error('WhatsApp respuesta automática:', err.message));
          }
        }
      }
    }
  } catch (err) {
    console.error('Webhook de WhatsApp:', err.message);
  }
});

module.exports = router;
