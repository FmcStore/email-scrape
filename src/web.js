/**
 * 🌐 Web Dashboard & REST API — Emailnator
 *
 * Server HTTP (Express) yang menyediakan:
 *   - Web dashboard statis (public/) — publik, tanpa login/password
 *   - REST API: create email (single & bulk), inbox, read message,
 *     switch/delete email, health (lihat docs/api.md)
 *   - Deteksi & salin kode OTP/verifikasi
 *   - Penyimpanan persisten (SQLite — src/storage.js)
 *
 * Dashboard memakai SATU akun bersama (WEB_USER_ID = -1) — semua pengunjung
 * berbagi daftar email yang sama, tersimpan persisten di SQLite.
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const config = require('./config');
const Emailnator = require('./emailnator');
const store = require('./storage');
const { formatTime, detectCode, GENERIC_UPSTREAM_ERROR } = require('./utils');

const WEB_USER_ID = -1;

const app = express();

// Railway/Cloudflare dkk memakai proxy — percayai X-Forwarded-For supaya
// rate limit per-IP bekerja per pengunjung, bukan satu IP proxy bersama.
// Opt-in via env TRUST_PROXY=1 agar tidak bisa di-spoof saat berjalan langsung.
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// Security headers harus dipasang sebelum static/API middleware agar berlaku
// untuk response frontend maupun endpoint JSON.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'"
  );
  next();
});

app.use(express.json());

// File statis dashboard (public/)
app.use(express.static(path.join(__dirname, '..', 'public')));

// ===================== API DOCS =====================

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const DOCS_CSS = `body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:860px;margin:0 auto;padding:2rem 1.25rem;line-height:1.6;color:#e6e9ef;background:#0d1117}
a{color:#58a6ff}code{background:#161b22;padding:.15em .4em;border-radius:6px;font-family:ui-monospace,monospace;font-size:.92em}
pre{background:#161b22;padding:1rem;border-radius:10px;overflow-x:auto}pre code{background:none;padding:0}
h1,h2{border-bottom:1px solid #21262d;padding-bottom:.35rem}table{border-collapse:collapse;width:100%}th,td{border:1px solid #21262d;padding:.45rem .7rem;text-align:left}
th{background:#161b22}.muted{color:#8b949e}`;

/** Render docs/api.md (subset markdown: heading, code, table, list, bold) → HTML */
function renderApiDocs() {
  const md = fs.readFileSync(path.join(DOCS_DIR, 'api.md'), 'utf-8');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const blocks = md.split(/```/);
  const out = blocks
    .map((block, i) => {
      if (i % 2 === 1) {
        // fenced code block: baris pertama = bahasa
        const lines = block.split('\n');
        const body = lines.slice(1).join('\n').replace(/\n+$/, '');
        return `<pre><code>${esc(body)}</code></pre>`;
      }
      const html = esc(block)
        .replace(/^###### (.*)$/gm, '<h6>$1</h6>')
        .replace(/^##### (.*)$/gm, '<h5>$1</h5>')
        .replace(/^#### (.*)$/gm, '<h4>$1</h4>')
        .replace(/^### (.*)$/gm, '<h3>$1</h3>')
        .replace(/^## (.*)$/gm, '<h2>$1</h2>')
        .replace(/^# (.*)$/gm, '<h1>$1</h1>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/^(\s*)- (.*)$/gm, '$1<li>$2</li>')
        // table sederhana: | a | b |
        .replace(/(^\|.*\|\n\|[-| :]+\|\n(?:\|.*\|\n?)*)/gm, (m) => {
          const rows = m.trim().split('\n').map((r) => r.split('|').slice(1, -1).map((c) => c.trim()));
          const head = rows[0], body = rows.slice(2);
          return `<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body
            .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`;
        })
        .replace(/^(?!<[hultop])(.+)$/gm, '<p>$1</p>');
      return html;
    })
    .join('');
  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Emailnator — API Docs</title><style>${DOCS_CSS}</style></head><body>
<p class="muted"><a href="/">← Dashboard</a> · <a href="/docs/openapi.yaml" download>Unduh openapi.yaml</a></p>
${out}
</body></html>`;
}

let docsHtmlCache = null;
app.get('/docs', (req, res) => {
  try {
    if (!docsHtmlCache) docsHtmlCache = renderApiDocs();
    res.type('html').send(docsHtmlCache);
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat docs' });
  }
});
// Spesifikasi OpenAPI mentah (unduh / lihat)
app.get('/docs/openapi.yaml', (req, res) => {
  res.type('text/yaml').sendFile(path.join(DOCS_DIR, 'openapi.yaml'));
});

// ===================== API (publik, tanpa login) =====================

// Rate limit sederhana per IP untuk endpoint yang membuat resource baru
// (bisa disalahgunakan karena dashboard publik).
//   - single:  maks 10 email per menit
//   - bulk:    lebih ketat — 3 request per menit (maks 10 email/request)
const createLimits = new Map();
const BULK_LIMITS = new Map();
const CREATE_MAX = 10;
const BULK_MAX = 3;
const CREATE_WINDOW = 60 * 1000; // 1 menit

/** Generic sliding-window limiter per IP. */
function rateLimit(map, max, req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = map.get(ip);
  if (!rec || now > rec.resetAt) {
    map.set(ip, { count: 1, resetAt: now + CREATE_WINDOW });
    return next();
  }
  rec.count += 1;
  if (rec.count > max) {
    return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' });
  }
  next();
}

function rateLimitCreate(req, res, next) {
  return rateLimit(createLimits, CREATE_MAX, req, res, next);
}

function rateLimitBulk(req, res, next) {
  return rateLimit(BULK_LIMITS, BULK_MAX, req, res, next);
}

// Jaga agar Map tidak membengkak: buang entri basi secara berkala.
setInterval(() => {
  const cutoff = Date.now() - CREATE_WINDOW;
  for (const m of [createLimits, BULK_LIMITS]) {
    for (const [ip, rec] of m) {
      if (rec.resetAt < cutoff) m.delete(ip);
    }
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
    // Sama seperti /api/messages: log lengkap di server, pesan generik ke klien.
    console.error('❌ Upstream Emailnator gagal (create):', err.stack || err.message);
    res.status(502).json({ error: GENERIC_UPSTREAM_ERROR });
  }
});

/**
 * Buat banyak email sekaligus (bulk).
 * Body: { count: 1-10 } — email terakhir jadi email aktif.
 * Semua email dibuat berurutan; jika satu gagal, error dikembalikan dan
 * email yang sudah berhasil tetap tersimpan (partial success via 502).
 */
app.post('/api/emails/bulk', rateLimitBulk, async (req, res) => {
  const count = Number(req.body?.count);
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    return res.status(400).json({ error: 'count harus integer 1-10' });
  }
  const e = new Emailnator();
  const created = [];
  try {
    for (let i = 0; i < count; i++) {
      const { email } = await e.create();
      created.push(email);
    }
  } catch (err) {
    if (created.length) {
      // Simpan yang sudah berhasil supaya tidak hilang, lalu laporkan error.
      for (const email of created) store.addEmail(WEB_USER_ID, email);
      store.setActive(WEB_USER_ID, created[created.length - 1]);
    }
    console.error('❌ Upstream Emailnator gagal (bulk):', err.stack || err.message);
    return res.status(502).json({ error: GENERIC_UPSTREAM_ERROR });
  }
  for (const email of created) store.addEmail(WEB_USER_ID, email);
  store.setActive(WEB_USER_ID, created[created.length - 1]);
  const u = store.getUser(WEB_USER_ID);
  res.json({ created, active: u.active, emails: u.list });
});

/** Hapus email dari daftar (jika aktif, aktif pindah ke email tersisa terakhir) */
app.delete('/api/emails/:email', (req, res) => {
  const email = req.params.email;
  const u = store.getUser(WEB_USER_ID);
  if (!u.list.includes(email)) {
    return res.status(404).json({ error: 'Email tidak ditemukan' });
  }
  const u2 = store.removeEmail(WEB_USER_ID, email);
  res.json({ active: u2.active, emails: u2.list });
});

/** Ganti email aktif */
app.post('/api/emails/switch', (req, res) => {
  const { email } = req.body || {};
  const u = store.getUser(WEB_USER_ID);
  if (!email || !u.list.includes(email)) {
    return res.status(404).json({ error: 'Email tidak ditemukan' });
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
    // Log lengkap di server, pesan generik ke klien (jangan bocorkan detail
    // internal seperti traceback Python).
    console.error('❌ Upstream Emailnator gagal (inbox):', err.stack || err.message);
    res.status(502).json({ error: GENERIC_UPSTREAM_ERROR });
  }
});

/**
 * Baca detail satu pesan (deteksi kode OTP otomatis).
 * Opsional ?email= — default pakai email aktif. Email harus terdaftar.
 */
// Pakai wildcard `*id` (Express 5) supaya ID yang memuat karakter khusus
// (titik, dash, plus, @, dsb.) tetap tertangkap sebagai satu parameter.
app.get('/api/messages/*id', async (req, res) => {
  const user = store.getUser(WEB_USER_ID);
  const email = req.query.email || user.active;
  if (!email) {
    return res.status(400).json({ error: 'Belum ada email aktif.' });
  }
  if (!user.list.includes(email)) {
    return res.status(403).json({ error: 'Email tidak terdaftar di dashboard ini' });
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
    // Log traceback lengkap di server, kirim pesan generik ke klien supaya
    // detail internal (mis. traceback Python) tidak bocor lewat API.
    console.error('❌ Upstream Emailnator gagal:', err.stack || err.message);
    res.status(502).json({ error: GENERIC_UPSTREAM_ERROR });
  }
});

// ===================== ERROR HANDLER =====================

// Middleware error terakhir: semua error (termasuk body JSON malformed dari
// express.json) diubah jadi {error: string} JSON — bukan HTML page bawaan
// Express yang membocorkan stack trace & path internal.
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('❌', err.stack || err.message);
  res.status(status).json({
    error: status === 400 ? 'Request tidak valid (periksa format JSON body)' : 'Server error',
  });
});

// ===================== START =====================

/**
 * Jalankan server web. Dipanggil dari server.js (npm start).
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
