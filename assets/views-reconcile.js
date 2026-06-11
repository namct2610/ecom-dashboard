/* ============================================================
   View: GBS Reconciliation (Đối soát GBS)
   Reuses:
     GET  /api/gbs-reconciliation.php?month=YYYY-MM   → full compare data
     POST /api/gbs-reconciliation.php  action=set_confirmed
     GET  /api/reconciliation-files.php               → list GBS source files
     POST /api/reconciliation-files.php               → upload GBS file (multipart)
     POST /api/reconciliation-file-delete.php         → delete a source file
     GET  /api/gbs-reconciliation-export.php?month=&platform=  → export .xlsx
   ============================================================ */
(function () {
  const local = {
    loading: true,
    error: null,
    data: null,    // compare() response
    files: [],
    csrf: "",
    saving: false,
    selectedMonth: null,
    msg: null,
  };

  const PLAT_LABELS = { shopee: "Shopee", lazada: "Lazada", tiktokshop: "TikTok Shop" };
  const PLAT_CSS = { shopee: "shopee", lazada: "lazada", tiktokshop: "tiktok" };

  const _t  = (k, ...a)    => (typeof t  === "function" ? t(k, ...a)    : k);
  const _tf = (k, p, ...a) => (typeof tf === "function" ? tf(k, p, ...a) : k);

  function fmtMoney(n) { return window.F.money(+n || 0); }
  function fmtInt(n) { return (+n || 0).toLocaleString("vi-VN"); }
  function fmtDate(s) {
    if (!s) return "—";
    const d = new Date(String(s).replace(" ", "T"));
    if (isNaN(d)) return s;
    return d.toLocaleDateString("vi-VN");
  }
  function fmtPct(n, dec) { return window.F.viDec(+n || 0, dec || 1) + "%"; }

  function showMsg(kind, text) {
    local.msg = { kind, text };
    window.App.rerender();
    setTimeout(() => { local.msg = null; window.App.rerender(); }, 5000);
  }

  function flashMsg() {
    if (!local.msg) return "";
    const isOk = local.msg.kind === "ok";
    const bg = isOk ? "color-mix(in oklch, var(--pos) 12%, transparent)" : "color-mix(in oklch, var(--neg) 12%, transparent)";
    const fg = isOk ? "var(--pos)" : "var(--neg)";
    return `<div style="padding:10px 14px;border-radius:var(--r-ctrl);background:${bg};color:${fg};font-weight:700;font-size:13px;margin-bottom:14px">${local.msg.text}</div>`;
  }

  /* ── data fetchers ────────────────────────────────────────── */

  async function ensureCsrf() {
    if (local.csrf) return local.csrf;
    try {
      const auth = await (await fetch("api/auth.php", { credentials: "same-origin" })).json();
      local.csrf = auth.csrf || "";
    } catch (_) {
      local.csrf = "";
    }
    return local.csrf;
  }

  async function fetchCompare(month) {
    local.loading = true; local.error = null;
    try {
      const url = "api/gbs-reconciliation.php" + (month ? "?month=" + encodeURIComponent(month) : "");
      const [j] = await Promise.all([
        fetch(url, { credentials: "same-origin" }).then(async (r) => {
          const body = await r.json();
          if (!body.success) throw new Error(body.error || "HTTP " + r.status);
          return body;
        }),
        ensureCsrf(),
        fetchFiles(),
      ]);
      local.data = j;
      local.selectedMonth = j.selected_month || month || null;
    } catch (e) {
      local.error = e.message || String(e);
    } finally {
      local.loading = false;
    }
  }

  async function fetchFiles() {
    try {
      const r = await fetch("api/reconciliation-files.php", { credentials: "same-origin" });
      const j = await r.json();
      if (j.success) local.files = j.files || [];
    } catch (_) { /* non-fatal */ }
  }

  /* ── header toolbar ───────────────────────────────────────── */

  function renderToolbar() {
    const months = (local.data && local.data.months) || [];
    const m = local.selectedMonth || "—";
    const monthMeta = local.data && local.data.selected_month_meta;
    const confirmed = !!(monthMeta && monthMeta.confirmed);
    const mLabel = m === "—" ? "—" : _tf("rec.month_btn", { m: +m.slice(5) + "/" + m.slice(0, 4) });

    return `
      <button class="period" id="reMonthBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        <span class="ptxt">${mLabel}</span>
        <span class="pcaret">▾</span>
      </button>
      <label style="display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--ink-2);padding:8px 13px;background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--r-ctrl);cursor:pointer">
        <input id="reConfirmBox" type="checkbox" ${confirmed ? "checked" : ""} ${m === "—" || local.saving ? "disabled" : ""} style="accent-color:var(--brand)" />
        ${_t("rec.confirmed_label")}
      </label>
      <button class="ctrl-btn" id="reExportBtn" ${m === "—" ? "disabled" : ""}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>
        ${_t("rec.export")}
      </button>`;
  }

  function summaryTiles() {
    const s = (local.data && local.data.summary) || {};
    const totalCmp = (s.matched_orders || 0) + (s.bundle_match_orders || 0) + (s.mismatch_orders || 0);
    const matchedPct = totalCmp > 0 ? ((s.matched_orders + s.bundle_match_orders) / totalCmp) * 100 : 0;
    const tiles = [
      { lab: _t("rec.gbs_orders"),         val: fmtInt(s.gbs_orders) },
      { lab: _t("rec.platform_orders"),     val: fmtInt(s.platform_orders) },
      { lab: _t("rec.matched"),             val: fmtInt((s.matched_orders || 0) + (s.bundle_match_orders || 0)), sub: fmtPct(matchedPct), color: "var(--pos)" },
      { lab: _t("rec.mismatch"),            val: fmtInt(s.mismatch_orders), color: "var(--neg)" },
      { lab: _t("rec.missing_gbs"),         val: fmtInt(s.missing_in_gbs), color: "var(--ink-2)" },
      { lab: _t("rec.missing_platform"),    val: fmtInt(s.missing_in_platform), color: "var(--ink-2)" },
    ];
    return `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:16px">
      ${tiles.map((k) => `<div class="card card-pad" style="padding:14px 16px">
        <div class="eyebrow">${k.lab}</div>
        <div class="tnum" style="font-weight:800;font-size:20px;margin-top:4px;color:${k.color || 'var(--ink)'}">${k.val}</div>
        ${k.sub ? `<div style="font-size:11.5px;color:var(--ink-3);font-weight:600;margin-top:2px">${k.sub}</div>` : ""}
      </div>`).join("")}
    </div>`;
  }

  function platformCard(key, plat) {
    const s = (plat && plat.summary) || {};
    const total = (s.matched_orders || 0) + (s.bundle_match_orders || 0) + (s.mismatch_orders || 0);
    const matchedPct = total ? ((s.matched_orders + s.bundle_match_orders) / total) * 100 : 0;
    return `
      <div class="card" style="border-top:4px solid var(--${PLAT_CSS[key]})">
        <div class="card-pad">
          <div style="display:flex;align-items:center;gap:11px;margin-bottom:14px">
            <div class="plogo" style="background:var(--${PLAT_CSS[key]})">${(PLAT_LABELS[key] || key).slice(0,1)}</div>
            <div>
              <div style="font-weight:800;font-size:15px">${PLAT_LABELS[key] || key}</div>
              <div style="font-size:11.5px;color:var(--ink-3);font-weight:600">${plat.scope_note || ""}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;font-size:13px">
            <div><span style="color:var(--ink-3);font-weight:600">${_t("rec.platform_orders")}:</span> <b class="tnum">${fmtInt(s.platform_orders)}</b></div>
            <div><span style="color:var(--ink-3);font-weight:600">${_t("rec.gbs_orders")}:</span> <b class="tnum">${fmtInt(s.gbs_orders)}</b></div>
            <div><span style="color:var(--pos);font-weight:600">${_t("rec.matched")}:</span> <b class="tnum">${fmtInt((s.matched_orders||0) + (s.bundle_match_orders||0))}</b> · ${fmtPct(matchedPct)}</div>
            <div><span style="color:var(--neg);font-weight:600">${_t("rec.mismatch")}:</span> <b class="tnum">${fmtInt(s.mismatch_orders)}</b></div>
            <div><span style="color:var(--ink-3);font-weight:600">${_t("rec.missing_gbs")}:</span> <b class="tnum">${fmtInt(s.missing_in_gbs)}</b></div>
            <div><span style="color:var(--ink-3);font-weight:600">${_t("rec.missing_platform")}:</span> <b class="tnum">${fmtInt(s.missing_in_platform)}</b></div>
          </div>
        </div>
      </div>`;
  }

  function platformGrid() {
    const platforms = (local.data && local.data.platforms) || {};
    const keys = ["shopee", "lazada", "tiktokshop"];
    return `<div class="g12" style="margin-bottom:16px">
      ${keys.map((k) => `<div style="grid-column:span 4" data-collapse>${platformCard(k, platforms[k] || { summary: {} })}</div>`).join("")}
    </div>`;
  }

  function insightsCard() {
    const insights = (local.data && local.data.insights) || {};
    const items = insights.bullets || insights.notes || [];
    if (!items.length) return "";
    return `<div class="card" style="margin-bottom:16px">
      <div class="card-head"><div><div class="card-title">${_t("rec.insights.title")}</div><div class="card-sub">${_t("rec.insights.sub")}</div></div></div>
      <div class="card-pad">
        <ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:7px;font-size:13.5px;line-height:1.55;color:var(--ink-2)">
          ${items.map((item) => `<li>${typeof item === "string" ? item : (item.text || item.message || JSON.stringify(item))}</li>`).join("")}
        </ul>
      </div>
    </div>`;
  }

  function unmatchedTable() {
    const rows = (local.data && local.data.unmatched_platform_orders) || [];
    if (!rows.length) return `<div style="padding:24px;text-align:center;color:var(--ink-3);font-weight:600">${_t("rec.unmatched.empty")}</div>`;
    const limit = 50;
    const shown = rows.slice(0, limit);
    return `
      <table class="tbl">
        <thead><tr>
          <th>${_t("th.order_id")}</th><th>${_t("th.platform")}</th><th>${_t("th.status")}</th>
          <th class="num">SL sàn</th><th class="num">SL GBS</th>
          <th class="num">NMV sàn</th><th class="num">NMV GBS</th>
          <th>${_t("th.note")}</th>
        </tr></thead>
        <tbody>
          ${shown.map((r) => `<tr>
            <td class="mono" style="font-size:12px">${r.order_id || "—"}</td>
            <td><span class="pchip"><span class="pdot" style="background:var(--${PLAT_CSS[r.platform] || 'ink-3'})"></span>${PLAT_LABELS[r.platform] || r.platform || ""}</span></td>
            <td>${statusBadge(r.status)}</td>
            <td class="num tnum">${r.platform_qty != null ? fmtInt(r.platform_qty) : "—"}</td>
            <td class="num tnum">${r.gbs_qty != null ? fmtInt(r.gbs_qty) : "—"}</td>
            <td class="num tnum">${r.platform_nmv != null ? fmtMoney(r.platform_nmv) : "—"}</td>
            <td class="num tnum">${r.gbs_nmv != null ? fmtMoney(r.gbs_nmv) : "—"}</td>
            <td style="font-size:12px;color:var(--ink-3)">${r.note || ""}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      ${rows.length > limit ? `<div style="padding:12px 16px;text-align:center;color:var(--ink-3);font-size:12.5px;font-weight:600">${_tf("rec.unmatched.truncated", { shown: limit, total: rows.length })}</div>` : ""}`;
  }

  function statusBadge(s) {
    const map = {
      matched:             [_t("status.matched"),          "st-done"],
      bundle_match:        [_t("status.matched_combo"),    "st-done"],
      order_match:         [_t("status.matched_order"),    "st-done"],
      mismatch:            [_t("status.mismatch"),         "st-cancel"],
      missing_in_gbs:      [_t("status.missing_gbs"),      "st-ship"],
      missing_in_platform: [_t("status.missing_platform"), "st-ship"],
    };
    const [lab, cls] = map[s] || [s || "?", ""];
    return `<span class="status-pill ${cls}">${lab}</span>`;
  }

  function filesCard() {
    return `
      <div class="card section-gap">
        <div class="card-head">
          <div>
            <div class="card-title">${_t("rec.files.title")}</div>
            <div class="card-sub">${_t("rec.files.sub")}</div>
          </div>
          <button class="ctrl-btn on" id="reAddFileBtn" style="background:var(--brand);border-color:var(--brand);color:#fff">${_t("rec.files.add")}</button>
          <input id="reFileInput" type="file" accept=".xlsx,.xls" style="display:none" />
        </div>
        <div class="card-pad">
          ${local.files.length ? `
            <table class="tbl">
              <thead><tr>
                <th>${_t("th.file")}</th><th class="num">${_t("th.size")}</th><th>${_t("th.month")}</th>
                <th>${_t("th.uploaded_at")}</th><th></th>
              </tr></thead>
              <tbody>${local.files.map((f) => `<tr>
                <td style="font-weight:600;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(f.original_filename||f.filename||'').replace(/"/g,'&quot;')}">${f.original_filename || f.filename || "—"}</td>
                <td class="num tnum">${formatBytes(f.size)}</td>
                <td>${(f.months || []).join(", ") || "—"}</td>
                <td style="font-size:12px;color:var(--ink-3)">${fmtDate(f.uploaded_at)}</td>
                <td class="num"><button class="iconbtn-sq" data-del-file="${f.filename}" aria-label="${_t("common.delete")}" style="color:var(--neg)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                </button></td>
              </tr>`).join("")}</tbody>
            </table>` : `<div style="padding:24px;text-align:center;color:var(--ink-3);font-weight:600">${_t("rec.files.empty")}</div>`}
        </div>
      </div>`;
  }

  function formatBytes(b) {
    if (!b) return "—";
    if (b < 1024) return b + " B";
    if (b < 1024*1024) return (b/1024).toFixed(1) + " KB";
    return (b/1024/1024).toFixed(1) + " MB";
  }

  function render() {
    if (local.loading && !local.data) return `<div class="card card-pad" style="text-align:center;color:var(--ink-3);font-weight:600">${_t("common.loading")}</div>`;
    if (local.error) return `<div class="card card-pad" style="text-align:center;color:var(--neg);font-weight:700">${_t("common.error")}: ${local.error}</div>`;
    const noMonth = !local.selectedMonth;
    return `
      ${flashMsg()}
      ${noMonth ? `<div class="note" style="margin-bottom:16px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>${_t("rec.note.no_data")}</div>`
        : `${summaryTiles()}
           ${platformGrid()}
           ${insightsCard()}
           <div class="card section-gap">
             <div class="card-head"><div><div class="card-title">${_t("rec.unmatched.title")}</div><div class="card-sub">${_t("rec.unmatched.sub")}</div></div></div>
             ${unmatchedTable()}
           </div>`}
      ${filesCard()}`;
  }

  /* ── interactions ────────────────────────────────────────── */

  let openPop = null;
  function closePop() { if (openPop) { openPop.remove(); openPop = null; document.removeEventListener("click", outsidePop, true); } }
  function outsidePop(e) { if (openPop && !openPop.contains(e.target)) closePop(); }
  function openMonthPicker(e) {
    e.stopPropagation();
    closePop();
    const months = (local.data && local.data.months) || [];
    if (!months.length) return;
    const m = document.createElement("div"); m.className = "menu";
    m.innerHTML = `<div class="menu-label">${_t("rec.month.picker_label")}</div>` +
      months.slice().reverse().map((mm) => {
        const ym = mm.month;
        const ok = mm.confirmed ? "✓ " : "";
        return `<div class="menu-item ${ym === local.selectedMonth ? "sel" : ""}" data-m="${ym}">${ok}${_tf("rec.month_btn", { m: +ym.slice(5) + "/" + ym.slice(0, 4) })}${mm.gbs_orders ? ` <small>· ${fmtInt(mm.gbs_orders)} đơn GBS</small>` : ""}</div>`;
      }).join("");
    document.body.appendChild(m);
    const r = e.currentTarget.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + "px";
    m.style.left = Math.min(r.left, window.innerWidth - m.offsetWidth - 12) + "px";
    m.querySelectorAll(".menu-item").forEach((el) => el.addEventListener("click", () => {
      closePop();
      local.loading = true; window.App.rerender();
      fetchCompare(el.dataset.m).then(() => window.App.rerender());
    }));
    openPop = m;
    setTimeout(() => document.addEventListener("click", outsidePop, true), 0);
  }

  async function setConfirm(confirmed) {
    if (!local.selectedMonth || local.saving) return;
    local.saving = true; window.App.rerender();
    try {
      const r = await fetch("api/gbs-reconciliation.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
        body: JSON.stringify({ action: "set_confirmed", month: local.selectedMonth, confirmed }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "HTTP " + r.status);
      if (local.data && local.data.selected_month_meta) {
        local.data.selected_month_meta.confirmed = confirmed;
      }
      showMsg("ok", confirmed ? _t("rec.confirm_ok") : _t("rec.confirm_off"));
    } catch (e) {
      showMsg("err", _t("common.error") + ": " + (e.message || e));
    } finally {
      local.saving = false; window.App.rerender();
    }
  }

  function exportExcel() {
    if (!local.selectedMonth) return;
    window.location.href = "api/gbs-reconciliation-export.php?month=" + encodeURIComponent(local.selectedMonth);
  }

  async function uploadGbsFile(file) {
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) { showMsg("err", _t("rec.upload_invalid")); return; }
    if (file.size > 50 * 1024 * 1024) { showMsg("err", _t("rec.upload_too_big")); return; }
    showMsg("ok", _tf("rec.uploading_label", { name: file.name }));
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch("api/reconciliation-files.php", {
        method: "POST", credentials: "same-origin",
        headers: { "X-CSRF-Token": local.csrf },
        body: fd,
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "HTTP " + r.status);
      showMsg("ok", _t("rec.upload_ok"));
      await fetchCompare(local.selectedMonth);
      window.App.rerender();
    } catch (e) {
      showMsg("err", _t("rec.upload_failed") + ": " + (e.message || e));
    }
  }

  async function deleteFile(filename) {
    if (!confirm(_tf("rec.delete_confirm", { name: filename }))) return;
    try {
      const r = await fetch("api/reconciliation-file-delete.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
        body: JSON.stringify({ filename }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "HTTP " + r.status);
      showMsg("ok", _t("rec.delete_ok"));
      await fetchCompare(local.selectedMonth);
      window.App.rerender();
    } catch (e) {
      showMsg("err", _t("common.error") + ": " + (e.message || e));
    }
  }

  function bind() {
    // toolbar (rendered into #controls by mount)
    document.getElementById("reMonthBtn")?.addEventListener("click", openMonthPicker);
    document.getElementById("reConfirmBox")?.addEventListener("change", (e) => setConfirm(e.target.checked));
    document.getElementById("reExportBtn")?.addEventListener("click", exportExcel);
    // file management
    document.getElementById("reAddFileBtn")?.addEventListener("click", () => document.getElementById("reFileInput")?.click());
    document.getElementById("reFileInput")?.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      uploadGbsFile(f);
      e.target.value = "";
    });
    document.querySelectorAll("[data-del-file]").forEach((b) =>
      b.addEventListener("click", () => deleteFile(b.dataset.delFile))
    );
  }

  function mount(root) {
    // populate toolbar
    const controls = document.getElementById("controls");
    if (controls) controls.innerHTML = renderToolbar();

    if (local.loading && !local.data) {
      fetchCompare().then(() => window.App.rerender());
      return;
    }
    bind();
  }

  window.Views.reconcile = {
    titleKey: "page.reconcile.title",
    eyebrowKey: "page.reconcile.eyebrow",
    customToolbar: true,
    render,
    mount,
  };
})();
