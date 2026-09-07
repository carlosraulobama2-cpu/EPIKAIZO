const { initDb, getDb, saveDb } = require('./src/config/database');

async function test() {
  await initDb();
  const db = getDb();
  
  console.log('Testing SELECT...');
  const rows = db.exec('SELECT * FROM users');
  console.log('Result:', JSON.stringify(rows, null, 2));
  
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  console.log('Columns:', stmt.columns());
  
  const user = stmt.get('test@test.com');
  console.log('User:', JSON.stringify(user, null, 2));
}

test().catch(e => console.error(e));
