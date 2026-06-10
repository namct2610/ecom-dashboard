/* ============================================================
   App — router, header controls, theme, period/compare logic
   ============================================================ */
(function () {
  const S = window.Store, st = S.state;
  const PAGES = ["overview", "compare", "orders", "products", "customers", "traffic", "plan", "upload", "reconcile", "connect", "users", "settings"];
  const T = window.t || ((k, f) => f || k);
  const TF = window.tf || ((k, v) => k);

  // Pretty "Tháng N, YYYY" / EN "N/YYYY"
  function fmtMonthLong(ym) {
    const [y, m] = ym.split("-");
    return TF("period.month_n", { n: +m, y });
  }
  function fmtMonthShort(ym) {
    const [y, m] = ym.split("-");
    return TF("period.month_short", { n: +m, y });
  }

  /* Dynamic period list — derived from DASH.monthly. Built fresh on every
     access so labels follow the active language. */
  function buildPeriods() {
    const monthly = (S.DASH && S.DASH.monthly) || [];
    if (!monthly.length) return [{ key: "3m", label: T("period.3m") }];

    const all = monthly.map((m) => m.ym).sort();
    const latest = S.DASH.latestMonth || all[all.length - 1];
    const latestY = +latest.slice(0, 4);
    const years = Array.from(new Set(all.map((ym) => ym.slice(0, 4)))).sort();

    const tailSub = (n) => {
      if (all.length < n) return undefined;
      const slice = all.slice(-n);
      return fmtMonthShort(slice[0]) + "–" + fmtMonthShort(slice[slice.length - 1]);
    };

    const presets = [
      { key: "3m",  label: T("period.3m"), sub: tailSub(3) },
      { key: "6m",  label: T("period.6m"), sub: tailSub(6) },
      { key: "ytd", label: T("period.ytd"), sub: fmtMonthShort(latest.slice(0,4) + "-01") + "–" + fmtMonthShort(latest) },
    ];
    if (years.includes(String(latestY - 1))) {
      presets.push({ key: "y:" + (latestY - 1), label: TF("period.year_n", { y: latestY - 1 }) });
    }
    presets.push({ key: "all", label: T("period.all"), sub: fmtMonthShort(all[0]) + " – " + fmtMonthShort(all[all.length - 1]) });

    const recent = all.slice(-12).reverse().map((ym, i) => ({
      key: "m:" + ym,
      label: fmtMonthLong(ym),
      sub: i === 0 ? T("period.recent") : undefined,
    }));

    return presets.concat([{ divider: true }]).concat(recent);
  }

  function buildCompares() {
    return [
      { key: "prev", label: T("compare.prev") },
      { key: "yoy",  label: T("compare.yoy") },
      { key: "none", label: T("compare.none") },
    ];
  }

  let PERIODS = [];
  let COMPARES = [];

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

  function applyLangBtn() {
    const txt = document.getElementById("langText");
    if (txt) txt.textContent = (window.I18n && window.I18n.getLang() === "en") ? "EN" : "VI";
  }

  function renderControls() {
    const per = PERIODS.find((p) => p.key === st.period) || PERIODS[0];
    return `
      <div class="segment hide-sm" id="platSeg">
        <button class="${st.platform === "all" ? "active" : ""}" data-p="all">${T("common.all")}</button>
        ${S.PKEYS.map((k) => `<button class="${st.platform === k ? "active" : ""}" data-p="${k}"><span class="pdot" style="background:var(--${k})"></span>${S.PLAT[k].label.replace(" Shop", "")}</button>`).join("")}
      </div>
      <button class="period" id="periodBtn">${ICON.cal}<span class="ptxt">${per ? per.label : ""}</span><span class="pcaret">▾</span></button>
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
    document.getElementById("periodBtn")?.addEventListener("click", (e) => { e.stopPropagation(); popover(e.currentTarget, PERIODS, st.period, (k) => { st.period = k; commit(); }, T("period.title")); });
    document.getElementById("compareBtn")?.addEventListener("click", (e) => { e.stopPropagation(); popover(e.currentTarget, COMPARES, st.compare, (k) => { st.compare = k; commit(); }, T("period.compare.title")); });
  }

  /* ---- render page ---- */
  function renderPage() {
    // Rebuild localized lists in case language changed
    PERIODS = buildPeriods();
    COMPARES = buildCompares();

    const root = document.getElementById("pageRoot");
    const view = window.Views[st.page];
    window.Charts.destroyAll();

    const v = view || {};
    // Views may export titleKey/eyebrowKey to opt into i18n. Else use the
    // literal .title / .eyebrow (which may itself already be an i18n key
    // string — t() returns the key when missing).
    const titleText = v.titleKey ? T(v.titleKey) : T(v.title || "", v.title || "—");
    const eyebrowText = v.eyebrowKey ? T(v.eyebrowKey) : T(v.eyebrow || "", v.eyebrow || T("header.eyebrow.default"));
    document.getElementById("headerTitle").textContent = titleText;
    document.getElementById("headerEyebrow").textContent = eyebrowText;
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === st.page));

    document.getElementById("controls").innerHTML = view && view.customToolbar ? "" : renderControls();
    if (!view || !view.customToolbar) wireControls();

    if (!view) {
      root.innerHTML = `<div class="note">${window.UI.ICON.info}<span>${T("boot.app_missing", "Trang chưa được dựng.")}</span></div>`;
      return;
    }
    root.scrollTop = 0;
    root.innerHTML = view.render();
    view.mount && view.mount(root);

    // Apply translations to any data-i18n nodes the view rendered + static chrome
    if (window.I18n) window.I18n.applyDom();
  }

  function commit() { S.save(); renderPage(); }

  const App = {
    init() {
      PERIODS = buildPeriods();
      COMPARES = buildCompares();
      if (!PERIODS.some((p) => !p.divider && p.key === st.period)) st.period = "3m";
      applyTheme();
      applyLangBtn();
      if (st.collapsed) document.getElementById("app").classList.add("collapsed");
      const sync = S.DASH && S.DASH.generatedAt ? S.DASH.generatedAt : new Date().toISOString().slice(0, 10);
      document.getElementById("syncDate").textContent = TF("nav.side.synced_at", { date: sync });
      // nav
      document.querySelectorAll(".nav-item[data-page]").forEach((n) => n.addEventListener("click", () => { st.page = n.dataset.page; document.getElementById("app").classList.remove("nav-open"); commit(); }));
      document.querySelectorAll(".nav-item:not([data-page])").forEach((n) => n.addEventListener("click", () => { st.page = "_system_" + (n.dataset.sys || ""); document.getElementById("app").classList.remove("nav-open"); commit(); }));
      // theme
      document.getElementById("themeBtn").addEventListener("click", () => { st.theme = st.theme === "dark" ? "light" : "dark"; applyTheme(); commit(); });
      // language
      document.getElementById("langBtn")?.addEventListener("click", () => {
        if (window.I18n) window.I18n.toggle();
        applyLangBtn();
        // refresh sync-date string in active language
        document.getElementById("syncDate").textContent = TF("nav.side.synced_at", { date: sync });
      });
      // collapse
      document.getElementById("collapseBtn").addEventListener("click", () => { st.collapsed = !st.collapsed; document.getElementById("app").classList.toggle("collapsed"); S.save(); });
      // mobile nav
      document.getElementById("hamburger").addEventListener("click", () => document.getElementById("app").classList.toggle("nav-open"));
      document.getElementById("scrim").addEventListener("click", () => document.getElementById("app").classList.remove("nav-open"));
      window.addEventListener("resize", () => { if (openPop) closePop(); });

      if (window.I18n) window.I18n.applyDom();
      renderPage();
    },
    go(page) { st.page = page; commit(); },
    rerender() { renderPage(); },
  };
  window.App = App;
})();
