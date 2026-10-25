/**
 * Emailnator — entry point server
 *
 * Menjalankan web dashboard + REST API (Express).
 * Lihat src/web.js untuk routing API dan public/ untuk frontend-nya.
 */

const { start: startWebServer } = require('./src/web');
const config = require('./src/config');

startWebServer()
  .then(() => {
    console.log('🌐 Emailnator web server is running...');
    console.log(`   → http://localhost:${config.web.port}`);
  })
  .catch((err) => {
    console.error('❌ Gagal start web server:', err.message);
    process.exit(1);
  });

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled rejection:', reason?.stack || reason);
});
