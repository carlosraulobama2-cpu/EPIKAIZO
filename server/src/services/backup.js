// Copias de seguridad: todos los datos de la empresa en un JSON comprimido (.json.gz), subido a
// Google Drive una vez al día y cuando un administrador lo pide. Cada intento queda registrado en
// la tabla backups: si falla, el panel avisa a los administradores.
const crypto = require('crypto');
const zlib = require('zlib');
const { Readable } = require('stream');
const db = require('../db');
const { today } = require('../lib/dates');

// Tablas que se copian. Las fotos de vehículos van solo como lista (sus imágenes se suben de nuevo).
const EXPORT_TABLES = [
  'offices', 'clients', 'shipments', 'shipment_events', 'trips', 'jobs', 'job_costs', 'messages',
  'invoices', 'invoice_payments', 'vehicles', 'vehicle_photos', 'cash_movements', 'cash_sessions',
  'materials', 'stock_movements', 'employees', 'providers', 'settings',
];

async function exportData(tenantId) {
  const data = {};
  for (const table of EXPORT_TABLES) {
    if (table === 'shipment_events') data[table] = await db.many('SELECT e.* FROM shipment_events e JOIN shipments s ON s.id = e.shipment_id WHERE s.tenant_id = $1', [tenantId]);
    else if (table === 'vehicle_photos') data[table] = await db.many('SELECT id, vehicle_id, mime, size, position, created_at FROM vehicle_photos WHERE tenant_id = $1', [tenantId]);
    else if (table === 'invoice_payments') data[table] = await db.many('SELECT p.* FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.tenant_id = $1', [tenantId]);
    else data[table] = await db.many(`SELECT * FROM ${table} WHERE tenant_id = $1`, [tenantId]);
  }
  return { exported_at: new Date().toISOString(), version: 3, tenant: tenantId, data };
}

// ---------- Destino: Google Drive ----------
const driveConfig = () => {
  const env = process.env;
  return {
    clientId: env.GDRIVE_CLIENT_ID || env.GMAIL_CLIENT_ID || '',
    clientSecret: env.GDRIVE_CLIENT_SECRET || env.GMAIL_CLIENT_SECRET || '',
    refreshToken: env.GDRIVE_REFRESH_TOKEN || '',
    folderId: env.GDRIVE_FOLDER_ID || '',
  };
};
const driveConfigured = () => {
  const c = driveConfig();
  return Boolean(c.clientId && c.clientSecret && c.refreshToken);
};

async function uploadToDrive(name, buffer) {
  const c = driveConfig();
  const { google } = require('googleapis');
  const auth = new google.auth.OAuth2(c.clientId, c.clientSecret);
  auth.setCredentials({ refresh_token: c.refreshToken });
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.create({
    requestBody: { name, ...(c.folderId ? { parents: [c.folderId] } : {}) },
    media: { mimeType: 'application/gzip', body: Readable.from(buffer) },
    fields: 'id',
  });
  return { destination: 'Google Drive', fileId: res.data.id };
}

// Las pruebas cambian el destino por uno falso.
let uploader = null;
const setUploader = (fn) => { uploader = fn; };
const configured = () => Boolean(uploader) || driveConfigured();

/** Hace una copia ahora. Devuelve la fila de backups (ok o error); nunca lanza. */
async function runBackup(tenantId, { trigger = 'manual', userId = null } = {}) {
  const row = await db.one(
    "INSERT INTO backups (id, tenant_id, trigger, status, created_by) VALUES ($1, $2, $3, 'running', $4) RETURNING *",
    [crypto.randomUUID(), tenantId, trigger, userId]
  );
  try {
    if (!configured()) throw new Error('Google Drive no está configurado (GDRIVE_REFRESH_TOKEN en Render)');
    const json = Buffer.from(JSON.stringify(await exportData(tenantId)));
    const gz = zlib.gzipSync(json, { level: 9 });
    const name = `epikaizo-copia-${today()}-${new Date().toISOString().slice(11, 16).replace(':', '')}.json.gz`;
    const result = await (uploader || uploadToDrive)(name, gz);
    return await db.one(
      "UPDATE backups SET status = 'ok', destination = $2, file_name = $3, file_id = $4, size_bytes = $5, finished_at = now() WHERE id = $1 RETURNING *",
      [row.id, result.destination, name, result.fileId || null, gz.length]
    );
  } catch (err) {
    return db.one("UPDATE backups SET status = 'error', error = $2, finished_at = now() WHERE id = $1 RETURNING *", [row.id, String(err.message).slice(0, 500)]);
  }
}

/** Copia diaria: si hay destino y la última buena tiene más de 24 h (y no hay otra en marcha). */
async function maybeDailyBackup(tenantId) {
  if (!configured()) return null;
  const recent = await db.one(
    `SELECT
       (SELECT max(started_at) FROM backups WHERE tenant_id = $1 AND status = 'ok') AS last_ok,
       (SELECT count(*)::int FROM backups WHERE tenant_id = $1 AND status = 'running' AND started_at > now() - interval '30 minutes') AS running,
       (SELECT count(*)::int FROM backups WHERE tenant_id = $1 AND trigger = 'auto' AND status = 'error' AND started_at > now() - interval '1 hour') AS failed_recently`,
    [tenantId]
  );
  if (recent.running || recent.failed_recently) return null;
  if (recent.last_ok && Date.now() - new Date(recent.last_ok).getTime() < 24 * 3600_000) return null;
  return runBackup(tenantId, { trigger: 'auto' });
}

/** Estado para el panel: ¿hay que avisar? (última buena hace más de 48 h, o el último intento falló). */
async function backupStatus(tenantId) {
  const [last, lastOk] = await Promise.all([
    db.one('SELECT * FROM backups WHERE tenant_id = $1 ORDER BY started_at DESC LIMIT 1', [tenantId]),
    db.one("SELECT * FROM backups WHERE tenant_id = $1 AND status = 'ok' ORDER BY started_at DESC LIMIT 1", [tenantId]),
  ]);
  const stale = !lastOk || Date.now() - new Date(lastOk.started_at).getTime() > 48 * 3600_000;
  return { configured: configured(), last, last_ok: lastOk, warning: configured() && (stale || (last && last.status === 'error')) };
}

module.exports = { exportData, runBackup, maybeDailyBackup, backupStatus, setUploader, driveConfigured, EXPORT_TABLES };
