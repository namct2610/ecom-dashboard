/* ============================================================
   App — router, header controls, theme, period/compare logic
   ============================================================ */
(function () {
  const S = window.Store, st = S.state;
  const PAGES = ["overview", "compare", "orders", "products", "customers", "traffic", "plan", "upload", "users", "settings"];

  /* Dynamic period list — derived from DASH.monthly so it stays in sync
     with actual data range. Order:
       - 4 presets (3m, 6m, năm nay, năm trước, all)
       - Then the most recent 12 individual months */
  function buildPeriods() {
    const monthly = (S.DASH && S.DASH.monthly) || [];
    if (!monthly.length) return [{ key: "3m", label: "3 tháng gần nhất" }];

    const all = monthly.map((m) => m.ym).sort();           // "YYYY-MM" asc
    const latest = S.DASH.latestMonth || all[all.length - 1];
    const latestY = +latest.slice(0, 4);
    const years = Array.from(new Set(all.map((ym) => ym.slice(0, 4)))).sort();
    const monthsByYear = {};
    years.forEach((y) => (monthsByYear[y] = all.filter((ym) => ym.startsWith(y))));

    const presets = [
      { key: "3m",  label: "3 tháng gần nhất", sub: rangeSubTail(all, 3) },
      { key: "6m",  label: "6 tháng gần nhất", sub: rangeSubTail(all, 6) },
      { key: "ytd", label: "Năm nay (đến hiện tại)", sub: "T1–" + S.MONTH_VI(latest).replace("Th", "T") + "/" + latestY },
    ];
    if (years.includes(String(latestY - 1))) {
      presets.push({ key: "y:" + (latestY - 1), label: "Năm " + (latestY - 1) });
    }
    presets.push({ key: "all", label: "Cả thời gian", sub: S.MONTH_VI(all[0]) + " – " + S.MONTH_VI(all[all.length - 1]) });

    // Last 12 individual months (descending: newest first)
    const recent = all.slice(-12).reverse().map((ym, i) => ({
      key: "m:" + ym,
      label: S.MONTH_VI_LONG(ym),
      sub: i === 0 ? "mới nhất" : undefined,
    }));

    return presets.concat([{ divider: true }]).concat(recent);
  }

  function rangeSubTail(all, n) {
    if (all.length < n) return undefined;
    const slice = all.slice(-n);
    return S.MONTH_VI(slice[0]).replace("Th", "T") + "–" + S.MONTH_VI(slice[slice.length - 1]).replace("Th", "T") + "/" + slice[slice.length - 1].slice(0, 4);
  }

  let PERIODS = [];   // built at init time (after Store is ready)
  const COMPARES = [
    { key: "prev", label: "Kỳ liền trước" },
    { key: "yoy", label: "Cùng kỳ năm trước" },
    { key: "none", label: "Không so sánh" },
  ];

  const ICON = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    cmp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4M3 8l9 5 9-5M3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0"/><path d="M12 22V12"/></svg>',
  };

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", st.theme);
    const i = document.getElementById("themeIcon");
    if (i) i.innerHTML = st.theme === "dark" ? ICON.sun : ICON.moon;
  }

  /* ---- header controls ---- */
  function renderControls() {
    const per = PERIODS.find((p) => p.key === st.period) || PERIODS[0];
    return `
      <div class="segment hide-sm" id="platSeg">
        <button class="${st.platform === "all" ? "active" : ""}" data-p="all">Tất cả</button>
        ${S.PKEYS.map((k) => `<button class="${st.platform === k ? "active" : ""}" data-p="${k}"><span class="pdot" style="background:var(--${k})"></span>${S.PLAT[k].label.replace(" Shop", "")}</button>`).join("")}
      </div>
      <button class="period" id="periodBtn">${ICON.cal}<span class="ptxt">${per.label}</span><span class="pcaret">▾</span></button>
      <button class="ctrl-btn hide-sm ${st.compare !== "none" ? "on" : ""}" id="compareBtn">${ICON.cmp}<span>${(COMPARES.find((c) => c.key === st.compare) || COMPARES[0]).label}</span><span class="pcaret">▾</span></button>
    `;
  }

  /* ---- popover menu ---- */
  let openPop = null;
  function closePop() { if (openPop) { openPop.remove(); openPop = null; document.removeEventListener("click", outside, true); } }
  function outside(e) { if (openPop && !openPop.contains(e.target)) closePop(); }
  function popover(anchor, items, current, onPick, title) {
    closePop();
    const m = document.createElement("div"); m.className = "menu";
    m.innerHTML = (title ? `<div class="menu-label">${title}</div>` : "") + items.map((it) => {
      if (it.divider) return `<div style="height:1px;background:var(--border);margin:6px 4px"></div>`;
      return `<div class="menu-item ${it.key === current ? "sel" : ""}" data-k="${it.key}">${it.label}${it.sub ? ` <small>· ${it.sub}</small>` : ""}</div>`;
    }).join("");
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + "px";
    m.style.left = Math.min(r.left, window.innerWidth - m.offsetWidth - 12) + "px";
    m.querySelectorAll(".menu-item").forEach((el) => el.addEventListener("click", () => { onPick(el.dataset.k); closePop(); }));
    openPop = m;
    setTimeout(() => document.addEventListener("click", outside, true), 0);
  }

  function wireControls() {
    document.getElementById("platSeg")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { st.platform = b.dataset.p; commit(); } });
    document.getElementById("periodBtn")?.addEventListener("click", (e) => { e.stopPropagation(); popover(e.currentTarget, PERIODS, st.period, (k) => { st.period = k; commit(); }, "Khoảng thời gian"); });
    document.getElementById("compareBtn")?.addEventListener("click", (e) => { e.stopPropagation(); popover(e.currentTarget, COMPARES, st.compare, (k) => { st.compare = k; commit(); }, "So sánh với"); });
  }

  /* ---- render page ---- */
  function renderPage() {
    const root = document.getElementById("pageRoot");
    const view = window.Views[st.page];
    window.Charts.destroyAll();
    // header
    const v = view || {};
    document.getElementById("headerTitle").textContent = v.title || "—";
    document.getElementById("headerEyebrow").textContent = v.eyebrow || "Báo cáo kinh doanh";
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === st.page));
    // controls — views may opt out (customToolbar:true) and render their own
    document.getElementById("controls").innerHTML = view && view.customToolbar ? "" : renderControls();
    if (!view || !view.customToolbar) wireControls();

    if (!view) { root.innerHTML = `<div class="note">${window.UI.ICON.info} Trang này thuộc ứng dụng gốc (đối soát / tải dữ liệu / cài đặt) và không nằm trong bản dựng giao diện phân tích.</div>`; return; }
    root.scrollTop = 0;
    root.innerHTML = view.render();
    view.mount && view.mount(root);
  }

  function commit() { S.save(); renderPage(); }

  const App = {
    init() {
      PERIODS = buildPeriods();
      // If the saved period is no longer valid (e.g. data updated to new range), fall back to "3m"
      if (!PERIODS.some((p) => !p.divider && p.key === st.period)) st.period = "3m";
      applyTheme();
      if (st.collapsed) document.getElementById("app").classList.add("collapsed");
      const sync = S.DASH && S.DASH.generatedAt ? S.DASH.generatedAt : new Date().toISOString().slice(0, 10);
      document.getElementById("syncDate").textContent = "Cập nhật " + sync;
      // nav
      document.querySelectorAll(".nav-item[data-page]").forEach((n) => n.addEventListener("click", () => { st.page = n.dataset.page; document.getElementById("app").classList.remove("nav-open"); commit(); }));
      document.querySelectorAll(".nav-item:not([data-page])").forEach((n) => n.addEventListener("click", () => { st.page = "_system_" + (n.dataset.sys || ""); document.getElementById("app").classList.remove("nav-open"); commit(); }));
      // theme
      document.getElementById("themeBtn").addEventListener("click", () => { st.theme = st.theme === "dark" ? "light" : "dark"; applyTheme(); commit(); });
      // collapse
      document.getElementById("collapseBtn").addEventListener("click", () => { st.collapsed = !st.collapsed; document.getElementById("app").classList.toggle("collapsed"); S.save(); });
      // mobile nav
      document.getElementById("hamburger").addEventListener("click", () => document.getElementById("app").classList.toggle("nav-open"));
      document.getElementById("scrim").addEventListener("click", () => document.getElementById("app").classList.remove("nav-open"));
      window.addEventListener("resize", () => { if (openPop) closePop(); });
      renderPage();
    },
    go(page) { st.page = page; commit(); },
    rerender() { renderPage(); },
  };
  window.App = App;
})();
