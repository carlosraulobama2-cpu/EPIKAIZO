const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/plan');
const { v4: uuidv4 } = require('uuid');
const { prepare, saveDb } = require('../config/database');

router.use(authenticate);
router.use(requireTenant);

const fields = ['brand', 'model', 'year', 'plate', 'price', 'status', 'date'];
const cols = fields.filter(f => f !== 'id' && f !== 'tenant_id' && f !== 'created_at');
const insertCols = 'id, tenant_id, ' + cols.join(',') + ', created_at';
const insertVals = fields.map(() => '?').join(',') + ', ?';
const updateSets = cols.map(f => f + ' = ?').join(', ');

router.get('/', (req, res) => {
  try {
    const items = prepare('SELECT * FROM cars WHERE tenant_id = ? ORDER BY created_at DESC').all(req.tenantId);
    res.json(items);
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

router.post('/', (req, res) => {
  try {
    if (!req.body || !req.body.plate || typeof req.body.plate !== 'string' || !req.body.plate.trim()) {
      return res.status(400).json({ error: 'La placa es obligatoria.' });
    }
    if (!req.tenantId) {
      return res.status(400).json({ error: 'tenantId es requerido.' });
    }
    const id = uuidv4();
    const vals = [id, req.tenantId];
    cols.forEach(f => vals.push(req.body[f] ?? ''));
    vals.push(new Date().toISOString());
    prepare('INSERT INTO cars (' + insertCols + ') VALUES (' + insertVals + ')').run(...vals);
    saveDb();
    res.status(201).json({ id });
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

router.put('/:id', (req, res) => {
  try {
    const vals = cols.map(f => req.body[f]);
    vals.push(req.params.id, req.tenantId);
    prepare('UPDATE cars SET ' + updateSets + ' WHERE id = ? AND tenant_id = ?').run(...vals);
    saveDb();
    res.json({ updated: true });
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

router.delete('/:id', (req, res) => {
  try {
    prepare('DELETE FROM cars WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
    saveDb();
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

module.exports = router;
