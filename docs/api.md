# Emailnator REST API

Base URL: `http://localhost:3000` (atau URL deploy kamu).

Spesifikasi formal: [openapi.yaml](openapi.yaml).

- **Autentikasi:** tidak ada — API publik single-user (semua pengunjung berbagi satu daftar email bersama).
- **Format:** JSON. Body request & response `application/json`.
- **Error shape konsisten:** `{ "error": "<pesan>" }` dengan status HTTP tepat.

| Status | Arti |
| ------ | ---- |
| 400 | Request/parameter tidak valid |
| 403 | Email ada di query, tapi tidak terdaftar di dashboard |
| 404 | Resource (email) tidak ditemukan |
| 429 | Rate limit terlampaui |
| 502 | Upstream Emailnator gagal (Cloudflare/jaringan/ubah layout) |

---

## GET /api/health

Health check.

```bash
curl -s localhost:3000/api/health
```

```json
{ "ok": true }
```

---

## GET /api/me

Email aktif + seluruh daftar email tersimpan.

```bash
curl -s localhost:3000/api/me
```

```json
{
  "active": "xxxx@gmail.com",
  "emails": ["xxxx@gmail.com", "yyyy@gmail.com"]
}
```

`active` bisa `null` kalau belum ada email.

---

## POST /api/emails

Buat **1 email baru**. Email baru otomatis menjadi email aktif.

Rate limit: **10 request/menit per IP** → 429 kalau terlampaui.

```bash
curl -s -X POST localhost:3000/api/emails
```

```json
{
  "email": "zzzz@gmail.com",
  "active": "zzzz@gmail.com",
  "emails": ["xxxx@gmail.com", "zzzz@gmail.com"]
}
```

- `502` kalau Emailnator gagal (contoh: `{ "error": "Create failed: 403" }`).

---

## POST /api/emails/bulk

Buat **banyak email sekaligus** (1–10). Email terakhir yang dibuat menjadi email aktif.

Rate limit: **3 request/menit per IP** (lebih ketat dari single).

Body:

| Field | Tipe | Wajib | Keterangan |
| ----- | ---- | ----- | ---------- |
| `count` | integer 1–10 | ya | Jumlah email yang dibuat |

```bash
curl -s -X POST localhost:3000/api/emails/bulk \
  -H 'Content-Type: application/json' \
  -d '{"count": 3}'
```

```json
{
  "created": ["aaa@gmail.com", "bbb@gmail.com", "ccc@gmail.com"],
  "active": "ccc@gmail.com",
  "emails": ["xxxx@gmail.com", "aaa@gmail.com", "bbb@gmail.com", "ccc@gmail.com"]
}
```

- `400` kalau `count` bukan integer 1–10: `{ "error": "count harus integer 1-10" }`
- `502` kalau pembuatan gagal di tengah jalan — email yang sudah berhasil **tetap tersimpan** (partial success), response berisi error-nya.

---

## POST /api/emails/switch

Ganti email aktif. Email harus sudah ada di daftar.

Body:

| Field | Tipe | Wajib | Keterangan |
| ----- | ---- | ----- | ---------- |
| `email` | string | ya | Email yang mau dijadikan aktif |

```bash
curl -s -X POST localhost:3000/api/emails/switch \
  -H 'Content-Type: application/json' \
  -d '{"email": "xxxx@gmail.com"}'
```

```json
{
  "active": "xxxx@gmail.com",
  "emails": ["xxxx@gmail.com", "aaa@gmail.com"]
}
```

- `404` kalau email tidak ada di daftar: `{ "error": "Email tidak ditemukan" }`

---

## DELETE /api/emails/:email

Hapus email dari daftar. Jika email yang dihapus adalah email aktif, email aktif pindah ke email tersisa terakhir (atau `null` kalau daftar jadi kosong).

```bash
curl -s -X DELETE localhost:3000/api/emails/aaa@gmail.com
```

```json
{
  "active": "xxxx@gmail.com",
  "emails": ["xxxx@gmail.com"]
}
```

- `404` kalau email tidak ada di daftar: `{ "error": "Email tidak ditemukan" }`

---

## GET /api/inbox

Daftar pesan di inbox. Default membaca email aktif; bisa override dengan `?email=`.

Query:

| Param | Tipe | Wajib | Keterangan |
| ----- | ---- | ----- | ---------- |
| `email` | string | tidak | Email tujuan; default email aktif |

```bash
curl -s "localhost:3000/api/inbox"
curl -s "localhost:3000/api/inbox?email=xxxx@gmail.com"
```

```json
{
  "email": "xxxx@gmail.com",
  "totalEmails": 2,
  "emails": [
    {
      "id": "MSGID1",
      "from": "no-reply@example.com",
      "subject": "Your verification code",
      "time": "25 Okt, 09:14",
      "hasCode": true
    },
    {
      "id": "MSGID2",
      "from": "newsletter@example.com",
      "subject": "Weekly digest",
      "time": "25 Okt, 08:02",
      "hasCode": false
    }
  ]
}
```

- `hasCode` = `true` berarti pesan kemungkinan berisi kode OTP/verifikasi (lihat `code` di endpoint detail).
- `400` kalau belum ada email aktif & tidak ada `?email=`.
- `403` kalau `?email=` tidak terdaftar di dashboard.
- `502` kalau Emailnator gagal.

---

## GET /api/messages/:id

Detail satu pesan + deteksi kode OTP otomatis. Default membaca dari email aktif; bisa override dengan `?email=`.

> Message ID dari Emailnator bisa memuat titik, dash, `@`, dsb. — encode dengan `encodeURIComponent`.

Query:

| Param | Tipe | Wajib | Keterangan |
| ----- | ---- | ----- | ---------- |
| `email` | string | tidak | Email sumber; default email aktif |

```bash
curl -s "localhost:3000/api/messages/MSGID1"
curl -s "localhost:3000/api/messages/MSGID1?email=xxxx@gmail.com"
```

```json
{
  "id": "MSGID1",
  "from": "no-reply@example.com",
  "subject": "Your verification code",
  "time": "25 Okt, 09:14",
  "text": "Your code is 481923. Do not share it.",
  "code": "481923"
}
```

- `code` = `null` kalau tidak ada kode terdeteksi.
- Deteksi kode: prioritas 1 deretan 4–8 digit berdiri sendiri (OTP), prioritas 2 token alfanumerik 5–12 karakter yang mengandung angka + huruf.
- `400` kalau belum ada email aktif / ID tidak valid (kosong, > 512 karakter, atau mengandung karakter kontrol).
- `403` kalau `?email=` tidak terdaftar.
- `502` kalau Emailnator gagal (mis. pesan sudah kedaluwarsa).

---

## Catatan implementasi

- Semua operasi email diteruskan ke bridge Python `cloudscraper` (`src/emailnator.py`) via `execFileSync` — tanpa shell, jadi tidak ada risiko command injection dari input request.
- Daftar email & email aktif tersimpan persisten di SQLite (`$DATA_DIR/emailnator.db`).
- Rate limiter in-memory per IP (window 60 detik) — reset saat restart; di belakang proxy, IP diambil dari `X-Forwarded-For` (`trust proxy = 1`).
