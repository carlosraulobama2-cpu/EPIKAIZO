// Imágenes subidas como data URL (el navegador ya las reduce). El tipo se comprueba por los primeros
// bytes: no nos fiamos de lo que diga el navegador.
const { HttpError } = require('./http');

function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

/** data:image/...;base64,... → { buf, mime }. Lanza 413/422 si es grande o no es una imagen. */
function decodeImage(dataUrl, maxBytes = 1.5 * 1024 * 1024) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new HttpError(422, 'Envía la foto en formato JPEG, PNG o WebP');
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > maxBytes) throw new HttpError(413, `La foto es demasiado grande (máximo ${Math.round(maxBytes / 1024 / 102.4) / 10} MB)`);
  const mime = sniff(buf);
  if (!mime) throw new HttpError(422, 'El archivo no es una imagen válida');
  return { buf, mime };
}

module.exports = { sniff, decodeImage };
