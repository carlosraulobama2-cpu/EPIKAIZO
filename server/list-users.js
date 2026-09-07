const { initDb, getDb } = require('./src/config/database');

async function test() {
  await initDb();
  const db = getDb();
  const rows = db.exec('SELECT email FROM users');
  console.log('Users:', JSON.stringify(rows));
}

test().catch(e => console.error(e));
