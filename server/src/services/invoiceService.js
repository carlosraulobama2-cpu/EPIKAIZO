const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { prepare, saveDb } = require('../config/database');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const QR_DIR = path.join(UPLOAD_DIR, 'qrcodes');
if (!fs.existsSync(QR_DIR)) fs.mkdirSync(QR_DIR, { recursive: true });

function formatInvoiceNumber(tenantId, seq) {
  const slug = (tenantId || 'PUB').slice(0, 3).toUpperCase();
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return 'FAC-' + y + '-' + m + '-' + slug + '-' + String(seq).padStart(4, '0');
}

async function generateQr(verifyUrl, id) {
  const qrFileName = 'qr-' + id + '.png';
  const qrPath = 'uploads/qrcodes/' + qrFileName;
  const fullQrPath = path.join(__dirname, '../..', '..', qrFileName);
  
  // Recompute full path correctly
  const fullQrPathCorrect = path.join(__dirname, '../..', '..', 'uploads', 'qrcodes', qrFileName);
  
  const qrBuffer = await QRCode.toBuffer(verifyUrl, {
    width: 600,
    margin: 2,
    color: { dark: '#0F172A', light: '#FFFFFF' }
  });
  fs.writeFileSync(fullQrPathCorrect, qrBuffer);
  return { qrPath: 'uploads/qrcodes/' + qrFileName, fullPath: fullQrPathCorrect };
}

async function createInvoice({ tenantId, clientName, clientPhone, clientEmail, amount, currency, packageId, verifyUrl }) {
  const countRow = prepare('SELECT count(*) as c FROM invoices WHERE tenant_id = ?').get(tenantId);
  const seq = (countRow.c || 0) + 1;
  const invoiceNumber = formatInvoiceNumber(tenantId, seq);
  const id = uuidv4();
  const now = new Date().toISOString();

  const verifyUrlFinal = verifyUrl || `https://epikaizo.com/verify?id=${id}`;
  const { qrPath } = await generateQr(verifyUrlFinal, id);

  const invoice = {
    id,
    tenant_id: tenantId,
    invoice_number: invoiceNumber,
    client_name: clientName,
    client_phone: String(clientPhone).replace(/\D/g, ''),
    client_email: clientEmail || '',
    amount: Number(amount),
    currency: currency || 'XAF',
    status: 'issued',
    qr_path: qrPath,
    pdf_url: '',
    verify_url: verifyUrlFinal,
    items: JSON.stringify([{ description: 'Envio de paquete', package_id: packageId }]),
    package_id: packageId || null,
    date: now,
    created_at: now
  };

  prepare('INSERT INTO invoices (id, tenant_id, invoice_number, client_name, client_phone, client_email, amount, currency, status, qr_path, pdf_url, verify_url, items, package_id, date, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, tenantId, invoiceNumber, clientName, String(clientPhone).replace(/\D/g, ''), clientEmail || '', Number(amount), currency || 'XAF', 'issued', qrPath, '', verifyUrlFinal, JSON.stringify([{ description: 'Envio de paquete', package_id: packageId }]), packageId || '', now, now);

  saveDb();
  return invoice;
}

async function sendInvoiceWhatsApp(invoiceId) {
  const invoice = prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!invoice) throw new Error('Factura no encontrada');

  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v19.0';

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    throw new Error('WhatsApp no configurado en el servidor');
  }

  let to = String(invoice.client_phone).replace(/\D/g, '');
  let clientName = invoice.client_name;

  if (invoice.package_id) {
    const pkg = prepare('SELECT receiver_name, receiver_phone FROM packages WHERE id = ?').get(invoice.package_id);
    if (pkg && pkg.receiver_phone) {
      to = String(pkg.receiver_phone).replace(/\D/g, '');
      clientName = pkg.receiver_name || clientName;
    }
  }

  const fullQrPath = path.join(__dirname, '../..', '..', invoice.qr_path);

  const fsRead = fs.promises.readFile(fullQrPath);
  const base64 = (await fsRead).toString('base64');

  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  
  const packageCode = invoice.package_id || invoice.invoice_number;
  const caption = `Hola ${clientName}! Tu paquete ${packageCode} ha sido entregado. Adjuntamos la factura y codigo QR de Epikaizo Services S.L. por un total de ${formatMoneyWhatsApp(invoice.amount, invoice.currency)}. Puedes escanear el QR para ver los detalles o realizar gestiones.`;

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: {
      link: `https://epikaizo.com/api/invoices/${invoice.id}/qr`,
      caption: caption
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + WHATSAPP_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const result = await response.json();
  if (!response.ok) {
    console.error('WhatsApp send error:', result);
    throw new Error(result.error?.message || 'Error enviando WhatsApp');
  }

  prepare('UPDATE invoices SET status = ? WHERE id = ?').run('sent', invoice.id);
  saveDb();

  return { success: true, messageId: result.messages && result.messages[0] && result.messages[0].id };
}

function findInvoiceByPackageId(packageId) {
  return prepare('SELECT * FROM invoices WHERE package_id = ?').get(packageId);
}

function formatMoneyWhatsApp(value, currency) {
  if (currency === 'EUR') return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'XAF' }).format(value);
}

module.exports = {
  createInvoice,
  sendInvoiceWhatsApp,
  findInvoiceByPackageId,
  generateQr
};
