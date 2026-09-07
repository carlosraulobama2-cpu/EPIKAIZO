const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/plan');
const { prepare } = require('../config/database');
const { createInvoice, sendInvoiceWhatsApp } = require('../services/invoiceService');

router.use(authenticate);
router.use(requireTenant);

router.get('/', (req, res) => {
  try {
    const tenantId = req.tenantId;
    const rows = prepare('SELECT * FROM invoices WHERE tenant_id = ? ORDER BY date DESC').all(tenantId);
    res.json({ invoices: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const tenantId = req.tenantId;
    const invoice = prepare('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId);
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
    res.json({ invoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/qr', (req, res) => {
  try {
    const tenantId = req.tenantId;
    const invoice = prepare('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId);
    if (!invoice || !invoice.qr_path) return res.status(404).json({ error: 'QR no disponible' });
    const fullPath = path.join(__dirname, '../..', '..', invoice.qr_path);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Archivo QR no encontrado' });
    res.sendFile(fullPath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { client_name, client_phone, client_email, amount, currency, verify_url } = req.body;
    if (!client_name || !client_phone || !amount) {
      return res.status(400).json({ error: 'client_name, client_phone y amount son requeridos' });
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'amount debe ser un número mayor a 0' });
    }
    const cleanText = (v) => (typeof v === 'string' ? v.replace(/[<>]/g, '').trim() : '');

    const invoice = await createInvoice({
      tenantId,
      clientName: cleanText(client_name),
      clientPhone: cleanText(client_phone),
      clientEmail: cleanText(client_email),
      amount: numericAmount,
      currency: cleanText(currency) || 'XAF',
      verifyUrl: cleanText(verify_url)
    });

    res.json({ success: true, invoice });
  } catch (err) {
    console.error('Error creating invoice:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/send-whatsapp', async (req, res) => {
  try {
    const result = await sendInvoiceWhatsApp(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
