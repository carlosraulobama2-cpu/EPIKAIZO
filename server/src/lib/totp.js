// Códigos de un solo uso por tiempo (TOTP, RFC 6238), compatibles con Google Authenticator,
// Microsoft Authenticator, Authy… Secreto en base32, código de 6 cifras cada 30 segundos.
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

const newSecret = () => base32Encode(crypto.randomBytes(20));

/** Código de 6 cifras para un instante (por defecto, ahora). */
function codeAt(secret, time = Date.now(), step = 30) {
  const counter = Math.floor(time / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const bin = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/** ¿Es válido el código? Acepta el intervalo anterior y el siguiente (relojes desajustados). */
function verify(secret, code, time = Date.now()) {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean) || !secret) return false;
  return [-1, 0, 1].some((w) => {
    const expected = codeAt(secret, time + w * 30_000);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean));
  });
}

/** Enlace otpauth:// que se convierte en QR para escanearlo con la app. */
const otpauthUrl = (secret, account, issuer = 'Epikaizo') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/** Códigos de recuperación legibles (8 grupos de 4+4) y su resumen para guardarlos. */
function recoveryCodes(n = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: n }, () => {
    const raw = Array.from(crypto.randomBytes(8), (b) => alphabet[b % alphabet.length]).join('');
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}
const hashRecovery = (code) => crypto.createHash('sha256').update(String(code).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

module.exports = { newSecret, codeAt, verify, otpauthUrl, recoveryCodes, hashRecovery, base32Encode, base32Decode };
