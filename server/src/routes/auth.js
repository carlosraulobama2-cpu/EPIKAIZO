const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prepare, saveDb, getDb } = require('../config/database');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'epikaizo-super-secret-key-2026';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, tenantId: user.tenant_id },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }
    const user = prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenant_id,
      },
    });
  } catch (err) {
    console.error('Error en /api/auth/login:', err);
    res.status(500).json({ error: 'Error al autenticar' });
  }
});

router.post('/register', (req, res) => {
  try {
    const { name, email, password, role, tenantId } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
    }
    const exists = prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) {
      return res.status(400).json({ error: 'Email ya existe' });
    }
    const hashed = bcrypt.hashSync(password, 10);
    const id = require('uuid').v4();
    const now = new Date().toISOString();
    const tId = tenantId || 'public';
    prepare(
      'INSERT INTO users (id, tenant_id, name, email, password, role, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(id, tId, name, email, hashed, role || 'user', 'active', now, now);
    saveDb();
    const token = signToken({ id, email, role: role || 'user', tenant_id: tId });
    res.status(201).json({
      token,
      user: { id, name, email, role: role || 'user', tenantId: tId },
    });
  } catch (err) {
    console.error('Error en /api/auth/register:', err);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

router.get('/me', (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return res.status(401).json({ error: 'Token requerido' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = prepare('SELECT id, name, email, role, tenant_id, status FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
});

module.exports = router;
