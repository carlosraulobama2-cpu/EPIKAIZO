const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireTenant } = require('../middleware/plan');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { prepare, saveDb } = require('../config/database');

router.use(authenticate);
router.use(requireTenant);

router.get('/', (req, res) => {
  try {
    const users = prepare('SELECT id, name, email, role, status, created_at FROM users WHERE tenant_id = ?').all(req.tenantId);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const exists = prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) return res.status(400).json({ error: 'Email ya existe' });
    const hashed = await bcrypt.hash(password || uuidv4(), 10);
    const id = uuidv4();
    const now = new Date().toISOString();
    prepare('INSERT INTO users (id, tenant_id, name, email, password, role, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(
      id, req.tenantId, name, email, hashed, role || 'user', 'active', now, now
    );
    saveDb();
    res.status(201).json({ id, name, email, role });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, role, status } = req.body;
    const sets = [];
    const vals = [];
    if (name) { sets.push('name = ?'); vals.push(name); }
    if (role) { sets.push('role = ?'); vals.push(role); }
    if (status) { sets.push('status = ?'); vals.push(status); }
    sets.push('updated_at = ?'); vals.push(new Date().toISOString());
    vals.push(req.params.id, req.tenantId);
    prepare('UPDATE users SET ' + sets.join(', ') + ' WHERE id = ? AND tenant_id = ?').run(...vals);
    saveDb();
    res.json({ updated: true });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    prepare('DELETE FROM users WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
    saveDb();
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Error' });
  }
});

module.exports = router;
