const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/plan');
const { prepare } = require('../config/database');

router.use(authenticate);
router.use(requireTenant);

router.get('/stats', (req, res) => {
  try {
    const tenantId = req.tenantId;
    const packages = prepare('SELECT count(*) as total FROM packages WHERE tenant_id = ?').get(tenantId).total;
    const cars = prepare('SELECT count(*) as total FROM cars WHERE tenant_id = ?').get(tenantId).total;
    const leads = prepare('SELECT count(*) as total FROM leads WHERE tenant_id = ?').get(tenantId).total;
    const tasks = prepare('SELECT count(*) as total FROM tasks WHERE tenant_id = ?').get(tenantId).total;
    const orders = prepare('SELECT count(*) as total FROM orders WHERE tenant_id = ?').get(tenantId).total;
    const expenses = prepare('SELECT sum(amount) as total FROM expenses WHERE tenant_id = ?').get(tenantId).total || 0;
    const employees = prepare('SELECT count(*) as total FROM employees WHERE tenant_id = ?').get(tenantId).total;
    const providers = prepare('SELECT count(*) as total FROM providers WHERE tenant_id = ?').get(tenantId).total;
    res.json({ packages, cars, leads, tasks, orders, expenses, employees, providers });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

module.exports = router;
