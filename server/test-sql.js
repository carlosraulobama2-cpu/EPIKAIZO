const initSqlJs = require('sql.js');

async function test() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE test (id INTEGER, name TEXT)');
  db.run('INSERT INTO test VALUES (1, "hello")');
  const stmt = db.prepare('SELECT * FROM test');
  console.log('Type:', typeof stmt.columns);
  console.log('Columns:', stmt.columns());
  const row = stmt.get();
  console.log('Row:', row);
}

test().catch(e => console.error(e));
