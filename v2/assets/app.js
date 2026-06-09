/* ============================================================
   App — router, header controls, theme, period/compare logic
   ============================================================ */
(function () {
  const S = window.Store, st = S.state;
  const PAGES = ["overview", "compare", "orders", "products", "customers", "traffic"];

  const PERIODS = [
    { key: "m:2026-05", label: "Tháng 5, 2026", sub: "mới nhất" },
    { key: "m:2026-04", label: "Tháng 4, 2026" },
    { key: "m:2026-03", label: "Tháng 3, 2026" },
    { key: "3m", label: "3 tháng gần nhất", sub: "T3–T5/2026" },
  ];
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
    m.innerHTML = (title ? `<div class="menu-label">${title}</div>` : "") + items.map((it) => `<div class="menu-item ${it.key === current ? "sel" : ""}" data-k="${it.key}">${it.label}${it.sub ? ` <small>· ${it.sub}</small>` : ""}</div>`).join("");
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
    // controls
    document.getElementById("controls").innerHTML = renderControls();
    wireControls();
    if (!view) { root.innerHTML = `<div class="note">${window.UI.ICON.info} Trang này thuộc ứng dụng gốc (đối soát / tải dữ liệu / cài đặt) và không nằm trong bản dựng giao diện phân tích.</div>`; return; }
    root.scrollTop = 0;
    root.innerHTML = view.render();
    view.mount && view.mount(root);
  }

  function commit() { S.save(); renderPage(); }

  const App = {
    init() {
      applyTheme();
      if (st.collapsed) document.getElementById("app").classList.add("collapsed");
      document.getElementById("syncDate").textContent = "Cập nhật 08/06/2026 · 15:06";
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
