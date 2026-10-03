// Utilidades HTTP: errores con código, rutas async sin try/catch repetido y validación de entrada.

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Envuelve una ruta async: cualquier error llega al manejador central, nunca tumba el proceso. */
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- Validación -----------------------------------------------------------------------------
// Cada campo es una función (valor) => valor limpio, o lanza un mensaje en español.

const clean = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim() : v);
const empty = (v) => v === undefined || v === null || v === '';

function text({ min = 1, max = 200, optional = false } = {}) {
  return (v) => {
    v = clean(v);
    if (empty(v)) {
      if (optional) return null;
      throw 'es obligatorio';
    }
    if (typeof v !== 'string' && typeof v !== 'number') throw 'debe ser texto';
    v = String(v);
    if (v.length < min) throw `debe tener al menos ${min} caracteres`;
    if (v.length > max) throw `no puede superar ${max} caracteres`;
    return v;
  };
}

function phone({ optional = false } = {}) {
  return (v) => {
    v = clean(v);
    if (empty(v)) {
      if (optional) return null;
      throw 'es obligatorio';
    }
    const normalized = String(v).replace(/[^\d+]/g, '');
    if (!/^\+?\d{6,15}$/.test(normalized)) throw 'no es un teléfono válido';
    return normalized;
  };
}

function email({ optional = false } = {}) {
  return (v) => {
    v = clean(v);
    if (empty(v)) {
      if (optional) return null;
      throw 'es obligatorio';
    }
    v = String(v).toLowerCase();
    if (v.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw 'no es un correo válido';
    return v;
  };
}

function number({ min = 0, max = 1e12, optional = false } = {}) {
  return (v) => {
    if (empty(v)) {
      if (optional) return null;
      throw 'es obligatorio';
    }
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n)) throw 'debe ser un número';
    if (n < min) throw `debe ser como mínimo ${min}`;
    if (n > max) throw `debe ser como máximo ${max}`;
    return Math.round(n * 100) / 100;
  };
}

function oneOf(values, { optional = false } = {}) {
  return (v) => {
    v = clean(v);
    if (empty(v)) {
      if (optional) return null;
      throw 'es obligatorio';
    }
    if (!values.includes(v)) throw `debe ser uno de: ${values.join(', ')}`;
    return v;
  };
}

function bool({ optional = false } = {}) {
  return (v) => {
    if (empty(v)) {
      if (optional) return null;
      return false;
    }
    return v === true || v === 'true' || v === 1 || v === '1' || v === 'on';
  };
}

function date({ optional = false } = {}) {
  return (v) => {
    v = clean(v);
    if (empty(v)) {
      if (optional) return null;
      throw 'es obligatoria';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw 'debe ser una fecha AAAA-MM-DD';
    return v;
  };
}

function uuid({ optional = false } = {}) {
  return (v) => {
    v = clean(v);
    if (empty(v)) {
      if (optional) return null;
      throw 'es obligatorio';
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw 'no es un identificador válido';
    return v;
  };
}

const LABELS = {};

/**
 * Valida body contra schema. Con partial=true (PUT) solo valida los campos presentes.
 * Devuelve un objeto con solo las claves del schema: nunca pasa a SQL un campo inesperado.
 */
function validate(body, schema, { partial = false } = {}) {
  const input = body && typeof body === 'object' ? body : {};
  const out = {};
  const errors = {};
  for (const [key, check] of Object.entries(schema)) {
    if (partial && !(key in input)) continue;
    try {
      out[key] = check(input[key]);
    } catch (message) {
      if (typeof message !== 'string') throw message;
      errors[key] = message;
    }
  }
  if (Object.keys(errors).length) {
    const [field, message] = Object.entries(errors)[0];
    throw new HttpError(422, `${LABELS[field] || field} ${message}`, errors);
  }
  return out;
}

/** Paginación estándar: ?page=1&limit=25 (máximo 100). */
function paging(query) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { limit, offset: (page - 1) * limit, page };
}

module.exports = { HttpError, route, validate, paging, text, phone, email, number, oneOf, bool, date, uuid, LABELS };
