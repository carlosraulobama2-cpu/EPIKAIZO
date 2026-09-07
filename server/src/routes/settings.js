const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/plan');
const { prepare, saveDb } = require('../config/database');

router.use(authenticate);
router.use(requireTenant);

router.get('/', (req, res) => {
  try {
    const rows = prepare('SELECT key, value FROM settings WHERE tenant_id = ?').all(req.tenantId);
    const settings = {};
    rows.forEach(r => { settings[r.key] = JSON.parse(r.value); });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

router.put('/', (req, res) => {
  try {
    const settings = req.body || {};
    Object.keys(settings).forEach(key => {
      const existing = prepare('SELECT id FROM settings WHERE tenant_id = ? AND key = ?').get(req.tenantId, key);
      const now = new Date().toISOString();
      if (existing) {
        prepare('UPDATE settings SET value=?, updated_at=? WHERE id=?').run(JSON.stringify(settings[key]), now, existing.id);
      } else {
        prepare('INSERT INTO settings (id, tenant_id, key, value, updated_at) VALUES (?,?,?,?,?)').run(require('uuid').v4(), req.tenantId, key, JSON.stringify(settings[key]), now);
      }
    });
    saveDb();
    res.json({ updated: true });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

module.exports = router;
