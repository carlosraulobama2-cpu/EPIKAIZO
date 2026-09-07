const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/plan');
const { prepare, saveDb } = require('../config/database');

router.use(authenticate);
router.use(requireTenant);

router.get('/', (req, res) => {
  try {
    const tenant = prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenantId);
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

router.put('/', (req, res) => {
  try {
    prepare('UPDATE tenants SET name=?, settings=?, updated_at=? WHERE id=?').run(
      req.body.name, JSON.stringify(req.body.settings || {}), new Date().toISOString(), req.tenantId
    );
    saveDb();
    res.json({ updated: true });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

module.exports = router;
