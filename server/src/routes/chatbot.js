// Asistente de la web (Gemini). Público, así que tiene límite por IP, mensajes cortos y memoria acotada.
const express = require('express');
const config = require('../config');
const { route, validate, text, HttpError } = require('../lib/http');
const { rateLimit } = require('../lib/security');
const { getSettings } = require('../services/settings');

const router = express.Router();

const MAX_SESSIONS = 500;
const SESSION_TTL = 30 * 60_000;
const MAX_TURNS = 12;
const sessions = new Map(); // sessionId -> { history, at }

function history(sessionId) {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.at > SESSION_TTL) sessions.delete(id);
  let session = sessions.get(sessionId);
  if (!session) {
    if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
    session = { history: [], at: now };
    sessions.set(sessionId, session);
  }
  session.at = now;
  return session.history;
}

async function systemPrompt() {
  const { company, rates, cities } = await getSettings(config.tenantId);
  const kg = rates.package_per_kg;
  const pct = rates.money_commission_pct;
  return `Eres el asistente virtual de ${company.name} (Epikaizo), empresa de Guinea Ecuatorial de construcción y mantenimiento, gestión administrativa y logística (envíos de paquetes y de dinero).
Responde en español, con amabilidad y en pocas frases. No inventes datos: si no sabes algo, ofrece el WhatsApp ${company.phone} o el formulario de contacto de la web.
Datos de la empresa:
- Teléfono y WhatsApp: ${company.phone}. Correo: ${company.email}. Oficina: ${company.address}. Horario: ${company.hours}.
- Ciudades: ${cities.join(', ')}.
- Paquetes: tarifa base ${rates.package_base_fee} ${rates.currency} más ${kg.local}/${kg.nacional}/${kg.internacional} ${rates.currency} por kg (local/nacional/internacional).
- Envíos de dinero: comisión ${pct.local}% / ${pct.nacional}% / ${pct.internacional}% (local/nacional/internacional), mínimo ${rates.money_min_commission} ${rates.currency}.
- Rastreo con la guía EPZ-000000 en ${config.publicUrl}/#rastreo. Cotizador en ${config.publicUrl}/#envios.
- Servicios: construcción, fontanería, electricidad, climatización, carpintería y reformas, mudanzas, mantenimiento y gestión administrativa. Presupuesto sin compromiso por el formulario o WhatsApp.
Nunca pidas contraseñas, datos de tarjetas ni documentos por este chat.`;
}

router.post(
  '/',
  rateLimit({ windowMs: 10 * 60_000, max: 20, message: 'Has hecho muchas preguntas seguidas. Escríbenos por WhatsApp y te atendemos.' }),
  route(async (req, res) => {
    const input = validate(req.body, { message: text({ min: 1, max: 600 }), sessionId: text({ min: 8, max: 64, optional: true }) });
    if (!config.ai.key) throw new HttpError(503, 'El asistente no está disponible ahora. Escríbenos por WhatsApp.');
    const turns = history(input.sessionId || req.ip);
    const contents = [...turns, { role: 'user', parts: [{ text: input.message }] }];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.ai.model)}:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.ai.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: await systemPrompt() }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!response || !response.ok) {
      if (response) console.error('Gemini respondió', response.status);
      throw new HttpError(502, 'El asistente no ha podido responder. Inténtalo de nuevo o escríbenos por WhatsApp.');
    }
    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No he podido responder. Escríbenos por WhatsApp y te ayudamos.';
    turns.push({ role: 'user', parts: [{ text: input.message }] }, { role: 'model', parts: [{ text: reply }] });
    if (turns.length > MAX_TURNS) turns.splice(0, turns.length - MAX_TURNS);
    res.json({ reply });
  })
);

module.exports = router;
