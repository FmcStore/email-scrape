/* ===================== Emailnator Dashboard — frontend ===================== */

const $ = (id) => document.getElementById(id);

const state = {
  loggedIn: false,
  active: null,
  emails: [],
  inbox: null,
  messageId: null,
  busy: false,
  lastUpdated: null,
};

// ===================== Helpers =====================

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

let toastTimer = null;
function toast(message, type = '') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = 'toast hidden';
  }, 2800);
}

async function copyText(text, successMsg = 'Tersalin ke clipboard! 📋') {
  try {
    await navigator.clipboard.writeText(text);
    toast(successMsg, 'success');
  } catch {
    // Fallback untuk browser lama
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast(successMsg, 'success');
    } catch {
      toast('Gagal menyalin ke clipboard', 'error');
    }
    document.body.removeChild(ta);
  }
}

function setBusy(btn, busy) {
  if (!btn) return;
  const label = btn.querySelector('.btn-label');
  const spinner = btn.querySelector('.spinner');
  btn.disabled = busy;
  if (label) label.style.opacity = busy ? 0 : 1;
  if (spinner) spinner.classList.toggle('hidden', !busy);
}

// ===================== Views =====================

function showView(name) {
  $('view-login').classList.toggle('hidden', name !== 'login');
  $('view-app').classList.toggle('hidden', name !== 'app');
}

function renderHeader() {
  const chip = $('active-email');
  const copyBtn = $('btn-copy-email');
  if (state.active) {
    chip.textContent = state.active;
    chip.className = 'chip ready';
    copyBtn.disabled = false;
  } else {
    chip.textContent = 'Belum ada email aktif';
    chip.className = 'chip';
    copyBtn.disabled = true;
  }
  $('btn-refresh').disabled = !state.active;
  $('btn-create').disabled = state.busy;
}

function renderEmailList() {
  const wrap = $('email-list');
  if (state.emails.length === 0) {
    wrap.innerHTML = '<p class="muted empty-hint">Belum ada email. Klik "Buat Email Baru" untuk mulai 🚀</p>';
    return;
  }
  wrap.innerHTML = state.emails
    .map((email) => {
      const isActive = email === state.active;
      return `
        <div class="email-item ${isActive ? 'active' : ''}" data-email="${escapeHtml(email)}" title="${escapeHtml(email)}">
          <span class="dot">${isActive ? '✅' : '📧'}</span>
          <span>${escapeHtml(email)}</span>
          <span class="copy-x" data-copy="${escapeHtml(email)}" title="Salin">📋</span>
        </div>`;
    })
    .join('');
  wrap.querySelectorAll('.email-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('copy-x')) {
        copyText(item.dataset.email);
        return;
      }
      if (!item.classList.contains('active')) switchEmail(item.dataset.email);
    });
  });
}

// ===================== Inbox =====================

function renderInboxSkeleton() {
  $('inbox-state').classList.add('hidden');
  $('inbox-list').innerHTML =
    '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
}

function renderInboxState(emoji, text, isError = false) {
  $('inbox-state').classList.remove('hidden');
  $('inbox-state').className = `state-box ${isError ? 'error-state' : ''}`;
  $('inbox-state').innerHTML = `<span class="big">${emoji}</span>${text}`;
  $('inbox-list').innerHTML = '';
}

function renderInbox() {
  const list = $('inbox-list');
  if (!state.inbox) return;

  if (state.inbox.totalEmails === 0) {
    renderInboxState('📭', 'Inbox kosong, belum ada email masuk.<br />Refresh beberapa saat lagi, atau coba kirim email ke alamat aktif.');
    return;
  }

  $('inbox-state').classList.add('hidden');
  list.innerHTML = state.inbox.emails
    .map((m, i) => {
      const codeBadge = m.hasCode ? '<span class="badge-code">🔑 OTP</span>' : '';
      const from = m.from && m.from !== '?' ? m.from : '(tanpa pengirim)';
      return `
        <div class="inbox-item" data-id="${escapeHtml(m.id)}">
          <div class="inbox-num">${i + 1}</div>
          <div class="inbox-body">
            <div class="inbox-subject">${codeBadge}<span>${escapeHtml(m.subject)}</span></div>
            <div class="inbox-meta">Dari: ${escapeHtml(from)}</div>
          </div>
          <div class="inbox-side">
            <span class="inbox-time">${escapeHtml(m.time || '')}</span>
            <span class="muted">📖</span>
          </div>
        </div>`;
    })
    .join('');

  list.querySelectorAll('.inbox-item').forEach((item) => {
    item.addEventListener('click', () => openMessage(item.dataset.id));
  });
}

async function refreshInbox({ silent = false } = {}) {
  if (!state.active || state.busy) return;
  state.busy = true;
  $('btn-create').disabled = true;
  $('btn-refresh').disabled = true;
  if (!silent) renderInboxSkeleton();
  try {
    const data = await api('/api/inbox');
    state.inbox = data;
    renderInbox();
    state.lastUpdated = new Date();
    $('last-updated').textContent = `Diperbarui ${state.lastUpdated.toLocaleTimeString('id-ID')}`;
  } catch (err) {
    if (!silent) renderInboxState('⚠️', escapeHtml(err.message), true);
    if (err.status === 401) return logout();
  } finally {
    state.busy = false;
    $('btn-create').disabled = false;
    $('btn-refresh').disabled = !state.active;
  }
}

// ===================== Message =====================

function showInboxView() {
  $('view-inbox').classList.remove('hidden');
  $('view-message').classList.add('hidden');
  $('page-title').textContent = '📬 Inbox';
}

function showMessageView() {
  $('view-inbox').classList.add('hidden');
  $('view-message').classList.remove('hidden');
  $('page-title').textContent = '📖 Detail Pesan';
}

async function openMessage(id) {
  $('message-detail').innerHTML = '<div class="skeleton" style="height:200px"></div>';
  showMessageView();
  try {
    const m = await api(`/api/messages/${encodeURIComponent(id)}`);
    const codeBanner = m.code
      ? `
        <div class="code-banner">
          <div>
            <div class="code-label">🔑 Kode Verifikasi</div>
            <div class="code-value">${escapeHtml(m.code)}</div>
          </div>
          <button class="btn btn-primary" id="btn-copy-code">📋 Salin Kode</button>
        </div>`
      : '';

    $('message-detail').innerHTML = `
      <div class="msg-card">
        ${codeBanner}
        <div class="msg-header">
          <div class="msg-subject">
            <span>📩</span>
            <span>${escapeHtml(m.subject)}</span>
          </div>
          <div class="msg-rows">
            <span class="k">Dari:</span><span class="v">${escapeHtml(m.from)}</span>
            <span class="k">Waktu:</span><span class="v">${escapeHtml(m.time)}</span>
          </div>
        </div>
        <div class="msg-body">${escapeHtml(m.text)}</div>
      </div>`;

    const copyBtn = $('btn-copy-code');
    if (copyBtn) copyBtn.addEventListener('click', () => copyText(m.code));
  } catch (err) {
    $('message-detail').innerHTML = `<div class="state-box error-state"><span class="big">❌</span>${escapeHtml(err.message)}</div>`;
    if (err.status === 401) return logout();
  }
}

// ===================== Actions =====================

async function loadMe() {
  const me = await api('/api/me');
  state.active = me.active;
  state.emails = me.emails;
  renderHeader();
  renderEmailList();
  if (state.active) await refreshInbox();
  else renderInboxState('📧', 'Belum ada email. Klik <b>“Buat Email Baru”</b> untuk membuat email sementara pertama kamu.');
}

async function createEmail() {
  if (state.busy) return; // refreshInbox sedang berjalan?
  setBusy($('btn-create'), true);
  try {
    const data = await api('/api/emails', { method: 'POST' });
    state.active = data.active;
    state.emails = data.emails;
    renderHeader();
    renderEmailList();
    showInboxView();
    toast(`✅ Email dibuat: ${data.email}`, 'success');
    await refreshInbox(); // refreshInbox mengelola state.busy sendiri
  } catch (err) {
    toast(`❌ Gagal membuat email: ${err.message}`, 'error');
    if (err.status === 401) return logout();
  } finally {
    setBusy($('btn-create'), false);
  }
}

async function switchEmail(email) {
  try {
    const data = await api('/api/emails/switch', { method: 'POST', body: { email } });
    state.active = data.active;
    state.emails = data.emails;
    renderHeader();
    renderEmailList();
    showInboxView();
    toast(`📧 Aktif: ${email}`, 'success');
    await refreshInbox();
  } catch (err) {
    toast(`❌ ${err.message}`, 'error');
    if (err.status === 401) return logout();
  }
}

async function logout() {
  try {
    await api('/api/logout', { method: 'POST' });
  } catch {}
  state.loggedIn = false;
  showView('login');
  stopAutoRefresh();
}

// ===================== Login =====================

async function handleLogin(e) {
  e.preventDefault();
  const pw = $('login-password').value;
  $('login-error').classList.add('hidden');
  setBusy($('btn-login'), true);
  try {
    await api('/api/login', { method: 'POST', body: { password: pw } });
    state.loggedIn = true;
    $('login-password').value = '';
    showView('app');
    await loadMe();
    startAutoRefresh();
  } catch (err) {
    $('login-error').textContent = err.message;
    $('login-error').classList.remove('hidden');
  } finally {
    setBusy($('btn-login'), false);
  }
}

// ===================== Auto refresh =====================

let autoTimer = null;
function startAutoRefresh() {
  stopAutoRefresh();
  autoTimer = setInterval(() => {
    // Hanya refresh saat sedang di tampilan inbox (bukan saat baca pesan)
    const inboxVisible = !$('view-inbox').classList.contains('hidden');
    if (inboxVisible && state.active && !state.busy) refreshInbox({ silent: true });
  }, 30000);
}
function stopAutoRefresh() {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
}

// ===================== Init =====================

async function init() {
  // Cek sesi: kalau cookie valid langsung masuk dashboard
  try {
    await api('/api/me');
    state.loggedIn = true;
    showView('app');
    await loadMe();
    startAutoRefresh();
  } catch (err) {
    showView('login');
  }

  $('login-form').addEventListener('submit', handleLogin);
  $('btn-logout').addEventListener('click', logout);
  $('btn-create').addEventListener('click', createEmail);
  $('btn-refresh').addEventListener('click', () => refreshInbox());
  $('btn-back').addEventListener('click', () => {
    showInboxView();
    if (!state.inbox) refreshInbox();
  });
  $('btn-copy-email').addEventListener('click', () => {
    if (state.active) copyText(state.active, 'Email tersalin ke clipboard! 📋');
  });
}

init();
