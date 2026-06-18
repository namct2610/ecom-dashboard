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
  function newestDate() {
    const daily = (S.DASH && S.DASH.daily) || [];
    return daily.length ? daily[daily.length - 1].date : ((S.DASH.latestMonth || "2026-01") + "-01");
  }
  function escHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  }
  const CAL_M = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const CAL_D = ["mon","tue","wed","thu","fri","sat","sun"];
  function fmtISODate(d) { return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function parseISODate(s) { const p = String(s||"").split("-").map(Number); return new Date(p[0]||1970,(p[1]||1)-1,p[2]||1); }
  function calMondayOf(s) { const d = parseISODate(s); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d; }

  function buildPeriods() {
    const latest = newestDate();
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
          ${cfg.modes.map(function(it){return '<button type="button" class="'+(it.key===cfg.currentMode?"active":"")+'" data-mode="'+it.key+'">'+it.label+'</button>';}).join("")}
        </div>
        <div class="period-fields">
          <div id="periodCal"></div>
          <div class="period-preview">${escHtml(S.periodLabel(st.period))}</div>
        </div>
        <div class="period-pop-actions">
          <button type="button" class="ctrl-btn" data-act="cancel">${T("common.cancel")}</button>
          <button type="button" class="ctrl-btn on" data-act="apply">${T("common.confirm")}</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    const rect = anchor.getBoundingClientRect();
    m.style.top = (rect.bottom+6)+"px";
    m.style.left = Math.max(12,Math.min(rect.left,window.innerWidth-m.offsetWidth-12))+"px";

    let mode = cfg.currentMode;
    let calView = parseISODate(cfg.range.end);
    calView.setDate(1);
    let calStart = cfg.range.start;
    let calEnd = cfg.range.end;
    const calEl = m.querySelector("#periodCal");
    const preview = m.querySelector(".period-preview");
    const today = fmtISODate(new Date());

    function buildKey() {
      if(mode==="day") return "d:"+calEnd;
      if(mode==="week"){var md=calMondayOf(calEnd);return "w:"+fmtISODate(md);}
      if(mode==="month") return "m:"+calEnd.slice(0,7);
      if(mode==="year") return "y:"+calEnd.slice(0,4);
      // Custom: handle in-progress selection (one date picked) by previewing it as a single day
      var a=calStart,b=calEnd;
      if(!a && !b) return st.period;
      if(!a) a=b; if(!b) b=a;
      if(a>b){var t=a;a=b;b=t;}
      return "c:"+a+":"+b;
    }

    function renderCal() {
      var h='<div class="cal-panel">';
      if(mode==="month"){
        // Month mode: nav arrows shift YEAR; title shows only the year
        h+='<div class="cal-navbar">';
        h+='<button class="cal-nav-btn" data-nav="-12">&lsaquo;</button>';
        h+='<div class="cal-nav-title">'+calView.getFullYear()+'</div>';
        h+='<button class="cal-nav-btn" data-nav="12">&rsaquo;</button>';
        h+='</div>';
      } else if(mode!=="year"){
        var titleMon=calView.getMonth(), titleYr=calView.getFullYear();
        h+='<div class="cal-navbar">';
        h+='<button class="cal-nav-btn" data-nav="-1">&lsaquo;</button>';
        h+='<div class="cal-nav-title">'+T("period.cal."+CAL_M[titleMon])+' '+titleYr+'</div>';
        h+='<button class="cal-nav-btn" data-nav="1">&rsaquo;</button>';
        h+='</div>';
      }
      if(mode==="month"){
        h+='<div class="cal-grid cal-months">';
        for(var mi=0;mi<12;mi++){
          var ym=calView.getFullYear()+"-"+String(mi+1).padStart(2,"0");
          var sel=ym===calEnd.slice(0,7)?" sel":"";
          h+='<button class="cal-month'+sel+'" data-pick="m:'+ym+'">'+T("period.cal."+CAL_M[mi])+'</button>';
        }
        h+='</div>';
      } else if(mode==="year"){
        var dc=Math.floor(calView.getFullYear()/10)*10;
        h+='<div class="cal-navbar">';
        h+='<button class="cal-nav-btn" data-nav="-10">&laquo;</button>';
        h+='<div class="cal-nav-title">'+dc+' – '+(dc+9)+'</div>';
        h+='<button class="cal-nav-btn" data-nav="10">&raquo;</button>';
        h+='</div>';
        h+='<div class="cal-grid cal-years">';
        for(var yi=dc-1;yi<=dc+10;yi++){
          var sy=String(yi);
          var sely=sy===calEnd.slice(0,4)?" sel":"";
          h+='<button class="cal-year'+sely+'" data-pick="y:'+sy+'">'+sy+'</button>';
        }
        h+='</div>';
      } else {
        var first=new Date(calView.getFullYear(),calView.getMonth(),1);
        var startDow=(first.getDay()+6)%7;
        h+='<div class="cal-grid cal-days">';
        for(var di=0;di<7;di++) h+='<div class="cal-dow">'+T("period.cal."+CAL_D[di])+'</div>';
        var cursor=new Date(first);cursor.setDate(cursor.getDate()-startDow);
        for(var w=0;w<6;w++){
          for(var dd=0;dd<7;dd++){
            var ds=fmtISODate(cursor), cls="cal-day";
            if(cursor.getMonth()!==calView.getMonth()) cls+=" out";
            if(ds===today) cls+=" today";
            if(mode==="custom"){
              if(ds===calStart||ds===calEnd) cls+=ds===calStart?" sel-start":" sel-end";
              else if(calStart&&calEnd&&ds>calStart&&ds<calEnd) cls+=" in-range";
            } else if(mode==="week"){
              var monday=calMondayOf(calEnd);
              var sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
              if(ds===fmtISODate(monday)||ds===fmtISODate(sunday)) cls+=" sel-start";
              else if(ds>fmtISODate(monday)&&ds<fmtISODate(sunday)) cls+=" in-range";
            } else {
              if(ds===calEnd) cls+=" sel";
            }
            h+='<button class="'+cls+'" data-pick="d:'+ds+'">'+cursor.getDate()+'</button>';
            cursor.setDate(cursor.getDate()+1);
          }
        }
        h+='</div>';
      }
      h+='</div>';
      calEl.innerHTML=h;
      preview.textContent=S.periodLabel(buildKey());
    }

    function syncModeUI(){
      m.querySelectorAll("[data-mode]").forEach(function(b){b.classList.toggle("active",b.dataset.mode===mode);});
      m.querySelectorAll("[data-mode-fields]").forEach(function(r){
        r.style.display=r.getAttribute("data-mode-fields").split(/\s+/).includes(mode)?"grid":"none";
      });
    }

    calEl.addEventListener("click",function(e){
      var btn=e.target.closest("[data-pick]");
      if(btn){
        var pk=btn.dataset.pick;
        if(pk.startsWith("d:")){
          var d=pk.slice(2);
          if(mode==="custom"){
            if(!calStart||(calStart&&calEnd)){
              // Fresh range: first click starts a new selection
              calStart=d;calEnd="";
            } else {
              // Second click completes the range — swap if user picked end before start
              if(d<calStart){calEnd=calStart;calStart=d;}
              else {calEnd=d;}
            }
          } else {calEnd=d;}
          renderCal();
        } else if(pk.startsWith("m:")){
          // Month-tile click: pick this month (only in month mode)
          calEnd=pk.slice(2)+"-01";
          renderCal();
        } else if(pk.startsWith("y:")){
          // Year-tile click: pick this year and snap calView to it
          calEnd=pk.slice(2)+"-01-01";
          calView=parseISODate(calEnd);calView.setDate(1);
          renderCal();
        }
      }
      var nav=e.target.closest("[data-nav]");
      if(nav){
        var amt=+nav.dataset.nav;
        // Year mode: amt is ±10 (decade). Month mode: amt is ±12 (year).
        // Day/week/custom: amt is ±1 (month). Navigation NEVER overrides selection.
        if(mode==="year"){
          calView.setFullYear(calView.getFullYear()+amt);
        } else {
          calView.setMonth(calView.getMonth()+amt);
        }
        renderCal();
      }
    });

    m.querySelector(".period-mode-seg")?.addEventListener("click",function(e){
      var btn=e.target.closest("button[data-mode]");
      if(!btn)return;
      mode=btn.dataset.mode;
      syncModeUI();
      renderCal();
    });

    m.querySelector('[data-act="cancel"]')?.addEventListener("click",closePop);
    m.querySelector('[data-act="apply"]')?.addEventListener("click",function(){
      // Custom mode: if only one date is picked, treat as single-day range
      if(mode==="custom" && calStart && !calEnd){calEnd=calStart;}
      st.period=buildKey();commit();closePop();
    });

    syncModeUI();
    renderCal();
    openPop=m;
    setTimeout(function(){document.addEventListener("click",outside,true);},0);
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

  // ── Hash-based routing ────────────────────────────────────────────────────
  // Valid page keys — used to validate hash values before applying.
  const VALID_PAGES = new Set([
    "overview","compare","orders","products","customers","traffic","plan",
    "reconcile","upload","connect","users","settings",
  ]);

  function pageFromHash() {
    const h = window.location.hash.replace(/^#\/?/, "").split("?")[0].toLowerCase();
    return VALID_PAGES.has(h) ? h : null;
  }

  function setHash(page, push) {
    const target = VALID_PAGES.has(page) ? "#" + page : "#overview";
    if (window.location.hash !== target) {
      push ? history.pushState(null, "", target) : history.replaceState(null, "", target);
    }
  }

  window.addEventListener("hashchange", () => {
    const page = pageFromHash();
    if (page && page !== st.page) {
      st.page = page;
      commit();
    }
  });

  function commit(push) {
    setHash(st.page, push);
    S.save();
    renderPage();
  }

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
      document.querySelectorAll(".nav-item[data-page]").forEach((n) => n.addEventListener("click", () => { st.page = n.dataset.page; document.getElementById("app").classList.remove("nav-open"); commit(true); }));
      document.querySelectorAll(".nav-item:not([data-page])").forEach((n) => n.addEventListener("click", () => { st.page = "_system_" + (n.dataset.sys || ""); document.getElementById("app").classList.remove("nav-open"); commit(true); }));
      // theme
      document.getElementById("themeBtn").addEventListener("click", () => { st.theme = st.theme === "dark" ? "light" : "dark"; applyTheme(); commit(); });
      // language
      document.getElementById("langBtn")?.addEventListener("click", () => {
        if (window.I18n) window.I18n.toggle();
        applyLangBtn();
        // refresh sync-date string in active language
        document.getElementById("syncDate").textContent = TF("nav.side.synced_at", { date: sync });
        renderPage();
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

      // On first load, honour the URL hash if it points to a valid page.
      // This lets users bookmark / share direct links like /#customers.
      const hashPage = pageFromHash();
      if (hashPage) st.page = hashPage;
      setHash(st.page);   // normalise hash in address bar
      renderPage();

      // Browser back/forward button support
      window.addEventListener("popstate", () => {
        const p = pageFromHash();
        if (p && p !== st.page) { st.page = p; S.save(); renderPage(); }
      });
    },
    go(page) { st.page = page; commit(true); },
    rerender() { renderPage(); },
  };
  window.App = App;

  /* ---- Reusable day-only date picker ----------------------------
     Opens a popover anchored to `anchor`. Calls `onPick(isoDate)`
     when a day is clicked. `isoDate` is "" if user clicks Clear.
  ----------------------------------------------------------------- */
  function dayPickerPopover(anchor, value, onPick) {
    closePop();
    var initial = (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) ? value : "";
    var calView = initial ? parseISODate(initial) : new Date();
    calView.setDate(1);
    var calEnd = initial;
    var today = fmtISODate(new Date());

    var m = document.createElement("div");
    m.className = "menu period-pop date-pop";
    m.innerHTML =
      '<div class="period-pop-body">'
      + '<div class="period-fields"><div id="dpCal"></div></div>'
      + '<div class="period-pop-actions">'
      +   '<button type="button" class="ctrl-btn" data-act="clear">' + T("common.clear", "Xoá") + '</button>'
      +   '<button type="button" class="ctrl-btn" data-act="cancel">' + T("common.cancel") + '</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(m);
    var rect = anchor.getBoundingClientRect();
    m.style.top = (rect.bottom + 6) + "px";
    m.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - m.offsetWidth - 12)) + "px";

    var calEl = m.querySelector("#dpCal");

    function render() {
      var titleMon = calView.getMonth(), titleYr = calView.getFullYear();
      var h = '<div class="cal-panel">';
      h += '<div class="cal-navbar">';
      h += '<button type="button" class="cal-nav-btn" data-nav="-1">&lsaquo;</button>';
      h += '<div class="cal-nav-title">' + T("period.cal." + CAL_M[titleMon]) + ' ' + titleYr + '</div>';
      h += '<button type="button" class="cal-nav-btn" data-nav="1">&rsaquo;</button>';
      h += '</div>';
      var first = new Date(calView.getFullYear(), calView.getMonth(), 1);
      var startDow = (first.getDay() + 6) % 7;
      h += '<div class="cal-grid cal-days">';
      for (var di = 0; di < 7; di++) h += '<div class="cal-dow">' + T("period.cal." + CAL_D[di]) + '</div>';
      var cursor = new Date(first);
      cursor.setDate(cursor.getDate() - startDow);
      for (var w = 0; w < 6; w++) {
        for (var dd = 0; dd < 7; dd++) {
          var ds = fmtISODate(cursor), cls = "cal-day";
          if (cursor.getMonth() !== calView.getMonth()) cls += " out";
          if (ds === today) cls += " today";
          if (ds === calEnd) cls += " sel";
          h += '<button type="button" class="' + cls + '" data-pick="' + ds + '">' + cursor.getDate() + '</button>';
          cursor.setDate(cursor.getDate() + 1);
        }
      }
      h += '</div></div>';
      calEl.innerHTML = h;
    }

    calEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-pick]");
      if (btn) {
        var pick = btn.dataset.pick;
        closePop();
        onPick(pick);
        return;
      }
      var nav = e.target.closest("[data-nav]");
      if (nav) {
        calView.setMonth(calView.getMonth() + (+nav.dataset.nav));
        render();
      }
    });

    m.querySelector('[data-act="clear"]').addEventListener("click", function () { closePop(); onPick(""); });
    m.querySelector('[data-act="cancel"]').addEventListener("click", closePop);

    render();
    openPop = m;
    setTimeout(function () { document.addEventListener("click", outside, true); }, 0);
  }

  window.DatePicker = { open: dayPickerPopover };
})();
