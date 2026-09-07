const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/plan');
const { prepare, saveDb } = require('../config/database');

router.use(authenticate);
router.use(requireTenant);

router.get('/', (req, res) => {
  try {
    const logs = prepare('SELECT * FROM audit_log WHERE tenant_id = ? ORDER BY date DESC LIMIT 100').all(req.tenantId);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

router.delete('/', (req, res) => {
  try {
    prepare('DELETE FROM audit_log WHERE tenant_id = ?').run(req.tenantId);
    saveDb();
    res.json({ cleared: true });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

module.exports = router;
