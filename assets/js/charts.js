/* ── charts.js — Chart.js renderers ───────────────────────────────────── */
'use strict';

const PLATFORM_COLORS = {
  shopee:     '#ee4d2d',
  lazada:     '#0f146b',
  tiktokshop: '#010101',
};
const PLATFORM_BG = {
  shopee:     'rgba(238,77,45,0.12)',
  lazada:     'rgba(15,20,107,0.12)',
  tiktokshop: 'rgba(1,1,1,0.10)',
};
const STATUS_COLORS = {
  completed:  '#16a34a',
  delivered:  '#0d9488',
  cancelled:  '#dc2626',
  pending:    '#d97706',
};
const CHART_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'];

/* ── Chart.js global defaults ── */
if (typeof Chart !== 'undefined') {
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size   = 12;
  Chart.defaults.color       = '#64748b';
  Chart.defaults.plugins.tooltip.backgroundColor = '#1e293b';
  Chart.defaults.plugins.tooltip.titleColor      = '#f1f5f9';
  Chart.defaults.plugins.tooltip.bodyColor       = '#cbd5e1';
  Chart.defaults.plugins.tooltip.padding         = 10;
  Chart.defaults.plugins.tooltip.cornerRadius    = 8;
  Chart.defaults.plugins.tooltip.displayColors   = true;
  Chart.defaults.plugins.tooltip.boxPadding      = 4;
  Chart.defaults.plugins.tooltip.borderColor     = 'rgba(255,255,255,0.08)';
  Chart.defaults.plugins.tooltip.borderWidth     = 1;
  Chart.defaults.animation.duration              = 350;
}

const Charts = (() => {

  /* ── helpers ── */
  const instances = {};
  function destroy(id) {
    if (instances[id]) { instances[id].destroy(); delete instances[id]; }
  }
  function save(id, chart) { instances[id] = chart; return chart; }
  function canvas(id) { return document.getElementById(id); }

  const TICK_COLOR = '#64748b';
  const GRID_COLOR = '#e2e8f0';

  function baseLineOpts(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {} },
        ...extra.plugins,
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { font: { size: 11 }, color: TICK_COLOR, maxTicksLimit: 8, padding: 4 },
          ...(extra.x || {}),
        },
        y: {
          grid: { color: GRID_COLOR, drawBorder: false },
          border: { display: false, dash: [3, 3] },
          ticks: { font: { size: 11 }, color: TICK_COLOR, padding: 6, ...(extra.yTicks || {}) },
          ...(extra.y || {}),
        },
        ...extra.extraScales,
      },
    };
  }

  function vndFormatter(val) {
    if (val === null || val === undefined) return '';
    const abs = Math.abs(val);
    if (abs >= 1e9) return (val / 1e9).toFixed(1) + 'B ₫';
    if (abs >= 1e6) return (val / 1e6).toFixed(1) + 'M ₫';
    if (abs >= 1e3) return (val / 1e3).toFixed(0) + 'K ₫';
    return val.toLocaleString('vi-VN') + ' ₫';
  }

  /* ── Revenue Trend (multi-line by platform) ── */
  function renderRevenueTrend(id, timeseries, granularity) {
    destroy(id);
    const el = canvas(id); if (!el) return;
    if (!timeseries || !timeseries.length) return renderEmpty(el, t('cl.no_data'));

    // API returns [{date, shopee, lazada, tiktokshop, total, orders}, ...]
    const labels = timeseries.map(r => r.date);
    const platforms = ['shopee','lazada','tiktokshop'];
    const datasets = platforms.map(p => ({
      label: p === 'tiktokshop' ? 'TikTok Shop' : p.charAt(0).toUpperCase() + p.slice(1),
      data: timeseries.map(r => r[p] ?? null),
      borderColor: PLATFORM_COLORS[p],
      backgroundColor: PLATFORM_BG[p],
      borderWidth: 2,
      pointRadius: labels.length > 20 ? 0 : 3,
      tension: 0.3,
      fill: false,
      spanGaps: true,
    }));

    const opts = baseLineOpts({
      plugins: {
        legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 12 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${vndFormatter(ctx.raw)}`,
          },
        },
      },
      yTicks: { callback: vndFormatter },
    });
    opts.maintainAspectRatio = false;
    save(id, new Chart(el, { type: 'line', data: { labels, datasets }, options: opts }));
  }

  /* ── Platform Donut (revenue share) ── */
  function renderPlatformDonut(id, breakdown) {
    destroy(id);
    const el = canvas(id); if (!el) return;
    // API returns object {shopee:{revenue,orders,percentage}, ...} — normalize to array
    const arr = Array.isArray(breakdown) ? breakdown
      : Object.entries(breakdown).map(([k, v]) => ({ platform: k, ...v }));
    if (!arr || !arr.length || !arr.some(r => r.revenue > 0)) return renderEmpty(el, t('cl.no_data'));

    const labels = arr.map(r => r.platform === 'tiktokshop' ? 'TikTok Shop' : r.platform.charAt(0).toUpperCase() + r.platform.slice(1));
    const data   = arr.map(r => r.revenue);
    const colors = arr.map(r => PLATFORM_COLORS[r.platform] || CHART_COLORS[0]);

    save(id, new Chart(el, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 3, borderColor: '#fff', hoverBorderWidth: 3, hoverOffset: 4 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${vndFormatter(ctx.raw)} (${arr[ctx.dataIndex].percentage || 0}%)`,
            },
          },
        },
      },
    }));
  }

  /* ── Orders Trend (stacked area, completed + cancelled) ── */
  function renderOrdersTrend(id, timeseries, granularity) {
    destroy(id);
    const el = canvas(id); if (!el) return;
    if (!timeseries || !timeseries.length) return renderEmpty(el, t('cl.no_data'));

    // API returns [{date, total, completed, cancelled, ...}, ...]
    const labels = timeseries.map(r => r.date);
    const datasets = [
      {
        label: t('status.completed'),
        data: timeseries.map(r => (r.completed || 0) + (r.delivered || 0)),
        borderColor: STATUS_COLORS.completed,
        backgroundColor: 'rgba(22,163,74,0.15)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: labels.length > 20 ? 0 : 3,
      },
      {
        label: t('cl.cancelled'),
        data: timeseries.map(r => r.cancelled || 0),
        borderColor: STATUS_COLORS.cancelled,
        backgroundColor: 'rgba(220,38,38,0.12)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: labels.length > 20 ? 0 : 3,
      },
    ];

    const opts = baseLineOpts({
      plugins: {
        legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 12 } },
      },
    });
    save(id, new Chart(el, { type: 'line', data: { labels, datasets }, options: opts }));
  }

  /* ── Status Donut (order counts by status) ── */
  function renderStatusDonut(id, summary) {
    destroy(id);
    const el = canvas(id); if (!el) return;

    const statuses = [
      { key: 'completed', label: t('status.completed'), color: STATUS_COLORS.completed },
      { key: 'delivered', label: t('status.delivered'), color: STATUS_COLORS.delivered },
      { key: 'cancelled', label: t('status.cancelled'), color: STATUS_COLORS.cancelled },
      { key: 'pending',   label: t('status.pending'),   color: STATUS_COLORS.pending },
    ].filter(s => summary[s.key] > 0);

    if (!statuses.length) return renderEmpty(el, t('cl.no_data'));

    save(id, new Chart(el, {
      type: 'doughnut',
      data: {
        labels: statuses.map(s => s.label),
        datasets: [{
          data: statuses.map(s => summary[s.key]),
          backgroundColor: statuses.map(s => s.color),
          borderWidth: 2, borderColor: '#fff',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '67%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw.toLocaleString()}` } },
        },
      },
    }));
  }

  /* ── Platform Orders (grouped bar) ── */
  function renderPlatformOrders(id, byPlatform) {
    destroy(id);
    const el = canvas(id); if (!el) return;
    // API returns object {shopee:{total,completed,cancelled,pending}, ...} — normalize to array
    const arr = Array.isArray(byPlatform) ? byPlatform
      : Object.entries(byPlatform).map(([k, v]) => ({ platform: k, ...v }));
    if (!arr || !arr.length || !arr.some(r => r.total > 0)) return renderEmpty(el, t('cl.no_data'));

    const labels = arr.map(r => r.platform === 'tiktokshop' ? 'TikTok Shop' : r.platform.charAt(0).toUpperCase() + r.platform.slice(1));
    const completed = arr.map(r => r.completed || 0);
    const cancelled = arr.map(r => r.cancelled || 0);

    save(id, new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: t('status.completed'), data: completed, backgroundColor: STATUS_COLORS.completed, borderRadius: 4 },
          { label: t('status.cancelled'), data: cancelled, backgroundColor: STATUS_COLORS.cancelled, borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 10 } },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, color: TICK_COLOR } },
          y: { grid: { color: GRID_COLOR }, border: { display: false }, ticks: { font: { size: 11 }, color: TICK_COLOR } },
        },
      },
    }));
  }

  /* ── Hourly Bar (orders by hour, 0–23) ── */
  function renderHourlyBar(id, hourly) {
    destroy(id);
    const el = canvas(id); if (!el) return;
    // API returns plain array [cnt0, cnt1, ..., cnt23]
    if (!hourly || !hourly.length) return renderEmpty(el, t('cl.no_data'));

    const labels = Array.from({length: 24}, (_, h) => `${String(h).padStart(2,'0')}:00`);
    const data   = Array.isArray(hourly[0]) || typeof hourly[0] === 'object'
      ? hourly.map(h => h.orders || 0)
      : hourly; // plain int array from API

    save(id, new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: t('cl.orders'),
          data,
          backgroundColor: 'rgba(59,130,246,0.7)',
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 }, color: TICK_COLOR, maxTicksLimit: 12 } },
          y: { grid: { color: GRID_COLOR }, border: { display: false }, ticks: { font: { size: 11 }, color: TICK_COLOR } },
        },
      },
    }));
  }

  /* ── Top Products — horizontal bar (quantity) ── */
  function renderTopQtyBar(id, products) {
    destroy(id);
    const el = canvas(id); if (!el) return;
    if (!products || !products.length) return renderEmpty(el, t('cl.no_data'));

    const labels = products.map(p => truncate(p.product_name, 28));
    save(id, new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: t('cl.quantity'),
          data: products.map(p => p.total_qty),
          backgroundColor: 'rgba(16,185,129,0.80)',
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: GRID_COLOR }, border: { display: false }, ticks: { font: { size: 11 }, color: TICK_COLOR } },
          y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, color: '#374151' } },
        },
      },
    }));
  }

  /* ── Top Products — horizontal bar (revenue) ── */
  function renderTopRevBar(id, products) {
    destroy(id);
    const el = canvas(id); if (!el) return;
    if (!products || !products.length) return renderEmpty(el, t('cl.no_data'));

    const labels = products.map(p => truncate(p.product_name, 28));
    save(id, new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: t('cl.revenue'),
          data: products.map(p => p.total_revenue),
          backgroundColor: 'rgba(139,92,246,0.80)',
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${vndFormatter(ctx.raw)}` } },
        },
        scales: {
          x: {
            grid: { color: GRID_COLOR },
            border: { display: false },
            ticks: { font: { size: 11 }, color: TICK_COLOR, callback: vndFormatter },
          },
          y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, color: '#374151' } },
        },
      },
    }));
  }

  /* ── City Bar (horizontal) ── */
  function renderCityBar(id, cities) {
    destroy(id);
    const el = canvas(id); if (!el) return;
    if (!cities || !cities.length) return renderEmpty(el, t('cl.no_data'));

    const top = cities.slice(0, 12);
    save(id, new Chart(el, {
      type: 'bar',
      data: {
        labels: top.map(c => c.city || t('cl.other')),
        datasets: [{
          label: t('cl.orders'),
          data: top.map(c => c.orders),
          backgroundColor: CHART_COLORS.map(c => c + 'cc'),
          borderRadius: 3,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: GRID_COLOR }, border: { display: false }, ticks: { font: { size: 11 }, color: TICK_COLOR } },
          y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, color: '#374151' } },
        },
      },
    }));
  }

  /* ── Traffic Trend (dual-axis: views + orders) ── */
  function renderTrafficTrend(id, timeseries, granularity, ordersByDate) {
    destroy(id);
    const el = canvas(id); if (!el) return;
    if (!timeseries || !timeseries.length) return renderEmpty(el, t('cl.no_data'));

    // API returns [{date, total_views, total_visits, ...}, ...]
    const labels = timeseries.map(r => r.date);
    const viewMap  = {};
    const visitMap = {};
    timeseries.forEach(r => {
      viewMap[r.date]  = r.total_views  || 0;
      visitMap[r.date] = r.total_visits || 0;
    });

    // ordersByDate is a plain object {bucket: count} from the API
    const orderMap = ordersByDate || {};

    const datasets = [
      {
        label: t('cl.views'),
        data: labels.map(l => viewMap[l] || 0),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        yAxisID: 'yTraffic',
        pointRadius: labels.length > 20 ? 0 : 3,
      },
      {
        label: t('cl.orders'),
        data: labels.map(l => orderMap[l] || 0),
        borderColor: '#10b981',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [5, 3],
        tension: 0.3,
        yAxisID: 'yOrders',
        pointRadius: labels.length > 20 ? 0 : 3,
      },
    ];

    save(id, new Chart(el, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 12 } },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, color: TICK_COLOR, maxTicksLimit: 8 } },
          yTraffic: {
            type: 'linear',
            position: 'left',
            grid: { color: GRID_COLOR },
            border: { display: false },
            ticks: { font: { size: 11 }, color: TICK_COLOR, padding: 6, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'K' : v },
          },
          yOrders: {
            type: 'linear',
            position: 'right',
            grid: { display: false },
            border: { display: false },
            ticks: { font: { size: 11 }, color: '#10b981', padding: 6 },
          },
        },
      },
    }));
  }

  /* ── Traffic by Platform (grouped bar: views + visits) ── */
  function renderTrafficPlatform(id, byPlatform) {
    destroy(id);
    const el = canvas(id); if (!el) return;
    // API returns object {shopee:{views,visits,...}, ...} — normalize to array
    const arr = Array.isArray(byPlatform) ? byPlatform
      : Object.entries(byPlatform).map(([k, v]) => ({ platform: k, ...v }));
    if (!arr || !arr.length || !arr.some(r => r.views > 0)) return renderEmpty(el, t('cl.no_data'));

    const labels = arr.map(r => r.platform === 'tiktokshop' ? 'TikTok Shop' : r.platform.charAt(0).toUpperCase() + r.platform.slice(1));
    save(id, new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: t('cl.views'),
            data: arr.map(r => r.views || 0),
            backgroundColor: arr.map(r => PLATFORM_COLORS[r.platform] || CHART_COLORS[0]),
            borderRadius: 4,
          },
          {
            label: t('cl.visits'),
            data: arr.map(r => r.visits || 0),
            backgroundColor: arr.map(r => (PLATFORM_COLORS[r.platform] || CHART_COLORS[0]) + '77'),
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 10 } } },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, color: TICK_COLOR } },
          y: { grid: { color: GRID_COLOR }, border: { display: false }, ticks: { font: { size: 11 }, color: TICK_COLOR } },
        },
      },
    }));
  }

  /* ── District Bar (horizontal bar for HCM/Hanoi districts) ── */
  function renderDistrictBar(id, districts, city) {
    destroy(id);
    const el = canvas(id); if (!el) return;
    if (!districts || !districts.length) return renderEmpty(el, `${t('cl.no_data')} — ${city}`);

    const top = districts.slice(0, 15);
    save(id, new Chart(el, {
      type: 'bar',
      data: {
        labels: top.map(d => d.district || t('cl.other')),
        datasets: [{
          label: t('cl.orders'),
          data: top.map(d => d.orders),
          backgroundColor: city.includes('Hồ Chí Minh') ? 'rgba(238,77,45,0.75)' : 'rgba(59,130,246,0.75)',
          borderRadius: 3,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: GRID_COLOR }, border: { display: false }, ticks: { font: { size: 11 }, color: TICK_COLOR } },
          y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, color: '#374151' } },
        },
      },
    }));
  }

  /* ── Compare Revenue (grouped bar) ── */
  function renderCompareRevenue(id, platforms) {
    destroy(id);
    const el = canvas(id); if (!el) return;
    // platforms may be keyed object {shopee:{...}} or array
    const arr = Array.isArray(platforms) ? platforms : Object.entries(platforms).map(([k,v]) => ({platform:k,...v}));
    if (!arr || !arr.length) return renderEmpty(el, t('cl.no_data'));
    const platforms_ = arr;

    const labels = platforms_.map(p => p.platform === 'tiktokshop' ? 'TikTok Shop' : p.platform.charAt(0).toUpperCase() + p.platform.slice(1));
    save(id, new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: t('cl.revenue'),
          data: platforms_.map(p => p.revenue || 0),
          backgroundColor: platforms_.map(p => PLATFORM_COLORS[p.platform] || CHART_COLORS[0]),
          borderRadius: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${vndFormatter(ctx.raw)}` } },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 12 }, color: '#374151' } },
          y: {
            grid: { color: GRID_COLOR },
            border: { display: false },
            ticks: { font: { size: 11 }, color: TICK_COLOR, callback: vndFormatter },
          },
        },
      },
    }));
  }

  /* ── Compare Orders (grouped bar) ── */
  function renderCompareOrders(id, platforms) {
    destroy(id);
    const el = canvas(id); if (!el) return;
    const arr = Array.isArray(platforms) ? platforms : Object.entries(platforms).map(([k,v]) => ({platform:k,...v}));
    if (!arr || !arr.length) return renderEmpty(el, t('cl.no_data'));

    const labels = arr.map(p => p.platform === 'tiktokshop' ? 'TikTok Shop' : p.platform.charAt(0).toUpperCase() + p.platform.slice(1));
    save(id, new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: t('status.completed'),
            data: arr.map(p => p.completed || 0),
            backgroundColor: STATUS_COLORS.completed,
            borderRadius: 4,
          },
          {
            label: t('status.cancelled'),
            data: arr.map(p => p.cancelled || 0),
            backgroundColor: STATUS_COLORS.cancelled,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 10 } },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 12 }, color: '#374151' } },
          y: { grid: { color: GRID_COLOR }, border: { display: false }, ticks: { font: { size: 11 }, color: TICK_COLOR } },
        },
      },
    }));
  }

  /* ── Radar (platform comparison) ── */
  function renderRadar(id, platforms) {
    destroy(id);
    const el = canvas(id); if (!el) return;
    const arr = Array.isArray(platforms) ? platforms : Object.entries(platforms).map(([k,v]) => ({platform:k,...v}));
    if (!arr || !arr.length) return renderEmpty(el, t('cl.no_data'));

    // Normalize each metric 0–100 across platforms
    const metrics = ['revenue', 'total_orders', 'market_share', 'completion_rate'];
    const metricLabels = [t('radar.revenue'), t('radar.orders'), t('radar.market_share'), t('radar.completion_rate')];
    const maxes = metrics.map(m => Math.max(...arr.map(p => parseFloat(p[m]) || 0)) || 1);

    const datasets = arr.map((p, i) => ({
      label: p.platform === 'tiktokshop' ? 'TikTok Shop' : p.platform.charAt(0).toUpperCase() + p.platform.slice(1),
      data: metrics.map((m, mi) => (parseFloat(p[m]) || 0) / maxes[mi] * 100),
      borderColor: PLATFORM_COLORS[p.platform] || CHART_COLORS[i],
      backgroundColor: (PLATFORM_COLORS[p.platform] || CHART_COLORS[i]) + '22',
      borderWidth: 2,
      pointRadius: 4,
    }));

    save(id, new Chart(el, {
      type: 'radar',
      data: { labels: metricLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 10 } },
        },
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: { display: false },
            grid: { color: '#e2e8f0' },
            angleLines: { color: '#e2e8f0' },
            pointLabels: { font: { size: 12, weight: '500' }, color: '#374151' },
          },
        },
      },
    }));
  }

  /* ── Revenue by City (horizontal bar) ── */
  function renderRevByCity(id, cities) {
    destroy(id);
    const el = canvas(id); if (!el) return;
    if (!cities || !cities.length) return renderEmpty(el, t('cl.no_data'));

    const top = cities.slice(0, 15);
    save(id, new Chart(el, {
      type: 'bar',
      data: {
        labels: top.map(c => c.city || t('cl.other')),
        datasets: [{
          label: t('cl.revenue'),
          data: top.map(c => c.revenue),
          backgroundColor: CHART_COLORS.map(c => c + 'bb'),
          borderRadius: 3,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${vndFormatter(ctx.raw)}` } },
        },
        scales: {
          x: {
            grid: { color: GRID_COLOR },
            border: { display: false },
            ticks: { font: { size: 11 }, color: TICK_COLOR, callback: vndFormatter },
          },
          y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, color: '#374151' } },
        },
      },
    }));
  }

  /* ── Customer Segments Donut (new / returning / potential) ── */
  function renderCustomerSegmentDonut(id, segments) {
    destroy(id);
    const el = canvas(id); if (!el) return;

    const { new_buyers = 0, returning_buyers = 0, potential_buyers = 0 } = segments || {};
    const total = new_buyers + returning_buyers + potential_buyers;
    if (!total) return renderEmpty(el, t('cl.no_data'));

    const colors = ['#3b82f6', '#10b981', '#f59e0b'];
    save(id, new Chart(el, {
      type: 'doughnut',
      data: {
        labels: [t('seg.new'), t('seg.returning'), t('seg.potential')],
        datasets: [{
          data: [new_buyers, returning_buyers, potential_buyers],
          backgroundColor: colors,
          borderWidth: 3,
          borderColor: '#fff',
          hoverOffset: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.raw.toLocaleString()} (${total > 0 ? (ctx.raw / total * 100).toFixed(1) : 0}%)`,
            },
          },
        },
      },
    }));
  }

  /* ── Empty state helper ── */
  function renderEmpty(el, msg) {
    const parent = el.parentElement;
    if (!parent) return;
    el.style.display = 'none';
    if (!parent.querySelector('.chart-empty')) {
      const div = document.createElement('div');
      div.className = 'chart-empty empty-state';
      div.style.cssText = 'padding:32px 0;';
      div.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg><p>${msg}</p>`;
      parent.appendChild(div);
    }
  }

  function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  return {
    renderRevenueTrend,
    renderPlatformDonut,
    renderOrdersTrend,
    renderStatusDonut,
    renderPlatformOrders,
    renderHourlyBar,
    renderTopQtyBar,
    renderTopRevBar,
    renderCityBar,
    renderTrafficTrend,
    renderTrafficPlatform,
    renderCompareRevenue,
    renderCompareOrders,
    renderRadar,
    renderRevByCity,
    renderDistrictBar,
    renderCustomerSegmentDonut,
  };
})();
