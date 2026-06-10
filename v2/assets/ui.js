/* ============================================================
   UI — small HTML string helpers shared by all views
   ============================================================ */
(function () {
  const F = window.F, S = window.Store;

  const ICON = {
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7 17 17M17 9v8H9"/></svg>',
    revenue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>',
    aov: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>',
    cancel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
    eye_traffic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-4 4"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  };

  function deltaChip(d, invert) {
    if (!d || d.pct == null) return "";
    let dir = d.dir;
    let cls = dir;
    if (invert && dir === "up") cls = "down";
    else if (invert && dir === "down") cls = "up";
    const arrow = dir === "up" ? ICON.up : dir === "down" ? ICON.down : "";
    const sign = d.pct > 0 ? "+" : "";
    return `<span class="delta ${cls}">${arrow}${sign}${F.viDec(d.pct, 1)}%</span>`;
  }

  const pdot = (k) => `<span class="pdot" style="background:var(--${k})"></span>`;
  const pchip = (k) => `<span class="pchip">${pdot(k)}${S.PLAT[k].label}</span>`;

  function platLogo(k) {
    return `<div class="plogo" style="background:var(--${k})">${S.PLAT[k].short}</div>`;
  }

  // spark canvas placeholder; charts mounted later by view
  function sparkCanvas(id) { return `<canvas class="kpi-spark" id="${id}" width="88" height="30"></canvas>`; }

  // Convert a chart-style color token ("--shopee") into a CSS-usable value
  // ("var(--shopee)"). Plain hex codes pass through.
  function cssColor(c) {
    if (!c) return "transparent";
    if (typeof c === "string" && c.startsWith("--")) return "var(" + c + ")";
    return c;
  }

  window.UI = { ICON, deltaChip, pdot, pchip, platLogo, sparkCanvas, cssColor };
  window.Views = window.Views || {};
})();
