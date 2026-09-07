const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'epk_verify_2026';
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v19.0';
const MESSAGES_FILE = path.join(__dirname, '../../../data/whatsapp_messages.json');

function ensureMessagesFile() {
  const dir = path.dirname(MESSAGES_FILE);
  console.log('Ensuring messages file at:', MESSAGES_FILE);
  if (!fs.existsSync(dir)) {
    console.log('Creating directory:', dir);
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(MESSAGES_FILE)) {
    console.log('Creating messages file');
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify([], null, 2));
  }
  console.log('Messages file exists:', fs.existsSync(MESSAGES_FILE));
}

function loadMessages() {
  ensureMessagesFile();
  try { return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8')); } catch { return []; }
}

function saveMessage(from, text, type) {
  var messages = loadMessages();
  messages.push({
    id: 'WA-' + Date.now(),
    from: from,
    text: text,
    type: type || 'incoming',
    date: new Date().toISOString(),
    read: false
  });
  if (messages.length > 200) messages = messages.slice(-200);
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
  return messages;
}

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send('Forbidden');
});

router.get('/messages', (req, res) => {
  console.log('Loading WhatsApp messages from:', MESSAGES_FILE);
  try {
    var messages = loadMessages();
    console.log('Loaded', messages.length, 'messages');
    messages.reverse();
    res.json({ messages: messages.slice(0, 100) });
  } catch (err) {
    console.error('Error loading messages:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') {
      return res.status(400).send('Not a WhatsApp event');
    }
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (value.messages) {
          for (const message of value.messages) {
            const from = message.from;
            const text = message.text?.body || '';
            saveMessage(from, text, 'incoming');
            await handleIncomingMessage(from, text);
          }
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    res.status(500).send('Error');
  }
});

async function handleIncomingMessage(from, text) {
  const reply = buildAutoReply(text);
  await sendWhatsAppMessage(from, reply);
}

function buildAutoReply(text) {
  const t = text.trim().toLowerCase();
  if (t.includes('precio') || t.includes('tarifa') || t.includes('cotizar')) {
    return 'Hola! Para cotizar tu envío usa nuestro cotizador en línea o escribe: "Quiero enviar un paquete de X kg a [ciudad]".';
  }
  if (t.includes('guia') || t.includes('rastreo') || t.includes('rastrear')) {
    return 'Puedes rastrear tu envío ingresando tu guía EPZ-000000 en la sección Rastrear de nuestra web.';
  }
  if (t.includes('horario') || t.includes('abierto') || t.includes('atención')) {
    return 'Nuestro horario es de lunes a sábado, 8:00 a 18:00. Escribe tu consulta y te atendemos.';
  }
  if (t.includes('gracias') || t.includes('ok')) {
    return '¡De nada! Si necesitas algo más, aquí estaremos.';
  }
  return 'Hola! Gracias por escribir a Epicaizo. Te atendemos en horario laboral. Escribe "precio" para cotizar, "guía" para rastrear o "horario" para ver atención.';
}

async function sendWhatsAppMessage(to, text) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) return;
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to,
      text: { body: text }
    };
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error('Error sending WhatsApp message:', err);
  }
}

async function sendWhatsAppTemplate(to, templateName, languageCode = 'es') {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) return;
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode }
      }
    };
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error('Error sending WhatsApp template:', err);
  }
}

router.post('/send', async (req, res) => {
  try {
    const { to, text } = req.body;
    if (!to || !text) return res.status(400).json({ error: 'to y text son requeridos' });
    await sendWhatsAppMessage(to, text);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/template', async (req, res) => {
  try {
    const { to, templateName, languageCode } = req.body;
    if (!to || !templateName) return res.status(400).json({ error: 'to y templateName son requeridos' });
    await sendWhatsAppTemplate(to, templateName, languageCode);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
