// Inicio y cierre de sesión. No hay registro público: las cuentas las crea un administrador.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const config = require('../config');
const db = require('../db');
const totp = require('../lib/totp');
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
  office_id: u.office_id || null,
  totp_enabled: Boolean(u.totp_enabled),
});

// Permiso provisional tras la contraseña: solo sirve para mandar el código de 6 cifras (5 min).
const challengeFor = (user) => jwt.sign({ sub: user.id, v: user.token_version, purpose: '2fa' }, config.jwtSecret, { expiresIn: '5m', issuer: 'epikaizo' });

async function startSession(req, res, user, action = 'auth.login') {
  await db.query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
  setSessionCookie(res, signSession(user));
  await audit({ ...req, user, tenantId: user.tenant_id }, action, { entity: 'user', entityId: user.id });
  res.json({ user: publicUser(user) });
}

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

    // Con doble verificación, la contraseña no basta: se pide el código de la app.
    if (user.totp_enabled) return res.json({ two_factor: true, challenge: challengeFor(user) });
    await startSession(req, res, user);
  })
);

// Segundo paso del acceso: el código de 6 cifras de la app o un código de recuperación.
router.post(
  '/2fa/verify',
  loginLimiter,
  route(async (req, res) => {
    const input = validate(req.body, { challenge: text({ min: 10, max: 2000 }), code: text({ min: 6, max: 20 }) });
    let payload;
    try {
      payload = jwt.verify(input.challenge, config.jwtSecret, { issuer: 'epikaizo' });
    } catch {
      throw new HttpError(401, 'Ha pasado demasiado tiempo. Vuelve a escribir tu contraseña.');
    }
    if (payload.purpose !== '2fa') throw new HttpError(401, 'Vuelve a escribir tu contraseña.');
    const user = await db.one('SELECT * FROM users WHERE id = $1', [payload.sub]);
    if (!user || user.status !== 'activo' || user.token_version !== payload.v || !user.totp_enabled) throw new HttpError(401, 'Vuelve a escribir tu contraseña.');
    const code = input.code.trim();
    if (/^\d{3}\s?\d{3}$/.test(code)) {
      if (!totp.verify(user.totp_secret, code)) throw new HttpError(401, 'El código no es correcto. Comprueba la hora del móvil y vuelve a probar.');
      return startSession(req, res, user);
    }
    // Código de recuperación: vale una sola vez.
    const hash = totp.hashRecovery(code);
    const left = (user.totp_recovery || []).filter((h) => h !== hash);
    if (left.length === (user.totp_recovery || []).length) throw new HttpError(401, 'Ese código de recuperación no es válido o ya se usó.');
    await db.query('UPDATE users SET totp_recovery = $2 WHERE id = $1', [user.id, JSON.stringify(left)]);
    await startSession(req, res, user, 'auth.login_recuperacion');
  })
);

// Activar la doble verificación: 1) setup da el QR; 2) enable confirma con un código de la app.
router.post(
  '/2fa/setup',
  authenticate,
  route(async (req, res) => {
    if (req.user.totp_enabled) throw new HttpError(409, 'La doble verificación ya está activada');
    const secret = totp.newSecret();
    await db.query('UPDATE users SET totp_pending = $2 WHERE id = $1', [req.user.id, secret]);
    const url = totp.otpauthUrl(secret, req.user.email);
    res.json({ secret, otpauth: url, qr: await QRCode.toDataURL(url, { width: 220, margin: 1 }) });
  })
);

router.post(
  '/2fa/enable',
  authenticate,
  route(async (req, res) => {
    const input = validate(req.body, { code: text({ min: 6, max: 7 }) });
    const user = await db.one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user.totp_pending) throw new HttpError(409, 'Empieza de nuevo: pulsa «Activar» para ver el código QR');
    if (!totp.verify(user.totp_pending, input.code)) throw new HttpError(422, 'El código no es correcto. Escribe el que muestra ahora la app.', { code: 'no es correcto' });
    const codes = totp.recoveryCodes();
    await db.query(
      'UPDATE users SET totp_secret = totp_pending, totp_pending = NULL, totp_enabled = true, totp_recovery = $2, updated_at = now() WHERE id = $1',
      [user.id, JSON.stringify(codes.map(totp.hashRecovery))]
    );
    await audit(req, 'auth.2fa_activar', { entity: 'user', entityId: user.id });
    // Los códigos de recuperación se muestran una sola vez.
    res.json({ enabled: true, recovery_codes: codes });
  })
);

router.post(
  '/2fa/disable',
  authenticate,
  route(async (req, res) => {
    const input = validate(req.body, { password: text({ min: 1, max: 200 }), code: text({ min: 6, max: 20 }) });
    const user = await db.one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user.totp_enabled) throw new HttpError(409, 'La doble verificación no está activada');
    if (!(await bcrypt.compare(input.password, user.password_hash))) throw new HttpError(400, 'La contraseña no es correcta');
    if (!totp.verify(user.totp_secret, input.code)) throw new HttpError(400, 'El código no es correcto');
    await db.query("UPDATE users SET totp_enabled = false, totp_secret = NULL, totp_pending = NULL, totp_recovery = '[]'::jsonb, updated_at = now() WHERE id = $1", [user.id]);
    await audit(req, 'auth.2fa_desactivar', { entity: 'user', entityId: user.id });
    res.json({ enabled: false });
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
