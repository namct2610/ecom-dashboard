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
  currentPage: 'overview',
  periods: { months: [], years: [] },
};

// ── Helpers ──────────────────────────────────────────────────────────────
function qs(sel, ctx = document)  { return ctx.querySelector(sel); }
function qsa(sel, ctx = document) { return Array.from(ctx.querySelectorAll(sel)); }

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

function platformLabel(p) {
  return { shopee: 'Shopee', lazada: 'Lazada', tiktokshop: 'TikTok' }[p] || p;
}

function platformBadge(p) {
  const cls = { shopee: 'badge-shopee', lazada: 'badge-lazada', tiktokshop: 'badge-tiktokshop' }[p] || '';
  return `<span class="badge ${cls}">${platformLabel(p)}</span>`;
}

function statusBadge(s) {
  const map = {
    completed: ['badge-completed', 'Hoàn thành'],
    delivered: ['badge-delivered', 'Đã giao'],
    cancelled: ['badge-cancelled', 'Đã huỷ'],
    pending:   ['badge-pending',   'Đang xử lý'],
  };
  const [cls, label] = map[s] || ['badge-pending', s];
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
  const params = new URLSearchParams({
    mode:     App.mode,
    period:   App.period,
    platform: App.platform,
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
  qs('#auth-screen').classList.remove('hidden');
  qs('#app').classList.add('hidden');
}

function hideAuth() {
  qs('#auth-screen').classList.add('hidden');
  qs('#app').classList.remove('hidden');
}

async function initAuth() {
  try {
    const data = await fetch('api/auth.php').then(r => r.json());
    if (data.logged_in) {
      App.csrf = data.csrf;
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
    btn.textContent = 'Đang đăng nhập...';

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
        hideAuth();
        await loadPeriods();
        loadPage(App.currentPage);
      } else {
        errEl.textContent = data.error || 'Đăng nhập thất bại.';
      }
    } catch (e) {
      errEl.textContent = 'Lỗi kết nối server.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Đăng nhập';
    }
  });
}

async function logout() {
  await fetch('api/auth.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': App.csrf },
    body: JSON.stringify({ action: 'logout' }),
  });
  showAuth();
}

// ── Time filter ──────────────────────────────────────────────────────────
async function loadPeriods() {
  try {
    const data = await api('date-periods.php', { params: {} });
    App.periods = data;
    renderPeriodSelect();
  } catch (e) {
    console.warn('loadPeriods error', e);
  }
}

function renderPeriodSelect() {
  const select = qs('#periodSelect');
  const { months, years } = App.periods;
  select.innerHTML = '';

  if (App.mode === 'month') {
    months.forEach(m => {
      const o = document.createElement('option');
      o.value = m.value;
      o.textContent = m.label;
      select.appendChild(o);
    });
    if (!App.period && months.length) App.period = months[0].value;
  } else {
    years.forEach(y => {
      const o = document.createElement('option');
      o.value = y.value;
      o.textContent = y.label;
      select.appendChild(o);
    });
    if (!App.period && years.length) App.period = years[0].value;
  }
  select.value = App.period;
}

function setupTimeFilter() {
  // Mode buttons (Tháng / Năm)
  qsa('.time-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      App.mode = btn.dataset.mode;
      App.period = '';
      qsa('.time-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPeriodSelect();
      loadPage(App.currentPage);
    });
  });

  // Period select
  qs('#periodSelect').addEventListener('change', (e) => {
    App.period = e.target.value;
    loadPage(App.currentPage);
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

function loadPage(name) {
  App.currentPage = name;

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
    connect:    loadConnectPage,
    settings:   loadSettingsPage,
  };
  if (loaders[name]) loaders[name]();
}

// ── Page Loaders ─────────────────────────────────────────────────────────

async function loadOverview() {
  try {
    const [rev, orders, traffic] = await Promise.all([
      api('revenue.php'),
      api('orders.php'),
      api('traffic.php'),
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
    renderTopProducts('topProductsOverview', orders, rev);
    renderRecentOrders('recentOrdersMini', orders.recent);

    // Platform legend
    renderPlatformLegend('platformLegend', rev.platform_breakdown, rev.summary.total_revenue);
  } catch (e) {
    console.error('loadOverview', e);
    toast('Không thể tải dữ liệu overview.', 'error');
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
    toast('Không thể tải dữ liệu đơn hàng.', 'error');
  }
}

async function loadProducts() {
  try {
    const data = await api('products.php');

    qs('#total-skus').textContent = fmtNum(data.total_skus);

    Charts.renderTopQtyBar('chartTopQty', data.top_qty);
    Charts.renderTopRevBar('chartTopRev', data.top_revenue);
    renderTopRevMini('topRevMini', data.top_revenue);
    _productsAll  = data.all || [];
    _productsPage = 1;
    renderProductsTablePage('productsTable', 'productsPager');
  } catch (e) {
    console.error('loadProducts', e);
    toast('Không thể tải dữ liệu sản phẩm.', 'error');
  }
}

async function loadCustomers() {
  try {
    const data = await api('customers.php');

    qs('#cust-total').textContent  = fmtNum(data.summary.total_orders);
    qs('#cust-aov').textContent    = fmtVND(data.summary.avg_order_value);
    qs('#cust-buyers').textContent = fmtNum(data.summary.unique_buyers || 0);

    Charts.renderCityBar('chartCities', data.city_distribution);
    _citiesAll  = data.city_distribution || [];
    _citiesPage = 1;
    renderCityListPage('cityList', 'cityListPager');

    Charts.renderDistrictBar('chartHcmDistricts', data.hcm_districts || [], 'TP. Hồ Chí Minh');
    Charts.renderDistrictBar('chartHanoiDistricts', data.hanoi_districts || [], 'Hà Nội');
  } catch (e) {
    console.error('loadCustomers', e);
    toast('Không thể tải dữ liệu khách hàng.', 'error');
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
    toast('Không thể tải dữ liệu traffic.', 'error');
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
    toast('Không thể tải dữ liệu so sánh.', 'error');
  }
}

async function loadHeatmaps() {
  try {
    const data = await api('heatmap.php');
    renderHeatmap7x24('heatmap7x24', data.heatmap, data.max_orders);
    Charts.renderRevByCity('chartRevenueCity', data.revenue_by_city);
  } catch (e) {
    console.error('loadHeatmaps', e);
    toast('Không thể tải dữ liệu heatmap.', 'error');
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
  if (pages <= 1) { el.innerHTML = `<p class="pager-info">Tổng: ${total}</p>`; return; }

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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">Không có dữ liệu</td></tr>';
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
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">Không có dữ liệu</td></tr>';
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
  const page  = _citiesPage;
  const slice = _citiesAll.slice((page-1)*PER_PAGE, page*PER_PAGE);
  const el = qs(`#${listId}`); if (!el) return;
  const maxO = _citiesAll[0]?.orders || 1;
  el.innerHTML = slice.map((c, i) => {
    const rank = (page-1)*PER_PAGE + i + 1;
    return `<div style="display:flex;align-items:center;gap:10px;padding:4px 0">
      <span style="font-size:11px;color:var(--text-muted);width:22px;text-align:right">${rank}</span>
      <span style="font-size:13px;flex:1;color:var(--text-primary)">${c.city}</span>
      <div class="progress-bar-wrap" style="width:80px">
        <div class="progress-bar-fill" style="width:${Math.round(c.orders/maxO*100)}%;background:var(--primary-light)"></div>
      </div>
      <span style="font-size:12px;font-weight:600;width:40px;text-align:right">${fmtNum(c.orders)}</span>
    </div>`;
  }).join('');
  renderPager(pagerId, page, _citiesAll.length, PER_PAGE, 'gotoCityPage');
}

// ── DOM Renderers ─────────────────────────────────────────────────────────

function renderRecentOrders(containerId, orders) {
  const el = qs(`#${containerId}`);
  if (!el) return;
  if (!orders || !orders.length) { el.innerHTML = '<div class="empty-state"><p>Không có đơn hàng</p></div>'; return; }
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

function renderTopProducts(id, orders, rev) {
  const el = qs(`#${id}`); if (!el) return;
  const recent = (orders.recent || []).slice(0, 6);
  if (!recent.length) { el.innerHTML = '<div class="empty-state"><p>Chưa có dữ liệu</p></div>'; return; }
  el.innerHTML = recent.map(o => `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
      ${platformBadge(o.platform)}
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${(o.product_name||'').replace(/\[.*?\]\s*/g,'').trim().slice(0,40)}
        </div>
        <div style="font-size:11px;color:var(--text-muted)">${fmtDate(o.order_created_at)}</div>
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--primary);white-space:nowrap">${fmtVND(o.order_total)}</div>
    </div>`).join('');
}

function renderOrdersTable(id, orders) {
  const tbody = qs(`#${id}`); if (!tbody) return;
  if (!orders || !orders.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">Không có dữ liệu</td></tr>'; return; }
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
    ['#10b981','Hoàn thành', summary.completed],
    ['#ef4444','Đã huỷ',     summary.cancelled],
    ['#0284c7','Đang giao',  summary.pending],
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
  if (!products || !products.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">Không có dữ liệu</td></tr>'; return; }
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

// 10-level heatmap palette: level 0 = empty, 1–10 = low→high
const HEAT_PALETTE = [
  '#f1f5f9', // 0 — none
  '#dbeafe', // 1
  '#bfdbfe', // 2
  '#93c5fd', // 3
  '#60a5fa', // 4
  '#3b82f6', // 5
  '#2563eb', // 6
  '#1d4ed8', // 7
  '#1e3a8a', // 8
  '#172554', // 9
  '#0f1629', // 10
];

function renderHeatmap7x24(id, heatmap, maxOrders) {
  const el = qs(`#${id}`); if (!el) return;
  const days = ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','CN'];

  // Build map
  const map = {};
  heatmap.forEach(h => { map[`${h.weekday}-${h.hour}`] = h.orders; });
  const max = maxOrders || 1;

  let html = '<div class="heatmap-grid">';

  // Hour labels row
  html += '<div class="heatmap-row"><div class="heatmap-label-day"></div>';
  for (let h = 0; h < 24; h++) {
    html += `<div class="heatmap-label-hour">${h}</div>`;
  }
  html += '</div>';

  for (let wd = 0; wd < 7; wd++) {
    html += `<div class="heatmap-row"><div class="heatmap-label-day">${days[wd]}</div>`;
    for (let h = 0; h < 24; h++) {
      const v = map[`${wd}-${h}`] || 0;
      const level = v === 0 ? 0 : Math.min(10, Math.ceil((v / max) * 10));
      const bg = HEAT_PALETTE[level];
      html += `<div class="heatmap-cell" style="background:${bg}" title="${days[wd]} ${h}:00 — ${v} đơn"></div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function renderUploadHistory(id, history) {
  const tbody = qs(`#${id}`); if (!tbody) return;
  if (!history || !history.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">Chưa có lịch sử upload</td></tr>';
    return;
  }
  const statusCls  = { completed: 'completed', failed: 'cancelled', processing: 'delivered', pending: 'pending' };
  const statusLabel = { completed: 'Hoàn thành', failed: 'Thất bại', processing: 'Đang xử lý', pending: 'Chờ xử lý' };
  tbody.innerHTML = history.map(h => `
    <tr>
      <td style="font-size:11px;color:var(--text-muted)">${(h.uploaded_at||'').slice(0,16)}</td>
      <td>${platformBadge(h.platform)}</td>
      <td><span class="badge ${h.data_type==='traffic' ? 'badge-delivered' : 'badge-pending'}">${h.data_type==='traffic'?'Traffic':'Đơn hàng'}</span></td>
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
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--red,#ef4444)">Lỗi tải dữ liệu: ${e.message}</td></tr>`;
  }
}

function renderLogsTable(rows) {
  const tbody = qs('#logsTableBody');
  if (!tbody) return;

  if (!rows || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">Không có dữ liệu nhật ký</td></tr>';
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
      <td>${hasCtx ? `<button onclick="toggleLogCtx('${ctxId}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px;padding:0 4px" title="Chi tiết">&#8943;</button>` : ''}</td>
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
    const scope    = [level && `level=${level}`, category && `category=${category}`].filter(Boolean).join(', ') || 'tất cả';
    if (!confirm(`Xoá log (${scope})? Hành động này không thể hoàn tác.`)) return;

    try {
      const res = await fetch('api/logs.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': App.csrf },
        body: JSON.stringify({ action: 'clear', level, category }),
      }).then(r => r.json());

      if (res.success) {
        toast('Đã xoá log thành công.', 'success');
        loadLogs(1);
      } else {
        toast(res.error || 'Xoá thất bại.', 'error');
      }
    } catch (e) {
      toast('Lỗi kết nối.', 'error');
    }
  });
}

// ── TikTok Connect page ────────────────────────────────────────────────────

async function loadConnectPage() {
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
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">Chưa có shop nào được kết nối.</td></tr>';
    return;
  }

  tbody.innerHTML = shops.map(s => {
    const active  = s.is_active ? '✓ Hoạt động' : '✗ Tắt';
    const expiry  = s.access_token_expire_at ? s.access_token_expire_at.substring(0, 16) : '—';
    const synced  = s.last_synced_at ? s.last_synced_at.substring(0, 16) : 'Chưa đồng bộ';
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
        <button class="btn btn-primary btn-sm btn-sync-shop" data-shop="${escHtml(s.shop_id)}" title="Đồng bộ">Sync</button>
        <button class="btn btn-secondary btn-sm btn-disconnect-shop" data-shop="${escHtml(s.shop_id)}" title="Ngắt kết nối" style="color:var(--red,#ef4444)">✕</button>
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
      if (!confirm('Ngắt kết nối shop này?')) return;
      try {
        const res = await apiFetch('api/tiktok-connect.php', {
          method: 'POST',
          body: JSON.stringify({ action: 'disconnect', shop_id: btn.dataset.shop }),
        });
        if (res.success) { toast('Đã ngắt kết nối.', 'success'); loadConnectPage(); }
        else toast(res.error || 'Thất bại.', 'error');
      } catch (e) { toast('Lỗi kết nối.', 'error'); }
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
  if (resultsEl) resultsEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Đang đồng bộ...</div>';

  try {
    const body = shopId ? { action: 'sync', shop_id: shopId } : { action: 'sync' };
    const res  = await apiFetch('api/tiktok-connect.php', { method: 'POST', body: JSON.stringify(body) });

    if (!res.success) {
      if (resultsEl) resultsEl.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px">Lỗi: ${escHtml(res.error || 'Không xác định')}</div>`;
      return;
    }

    const rows = (res.results || []).map(r => {
      if (r.success) return `<div style="color:var(--green,#22c55e);font-size:13px">✓ ${escHtml(r.shop)}: +${r.imported} đơn${r.errors ? `, ${r.errors} lỗi` : ''}</div>`;
      return `<div style="color:var(--red,#ef4444);font-size:13px">✗ ${escHtml(r.shop)}: ${escHtml(r.error || '')}</div>`;
    }).join('');

    if (resultsEl) resultsEl.innerHTML = rows || '<div style="color:var(--text-muted);font-size:13px">Không có kết quả.</div>';
    toast('Đồng bộ hoàn tất.', 'success');
    loadConnectPage(); // refresh last_synced_at
  } catch (e) {
    if (resultsEl) resultsEl.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px">Lỗi: ${escHtml(e.message)}</div>`;
    toast('Lỗi đồng bộ.', 'error');
  }
}

function setupConnectPage() {
  qs('#btnSaveCredentials')?.addEventListener('click', async () => {
    const appKey    = qs('#tiktokAppKey')?.value.trim()    || '';
    const appSecret = qs('#tiktokAppSecret')?.value.trim() || '';

    if (!appKey) { toast('App Key không được để trống.', 'error'); return; }

    try {
      const res = await apiFetch('api/tiktok-connect.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'save_credentials', app_key: appKey, app_secret: appSecret }),
      });
      if (res.success) toast('Đã lưu thông tin xác thực.', 'success');
      else toast(res.error || 'Lưu thất bại.', 'error');
    } catch (e) { toast('Lỗi kết nối.', 'error'); }
  });

  qs('#btnConnectTiktok')?.addEventListener('click', async () => {
    const statusEl = qs('#connectStatus');
    if (statusEl) statusEl.textContent = 'Đang lấy URL xác thực...';

    try {
      const res = await apiFetch('api/tiktok-connect.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'get_auth_url' }),
      });

      if (res.success && res.auth_url) {
        if (statusEl) statusEl.textContent = 'Đang chuyển hướng...';
        location.href = res.auth_url;
      } else {
        if (statusEl) statusEl.textContent = '';
        toast(res.error || 'Không lấy được URL xác thực.', 'error');
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = '';
      toast('Lỗi kết nối.', 'error');
    }
  });

  qs('#btnSyncAll')?.addEventListener('click', () => syncShop(''));
  qs('#btnRefreshShops')?.addEventListener('click', loadConnectPage);
}

// ── Settings page ─────────────────────────────────────────────────────────

async function loadSettingsPage() {
  await Promise.all([loadSysInfo(), loadUpdateCard()]);
  qs('#btnRefreshSysInfo')?.addEventListener('click', loadSysInfo);

  qs('#btnCheckUpdateNow')?.addEventListener('click', async () => {
    const panel = qs('#updateStatusPanel');
    if (panel) panel.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">Đang kiểm tra...</div>';
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
      toast('Đã lưu URL manifest!', 'success');
      await loadUpdateCard();
    } else {
      toast(res.error || 'Lỗi lưu URL.', 'error');
    }
  });
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
      ['Memory sử dụng', `${i.memory_used_mb} MB (peak: ${i.memory_peak_mb} MB)`],
      ['Upload max', i.upload_max],
      ['Max exec time', i.max_exec_time + 's'],
      ['Server', i.server_software],
      ['Múi giờ', i.timezone],
      ['Giờ server', i.server_time],
      ['Cài đặt lúc', i.installed_at || '—'],
    ];
    if (i.disk_total_gb) {
      const pct = i.disk_total_gb > 0 ? Math.round((1 - i.disk_free_gb / i.disk_total_gb) * 100) : 0;
      sysRows.push(['Dung lượng disk', `${i.disk_free_gb} GB trống / ${i.disk_total_gb} GB (${pct}% đã dùng)`]);
    }
    sysRows.push(['Kích thước DB', `${i.db_size_mb} MB`]);

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
      : 'Chưa có dữ liệu';

    qs('#dataStatsContent').innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div style="text-align:center;padding:14px 20px;background:#eff6ff;border-radius:10px;flex:1;min-width:120px">
          <div style="font-size:22px;font-weight:800">${fmtNum(i.order_count)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Tổng đơn hàng</div>
        </div>
        <div style="text-align:center;padding:14px 20px;background:#f0fdf4;border-radius:10px;flex:1;min-width:120px">
          <div style="font-size:22px;font-weight:800">${fmtNum(i.traffic_count)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Bản ghi traffic</div>
        </div>
        <div style="text-align:center;padding:14px 20px;background:#fefce8;border-radius:10px;flex:1;min-width:120px">
          <div style="font-size:22px;font-weight:800">${fmtNum(i.upload_count)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Lần upload</div>
        </div>
        <div style="text-align:center;padding:14px 20px;background:#fdf4ff;border-radius:10px;flex:1;min-width:120px">
          <div style="font-size:22px;font-weight:800">${fmtNum(i.log_count)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Log entries</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${platRows}</div>
      <div style="margin-top:10px;font-size:12px;color:var(--text-muted)">Khoảng thời gian đơn hàng: <strong>${escHtml(dateRange)}</strong></div>`;
  } catch (e) {
    qs('#sysInfoContent').innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px">Lỗi tải thông tin: ${escHtml(e.message)}</div>`;
  }
}

async function confirmReset(action, title, promptText, confirmWord) {
  const resultEl = qs('#resetResult');
  if (resultEl) resultEl.innerHTML = '';

  const answer = window.prompt(`${title}\n\n${promptText}`);
  if (answer === null) return; // cancelled
  if (answer.trim() !== confirmWord) {
    alert(`❌ Xác nhận sai. Bạn cần nhập chính xác: "${confirmWord}"`);
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
      if (resultEl) resultEl.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px;padding:10px 14px;background:#fef2f2;border-radius:8px">❌ ${escHtml(res.error || 'Thất bại')}</div>`;
    }
  } catch (e) {
    if (resultEl) resultEl.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px">Lỗi: ${escHtml(e.message)}</div>`;
  }
}

// ── Auto update ───────────────────────────────────────────────────────────

async function checkForUpdates() {
  // Lightweight background check — only updates the nav badge
  try {
    const data = await apiFetch('api/update.php?action=check');
    if (!data.success) return;
    const badge = qs('#updateNavBadge');
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

    const badge = qs('#updateNavBadge');
    if (badge) badge.style.display = data.has_update ? '' : 'none';

    if (!data.manifest_url) {
      panel.innerHTML = `
        <div style="padding:14px 16px;background:var(--bg-base,#f8fafc);border-radius:10px;font-size:13px;color:var(--text-muted)">
          Nhập URL Manifest ở trên để bật tính năng kiểm tra cập nhật tự động.
        </div>`;
      return;
    }

    if (data.fetch_error && !data.latest) {
      panel.innerHTML = `
        <div style="padding:14px 16px;background:#fef9c3;border-radius:10px;font-size:13px;color:#92400e">
          Không thể tải manifest: ${escHtml(data.fetch_error)}
        </div>`;
      return;
    }

    if (data.has_update) {
      panel.innerHTML = `
        <div style="padding:16px;background:#eff6ff;border-radius:10px;border:1px solid #bfdbfe">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-weight:700;color:#1d4ed8;font-size:15px;margin-bottom:4px">
                Có bản cập nhật mới: v${escHtml(data.latest)}
              </div>
              <div style="font-size:12px;color:var(--text-muted)">
                Hiện tại: v${escHtml(data.current)}
                ${data.released_at ? ' · Phát hành: ' + escHtml(data.released_at) : ''}
                ${data.min_php ? ' · Yêu cầu PHP ' + escHtml(data.min_php) + '+' : ''}
              </div>
            </div>
            <button class="btn btn-primary btn-sm" id="btnApplyUpdate" style="white-space:nowrap">
              Cập nhật ngay
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
            <div style="font-weight:600;color:#166534;font-size:13px">Đang dùng phiên bản mới nhất (v${escHtml(data.current)})</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
              Kiểm tra lúc: ${escHtml(data.last_checked || '—')}
            </div>
          </div>
        </div>`;
    } else {
      panel.innerHTML = `
        <div style="padding:14px 16px;background:#fef9c3;border-radius:10px;font-size:13px;color:#92400e">
          Không lấy được thông tin phiên bản. Kiểm tra URL manifest và thử lại.
        </div>`;
    }
  } catch (e) {
    if (panel) panel.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px;padding:12px">Lỗi: ${escHtml(e.message)}</div>`;
  }
}

async function applySystemUpdate(downloadUrl, version) {
  const panel = qs('#updateStatusPanel');

  if (!confirm(`Cập nhật lên v${version}?\n\nCác file mới sẽ được cài đặt. config.php và uploads/ sẽ được giữ nguyên.\nVui lòng backup trước nếu cần.`)) return;

  if (panel) {
    panel.innerHTML = `
      <div style="padding:24px;text-align:center;color:var(--text-muted)">
        <div style="font-size:32px;margin-bottom:10px">⏳</div>
        <div style="font-weight:600;font-size:14px">Đang tải và áp dụng v${escHtml(version)}...</div>
        <div style="font-size:12px;margin-top:6px">Vui lòng không đóng trang (có thể mất 30–60 giây)</div>
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
            <div style="font-weight:700;color:#166534;font-size:15px">Cập nhật thành công!</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:4px">${escHtml(res.message)}</div>
            <button class="btn btn-primary" style="margin-top:16px" onclick="location.reload()">
              Tải lại trang
            </button>
          </div>`;
      }
      toast('Cập nhật thành công!', 'success');
    } else {
      if (panel) {
        panel.innerHTML = `
          <div style="padding:16px;background:#fef2f2;border-radius:10px">
            <div style="font-weight:600;color:#dc2626;margin-bottom:6px">Cập nhật thất bại</div>
            <div style="font-size:13px">${escHtml(res.error || 'Lỗi không xác định')}</div>
            <button class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="loadUpdateCard()">Thử lại</button>
          </div>`;
      }
    }
  } catch (e) {
    if (panel) {
      panel.innerHTML = `
        <div style="padding:16px;background:#fef2f2;border-radius:10px">
          <div style="color:#dc2626;margin-bottom:6px">Lỗi kết nối</div>
          <div style="font-size:13px">${escHtml(e.message)}</div>
          <button class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="loadUpdateCard()">Thử lại</button>
        </div>`;
    }
  }
}

// ── Connect tab switcher ───────────────────────────────────────────────────

function switchConnectTab(tab) {
  const tiktokTab  = qs('#connectTabTiktok');
  const lazadaTab  = qs('#connectTabLazada');
  const btnTiktok  = qs('#btnConnectTabTiktok');
  const btnLazada  = qs('#btnConnectTabLazada');
  if (!tiktokTab || !lazadaTab) return;

  const isTiktok = tab === 'tiktok';
  tiktokTab.style.display = isTiktok ? '' : 'none';
  lazadaTab.style.display = isTiktok ? 'none' : '';

  const activeColor   = 'var(--primary,#4f46e5)';
  const inactiveColor = 'var(--text-muted)';
  if (btnTiktok) {
    btnTiktok.style.borderBottomColor = isTiktok ? activeColor : 'transparent';
    btnTiktok.style.color = isTiktok ? activeColor : inactiveColor;
  }
  if (btnLazada) {
    btnLazada.style.borderBottomColor = isTiktok ? 'transparent' : activeColor;
    btnLazada.style.color = isTiktok ? inactiveColor : activeColor;
  }

  if (!isTiktok) loadLazadaConnectPage();
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
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">Chưa có tài khoản nào được kết nối.</td></tr>';
    return;
  }

  tbody.innerHTML = accounts.map(a => {
    const active   = a.is_active ? '✓ Hoạt động' : '✗ Tắt';
    const expiry   = a.access_token_expire_at ? a.access_token_expire_at.substring(0, 16) : '—';
    const synced   = a.last_synced_at ? a.last_synced_at.substring(0, 16) : 'Chưa đồng bộ';
    const fromDate = a.sync_from_date || '';
    const actStyle = a.is_active ? 'color:var(--green,#22c55e)' : 'color:var(--text-muted)';

    return `<tr>
      <td><strong>${escHtml(a.account_name || a.account_id)}</strong><br><span style="font-size:11px;color:var(--text-muted)">${escHtml(a.account_id)}</span></td>
      <td>${escHtml((a.country || '').toUpperCase())}</td>
      <td style="${actStyle};font-size:12px">${active}</td>
      <td style="font-size:12px">${expiry}</td>
      <td style="font-size:12px">${synced}</td>
      <td><input type="date" class="lazada-sync-from-date" data-account="${escHtml(a.account_id)}" value="${escHtml(fromDate)}"
          style="border:1px solid var(--border);border-radius:4px;padding:2px 6px;background:var(--bg-card);color:var(--text-primary);font-size:12px;width:100%"></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm btn-lazada-sync" data-account="${escHtml(a.account_id)}" title="Đồng bộ">Sync</button>
        <button class="btn btn-secondary btn-sm btn-lazada-disconnect" data-account="${escHtml(a.account_id)}" title="Ngắt kết nối" style="color:var(--red,#ef4444)">✕</button>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.btn-lazada-sync').forEach(btn => {
    btn.addEventListener('click', () => syncLazadaAccount(btn.dataset.account));
  });

  tbody.querySelectorAll('.btn-lazada-disconnect').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Ngắt kết nối tài khoản Lazada này?')) return;
      try {
        const res = await apiFetch('api/lazada-connect.php', {
          method: 'POST',
          body: JSON.stringify({ action: 'disconnect', account_id: btn.dataset.account }),
        });
        if (res.success) { toast('Đã ngắt kết nối.', 'success'); loadLazadaConnectPage(); }
        else toast(res.error || 'Thất bại.', 'error');
      } catch (e) { toast('Lỗi kết nối.', 'error'); }
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
  if (resultsEl) resultsEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Đang đồng bộ...</div>';

  try {
    const body = accountId ? { action: 'sync', account_id: accountId } : { action: 'sync' };
    const res  = await apiFetch('api/lazada-connect.php', { method: 'POST', body: JSON.stringify(body) });

    if (!res.success) {
      if (resultsEl) resultsEl.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px">Lỗi: ${escHtml(res.error || 'Không xác định')}</div>`;
      return;
    }

    const rows = (res.results || []).map(r => {
      if (r.success) return `<div style="color:var(--green,#22c55e);font-size:13px">✓ ${escHtml(r.account)}: +${r.imported} mục${r.errors ? `, ${r.errors} lỗi` : ''}</div>`;
      return `<div style="color:var(--red,#ef4444);font-size:13px">✗ ${escHtml(r.account)}: ${escHtml(r.error || '')}</div>`;
    }).join('');

    if (resultsEl) resultsEl.innerHTML = rows || '<div style="color:var(--text-muted);font-size:13px">Không có kết quả.</div>';
    toast('Đồng bộ Lazada hoàn tất.', 'success');
    loadLazadaConnectPage();
  } catch (e) {
    if (resultsEl) resultsEl.innerHTML = `<div style="color:var(--red,#ef4444);font-size:13px">Lỗi: ${escHtml(e.message)}</div>`;
    toast('Lỗi đồng bộ Lazada.', 'error');
  }
}

function setupLazadaConnectPage() {
  qs('#btnLazadaSaveCredentials')?.addEventListener('click', async () => {
    const appKey    = qs('#lazadaAppKey')?.value.trim()    || '';
    const appSecret = qs('#lazadaAppSecret')?.value.trim() || '';
    if (!appKey) { toast('App Key không được để trống.', 'error'); return; }
    try {
      const res = await apiFetch('api/lazada-connect.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'save_credentials', app_key: appKey, app_secret: appSecret }),
      });
      if (res.success) toast('Đã lưu thông tin xác thực Lazada.', 'success');
      else toast(res.error || 'Lưu thất bại.', 'error');
    } catch (e) { toast('Lỗi kết nối.', 'error'); }
  });

  qs('#btnConnectLazada')?.addEventListener('click', async () => {
    const statusEl = qs('#lazadaConnectStatus');
    if (statusEl) statusEl.textContent = 'Đang lấy URL xác thực...';
    try {
      const res = await apiFetch('api/lazada-connect.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'get_auth_url' }),
      });
      if (res.success && res.auth_url) {
        if (statusEl) statusEl.textContent = 'Đang chuyển hướng...';
        location.href = res.auth_url;
      } else {
        if (statusEl) statusEl.textContent = '';
        toast(res.error || 'Không lấy được URL xác thực.', 'error');
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = '';
      toast('Lỗi kết nối.', 'error');
    }
  });

  qs('#btnLazadaSyncAll')?.addEventListener('click', () => syncLazadaAccount(''));
  qs('#btnLazadaRefresh')?.addEventListener('click', loadLazadaConnectPage);
}

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupLogin();

  const ok = await initAuth();
  if (!ok) return;

  setupNav();
  setupPlatformFilter();
  setupTimeFilter();
  setupLogsPage();
  setupConnectPage();
  setupLazadaConnectPage();
  checkForUpdates(); // background — no await, shows badge if update available
  await loadPeriods();
  const initPage = location.hash.replace('#', '') || 'overview';
  loadPage(['overview','orders','products','customers','traffic','comparison','heatmaps','upload','logs','connect','settings'].includes(initPage) ? initPage : 'overview');

  // Logout
  qs('#btnLogout')?.addEventListener('click', logout);
});
