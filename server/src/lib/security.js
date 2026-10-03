// Cabeceras de seguridad, límites de peticiones y cookies de sesión.
const config = require('../config');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "font-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ')
  );
  if (config.isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

/**
 * Límite de peticiones en memoria por clave (IP por defecto). Suficiente para una sola instancia;
 * con varias instancias habría que moverlo a Redis.
 */
function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'Demasiadas peticiones. Inténtalo en unos minutos.' }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, Math.min(windowMs, 60_000));
  timer.unref();
  const limiter = (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
  limiter.reset = () => hits.clear();
  return limiter;
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[name] = part.slice(i + 1).trim();
    }
  }
  return out;
}

const SESSION_COOKIE = 'epk_session';

function setSessionCookie(res, token) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${config.sessionHours * 3600}`,
  ];
  if (config.isProduction) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${config.isProduction ? '; Secure' : ''}`);
}

/**
 * Protección CSRF: la sesión va en una cookie SameSite=Strict y, además, toda escritura en la API
 * debe ser JSON (un formulario de otra web no puede enviar JSON sin permiso CORS) y, si el
 * navegador manda Origin, debe ser el nuestro.
 */
function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === host;
    } catch {
      sameHost = false;
    }
    if (!sameHost && !config.allowedOrigins.includes(origin)) {
      return res.status(403).json({ error: 'Origen no permitido' });
    }
  }
  const hasBody = Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding'];
  if (hasBody && !req.is('application/json')) {
    return res.status(415).json({ error: 'Envía los datos en formato JSON' });
  }
  next();
}

module.exports = { securityHeaders, rateLimit, parseCookies, setSessionCookie, clearSessionCookie, csrfGuard, SESSION_COOKIE };
