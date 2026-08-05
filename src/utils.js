/**
 * Helper bersama — dipakai oleh bot Telegram (bot.js) dan web dashboard (src/web.js)
 * supaya format pesan & deteksi kode konsisten di kedua platform.
 */

/**
 * Escape HTML agar aman ditampilkan di Telegram / browser.
 */
function escHTML(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Potong teks panjang + escape HTML (untuk tampilan Telegram).
 */
function truncate(text, maxLen) {
  if (!text || text.length <= maxLen) return escHTML(text || '<i>(kosong)</i>');
  return escHTML(text.slice(0, maxLen)) + '\n\n...<i>(dipotong, terlalu panjang)</i>';
}

/**
 * Format waktu agar ringkas & konsisten.
 * - Date valid → "01 Agu 2026, 14.05" (lokal)
 * - Header mentah seperti "Fri, 1 Aug 2026 10:32:05 +0000" → ambil jam:menit
 * - Kalau tidak bisa di-parse → potong aslinya
 */
function formatTime(t) {
  if (!t) return '';
  const s = String(t).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${dd} ${bulan[d.getMonth()]}, ${hh}:${mm}`;
  }
  const hm = s.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (hm) return hm[1];
  return s.slice(0, 16);
}

/**
 * Deteksi kode (OTP / verifikasi) di dalam isi pesan.
 * - Prioritas 1: deretan 4-8 angka yang berdiri sendiri (mis. "123456")
 * - Prioritas 2: token alfanumerik 5-12 karakter yang wajib berisi angka + huruf
 * Mengembalikan kode (string) atau null kalau tidak ada.
 */
function detectCode(text) {
  if (!text) return null;
  const s = String(text);
  const otp = s.match(/(?<![\dA-Za-z])(\d{4,8})(?![\dA-Za-z])/);
  if (otp) return otp[1];
  for (const tok of s.match(/[A-Za-z0-9]{5,12}/g) || []) {
    if (/\d/.test(tok) && /[A-Za-z]/.test(tok)) return tok;
  }
  return null;
}

module.exports = { escHTML, truncate, formatTime, detectCode };
