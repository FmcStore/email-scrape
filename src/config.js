/**
 * Emailnator Bot — Configuration
 *
 * Token bot dibaca dari environment variable TELEGRAM_BOT_TOKEN.
 * Jangan pernah menaruh token asli langsung di source code atau GitHub.
 */

const path = require('path');

const config = {
  // Token bot Telegram — dapat dari @BotFather.
  // Wajib diset sebagai env var untuk mengaktifkan bot; tanpa token, web-only mode.
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',

  // 💾 Penyimpanan persisten (SQLite) — daftar email tidak hilang saat restart
  //   - Railway:  set DATA_DIR=/data (volume) → DB disimpan di volume
  //   - Lokal:    default ./data/ di folder project
  storage: {
    dir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
    file: 'emailnator.db',
  },

  // Opsi polling Telegram (optional)
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 30,
    },
  },

  // Opsi HTTP client Emailnator
  emailnator: {
    baseURL: 'https://www.emailnator.com',
    timeout: 30000,
    userAgent:
      'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',
  },

  // 🌐 Web dashboard (src/web.js)
  //   - Password default 'admin123' — WAJIB ganti via env WEB_PASSWORD di production!
  //   - Port: env PORT otomatis diset Railway; lokal default 3000
  web: {
    port: Number(process.env.PORT) || 3000,
    password: process.env.WEB_PASSWORD || 'admin123',
    usingDefaultPassword: !process.env.WEB_PASSWORD,
  },

  // Format pesan
  messages: {
    noEmail: 'Kamu belum punya email! Ketik /new buat bikin dulu ya 😊',
    emptyInbox: '📭 Inbox kosong, belum ada email masuk.',
    creating: '⏳ Lagi bikin email baru...',
    checking: (email) => `⏳ Lagi cek inbox ${email}...`,
    reading: '⏳ Lagi baca pesan...',
    error: (msg) => `❌ Gagal: ${msg}`,
    maxContentLength: 3500,
  },
};

module.exports = config;
