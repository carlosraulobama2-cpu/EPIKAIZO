const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/plan');
const { v4: uuidv4 } = require('uuid');
const { prepare, saveDb } = require('../config/database');
const { createInvoice, sendInvoiceWhatsApp, findInvoiceByPackageId } = require('../services/invoiceService');

router.use(authenticate);
router.use(requireTenant);

router.get('/', (req, res) => {
  try {
    const items = prepare('SELECT * FROM packages WHERE tenant_id = ? ORDER BY date DESC').all(req.tenantId);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener paquetes' });
  }
});

router.post('/', async (req, res) => {
  try {
    const item = {
      id: uuidv4(),
      tenant_id: req.tenantId,
      status: req.body.status || 'recibido',
      sender_name: req.body.sender_name || '',
      sender_phone: req.body.sender_phone || '',
      sender_doc: req.body.sender_doc || '',
      receiver_name: req.body.receiver_name || '',
      receiver_phone: req.body.receiver_phone || '',
      destination: req.body.destination || '',
      fee: Number(req.body.fee) || 0,
      total: Number(req.body.total) || 0,
      type: req.body.type || 'Paquete',
      date: req.body.date || new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    prepare('INSERT INTO packages (id, tenant_id, status, sender_name, sender_phone, sender_doc, receiver_name, receiver_phone, destination, fee, total, type, date, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      item.id, item.tenant_id, item.status, item.sender_name, item.sender_phone, item.sender_doc, item.receiver_name, item.receiver_phone, item.destination, item.fee, item.total, item.type, item.date, item.created_at
    );
    saveDb();

    try {
      await createInvoice({
        tenantId: req.tenantId,
        clientName: item.sender_name,
        clientPhone: item.sender_phone,
        clientEmail: '',
        amount: item.total,
        currency: 'XAF',
        packageId: item.id
      });
    } catch (invErr) {
      console.error('Error creating invoice for package:', invErr);
    }

    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear paquete' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = prepare('SELECT * FROM packages WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
    if (!existing) return res.status(404).json({ error: 'Paquete no encontrado' });
    prepare('UPDATE packages SET status=?, sender_name=?, sender_phone=?, sender_doc=?, receiver_name=?, receiver_phone=?, destination=?, fee=?, total=?, type=?, date=? WHERE id=? AND tenant_id=?').run(
      req.body.status ?? existing.status,
      req.body.sender_name ?? existing.sender_name,
      req.body.sender_phone ?? existing.sender_phone,
      req.body.sender_doc ?? existing.sender_doc,
      req.body.receiver_name ?? existing.receiver_name,
      req.body.receiver_phone ?? existing.receiver_phone,
      req.body.destination ?? existing.destination,
      req.body.fee ?? existing.fee,
      req.body.total ?? existing.total,
      req.body.type ?? existing.type,
      req.body.date ?? existing.date,
      req.params.id, req.tenantId
    );
    saveDb();
    const updated = prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);

    const newStatus = req.body.status || existing.status;
    if (existing.status !== 'entregado' && newStatus === 'entregado') {
      const invoice = findInvoiceByPackageId(updated.id);
      if (invoice) {
        sendInvoiceWhatsApp(invoice.id).catch(err => {
          console.error('Error sending invoice WhatsApp on delivery:', err);
        });
      }
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar paquete' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const existing = prepare('SELECT * FROM packages WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
    if (!existing) return res.status(404).json({ error: 'Paquete no encontrado' });
    prepare('DELETE FROM packages WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
    saveDb();
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar paquete' });
  }
});

module.exports = router;
