/* ============================================================
   Charts — thin Chart.js wrappers, theme + platform aware
   ============================================================ */
(function () {
  const reg = {}; // canvasId -> Chart

  // Chart.js parses colours with its own library, which does not understand
  // oklch() — and most theme tokens (ink, surface, grid, invert-bg) are oklch.
  // They were reaching the canvas as garbage: the tooltip backdrop painted as
  // mid-grey instead of near-black, so its white text looked washed out. Let
  // the browser resolve any CSS colour to concrete channels first.
  let _probe = null;
  function toRgb(v) {
    if (!v) return v;
    const t = String(v).trim();
    if (t === "transparent" || t.startsWith("#") || t.startsWith("rgb")) return t;
    try {
      if (!_probe) _probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      _probe.clearRect(0, 0, 1, 1);
      _probe.fillStyle = "#000000";
      _probe.fillStyle = t;
      _probe.fillRect(0, 0, 1, 1);
      const d = _probe.getImageData(0, 0, 1, 1).data;
      return d[3] === 255 ? `rgb(${d[0]},${d[1]},${d[2]})` : `rgba(${d[0]},${d[1]},${d[2]},${(d[3] / 255).toFixed(3)})`;
    } catch (_) {
      return t;
    }
  }

  function col(v) {
    // resolve a CSS custom property (e.g. "--shopee") or pass through
    if (v && v.startsWith("--")) {
      return toRgb(getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#888");
    }
    return toRgb(v);
  }
  const ink3 = () => col("--ink-3");
  const gridc = () => col("--grid");
  const surface = () => col("--surface");

  function destroy(id) { if (reg[id]) { reg[id].destroy(); delete reg[id]; } }
  // Chart.js already puts a ResizeObserver on the canvas's parent, which is the
  // .chart-wrap the user drags — so resizing needs no wiring here, only CSS.
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

  // The donut's centre total is an HTML overlay sitting on top of the canvas, so
  // it paints over the canvas-drawn tooltip and the two texts collide. Nothing
  // can raise a canvas tooltip above a sibling element, so fade the overlay out
  // while a slice is hovered instead.
  const DonutCentreFadePlugin = {
    id: 'donutCentreFade',
    afterDraw(chart) {
      const wrap = chart.canvas && chart.canvas.parentElement;
      if (!wrap || !wrap.classList.contains('donut-wrap')) return;
      const open = !!(chart.tooltip && chart.tooltip.opacity > 0);
      wrap.classList.toggle('tip-open', open);
    },
  };

  Chart.register(DonutCentreFadePlugin);

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

  /* ---- donut ---- */
  function donut(canvas, items, opt) {
    opt = opt || {};
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
        // c.formatted does not exist in Chart.js 4 (it is formattedValue), so this
        // read printed "undefined" in every donut tooltip. Use c.raw with the app
        // formatters, like every other tooltip in this file.
        // Share is what a donut is read for, so the tooltip gives the percentage
        // only — the absolute figures already sit in the legend beside it.
        plugins: { tooltip: { ...tip(), callbacks: { label: (c) => {
          const data = c.dataset.data || [];
          const total = data.reduce((t, v) => t + (+v || 0), 0);
          return " " + c.label + ": " + window.F.pct(total ? (+c.raw || 0) / total * 100 : 0);
        } } } },
      },
    });
  }

  // helpers
  // col() now normalises every colour to rgb()/rgba(), so this has to read that
  // form first — parsing "rgb(238,77,45)" as hex silently produced rgba(0,11,35)
  // and washed the area fills and partial-month bars a dark navy.
  function hexA(color, a) {
    const c = col(color);
    const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(c);
    if (m) return `rgba(${+m[1]},${+m[2]},${+m[3]},${a})`;
    const h = c.replace("#", "");
    if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(h)) return c; // unknown form: leave it alone
    const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
    const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
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

  window.Charts = { lineSeries, donut, destroy, destroyAll: () => Object.keys(reg).forEach(destroy), col, mk };
})();
