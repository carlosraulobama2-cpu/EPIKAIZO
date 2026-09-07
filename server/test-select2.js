const { initDb, getDb } = require('./src/config/database');

async function test() {
  await initDb();
  const db = getDb();
  
  const stmt = db.prepare('SELECT * FROM users');
  const user = stmt.get();
  console.log('Type:', typeof user);
  console.log('Keys:', user ? Object.keys(user) : 'null');
  console.log('User:', JSON.stringify(user, null, 2));
}

test().catch(e => console.error(e));
