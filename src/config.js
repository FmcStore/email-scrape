/**
 * Emailnator — Configuration
 *
 * Semua nilai bisa dioverride via environment variable.
 */

const path = require('path');

const config = {
  // 💾 Penyimpanan persisten (SQLite) — daftar email tidak hilang saat restart
  //   - Railway:  set DATA_DIR=/data (volume) → DB disimpan di volume
  //   - Lokal:    default ./data/ di folder project
  storage: {
    dir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
    file: 'emailnator.db',
  },

  // Opsi HTTP client Emailnator
  emailnator: {
    baseURL: 'https://www.emailnator.com',
    timeout: 30000,
    userAgent:
      'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',
  },

  // 🌐 Web server & REST API (src/web.js)
  //   - Dashboard publik (tanpa login/password)
  //   - Port: env PORT otomatis diset Railway; lokal default 3000
  web: {
    port: Number(process.env.PORT) || 3000,
  },
};

module.exports = config;
