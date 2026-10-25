# Changelog — emailnator-v2

## 1.0.0 — 2026-10-25

Rilis awal: web dashboard + REST API untuk disposable email berbasis Emailnator (docs/prd.md).

### Ditambahkan
- **Web dashboard publik** (public/) — generate email, cek inbox, baca pesan,
  deteksi & salin kode OTP, switch/delete email. Tanpa login (satu akun web
  bersama, `WEB_USER_ID = -1`).
- **REST API** (docs/api.md + docs/openapi.yaml):
  - `GET /api/health` — liveness check
  - `GET /api/me` — email aktif + daftar email tersimpan
  - `POST /api/emails` — buat email baru (jadi email aktif)
  - `POST /api/emails/bulk` — buat 1–10 email sekaligus (partial success via 502)
  - `GET /api/inbox?email=` — daftar pesan (wajib email terdaftar)
  - `GET /api/messages/*id?email=` — detail pesan + deteksi kode OTP otomatis
  - `POST /api/emails/switch`, `DELETE /api/emails/:email` — kelola daftar email
- **Bridge Python cloudscraper** (src/emailnator.py) untuk bypass Cloudflare
  Emailnator; dipanggil via `execFileSync` (tanpa shell → bebas command
  injection), override via `PYTHON_BIN`.
- **Penyimpanan persisten SQLite** (better-sqlite3, WAL) di `DATA_DIR`
  (default `./data/`, Railway: `/data`).
- **Deploy**: Dockerfile + railway.toml; konfigurasi via env
  (`PORT`, `DATA_DIR`, `PYTHON_BIN`, `TRUST_PROXY`).

### Keamanan
- Security headers (CSP, nosniff, X-Frame-Options DENY, Referrer-Policy).
- Rate limit per-IP sliding window: create 10/menit, bulk 3/menit.
- `/api/inbox` & `/api/messages` menolak email yang tidak terdaftar di dashboard.
- Error handler terakhir mengubah semua error (termasuk body JSON malformed)
  menjadi JSON `{error}` — tanpa stack trace/path internal.
- Semua endpoint upstream mengirim pesan error generik ke klien; traceback
  lengkap hanya di-log di server.
- Validasi `count` bulk (integer 1–10) dan `messageID` (maks 512 char, tanpa
  karakter kontrol).

### Verifikasi (smoke test lokal)
- `npm test` (syntax check server.js, src/web.js, public/app.js) — ALL_OK.
- Server hidup di port uji; `/api/health` → `{"ok":true}`, `/api/me` → JSON
  user, `GET /` → 200 HTML.
- Validasi input: body JSON malformed → 400 JSON; `count: 99` → 400; switch/
  delete email tak dikenal → 404; inbox email tak terdaftar → 403.
- Endpoint upstream (`POST /api/emails`, bulk, inbox, messages) → 502 dengan
  pesan generik dari mesin ini karena emailnator.com tidak dapat dijangkau;
  jalur kode error sudah diverifikasi (tanpa kebocoran traceback).

### Dikenal
- Endpoint yang bergantung pada emailnator.com butuh jaringan yang bisa
  mengakses domain tersebut (mesin review terblokir → 502).
- Dashboard publik memakai satu akun bersama; semua pengunjung melihat daftar
  email yang sama (by design, lihat PRD).
