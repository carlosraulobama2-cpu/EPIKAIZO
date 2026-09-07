const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/plan');
const { v4: uuidv4 } = require('uuid');
const { prepare, saveDb } = require('../config/database');

router.use(authenticate);
router.use(requireTenant);

const crud = (table, fields) => {
  const cols = fields.filter(f => f !== 'id' && f !== 'tenant_id' && f !== 'created_at');
  const insertCols = 'id, tenant_id, ' + cols.join(',') + ', created_at';
  const insertVals = fields.map(() => '?').join(',') + ', ?';
  const updateSets = cols.map(f => f + ' = ?').join(', ');
  return {
    list(req) {
      return prepare('SELECT * FROM ' + table + ' WHERE tenant_id = ? ORDER BY created_at DESC').all(req.tenantId);
    },
    create(req) {
      const id = uuidv4();
      const vals = [id, req.tenantId];
      cols.forEach(f => vals.push(req.body[f] ?? ''));
      vals.push(new Date().toISOString());
      prepare('INSERT INTO ' + table + ' (' + insertCols + ') VALUES (' + insertVals + ')').run(...vals);
      saveDb();
      return { id };
    },
    update(id, req) {
      const vals = cols.map(f => req.body[f]);
      vals.push(id, req.tenantId);
      prepare('UPDATE ' + table + ' SET ' + updateSets + ' WHERE id = ? AND tenant_id = ?').run(...vals);
      saveDb();
    },
    delete(id, tenantId) {
      prepare('DELETE FROM ' + table + ' WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      saveDb();
    }
  };
};

const makeRouter = (table, fields) => {
  const api = crud(table, fields);
  const r = express.Router();
  r.get('/', (req, res) => { try { res.json(api.list(req)); } catch (e) { res.status(500).json({ error: 'Error' }); } });
  r.post('/', (req, res) => { try { res.status(201).json(api.create(req)); } catch (e) { res.status(500).json({ error: 'Error' }); } });
  r.put('/:id', (req, res) => { try { api.update(req.params.id, req); res.json({ updated: true }); } catch (e) { res.status(500).json({ error: 'Error' }); } });
  r.delete('/:id', (req, res) => { try { api.delete(req.params.id, req.tenantId); res.json({ deleted: true }); } catch (e) { res.status(500).json({ error: 'Error' }); } });
  return r;
};

router.use('/leads', makeRouter('leads', ['name', 'phone', 'email', 'stage', 'channel', 'notes', 'date']));
router.use('/tasks', makeRouter('tasks', ['title', 'description', 'status', 'due_date', 'assigned_to', 'date']));
router.use('/orders', makeRouter('orders', ['client', 'phone', 'vehicle_type', 'budget', 'notes', 'status', 'date']));
router.use('/expenses', makeRouter('expenses', ['category', 'concept', 'amount', 'type', 'date']));
router.use('/employees', makeRouter('employees', ['name', 'role', 'phone', 'email', 'status', 'date']));
router.use('/providers', makeRouter('providers', ['name', 'service', 'phone', 'email', 'notes']));
router.use('/notifications', makeRouter('notifications', ['type', 'message', 'status', 'date']));

module.exports = router;
