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
 * Auth: password tunggal (config.web.password / env WEB_PASSWORD).
 * Session disimpan in-memory, cookie HttpOnly bertahan 7 hari.
 *
 * Web dashboard memakai SATU akun bersama (WEB_USER_ID = -1). Data emailnya
 * tersimpan di database SQLite yang sama dengan bot, tapi di bawah chat_id
 * khusus web sehingga tidak tercampur dengan data pengguna Telegram.
 */

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const config = require('./config');
const Emailnator = require('./emailnator');
const store = require('./storage');
const { formatTime, detectCode } = require('./utils');

const WEB_USER_ID = -1;

const app = express();

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

// Session token → waktu dibuat (in-memory). Token kedaluwarsa setelah 7 hari.
const sessions = new Map();
const SESSION_COOKIE = 'eweb';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 hari

function getCookieToken(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

/** Bandingkan password secara timing-safe */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Bersihkan session yang sudah kedaluwarsa (dipanggil saat login) */
function pruneSessions() {
  const cutoff = Date.now() - SESSION_MAX_AGE;
  for (const [token, createdAt] of sessions) {
    if (createdAt < cutoff) sessions.delete(token);
  }
}

// Rate limit login sederhana: maks 10 percobaan per 5 menit per IP
const loginAttempts = new Map();
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW = 5 * 60 * 1000;

function rateLimitLogin(req, res, next) {
  if (loginAttempts.size > 500) {
    // jaga agar Map tidak membengkak: buang entri basi
    const cutoff = Date.now() - LOGIN_WINDOW;
    for (const [ip, rec] of loginAttempts) {
      if (rec.resetAt < cutoff) loginAttempts.delete(ip);
    }
  }
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now > rec.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW });
    return next();
  }
  rec.count += 1;
  if (rec.count > LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi nanti.' });
  }
  next();
}

// ===================== AUTH MIDDLEWARE =====================

app.use('/api', (req, res, next) => {
  if (req.path === '/login' || req.path === '/health') return next();
  const token = getCookieToken(req);
  const createdAt = token ? sessions.get(token) : undefined;
  if (createdAt === undefined) {
    return res.status(401).json({ error: 'Sesi berakhir, silakan login ulang' });
  }
  if (Date.now() - createdAt > SESSION_MAX_AGE) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Sesi kedaluwarsa, silakan login ulang' });
  }
  req.token = token;
  next();
});

// ===================== API =====================

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/login', rateLimitLogin, (req, res) => {
  if (process.env.NODE_ENV === 'production' && config.web.usingDefaultPassword) {
    return res.status(503).json({
      error: 'WEB_PASSWORD wajib diset sebelum dashboard production digunakan',
    });
  }
  const { password } = req.body || {};
  if (!safeEqual(password, config.web.password)) {
    return res.status(401).json({ error: 'Password salah' });
  }
  pruneSessions();
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now());
  const secure = req.secure || req.get('X-Forwarded-Proto') === 'https';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE / 1000}; SameSite=Lax${secure ? '; Secure' : ''}`
  );
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  if (req.token) sessions.delete(req.token);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  res.json({ ok: true });
});

/** Data user web: email aktif + semua email tersimpan */
app.get('/api/me', (req, res) => {
  const u = store.getUser(WEB_USER_ID);
  res.json({ active: u.active, emails: u.list });
});

/** Buat email baru → otomatis jadi email aktif */
app.post('/api/emails', async (req, res) => {
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
  // Jangan izinkan session web membaca inbox arbitrary email di luar daftar.
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
      if (config.web.usingDefaultPassword) {
        console.warn(
          '   ⚠️  Password default "admin123" dipakai! Set env WEB_PASSWORD untuk ganti.'
        );
      }
      resolve(server);
    });
    server.on('error', reject);
  });
}

module.exports = { app, start, WEB_USER_ID };
