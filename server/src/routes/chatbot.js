const express = require('express');
const router = express.Router();

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY || '';
const GOOGLE_AI_MODEL = process.env.GOOGLE_AI_MODEL || 'gemini-2.0-flash';
const BASE_URL = `https://generativelanguage.googleapis.com/v1/models/${GOOGLE_AI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `Eres el asistente virtual de Epicaizo, una empresa de envíos de paquetes y dinero en Guinea Ecuatorial.
Responde en español, de forma amable, profesional y concisa.
Conocimiento de la empresa:
- Teléfono/WhatsApp: +240 222 580 828
- Correo: hola@epicaizo.com
- Oficina: Av. del Puerto s/n, Malabo
- Horario: lunes a sábado, 8:00 a 18:00
- Cobertura: 18 ciudades (Malabo, Bata, Ebebiyín, Mongomo, Luba, Evinayong, Aconibe, Micomeseng, Añisoc, Rebola, Riaba, Nsork, etc.)
- Paquetes: nacionales e internacionales, peso máximo 30 kg, recogida a domicilio, guía de rastreo
- Dinero/remesas: comisión visible, entrega en efectivo en punto asociado
- Tarifas aproximadas: paquetes locales desde 4 USD/kg, nacionales desde 9 USD/kg, internacionales desde 22 USD/kg
- Remesas: comisión desde 2% (local), 3.5% (nacional), 6% (internacional)
- B2B: soluciones corporativas para e-commerce, facturación mensual, tarifas preferenciales
- +8 años de experiencia, +32K envíos entregados, 96% entregas a tiempo
- Web: https://epicaizo.com (cotizador y rastreo en línea)
Si no sabes algo, derivar al formulario de contacto o al WhatsApp +240 222 580 828.`;

const conversationStore = new Map();

function buildContents(sessionId, newMessage) {
  const history = conversationStore.get(sessionId) || [];
  const contents = [];
  
  if (history.length === 0) {
    contents.push({
      role: 'user',
      parts: [{ text: SYSTEM_PROMPT }]
    });
  }
  
  for (const turn of history) {
    contents.push({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }]
    });
  }
  
  contents.push({
    role: 'user',
    parts: [{ text: newMessage }]
  });
  
  return contents;
}

router.post('/', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'El campo message es requerido' });
    }

    if (!GOOGLE_AI_API_KEY) {
      return res.status(500).json({ error: 'API key de Google AI no configurada' });
    }

    const sid = sessionId || 'default';
    const contents = buildContents(sid, message);

    const url = `${BASE_URL}?key=${GOOGLE_AI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Google AI error:', response.status, errText);
      let clientMsg = 'Error al consultar la IA';
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) clientMsg = parsed.error.message;
        else if (parsed.message) clientMsg = parsed.message;
        else clientMsg = errText.slice(0, 300);
      } catch {
        clientMsg = errText.slice(0, 300) || String(response.status);
      }
      return res.status(502).json({ error: clientMsg, status: response.status });
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Lo siento, no pude generar una respuesta. Por favor intenta de nuevo o contacta por WhatsApp.';

    const history = conversationStore.get(sid) || [];
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: reply });
    if (history.length > 20) history.length = 20;
    conversationStore.set(sid, history);

    res.json({ reply });
  } catch (err) {
    console.error('Chatbot error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/clear', (req, res) => {
  const { sessionId } = req.body;
  const sid = sessionId || 'default';
  conversationStore.delete(sid);
  res.json({ success: true });
});

module.exports = router;
