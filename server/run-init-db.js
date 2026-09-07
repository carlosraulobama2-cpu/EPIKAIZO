require('dotenv').config();
const { initDb, getDb } = require('./src/config/database');

async function main() {
  console.log('🚀 Iniciando creación de tablas en Neon PostgreSQL...\n');

  try {
    await initDb();
    console.log('✅ initDb() completado con éxito.\n');

    // Verificar tablas creadas
    const pool = getDb();
    const result = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log(`📋 Tablas creadas (${result.rows.length} en total):`);
    result.rows.forEach(r => console.log(`   ✔ ${r.table_name}`));

    // Verificar datos semilla
    console.log('\n📊 Verificando datos iniciales:');

    const plans = await pool.query('SELECT id, name, price FROM plans ORDER BY price');
    console.log(`   ✔ Planes (${plans.rows.length}):`, plans.rows.map(p => `${p.name} (${p.price} XAF)`).join(', '));

    const tenants = await pool.query("SELECT id, name FROM tenants WHERE id = 'public'");
    console.log(`   ✔ Tenant público:`, tenants.rows.length ? '✅ Creado' : '❌ No encontrado');

    const admin = await pool.query("SELECT id, name, email, role FROM users WHERE email = 'admin@epikaizo.com'");
    if (admin.rows.length) {
      const u = admin.rows[0];
      console.log(`   ✔ Usuario admin: ${u.name} <${u.email}> (rol: ${u.role})`);
    }

    console.log('\n🎉 ¡Base de datos lista para usar!');
    console.log('   Usuario: admin@epikaizo.com');
    console.log('   Contraseña: admin123');

    await pool.end();
  } catch (err) {
    console.error('❌ Error durante initDb():', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
