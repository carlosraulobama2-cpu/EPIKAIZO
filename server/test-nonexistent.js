const { initDb, getDb } = require('./src/config/database');

async function test() {
  await initDb();
  const db = getDb();
  const stmt = db.prepare('SELECT id FROM users WHERE email = ?');
  const row = stmt.get('nonexistent@test.com');
  console.log('Row type:', typeof row);
  console.log('Row:', row);
  console.log('Row === undefined:', row === undefined);
  console.log('Row === null:', row === null);
  console.log('JSON:', JSON.stringify(row));
}

test().catch(e => console.error(e));
