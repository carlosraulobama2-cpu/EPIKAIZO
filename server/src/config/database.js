const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, 'epikaizo.db');
let db = null;

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA journal_mode = WAL');
  db.run('CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, plan TEXT NOT NULL DEFAULT "free", settings TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT "user", status TEXT NOT NULL DEFAULT "active", last_login TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT "XAF", max_users INTEGER NOT NULL DEFAULT 1, max_packages INTEGER NOT NULL DEFAULT 100, max_storage_mb INTEGER NOT NULL DEFAULT 10, features TEXT, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS packages (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, status TEXT NOT NULL, sender_name TEXT NOT NULL, sender_phone TEXT NOT NULL, sender_doc TEXT NOT NULL, receiver_name TEXT NOT NULL, receiver_phone TEXT NOT NULL, destination TEXT NOT NULL, fee REAL NOT NULL, total REAL NOT NULL, type TEXT NOT NULL, date TEXT NOT NULL, created_at TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS cars (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, brand TEXT NOT NULL, model TEXT NOT NULL, year INTEGER NOT NULL, plate TEXT NOT NULL, price REAL NOT NULL, status TEXT NOT NULL, date TEXT NOT NULL, created_at TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, email TEXT, stage TEXT NOT NULL, channel TEXT NOT NULL, notes TEXT, date TEXT NOT NULL, created_at TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, status TEXT NOT NULL, due_date TEXT, assigned_to TEXT, date TEXT NOT NULL, created_at TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, client TEXT NOT NULL, phone TEXT NOT NULL, vehicle_type TEXT NOT NULL, budget REAL, notes TEXT, status TEXT NOT NULL, date TEXT NOT NULL, created_at TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, category TEXT NOT NULL, concept TEXT NOT NULL, amount REAL NOT NULL, type TEXT NOT NULL, date TEXT NOT NULL, created_at TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS employees (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, phone TEXT, email TEXT, status TEXT NOT NULL, date TEXT NOT NULL, created_at TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS providers (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, service TEXT NOT NULL, phone TEXT, email TEXT, notes TEXT, created_at TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL, date TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL, details TEXT, ip TEXT, date TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(tenant_id, key))');
  db.run('CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL UNIQUE, plan_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT "active", current_period_start TEXT NOT NULL, current_period_end TEXT NOT NULL, cancel_at_period_end INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT "pendiente", date TEXT NOT NULL, created_at TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, invoice_number TEXT NOT NULL, client_name TEXT NOT NULL, client_phone TEXT NOT NULL, client_email TEXT, amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT "XAF", status TEXT NOT NULL DEFAULT "draft", qr_path TEXT, pdf_url TEXT, verify_url TEXT NOT NULL, items TEXT, package_id TEXT, date TEXT NOT NULL, created_at TEXT NOT NULL)');
  saveDb();
  const result = db.exec('SELECT count(*) as c FROM plans');
  const planCount = result[0] && result[0].values && result[0].values[0] ? result[0].values[0][0] : 0;
  if (planCount === 0) {
    const now = new Date().toISOString();
    db.run('INSERT INTO plans (id, name, price, currency, max_users, max_packages, max_storage_mb, features, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', ['plan-free', 'Free', 0, 'XAF', 1, 100, 10, '{}', 1, now]);
    db.run('INSERT INTO plans (id, name, price, currency, max_users, max_packages, max_storage_mb, features, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', ['plan-pro', 'Pro', 15000, 'XAF', 5, 5000, 100, '{}', 1, now]);
    db.run('INSERT INTO plans (id, name, price, currency, max_users, max_packages, max_storage_mb, features, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', ['plan-enterprise', 'Enterprise', 50000, 'XAF', 50, 50000, 1000, '{}', 1, now]);
    saveDb();
  }
  const publicTenant = db.prepare('SELECT id FROM tenants WHERE id = ?').get('public');
  if (!publicTenant) {
    db.run('INSERT INTO tenants (id, name, slug, plan, settings, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
      ['public', 'Public', 'public', 'plan-free', '{}', now, now]);
    saveDb();
  }
  const adminUser = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@epikaizo.com');
  if (!adminUser) {
    const bcrypt = require('bcryptjs');
    const userId = 'USER-ADMIN-001';
    const now = new Date().toISOString();
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.run('INSERT INTO users (id, tenant_id, name, email, password, role, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [userId, 'public', 'Administrador', 'admin@epikaizo.com', hashedPassword, 'admin', 'active', now, now]);
    saveDb();
  }
  return db;
}

function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function rowToObject(columns, values) {
  if (!values || values.length === 0) return undefined;
  const obj = {};
  columns.forEach((col, i) => { obj[col] = values[i]; });
  return obj;
}

function prepare(sql) {
  const stmt = db.prepare(sql);
  const cols = stmt.getColumnNames();
  return {
    get(...params) {
      const row = stmt.get(params);
      return row ? rowToObject(cols, row) : undefined;
    },
    all(...params) {
      const rows = [];
      stmt.bind(params);
      while (stmt.step()) {
        const row = stmt.get();
        if (row) rows.push(rowToObject(cols, row));
      }
      stmt.reset();
      return rows;
    },
    run(...params) {
      return stmt.run(params);
    }
  };
}

module.exports = { initDb, getDb, saveDb, prepare };
