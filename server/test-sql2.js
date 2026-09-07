const initSqlJs = require('sql.js');

async function test() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE test (id INTEGER, name TEXT)');
  db.run('INSERT INTO test VALUES (1, "hello")');
  const stmt = db.prepare('SELECT * FROM test');
  console.log('Statement methods:', Object.keys(stmt));
  console.log('Statement prototype:', Object.getOwnPropertyNames(Object.getPrototypeOf(stmt)));
}

test().catch(e => console.error(e));
