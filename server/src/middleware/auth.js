// Sesión y permisos. La empresa (tenant) y el rol salen SIEMPRE del usuario en la base de datos,
// nunca de una cabecera o del cuerpo de la petición.
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { parseCookies, SESSION_COOKIE } = require('../lib/security');

// Qué puede hacer cada rol. admin > gestor > operador.
const ROLE_RANK = { operador: 1, gestor: 2, admin: 3 };

function signSession(user) {
  return jwt.sign({ sub: user.id, v: user.token_version }, config.jwtSecret, {
    expiresIn: `${config.sessionHours}h`,
    issuer: 'epikaizo',
  });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return parseCookies(req)[SESSION_COOKIE] || '';
}

async function authenticate(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar' });
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { issuer: 'epikaizo' });
    } catch {
      return res.status(401).json({ error: 'Tu sesión ha caducado. Vuelve a iniciar sesión' });
    }
    const user = await db.one(
      'SELECT id, tenant_id, name, email, role, status, token_version, must_change_password FROM users WHERE id = $1',
      [payload.sub]
    );
    // token_version permite cerrar todas las sesiones de un usuario (cambio de contraseña, bloqueo).
    if (!user || user.status !== 'activo' || user.token_version !== payload.v) {
      return res.status(401).json({ error: 'Tu sesión ya no es válida. Vuelve a iniciar sesión' });
    }
    req.user = user;
    req.tenantId = user.tenant_id;
    next();
  } catch (err) {
    next(err);
  }
}

/** requireRole('gestor') deja pasar a gestor y admin. */
function requireRole(minimum) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Inicia sesión para continuar' });
    if ((ROLE_RANK[req.user.role] || 0) < ROLE_RANK[minimum]) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, signSession, ROLE_RANK };
