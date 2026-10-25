/**
 * Persistent storage — SQLite (better-sqlite3)
 *
 * Data disimpan di direktori yang dikonfigurasi di src/config.js:
 *   - Railway:   DATA_DIR=/data (volume yang di-mount Railway)
 *   - Lokal:     ./data/ (default)
 *
 * Skema:
 *   users(chat_id, active)     — email aktif per user
 *   emails(chat_id, email)     — semua email yang pernah dibuat per user
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

const dataDir = config.storage.dir;
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, config.storage.file));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    chat_id INTEGER PRIMARY KEY,
    active  TEXT
  );

  CREATE TABLE IF NOT EXISTS emails (
    chat_id INTEGER NOT NULL,
    email   TEXT    NOT NULL,
    PRIMARY KEY (chat_id, email)
  );
`);

/**
 * Ambil data user: { active, list }
 * - active: email yang sedang dipakai sekarang
 * - list:   semua email yang pernah dibuat (urut sesuai waktu dibuat)
 */
function getUser(chatId) {
  const user = db.prepare('SELECT active FROM users WHERE chat_id = ?').get(chatId);
  const emails = db
    .prepare('SELECT email FROM emails WHERE chat_id = ? ORDER BY rowid')
    .all(chatId)
    .map((r) => r.email);
  return { active: user ? user.active : null, list: emails };
}

/**
 * Set email aktif untuk user (sekaligus simpan ke daftar email).
 */
function setActive(chatId, email) {
  db.prepare(
    `INSERT INTO users (chat_id, active) VALUES (?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET active = excluded.active`
  ).run(chatId, email);
  addEmail(chatId, email);
}

/**
 * Simpan email ke daftar user (tanpa mengubah email aktif).
 */
function addEmail(chatId, email) {
  db.prepare('INSERT OR IGNORE INTO emails (chat_id, email) VALUES (?, ?)').run(chatId, email);
}

/**
 * Hapus email dari daftar user.
 * - Jika email yang dihapus adalah email aktif, aktif dipindah ke email
 *   tersisa terakhir (atau NULL kalau daftar jadi kosong).
 * - Return { active, list } terbaru.
 */
function removeEmail(chatId, email) {
  const user = getUser(chatId);
  if (!user.list.includes(email)) return user;
  db.prepare('DELETE FROM emails WHERE chat_id = ? AND email = ?').run(chatId, email);
  const remaining = user.list.filter((e) => e !== email);
  if (user.active === email) {
    const nextActive = remaining.length ? remaining[remaining.length - 1] : null;
    if (nextActive) {
      db.prepare('UPDATE users SET active = ? WHERE chat_id = ?').run(nextActive, chatId);
    } else {
      db.prepare('DELETE FROM users WHERE chat_id = ?').run(chatId);
    }
  }
  return getUser(chatId);
}

module.exports = { getUser, setActive, addEmail, removeEmail };
