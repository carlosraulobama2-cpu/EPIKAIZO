// Inicio y cierre de sesión. No hay registro público: las cuentas las crea un administrador.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { route, validate, text, email, HttpError } = require('../lib/http');
const { rateLimit, setSessionCookie, clearSessionCookie } = require('../lib/security');
const { authenticate, signSession } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
// Hash de relleno: si el correo no existe comparamos igual, para no delatar qué correos hay.
const DUMMY_HASH = bcrypt.hashSync('epikaizo-no-user', 10);

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  key: (req) => `${req.ip}:${String((req.body || {}).email || '').toLowerCase()}`,
  message: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.',
});

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  must_change_password: u.must_change_password,
});

router.post(
  '/login',
  loginLimiter,
  route(async (req, res) => {
    const input = validate(req.body, { email: email(), password: text({ min: 1, max: 200 }) });
    const user = await db.one('SELECT * FROM users WHERE lower(email) = $1', [input.email]);
    const ok = await bcrypt.compare(input.password, user ? user.password_hash : DUMMY_HASH);
    const invalid = new HttpError(401, 'Correo o contraseña incorrectos');

    if (!user) throw invalid;
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new HttpError(423, 'Cuenta bloqueada temporalmente por intentos fallidos. Inténtalo en 15 minutos.');
    }
    if (!ok) {
      const failed = user.failed_logins + 1;
      const lock = failed >= MAX_FAILED;
      await db.query(
        `UPDATE users SET failed_logins = $2, locked_until = CASE WHEN $3 THEN now() + interval '${LOCK_MINUTES} minutes' ELSE NULL END WHERE id = $1`,
        [user.id, lock ? 0 : failed, lock]
      );
      if (lock) {
        await audit({ ...req, user, tenantId: user.tenant_id }, 'auth.bloqueo', { entity: 'user', entityId: user.id });
      }
      throw invalid;
    }
    if (user.status !== 'activo') throw new HttpError(403, 'Tu cuenta está desactivada. Habla con el administrador.');

    await db.query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
    setSessionCookie(res, signSession(user));
    await audit({ ...req, user, tenantId: user.tenant_id }, 'auth.login', { entity: 'user', entityId: user.id });
    res.json({ user: publicUser(user) });
  })
);

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get(
  '/me',
  authenticate,
  route(async (req, res) => {
    const tenant = await db.one('SELECT id, name FROM tenants WHERE id = $1', [req.tenantId]);
    res.json({ user: publicUser(req.user), tenant });
  })
);

router.post(
  '/password',
  authenticate,
  route(async (req, res) => {
    const input = validate(req.body, { current: text({ max: 200 }), password: text({ min: 10, max: 200 }) });
    const user = await db.one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(input.current, user.password_hash))) throw new HttpError(400, 'La contraseña actual no es correcta');
    if (input.current === input.password) throw new HttpError(400, 'La nueva contraseña debe ser distinta');
    const hash = await bcrypt.hash(input.password, 12);
    // Subir token_version cierra las demás sesiones abiertas con la contraseña anterior.
    const updated = await db.one(
      'UPDATE users SET password_hash = $2, must_change_password = false, token_version = token_version + 1, updated_at = now() WHERE id = $1 RETURNING *',
      [user.id, hash]
    );
    setSessionCookie(res, signSession(updated));
    await audit(req, 'auth.cambio_contrasena', { entity: 'user', entityId: user.id });
    res.json({ user: publicUser(updated) });
  })
);

module.exports = router;
