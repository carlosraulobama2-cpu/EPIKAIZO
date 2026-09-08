function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Acceso Denegado: token requerido' });
  }
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'epikaizo-super-secret-key-2026');
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso Denegado: se requiere rol administrador' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Acceso Denegado: token inválido o expirado' });
  }
}

module.exports = { requireAdmin };
