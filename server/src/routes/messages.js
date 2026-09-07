const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { prepare, saveDb } = require('../config/database');

router.post('/', (req, res) => {
  try {
    const { name, phone, email, message, tenantId } = req.body;
    if (!name || !phone || !message) {
      return res.status(400).json({ error: 'Nombre, teléfono y mensaje son requeridos' });
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    const tId = tenantId || 'public';
    prepare('INSERT INTO messages (id, tenant_id, name, phone, email, message, status, date, created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(
      id, tId, name, phone, email || '', message, 'pendiente', now, now
    );
    saveDb();
    res.status(201).json({ id, status: 'pendiente', date: now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar mensaje' });
  }
});

router.get('/', (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID requerido' });
    const messages = prepare('SELECT * FROM messages WHERE tenant_id = ? ORDER BY date DESC LIMIT 100').all(tenantId);
    res.json(messages);
  } catch (err) {
    console.error('Error in GET /api/messages:', err);
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

router.put('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    prepare('UPDATE messages SET status=? WHERE id=?').run(status, req.params.id);
    saveDb();
    res.json({ updated: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

module.exports = router;
