// Facturas: numeración correlativa, QR de verificación y envío por WhatsApp.
const crypto = require('crypto');
const QRCode = require('qrcode');
const config = require('../config');
const db = require('../db');
const { invoiceNumber } = require('./codes');
const whatsapp = require('./whatsapp');

async function createInvoice(tenantId, data, { userId = null, client } = {}) {
  const id = crypto.randomUUID();
  const number = await invoiceNumber(tenantId, client);
  return db.one(
    `INSERT INTO invoices (id, tenant_id, number, client_name, client_phone, client_email, concept, amount, currency, shipment_id, job_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [id, tenantId, number, data.client_name, data.client_phone, data.client_email || null, data.concept, data.amount, data.currency,
      data.shipment_id || null, data.job_id || null, userId],
    client
  );
}

/** El QR lleva a la página pública de verificación; el id es un UUID imposible de adivinar. */
const verifyUrl = (invoice) => `${config.publicUrl}/verificar.html?f=${invoice.id}`;

/** El QR se genera al vuelo: en Render el disco se borra en cada despliegue. */
function qrPng(invoice) {
  return QRCode.toBuffer(verifyUrl(invoice), { width: 600, margin: 2, color: { dark: '#0B1020', light: '#FFFFFF' } });
}

function money(value, currency) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'USD' }).format(Number(value));
}

async function sendInvoiceWhatsApp(invoice, companyName) {
  const caption =
    `Hola ${invoice.client_name}. Te enviamos la factura ${invoice.number} de ${companyName} por ${money(invoice.amount, invoice.currency)}. ` +
    `Escanea el código o abre ${verifyUrl(invoice)} para comprobarla.`;
  await whatsapp.sendImage(invoice.client_phone, `${config.publicUrl}/api/public/invoices/${invoice.id}/qr.png`, caption);
  return db.one("UPDATE invoices SET status = CASE WHEN status = 'emitida' THEN 'enviada' ELSE status END, sent_at = now() WHERE id = $1 RETURNING *", [invoice.id]);
}

module.exports = { createInvoice, qrPng, verifyUrl, sendInvoiceWhatsApp, money };
