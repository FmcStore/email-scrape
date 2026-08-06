/**
 * 🌐 Web Dashboard — Emailnator
 *
 * Server HTTP (Express) yang menyediakan dashboard web dengan fitur yang sama
 * dengan bot Telegram:
 *   - Buat email baru
 *   - Cek inbox (daftar pesan + jumlah)
 *   - Baca isi pesan (Dari / Subjek / Waktu / Isi)
 *   - Deteksi & salin kode OTP/verifikasi
 *   - Ganti email aktif (multi-email)
 *   - Penyimpanan persisten (SQLite — src/storage.js)
 *
 * Dashboard bersifat publik (tanpa login/password) — dirancang untuk dipakai
 * banyak orang sekaligus sebagai layanan email sementara gratis.
 *
 * Web dashboard memakai SATU akun bersama (WEB_USER_ID = -1). Data emailnya
 * tersimpan di database SQLite yang sama dengan bot, tapi di bawah chat_id
 * khusus web sehingga tidak tercampur dengan data pengguna Telegram.
 */

const path = require('path');
const express = require('express');
const config = require('./config');
const Emailnator = require('./emailnator');
const store = require('./storage');
const { formatTime, detectCode } = require('./utils');

const WEB_USER_ID = -1;

const app = express();

// Railway/Cloudflare dkk memakai proxy — percayai X-Forwarded-For supaya
// rate limit per-IP bekerja per pengunjung, bukan satu IP proxy bersama.
app.set('trust proxy', 1);

// Security headers harus dipasang sebelum static/API middleware agar berlaku
// untuk response frontend maupun endpoint JSON.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.json());

// File statis dashboard (public/)
app.use(express.static(path.join(__dirname, '..', 'public')));

// ===================== API (publik, tanpa login) =====================

// Rate limit sederhana per IP untuk endpoint yang membuat resource baru
// (bisa disalahgunakan karena dashboard publik): maks 10 email per menit.
const createLimits = new Map();
const CREATE_MAX = 10;
const CREATE_WINDOW = 60 * 1000; // 1 menit

function rateLimitCreate(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = createLimits.get(ip);
  if (!rec || now > rec.resetAt) {
    createLimits.set(ip, { count: 1, resetAt: now + CREATE_WINDOW });
    return next();
  }
  rec.count += 1;
  if (rec.count > CREATE_MAX) {
    return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' });
  }
  next();
}

// Jaga agar Map tidak membengkak: buang entri basi secara berkala.
setInterval(() => {
  const cutoff = Date.now() - CREATE_WINDOW;
  for (const [ip, rec] of createLimits) {
    if (rec.resetAt < cutoff) createLimits.delete(ip);
  }
}, 5 * 60 * 1000).unref();

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

/** Data user web: email aktif + semua email tersimpan */
app.get('/api/me', (req, res) => {
  const u = store.getUser(WEB_USER_ID);
  res.json({ active: u.active, emails: u.list });
});

/** Buat email baru → otomatis jadi email aktif */
app.post('/api/emails', rateLimitCreate, async (req, res) => {
  try {
    const e = new Emailnator();
    const { email } = await e.create();
    store.setActive(WEB_USER_ID, email);
    const u = store.getUser(WEB_USER_ID);
    res.json({ email, active: u.active, emails: u.list });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/** Ganti email aktif */
app.post('/api/emails/switch', (req, res) => {
  const { email } = req.body || {};
  const u = store.getUser(WEB_USER_ID);
  if (!email || !u.list.includes(email)) {
    return res.status(400).json({ error: 'Email tidak ditemukan' });
  }
  store.setActive(WEB_USER_ID, email);
  res.json({ active: email, emails: u.list });
});

/** Inbox email aktif (atau ?email=...) */
app.get('/api/inbox', async (req, res) => {
  const user = store.getUser(WEB_USER_ID);
  const email = req.query.email || user.active;
  if (!email) {
    return res.status(400).json({ error: 'Belum ada email aktif. Buat email dulu ya 😊' });
  }
  // Jangan izinkan pengunjung web membaca inbox email di luar daftar tersimpan.
  if (!user.list.includes(email)) {
    return res.status(403).json({ error: 'Email tidak terdaftar di dashboard ini' });
  }
  try {
    const e = new Emailnator();
    const inbox = await e.getInbox(email);
    res.json({
      email,
      totalEmails: inbox.totalEmails,
      emails: inbox.emails.map((m) => ({
        id: m.id,
        from: m.from,
        subject: m.subject,
        time: formatTime(m.time),
        hasCode: !!detectCode(m.text),
      })),
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/** Baca detail satu pesan (deteksi kode OTP otomatis) */
// Pakai wildcard `*id` (Express 5) supaya ID yang memuat karakter khusus
// (titik, dash, plus, @, dsb.) tetap tertangkap sebagai satu parameter.
app.get('/api/messages/*id', async (req, res) => {
  const email = store.getUser(WEB_USER_ID).active;
  if (!email) {
    return res.status(400).json({ error: 'Belum ada email aktif.' });
  }
  // Message ID dari Emailnator bisa memuat titik/dash/karakter lain dan cukup
  // panjang, jadi jangan pakai whitelist ketat. ID diteruskan ke bridge Python
  // via execFileSync (tanpa shell) sehingga tidak ada risiko command injection;
  // cukup tolak ID kosong, terlalu panjang, atau mengandung karakter kontrol.
  const messageId = String(req.params.id || '');
  if (!messageId || messageId.length > 512 || /[\u0000-\u001f\u007f]/.test(messageId)) {
    return res.status(400).json({ error: 'ID pesan tidak valid' });
  }
  try {
    const e = new Emailnator();
    const m = await e.getMessage(email, messageId);
    res.json({
      id: m.id,
      from: m.from,
      subject: m.subject,
      time: formatTime(m.time) || m.time,
      text: m.text,
      code: detectCode(m.text),
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ===================== START =====================

/**
 * Jalankan server web. Dipanggil dari bot.js (npm start) supaya web dashboard
 * dan bot Telegram jalan bersamaan.
 */
function start(port) {
  const p = port ?? config.web.port;
  return new Promise((resolve, reject) => {
    const server = app.listen(p, () => {
      console.log(`🌐 Web dashboard: http://localhost:${server.address().port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

module.exports = { app, start, WEB_USER_ID };
