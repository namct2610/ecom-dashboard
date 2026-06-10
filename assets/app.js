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
  function fmtDateInput(s) {
    return s || "";
  }
  function escHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  }

  function latestDate() {
    const daily = (S.DASH && S.DASH.daily) || [];
    return daily.length ? daily[daily.length - 1].date : ((S.DASH.latestMonth || "2026-01") + "-01");
  }

  function buildPeriods() {
    const latest = latestDate();
    const range = S.currentRange();
    const currentMode = S.periodMode(st.period);
    return {
      modes: [
        { key: "day", label: T("period.mode.day", "Ngày") },
        { key: "week", label: T("period.mode.week", "Tuần") },
        { key: "month", label: T("period.mode.month", "Tháng") },
        { key: "year", label: T("period.mode.year", "Năm") },
        { key: "custom", label: T("period.mode.custom", "Tùy chỉnh") },
      ],
      currentMode,
      latest,
      range,
    };
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
    const periodLabel = S.periodLabel(st.period);
    return `
      <div class="segment hide-sm" id="platSeg">
        <button class="${st.platform === "all" ? "active" : ""}" data-p="all">${T("common.all")}</button>
        ${S.PKEYS.map((k) => `<button class="${st.platform === k ? "active" : ""}" data-p="${k}"><span class="pdot" style="background:var(--${k})"></span>${S.PLAT[k].label.replace(" Shop", "")}</button>`).join("")}
      </div>
      <button class="period" id="periodBtn">${ICON.cal}<span class="ptxt">${periodLabel}</span><span class="pcaret">▾</span></button>
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

  function periodPopover(anchor) {
    closePop();
    const cfg = buildPeriods();
    const m = document.createElement("div");
    m.className = "menu period-pop";
    m.innerHTML = `
      <div class="menu-label">${T("period.title")}</div>
      <div class="period-pop-body">
        <div class="miniseg period-mode-seg">
          ${cfg.modes.map((it) => `<button type="button" class="${it.key === cfg.currentMode ? "active" : ""}" data-mode="${it.key}">${it.label}</button>`).join("")}
        </div>
        <div class="period-fields">
          <div class="field-row" data-mode-fields="day week month year custom">
            <label class="field-label">${T("period.anchor_date", "Ngày mốc")}</label>
            <input id="periodAnchorInput" class="v2-input" type="date" value="${fmtDateInput(cfg.range.end)}" />
          </div>
          <div class="field-row" data-mode-fields="custom">
            <label class="field-label">${T("period.from", "Từ ngày")}</label>
            <input id="periodFromInput" class="v2-input" type="date" value="${fmtDateInput(cfg.range.start)}" />
          </div>
          <div class="field-row" data-mode-fields="custom">
            <label class="field-label">${T("period.to", "Đến ngày")}</label>
            <input id="periodToInput" class="v2-input" type="date" value="${fmtDateInput(cfg.range.end)}" />
          </div>
          <div class="period-preview">${escHtml(S.periodLabel(st.period))}</div>
        </div>
        <div class="period-pop-actions">
          <button type="button" class="ctrl-btn" data-act="cancel">${T("common.cancel")}</button>
          <button type="button" class="ctrl-btn on" data-act="apply">${T("common.confirm")}</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + "px";
    m.style.left = Math.max(12, Math.min(r.left, window.innerWidth - m.offsetWidth - 12)) + "px";

    let mode = cfg.currentMode;
    const anchorInput = m.querySelector("#periodAnchorInput");
    const fromInput = m.querySelector("#periodFromInput");
    const toInput = m.querySelector("#periodToInput");
    const preview = m.querySelector(".period-preview");

    function buildKey() {
      const anchorDate = (anchorInput && anchorInput.value) || cfg.latest;
      if (mode === "day") return "d:" + anchorDate;
      if (mode === "week") return "w:" + anchorDate;
      if (mode === "month") return "m:" + anchorDate.slice(0, 7);
      if (mode === "year") return "y:" + anchorDate.slice(0, 4);
      const from = (fromInput && fromInput.value) || anchorDate;
      const to = (toInput && toInput.value) || anchorDate;
      return S.coercePeriod("c:" + from + ":" + to, "custom");
    }
    function syncFields() {
      m.querySelectorAll("[data-mode-fields]").forEach((row) => {
        const show = row.getAttribute("data-mode-fields").split(/\s+/).includes(mode);
        row.style.display = show ? "grid" : "none";
      });
      m.querySelectorAll("[data-mode]").forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === mode));
      preview.textContent = S.periodLabel(buildKey());
    }

    m.querySelector(".period-mode-seg")?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-mode]");
      if (!btn) return;
      mode = btn.dataset.mode;
      syncFields();
    });
    [anchorInput, fromInput, toInput].forEach((el) => el && el.addEventListener("input", syncFields));
    m.querySelector('[data-act="cancel"]')?.addEventListener("click", closePop);
    m.querySelector('[data-act="apply"]')?.addEventListener("click", () => {
      st.period = buildKey();
      commit();
      closePop();
    });
    syncFields();
    openPop = m;
    setTimeout(() => document.addEventListener("click", outside, true), 0);
  }

  function wireControls() {
    document.getElementById("platSeg")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { st.platform = b.dataset.p; commit(); } });
    document.getElementById("periodBtn")?.addEventListener("click", (e) => { e.stopPropagation(); periodPopover(e.currentTarget); });
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

  /* ---- avatar dropdown (signed-in-as + logout) ---- */
  let avatarUser = null;
  async function fetchAvatarUser() {
    if (avatarUser) return avatarUser;
    try {
      const r = await fetch("api/auth.php", { credentials: "same-origin" });
      const j = await r.json();
      if (j && j.logged_in) avatarUser = j;
    } catch (_) { /* leave null */ }
    return avatarUser;
  }
  function bindAvatarMenu() {
    const av = document.querySelector(".avatar");
    if (!av) return;
    av.style.cursor = "pointer";
    av.setAttribute("role", "button");
    av.setAttribute("tabindex", "0");
    av.addEventListener("click", async (e) => {
      e.stopPropagation();
      closePop();
      const u = (await fetchAvatarUser()) || {};
      const items = [];
      const userLine = `<div class="menu-label">${T("menu.signed_in_as")}: <b>${(u.username || "—").replace(/</g, "&lt;")}</b></div>`;
      const m = document.createElement("div"); m.className = "menu";
      m.innerHTML = userLine +
        `<div class="menu-item" data-act="logout" style="color:var(--neg)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>
          ${T("menu.logout")}
        </div>`;
      document.body.appendChild(m);
      const r = av.getBoundingClientRect();
      // Right-align under the avatar
      m.style.top = (r.bottom + 6) + "px";
      m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 12)) + "px";
      m.querySelector('[data-act="logout"]').addEventListener("click", async () => {
        if (!confirm(T("menu.logout_confirm"))) { closePop(); return; }
        try {
          const csrf = (avatarUser && avatarUser.csrf) || "";
          await fetch("api/auth.php", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
            body: JSON.stringify({ action: "logout" }),
          });
        } catch (_) { /* ignore — reload below will re-prompt login */ }
        window.location.reload();
      });
      openPop = m;
      setTimeout(() => document.addEventListener("click", outside, true), 0);
    });
  }

  const App = {
    init() {
      PERIODS = buildPeriods();
      COMPARES = buildCompares();
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
      // avatar → user menu (logout)
      bindAvatarMenu();
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
