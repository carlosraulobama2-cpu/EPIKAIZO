// Configuración leída de variables de entorno. Nunca hay secretos escritos en el código:
// en producción, si falta uno obligatorio, el servidor no arranca.
const crypto = require('crypto');

const env = process.env;
const isProduction = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

function required(name) {
  const value = env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function jwtSecret() {
  if (env.JWT_SECRET) {
    if (isProduction && env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
    return env.JWT_SECRET;
  }
  if (isProduction) required('JWT_SECRET');
  // En desarrollo, un secreto aleatorio por arranque: las sesiones caducan al reiniciar.
  return crypto.randomBytes(48).toString('hex');
}

const config = {
  isProduction,
  isTest,
  port: Number(env.PORT) || 3001,
  databaseUrl: isProduction ? required('DATABASE_URL') : env.DATABASE_URL || 'postgresql://epk:epk@localhost:5432/epikaizo',
  // Neon y Render exigen SSL; en local no.
  databaseSsl: env.DATABASE_SSL ? env.DATABASE_SSL === 'true' : /sslmode=require|neon\.tech|render\.com/.test(env.DATABASE_URL || ''),
  jwtSecret: jwtSecret(),
  sessionHours: Number(env.SESSION_HOURS) || 12,
  publicUrl: (env.PUBLIC_URL || 'https://epikaizo.com').replace(/\/$/, ''),
  tenantId: env.TENANT_ID || 'epikaizo',
  allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
  admin: { email: env.ADMIN_EMAIL || '', password: env.ADMIN_PASSWORD || '', name: env.ADMIN_NAME || 'Administración' },
  whatsapp: {
    token: env.WHATSAPP_TOKEN || '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: env.WHATSAPP_APP_SECRET || '',
    apiVersion: env.WHATSAPP_API_VERSION || 'v19.0',
  },
  ai: { key: env.GOOGLE_AI_API_KEY || '', model: env.GOOGLE_AI_MODEL || 'gemini-2.0-flash-lite' },
  gmail: {
    clientId: env.GMAIL_CLIENT_ID || '',
    clientSecret: env.GMAIL_CLIENT_SECRET || '',
    refreshToken: env.GMAIL_REFRESH_TOKEN || '',
    user: env.GMAIL_USER || 'me',
  },
};

module.exports = config;
