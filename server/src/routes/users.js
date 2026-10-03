// Accesos al panel. Solo un administrador crea cuentas, cambia roles o bloquea.
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { route, validate, text, email, oneOf, HttpError } = require('../lib/http');
const { audit } = require('../services/audit');

const router = express.Router();
const ROLES = ['admin', 'gestor', 'operador'];
const COLUMNS = 'id, name, email, role, status, last_login_at, must_change_password, created_at';

/** Contraseña temporal legible: el usuario la cambia en su primer acceso. */
function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(12), (b) => alphabet[b % alphabet.length]).join('');
}

router.get('/', route(async (req, res) => {
  res.json({ items: await db.many(`SELECT ${COLUMNS} FROM users WHERE tenant_id = $1 ORDER BY created_at`, [req.tenantId]) });
}));

router.post(
  '/',
  route(async (req, res) => {
    const input = validate(req.body, { name: text({ min: 2, max: 120 }), email: email(), role: oneOf(ROLES) });
    const taken = await db.one('SELECT 1 FROM users WHERE lower(email) = $1', [input.email]);
    if (taken) throw new HttpError(409, 'Ya existe una cuenta con ese correo');
    const password = temporaryPassword();
    const user = await db.one(
      `INSERT INTO users (id, tenant_id, name, email, password_hash, role, must_change_password) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING ${COLUMNS}`,
      [crypto.randomUUID(), req.tenantId, input.name, input.email, await bcrypt.hash(password, 12), input.role]
    );
    await audit(req, 'usuario.crear', { entity: 'user', entityId: user.id, details: { email: user.email, rol: user.role } });
    // La contraseña temporal se muestra una sola vez a quien crea la cuenta; no se guarda en claro.
    res.status(201).json({ item: user, temporary_password: password });
  })
);

async function guardLastAdmin(req, target, change) {
  if (target.role !== 'admin') return;
  if ((change.role && change.role !== 'admin') || change.status === 'bloqueado') {
    const admins = await db.one("SELECT count(*)::int AS n FROM users WHERE tenant_id = $1 AND role = 'admin' AND status = 'activo'", [req.tenantId]);
    if (admins.n <= 1) throw new HttpError(409, 'Tiene que quedar al menos un administrador activo');
  }
}

router.patch(
  '/:id',
  route(async (req, res) => {
    const input = validate(req.body, { name: text({ min: 2, max: 120 }), role: oneOf(ROLES), status: oneOf(['activo', 'bloqueado']) }, { partial: true });
    const target = await db.one('SELECT * FROM users WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    if (!target) throw new HttpError(404, 'Usuario no encontrado');
    if (target.id === req.user.id && (input.role || input.status)) throw new HttpError(409, 'No puedes cambiar tu propio rol ni bloquearte');
    await guardLastAdmin(req, target, input);
    const keys = Object.keys(input);
    if (!keys.length) throw new HttpError(422, 'No hay cambios que guardar');
    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    // Cambiar rol o bloquear cierra sus sesiones abiertas.
    if (input.role || input.status) sets.push('token_version = token_version + 1');
    const user = await db.one(`UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`, [target.id, ...keys.map((k) => input[k])]);
    await audit(req, 'usuario.editar', { entity: 'user', entityId: user.id, details: input });
    res.json({ item: user });
  })
);

router.post(
  '/:id/reset-password',
  route(async (req, res) => {
    const target = await db.one('SELECT id, email FROM users WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    if (!target) throw new HttpError(404, 'Usuario no encontrado');
    const password = temporaryPassword();
    await db.query(
      'UPDATE users SET password_hash = $2, must_change_password = true, failed_logins = 0, locked_until = NULL, token_version = token_version + 1, updated_at = now() WHERE id = $1',
      [target.id, await bcrypt.hash(password, 12)]
    );
    await audit(req, 'usuario.restablecer_contrasena', { entity: 'user', entityId: target.id });
    res.json({ temporary_password: password });
  })
);

module.exports = router;
