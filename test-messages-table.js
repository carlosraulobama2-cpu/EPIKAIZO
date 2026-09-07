const { initDb, prepare } = require('./server/src/config/database');

async function check() {
  await initDb();
  try {
    const result = prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'").all();
    console.log('Messages table exists:', JSON.stringify(result));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

check();
