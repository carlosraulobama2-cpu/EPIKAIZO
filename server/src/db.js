// Acceso a Postgres: un pool, consultas con parámetros ($1, $2...) y migraciones SQL versionadas.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config');

// count(*) y sum() llegan como texto (bigint/numeric): los convertimos a número.
const types = require('pg').types;
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_MAX) || 10,
});

async function query(text, params = [], client = pool) {
  return client.query(text, params);
}
async function many(text, params, client) {
  return (await query(text, params, client)).rows;
}
async function one(text, params, client) {
  return (await query(text, params, client)).rows[0] || null;
}

/** Ejecuta fn dentro de una transacción; si algo falla, deshace todo. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Tablas de la versión anterior (fechas como TEXT, admin con contraseña por defecto).
// No se borran: si existen se renombran a legacy_* para conservar cualquier dato.
const LEGACY_TABLES = [
  'tenants', 'users', 'plans', 'subscriptions', 'packages', 'cars', 'leads', 'tasks', 'orders',
  'expenses', 'employees', 'providers', 'notifications', 'audit_log', 'settings', 'messages', 'invoices',
];

async function archiveLegacyTables(client) {
  const done = await client.query("SELECT 1 FROM schema_migrations WHERE name = '000_legacy_archive'");
  if (done.rowCount) return;
  for (const table of LEGACY_TABLES) {
    const legacy = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = $1 AND column_name IN ('created_at', 'date', 'updated_at') AND data_type = 'text'
        LIMIT 1`,
      [table]
    );
    if (!legacy.rowCount) continue;
    // Los índices (y las claves que dependen de ellos) conservan su nombre al renombrar la tabla;
    // los renombramos también para que las tablas nuevas puedan usar users_pkey, etc.
    const indexes = await client.query('SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = $1', [table]);
    for (const { indexname } of indexes.rows) {
      await client.query(`ALTER INDEX "${indexname}" RENAME TO "legacy_${indexname}"`);
    }
    await client.query(`ALTER TABLE ${table} RENAME TO legacy_${table}`);
  }
  await client.query("INSERT INTO schema_migrations (name) VALUES ('000_legacy_archive')");
}

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(424242)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    await archiveLegacyTables(client);
    const dir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
      if (applied.rowCount) continue;
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migración ${file} fallida: ${err.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(424242)').catch(() => {});
    client.release();
  }
}

module.exports = { pool, query, many, one, tx, migrate };
