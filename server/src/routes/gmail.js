const express = require('express');
const router = express.Router();
const { google } = require('googleapis');

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN || '';
const GMAIL_ACCESS_TOKEN = process.env.GMAIL_ACCESS_TOKEN || '';
const GMAIL_USER = process.env.GMAIL_USER || 'me';

const oAuth2Client = new google.auth.OAuth2(
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

if (GMAIL_REFRESH_TOKEN) {
  oAuth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
} else if (GMAIL_ACCESS_TOKEN) {
  oAuth2Client.setCredentials({ access_token: GMAIL_ACCESS_TOKEN });
}

function getGmail() {
  return google.gmail({ version: 'v1', auth: oAuth2Client });
}

router.get('/emails', async (req, res) => {
  try {
    const gmail = getGmail();
    const maxResults = parseInt(req.query.max || '20', 10);
    const response = await gmail.users.messages.list({
      userId: GMAIL_USER,
      maxResults,
      q: req.query.q || '',
    });
    const messageMeta = (response.data.messages || []).map((m) => ({
      id: m.id,
      threadId: m.threadId,
    }));
    const detailed = [];
    for (const meta of messageMeta) {
      try {
        const msgRes = await gmail.users.messages.get({
          userId: GMAIL_USER,
          id: meta.id,
          format: 'full',
        });
        const msg = msgRes.data;
        const headers = msg.payload.headers || [];
        const getHeader = (name) => {
          const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
          return h ? h.value : '';
        };
        let body = '';
        const extractParts = (parts) => {
          if (!parts) return;
          for (const part of parts) {
            if (part.mimeType === 'text/plain' && part.body && part.body.data) {
              body += Buffer.from(part.body.data, 'base64').toString('utf8');
            } else if (part.parts) {
              extractParts(part.parts);
            }
          }
        };
        if (msg.payload.body && msg.payload.body.data) {
          body = Buffer.from(msg.payload.body.data, 'base64').toString('utf8');
        } else {
          extractParts(msg.payload.parts);
        }
        detailed.push({
          id: msg.id,
          threadId: msg.threadId,
          from: getHeader('From'),
          to: getHeader('To'),
          subject: getHeader('Subject'),
          date: getHeader('Date'),
          snippet: msg.snippet || '',
          body: body || msg.snippet || '',
        });
      } catch (err) {
        detailed.push({ id: meta.id, error: 'No se pudo cargar el correo' });
      }
    }
    res.json({ messages: detailed });
  } catch (err) {
    console.error('Error listing Gmail messages:', err);
    res.status(500).json({ error: 'Error al obtener correos de Gmail' });
  }
});

router.get('/emails/:id', async (req, res) => {
  try {
    const gmail = getGmail();
    const response = await gmail.users.messages.get({
      userId: GMAIL_USER,
      id: req.params.id,
      format: 'full',
    });
    const msg = response.data;
    const headers = msg.payload.headers || [];
    const getHeader = (name) => {
      const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
      return h ? h.value : '';
    };
    let body = '';
    const extractParts = (parts) => {
      if (!parts) return;
      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
          body += Buffer.from(part.body.data, 'base64').toString('utf8');
        } else if (part.parts) {
          extractParts(part.parts);
        }
      }
    };
    if (msg.payload.body && msg.payload.body.data) {
      body = Buffer.from(msg.payload.body.data, 'base64').toString('utf8');
    } else {
      extractParts(msg.payload.parts);
    }
    res.json({
      id: msg.id,
      threadId: msg.threadId,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      snippet: msg.snippet || '',
      body: body || msg.snippet || '',
    });
  } catch (err) {
    console.error('Error getting Gmail message:', err);
    res.status(500).json({ error: 'Error al obtener el correo' });
  }
});

module.exports = router;
