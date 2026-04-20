/* ============================================================
   app.js — Router, State, API Client, Time Filter
   ============================================================ */

'use strict';

// ── State ────────────────────────────────────────────────────────────────
const App = {
  csrf: window.__CSRF__ || '',
  platform: 'all',
  mode: 'month',        // 'month' | 'year'
  period: '',           // '2026-03' | '2026'
  dateFrom: '',         // 'YYYY-MM-DD' — khi dùng preset ngày (Hôm nay, 7 ngày…)
  dateTo:   '',         // 'YYYY-MM-DD'
  rangeLabel: '',       // nhãn hiển thị khi dùng date range
  currentPage: 'overview',
  user: null,
  adminTab: 'accounts',
  adminMounted: false,
  passwordModalForced: false,
  periods: { months: [], years: [] },
};
window.App = App;

// ── Helpers ──────────────────────────────────────────────────────────────
function qs(sel, ctx = document)  { return ctx.querySelector(sel); }
function qsa(sel, ctx = document) { return Array.from(ctx.querySelectorAll(sel)); }
function hasActiveDateRange()     { return Boolean(App.dateFrom && App.dateTo); }
function clearDateRange() {
  App.dateFrom = '';
  App.dateTo = '';
  App.rangeLabel = '';
}

function fmtVND(n) {
  n = parseFloat(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B ₫';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M ₫';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K ₫';
  return n.toLocaleString('vi-VN') + ' ₫';
}

function fmtNum(n) {
  return parseInt(n, 10).toLocaleString('vi-VN');
}

function fmtDate(d) {
  if (!d) return '';
  return d.slice(0, 10);
}

function fmtDateTime(d) {
  if (!d) return '—';
  return String(d).replace('T', ' ').slice(0, 16);
}

function getUserDisplayName() {
  return App.user?.full_name || App.user?.username || 'A';
}

function getUserInitials(name) {
  const parts = String(name || 'A').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isAdminUser() {
  return (App.user?.role || '') === 'admin';
}

function getRoleLabel(role = App.user?.role || 'staff') {
  return t(`admin.role.${role}`) || role;
}

function resolveAvatarUrl(path) {
  return path ? encodeURI(path).replace(/#/g, '%23') : '';
}

function paintAvatar(el, name, avatarPath = '') {
  if (!el) return;
  const initials = getUserInitials(name);
  const imageUrl = resolveAvatarUrl(avatarPath);
  el.textContent = imageUrl ? '' : initials;
  el.style.backgroundImage = imageUrl ? `url("${imageUrl}")` : '';
  el.classList.toggle('has-image', Boolean(imageUrl));
  el.setAttribute('aria-label', imageUrl ? `${name} avatar` : initials);
}

function evaluatePasswordStrength(password) {
  const value = String(password || '');
  const length = value.length;
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSymbol = /[^a-zA-Z\d]/.test(value);
  const variety = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  let level = 'weak';
  if (length >= 8 && variety >= 2) level = 'medium';
  if (length >= 10 && variety >= 3) level = 'strong';
  if (length >= 12 && variety === 4) level = 'very_strong';

  return {
    level,
    length,
    variety,
    meetsMinimum: length >= 8 && variety >= 2,
  };
}

function getPasswordStrengthLabel(level) {
  return t(`password.strength.${level}`);
}

function renderPasswordStrength(root, password) {
  if (!root) return;

  const value = String(password || '');
  const strength = evaluatePasswordStrength(value);
  const fill = qs('.password-strength-fill', root);
  const valueEl = qs('.password-strength-value', root);
  const noteEl = qs('.password-strength-note', root);

  root.classList.toggle('is-empty', value === '');
  root.dataset.level = strength.level;

  if (fill) {
    const width = value === ''
      ? 0
      : ({ weak: 24, medium: 52, strong: 78, very_strong: 100 }[strength.level] || 0);
    fill.style.width = `${width}%`;
  }

  if (valueEl) {
    valueEl.textContent = value === ''
      ? t('password.strength.empty')
      : `${t('password.strength.label')}: ${getPasswordStrengthLabel(strength.level)}`;
  }

  if (noteEl) {
    noteEl.textContent = value === ''
      ? t('password.strength.minimum')
      : (strength.meetsMinimum ? t('password.strength.pass') : t('password.strength.fail'));
  }

  qsa('[data-password-rule]', root.parentElement || root).forEach(rule => {
    const ruleName = rule.dataset.passwordRule;
    const met = ruleName === 'length'
      ? strength.length >= 8
      : ruleName === 'variety'
        ? strength.variety >= 2
        : false;
    rule.classList.toggle('is-met', value !== '' && met);
  });

  return strength;
}

function syncPasswordStrengthIndicators() {
  renderPasswordStrength(qs('#adminUserPasswordStrength'), qs('#adminUserPassword')?.value || '');
  renderPasswordStrength(qs('#changePasswordStrength'), qs('#newPassword')?.value || '');
}

function ensurePasswordStrength(password) {
  const strength = evaluatePasswordStrength(password);
  if (strength.meetsMinimum) return strength;
  throw new Error(t('password.error.minimum'));
}

function maybeForcePasswordChange() {
  if (!App.user?.must_change_password) {
    App.passwordModalForced = false;
    return;
  }
  if (App.passwordModalForced && qs('#passwordModal')?.classList.contains('open')) {
    return;
  }
  openPasswordModal({ forced: true });
}

function syncPasswordModalState() {
  const modal = qs('#passwordModal');
  if (!modal) return;

  const forceAlert = qs('#passwordForceAlert');
  const closeBtn = qs('#btnClosePasswordModal');
  const cancelBtn = qs('#btnCancelPasswordModal');
  const titleEl = qs('#passwordModalTitle');
  const subEl = qs('.password-modal-sub', modal);

  if (forceAlert) forceAlert.hidden = !App.passwordModalForced;
  modal.classList.toggle('is-forced', App.passwordModalForced);
  if (closeBtn) closeBtn.hidden = App.passwordModalForced;
  if (cancelBtn) cancelBtn.textContent = App.passwordModalForced ? t('account.password.logout') : t('account.password.cancel');
  if (titleEl) titleEl.textContent = App.passwordModalForced ? t('account.password.force.modal_title') : t('account.password.title');
  if (subEl) subEl.textContent = App.passwordModalForced ? t('account.password.force.modal_sub') : t('account.password.sub');
}

function platformLabel(p) {
  return { shopee: 'Shopee', lazada: 'Lazada', tiktokshop: 'TikTok' }[p] || p;
}

function platformBadge(p) {
  const cls = { shopee: 'badge-shopee', lazada: 'badge-lazada', tiktokshop: 'badge-tiktokshop' }[p] || '';
  return `<span class="badge ${cls}">${platformLabel(p)}</span>`;
}

function statusBadge(s) {
  const map = {
    completed: 'badge-completed',
    delivered: 'badge-delivered',
    cancelled: 'badge-cancelled',
    pending:   'badge-pending',
  };
  const cls   = map[s] || 'badge-pending';
  const label = t(`status.${s}`) || s;
  return `<span class="badge ${cls}">${label}</span>`;
}

function toast(msg, type = 'info', duration = 3500) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
    ${type === 'success' ? '<polyline points="20 6 9 17 4 12"/>' : type === 'error' ? '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
  </svg><span>${msg}</span>`;
  qs('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── API client ───────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const filterParams = hasActiveDateRange()
    ? { date_from: App.dateFrom, date_to: App.dateTo, platform: App.platform }
    : { mode: App.mode, period: App.period, platform: App.platform };
  const params = new URLSearchParams({
    ...filterParams,
    ...(opts.params || {}),
  });
  const url = `api/${path}?${params}`;
  const res = await fetch(url, {
    headers: { 'X-CSRF-Token': App.csrf, ...opts.headers },
    ...opts,
  });
  if (res.status === 401) { showAuth(); throw new Error('Unauthenticated'); }
  const data = await res.json();
  if (!data.success && !opts.allowError) throw new Error(data.error || 'API error');
  return data;
}

// Generic fetch with CSRF (for endpoints that don't need dashboard filter params)
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'X-CSRF-Token': App.csrf, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (res.status === 401) { showAuth(); throw new Error('Unauthenticated'); }
  return res.json();
}

// ── Auth ─────────────────────────────────────────────────────────────────
function showAuth() {
  App.passwordModalForced = false;
  closeCustomerDetail();
  closeUserMenu();
  closeProfileModal();
  closePasswordModal({ force: true });
  qs('#auth-screen').classList.remove('hidden');
  qs('#app').classList.add('hidden');
}

function hideAuth() {
  qs('#auth-screen').classList.add('hidden');
  qs('#app').classList.remove('hidden');
}

function applyAuthUI() {
  const displayName = getUserDisplayName();
  const avatarPath = App.user?.avatar_path || '';

  paintAvatar(qs('#headerAvatar'), displayName, avatarPath);
  paintAvatar(qs('#userMenuAvatar'), displayName, avatarPath);
  paintAvatar(qs('#profileAvatarPreview'), displayName, avatarPath);

  const headerUserName = qs('#headerUserName');
  if (headerUserName) headerUserName.textContent = displayName;

  const headerUserRole = qs('#headerUserRole');
  if (headerUserRole) headerUserRole.textContent = getRoleLabel();

  const userMenuName = qs('#userMenuName');
  if (userMenuName) userMenuName.textContent = displayName;

  const userMenuUsername = qs('#userMenuUsername');
  if (userMenuUsername) userMenuUsername.textContent = `@${App.user?.username || 'guest'}`;

  const userMenuRole = qs('#userMenuRole');
  if (userMenuRole) userMenuRole.textContent = getRoleLabel();

  const profileUsername = qs('#profileUsername');
  if (profileUsername) profileUsername.value = App.user?.username || '';

  const profileFullName = qs('#profileFullName');
  if (profileFullName && document.activeElement !== profileFullName) {
    profileFullName.value = App.user?.full_name || '';
  }

  qsa('.admin-only').forEach(el => {
    el.classList.toggle('hidden-by-role', !isAdminUser());
  });

  const roleEl = qs('#adminHeroRole');
  if (roleEl) {
    roleEl.textContent = isAdminUser() ? 'Admin' : 'Staff';
  }

  const badge = qs('#adminNavBadge');
  if (badge) badge.style.display = isAdminUser() ? (badge.style.display || 'none') : 'none';

  renderUserLanguageOptions(I18n.getAvailableLangs());
}

async function initAuth() {
  try {
    const data = await fetch('api/auth.php').then(r => r.json());
    if (data.logged_in) {
      App.csrf = data.csrf;
      App.user = data.user || null;
      applyAuthUI();
      hideAuth();
      return true;
    }
  } catch (e) {}
  showAuth();
  return false;
}

function setupLogin() {
  const form = qs('#loginForm');
  const errEl = qs('#loginError');
  const btn   = qs('#loginBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = t('login.logging_in');

    try {
      const data = await fetch('api/auth.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: qs('#loginUsername').value.trim(),
          password: qs('#loginPassword').value,
        }),
      }).then(r => r.json());

      if (data.success) {
        App.csrf = data.csrf;
        App.user = data.user || null;
        applyAuthUI();
        hideAuth();
        setupAppShell();
        await loadPeriods();
        loadPage(App.currentPage);
      } else {
        errEl.textContent = data.error || t('login.failed');
      }
    } catch (e) {
      errEl.textContent = t('login.server_error');
    } finally {
      btn.disabled = false;
      btn.textContent = t('login.btn');
    }
  });
}

async function logout() {
  App.passwordModalForced = false;
  closeUserMenu();
  closeProfileModal();
  closePasswordModal({ force: true });
  await fetch('api/auth.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': App.csrf },
    body: JSON.stringify({ action: 'logout' }),
  });
  App.user = null;
  applyAuthUI();
  showAuth();
}

// ── Period picker ─────────────────────────────────────────────────────────
let _pickerGridYear = new Date().getFullYear();

async function loadPeriods() {
  try {
    const data = await api('date-periods.php', { params: {} });
    App.periods = data;
    if (!App.period) {
      const list = App.mode === 'month' ? data.months : data.years;
      if (list?.length) App.period = list[0].value;
    }
    renderPeriodLabel();
  } catch (e) {
    console.warn('loadPeriods error', e);
  }
}

function renderPeriodLabel() {
  const el   = qs('#periodLabel');
  const prev = qs('#periodPrev');
  const next = qs('#periodNext');
  if (!el) return;

  if (hasActiveDateRange()) {
    el.textContent = App.rangeLabel
      ? (t(App.rangeLabel) || App.rangeLabel)
      : `${App.dateFrom} → ${App.dateTo}`;
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    return;
  }

  if (!App.period) { el.textContent = t('period.select'); return; }
  if (App.mode === 'month') {
    const [y, m] = App.period.split('-');
    el.textContent = `${t('period.month')} ${parseInt(m, 10)}  ·  ${y}`;
  } else {
    el.textContent = `${t('period.year')} ${App.period}`;
  }
  const list = App.mode === 'month'
    ? (App.periods.months || []).map(x => x.value)
    : (App.periods.years  || []).map(x => x.value);
  const idx = list.indexOf(App.period);
  if (prev) prev.disabled = (idx >= list.length - 1);
  if (next) next.disabled = (idx <= 0);
}

function renderPeriodGrid() {
  const grid = qs('#periodGrid');
  if (!grid) return;
  const yearEl = qs('#periodGridYear');
  if (yearEl) yearEl.textContent = _pickerGridYear;

  const { months = [], years = [] } = App.periods;
  grid.innerHTML = '';

  if (App.mode === 'month') {
    const available = new Set(months.map(m => m.value));
    for (let m = 1; m <= 12; m++) {
      const val = `${_pickerGridYear}-${String(m).padStart(2, '0')}`;
      const btn = document.createElement('button');
      btn.textContent = `T${m}`;
      const isActive = val === App.period;
      const hasData  = available.has(val);
      btn.className  = 'pp-cell' + (isActive ? ' active' : '') + (hasData ? ' has-data' : '');
      if (hasData) {
        btn.addEventListener('click', () => {
          clearDateRange();
          App.period = val;
          renderPeriodLabel();
          renderPeriodGrid();
          closePeriodPanel();
          loadPage(App.currentPage);
        });
      }
      grid.appendChild(btn);
    }
  } else {
    const available = new Set(years.map(y => y.value));
    const start = _pickerGridYear - 2;
    for (let y = start; y < start + 6; y++) {
      const val = String(y);
      const btn = document.createElement('button');
      btn.textContent = val;
      const isActive = val === App.period;
      const hasData  = available.has(val);
      btn.className  = 'pp-cell wide' + (isActive ? ' active' : '') + (hasData ? ' has-data' : '');
      if (hasData) {
        btn.addEventListener('click', () => {
          clearDateRange();
          App.period = val;
          renderPeriodLabel();
          renderPeriodGrid();
          closePeriodPanel();
          loadPage(App.currentPage);
        });
      }
      grid.appendChild(btn);
    }
  }
}

function openPeriodPanel() {
  _pickerGridYear = App.period ? parseInt(App.period.slice(0, 4), 10) : new Date().getFullYear();
  renderPeriodGrid();
  qs('#periodPanel')?.classList.add('open');
  qs('#periodLabelBtn')?.closest('.period-picker')?.classList.add('pp-panel-open');
}

function closePeriodPanel() {
  qs('#periodPanel')?.classList.remove('open');
  qs('#periodPicker')?.classList.remove('pp-panel-open');
}

function navigatePeriod(dir) {
  clearDateRange();
  const list = App.mode === 'month'
    ? (App.periods.months || []).map(x => x.value)
    : (App.periods.years  || []).map(x => x.value);
  const idx = list.indexOf(App.period);
  if (idx === -1) return;
  const newIdx = idx + (dir === -1 ? 1 : -1);
  if (newIdx < 0 || newIdx >= list.length) return;
  App.period = list[newIdx];
  renderPeriodLabel();
  loadPage(App.currentPage);
}

function _isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _applyPreset(preset) {
  const now   = new Date();
  const today = _isoDate(now);

  // Reset range state
  clearDateRange();

  if (preset === 'today') {
    App.dateFrom   = today;
    App.dateTo     = today;
    App.rangeLabel = 'preset.today';
  } else if (preset === 'yesterday') {
    const d = new Date(now); d.setDate(d.getDate() - 1);
    App.dateFrom   = _isoDate(d);
    App.dateTo     = _isoDate(d);
    App.rangeLabel = 'preset.yesterday';
  } else if (preset === '7days') {
    const d = new Date(now); d.setDate(d.getDate() - 6);
    App.dateFrom   = _isoDate(d);
    App.dateTo     = today;
    App.rangeLabel = 'preset.7days_ago';
  } else if (preset === '30days') {
    const d = new Date(now); d.setDate(d.getDate() - 29);
    App.dateFrom   = _isoDate(d);
    App.dateTo     = today;
    App.rangeLabel = 'preset.30days_ago';
  } else if (preset === 'this-month') {
    App.mode   = 'month';
    App.period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  } else if (preset === 'last-month') {
    App.mode   = 'month';
    const d    = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    App.period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  } else if (preset === 'this-year') {
    App.mode   = 'year';
    App.period = String(now.getFullYear());
  }

  _syncModeButtons();
  renderPeriodLabel();
  closePeriodPanel();
  loadPage(App.currentPage);
}

function _syncModeButtons() {
  qsa('.pp-mode').forEach(b => b.classList.toggle('active', b.dataset.mode === App.mode));
}

function setupPeriodPicker() {
  qsa('.pp-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === App.mode) return;
      clearDateRange();
      App.mode = btn.dataset.mode;
      const list = App.mode === 'month' ? (App.periods.months || []) : (App.periods.years || []);
      App.period = list.length ? list[0].value : '';
      _syncModeButtons();
      renderPeriodLabel();
      renderPeriodGrid();
      loadPage(App.currentPage);
    });
  });

  qs('#periodLabelBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    qs('#periodPanel')?.classList.contains('open') ? closePeriodPanel() : openPeriodPanel();
  });

  document.addEventListener('click', e => {
    if (!qs('#periodPicker')?.contains(e.target)) closePeriodPanel();
  });

  qs('#periodPrev')?.addEventListener('click', () => navigatePeriod(-1));
  qs('#periodNext')?.addEventListener('click', () => navigatePeriod(1));

  qs('#periodGridPrev')?.addEventListener('click', e => {
    e.stopPropagation();
    _pickerGridYear--;
    renderPeriodGrid();
  });
  qs('#periodGridNext')?.addEventListener('click', e => {
    e.stopPropagation();
    _pickerGridYear++;
    renderPeriodGrid();
  });

  qsa('.pp-preset').forEach(btn => {
    btn.addEventListener('click', () => _applyPreset(btn.dataset.preset));
  });
}

// ── Platform filter ──────────────────────────────────────────────────────
function setupPlatformFilter() {
  qsa('.platform-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      App.platform = btn.dataset.platform;
      qsa('.platform-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadPage(App.currentPage);
    });
  });
}

// ── Navigation ───────────────────────────────────────────────────────────
function setupNav() {
  qsa('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => {
      loadPage(item.dataset.page);
    });
  });
}

function syncHeaderControls(page) {
  document.body.classList.toggle('page-admin-active', page === 'admin');
}

function loadPage(name) {
  if (name === 'connect') {
    App.adminTab = 'api';
    name = 'admin';
  } else if (name === 'settings') {
    App.adminTab = 'system';
    name = 'admin';
  }

  if (name === 'admin' && !isAdminUser()) {
    toast('Bạn không có quyền truy cập khu quản trị.', 'error');
    name = 'overview';
  }

  App.currentPage = name;
  syncHeaderControls(name);

  // Update sidebar active
  qsa('.nav-item[data-page]').forEach(item => {
    item.classList.toggle('active', item.dataset.page === name);
  });

  // Show page
  qsa('.page').forEach(p => p.classList.remove('active'));
  const pg = qs(`#page-${name}`);
  if (pg) pg.classList.add('active');

  // Load data
  const loaders = {
    overview:   loadOverview,
    orders:     loadOrders,
    products:   loadProducts,
    customers:  loadCustomers,
    traffic:    loadTraffic,
    comparison: loadComparison,
    heatmaps:   loadHeatmaps,
    upload:     loadUploadHistory,
    logs:       loadLogs,
    admin:      loadAdminPage,
  };
  if (loaders[name]) loaders[name]();
  if (App.user?.must_change_password) {
    setTimeout(() => maybeForcePasswordChange(), 0);
  }
}

// ── Page Loaders ─────────────────────────────────────────────────────────

async function loadOverview() {
  try {
    const [rev, orders, traffic, products] = await Promise.all([
      api('revenue.php'),
      api('orders.php'),
      api('traffic.php'),
      api('products.php', { params: { limit: 6 } }),
    ]);

    // KPIs
    qs('#kpi-revenue').textContent = fmtVND(rev.summary.total_revenue);
    qs('#kpi-orders').textContent  = fmtNum(orders.summary.total);
    qs('#kpi-completed').textContent = fmtNum(orders.summary.completed);
    qs('#kpi-views').textContent   = fmtNum(traffic.summary.total_views);
    qs('#kpi-visitors').textContent= fmtNum(traffic.summary.total_visits);

    // Charts
    Charts.renderRevenueTrend('chartRevenueTrend', rev.timeseries, rev.granularity);
    Charts.renderPlatformDonut('chartPlatformDonut', rev.platform_breakdown);
    renderTopProducts('topProductsOverview', products.top_revenue || []);
    renderRecentOrders('recentOrdersMini', orders.recent);

    // Platform legend
    renderPlatformLegend('platformLegend', rev.platform_breakdown, rev.summary.total_revenue);
  } catch (e) {
    console.error('loadOverview', e);
    toast(t('toast.load_overview'), 'error');
  }
}

async function loadOrders() {
  try {
    const data = await api('orders.php');

    qs('#ord-total').textContent     = fmtNum(data.summary.total);
    qs('#ord-completed').textContent = fmtNum(data.summary.completed);
    qs('#ord-cancelled').textContent = fmtNum(data.summary.cancelled);
    qs('#ord-cancel-rate').textContent = data.summary.cancel_rate + '%';

    Charts.renderOrdersTrend('chartOrdersTrend', data.timeseries, data.granularity);
    Charts.renderStatusDonut('chartOrdersStatus', data.summary);
    Charts.renderPlatformOrders('chartPlatformOrders', data.by_platform);
    Charts.renderHourlyBar('chartHourly', data.hourly);

    _ordersAll  = data.recent || [];
    _ordersPage = 1;
    renderOrdersTablePage('ordersTable', 'ordersPager');
    renderStatusLegend('statusLegend', data.summary);
  } catch (e) {
    console.error('loadOrders', e);
    toast(t('toast.load_orders'), 'error');
  }
}

async function loadProducts() {
  try {
    const data = await api('products.php');

    qs('#total-skus').textContent      = fmtNum(data.total_skus);
    qs('#prod-qty-all').textContent    = fmtNum(data.total_qty_all);
    qs('#prod-qty-delivered').textContent = fmtNum(data.total_qty_delivered);
    qs('#prod-avg-qty').textContent    = data.avg_qty_per_order.toFixed(2);

    Charts.renderTopQtyBar('chartTopQty', data.top_qty);
    Charts.renderTopRevBar('chartTopRev', data.top_revenue);
    renderTopRevMini('topRevMini', data.top_revenue);
    _productsAll  = data.all || [];
    _productsPage = 1;
    renderProductsTablePage('productsTable', 'productsPager');
  } catch (e) {
    console.error('loadProducts', e);
    toast(t('toast.load_products'), 'error');
  }
}

async function loadCustomers() {
  try {
    const data = await api('customers.php');

    qs('#cust-total').textContent  = fmtNum(data.summary.total_orders);
    qs('#cust-aov').textContent    = fmtVND(data.summary.avg_order_value);
    qs('#cust-buyers').textContent = fmtNum(data.summary.unique_buyers || 0);

    // Conversion rate KPI
    const conv = data.summary.conv_rate || 0;
    qs('#cust-conv').textContent = conv > 0 ? conv.toFixed(2) + '%' : '—';
    const convEl = qs('#cust-conv');
    if (convEl) {
      const sub = convEl.nextElementSibling;
      if (sub && data.summary.total_visits > 0) {
        sub.textContent = `${fmtNum(data.summary.total_orders)} đơn / ${fmtNum(data.summary.total_visits)} visit`;
      }
    }

    // Customer segments donut
    const seg = data.customer_segments || {};
    const segTotal = (seg.new_buyers || 0) + (seg.returning_buyers || 0) + (seg.potential_buyers || 0);
    const segTotalEl = qs('#custSegTotal');
    if (segTotalEl) segTotalEl.textContent = fmtNum(segTotal);
    Charts.renderCustomerSegmentDonut('chartCustomerSegments', seg);

    // Segment legend
    const legendEl = qs('#custSegLegend');
    if (legendEl && segTotal > 0) {
      const items = [
        { label: t('seg.new'),       value: seg.new_buyers       || 0, color: '#3b82f6' },
        { label: t('seg.returning'), value: seg.returning_buyers || 0, color: '#10b981' },
        { label: t('seg.potential'), value: seg.potential_buyers || 0, color: '#f59e0b' },
      ];
      legendEl.innerHTML = items.map(it => `
        <div class="legend-item">
          <span class="legend-dot" style="background:${it.color}"></span>
          <span>${it.label}: <strong>${fmtNum(it.value)}</strong>
            <span style="color:var(--text-muted);font-size:11px">(${segTotal > 0 ? (it.value/segTotal*100).toFixed(1) : 0}%)</span>
          </span>
        </div>`).join('');
    }

    _citiesAll  = data.city_distribution || [];
    _citiesPage = 1;
    renderCityListPage('cityList', 'cityListPager');
    renderCustomerStatsTable('customerStatsTable', data.buyer_stats || []);

    Charts.renderDistrictBar('chartHcmDistricts', data.hcm_districts || [], 'TP. Hồ Chí Minh');
    Charts.renderDistrictBar('chartHanoiDistricts', data.hanoi_districts || [], 'Hà Nội');
  } catch (e) {
    console.error('loadCustomers', e);
    toast(t('toast.load_customers'), 'error');
  }
}

async function loadTraffic() {
  try {
    const data = await api('traffic.php');

    qs('#tr-views').textContent  = fmtNum(data.summary.total_views);
    qs('#tr-visits').textContent = fmtNum(data.summary.total_visits);
    const convRate = data.summary.total_visits > 0
      ? ((parseInt(data.orders_by_date ? Object.values(data.orders_by_date).reduce((a,b)=>a+(+b),0) : 0) / data.summary.total_visits) * 100).toFixed(1)
      : 0;
    qs('#tr-bounce').textContent = data.summary.avg_bounce_rate + '%';

    Charts.renderTrafficTrend('chartTrafficTrend', data.timeseries, data.granularity, data.orders_by_date);
    Charts.renderTrafficPlatform('chartTrafficPlatform', data.by_platform);
  } catch (e) {
    console.error('loadTraffic', e);
    toast(t('toast.load_traffic'), 'error');
  }
}

async function loadComparison() {
  try {
    const data = await api('comparison.php', { params: {} });

    renderPlatformCards(data.platforms);
    Charts.renderCompareRevenue('chartCompareRevenue', data.platforms);
    Charts.renderCompareOrders('chartCompareOrders', data.platforms);
    Charts.renderRadar('chartRadar', data.platforms);
    renderTopProductsTable('comparisonTable', data.top_products);
  } catch (e) {
    console.error('loadComparison', e);
    toast(t('toast.load_comparison'), 'error');
  }
}

async function loadHeatmaps() {
  try {
    const data = await api('heatmap.php');
    _ensureHeatmapTooltip();
    renderHeatmap7x24('heatmap7x24',        data.heatmap, data.max_orders,  'orders');
    renderHeatmap7x24('heatmapRevenue7x24', data.heatmap, data.max_revenue, 'revenue');
    Charts.renderRevByCity('chartRevenueCity', data.revenue_by_city);
  } catch (e) {
    console.error('loadHeatmaps', e);
    toast(t('toast.load_heatmap'), 'error');
  }
}

async function loadUploadHistory() {
  try {
    const data = await api('upload-history.php', { params: {} });
    renderUploadHistory('uploadHistoryTable', data.history);
  } catch (e) {
    console.error('loadUploadHistory', e);
  }
}

// ── Pagination ────────────────────────────────────────────────────────────

const PER_PAGE = 10;
let _ordersAll = [], _ordersPage = 1;
let _productsAll = [], _productsPage = 1;
let _citiesAll = [], _citiesPage = 1;

function renderPager(pagerId, page, total, perPage, navFn) {
  const el = qs(`#${pagerId}`); if (!el) return;
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) { el.innerHTML = `<p class="pager-info">${t('msg.total')}: ${total}</p>`; return; }

  let html = `<div class="pager">`;
  html += `<button onclick="${navFn}(${page-1})" ${page<=1?'disabled':''}>&#8249;</button>`;
  const start = Math.max(1, page - 2);
  const end   = Math.min(pages, page + 2);
  if (start > 1) { html += `<button onclick="${navFn}(1)">1</button>`; if (start > 2) html += `<span>…</span>`; }
  for (let p = start; p <= end; p++) {
    html += `<button class="${p===page?'pager-active':''}" onclick="${navFn}(${p})">${p}</button>`;
  }
  if (end < pages) { if (end < pages-1) html += `<span>…</span>`; html += `<button onclick="${navFn}(${pages})">${pages}</button>`; }
  html += `<button onclick="${navFn}(${page+1})" ${page>=pages?'disabled':''}>&#8250;</button>`;
  html += `</div><p class="pager-info">${(page-1)*perPage+1}–${Math.min(page*perPage,total)} / ${total}</p>`;
  el.innerHTML = html;
}

function gotoOrdersPage(p) { _ordersPage = p; renderOrdersTablePage('ordersTable','ordersPager'); }
function gotoProductsPage(p) { _productsPage = p; renderProductsTablePage('productsTable','productsPager'); }
function gotoCityPage(p) { _citiesPage = p; renderCityListPage('cityList','cityListPager'); }
window.gotoOrdersPage   = gotoOrdersPage;
window.gotoProductsPage = gotoProductsPage;
window.gotoCityPage     = gotoCityPage;

function renderOrdersTablePage(tbodyId, pagerId) {
  const page  = _ordersPage;
  const slice = _ordersAll.slice((page-1)*PER_PAGE, page*PER_PAGE);
  const tbody = qs(`#${tbodyId}`); if (!tbody) return;
  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">${t('msg.no_data')}</td></tr>`;
  } else {
    tbody.innerHTML = slice.map(o => `
    <tr>
      <td class="font-mono" style="font-size:11px;color:var(--text-muted)">${(o.order_id||'').slice(0,16)}…</td>
      <td style="max-width:200px">
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;font-size:12px">
          ${(o.product_name||'').replace(/\[.*?\]\s*/g,'').trim().slice(0,50)}
        </div>
      </td>
      <td>${platformBadge(o.platform)}</td>
      <td style="font-size:12px;color:var(--text-muted)">${fmtDate(o.order_created_at)}</td>
      <td class="text-right" style="font-weight:600;font-size:12px">${fmtVND(o.order_total)}</td>
      <td>${statusBadge(o.normalized_status)}</td>
    </tr>`).join('');
  }
  renderPager(pagerId, page, _ordersAll.length, PER_PAGE, 'gotoOrdersPage');
}

function renderProductsTablePage(tbodyId, pagerId) {
  const page  = _productsPage;
  const slice = _productsAll.slice((page-1)*PER_PAGE, page*PER_PAGE);
  const tbody = qs(`#${tbodyId}`); if (!tbody) return;
  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">${t('msg.no_data')}</td></tr>`;
  } else {
    tbody.innerHTML = slice.map(p => `
    <tr>
      <td class="font-mono" style="font-size:11px;color:var(--text-muted)">${(p.sku||'').slice(0,16)}</td>
      <td style="font-size:12px;max-width:240px">
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.product_name||''}</div>
      </td>
      <td>${platformBadge(p.platform)}</td>
      <td class="text-right" style="font-weight:600;font-size:12px">${fmtNum(p.total_qty)}</td>
      <td class="text-right" style="font-weight:600;font-size:12px;color:var(--primary)">${fmtVND(p.total_revenue)}</td>
    </tr>`).join('');
  }
  renderPager(pagerId, page, _productsAll.length, PER_PAGE, 'gotoProductsPage');
}

function renderCityListPage(listId, pagerId) {
  const el = qs(`#${listId}`); if (!el) return;
  const list = _citiesAll.slice(0, 8);
  const pager = qs(`#${pagerId}`);

  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><p>${t('msg.no_data')}</p></div>`;
    if (pager) pager.innerHTML = '';
    return;
  }

  const maxO = Math.max(...list.map(c => c.orders || 0), 1);
  el.innerHTML = `<div class="location-grid">${list.map((city, index) => {
    const barWidth = Math.max(12, Math.round(((city.orders || 0) / maxO) * 100));
    return `
      <article class="location-card">
        <div class="location-card-top">
          <span class="location-rank">${index + 1}</span>
          <span class="location-share">${city.percentage || 0}%</span>
        </div>
        <div class="location-city">${escHtml(city.city || '—')}</div>
        <div class="location-orders">${fmtNum(city.orders || 0)} ${t('cl.orders')}</div>
        <div class="location-bar"><span class="location-bar-fill" style="width:${barWidth}%"></span></div>
        <div class="location-footer">
          <span>${t('th.revenue')}</span>
          <strong>${fmtVND(city.revenue || 0)}</strong>
        </div>
      </article>`;
  }).join('')}</div>`;

  if (pager) pager.innerHTML = '';
}

// ── DOM Renderers ─────────────────────────────────────────────────────────

function renderRecentOrders(containerId, orders) {
  const el = qs(`#${containerId}`);
  if (!el) return;
  if (!orders || !orders.length) { el.innerHTML = `<div class="empty-state"><p>${t('msg.no_orders')}</p></div>`; return; }
  const colors = { shopee: '#ee4d2d', lazada: '#0f146d', tiktokshop: '#161823' };
  el.innerHTML = (orders || []).slice(0, 5).map(o => `
    <div class="recent-order-item">
      <div class="recent-order-dot" style="background:${colors[o.platform]||'#64748b'}">${(o.platform||'?')[0].toUpperCase()}</div>
      <div class="recent-order-info">
        <div class="recent-order-name">${(o.product_name||'').replace(/\[.*?\]\s*/g,'').trim().slice(0,42)}...</div>
        <div class="recent-order-meta">${o.shipping_city||''} · ${fmtDate(o.order_created_at)}</div>
      </div>
      <div class="recent-order-amount">${fmtVND(o.order_total)}</div>
    </div>`).join('');
}

function renderPlatformLegend(id, breakdown, total) {
  const el = qs(`#${id}`); if (!el) return;
  const plats = [['shopee','#ee4d2d'],['tiktokshop','#161823'],['lazada','#0f146d']];
  el.innerHTML = plats.map(([p, c]) => {
    const pct = breakdown[p]?.percentage || 0;
    return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:3px 0">
      <span style="display:flex;align-items:center;gap:6px">
        <span style="width:10px;height:10px;border-radius:50%;background:${c};display:inline-block"></span>
        ${platformLabel(p)}
      </span>
      <span style="font-weight:600">${pct}%</span>
    </div>`;
  }).join('');
}

function renderTopProducts(id, products) {
  const el = qs(`#${id}`); if (!el) return;
  const list = (products || []).slice(0, 6);
  if (!list.length) { el.innerHTML = `<div class="empty-state"><p>${t('msg.no_data_yet')}</p></div>`; return; }
  el.innerHTML = list.map(product => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
      ${platformBadge(product.platform)}
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${(product.product_name||'').replace(/\[.*?\]\s*/g,'').trim().slice(0,46)}
        </div>
        <div style="font-size:11px;color:var(--text-muted)">${fmtNum(product.order_count || 0)} ${t('cl.orders')} · ${fmtNum(product.total_qty || 0)} ${t('cl.quantity')}</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:var(--primary);white-space:nowrap">${fmtVND(product.total_revenue || 0)}</div>
    </div>`).join('');
}

function renderOrdersTable(id, orders) {
  const tbody = qs(`#${id}`); if (!tbody) return;
  if (!orders || !orders.length) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">${t('msg.no_data')}</td></tr>`; return; }
  tbody.innerHTML = orders.map(o => `
    <tr>
      <td class="font-mono" style="font-size:11px;color:var(--text-muted)">${(o.order_id||'').slice(0,16)}…</td>
      <td style="max-width:200px">
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;font-size:12px">
          ${(o.product_name||'').replace(/\[.*?\]\s*/g,'').trim().slice(0,50)}
        </div>
      </td>
      <td>${platformBadge(o.platform)}</td>
      <td style="font-size:12px;color:var(--text-muted)">${fmtDate(o.order_created_at)}</td>
      <td class="text-right" style="font-weight:600;font-size:12px">${fmtVND(o.order_total)}</td>
      <td>${statusBadge(o.normalized_status)}</td>
    </tr>`).join('');
}

function renderStatusLegend(id, summary) {
  const el = qs(`#${id}`); if (!el) return;
  const items = [
    ['#10b981', t('status.completed'), summary.completed],
    ['#ef4444', t('status.cancelled'), summary.cancelled],
    ['#0284c7', t('status.in_transit'), summary.pending],
  ];
  el.innerHTML = items.map(([c,l,v]) => `
    <div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0">
      <span style="display:flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block"></span>${l}
      </span>
      <span style="font-weight:600">${fmtNum(v||0)}</span>
    </div>`).join('');
}

function renderTopRevMini(id, products) {
  const el = qs(`#${id}`); if (!el || !products) return;
  const maxRev = products[0]?.total_revenue || 1;
  el.innerHTML = '<div class="mini-bar-list">' + products.slice(0,5).map(p => `
    <div class="mini-bar-row">
      <div class="mini-bar-row-header">
        <span class="mini-bar-label">${(p.product_name||'').slice(0,30)}…</span>
        <span class="mini-bar-value">${fmtVND(p.total_revenue)}</span>
      </div>
      <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${Math.round(p.total_revenue/maxRev*100)}%;background:var(--primary-light)"></div></div>
    </div>`).join('') + '</div>';
}

function renderProductsTable(id, products) {
  const tbody = qs(`#${id}`); if (!tbody) return;
  if (!products || !products.length) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">${t('msg.no_data')}</td></tr>`; return; }
  tbody.innerHTML = products.map(p => `
    <tr>
      <td class="font-mono" style="font-size:11px;color:var(--text-muted)">${(p.sku||'').slice(0,16)}</td>
      <td style="font-size:12px;max-width:240px">
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.product_name||''}</div>
      </td>
      <td>${platformBadge(p.platform)}</td>
      <td class="text-right" style="font-weight:600;font-size:12px">${fmtNum(p.total_qty)}</td>
      <td class="text-right" style="font-weight:600;font-size:12px;color:var(--primary)">${fmtVND(p.total_revenue)}</td>
    </tr>`).join('');
}

function renderCityList(id, cities) {
  const el = qs(`#${id}`); if (!el) return;
  const maxO = cities[0]?.orders || 1;
  el.innerHTML = cities.slice(0,12).map((c, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:4px 0">
      <span style="font-size:11px;color:var(--text-muted);width:18px">${i+1}</span>
      <span style="font-size:13px;flex:1;color:var(--text-primary)">${c.city}</span>
      <div class="progress-bar-wrap" style="width:80px">
        <div class="progress-bar-fill" style="width:${Math.round(c.orders/maxO*100)}%;background:var(--primary-light)"></div>
      </div>
      <span style="font-size:12px;font-weight:600;width:36px;text-align:right">${fmtNum(c.orders)}</span>
    </div>`).join('');
}

function renderCustomerStatsTable(tbodyId, buyers) {
  const tbody = qs(`#${tbodyId}`); if (!tbody) return;
  if (!buyers || !buyers.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">${t('msg.no_data')}</td></tr>`;
    return;
  }

  const maxRevenue = Math.max(...buyers.map(b => b.revenue || 0), 1);
  tbody.innerHTML = buyers.map((buyer, index) => {
    const revenueWidth = Math.max(10, Math.round(((buyer.revenue || 0) / maxRevenue) * 100));
    return `
      <tr class="customer-row-button" data-buyer-username="${escHtml(buyer.buyer_username)}">
        <td><span class="customer-rank-pill">${index + 1}</span></td>
        <td>
          <div class="customer-identity">
            <div class="customer-identity-name font-mono">${escHtml(buyer.buyer_username)}</div>
            <div class="customer-identity-bar">
              <span class="customer-identity-bar-fill" style="width:${revenueWidth}%"></span>
            </div>
          </div>
        </td>
        <td class="text-right"><strong>${fmtNum(buyer.order_count || 0)}</strong></td>
        <td class="text-right">${fmtNum(buyer.item_qty || 0)}</td>
        <td class="text-right">
          <div class="customer-revenue-value">${fmtVND(buyer.revenue || 0)}</div>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('tr[data-buyer-username]').forEach(row => {
    row.addEventListener('click', () => openCustomerDetail(row.dataset.buyerUsername));
  });
}

function setupCustomerDetailDrawer() {
  qs('#btnCloseCustomerDetail')?.addEventListener('click', closeCustomerDetail);
  qsa('[data-customer-close]').forEach(el => el.addEventListener('click', closeCustomerDetail));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCustomerDetail();
  });
}

function closeCustomerDetail() {
  const drawer = qs('#customerDetailDrawer');
  if (!drawer) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
}

function openCustomerDrawerShell() {
  const drawer = qs('#customerDetailDrawer');
  if (!drawer) return;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
}

async function openCustomerDetail(username) {
  if (!username) return;

  openCustomerDrawerShell();
  const titleEl = qs('#customerDetailTitle');
  const subEl   = qs('#customerDetailSubtitle');
  const bodyEl  = qs('#customerDetailBody');

  if (titleEl) titleEl.textContent = username;
  if (subEl) subEl.textContent = t('customer.detail.loading');
  if (bodyEl) bodyEl.innerHTML = `<div class="customer-detail-loading">${t('customer.detail.loading')}</div>`;

  try {
    const data = await api('customers.php', {
      params: {
        action: 'detail',
        buyer_username: username,
      },
    });
    renderCustomerDetail(data);
  } catch (e) {
    if (bodyEl) bodyEl.innerHTML = `<div class="customer-detail-loading" style="color:var(--red,#ef4444)">${t('customer.detail.load_error')}</div>`;
  }
}

function renderCustomerDetail(data) {
  const profile = data.profile || {};
  const summary = data.summary || {};
  const orders  = data.orders || [];

  const titleEl = qs('#customerDetailTitle');
  const subEl   = qs('#customerDetailSubtitle');
  const bodyEl  = qs('#customerDetailBody');
  if (!bodyEl) return;

  const latestAddress = [profile.shipping_address, profile.shipping_district, profile.shipping_city].filter(Boolean).join(', ') || '—';

  if (titleEl) titleEl.textContent = profile.buyer_name || profile.buyer_username || '—';
  if (subEl) {
    subEl.textContent = `${profile.buyer_username || '—'} · ${t('customer.detail.latest_address')}: ${latestAddress}`;
  }

  bodyEl.innerHTML = `
    <div class="customer-metric-grid">
      <div class="customer-metric-card">
        <div class="customer-metric-label">${t('customer.detail.filtered_orders')}</div>
        <div class="customer-metric-value">${fmtNum(summary.filtered_order_count || 0)}</div>
        <div class="customer-metric-sub">${fmtNum(summary.filtered_item_qty || 0)} ${t('customer.detail.products')}</div>
      </div>
      <div class="customer-metric-card">
        <div class="customer-metric-label">${t('customer.detail.filtered_revenue')}</div>
        <div class="customer-metric-value">${fmtVND(summary.filtered_revenue || 0)}</div>
        <div class="customer-metric-sub">${t('customer.detail.current_filter')}</div>
      </div>
      <div class="customer-metric-card">
        <div class="customer-metric-label">${t('customer.detail.lifetime_orders')}</div>
        <div class="customer-metric-value">${fmtNum(summary.lifetime_order_count || 0)}</div>
        <div class="customer-metric-sub">${fmtNum(summary.lifetime_item_qty || 0)} ${t('customer.detail.products')}</div>
      </div>
      <div class="customer-metric-card">
        <div class="customer-metric-label">${t('customer.detail.lifetime_revenue')}</div>
        <div class="customer-metric-value">${fmtVND(summary.lifetime_revenue || 0)}</div>
        <div class="customer-metric-sub">${t('customer.detail.all_time')}</div>
      </div>
    </div>

    <div class="customer-info-card">
      <div class="customer-info-head">
        <div>
          <h4>${t('customer.detail.profile')}</h4>
          <p>${t('customer.detail.profile_sub')}</p>
        </div>
      </div>
      <div class="customer-info-list">
        <div class="customer-info-item">
          <span>${t('customer.detail.first_purchase')}</span>
          <span>${fmtDateTime(profile.first_purchase_at)}</span>
        </div>
        <div class="customer-info-item">
          <span>${t('customer.detail.last_purchase')}</span>
          <span>${fmtDateTime(profile.last_purchase_at)}</span>
        </div>
        <div class="customer-info-item">
          <span>${t('customer.detail.latest_address')}</span>
          <span>${escHtml(latestAddress)}</span>
        </div>
      </div>
    </div>

    <div class="customer-info-card">
      <div class="customer-info-head">
        <div>
          <h4>${t('customer.detail.history')}</h4>
          <p>${t('customer.detail.history_sub')}</p>
        </div>
      </div>
      <div class="customer-history-list">
        ${orders.length ? orders.map(order => `
          <article class="customer-order-card">
            <div class="customer-order-head">
              <div class="customer-order-main">
                <div class="customer-order-id font-mono">${escHtml(order.order_id)}</div>
                <div class="customer-order-date">${fmtDateTime(order.order_created_at)}${order.payment_method ? ` · ${escHtml(order.payment_method)}` : ''}</div>
              </div>
              <div class="customer-order-side">
                ${platformBadge(order.platform)}
                ${statusBadge(order.normalized_status)}
                <div class="customer-order-revenue">${fmtVND(order.order_total || 0)}</div>
              </div>
            </div>
            <div class="customer-order-products">${escHtml(order.products || '—')}</div>
            <div class="customer-order-meta">
              <span class="customer-order-chip">${fmtNum(order.item_qty || 0)} ${t('customer.detail.products')}</span>
              ${order.shipping_city ? `<span class="customer-order-chip">${escHtml(order.shipping_city)}</span>` : ''}
              ${order.shipping_district ? `<span class="customer-order-chip">${escHtml(order.shipping_district)}</span>` : ''}
            </div>
            <div class="customer-order-address">${escHtml([order.shipping_address, order.shipping_district, order.shipping_city].filter(Boolean).join(', ') || '—')}</div>
          </article>
        `).join('') : `<div class="customer-detail-loading">${t('msg.no_orders')}</div>`}
      </div>
    </div>
  `;
}

function renderPlatformCards(platforms) {
  ['shopee','lazada','tiktokshop'].forEach(p => {
    const el = qs(`#platform-card-${p}`); if (!el) return;
    const d = platforms[p] || {};
    el.querySelector('.pc-orders').textContent    = fmtNum(d.total_orders || 0);
    el.querySelector('.pc-completed').textContent = fmtNum(d.completed || 0);
    el.querySelector('.pc-revenue').textContent   = fmtVND(d.revenue || 0);
    el.querySelector('.pc-share').textContent     = (d.market_share || 0) + '%';
    el.querySelector('.pc-aov').textContent       = fmtVND(d.aov || 0);
    el.querySelector('.pc-cancel').textContent    = (d.cancel_rate || 0) + '%';
  });
}

function renderTopProductsTable(id, topProducts) {
  const el = qs(`#${id}`); if (!el) return;
  const rows = [];
  const maxLen = Math.max(...Object.values(topProducts).map(a => a.length), 0);
  for (let i = 0; i < maxLen; i++) {
    rows.push(`<tr>
      ${['shopee','lazada','tiktokshop'].map(p => {
        const item = topProducts[p]?.[i];
        if (!item) return '<td></td>';
        return `<td style="font-size:11px;padding:6px 8px">
          <div style="font-weight:500">${(item.product_name||'').slice(0,30)}</div>
          <div style="color:var(--text-muted)">${fmtVND(item.revenue)}</div>
        </td>`;
      }).join('')}
    </tr>`);
  }
  el.innerHTML = rows.join('');
}

// Heatmap palettes (11 levels: 0=empty, 1–10=low→high)
const HEAT_PALETTE_ORDERS = [
  '#f1f5f9','#dbeafe','#bfdbfe','#93c5fd','#60a5fa',
  '#3b82f6','#2563eb','#1d4ed8','#1e3a8a','#172554','#0f1629',
];
const HEAT_PALETTE_REVENUE = [
  '#f0fdf4','#dcfce7','#bbf7d0','#86efac','#4ade80',
  '#22c55e','#16a34a','#15803d','#166534','#14532d','#052e16',
];

function renderHeatmap7x24(id, heatmap, maxVal, metric = 'orders') {
  const el = qs(`#${id}`); if (!el) return;
  const days   = [t('day.1'),t('day.2'),t('day.3'),t('day.4'),t('day.5'),t('day.6'),t('day.0')];
  const pal    = metric === 'revenue' ? HEAT_PALETTE_REVENUE : HEAT_PALETTE_ORDERS;
  const max    = maxVal || 1;

  const map = {};
  heatmap.forEach(h => { map[`${h.weekday}-${h.hour}`] = h[metric]; });

  let html = '<div class="heatmap-grid">';
  html += '<div class="heatmap-row"><div class="heatmap-label-day"></div>';
  for (let h = 0; h < 24; h++) html += `<div class="heatmap-label-hour">${h}</div>`;
  html += '</div>';

  for (let wd = 0; wd < 7; wd++) {
    html += `<div class="heatmap-row"><div class="heatmap-label-day">${days[wd]}</div>`;
    for (let h = 0; h < 24; h++) {
      const v     = map[`${wd}-${h}`] || 0;
      const level = v === 0 ? 0 : Math.min(10, Math.ceil((v / max) * 10));
      const label = metric === 'revenue' ? fmtVND(v) : `${v} ${t('cl.orders_unit')}`;
      html += `<div class="heatmap-cell" style="background:${pal[level]}" data-label="${days[wd]} ${h}:00 — ${label}"></div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

// Single shared tooltip for all heatmaps — zero per-cell DOM overhead
let _heatmapTooltipEl = null;
function _ensureHeatmapTooltip() {
  if (_heatmapTooltipEl) return _heatmapTooltipEl;
  _heatmapTooltipEl = document.createElement('div');
  _heatmapTooltipEl.className = 'heatmap-tooltip';
  document.body.appendChild(_heatmapTooltipEl);

  document.addEventListener('mouseover', e => {
    const cell = e.target.closest('.heatmap-cell[data-label]');
    if (!cell) { _heatmapTooltipEl.style.display = 'none'; return; }
    _heatmapTooltipEl.textContent = cell.dataset.label;
    _heatmapTooltipEl.style.display = 'block';
  });
  document.addEventListener('mousemove', e => {
    if (_heatmapTooltipEl.style.display === 'none') return;
    _heatmapTooltipEl.style.left = (e.clientX + 14) + 'px';
    _heatmapTooltipEl.style.top  = (e.clientY - 32) + 'px';
  });
  return _heatmapTooltipEl;
}

function renderUploadHistory(id, history) {
  const tbody = qs(`#${id}`); if (!tbody) return;
  if (!history || !history.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">${t('upload.no_history')}</td></tr>`;
    return;
  }
  const statusCls  = { completed: 'completed', failed: 'cancelled', processing: 'delivered', pending: 'pending' };
  const statusLabel = {
    completed:  t('status.completed'),
    failed:     t('status.failed'),
    processing: t('status.processing'),
    pending:    t('status.waiting'),
  };
  tbody.innerHTML = history.map(h => `
    <tr>
      <td style="font-size:11px;color:var(--text-muted)">${(h.uploaded_at||'').slice(0,16)}</td>
      <td>${platformBadge(h.platform)}</td>
      <td><span class="badge ${h.data_type==='traffic' ? 'badge-delivered' : 'badge-pending'}">${h.data_type==='traffic'?'Traffic':t('upload.type_orders')}</span></td>
      <td style="font-size:12px;max-width:180px"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h.original_filename}</div></td>
      <td class="text-right" style="font-size:12px;font-weight:600">${fmtNum(h.imported_rows||0)}</td>
      <td class="text-right" style="font-size:12px">${fmtNum(h.skipped_rows||0)}</td>
      <td><span class="badge badge-${statusCls[h.status]||'pending'}">${statusLabel[h.status]||h.status}</span></td>
    </tr>`).join('');
}

// ── Logs ─────────────────────────────────────────────────────────────────

const LogsState = { page: 1, perPage: 50, total: 0, pages: 0 };

async function loadLogs(page = 1) {
  LogsState.page = page;
  const level    = qs('#logFilterLevel')?.value    || '';
  const category = qs('#logFilterCategory')?.value || '';
  const search   = qs('#logSearch')?.value.trim()  || '';

  try {
    const data = await fetch(`api/logs.php?page=${page}&per_page=${LogsState.perPage}&level=${encodeURIComponent(level)}&category=${encodeURIComponent(category)}&search=${encodeURIComponent(search)}`, {
      headers: { 'X-CSRF-Token': App.csrf },
    }).then(r => r.json());

    if (!data.success) throw new Error(data.error || 'API error');

    LogsState.total = data.total;
    LogsState.pages = data.pages;

    // Stats
    const s = data.stats || {};
    const all = Object.values(s).reduce((a, b) => a + b, 0);
    const setTxt = (id, val) => { const el = qs(id); if (el) el.textContent = fmtNum(val); };
    setTxt('#log-stat-all',      all);
    setTxt('#log-stat-info',     s.info     || 0);
    setTxt('#log-stat-warning',  s.warning  || 0);
    setTxt('#log-stat-error',    (s.error   || 0) + (s.critical || 0));
    setTxt('#log-stat-critical', s.critical || 0);

    renderLogsTable(data.rows);
    renderLogsPagination();
  } catch (e) {
    const tbody = qs('#logsTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--red,#ef4444)">${t('log.load_error')} ${e.message}</td></tr>`;
  }
}

function renderLogsTable(rows) {
  const tbody = qs('#logsTableBody');
  if (!tbody) return;

  if (!rows || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">${t('log.no_data')}</td></tr>`;
    return;
  }

  const levelBadge = (l) => {
    const map = {
      debug:    'background:#6b7280;color:#fff',
      info:     'background:#3b82f6;color:#fff',
      warning:  'background:#f59e0b;color:#fff',
      error:    'background:#ef4444;color:#fff',
      critical: 'background:#7c3aed;color:#fff',
    };
    return `<span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;${map[l]||''}">${l}</span>`;
  };

  const catBadge = (c) => `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;background:var(--bg-hover,#f3f4f6);color:var(--text-secondary)">${c}</span>`;

  tbody.innerHTML = rows.map((r, idx) => {
    const ctxId = `logctx-${r.id}`;
    const hasCtx = r.context && Object.keys(r.context).length > 0;
    const ctxJson = hasCtx ? JSON.stringify(r.context, null, 2) : '';

    return `<tr>
      <td style="font-size:11px;color:var(--text-muted);white-space:nowrap">${(r.created_at||'').replace('T',' ').slice(0,19)}</td>
      <td>${levelBadge(r.level)}</td>
      <td>${catBadge(r.category)}</td>
      <td style="font-size:13px;max-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(r.message)}</td>
      <td style="font-size:11px;color:var(--text-muted)">${r.ip_address||''}</td>
      <td>${hasCtx ? `<button onclick="toggleLogCtx('${ctxId}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px;padding:0 4px" title="${t('msg.details')}">&#8943;</button>` : ''}</td>
    </tr>${hasCtx ? `<tr id="${ctxId}" style="display:none"><td colspan="6" style="padding:0 16px 12px"><pre style="font-size:11px;background:var(--bg-hover,#f9fafb);padding:12px;border-radius:6px;overflow:auto;max-height:300px;white-space:pre-wrap;word-break:break-all;margin:0;color:var(--text-primary)">${escHtml(ctxJson)}</pre></td></tr>` : ''}`;
  }).join('');
}

function toggleLogCtx(id) {
  const el = qs(`#${id}`);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}
window.toggleLogCtx = toggleLogCtx;

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderLogsPagination() {
  const el = qs('#logsPagination');
  if (!el) return;
  if (LogsState.pages <= 1) { el.innerHTML = ''; return; }

  const cur = LogsState.page;
  const max = LogsState.pages;
  let html = '';

  const btn = (p, label, disabled = false, active = false) =>
    `<button onclick="loadLogs(${p})" style="padding:4px 10px;border:1px solid var(--border);border-radius:5px;cursor:${disabled?'default':'pointer'};background:${active?'var(--primary,#3b82f6)':'var(--bg-card)'};color:${active?'#fff':'var(--text-primary)'};font-size:13px" ${disabled?'disabled':''}>${label}</button>`;

  html += btn(cur - 1, '&lsaquo;', cur <= 1);

  const pages = [];
  if (max <= 7) {
    for (let i = 1; i <= max; i++) pages.push(i);
  } else {
    pages.push(1);
    if (cur > 3) pages.push('…');
    for (let i = Math.max(2, cur - 1); i <= Math.min(max - 1, cur + 1); i++) pages.push(i);
    if (cur < max - 2) pages.push('…');
    pages.push(max);
  }

  pages.forEach(p => {
    if (p === '…') html += `<span style="padding:4px 6px;color:var(--text-muted)">…</span>`;
    else html += btn(p, String(p), false, p === cur);
  });

  html += btn(cur + 1, '&rsaquo;', cur >= max);
  el.innerHTML = html;
}
window.loadLogs = loadLogs;

function setupLogsPage() {
  qs('#btnLogRefresh')?.addEventListener('click', () => loadLogs(1));
  qs('#logFilterLevel')?.addEventListener('change', () => loadLogs(1));
  qs('#logFilterCategory')?.addEventListener('change', () => loadLogs(1));

  let searchTimer;
  qs('#logSearch')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadLogs(1), 400);
  });

  qs('#btnLogClear')?.addEventListener('click', async () => {
    const level    = qs('#logFilterLevel')?.value    || '';
    const category = qs('#logFilterCategory')?.value || '';
    const scope    = [level && `level=${level}`, category && `category=${category}`].filter(Boolean).join(', ') || t('log.all_scope');
    if (!confirm(`${t('lang.delete')} log (${scope})?`)) return;

    try {
      const res = await fetch('api/logs.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': App.csrf },
        body: JSON.stringify({ action: 'clear', level, category }),
      }).then(r => r.json());

      if (res.success) {
        toast(t('toast.log_cleared'), 'success');
        loadLogs(1);
      } else {
        toast(res.error || t('msg.delete_failed'), 'error');
      }
    } catch (e) {
      toast(t('msg.conn_error'), 'error');
    }
  });
}

// ── TikTok Connect page ────────────────────────────────────────────────────

async function loadConnectPage() {
  // Default tab = Shopee
  loadShopeeConnectPage();

  // Show redirect URI hint
  const redirectUri = location.origin + location.pathname.replace(/[^/]*$/, '') + 'tiktok-oauth.php';
  const uriEl = qs('#oauthRedirectUri');
  if (uriEl) uriEl.textContent = redirectUri;

  try {
    const data = await apiFetch('api/tiktok-connect.php?action=status');
    if (!data.success) return;

    if (data.app_key) qs('#tiktokAppKey').value = data.app_key;
    renderShopsTable(data.shops || []);
  } catch (e) {
    // ignore
  }
}

function renderShopsTable(shops) {
  const tbody = qs('#shopsTableBody');
  if (!tbody) return;

  if (!shops.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">${t('connect.no_shops')}</td></tr>`;
    return;
  }

  tbody.innerHTML = shops.map(s => {
    const active  = s.is_active ? `✓ ${t('msg.active')}` : `✗ ${t('msg.inactive')}`;
    const expiry  = s.access_token_expire_at ? s.access_token_expire_at.substring(0, 16) : '—';
    const synced  = s.last_synced_at ? s.last_synced_at.substring(0, 16) : t('msg.not_synced');
    const fromDate = s.sync_from_date || '';
    const actStyle = s.is_active ? 'color:var(--green,#22c55e)' : 'color:var(--text-muted)';

    return `<tr>
      <td><strong>${escHtml(s.shop_name || s.shop_id)}</strong><br><span style="font-size:11px;color:var(--text-muted)">${escHtml(s.shop_id)}</span></td>
      <td>${escHtml(s.region || '—')}</td>
      <td style="${actStyle};font-size:12px">${active}</td>
      <td style="font-size:12px">${expiry}</td>
      <td style="font-size:12px">${synced}</td>
      <td><input type="date" class="sync-from-date" data-shop="${escHtml(s.shop_id)}" value="${escHtml(fromDate)}"
          style="border:1px solid var(--border);border-radius:4px;padding:2px 6px;background:var(--bg-card);color:var(--text-primary);font-size:12px;width:100%"></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm btn-sync-shop" data-shop="${escHtml(s.shop_id)}" title="${t('btn.sync')}">Sync</button>
        <button class="btn btn-secondary btn-sm btn-disconnect-shop" data-shop="${escHtml(s.shop_id)}" title="${t('btn.disconnect')}" style="color:var(--red,#ef4444)">✕</button>
      </td>
    </tr>`;
  }).join('');

  // Bind per-shop sync button
  tbody.querySelectorAll('.btn-sync-shop').forEach(btn => {
    btn.addEventListener('click', () => syncShop(btn.dataset.shop));
  });

  // Bind disconnect
  tbody.querySelectorAll('.btn-disconnect-shop').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(t('confirm.disconnect_shop'))) return;
      try {
        const res = await apiFetch('api/tiktok-connect.php', {
          method: 'POST',
          body: JSON.stringify({ action: 'disconnect', shop_id: btn.dataset.shop }),
        });
        if (res.success) { toast(t('msg.disconnected'), 'success'); loadConnectPage(); }
        else toast(res.error || t('msg.failed'), 'error');
      } catch (e) { toast(t('msg.conn_error'), 'error'); }
    });
  });

  // Bind date change → save via sync-from endpoint (we piggyback save_credentials call)
  tbody.querySelectorAll('.sync-from-date').forEach(input => {
    input.addEventListener('change', async () => {
      // Save sync_from_date by updating shop record
      try {
        await apiFetch('api/tiktok-connect.php', {
          method: 'POST',
          body: JSON.stringify({ action: 'set_sync_from', shop_id: input.dataset.shop, sync_from_date: input.value }),
        });
      } catch (e) { /* ignore */ }
    });
  });
}

async function syncShop(shopId) {
  const resultsEl = qs('#syncResults');
  if (resultsEl) resultsEl.innerHTML = `<div style="color:var(--text-muted);font-size:13px">${t('msg.syncing')}</div>`;

  try {
    const body = shopId ? { action: 'sync', shop_id: shopId } : { action: 'sync' };
    const res  = await apiFetch('api/tiktok-connect.php', { method: 'POST', body: JSON.stringify(body) });

    if (!res.success) {
      if (resultsEl) resultsEl.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px">${t('msg.error')}: ${escHtml(res.error || t('msg.unknown'))}</div>`;
      return;
    }

    const rows = (res.results || []).map(r => {
      if (r.success) return `<div style="color:var(--green,#22c55e);font-size:13px">✓ ${escHtml(r.shop)}: +${r.imported} ${t('cl.orders_unit')}${r.errors ? `, ${r.errors} ${t('msg.error')}` : ''}</div>`;
      return `<div style="color:var(--red,#ef4444);font-size:13px">✗ ${escHtml(r.shop)}: ${escHtml(r.error || '')}</div>`;
    }).join('');

    if (resultsEl) resultsEl.innerHTML = rows || `<div style="color:var(--text-muted);font-size:13px">${t('msg.no_results')}</div>`;
    toast(t('toast.sync_done'), 'success');
    loadConnectPage(); // refresh last_synced_at
  } catch (e) {
    if (resultsEl) resultsEl.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px">${t('msg.error')}: ${escHtml(e.message)}</div>`;
    toast(t('toast.sync_error'), 'error');
  }
}

function setupConnectPage() {
  qs('#btnSaveCredentials')?.addEventListener('click', async () => {
    const appKey    = qs('#tiktokAppKey')?.value.trim()    || '';
    const appSecret = qs('#tiktokAppSecret')?.value.trim() || '';

    if (!appKey) { toast(t('msg.app_key_required'), 'error'); return; }

    try {
      const res = await apiFetch('api/tiktok-connect.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'save_credentials', app_key: appKey, app_secret: appSecret }),
      });
      if (res.success) toast(t('msg.credentials_saved'), 'success');
      else toast(res.error || t('msg.save_failed'), 'error');
    } catch (e) { toast(t('msg.conn_error'), 'error'); }
  });

  qs('#btnConnectTiktok')?.addEventListener('click', async () => {
    const statusEl = qs('#connectStatus');
    if (statusEl) statusEl.textContent = t('msg.getting_auth_url');

    try {
      const res = await apiFetch('api/tiktok-connect.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'get_auth_url' }),
      });

      if (res.success && res.auth_url) {
        if (statusEl) statusEl.textContent = t('msg.redirecting');
        location.href = res.auth_url;
      } else {
        if (statusEl) statusEl.textContent = '';
        toast(res.error || t('msg.no_auth_url'), 'error');
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = '';
      toast(t('msg.conn_error'), 'error');
    }
  });

  qs('#btnSyncAll')?.addEventListener('click', () => syncShop(''));
  qs('#btnRefreshShops')?.addEventListener('click', loadConnectPage);
}

// ── Settings page ─────────────────────────────────────────────────────────

let _settingsPageBound = false;

async function loadSettingsPage() {
  bindSettingsPage();
  await Promise.all([loadSysInfo(), loadUpdateCard(), setupLangSettings()]);
}

function bindSettingsPage() {
  if (_settingsPageBound) return;
  _settingsPageBound = true;

  qs('#btnRefreshSysInfo')?.addEventListener('click', loadSysInfo);

  qs('#btnCheckUpdateNow')?.addEventListener('click', async () => {
    const panel = qs('#updateStatusPanel');
    if (panel) panel.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">${t('msg.checking')}</div>`;
    await apiFetch('api/update.php', { method: 'POST', body: JSON.stringify({ action: 'check_now' }) });
    await loadUpdateCard();
  });

  qs('#btnSaveManifestUrl')?.addEventListener('click', async () => {
    const url = (qs('#inputManifestUrl')?.value || '').trim();
    const res = await apiFetch('api/update.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'save_manifest_url', url }),
    });
    if (res.success) {
      toast(t('toast.manifest_saved'), 'success');
      await loadUpdateCard();
    } else {
      toast(res.error || t('msg.save_failed'), 'error');
    }
  });
}

const AdminUserState = {
  users: [],
  currentUserId: null,
  editingId: null,
};

function mountAdminContent() {
  if (App.adminMounted) return;

  [
    ['page-connect', 'adminApiMount'],
    ['page-settings', 'adminSystemMount'],
  ].forEach(([sourceId, targetId]) => {
    const source = qs(`#${sourceId}`);
    const target = qs(`#${targetId}`);
    if (!source || !target) return;
    while (source.firstChild) target.appendChild(source.firstChild);
  });

  App.adminMounted = true;
}

function setupAdminPage() {
  qsa('[data-admin-tab]').forEach(btn => {
    btn.addEventListener('click', () => activateAdminTab(btn.dataset.adminTab));
  });

  qs('#btnAdminUserRefresh')?.addEventListener('click', loadAdminUsers);
  qs('#btnAdminUserReset')?.addEventListener('click', resetAdminUserForm);
  qs('#adminUserForm')?.addEventListener('submit', submitAdminUserForm);
  qs('#adminUserPassword')?.addEventListener('input', syncPasswordStrengthIndicators);
}

function loadAdminPage() {
  if (!isAdminUser()) return;
  mountAdminContent();
  activateAdminTab(App.adminTab || 'accounts');
}

function activateAdminTab(tab, options = {}) {
  const { skipLoad = false } = options;
  mountAdminContent();
  App.adminTab = ['accounts', 'api', 'system'].includes(tab) ? tab : 'accounts';

  qsa('[data-admin-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.adminTab === App.adminTab);
  });
  qsa('[data-admin-tab-panel]').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.adminTabPanel === App.adminTab);
  });

  if (skipLoad) return;

  if (App.adminTab === 'accounts') loadAdminUsers();
  if (App.adminTab === 'api') loadConnectPage();
  if (App.adminTab === 'system') loadSettingsPage();
}

window.openAdminTab = function(tab = 'accounts') {
  if (!isAdminUser()) return;
  App.adminTab = tab;
  if (App.currentPage !== 'admin') {
    loadPage('admin');
    return;
  }
  activateAdminTab(tab);
};

async function loadAdminUsers() {
  try {
    const data = await apiFetch('api/users.php?action=list');
    if (!data.success) throw new Error(data.error || 'API error');

    AdminUserState.users = data.users || [];
    AdminUserState.currentUserId = data.current_user_id || null;

    renderAdminUserSummary(data.summary || {});
    renderAdminUsersTable();

    if (!AdminUserState.editingId) {
      resetAdminUserForm();
    }
  } catch (e) {
    const tbody = qs('#adminUsersTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--red,#ef4444)">${escHtml(e.message)}</td></tr>`;
    }
  }
}

function renderAdminUserSummary(summary) {
  qs('#admin-total-users').textContent  = fmtNum(summary.total || 0);
  qs('#admin-active-users').textContent = fmtNum(summary.active || 0);
  qs('#admin-admin-users').textContent  = fmtNum(summary.admins || 0);
  qs('#admin-last-login').textContent   = summary.last_login_at ? fmtDateTime(summary.last_login_at) : '—';
}

function renderAdminUsersTable() {
  const tbody = qs('#adminUsersTableBody');
  if (!tbody) return;

  if (!AdminUserState.users.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">${t('admin.users.empty')}</td></tr>`;
    return;
  }

  tbody.innerHTML = AdminUserState.users.map(user => `
    <tr data-admin-user-id="${user.id}" class="${AdminUserState.editingId === user.id ? 'is-selected' : ''}">
      <td>
        <div class="admin-user-main">
          <div class="admin-user-name">${escHtml(user.full_name || user.username)}</div>
          <div class="admin-user-meta font-mono">@${escHtml(user.username)}${AdminUserState.currentUserId === user.id ? ` · ${t('admin.users.you')}` : ''}</div>
        </div>
      </td>
      <td><span class="admin-role-badge role-${escHtml(user.role)}">${t(`admin.role.${user.role}`)}</span></td>
      <td><span class="admin-state-badge state-${user.is_active ? 'active' : 'inactive'}">${user.is_active ? t('admin.state.active') : t('admin.state.inactive')}</span></td>
      <td style="font-size:12px;color:var(--text-muted)">${user.last_login_at ? fmtDateTime(user.last_login_at) : '—'}</td>
      <td class="text-right">
        <div class="admin-table-actions">
          <button class="admin-quiet-btn" type="button" data-admin-edit="${user.id}">${t('admin.users.edit')}</button>
          <button class="admin-quiet-btn danger" type="button" data-admin-delete="${user.id}">${t('lang.delete')}</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-admin-edit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const user = AdminUserState.users.find(item => item.id === Number(btn.dataset.adminEdit));
      if (user) fillAdminUserForm(user);
    });
  });

  tbody.querySelectorAll('[data-admin-delete]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteAdminUser(Number(btn.dataset.adminDelete));
    });
  });

  tbody.querySelectorAll('tr[data-admin-user-id]').forEach(row => {
    row.addEventListener('click', () => {
      const user = AdminUserState.users.find(item => item.id === Number(row.dataset.adminUserId));
      if (user) fillAdminUserForm(user);
    });
  });
}

function resetAdminUserForm() {
  AdminUserState.editingId = null;
  qs('#adminUserId').value = '';
  qs('#adminUserUsername').value = '';
  qs('#adminUserUsername').readOnly = false;
  qs('#adminUserFullName').value = '';
  qs('#adminUserRole').value = 'staff';
  qs('#adminUserPassword').value = '';
  qs('#adminUserPassword').placeholder = t('admin.form.password_placeholder');
  qs('#adminUserActive').checked = true;
  qs('#adminUserMustChangePassword').checked = true;
  qs('#adminUserFormMode').textContent = t('admin.form.create');
  qs('#btnAdminUserSubmit').textContent = t('admin.form.submit_create');
  syncPasswordStrengthIndicators();
  renderAdminUsersTable();
}

function fillAdminUserForm(user) {
  AdminUserState.editingId = user.id;
  qs('#adminUserId').value = String(user.id);
  qs('#adminUserUsername').value = user.username || '';
  qs('#adminUserUsername').readOnly = true;
  qs('#adminUserFullName').value = user.full_name || '';
  qs('#adminUserRole').value = user.role || 'staff';
  qs('#adminUserPassword').value = '';
  qs('#adminUserPassword').placeholder = t('admin.form.password_keep');
  qs('#adminUserActive').checked = Boolean(user.is_active);
  qs('#adminUserMustChangePassword').checked = Boolean(user.must_change_password);
  qs('#adminUserFormMode').textContent = t('admin.form.edit');
  qs('#btnAdminUserSubmit').textContent = t('admin.form.submit_update');
  syncPasswordStrengthIndicators();
  renderAdminUsersTable();
}

async function submitAdminUserForm(e) {
  e.preventDefault();

  const isEditing = Boolean(AdminUserState.editingId);
  const editedUserId = isEditing ? Number(qs('#adminUserId')?.value || 0) : 0;
  const payload = {
    action: isEditing ? 'update' : 'create',
    full_name: qs('#adminUserFullName')?.value.trim() || '',
    role: qs('#adminUserRole')?.value || 'staff',
    password: qs('#adminUserPassword')?.value || '',
    must_change_password: qs('#adminUserMustChangePassword')?.checked,
    is_active: qs('#adminUserActive')?.checked,
  };

  if (isEditing) {
    payload.id = Number(qs('#adminUserId')?.value || 0);
  } else {
    payload.username = qs('#adminUserUsername')?.value.trim() || '';
  }

  try {
    if (!isEditing && !payload.password) {
      throw new Error(t('admin.form.password_required'));
    }
    if (payload.password) {
      ensurePasswordStrength(payload.password);
    }

    const res = await apiFetch('api/users.php', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.success) throw new Error(res.error || 'API error');

    toast(isEditing ? t('admin.toast.updated') : t('admin.toast.created'), 'success');

    const authData = await fetch('api/auth.php').then(r => r.json());
    if (authData.logged_in) {
      App.user = authData.user || App.user;
      App.csrf = authData.csrf || App.csrf;
      applyAuthUI();
      if (editedUserId && editedUserId === App.user?.id && !isAdminUser()) {
        loadPage('overview');
        return;
      }
      if (editedUserId && editedUserId === App.user?.id) {
        maybeForcePasswordChange();
      }
    }

    resetAdminUserForm();
    await loadAdminUsers();
  } catch (err) {
    toast(err.message || t('msg.failed'), 'error');
  }
}

async function deleteAdminUser(id) {
  if (!id) return;
  if (!confirm(t('admin.users.delete_confirm'))) return;

  try {
    const res = await apiFetch('api/users.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id }),
    });
    if (!res.success) throw new Error(res.error || 'API error');

    toast(t('admin.toast.deleted'), 'success');
    if (AdminUserState.editingId === id) resetAdminUserForm();
    await loadAdminUsers();
  } catch (err) {
    toast(err.message || t('msg.failed'), 'error');
  }
}

async function loadSysInfo() {
  try {
    const data = await apiFetch('api/admin.php?action=system_info');
    if (!data.success) return;
    const i = data.info;

    // System info grid
    const sysRows = [
      ['PHP', `${i.php_version} (${i.php_sapi})`],
      ['MySQL', i.db_version],
      ['Memory limit', i.memory_limit],
      [t('sys.memory_used'), `${i.memory_used_mb} MB (peak: ${i.memory_peak_mb} MB)`],
      ['Upload max', i.upload_max],
      ['Max exec time', i.max_exec_time + 's'],
      ['Server', i.server_software],
      [t('sys.timezone'), i.timezone],
      [t('sys.server_time'), i.server_time],
      [t('sys.installed_at'), i.installed_at || '—'],
    ];
    if (i.disk_total_gb) {
      const pct = i.disk_total_gb > 0 ? Math.round((1 - i.disk_free_gb / i.disk_total_gb) * 100) : 0;
      sysRows.push([t('sys.disk'), `${i.disk_free_gb} ${t('sys.disk_free')} / ${i.disk_total_gb} GB (${pct}% ${t('sys.disk_used')})`]);
    }
    sysRows.push([t('sys.db_size'), `${i.db_size_mb} MB`]);

    qs('#sysInfoContent').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px">
        ${sysRows.map(([k, v]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-base,#f8fafc);border-radius:8px;gap:8px">
            <span style="font-size:12px;color:var(--text-muted)">${escHtml(k)}</span>
            <span style="font-size:13px;font-weight:600;text-align:right">${escHtml(String(v))}</span>
          </div>`).join('')}
      </div>`;

    // Data stats
    const platforms = { shopee: 'Shopee', lazada: 'Lazada', tiktokshop: 'TikTok Shop' };
    const platRows = Object.entries(platforms).map(([p, label]) => {
      const cnt = (i.by_platform || {})[p] || 0;
      return `<div style="text-align:center;padding:14px 20px;background:var(--bg-base,#f8fafc);border-radius:10px;flex:1;min-width:120px">
        <div style="font-size:22px;font-weight:800">${fmtNum(cnt)}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${label}</div>
      </div>`;
    }).join('');

    const dateRange = (i.order_date_min && i.order_date_max)
      ? `${i.order_date_min.substring(0,10)} → ${i.order_date_max.substring(0,10)}`
      : t('sys.no_data');

    qs('#dataStatsContent').innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div style="text-align:center;padding:14px 20px;background:#eff6ff;border-radius:10px;flex:1;min-width:120px">
          <div style="font-size:22px;font-weight:800">${fmtNum(i.order_count)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${t('sys.total_orders')}</div>
        </div>
        <div style="text-align:center;padding:14px 20px;background:#f0fdf4;border-radius:10px;flex:1;min-width:120px">
          <div style="font-size:22px;font-weight:800">${fmtNum(i.traffic_count)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${t('sys.traffic_records')}</div>
        </div>
        <div style="text-align:center;padding:14px 20px;background:#fefce8;border-radius:10px;flex:1;min-width:120px">
          <div style="font-size:22px;font-weight:800">${fmtNum(i.upload_count)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${t('sys.uploads')}</div>
        </div>
        <div style="text-align:center;padding:14px 20px;background:#fdf4ff;border-radius:10px;flex:1;min-width:120px">
          <div style="font-size:22px;font-weight:800">${fmtNum(i.log_count)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Log entries</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${platRows}</div>
      <div style="margin-top:10px;font-size:12px;color:var(--text-muted)">${t('sys.date_range')} <strong>${escHtml(dateRange)}</strong></div>`;
  } catch (e) {
    qs('#sysInfoContent').innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px">${t('sys.load_error')} ${escHtml(e.message)}</div>`;
  }
}

async function confirmReset(action, title, promptText, confirmWord) {
  const resultEl = qs('#resetResult');
  if (resultEl) resultEl.innerHTML = '';

  const answer = window.prompt(`${title}\n\n${promptText}`);
  if (answer === null) return; // cancelled
  if (answer.trim() !== confirmWord) {
    alert(`❌ ${t('msg.error')}: "${confirmWord}"`);
    return;
  }

  try {
    const res = await apiFetch('api/admin.php', {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    if (res.success) {
      if (resultEl) resultEl.innerHTML = `<div style="color:var(--green,#22c55e);font-size:13px;padding:10px 14px;background:#f0fdf4;border-radius:8px">✅ ${escHtml(res.message)}</div>`;
      toast(res.message, 'success');
      // Refresh stats
      setTimeout(loadSysInfo, 500);
    } else {
      if (resultEl) resultEl.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px;padding:10px 14px;background:#fef2f2;border-radius:8px">❌ ${escHtml(res.error || t('msg.failed'))}</div>`;
    }
  } catch (e) {
    if (resultEl) resultEl.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px">${t('msg.error')}: ${escHtml(e.message)}</div>`;
  }
}

// ── Auto update ───────────────────────────────────────────────────────────

async function checkForUpdates() {
  // Lightweight background check — only updates the nav badge
  try {
    const data = await apiFetch('api/update.php?action=check');
    if (!data.success) return;
    const badge = qs('#adminNavBadge');
    if (badge) badge.style.display = data.has_update ? '' : 'none';
  } catch (_) { /* silent — not critical on init */ }
}

async function loadUpdateCard() {
  const panel    = qs('#updateStatusPanel');
  const urlInput = qs('#inputManifestUrl');
  if (!panel) return;

  try {
    const data = await apiFetch('api/update.php?action=check');

    if (urlInput) urlInput.value = data.manifest_url || '';

    const vBadge = qs('#currentVersionBadge');
    if (vBadge) vBadge.textContent = 'v' + data.current;

    const badge = qs('#adminNavBadge');
    if (badge) badge.style.display = data.has_update ? '' : 'none';

    if (!data.manifest_url) {
      panel.innerHTML = `
        <div style="padding:14px 16px;background:var(--bg-base,#f8fafc);border-radius:10px;font-size:13px;color:var(--text-muted)">
          ${t('update.enter_manifest')}
        </div>`;
      return;
    }

    if (data.fetch_error && !data.latest) {
      panel.innerHTML = `
        <div style="padding:14px 16px;background:#fef9c3;border-radius:10px;font-size:13px;color:#92400e">
          ${t('update.manifest_error')} ${escHtml(data.fetch_error)}
        </div>`;
      return;
    }

    if (data.has_update) {
      panel.innerHTML = `
        <div style="padding:16px;background:#eff6ff;border-radius:10px;border:1px solid #bfdbfe">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-weight:700;color:#1d4ed8;font-size:15px;margin-bottom:4px">
                ${t('update.new_version')} v${escHtml(data.latest)}
              </div>
              <div style="font-size:12px;color:var(--text-muted)">
                ${t('update.current')} v${escHtml(data.current)}
                ${data.released_at ? ' · ' + t('update.released') + ' ' + escHtml(data.released_at) : ''}
                ${data.min_php ? ' · ' + t('update.min_php') + ' ' + escHtml(data.min_php) + '+' : ''}
              </div>
            </div>
            <button class="btn btn-primary btn-sm" id="btnApplyUpdate" style="white-space:nowrap">
              ${t('update.btn')}
            </button>
          </div>
          ${data.changelog ? `
          <div style="margin-top:12px;padding:10px 14px;background:#fff;border-radius:8px;font-size:12px;white-space:pre-wrap;line-height:1.7;border:1px solid #dbeafe">
${escHtml(data.changelog)}
          </div>` : ''}
        </div>`;

      qs('#btnApplyUpdate')?.addEventListener('click', () => {
        applySystemUpdate(data.download_url, data.latest);
      });

    } else if (data.latest) {
      panel.innerHTML = `
        <div style="padding:14px 16px;background:#f0fdf4;border-radius:10px;display:flex;align-items:center;gap:14px">
          <div style="font-size:20px;flex-shrink:0">✓</div>
          <div>
            <div style="font-weight:600;color:#166534;font-size:13px">${t('update.up_to_date')} (v${escHtml(data.current)})</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
              ${t('update.checked_at')} ${escHtml(data.last_checked || '—')}
            </div>
          </div>
        </div>`;
    } else {
      panel.innerHTML = `
        <div style="padding:14px 16px;background:#fef9c3;border-radius:10px;font-size:13px;color:#92400e">
          ${t('update.no_info')}
        </div>`;
    }
  } catch (e) {
    if (panel) panel.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px;padding:12px">${t('msg.error')}: ${escHtml(e.message)}</div>`;
  }
}

async function applySystemUpdate(downloadUrl, version) {
  const panel = qs('#updateStatusPanel');

  if (!confirm(`${t('update.new_version')} v${version}${t('update.confirm_body')}`)) return;

  if (panel) {
    panel.innerHTML = `
      <div style="padding:24px;text-align:center;color:var(--text-muted)">
        <div style="font-size:32px;margin-bottom:10px">⏳</div>
        <div style="font-weight:600;font-size:14px">${t('update.installing')} v${escHtml(version)}</div>
        <div style="font-size:12px;margin-top:6px">${t('update.wait')}</div>
      </div>`;
  }

  try {
    const res = await apiFetch('api/update.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'apply', download_url: downloadUrl, version }),
    });

    if (res.success) {
      if (panel) {
        panel.innerHTML = `
          <div style="padding:20px;background:#f0fdf4;border-radius:10px;text-align:center">
            <div style="font-size:32px;margin-bottom:8px">🎉</div>
            <div style="font-weight:700;color:#166534;font-size:15px">${t('update.success')}</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:4px">${escHtml(res.message)}</div>
            <button class="btn btn-primary" style="margin-top:16px" onclick="location.reload()">
              ${t('update.reload')}
            </button>
          </div>`;
      }
      toast(t('update.success'), 'success');
    } else {
      if (panel) {
        panel.innerHTML = `
          <div style="padding:16px;background:#fef2f2;border-radius:10px">
            <div style="font-weight:600;color:#dc2626;margin-bottom:6px">${t('update.failed')}</div>
            <div style="font-size:13px">${escHtml(res.error || t('msg.unknown'))}</div>
            <button class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="loadUpdateCard()">${t('update.retry')}</button>
          </div>`;
      }
    }
  } catch (e) {
    if (panel) {
      panel.innerHTML = `
        <div style="padding:16px;background:#fef2f2;border-radius:10px">
          <div style="color:#dc2626;margin-bottom:6px">${t('update.conn_error')}</div>
          <div style="font-size:13px">${escHtml(e.message)}</div>
          <button class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="loadUpdateCard()">${t('update.retry')}</button>
        </div>`;
    }
  }
}

// ── Connect tab switcher ───────────────────────────────────────────────────

function switchConnectTab(tab) {
  const tabs = ['shopee', 'tiktok', 'lazada'];
  const activeColor   = 'var(--primary,#4f46e5)';
  const inactiveColor = 'var(--text-muted)';

  tabs.forEach(t => {
    const el  = qs('#connectTab'    + t.charAt(0).toUpperCase() + t.slice(1));
    const btn = qs('#btnConnectTab' + t.charAt(0).toUpperCase() + t.slice(1));
    const active = t === tab;
    if (el)  el.style.display = active ? '' : 'none';
    if (btn) {
      btn.style.borderBottomColor = active ? activeColor : 'transparent';
      btn.style.color             = active ? activeColor : inactiveColor;
    }
  });

  if (tab === 'lazada')  loadLazadaConnectPage();
  if (tab === 'shopee')  loadShopeeConnectPage();
}

// ── Lazada Connect page ────────────────────────────────────────────────────

async function loadLazadaConnectPage() {
  const redirectUri = location.origin + location.pathname.replace(/[^/]*$/, '') + 'lazada-oauth.php';
  const uriEl = qs('#lazadaOauthRedirectUri');
  if (uriEl) uriEl.textContent = redirectUri;

  try {
    const data = await apiFetch('api/lazada-connect.php?action=status');
    if (!data.success) return;
    if (data.app_key) qs('#lazadaAppKey').value = data.app_key;
    renderLazadaAccountsTable(data.accounts || []);
  } catch (e) {
    // ignore
  }
}

function renderLazadaAccountsTable(accounts) {
  const tbody = qs('#lazadaAccountsTableBody');
  if (!tbody) return;

  if (!accounts.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">${t('connect.no_lazada')}</td></tr>`;
    return;
  }

  tbody.innerHTML = accounts.map(a => {
    const active   = a.is_active ? `✓ ${t('msg.active')}` : `✗ ${t('msg.inactive')}`;
    const expiry   = a.access_token_expire_at ? a.access_token_expire_at.substring(0, 16) : '—';
    const synced   = a.last_synced_at ? a.last_synced_at.substring(0, 16) : t('msg.not_synced');
    const fromDate = a.sync_from_date || '';
    const todayStr = new Date().toISOString().substring(0, 10);
    const actStyle = a.is_active ? 'color:var(--green,#22c55e)' : 'color:var(--text-muted)';
    const inputStyle = 'border:1px solid var(--border);border-radius:4px;padding:2px 4px;background:var(--bg-card);color:var(--text-primary);font-size:12px;width:100px';

    return `<tr>
      <td><strong>${escHtml(a.account_name || a.account_id)}</strong><br><span style="font-size:11px;color:var(--text-muted)">${escHtml(a.account_id)}</span></td>
      <td>${escHtml((a.country || '').toUpperCase())}</td>
      <td style="${actStyle};font-size:12px">${active}</td>
      <td style="font-size:12px">${expiry}</td>
      <td style="font-size:12px">${synced}</td>
      <td style="white-space:nowrap">
        <input type="date" class="lazada-sync-from-date" data-account="${escHtml(a.account_id)}" value="${escHtml(fromDate)}"
            style="${inputStyle}" title="${t('btn.date_from')}">
        <span style="font-size:11px;color:var(--text-muted);margin:0 2px">→</span>
        <input type="date" class="lazada-sync-to-date" data-account="${escHtml(a.account_id)}" value="${escHtml(todayStr)}"
            style="${inputStyle}" title="${t('btn.date_to')}">
      </td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm btn-lazada-sync" data-account="${escHtml(a.account_id)}" title="${t('btn.sync')}">Sync</button>
        <button class="btn btn-secondary btn-sm btn-lazada-disconnect" data-account="${escHtml(a.account_id)}" title="${t('btn.disconnect')}" style="color:var(--red,#ef4444)">✕</button>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.btn-lazada-sync').forEach(btn => {
    btn.addEventListener('click', () => syncLazadaAccount(btn.dataset.account));
  });

  tbody.querySelectorAll('.btn-lazada-disconnect').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(t('confirm.disconnect_lazada'))) return;
      try {
        const res = await apiFetch('api/lazada-connect.php', {
          method: 'POST',
          body: JSON.stringify({ action: 'disconnect', account_id: btn.dataset.account }),
        });
        if (res.success) { toast(t('msg.disconnected'), 'success'); loadLazadaConnectPage(); }
        else toast(res.error || t('msg.failed'), 'error');
      } catch (e) { toast(t('msg.conn_error'), 'error'); }
    });
  });

  tbody.querySelectorAll('.lazada-sync-from-date').forEach(input => {
    input.addEventListener('change', async () => {
      try {
        await apiFetch('api/lazada-connect.php', {
          method: 'POST',
          body: JSON.stringify({ action: 'set_sync_from', account_id: input.dataset.account, sync_from_date: input.value }),
        });
      } catch (e) { /* ignore */ }
    });
  });
}

async function syncLazadaAccount(accountId) {
  const resultsEl = qs('#lazadaSyncResults');
  if (resultsEl) resultsEl.innerHTML = `<div style="color:var(--text-muted);font-size:13px">${t('msg.syncing')}</div>`;

  // Read date range inputs for this account
  const fromInput = accountId ? qs(`.lazada-sync-from-date[data-account="${CSS.escape(accountId)}"]`) : null;
  const toInput   = accountId ? qs(`.lazada-sync-to-date[data-account="${CSS.escape(accountId)}"]`)   : null;
  const dateFrom  = fromInput?.value || '';
  const dateTo    = toInput?.value   || '';

  try {
    const body = { action: 'sync' };
    if (accountId) body.account_id = accountId;
    if (dateFrom)  body.date_from  = dateFrom;
    if (dateTo)    body.date_to    = dateTo;
    const res  = await apiFetch('api/lazada-connect.php', { method: 'POST', body: JSON.stringify(body) });

    if (!res.success) {
      if (resultsEl) resultsEl.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px">${t('msg.error')}: ${escHtml(res.error || t('msg.unknown'))}</div>`;
      return;
    }

    const rows = (res.results || []).map(r => {
      if (r.success) return `<div style="color:var(--green,#22c55e);font-size:13px">✓ ${escHtml(r.account)}: +${r.imported} ${t('connect.items_unit')}${r.errors ? `, ${r.errors} ${t('msg.error')}` : ''}</div>`;
      return `<div style="color:var(--red,#ef4444);font-size:13px">✗ ${escHtml(r.account)}: ${escHtml(r.error || '')}</div>`;
    }).join('');

    if (resultsEl) resultsEl.innerHTML = rows || `<div style="color:var(--text-muted);font-size:13px">${t('msg.no_results')}</div>`;
    toast(t('toast.lazada_sync_done'), 'success');
    loadLazadaConnectPage();
  } catch (e) {
    if (resultsEl) resultsEl.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px">${t('msg.error')}: ${escHtml(e.message)}</div>`;
    toast(t('toast.lazada_sync_error'), 'error');
  }
}

function setupLazadaConnectPage() {
  qs('#btnLazadaSaveCredentials')?.addEventListener('click', async () => {
    const appKey    = qs('#lazadaAppKey')?.value.trim()    || '';
    const appSecret = qs('#lazadaAppSecret')?.value.trim() || '';
    if (!appKey) { toast(t('msg.app_key_required'), 'error'); return; }
    try {
      const res = await apiFetch('api/lazada-connect.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'save_credentials', app_key: appKey, app_secret: appSecret }),
      });
      if (res.success) toast(t('connect.lazada_saved'), 'success');
      else toast(res.error || t('msg.save_failed'), 'error');
    } catch (e) { toast(t('msg.conn_error'), 'error'); }
  });

  qs('#btnConnectLazada')?.addEventListener('click', async () => {
    const statusEl = qs('#lazadaConnectStatus');
    if (statusEl) statusEl.textContent = t('msg.getting_auth_url');
    try {
      const res = await apiFetch('api/lazada-connect.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'get_auth_url' }),
      });
      if (res.success && res.auth_url) {
        if (statusEl) statusEl.textContent = t('msg.redirecting');
        location.href = res.auth_url;
      } else {
        if (statusEl) statusEl.textContent = '';
        toast(res.error || t('msg.no_auth_url'), 'error');
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = '';
      toast(t('msg.conn_error'), 'error');
    }
  });

  qs('#btnLazadaSyncAll')?.addEventListener('click', () => syncLazadaAccount(''));
  qs('#btnLazadaRefresh')?.addEventListener('click', loadLazadaConnectPage);
}

// ── Shopee Connect page ────────────────────────────────────────────────────

async function loadShopeeConnectPage() {
  const redirectUri = location.origin + location.pathname.replace(/[^/]*$/, '') + 'shopee-oauth.php';
  const uriEl = qs('#shopeeOauthRedirectUri');
  if (uriEl) uriEl.textContent = redirectUri;

  try {
    const data = await apiFetch('api/shopee-connect.php?action=status');
    if (!data.success) return;

    if (qs('#shopeePartnerId') && data.partner_id) {
      qs('#shopeePartnerId').value = data.partner_id;
    }

    renderShopeeShopsTable(data.shops || []);
  } catch (e) {
    const tbody = qs('#shopeeShopsTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="color:var(--red,#ef4444);padding:20px;text-align:center">${t('msg.error')}: ${escHtml(e.message)}</td></tr>`;
  }
}

function renderShopeeShopsTable(shops) {
  const tbody = qs('#shopeeShopsTableBody');
  if (!tbody) return;

  if (!shops.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">${t('connect.no_shopee')}</td></tr>`;
    return;
  }

  tbody.innerHTML = shops.map(s => {
    const expiry    = s.access_token_expire_at ? s.access_token_expire_at.substring(0, 16) : '—';
    const lastSync  = s.last_synced_at         ? s.last_synced_at.substring(0, 16)         : t('msg.not_synced_short');
    const fromDate  = s.sync_from_date         || '';
    const isActive  = parseInt(s.is_active, 10) === 1;
    const statusBadge = isActive
      ? `<span style="color:#16a34a;font-size:12px;font-weight:600">${t('msg.active')}</span>`
      : `<span style="color:#9ca3af;font-size:12px">${t('msg.paused')}</span>`;

    return `<tr>
      <td style="font-weight:500">${escHtml(s.shop_name || '—')}</td>
      <td style="font-size:12px;color:var(--text-muted)">${escHtml(String(s.shop_id))}</td>
      <td>${statusBadge}</td>
      <td style="font-size:12px">${escHtml(expiry)}</td>
      <td style="font-size:12px">${escHtml(lastSync)}</td>
      <td>
        <input type="date" value="${escHtml(fromDate)}" style="font-size:11px;width:105px;border:1px solid var(--border);border-radius:6px;padding:2px 4px"
               onchange="setShopeeFromDate(${s.shop_id}, this.value)">
      </td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="syncShopeeShop(${s.shop_id})">Sync</button>
        <button class="btn btn-secondary btn-sm" style="font-size:11px" onclick="toggleShopeeActive(${s.shop_id}, ${isActive ? 0 : 1})">${isActive ? t('msg.disable') : t('msg.enable')}</button>
        <button class="btn btn-sm" style="background:#ef4444;color:#fff;border:none;font-size:11px" onclick="disconnectShopee(${s.shop_id})">${t('lang.delete')}</button>
      </td>
    </tr>`;
  }).join('');
}

async function syncShopeeShop(shopId) {
  const resultsEl = qs('#shopeeSyncResults');
  if (resultsEl) resultsEl.innerHTML = `<div style="font-size:13px;color:var(--text-muted)">${t('msg.syncing')}</div>`;

  try {
    const res = await apiFetch('api/shopee-connect.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'sync', shop_id: shopId }),
    });
    if (res.success && resultsEl) {
      resultsEl.innerHTML = res.results.map(r =>
        `<div style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)">
          ${r.success ? '✓' : '✗'} <strong>${escHtml(r.shop)}</strong>:
          ${r.success ? `+${r.imported} ${t('connect.items_unit')}` : escHtml(r.error)}
        </div>`
      ).join('');
      toast(t('toast.shopee_sync_done'), 'success');
      loadShopeeConnectPage();
    } else if (resultsEl) {
      resultsEl.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px">${t('msg.error')}: ${escHtml(res.error || '')}</div>`;
    }
  } catch (e) {
    if (resultsEl) resultsEl.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px">${t('msg.error')}: ${escHtml(e.message)}</div>`;
  }
}

async function toggleShopeeActive(shopId, active) {
  await apiFetch('api/shopee-connect.php', {
    method: 'POST',
    body: JSON.stringify({ action: 'toggle_active', shop_id: shopId, is_active: active }),
  });
  loadShopeeConnectPage();
}

async function setShopeeFromDate(shopId, date) {
  await apiFetch('api/shopee-connect.php', {
    method: 'POST',
    body: JSON.stringify({ action: 'set_sync_from', shop_id: shopId, sync_from_date: date }),
  });
}

async function disconnectShopee(shopId) {
  if (!confirm(t('confirm.delete_shopee'))) return;
  await apiFetch('api/shopee-connect.php', {
    method: 'POST',
    body: JSON.stringify({ action: 'disconnect', shop_id: shopId }),
  });
  loadShopeeConnectPage();
}

function setupShopeeConnectPage() {
  qs('#btnShopeeSaveCredentials')?.addEventListener('click', async () => {
    const partnerId  = parseInt(qs('#shopeePartnerId')?.value  || '0', 10);
    const partnerKey = qs('#shopeePartnerKey')?.value?.trim() || '';
    const res = await apiFetch('api/shopee-connect.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'save_credentials', partner_id: partnerId, partner_key: partnerKey }),
    });
    toast(res.success ? t('connect.shopee_saved') : (res.error || t('msg.failed')), res.success ? 'success' : 'error');
  });

  qs('#btnConnectShopee')?.addEventListener('click', async () => {
    const statusEl = qs('#shopeeConnectStatus');
    if (statusEl) statusEl.textContent = t('msg.getting_auth_url');
    try {
      const res = await apiFetch('api/shopee-connect.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'get_auth_url' }),
      });
      if (res.success && res.auth_url) {
        if (statusEl) statusEl.textContent = t('msg.redirecting');
        location.href = res.auth_url;
      } else {
        if (statusEl) statusEl.textContent = '';
        toast(res.error || t('msg.no_auth_url'), 'error');
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = '';
      toast(t('msg.conn_error'), 'error');
    }
  });

  qs('#btnShopeeSyncAll')?.addEventListener('click', () => syncShopeeShop(0));
  qs('#btnShopeeRefresh')?.addEventListener('click', loadShopeeConnectPage);
}

// ── Init ──────────────────────────────────────────────────────────────────
let _appShellReady = false;

function setupAppShell() {
  if (_appShellReady) return; // guard: only bind event listeners once
  _appShellReady = true;

  setupNav();
  setupPlatformFilter();
  setupPeriodPicker();
  setupLogsPage();
  setupConnectPage();
  setupLazadaConnectPage();
  setupShopeeConnectPage();
  setupAdminPage();
  setupCustomerDetailDrawer();
  setupSidebarCollapse();
  setupMobileSidebar();
  setupLangDropdown();
  setupUserMenu();
  setupProfileModal();
  setupPasswordModal();
  syncPasswordStrengthIndicators();
  qs('#btnLogout')?.addEventListener('click', logout);
  if (isAdminUser()) checkForUpdates();
}

document.addEventListener('DOMContentLoaded', async () => {
  setupLogin();
  await I18n.init(); // loads translations (vi inline, others from cache/network)

  const ok = await initAuth();
  if (!ok) return; // not logged in — wait for login form submit

  setupAppShell();
  await loadPeriods();
  const initPage = location.hash.replace('#', '') || 'overview';
  loadPage(['overview','orders','products','customers','traffic','comparison','heatmaps','upload','logs','connect','settings','admin'].includes(initPage) ? initPage : 'overview');
});

function setupMobileSidebar() {
  const sidebar  = qs('#sidebar');
  const overlay  = qs('#sidebarOverlay');
  const hamburger = qs('#btnMenuToggle');
  if (!sidebar || !hamburger) return;

  function openSidebar() {
    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('active');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }

  hamburger.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  overlay?.addEventListener('click', closeSidebar);

  // Close on nav item click (mobile)
  qsa('.nav-item', sidebar).forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) closeSidebar();
    });
  });
}

function setupLangDropdown() {
  I18n.loadAvailableLangs().then(langs => {
    renderUserLanguageOptions(langs);
  });
}

function renderUserLanguageOptions(langs) {
  const list = qs('#userMenuLangList');
  const currentBadge = qs('#userMenuLangCurrent');
  if (!list) return;

  const current = I18n.getLang();
  const currentMeta = (langs || []).find(lang => lang.code === current);
  if (currentBadge) {
    currentBadge.textContent = currentMeta ? `${currentMeta.flag} ${current.toUpperCase()}` : current.toUpperCase();
  }

  list.innerHTML = (langs || []).map(lang => `
    <button class="user-lang-option${lang.code === current ? ' active' : ''}" type="button" data-code="${lang.code}">
      <span class="user-lang-option-flag">${lang.flag}</span>
      <span class="user-lang-option-name">${lang.name}</span>
      <span class="user-lang-option-code">${lang.code.toUpperCase()}</span>
    </button>
  `).join('');

  list.querySelectorAll('.user-lang-option[data-code]').forEach(el => {
    el.addEventListener('click', async () => {
      const code = el.dataset.code;
      await I18n.setLang(code);
      applyAuthUI();
      if (window.App) loadPage(App.currentPage);
    });
  });
}

function closeUserMenu() {
  const menu = qs('#userMenu');
  const btn = qs('#btnUserMenu');
  if (!menu || !btn) return;
  menu.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
}

function setupUserMenu() {
  const menu = qs('#userMenu');
  const btn = qs('#btnUserMenu');
  const dropdown = qs('#userMenuDropdown');
  if (!menu || !btn || !dropdown) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  dropdown.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', closeUserMenu);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeUserMenu();
  });

  qs('#btnUserMenuProfile')?.addEventListener('click', () => {
    closeUserMenu();
    openProfileModal();
  });

  qs('#btnUserMenuPassword')?.addEventListener('click', () => {
    closeUserMenu();
    openPasswordModal();
  });

  qs('#btnUserMenuLangSettings')?.addEventListener('click', () => {
    closeUserMenu();
    window.openAdminTab?.('system');
  });

  qs('#btnUserMenuAdmin')?.addEventListener('click', () => {
    closeUserMenu();
    window.openAdminTab?.('accounts');
  });

  qs('#btnUserMenuLogout')?.addEventListener('click', () => {
    closeUserMenu();
    logout();
  });
}

function openProfileModal() {
  const modal = qs('#profileModal');
  const errorEl = qs('#profileFormError');
  if (!modal) return;

  qs('#profileForm')?.reset();
  qs('#profileFullName').value = App.user?.full_name || '';
  qs('#profileUsername').value = App.user?.username || '';
  qs('#profileAvatarFile').value = '';
  modal.dataset.removeAvatar = '0';
  if (errorEl) errorEl.textContent = '';
  paintAvatar(qs('#profileAvatarPreview'), getUserDisplayName(), App.user?.avatar_path || '');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  qs('#profileFullName')?.focus();
}

function closeProfileModal() {
  const modal = qs('#profileModal');
  const errorEl = qs('#profileFormError');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  modal.dataset.removeAvatar = '0';
  if (errorEl) errorEl.textContent = '';
}

function updateProfileAvatarPreview(file = null) {
  const preview = qs('#profileAvatarPreview');
  if (!preview) return;

  if (!file) {
    paintAvatar(preview, qs('#profileFullName')?.value || getUserDisplayName(), App.user?.avatar_path || '');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    preview.textContent = '';
    preview.classList.add('has-image');
    preview.style.backgroundImage = `url("${reader.result}")`;
  };
  reader.readAsDataURL(file);
}

function setupProfileModal() {
  const modal = qs('#profileModal');
  const form = qs('#profileForm');
  const fileInput = qs('#profileAvatarFile');
  if (!modal || !form || !fileInput) return;

  qsa('[data-profile-close]').forEach(el => {
    el.addEventListener('click', closeProfileModal);
  });
  qs('#btnCloseProfileModal')?.addEventListener('click', closeProfileModal);
  qs('#btnCancelProfileModal')?.addEventListener('click', closeProfileModal);
  qs('#btnChooseAvatar')?.addEventListener('click', () => fileInput.click());
  qs('#btnRemoveAvatar')?.addEventListener('click', () => {
    fileInput.value = '';
    modal.dataset.removeAvatar = '1';
    paintAvatar(qs('#profileAvatarPreview'), qs('#profileFullName')?.value || getUserDisplayName(), '');
  });

  qs('#profileFullName')?.addEventListener('input', () => {
    const file = fileInput.files?.[0];
    if (file) return;
    const shouldUseCurrent = modal.dataset.removeAvatar !== '1';
    paintAvatar(qs('#profileAvatarPreview'), qs('#profileFullName')?.value || getUserDisplayName(), shouldUseCurrent ? (App.user?.avatar_path || '') : '');
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0] || null;
    modal.dataset.removeAvatar = file ? '0' : modal.dataset.removeAvatar;
    updateProfileAvatarPreview(file);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeProfileModal();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const errorEl = qs('#profileFormError');
    const submitBtn = qs('#btnSubmitProfileModal');
    if (errorEl) errorEl.textContent = '';

    const fd = new FormData();
    fd.append('action', 'update_profile');
    fd.append('_csrf', App.csrf);
    fd.append('full_name', qs('#profileFullName')?.value || '');
    fd.append('remove_avatar', modal.dataset.removeAvatar === '1' ? '1' : '');
    if (fileInput.files?.[0]) {
      fd.append('avatar_file', fileInput.files[0]);
    }

    submitBtn?.setAttribute('disabled', 'disabled');
    try {
      const res = await fetch('api/account.php', {
        method: 'POST',
        body: fd,
      }).then(r => r.json());
      if (!res.success) throw new Error(res.error || t('msg.failed'));
      App.user = { ...(App.user || {}), ...(res.user || {}) };
      applyAuthUI();
      if (App.currentPage === 'admin' && App.adminTab === 'accounts') {
        loadAdminUsers();
      }
      toast(t('account.profile.success'), 'success');
      closeProfileModal();
    } catch (e) {
      if (errorEl) errorEl.textContent = e.message;
    } finally {
      submitBtn?.removeAttribute('disabled');
    }
  });
}

function openPasswordModal(options = {}) {
  const modal = qs('#passwordModal');
  const errorEl = qs('#changePasswordError');
  const form = qs('#changePasswordForm');
  if (!modal) return;

  App.passwordModalForced = Boolean(options.forced);
  form?.reset();
  if (errorEl) errorEl.textContent = '';
  syncPasswordModalState();
  syncPasswordStrengthIndicators();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  qs('#currentPassword')?.focus();
}

function closePasswordModal(options = {}) {
  const modal = qs('#passwordModal');
  const errorEl = qs('#changePasswordError');
  if (!modal) return;
  if (App.passwordModalForced && !options.force) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (errorEl) errorEl.textContent = '';
  syncPasswordModalState();
}

function setupPasswordModal() {
  const form = qs('#changePasswordForm');
  if (!form) return;

  const handleCancel = () => {
    if (App.passwordModalForced) {
      logout();
      return;
    }
    closePasswordModal();
  };

  qsa('[data-password-close]').forEach(el => {
    el.addEventListener('click', handleCancel);
  });
  qs('#btnClosePasswordModal')?.addEventListener('click', handleCancel);
  qs('#btnCancelPasswordModal')?.addEventListener('click', handleCancel);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !App.passwordModalForced) closePasswordModal();
  });
  qs('#newPassword')?.addEventListener('input', syncPasswordStrengthIndicators);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const errorEl = qs('#changePasswordError');
    const submitBtn = qs('#btnSubmitPasswordModal');
    if (errorEl) errorEl.textContent = '';

    const payload = {
      action: 'change_password',
      current_password: qs('#currentPassword')?.value || '',
      new_password: qs('#newPassword')?.value || '',
      confirm_password: qs('#confirmPassword')?.value || '',
    };

    submitBtn?.setAttribute('disabled', 'disabled');
    try {
      ensurePasswordStrength(payload.new_password);
      const res = await apiFetch('api/account.php', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.success) throw new Error(res.error || t('msg.failed'));
      App.user = { ...(App.user || {}), ...(res.user || {}) };
      applyAuthUI();
      App.passwordModalForced = false;
      toast(t('account.password.success'), 'success');
      closePasswordModal({ force: true });
    } catch (e) {
      if (errorEl) errorEl.textContent = e.message;
    } finally {
      submitBtn?.removeAttribute('disabled');
    }
  });
}

window.syncPasswordStrengthIndicators = syncPasswordStrengthIndicators;
window.syncPasswordModalState = syncPasswordModalState;

let _langSettingsRefresh = async () => {};
let _langSettingsBound = false;

async function setupLangSettings() {
  const card   = qs('#langSettingsCard');
  const list   = qs('#langListContent');
  const input  = qs('#langFileInput');
  if (!card || !list) return;

  async function refresh() {
    list.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:13px">${t('msg.loading')}</div>`;
    const langs = await I18n.loadAvailableLangs();
    renderUserLanguageOptions(langs); // keep user menu in sync

    list.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
        ${langs.map(l => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-base,#f8fafc);border-radius:10px">
            <span style="font-size:24px;line-height:1">${l.flag}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600">${l.name}</div>
              <div style="font-size:11px;color:var(--text-muted)">${l.code.toUpperCase()} · ${l.keys} ${t('lang.keys')}</div>
            </div>
            ${l.builtin
              ? `<span style="font-size:10px;color:var(--text-muted);background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:2px 6px">${t('lang.builtin')}</span>`
              : `<button onclick="deleteLang('${l.code}')" style="background:none;border:none;cursor:pointer;color:var(--red,#ef4444);font-size:12px;padding:4px 8px;border-radius:5px;transition:background .15s" onmouseenter="this.style.background='#fee2e2'" onmouseleave="this.style.background='none'">${t('lang.delete')}</button>`
            }
          </div>`).join('')}
      </div>`;
  }

  _langSettingsRefresh = refresh;
  await refresh();

  if (_langSettingsBound || !input) return;
  _langSettingsBound = true;

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('action', 'upload');
    fd.append('_csrf', App.csrf);
    fd.append('lang_file', file);
    try {
      const data = await fetch('api/lang.php', { method: 'POST', body: fd }).then(r => r.json());
      if (!data.success) throw new Error(data.error || 'Upload failed');
      toast(`${data.flag} ${data.name}`, 'success');
      input.value = '';
      await _langSettingsRefresh();
    } catch (e) {
      toast(`${t('msg.error')}: ${e.message}`, 'error');
    }
  });
}

window.deleteLang = async function(code) {
  if (!confirm(`${t("lang.delete")} "${code}"?`)) return;
  const fd = new FormData();
  fd.append('action', 'delete');
  fd.append('_csrf', App.csrf);
  fd.append('code', code);
  try {
    const data = await fetch('api/lang.php', { method: 'POST', body: fd }).then(r => r.json());
    if (!data.success) throw new Error(data.error || 'Failed');
    toast(`${t('lang.delete')}: ${code}`, 'success');
    window.openAdminTab?.('system');
  } catch (e) {
    toast(`${t('msg.delete_failed')} ${e.message}`, 'error');
  }
};

function setupSidebarCollapse() {
  const sidebar  = qs('#sidebar');
  const btn      = qs('#btnCollapseSidebar');
  if (!sidebar || !btn) return;

  // restore saved state
  if (localStorage.getItem('sidebarCollapsed') === '1') {
    sidebar.classList.add('collapsed');
  }

  btn.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
  });

  // tooltip for collapsed nav items
  const tooltip = document.createElement('div');
  tooltip.className = 'sidebar-tooltip';
  document.body.appendChild(tooltip);

  let tooltipTimer;
  qsa('.nav-item[data-label]').forEach(item => {
    item.addEventListener('mouseenter', e => {
      if (!sidebar.classList.contains('collapsed')) return;
      const label = item.dataset.label;
      tooltip.textContent = label;
      const r = item.getBoundingClientRect();
      tooltip.style.top  = (r.top + r.height / 2) + 'px';
      tooltip.style.left = (r.right + 8) + 'px';
      tooltip.style.transform = 'translateY(-50%)';
      clearTimeout(tooltipTimer);
      tooltip.classList.add('visible');
    });
    item.addEventListener('mouseleave', () => {
      clearTimeout(tooltipTimer);
      tooltipTimer = setTimeout(() => tooltip.classList.remove('visible'), 80);
    });
  });
}
