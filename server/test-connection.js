const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_Xg1C2mAIxSDw@ep-holy-king-aejrbud6-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});

async function test() {
  const client = await pool.connect();
  try {
    const res1 = await client.query('SELECT NOW() as now, current_database() as db, version() as version');
    console.log('✅ Connected successfully!');
    console.log('   Time    :', res1.rows[0].now);
    console.log('   Database:', res1.rows[0].db);
    console.log('   Version :', res1.rows[0].version.split(' ').slice(0, 2).join(' '));

    const res2 = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    if (res2.rows.length === 0) {
      console.log('   Tables  : (none — database is empty)');
    } else {
      console.log('   Tables  :', res2.rows.map(r => r.table_name).join(', '));
    }

    // Row counts per table
    if (res2.rows.length > 0) {
      console.log('\n   Row counts:');
      for (const { table_name } of res2.rows) {
        const rc = await client.query(`SELECT COUNT(*) as c FROM "${table_name}"`);
        console.log(`     ${table_name}: ${rc.rows[0].c} rows`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

test().catch(err => {
  console.error('❌ Connection failed:', err.message);
  process.exit(1);
});
