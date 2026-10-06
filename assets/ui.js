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
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M20 20l-3.6-3.6"/></svg>',
    collapseFs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M8 11h6M20 20l-3.6-3.6"/></svg>',
    person: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="6.5" r="4.2"/><path d="M3.4 21.5v-1.2c0-4.2 3.9-7.2 8.6-7.2s8.6 3 8.6 7.2v1.2z"/></svg>',
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
  const pchip = (k) => k === "all"
    ? `<span class="pchip">${window.t ? window.t("common.all_platforms", "tất cả sàn") : "tất cả sàn"}</span>`
    : `<span class="pchip">${pdot(k)}${S.PLAT[k].label}</span>`;

  // Convert a chart-style color token ("--shopee") into a CSS-usable value
  // ("var(--shopee)"). Plain hex codes pass through.
  function cssColor(c) {
    if (!c) return "transparent";
    if (typeof c === "string" && c.startsWith("--")) return "var(" + c + ")";
    return c;
  }

  // Escape before interpolating ANY value that came from outside the app —
  // marketplace exports, uploaded filenames, user-entered names. Safe for both
  // text nodes and quoted attributes. ui.js loads before every view, so this is
  // the one copy; don't re-declare it per file.
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Inline ok/error banner. Was copy-pasted byte-for-byte into five view files;
  // kept here so the escaping below can't drift back out of one of them —
  // callers pass server error strings straight into msg.text.
  function flashMsg(msg) {
    if (!msg) return "";
    const isOk = msg.kind === "ok";
    const bg = isOk ? "color-mix(in oklch, var(--pos) 12%, transparent)" : "color-mix(in oklch, var(--neg) 12%, transparent)";
    const fg = isOk ? "var(--pos)" : "var(--neg)";
    return `<div style="padding:10px 14px;border-radius:var(--r-ctrl);background:${bg};color:${fg};font-weight:700;font-size:13px;margin-bottom:14px">${esc(msg.text)}</div>`;
  }

  // Fullscreen toggle for a chart card. app.js owns the click handling with one
  // delegated listener, so a view only has to drop this into its card head.
  function fsBtn() {
    const label = window.t ? window.t("chart.fullscreen") : "Toàn màn hình";
    return `<button type="button" class="ctrl-btn chart-fs-btn" data-fs title="${esc(label)}" aria-label="${esc(label)}">${ICON.expand}</button>`;
  }

  /* ---------- 3.6 redesign primitives ---------- */
  const _t = (k, f) => (window.t ? window.t(k, f) : (f || k));

  // (i) button. Its text lives in a data attribute and is shown in one shared
  // floating bubble (handlers at the bottom of this file) — on hover with a
  // mouse, on tap with a finger — so it is never clipped by a card's overflow.
  function tip(text, opt) {
    const o = opt || {};
    return `<button type="button" class="tip-btn" data-tip="${esc(text)}"${o.right ? " data-tip-right" : ""}${o.w ? ` data-tip-w="${esc(o.w)}"` : ""} aria-label="${esc(_t("common.explain", "Giải thích"))}">${ICON.info}</button>`;
  }
  // Card heading: title + (i), and optional controls on the right.
  function head(title, tipText, right, tipOpt) {
    return `<div class="card-head ch"><div class="ch-title"><div class="card-title">${title}</div>${tipText ? tip(tipText, tipOpt) : ""}</div>${right ? `<div class="ch-tools">${right}</div>` : ""}</div>`;
  }
  // Pill toggle. items: [[key, label]]; clicks carry data-k.
  function seg(id, items, active) {
    return `<div class="miniseg" id="${id}">${items.map(([k, l]) =>
      `<button type="button" class="${k === active ? "active" : ""}" data-k="${esc(k)}">${l}</button>`).join("")}</div>`;
  }
  const clamp01 = (x) => Math.max(0, Math.min(1, +x || 0));
  // Single bar on a grey track.
  function track(frac, color, h) {
    return `<div class="trk"${h ? ` style="height:${h}px"` : ""}><i style="width:${(clamp01(frac) * 100).toFixed(1)}%;background:${color}"></i></div>`;
  }
  // 100% stacked bar. segs: [{v, c}] — empty parts are dropped.
  function stack(segs, h) {
    return `<div class="stk"${h ? ` style="height:${h}px"` : ""}>${segs.filter((s) => s.v > 0).map((s) =>
      `<i style="flex:${s.v} 1 0;background:${s.c}"></i>`).join("")}</div>`;
  }
  // Swatch legend under a stacked bar. items: [{c, text}]
  function legend(items) {
    return `<div class="lgd">${items.map((g) => `<span><span class="sw" style="background:${g.c}"></span>${g.text}</span>`).join("")}</div>`;
  }
  // Mini bar sparkline for KPI cards.
  function spark(values, color) {
    const m = Math.max(...values, 0) || 1;
    return `<div class="spark">${values.map((v) => v > 0
      ? `<i style="height:${Math.max(v / m * 100, 6).toFixed(1)}%;background:${color}"></i>`
      : `<i style="height:2px;background:var(--track)"></i>`).join("")}</div>`;
  }
  // Coloured % change without an arrow — for table cells. pp=true when the
  // values are already percentages (difference in points, not a ratio).
  function deltaTxt(cur, prev, invert, pp) {
    if (prev == null || (!pp && !prev)) return `<span class="dtxt flat">—</span>`;
    const v = pp ? cur - prev : (cur - prev) / prev * 100;
    const dir = Math.abs(v) < 0.05 ? 0 : v > 0 ? 1 : -1, good = invert ? -dir : dir;
    return `<span class="dtxt ${good > 0 ? "up" : good < 0 ? "down" : "flat"}">${v > 0 ? "+" : ""}${F.viDec(v, 1)}%</span>`;
  }
  function niceMax(v) {
    if (v <= 0) return 3;
    const raw = v / 3, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
    return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => x >= n - 1e-9) * mag * 3;
  }

  // HTML stacked bar chart. buckets: [{label, partial, segs:[{v, c}]}], segs
  // bottom-up. The view owns the readout above it; wireBars reports which bar
  // is hovered or tapped. Few bars show every value; many bars only the peak
  // (or the selected one), and label every n-th x tick per screen width.
  function bars(buckets, axisFmt, valFmt) {
    const tot = buckets.map((b) => b.segs.reduce((t, s) => t + (s.v || 0), 0));
    const top = Math.max(...tot, 0), max = niceMax(top * 1.06), peak = top > 0 ? tot.indexOf(top) : -1;
    const n = buckets.length, sw = Math.ceil(n / 14), sn = Math.ceil(n / 6);
    const cls = n <= 14 ? "few vals-all" : n > 100 ? "dense" : "";
    const ticks = [0, 1, 2, 3];
    return `<div class="bchart ${cls}">
      <div class="bgrid">
        <div class="byax">${ticks.map((i) => `<span style="bottom:${(i / 3 * 100).toFixed(3)}%">${axisFmt(max * i / 3)}</span>`).join("")}</div>
        <div class="bplot">
          ${ticks.map((i) => `<div class="gl" style="bottom:${(i / 3 * 100).toFixed(3)}%"></div>`).join("")}
          <div class="bcols">${buckets.map((b, i) => `<div class="bcol${i === peak ? " peak" : ""}${b.partial ? " partial" : ""}" data-i="${i}">
            <div class="bval">${valFmt(tot[i])}</div>
            <div class="bstack" style="height:${(tot[i] / max * 100).toFixed(2)}%${tot[i] > 0 ? ";min-height:2px" : ""}">${b.segs.filter((s) => s.v > 0).map((s) => `<i style="flex:${s.v} 1 0;background:${s.c}"></i>`).join("")}</div>
          </div>`).join("")}</div>
        </div>
        <div></div>
        <div class="bxax">${buckets.map((b, i) => `<span class="xl${i % sw === 0 ? " xl-w" : ""}${i % sn === 0 ? " xl-n" : ""}">${esc(b.label)}</span>`).join("")}</div>
      </div>
    </div>`;
  }
  function wireBars(el, cb) {
    if (!el) return;
    const cols = el.querySelectorAll(".bcol"), xls = el.querySelectorAll(".xl");
    let cur = null;
    const pick = (i) => {
      if (i === cur) return;
      cur = i;
      el.classList.toggle("has-sel", i != null);
      cols.forEach((c, j) => c.classList.toggle("sel", j === i));
      xls.forEach((c, j) => c.classList.toggle("sel", j === i));
      cb(i);
    };
    const at = (e) => { const c = e.target.closest(".bcol"); return c ? +c.dataset.i : null; };
    el.addEventListener("mouseover", (e) => { const i = at(e); if (i != null) pick(i); });
    el.addEventListener("click", (e) => { const i = at(e); if (i != null) pick(i); });
    el.addEventListener("mouseleave", () => pick(null));
  }

  window.UI = { ICON, deltaChip, pdot, pchip, cssColor, esc, flashMsg, fsBtn,
    tip, head, seg, track, stack, legend, spark, deltaTxt, bars, wireBars };

  /* ---- floating bubble for every [data-tip] ---- */
  let tipEl = null, tipFor = null, tipAt = 0;
  function showTip(btn) {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tip-pop"; tipEl.setAttribute("role", "tooltip"); document.body.appendChild(tipEl); }
    tipEl.textContent = btn.getAttribute("data-tip");
    tipEl.style.width = btn.getAttribute("data-tip-w") || "";
    tipEl.classList.add("on");
    const r = btn.getBoundingClientRect(), w = tipEl.offsetWidth;
    let left = btn.hasAttribute("data-tip-right") ? r.right + 8 - w : r.left - 8;
    left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
    tipEl.style.left = (left + window.scrollX) + "px";
    tipEl.style.top = (r.bottom + 6 + window.scrollY) + "px";
    tipFor = btn;
  }
  function hideTip() { if (tipEl) tipEl.classList.remove("on"); tipFor = null; }
  const tipOf = (e) => (e.target && e.target.closest ? e.target.closest("[data-tip]") : null);
  document.addEventListener("mouseover", (e) => { const b = tipOf(e); if (b && b !== tipFor) { tipAt = Date.now(); showTip(b); } });
  document.addEventListener("mouseout", (e) => { const b = tipOf(e); if (b && !b.contains(e.relatedTarget)) hideTip(); });
  // A tap fires mouseover then click: keep the bubble the tap just opened, and
  // let a later tap on the same (i) close it.
  document.addEventListener("click", (e) => {
    const b = tipOf(e);
    if (!b) { hideTip(); return; }
    if (b === tipFor && Date.now() - tipAt > 400) hideTip(); else { tipAt = Date.now(); showTip(b); }
  });
  window.addEventListener("resize", hideTip);
  window.Views = window.Views || {};
})();
