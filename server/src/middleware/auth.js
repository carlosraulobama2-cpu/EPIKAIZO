const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'epikaizo-super-secret-key-2026';

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Acceso Denegado: token requerido' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Acceso Denegado: token inválido o expirado' });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  } catch (err) {
    // no bloqueamos si el token es inválido en modo opcional
  }
  next();
}

module.exports = {
  authenticate,
  optionalAuth,
};
