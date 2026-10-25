# PRD — Emailnator Web & API v2

## Goals
1. Rapikan codebase (struktur, naming, komentar) — hapus jejak bot Telegram yang tersisa (README, Dockerfile, railway.toml, examples).
2. REST API lengkap + docs (OpenAPI + docs/api.md): create email (single & bulk), inbox, read message, switch/delete email, health.
3. Revisi tampilan web dashboard: modern, responsif, konsisten, fitur bulk + inbox + OTP detection.
4. Verifikasi end-to-end: server jalan, semua endpoint dites nyata via curl.

## Non-goals
- Autentikasi user (dashboard tetap publik), multi-tenant.

## Arsitektur (ada)
- Node 22 + Express 5 (`src/web.js`), SQLite (`src/storage.js`), bridge Python cloudscraper (`src/emailnator.py` dipanggil `src/emailnator.js` via execFileSync).
- Entry: `node bot.js` → rename jadi `server.js` (web-only).
- Frontend statis: `public/` (vanilla JS).

## Kontrak API
- `GET /api/health` → `{ok:true}`
- `GET /api/me` → `{active, emails[]}`
- `POST /api/emails` → buat 1 email `{email, active, emails[]}` (rate-limited)
- `POST /api/emails/bulk` body `{count:1-10}` → `{created:[], active, emails[]}`
- `POST /api/emails/switch` body `{email}` → `{active, emails[]}`
- `DELETE /api/emails/:email` → hapus dari daftar → `{active, emails[]}`
- `GET /api/inbox?email=` → `{email,totalEmails,emails:[{id,from,subject,time,hasCode}]}`
- `GET /api/messages/:id?email=` → `{id,from,subject,time,text,code}`
- Error shape: `{error: string}` dengan status HTTP tepat (400/403/404/429/502).

## Must
- API docs: `docs/api.md` + `docs/openapi.yaml` (atau .json) akurat sesuai implementasi.
- Web revisi: header jelas, list email (aktif ditandai), tombol bulk (pilih jumlah), inbox dengan badge OTP, baca pesan + copy kode, copy email, responsif mobile.
- Code rapi: `server.js` entry, package.json scripts (`start`), hapus file referensi Telegram.

## Should
- Rate limit juga untuk bulk (lebih ketat).
- Empty state & loading state yang enak dilihat.

## Nice
- Auto-refresh inbox ringan.
