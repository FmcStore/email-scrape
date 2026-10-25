<div align="center">

# 📧 Emailnator — Web Dashboard & REST API

**Generate email sementara (disposable email), cek inbox & baca pesan langsung dari browser — plus REST API lengkap.**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3-3776AB?logo=python&logoColor=white)](https://python.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

Dibangun di atas [Emailnator](https://www.emailnator.com) — **Node.js + Express 5** untuk server, **Python `cloudscraper`** untuk bypass Cloudflare, **SQLite** (`better-sqlite3`) untuk penyimpanan persisten.

---

## ✨ Fitur

| Fitur | Deskripsi |
| ----- | --------- |
| 📧 **Generate email instan** | Buat alamat Gmail sementara sekali klik (single & bulk 1–10) |
| 📬 **Cek inbox real-time** | Daftar pesan masuk + jumlah, auto-refresh ringan |
| 📖 **Baca isi pesan** | Dari / Subjek / Waktu / konten (di-extract otomatis dari HTML) |
| 🔑 **Deteksi OTP** | Kode verifikasi dideteksi otomatis + tombol salin |
| 🔄 **Multi-email** | Simpan banyak email, switch & delete kapan saja |
| 💾 **Persisten** | SQLite — daftar email tidak hilang saat restart/redeploy |
| 🚀 **Deploy** | Dockerfile + railway.toml siap Railway |

- 📄 **Dokumentasi API:** [docs/api.md](docs/api.md) + [docs/openapi.yaml](docs/openapi.yaml)
- 🖥️ **Web dashboard:** publik, tanpa login — semua pengunjung berbagi satu akun web bersama.

---

## ⚙️ Requirements

- **Node.js ≥ 22** (`better-sqlite3@13` butuh Node ≥ 22)
- **Python 3** + `cloudscraper` (`pip install -r requirements.txt`)
- Akses internet ke `emailnator.com`

> ⚠️ `src/emailnator.js` memanggil `src/emailnator.py` via `child_process` (tanpa shell) — Python wajib ada.

---

## 🚀 Jalankan Lokal

```bash
git clone https://github.com/bianmbut58-netizen/emailnator-v2.git
cd emailnator-v2
npm install
pip install -r requirements.txt
npm start        # node server.js
```

Server jalan di `http://localhost:3000` (ubah via env `PORT`). Database SQLite tersimpan di `./data/` (override via env `DATA_DIR`).

---

## 🔌 REST API (ringkas)

Base URL: `http://localhost:3000` — tanpa autentikasi. Detail lengkap: **docs/api.md**.

| Method | Endpoint | Fungsi |
| ------ | -------- | ------ |
| GET | `/api/health` | Health check |
| GET | `/api/me` | Email aktif + daftar semua email |
| POST | `/api/emails` | Buat 1 email baru (jadi aktif) — rate limit 10/menit |
| POST | `/api/emails/bulk` | Buat 1–10 email `{count}` — rate limit 3/menit |
| POST | `/api/emails/switch` | Ganti email aktif `{email}` |
| DELETE | `/api/emails/:email` | Hapus email dari daftar |
| GET | `/api/inbox?email=` | Daftar pesan (badge `hasCode` untuk OTP) |
| GET | `/api/messages/:id?email=` | Detail pesan + kode OTP terdeteksi |

Contoh:

```bash
curl -s localhost:3000/api/health
curl -s -X POST localhost:3000/api/emails
curl -s -X POST localhost:3000/api/emails/bulk -H 'Content-Type: application/json' -d '{"count":3}'
curl -s localhost:3000/api/inbox
curl -s localhost:3000/api/messages/<messageId>
curl -s -X DELETE localhost:3000/api/emails/<email>
```

Error shape konsisten: `{ "error": "..." }` dengan status HTTP tepat (400/403/404/429/502).

---

## 🧩 Pakai sebagai Library

`Emailnator` class bisa dipakai langsung di script Node.js kamu:

```js
const Emailnator = require('./src/emailnator');

(async () => {
  const e = new Emailnator();
  const { email } = await e.create();
  const inbox = await e.getInbox(email);
  if (inbox.totalEmails > 0) {
    const detail = await e.getMessage(email, inbox.emails[0].id);
    console.log(detail.subject, detail.text);
  }
})();
```

Jalankan contoh: `npm test` (butuh internet + Python).

### API Reference

#### `new Emailnator()`
Membuat instance client.

#### `await e.create()` → `{ email: string }`
Generate email sementara baru. Melempar `Error` kalau gagal.

#### `await e.getInbox(email)` → `{ totalEmails: number, emails: Message[] }`
Ambil daftar pesan. Setiap item sudah berupa detail lengkap (`getMessage` dipanggil otomatis per pesan).

#### `await e.getMessage(email, messageID)` → `Message`
```js
{
  id: string,      // messageID
  from: string,    // pengirim (di-extract dari HTML/JSON)
  subject: string, // subjek
  text: string,    // isi pesan
  time: string,    // waktu kirim
}
```
Metadata di-extract dengan fallback berlapis: selector DOM → meta tag → header email mentah → heuristik. Kalau tidak ketemu: `?` / `(no subject)`.

---

## 📁 Struktur Project

```
emailnator-v2/
├── server.js              # 🚀 Entry point (npm start)
├── package.json           # Dependencies & scripts
├── package-lock.json      # Lockfile (untuk build reproducible)
├── requirements.txt       # Dep Python: cloudscraper
├── Dockerfile             # 🐳 Image build (Node + Python)
├── railway.toml           # 🚂 Config deploy Railway (auto-build)
├── .dockerignore          # File yang dikecualikan saat Docker build
├── .gitignore             # Ignore rules (node_modules, .env, dll)
├── README.md              # Dokumentasi (ini)
├── docs/
│   ├── prd.md             # PRD
│   ├── api.md             # 📄 Dokumentasi REST API
│   └── openapi.yaml       # 📄 Spesifikasi OpenAPI 3.1
├── public/                # 🌐 Web dashboard (statis)
│   ├── index.html         #   Halaman dashboard (publik, tanpa login)
│   ├── style.css          #   Tema gelap modern
│   └── app.js             #   Logika frontend (fetch API, render inbox, copy OTP)
├── src/
│   ├── config.js          # 🔧 Konfigurasi (port, storage, emailnator)
│   ├── web.js             # 🌐 Server Express + REST API publik
│   ├── emailnator.js      # Core class Emailnator (create/inbox/read)
│   ├── emailnator.py      # 🐍 Bridge Python — bypass Cloudflare via cloudscraper
│   ├── storage.js         # 💾 Penyimpanan persisten SQLite (users & emails)
│   └── utils.js           # 🧰 Helper (format waktu, deteksi OTP)
└── examples/
    └── usage.js           # Contoh pemakaian library (npm test)
```

---

## 🚂 Deploy ke Railway (Auto-Build)

1. **Push** repo ini ke GitHub
2. Buka [Railway](https://railway.app) → **New Project → Deploy from GitHub repo** → pilih repo ini
3. Railway otomatis membaca `railway.toml` dan build lewat `Dockerfile` (Node 22 + Python 3 + cloudscraper)
4. **Deploy** — web dashboard & REST API (publik, tanpa password) otomatis online di `*.up.railway.app`, healthcheck `/api/health`
5. *(Penting)* **Pasang Volume** supaya daftar email tersimpan permanen:
   - Buka **Deployments → Service → Volumes** → **Add Volume** → mount path `/data`
   - atau via CLI: `railway volume add --mount-path /data`

### Cara kerja config

- **`Dockerfile`** — image `node:22-slim`, install `python3`/`python3-pip`, lalu `npm ci` + `pip install -r requirements.txt`. Perintah: `node server.js`. Sudah set `ENV DATA_DIR=/data` + `mkdir /data`.
- **`railway.toml`** — `builder = "DOCKERFILE"`, `startCommand = "node server.js"`, restart otomatis `ON_FAILURE` (max 10×), HTTP healthcheck ke `/api/health`. **Catatan:** `railway.toml` tidak mendukung blok `[volumes]` — volume dipasang via dashboard/CLI (lihat langkah 5).

### 💾 Penyimpanan persisten di Railway

- Aplikasi menulis database SQLite ke **`/data`** (`DATA_DIR=/data`, sudah default di Dockerfile).
- **Tanpa volume:** DB tersimpan di disk container yang **ephemeral** — hilang saat redeploy. **Dengan volume** (mount di `/data`): daftar email & email aktif tetap ada walau server restart/redeploy.

---

## 🩺 Troubleshooting

| Gejala | Penyebab | Solusi |
| ------ | -------- | ------ |
| `ModuleNotFoundError: No module named 'cloudscraper'` | Python dep belum diinstall | `pip install -r requirements.txt` |
| `Create failed: 403` / `Inbox failed: 403` | Cloudflare memblokir / pola request berubah | Update `cloudscraper`: `pip install -U cloudscraper` |
| `Read failed: 500` | messageID sudah kedaluwarsa / tidak valid | Kembali ke inbox & refresh, lalu buka ulang pesan |
| `❌ ID pesan tidak valid` | Validasi messageID (ID asli Emailnator bisa memuat titik/dash/@) | Update ke versi terbaru |
| Daftar email hilang setelah restart | DB tersimpan di disk ephemeral | Pasang volume Railway di `/data` |
| `Gagal cek inbox: ...` | Jaringan ke emailnator.com bermasalah | Cek koneksi & coba lagi |
| `Unexpected response from Emailnator (no email returned)` | Respons situs berubah / bukan JSON | Update ke versi terbaru; laporkan issue |

---

## 🔐 Catatan Keamanan

- Dashboard & API bersifat **publik (tanpa password)** — siapa pun yang punya URL bisa melihat & memakai inbox bersama. Jangan simpan data sensitif di email sementara ini.
- Aplikasi ini memakai layanan pihak ketiga (emailnator.com) — alamat email sementara **tidak cocok** untuk data sensitif.

---

## 🧪 Testing

```bash
npm test
```

Menjalankan `node examples/usage.js` — generate email sungguhan, cek inbox, lalu baca pesan pertama (kalau ada). Butuh koneksi internet & Python terpasang.

---

## 📄 Lisensi

[MIT](LICENSE) — bebas pakai, bebas modifikasi.

---

<div align="center">

**💡 Tips:** Daftar email tersimpan di SQLite (`/data` di Railway, `./data` lokal) — pasang Volume di Railway biar data tetap ada saat redeploy.

</div>
