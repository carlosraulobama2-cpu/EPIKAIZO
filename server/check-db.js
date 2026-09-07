const { initDb, getDb } = require('./src/config/database');

async function check() {
  await initDb();
  const db = getDb();
  const users = db.exec('SELECT id, email, name FROM users');
  console.log('Users in DB:');
  users.forEach(u => {
    u.values.forEach(v => console.log('  ', v));
  });
}

check().catch(e => console.error(e));
