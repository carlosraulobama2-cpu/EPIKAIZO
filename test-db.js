const sql = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join('server/data/epikaizo.db');
const buffer = fs.readFileSync(dbPath);
const db = new sql.Database(buffer);
const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'");
console.log('stmt.all type:', typeof stmt.all);
console.log('stmt.get type:', typeof stmt.get);
console.log('stmt.run type:', typeof stmt.run);
const rows = stmt.all();
console.log('Messages table:', JSON.stringify(rows));
db.close();
