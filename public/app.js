/* ===================== Emailnator Dashboard — frontend ===================== */

const $ = (id) => document.getElementById(id);

const state = {
  active: null,
  emails: [],
  inbox: null,
  busy: false,
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

// ===================== Sidebar (mobile) =====================

function openSidebar() {
  $('sidebar').classList.add('open');
  $('sidebar-backdrop').classList.remove('hidden');
}
function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebar-backdrop').classList.add('hidden');
}

// ===================== Header & email list =====================

function renderHeader() {
  const chip = $('active-email');
  const copyBtn = $('btn-copy-email');
  if (state.active) {
    chip.textContent = state.active;
    chip.className = 'chip ready';
    chip.title = state.active;
    copyBtn.disabled = false;
  } else {
    chip.textContent = 'Belum ada email aktif';
    chip.className = 'chip';
    chip.title = '';
    copyBtn.disabled = true;
  }
  $('btn-refresh').disabled = !state.active || state.busy;
  $('btn-create').disabled = state.busy;
  $('btn-bulk').disabled = state.busy;
}

function renderEmailList() {
  const wrap = $('email-list');
  const countPill = $('email-count');

  if (state.emails.length === 0) {
    countPill.classList.add('hidden');
    wrap.innerHTML = '<p class="muted empty-hint">Belum ada email.<br />Klik <b>"+ Buat Email Baru"</b> untuk mulai 🚀</p>';
    return;
  }

  countPill.textContent = state.emails.length;
  countPill.classList.remove('hidden');

  wrap.innerHTML = state.emails
    .map((email) => {
      const isActive = email === state.active;
      return `
        <div class="email-item ${isActive ? 'active' : ''}" data-email="${escapeHtml(email)}" role="listitem" title="${escapeHtml(email)}">
          <span class="dot ${isActive ? 'dot-active' : ''}"></span>
          <span class="email-addr">${escapeHtml(email)}</span>
          ${isActive ? '<span class="active-tag">aktif</span>' : ''}
          <button class="btn-icon btn-copy-email-item" data-copy="${escapeHtml(email)}" title="Salin email" aria-label="Salin ${escapeHtml(email)}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
          </button>
        </div>`;
    })
    .join('');

  wrap.querySelectorAll('.email-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-copy-email-item')) {
        copyText(item.dataset.email, 'Email tersalin! 📋');
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
    renderInboxState(
      '📭',
      'Inbox kosong, belum ada email masuk.<br />Refresh beberapa saat lagi, atau kirim email ke alamat aktif.'
    );
    return;
  }

  $('inbox-state').classList.add('hidden');
  list.innerHTML = state.inbox.emails
    .map((m, i) => {
      const codeBadge = m.hasCode ? '<span class="badge-code">🔑 OTP</span>' : '';
      const from = m.from && m.from !== '?' ? m.from : '(tanpa pengirim)';
      return `
        <div class="inbox-item" data-id="${escapeHtml(m.id)}" role="button" tabindex="0">
          <div class="inbox-num">${i + 1}</div>
          <div class="inbox-body">
            <div class="inbox-subject">${codeBadge}<span>${escapeHtml(m.subject)}</span></div>
            <div class="inbox-meta">Dari: ${escapeHtml(from)}</div>
          </div>
          <div class="inbox-side">
            <span class="inbox-time">${escapeHtml(m.time || '')}</span>
            <span class="inbox-chevron">›</span>
          </div>
        </div>`;
    })
    .join('');

  list.querySelectorAll('.inbox-item').forEach((item) => {
    item.addEventListener('click', () => openMessage(item.dataset.id));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMessage(item.dataset.id);
      }
    });
  });
}

async function refreshInbox({ silent = false } = {}) {
  if (!state.active || state.busy) return;
  state.busy = true;
  renderHeader();
  if (!silent) renderInboxSkeleton();
  try {
    const data = await api('/api/inbox');
    state.inbox = data;
    renderInbox();
    $('last-updated').textContent = `Diperbarui ${new Date().toLocaleTimeString('id-ID')}`;
  } catch (err) {
    if (!silent) renderInboxState('⚠️', escapeHtml(err.message), true);
  } finally {
    state.busy = false;
    renderHeader();
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
  closeSidebar();
}

async function openMessage(id) {
  $('message-detail').innerHTML = '<div class="skeleton" style="height:200px"></div>';
  showMessageView();
  try {
    const m = await api(`/api/messages/${encodeURIComponent(id)}`);
    const codeBanner = m.code
      ? `
        <div class="code-banner">
          <div class="code-info">
            <div class="code-label">🔑 Kode Verifikasi Terdeteksi</div>
            <div class="code-value">${escapeHtml(m.code)}</div>
          </div>
          <button class="btn btn-primary" id="btn-copy-code">📋 Salin Kode</button>
        </div>`
      : '';

    $('message-detail').innerHTML = `
      <div class="msg-card">
        ${codeBanner}
        <div class="msg-header">
          <div class="msg-subject">${escapeHtml(m.subject)}</div>
          <div class="msg-rows">
            <span class="k">Dari</span><span class="v">${escapeHtml(m.from)}</span>
            <span class="k">Waktu</span><span class="v">${escapeHtml(m.time)}</span>
          </div>
        </div>
        <div class="msg-body">${escapeHtml(m.text)}</div>
      </div>`;

    const copyBtn = $('btn-copy-code');
    if (copyBtn) copyBtn.addEventListener('click', () => copyText(m.code, 'Kode tersalin! 📋'));
  } catch (err) {
    $('message-detail').innerHTML = `<div class="state-box error-state"><span class="big">❌</span>${escapeHtml(err.message)}</div>`;
  }
}

// ===================== Actions =====================

function applyMe({ active, emails }) {
  state.active = active;
  state.emails = emails;
  renderHeader();
  renderEmailList();
}

async function loadMe() {
  applyMe(await api('/api/me'));
  if (state.active) await refreshInbox();
  else renderInboxState('📧', 'Belum ada email. Klik <b>"+ Buat Email Baru"</b> untuk membuat email sementara pertama kamu.');
}

async function createEmail() {
  if (state.busy) return;
  setBusy($('btn-create'), true);
  try {
    const data = await api('/api/emails', { method: 'POST' });
    applyMe(data);
    showInboxView();
    toast(`✅ Email dibuat: ${data.email}`, 'success');
    await refreshInbox();
  } catch (err) {
    toast(`❌ Gagal membuat email: ${err.message}`, 'error');
  } finally {
    setBusy($('btn-create'), false);
  }
}

async function createBulkEmails() {
  if (state.busy) return;
  const count = Math.floor(Number($('bulk-count').value));
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    toast('❌ Jumlah email harus 1–10', 'error');
    return;
  }
  setBusy($('btn-bulk'), true);
  try {
    const data = await api('/api/emails/bulk', { method: 'POST', body: { count } });
    applyMe(data);
    showInboxView();
    toast(`✅ ${data.created.length} email dibuat`, 'success');
    await refreshInbox();
  } catch (err) {
    toast(`❌ Gagal bulk: ${err.message}`, 'error');
  } finally {
    setBusy($('btn-bulk'), false);
  }
}

async function switchEmail(email) {
  try {
    applyMe(await api('/api/emails/switch', { method: 'POST', body: { email } }));
    showInboxView();
    toast(`📧 Aktif: ${email}`, 'success');
    await refreshInbox();
  } catch (err) {
    toast(`❌ ${err.message}`, 'error');
  }
}

// ===================== Auto refresh =====================

let autoTimer = null;
function startAutoRefresh() {
  stopAutoRefresh();
  autoTimer = setInterval(() => {
    const inboxVisible = !$('view-inbox').classList.contains('hidden');
    if ($('chk-auto').checked && inboxVisible && state.active && !state.busy) {
      refreshInbox({ silent: true });
    }
  }, 20000);
}
function stopAutoRefresh() {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
}

// ===================== Init =====================

async function init() {
  // Sidebar mobile
  $('btn-sidebar-open').addEventListener('click', openSidebar);
  $('btn-sidebar-close').addEventListener('click', closeSidebar);
  $('sidebar-backdrop').addEventListener('click', closeSidebar);

  $('btn-create').addEventListener('click', createEmail);
  $('btn-bulk').addEventListener('click', createBulkEmails);
  $('bulk-count').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createBulkEmails();
  });
  $('btn-refresh').addEventListener('click', () => refreshInbox());
  $('btn-back').addEventListener('click', () => {
    showInboxView();
    if (!state.inbox) refreshInbox();
  });
  $('btn-copy-email').addEventListener('click', () => {
    if (state.active) copyText(state.active, 'Email tersalin ke clipboard! 📋');
  });

  try {
    await loadMe();
    startAutoRefresh();
  } catch (err) {
    renderInboxState('⚠️', `Gagal memuat data: ${escapeHtml(err.message)}<br />Coba refresh halaman beberapa saat lagi.`, true);
  }
}

init();
