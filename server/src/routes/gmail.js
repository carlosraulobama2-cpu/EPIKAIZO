// Correo de la empresa (Gmail) en el panel. Solo administradores; googleapis se carga solo si está configurado.
const express = require('express');
const config = require('../config');
const { route, HttpError } = require('../lib/http');

const router = express.Router();
let gmailClient = null;

function gmail() {
  const { clientId, clientSecret, refreshToken } = config.gmail;
  if (!clientId || !clientSecret || !refreshToken) throw new HttpError(503, 'Gmail no está configurado en el servidor');
  if (!gmailClient) {
    const { google } = require('googleapis');
    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    gmailClient = google.gmail({ version: 'v1', auth });
  }
  return gmailClient;
}

function plainText(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) return Buffer.from(payload.body.data, 'base64').toString('utf8');
  for (const part of payload.parts || []) {
    const text = plainText(part);
    if (text) return text;
  }
  return '';
}

function summary(msg) {
  const header = (name) => ((msg.payload && msg.payload.headers) || []).find((h) => h.name.toLowerCase() === name)?.value || '';
  return { id: msg.id, from: header('from'), subject: header('subject'), date: header('date'), snippet: msg.snippet || '' };
}

router.get(
  '/',
  route(async (req, res) => {
    const api = gmail();
    const max = Math.min(Math.max(parseInt(req.query.max, 10) || 20, 1), 50);
    const list = await api.users.messages.list({ userId: config.gmail.user, maxResults: max, q: String(req.query.q || '').slice(0, 100) });
    const messages = await Promise.all(
      (list.data.messages || []).map((m) =>
        api.users.messages.get({ userId: config.gmail.user, id: m.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] }).then((r) => summary(r.data))
      )
    );
    res.json({ items: messages });
  })
);

router.get(
  '/:id',
  route(async (req, res) => {
    if (!/^[\w-]{6,64}$/.test(req.params.id)) throw new HttpError(404, 'Correo no encontrado');
    const msg = (await gmail().users.messages.get({ userId: config.gmail.user, id: req.params.id, format: 'full' })).data;
    res.json({ item: { ...summary(msg), body: plainText(msg.payload) || msg.snippet || '' } });
  })
);

module.exports = router;
