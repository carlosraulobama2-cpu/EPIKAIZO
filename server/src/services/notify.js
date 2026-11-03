// Avisos por WhatsApp a los clientes: cambios de estado de los envíos y recordatorios de cobro.
// Si WhatsApp no está configurado no se manda nada (y no es un error): el panel ofrece entonces
// abrir WhatsApp en el teléfono del empleado con el mismo texto.
const config = require('../config');
const whatsapp = require('./whatsapp');
const { getSettings } = require('./settings');

const trackUrl = (shipment) => `${config.publicUrl}/envios?guia=${encodeURIComponent(shipment.tracking_code)}#rastreo`;
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const fcfa = (v) => `${new Intl.NumberFormat('es-ES', { useGrouping: 'always', maximumFractionDigits: 0 }).format(Number(v || 0))} FCFA`;

// Texto corto del estado, para la plantilla de Meta ({{3}}).
const STATUS_LABEL = {
  paquete: { registrado: 'registrado', en_transito: 'en camino', en_reparto: 'listo para entregar', entregado: 'entregado' },
  dinero: { registrado: 'registrado', en_transito: 'en proceso', en_reparto: 'listo para cobrar', entregado: 'cobrado' },
};

/** Mensaje para quien envía o quien recibe, según el estado. null = a esa persona no se le avisa. */
function statusMessage(s, status, who, company) {
  const name = firstName(who === 'sender' ? s.sender_name : s.receiver_name);
  const hi = name ? `Hola ${name}` : 'Hola';
  const link = trackUrl(s);
  const money = s.kind === 'dinero';
  const route = `de ${s.origin} a ${s.destination}`;
  switch (status) {
    case 'registrado':
      if (who !== 'sender') return null;
      return money
        ? `${hi}, hemos registrado tu envío de dinero ${s.tracking_code} ${route} (${fcfa(s.amount)}). Te avisaremos cuando esté listo para cobrar. Seguimiento: ${link}`
        : `${hi}, hemos registrado tu envío ${s.tracking_code} ${route}. Guarda esta guía para seguirlo: ${link}`;
    case 'en_transito':
      return money
        ? `${hi}, el envío de dinero ${s.tracking_code} ${route} está en proceso. Seguimiento: ${link}`
        : `${hi}, el envío ${s.tracking_code} ${route} ya está en camino. Síguelo aquí: ${link}`;
    case 'en_reparto':
      if (money) {
        return who === 'receiver'
          ? `${hi}, tienes un envío de dinero (${s.tracking_code}) listo para cobrar en nuestra oficina de ${s.destination}. Trae tu documento de identidad.`
          : `${hi}, el dinero que enviaste (${s.tracking_code}) ya está disponible para cobrar en ${s.destination}.`;
      }
      return `${hi}, el envío ${s.tracking_code} ha llegado a ${s.destination} y está listo para entregar. Seguimiento: ${link}`;
    case 'entregado':
      return money
        ? `${hi}, el envío de dinero ${s.tracking_code} ya se ha cobrado. Gracias por confiar en ${company}.`
        : `${hi}, el envío ${s.tracking_code} se ha entregado. Gracias por confiar en ${company}.`;
    default:
      return null;
  }
}

/** ¿Están activados los avisos de estado? (Ajustes → Avisos). Por defecto, sí. */
async function statusNoticesOn(tenantId) {
  const { notifications } = await getSettings(tenantId);
  return notifications.shipment_status !== false;
}

/**
 * Avisa a remitente y destinatario del nuevo estado. Devuelve { sent, failed, skipped }.
 * Nunca lanza: un fallo de WhatsApp no deshace el cambio de estado.
 */
async function notifyShipmentStatus(tenantId, shipment, status) {
  const result = { sent: 0, failed: 0, skipped: false, errors: [] };
  if (!whatsapp.enabled() || !(await statusNoticesOn(tenantId))) {
    result.skipped = true;
    return result;
  }
  const { company } = await getSettings(tenantId);
  const targets = [['sender', shipment.sender_phone], ['receiver', shipment.receiver_phone]];
  const seen = new Set();
  for (const [who, phone] of targets) {
    const number = whatsapp.toNumber(phone || '');
    if (!number || seen.has(number)) continue;
    const text = statusMessage(shipment, status, who, company.name);
    if (!text) continue;
    seen.add(number);
    try {
      if (config.whatsapp.statusTemplate) {
        const name = firstName(who === 'sender' ? shipment.sender_name : shipment.receiver_name) || 'cliente';
        await whatsapp.sendTemplate(phone, config.whatsapp.statusTemplate, [name, shipment.tracking_code, STATUS_LABEL[shipment.kind][status] || status, trackUrl(shipment)], config.whatsapp.templateLanguage);
      } else {
        await whatsapp.sendText(phone, text);
      }
      result.sent += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push(err.message);
    }
  }
  return result;
}

/** Texto del recordatorio de una factura con importe pendiente. */
function reminderText(invoice, { company, billing, verifyUrl }) {
  const pending = Number(invoice.amount) - Number(invoice.paid_amount || 0);
  const name = firstName(invoice.client_name);
  const due = invoice.due_date ? new Date(`${invoice.due_date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : null;
  const how = billing.bank_account
    ? `Puedes pagar en nuestras oficinas o por transferencia a ${billing.bank_account} indicando ${invoice.number}.`
    : 'Puedes pagar en nuestras oficinas.';
  return `${name ? `Hola ${name}` : 'Hola'}, te recordamos que la factura ${invoice.number} de ${company.name} tiene pendiente ${fcfa(pending)}${due ? ` (vencía el ${due})` : ''}. ${how} Factura: ${verifyUrl}`;
}

module.exports = { notifyShipmentStatus, statusMessage, reminderText, trackUrl, fcfa };
