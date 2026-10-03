// Facturas: numeración correlativa, QR de verificación y envío por WhatsApp.
const QRCode = require('qrcode');
const config = require('../config');
const db = require('../db');
const { createDocument } = require('./billing');
const { getSettings } = require('./settings');
const whatsapp = require('./whatsapp');

/**
 * Factura de una sola línea sin impuesto (la de cada envío: el precio del envío ya es final).
 * Para facturas con varias líneas e IVA se usa billing.createDocument.
 */
async function createInvoice(tenantId, data, { userId = null, client } = {}) {
  const { billing } = await getSettings(tenantId);
  return createDocument(
    tenantId,
    {
      kind: 'factura',
      client_id: data.client_id,
      client_name: data.client_name,
      client_phone: data.client_phone,
      client_email: data.client_email,
      concept: data.concept,
      lines: [{ description: data.concept, quantity: 1, unit_price: data.amount, tax_rate: 0 }],
      shipment_id: data.shipment_id,
      job_id: data.job_id,
    },
    { userId, client, billing, currency: data.currency }
  );
}

/** El QR lleva a la página pública de verificación; el id es un UUID imposible de adivinar. */
const verifyUrl = (invoice) => `${config.publicUrl}/verificar.html?f=${invoice.id}`;

/** El QR se genera al vuelo: en Render el disco se borra en cada despliegue. */
function qrPng(invoice) {
  return QRCode.toBuffer(verifyUrl(invoice), { width: 600, margin: 2, color: { dark: '#0B1020', light: '#FFFFFF' } });
}

function money(value, currency) {
  if (currency === 'XAF') return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Number(value))} FCFA`;
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'USD' }).format(Number(value));
}

const DOC_NAME = { factura: 'la factura', presupuesto: 'el presupuesto', rectificativa: 'la factura rectificativa' };

async function sendInvoiceWhatsApp(invoice, companyName) {
  const caption =
    `Hola ${invoice.client_name}. Te enviamos ${DOC_NAME[invoice.kind || 'factura']} ${invoice.number} de ${companyName} por ${money(invoice.amount, invoice.currency)}. ` +
    `Escanea el código o abre ${verifyUrl(invoice)} para comprobarla.`;
  await whatsapp.sendImage(invoice.client_phone, `${config.publicUrl}/api/public/invoices/${invoice.id}/qr.png`, caption);
  return db.one("UPDATE invoices SET status = CASE WHEN status = 'emitida' THEN 'enviada' ELSE status END, sent_at = now() WHERE id = $1 RETURNING *", [invoice.id]);
}

module.exports = { createInvoice, qrPng, verifyUrl, sendInvoiceWhatsApp, money };
