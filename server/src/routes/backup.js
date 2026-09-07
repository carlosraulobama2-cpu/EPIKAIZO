const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/plan');
const { prepare, saveDb } = require('../config/database');

router.use(authenticate);
router.use(requireTenant);

router.get('/export', (req, res) => {
  try {
    const tables = ['packages', 'cars', 'leads', 'tasks', 'orders', 'expenses', 'employees', 'providers', 'notifications'];
    const data = {};
    tables.forEach(t => {
      data[t] = prepare('SELECT * FROM ' + t + ' WHERE tenant_id = ?').all(req.tenantId);
    });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=epikaizo_backup.json');
    res.send(JSON.stringify({ date: new Date().toISOString(), version: '1.0', data }, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Error al exportar' });
  }
});

router.post('/import', (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'Datos requeridos' });
    const tables = ['packages', 'cars', 'leads', 'tasks', 'orders', 'expenses', 'employees', 'providers', 'notifications'];
    tables.forEach(t => {
      if (data[t]) {
        prepare('DELETE FROM ' + t + ' WHERE tenant_id = ?').run(req.tenantId);
        const cols = Object.keys(data[t][0] || {});
        const placeholders = cols.map(() => '?').join(',');
        const insert = prepare('INSERT INTO ' + t + ' (' + cols.join(',') + ') VALUES (' + placeholders + ')');
        data[t].forEach(r => insert.run(...cols.map(c => r[c])));
      }
    });
    saveDb();
    res.json({ imported: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al importar' });
  }
});

module.exports = router;
