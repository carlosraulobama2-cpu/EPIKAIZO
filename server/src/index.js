// ENV_FILE permite usar otro archivo de variables (por ejemplo en pruebas locales).
require('dotenv').config({ path: process.env.ENV_FILE || require('path').join(__dirname, '../.env') });

const config = require('./config');
const db = require('./db');
const { createApp } = require('./app');
const { bootstrap } = require('./bootstrap');
const { importCatalogs } = require('./services/catalog');

async function start() {
  await db.migrate();
  await bootstrap();
  // Vehículos de server/catalog/: se cargan una sola vez. CATALOG_IMPORT=off lo desactiva.
  // Un catálogo con errores no impide arrancar la web: se avisa en el log y no se carga.
  if (process.env.CATALOG_IMPORT !== 'off') {
    await importCatalogs(config.tenantId).catch((err) => console.error('[epikaizo] No se pudo cargar el catálogo:', err.message));
  }
  const server = createApp().listen(config.port, () => {
    console.log(`[epikaizo] Servidor en http://localhost:${config.port}`);
  });
  // Apagado limpio en cada despliegue de Render.
  const stop = () => server.close(() => db.pool.end().then(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

process.on('unhandledRejection', (err) => console.error('[epikaizo] Promesa sin controlar:', err));

start().catch((err) => {
  console.error('[epikaizo] No se pudo arrancar:', err.message);
  process.exit(1);
});
