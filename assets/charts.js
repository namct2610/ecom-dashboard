/* ============================================================
   Charts — thin Chart.js wrappers, theme + platform aware
   ============================================================ */
(function () {
  const reg = {}; // canvasId -> Chart

  function col(v) {
    // resolve a CSS custom property (e.g. "--shopee") or pass through
    if (v && v.startsWith("--")) {
      return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#888";
    }
    return v;
  }
  const ink3 = () => col("--ink-3");
  const gridc = () => col("--grid");
  const surface = () => col("--surface");

  function destroy(id) { if (reg[id]) { reg[id].destroy(); delete reg[id]; } }
  function mk(canvas, cfg) {
    const id = canvas.id || (canvas.id = "c" + Math.random().toString(36).slice(2));
    destroy(id);
    reg[id] = new Chart(canvas, cfg);
    return reg[id];
  }

  Chart.defaults.font.family = "'Be Vietnam Pro','Segoe UI',sans-serif";
  Chart.defaults.font.weight = 600;
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.animation = false;
  Chart.defaults.maintainAspectRatio = false;

  /* Stacked bar rounded-top plugin.
     Default Chart.js applies borderRadius per-segment, so inner stack
     segments show ridges on every layer. This plugin clips drawing to a
     rounded-top shape spanning the FULL stack column — so the top corners
     are consistent regardless of how thin the topmost layer is. */
  function compactNumber(v) {
    const n = Math.abs(+v || 0);
    const sign = v < 0 ? "-" : "";
    const fmt = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10).toString().replace(".0", "");
    if (n >= 1e9) return sign + fmt(n / 1e9) + "B";
    if (n >= 1e6) return sign + fmt(n / 1e6) + "M";
    if (n >= 1e3) return sign + fmt(n / 1e3) + "K";
    return sign + Math.round(n).toString();
  }

  const StackedRoundedTopPlugin = {
    id: 'stackedRoundedTop',
    beforeDatasetsDraw(chart, _args, opts) {
      if (!opts || !opts.enabled) return;
      const radius = opts.radius || 6;
      const { ctx } = chart;
      const datasets = chart.data.datasets;
      if (!datasets.length) return;
      const len = (datasets[0].data || []).length;
      if (!len) return;
      ctx.save();
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < len; i++) {
        let topY = Infinity, bottomY = -Infinity, x = null, w = null;
        for (let dsIdx = 0; dsIdx < datasets.length; dsIdx++) {
          const v = +datasets[dsIdx].data[i];
          if (!v) continue;
          const meta = chart.getDatasetMeta(dsIdx);
          if (meta.hidden) continue;
          const bar = meta.data[i];
          if (!bar) continue;
          if (bar.y < topY) topY = bar.y;
          if (bar.base > bottomY) bottomY = bar.base;
          x = bar.x - bar.width / 2;
          w = bar.width;
        }
        if (x == null || !isFinite(topY) || !isFinite(bottomY)) continue;
        const h = Math.abs(bottomY - topY);
        const r = Math.min(radius, w / 2, h);
        ctx.moveTo(x, topY + r);
        ctx.quadraticCurveTo(x, topY, x + r, topY);
        ctx.lineTo(x + w - r, topY);
        ctx.quadraticCurveTo(x + w, topY, x + w, topY + r);
        ctx.lineTo(x + w, bottomY);
        ctx.lineTo(x, bottomY);
        ctx.closePath();
        any = true;
      }
      if (any) ctx.clip();
      else ctx.restore();
      chart.$srtClipped = any;
    },
    afterDatasetsDraw(chart, _args, opts) {
      if (!opts || !opts.enabled) return;
      if (chart.$srtClipped) {
        chart.ctx.restore();
        chart.$srtClipped = false;
      }
    },
  };
  const StackTotalLabelPlugin = {
    id: 'stackTotalLabel',
    afterDatasetsDraw(chart, _args, opts) {
      if (!opts || !opts.enabled) return;
      const datasets = chart.data.datasets || [];
      const len = datasets[0]?.data?.length || 0;
      if (!len) return;
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.fillStyle = opts.color || ink3();
      ctx.font = `800 ${opts.fontSize || 10.5}px 'Be Vietnam Pro','Segoe UI',sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      for (let i = 0; i < len; i++) {
        let total = 0, topY = Infinity, x = null;
        for (let dsIdx = 0; dsIdx < datasets.length; dsIdx++) {
          const meta = chart.getDatasetMeta(dsIdx);
          if (meta.hidden) continue;
          const v = +datasets[dsIdx].data[i] || 0;
          if (!v) continue;
          const bar = meta.data[i];
          if (!bar) continue;
          total += v;
          topY = Math.min(topY, bar.y);
          x = bar.x;
        }
        if (!total || x == null || !isFinite(topY)) continue;
        ctx.fillText((opts.format || compactNumber)(total), x, Math.max(chartArea.top + 12, topY - 5));
      }
      ctx.restore();
    },
  };

  Chart.register(StackedRoundedTopPlugin, StackTotalLabelPlugin);

  function tip() {
    return {
      backgroundColor: col("--invert-bg"),
      titleColor: col("--invert-fg"),
      bodyColor: col("--invert-fg"),
      padding: 11, cornerRadius: 9, displayColors: true, boxPadding: 4,
      titleFont: { weight: 800, size: 12.5 }, bodyFont: { weight: 600, size: 12.5 },
      borderColor: "transparent",
    };
  }

  const dayLabel = (d) => { const p = d.split("-"); return p[2] + "/" + p[1]; };

  /* ---- revenue trend: stacked area by platform (all) or single line ---- */
  function revenueTrend(canvas, series, opt) {
    opt = opt || {};
    const labels = series.map((s) => dayLabel(s.date));
    const stacked = opt.platform === "all";
    let datasets;
    if (stacked) {
      datasets = ["shopee", "lazada", "tiktok"].map((k) => ({
        label: window.Store.PLAT[k].label, data: series.map((s) => s[k]),
        backgroundColor: hexA(col("--" + k), 0.16), borderColor: col("--" + k),
        borderWidth: 2, fill: true, tension: 0.34, pointRadius: 0, pointHoverRadius: 4,
        pointBackgroundColor: col("--" + k), stack: "rev",
      }));
    } else {
      const c = col("--" + opt.platform);
      datasets = [{
        label: window.Store.PLAT[opt.platform].label, data: series.map((s) => s.revenue),
        backgroundColor: grad(canvas, hexA(c, 0.28), hexA(c, 0)), borderColor: c,
        borderWidth: 2.5, fill: true, tension: 0.34, pointRadius: 0, pointHoverRadius: 4, pointBackgroundColor: c,
      }];
    }
    return mk(canvas, {
      type: "line",
      data: { labels, datasets },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { stacked, grid: { display: false }, ticks: { color: ink3(), font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, border: { display: false } },
          y: { stacked, grid: { color: gridc(), drawTicks: false }, ticks: { color: ink3(), font: { size: 11 }, callback: (v) => window.F.money(v) }, border: { display: false } },
        },
        plugins: { tooltip: { ...tip(), callbacks: { label: (c) => " " + c.dataset.label + ": " + window.F.moneyFull(c.raw) } } },
      },
    });
  }

  function barSizing(count, maxThickness) {
    return {
      categoryPercentage: count <= 4 ? 0.68 : count <= 8 ? 0.76 : 0.86,
      barPercentage: count <= 4 ? 0.9 : 0.96,
      maxBarThickness: Math.max(12, maxThickness || 46),
    };
  }

  /* ---- orders trend grouped bars ---- */
  function ordersTrend(canvas, series, opt) {
    opt = opt || {};
    const labels = series.map((s) => s.label || dayLabel(s.date));
    const stacked = opt.platform === "all";
    const sizing = barSizing(labels.length, 34);
    let datasets;
    if (stacked) {
      datasets = ["shopee", "lazada", "tiktok"].map((k) => ({
        label: window.Store.PLAT[k].label, data: series.map((s) => s["o_" + k]),
        backgroundColor: col("--" + k), borderRadius: 0, borderSkipped: false, borderWidth: 0, stack: "o", ...sizing,
      }));
    } else {
      datasets = [{ label: "Đơn", data: series.map((s) => s["o_" + opt.platform] || 0), backgroundColor: col("--" + opt.platform), borderRadius: 6, borderSkipped: "bottom", borderWidth: 0, ...sizing }];
    }
    return mk(canvas, {
      type: "bar", data: { labels, datasets },
      options: {
        layout: { padding: { top: 18 } },
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { stacked, grid: { display: false }, ticks: { color: ink3(), font: { size: 10.5 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 13 }, border: { display: false } },
          y: { stacked, grid: { color: gridc(), drawTicks: false }, ticks: { color: ink3(), font: { size: 11 } }, border: { display: false }, beginAtZero: true },
        },
        plugins: {
          tooltip: { ...tip(), callbacks: { label: (c) => " " + c.dataset.label + ": " + window.F.viInt(c.raw) + " đơn", footer: (items) => "Tổng: " + window.F.viInt(items.reduce((t, i) => t + i.raw, 0)) + " đơn" } },
          stackedRoundedTop: { enabled: stacked, radius: 6 },
          stackTotalLabel: { enabled: true },
        },
      },
    });
  }

  /* ---- donut ---- */
  function donut(canvas, items) {
    return mk(canvas, {
      type: "doughnut",
      data: {
        labels: items.map((i) => i.label),
        datasets: [{
          data: items.map((i) => i.value),
          backgroundColor: items.map((i) => col(i.color)),
          borderColor: surface(), borderWidth: 3,
          borderRadius: 3,
          spacing: 1,
          hoverOffset: 6,
        }],
      },
      options: {
        cutout: "70%",
        plugins: { tooltip: { ...tip(), callbacks: { label: (c) => " " + c.label + ": " + (c.formatted) } } },
      },
    });
  }

  /* ---- sparkline (no axes) ---- */
  function spark(canvas, values, color, type) {
    const c = col(color);
    // size the backing store to the canvas's intended box and lock it (non-responsive)
    const w = canvas.width || 88, h = canvas.height || 30;
    return mk(canvas, {
      type: type || "line",
      data: { labels: values.map((_, i) => i), datasets: [{ data: values, borderColor: c, backgroundColor: type === "bar" ? c : grad(canvas, hexA(c, 0.3), hexA(c, 0)), borderWidth: 2, fill: type !== "bar", tension: 0.4, pointRadius: 0, borderRadius: 6, maxBarThickness: 5 }] },
      options: { responsive: false, maintainAspectRatio: false, animation: false, scales: { x: { display: false }, y: { display: false, min: 0 } }, plugins: { tooltip: { enabled: false } } },
    });
  }

  /* ---- horizontal compare bars (mini, per platform) ---- */
  function miniBars(canvas, series, platform) {
    const c = col("--" + (platform === "all" ? "shopee" : platform));
    return spark(canvas, series, "--ink-3");
  }

  // helpers
  function hexA(hex, a) {
    hex = col(hex);
    if (hex.startsWith("oklch") || hex.startsWith("var")) return hex; // chart.js can't alpha oklch easily
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
    const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function grad(canvas, c1, c2) {
    const ctx = canvas.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height || 200);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    return g;
  }

  /* ---- monthly revenue: stacked bars by platform + optional compare line ---- */
  function monthlyRevenue(canvas, trend, opt) {
    opt = opt || {};
    const labels = trend.map((t) => t.label);
    const stacked = opt.platform === "all";
    const sizing = barSizing(labels.length, 52);
    let datasets;
    if (stacked) {
      datasets = ["shopee", "lazada", "tiktok"].map((k) => ({
        label: window.Store.PLAT[k].label, data: trend.map((t) => t[k]),
        backgroundColor: trend.map((t) => t.partial ? hexA(col("--" + k), 0.4) : col("--" + k)),
        borderRadius: 0, borderSkipped: false, borderWidth: 0, stack: "rev", ...sizing,
      }));
    } else {
      const c = col("--" + opt.platform);
      datasets = [{ label: window.Store.PLAT[opt.platform].label, data: trend.map((t) => t[opt.platform]), backgroundColor: trend.map((t) => t.partial ? hexA(c, 0.4) : c), borderRadius: 6, borderSkipped: "bottom", borderWidth: 0, ...sizing }];
    }
    return mk(canvas, {
      type: "bar", data: { labels, datasets },
      options: {
        layout: { padding: { top: 18 } },
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { stacked, grid: { display: false }, ticks: { color: ink3(), font: { size: 10.5 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 13 }, border: { display: false } },
          y: { stacked, grid: { color: gridc(), drawTicks: false }, ticks: { color: ink3(), font: { size: 11 }, callback: (v) => window.F.money(v) }, border: { display: false } },
        },
        plugins: {
          tooltip: { ...tip(), callbacks: { label: (c) => " " + c.dataset.label + ": " + window.F.moneyFull(c.raw), footer: (items) => "Tổng: " + window.F.moneyFull(items.reduce((t, i) => t + i.raw, 0)) } },
          stackedRoundedTop: { enabled: stacked, radius: 6 },
          stackTotalLabel: { enabled: true },
        },
      },
    });
  }

  /* ---- generic multi-line ---- */
  function lineSeries(canvas, labels, defs, opt) {
    opt = opt || {};
    return mk(canvas, {
      type: "line",
      data: { labels, datasets: defs.map((d) => ({ label: d.label, data: d.data, borderColor: col(d.color), backgroundColor: hexA(col(d.color), 0.12), borderWidth: 2.5, tension: 0.34, pointRadius: 0, pointHoverRadius: 4, pointBackgroundColor: col(d.color), fill: !!opt.fill })) },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { color: ink3(), font: { size: 10.5 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, border: { display: false } },
          y: { grid: { color: gridc(), drawTicks: false }, ticks: { color: ink3(), font: { size: 11 }, callback: (v) => opt.money ? window.F.money(v) : window.F.num(v) }, border: { display: false }, beginAtZero: true },
        },
        plugins: { tooltip: { ...tip(), callbacks: { label: (c) => " " + c.dataset.label + ": " + (opt.money ? window.F.moneyFull(c.raw) : window.F.viInt(c.raw)) } } },
      },
    });
  }

  window.Charts = { revenueTrend, ordersTrend, monthlyRevenue, lineSeries, donut, spark, miniBars, destroy, destroyAll: () => Object.keys(reg).forEach(destroy), col, mk };
})();
