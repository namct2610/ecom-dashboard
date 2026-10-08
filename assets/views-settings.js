/* ============================================================
   View: Settings (Cài đặt) — 3.7 redesign
   Five cards on one page became three sections with a side nav
   (a row of pills on phones):
     - Account: profile + change password
     - Brand SKU rules: 3-char SKU prefix → brand name (admin only)
     - System: update, database backup, server cleanup (admin only)
   Reuses /api/auth.php, /api/account.php, /api/brand-settings.php,
          /api/v2-update.php, /api/export-db.php, /api/security-scan.php
   ============================================================ */
(function () {
  const UI = window.UI;
  const esc = UI.esc;
  const _tf = (k, v) => (window.tf ? window.tf(k, v) : k);

  const local = {
    loading: true,
    error: null,
    user: null,      // { username, full_name, role, last_login_at, ... }
    csrf: "",
    rules: [],       // [{prefix, brand_name}, ...]
    isAdmin: false,
    sec: "account",
    saving: false,
    msg: null,       // { kind:"ok"|"err", text }
    update: null,    // { loading, current, latest, has_update, changelog, download_url, last_checked, fetch_error, installing, success }
    dbExport: null,  // { loading, stats, error, downloading }
    scan: null,      // { loading, error, findings, bytes, selected:Set, deleting }
  };

  async function fetchInitial() {
    local.loading = true;
    local.error = null;
    try {
      const auth = await (await fetch("api/auth.php", { credentials: "same-origin" })).json();
      local.user = auth.user || { username: auth.username, role: auth.role };
      local.csrf = auth.csrf || "";
      local.isAdmin = (local.user.role || "") === "admin";
      if (local.isAdmin) {
        const r = await fetch("api/brand-settings.php", { credentials: "same-origin" });
        if (r.ok) {
          const j = await r.json();
          if (j.success) local.rules = j.rules || [];
        }
      }
    } catch (e) {
      local.error = e.message || String(e);
    } finally {
      local.loading = false;
    }
  }

  function fmtBytes(b) {
    b = +b || 0;
    if (b < 1024) return b + " B";
    if (b < 1048576) return window.F.viDec(b / 1024, 0) + " KB";
    if (b < 1073741824) return window.F.viDec(b / 1048576, 1) + " MB";
    return window.F.viDec(b / 1073741824, 2) + " GB";
  }
  // "08:41 hôm nay" / "08:41 07/10/2026"
  function whenText(s) {
    if (!s) return "";
    const d = new Date(String(s).replace(" ", "T"));
    if (isNaN(d)) return String(s);
    const hm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    const today = new Date().toDateString() === d.toDateString();
    return today ? _tf("settings.when_today", { t: hm }) : hm + " " + d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  const initials = (u) => String(u || "?").replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";

  function showMsg(kind, text) {
    local.msg = { kind, text };
    rerender();
    setTimeout(() => { local.msg = null; rerender(); }, 4000);
  }

  /* ── nav ──────────────────────────────────────────────────── */

  function sections() {
    const u = local.update || {};
    const list = [["account", "settings.sec.account", "settings.sec.account_desc"]];
    if (local.isAdmin) {
      list.push(["brand", "settings.sec.brand", "settings.sec.brand_desc"]);
      list.push(["system", "settings.sec.system", "settings.sec.system_desc", u.has_update && !u.success ? "1" : ""]);
    }
    return list;
  }

  function nav() {
    return `<nav class="set-nav" aria-label="${esc(t("page.settings.title"))}">${sections().map(([k, lk, dk, badge]) =>
      `<button type="button" class="set-tab${local.sec === k ? " on" : ""}" data-sec="${k}" aria-current="${local.sec === k}">
        <span class="set-tab-l">${t(lk)}${badge ? `<span class="set-badge">${badge}</span>` : ""}</span>
        <span class="set-tab-d">${t(dk)}</span>
      </button>`).join("")}</nav>`;
  }

  /* ── account ──────────────────────────────────────────────── */

  function accountSec() {
    const u = local.user || {};
    const admin = (u.role || "") === "admin";
    return `<div class="card">
        <div class="acc-head">
          <span class="uav xl ${admin ? "is-admin" : "is-staff"}">${esc(initials(u.username))}</span>
          <div style="flex:1;min-width:0">
            <div class="nm" style="font-size:16px;font-weight:800">${esc(u.username || "—")}</div>
            <div class="sub3" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px"><span class="sys-pill ${admin ? "is-brand" : "is-mute"}">${t(admin ? "role.admin" : "role.staff")}</span>${u.last_login_at ? esc(_tf("settings.account.signed_in", { t: whenText(u.last_login_at) })) : ""}</div>
          </div>
        </div>
        <div class="set-pad set-f2">
          <label class="fld">${t("settings.account.full_name")}<input id="accFullName" class="v2-input" type="text" value="${esc(u.full_name || "")}" placeholder="${esc(t("settings.account.placeholder.full_name"))}" maxlength="120"></label>
          <button type="button" class="ctrl-btn sys-btn set-btn" id="btnSaveProfile">${t("settings.account.save_profile")}</button>
        </div>
      </div>
      <div class="card">
        ${UI.head(t("settings.account.change_pwd_title"), "")}
        <div class="set-pad" style="display:flex;flex-direction:column;gap:14px">
          <label class="fld set-half">${t("settings.account.cur_pwd")}<input id="accCurPwd" class="v2-input" type="password" autocomplete="current-password"></label>
          <div class="set-2eq">
            <label class="fld">${t("settings.account.new_pwd")}<input id="accNewPwd" class="v2-input" type="password" autocomplete="new-password"></label>
            <label class="fld">${t("settings.account.confirm_pwd")}<input id="accConfirmPwd" class="v2-input" type="password" autocomplete="new-password"></label>
          </div>
          <div class="set-foot0">
            <span class="sub3">${t("settings.account.new_pwd_hint")}</span>
            <button type="button" class="ctrl-btn on sys-btn set-btn" id="btnChangePwd">${t("settings.account.change_pwd")}</button>
          </div>
        </div>
      </div>`;
  }

  /* ── brand rules ──────────────────────────────────────────── */

  function brandSec() {
    const rows = local.rules.map((r, i) => `<div class="rule-row" data-idx="${i}">
        <input class="v2-input rule-p" data-field="prefix" type="text" value="${esc(r.prefix || "")}" maxlength="3" placeholder="${esc(t("settings.brand.placeholder.prefix"))}" aria-label="${esc(t("settings.brand.col.code"))}">
        <input class="v2-input" data-field="brand_name" type="text" value="${esc(r.brand_name || "")}" maxlength="120" placeholder="${esc(t("settings.brand.placeholder.name"))}" aria-label="${esc(t("settings.brand.col.name"))}">
        <button type="button" class="sys-x" data-del-rule aria-label="${esc(t("settings.brand.del_row"))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
      </div>`).join("");
    return `<div class="card">
      <div class="card-head"><div><div class="card-title">${t("settings.brand.title")}</div><div class="sub3" style="font-size:12.5px;margin-top:2px;text-wrap:pretty">${t("settings.brand.sub")}</div></div></div>
      <div style="padding:14px 20px 4px;display:flex;flex-direction:column;gap:8px">
        ${local.rules.length ? `<div class="rule-row lab3"><span>${t("settings.brand.col.code")}</span><span>${t("settings.brand.col.name")}</span><span></span></div>` : `<div class="sub3" style="padding:6px 0">${t("settings.brand.empty")}</div>`}
        <div id="brandRulesList" style="display:flex;flex-direction:column;gap:8px">${rows}</div>
        <button type="button" class="add-row" id="btnAddRule"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>${t("settings.brand.add_row_btn")}</button>
      </div>
      <div class="rule-ex" id="ruleExample">${exampleHtml()}</div>
      <div class="set-foot0" style="padding:16px 20px 18px">
        <span class="sub3">${t("settings.brand.hint")}</span>
        <button type="button" class="ctrl-btn on sys-btn set-btn" id="btnSaveRules">${t("settings.brand.save_rules")}</button>
      </div>
    </div>`;
  }

  // Live example built from the first complete rule, so the convention is
  // obvious while typing.
  function exampleHtml() {
    const r = local.rules.find((x) => (x.prefix || "").length === 3 && x.brand_name) || null;
    if (!r) return `${t("settings.brand.example")} <code>mon-150-6</code> → <code><b>MON</b></code> → <b>${t("settings.brand.no_rule")}</b>`;
    const p = r.prefix.toUpperCase();
    return `${t("settings.brand.example")} <code>${esc(p.toLowerCase())}-150-6</code> → <code><b>${esc(p)}</b></code> → <b>${esc(r.brand_name)}</b>`;
  }

  // Inputs → local.rules, so add/delete row keeps what was typed.
  function captureRules() {
    const rows = document.querySelectorAll("#brandRulesList .rule-row");
    if (!rows.length && !local.rules.length) return;
    if (!document.getElementById("brandRulesList")) return;
    local.rules = [...rows].map((row) => ({
      prefix: (row.querySelector('[data-field="prefix"]').value || "").toUpperCase().trim(),
      brand_name: (row.querySelector('[data-field="brand_name"]').value || "").trim(),
    }));
  }

  /* ── system ───────────────────────────────────────────────── */

  function changelogItems(text) {
    return String(text || "").split(/\n+/).map((s) => s.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
  }

  function updateCard() {
    const u = local.update || {};
    const cur = u.current ? "v" + u.current : "—";
    let badge = "", actions = "", body = "";
    const checkBtn = `<button type="button" class="ctrl-btn sys-btn" id="btnV2UpCheck" ${u.loading || u.installing ? "disabled" : ""}>${u.loading ? t("common.loading") : t("settings.sys.check_again")}</button>`;
    if (u.installing) {
      actions = `<span class="sub3" style="font-weight:700">${t("v2up.installing")} v${esc(u.installing)}…</span>`;
    } else if (u.success) {
      badge = `<span class="sys-pill is-pos">${t("settings.sys.updated")}</span>`;
      actions = `<button type="button" class="ctrl-btn on sys-btn" id="btnV2UpReload">${t("v2up.reload")}</button>`;
    } else if (u.has_update) {
      badge = `<span class="sys-pill is-brand">${_tf("settings.sys.has", { v: "v" + esc(u.latest) })}</span>`;
      actions = checkBtn + `<button type="button" class="ctrl-btn on sys-btn" id="btnV2UpApply">${_tf("settings.sys.apply", { v: "v" + esc(u.latest) })}</button>`;
    } else {
      if (u.current && !u.fetch_error) badge = `<span class="sys-pill is-pos">${t("settings.sys.latest")}</span>`;
      actions = checkBtn;
    }
    if (u.fetch_error && !u.latest) body = `<div class="gap-box" style="margin:0 20px 18px"><div class="gap-t" style="font-weight:700;font-size:12.5px">${esc(u.fetch_error)}</div></div>`;
    else if (u.has_update && !u.success && u.changelog) {
      body = `<div class="chg">${changelogItems(u.changelog).map((c) => `<div><i></i><span>${esc(c)}</span></div>`).join("")}</div>`;
    }
    return `<div class="card">
      <div class="set-pad ver-row">
        <div style="flex:1 1 240px;min-width:0">
          <div class="lab3" style="font-size:12.5px">${t("settings.sys.version")}</div>
          <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="ver">${esc(cur)}</span>${badge}</div>
          <div class="sub3">${u.last_checked ? esc(_tf("settings.sys.checked", { t: whenText(u.last_checked) })) : ""}</div>
        </div>
        <div class="ver-acts">${actions}</div>
      </div>
      ${body}
    </div>`;
  }

  function backupCard() {
    const x = local.dbExport || {};
    const stats = x.stats || null;
    let body;
    if (x.loading) body = `<div class="sub3">${t("common.loading")}</div>`;
    else if (x.error) body = `<div style="color:var(--neg);font-weight:700;font-size:13px">${t("common.error")}: ${esc(x.error)}</div>`;
    else if (stats) body = `<div class="db-grid">${Object.entries(stats).map(([tbl, cnt]) => `<div><span>${esc(tbl)}</span><b class="tnum">${window.F.viInt(+cnt || 0)}</b></div>`).join("")}</div>`;
    else body = "";
    const btn = `<button type="button" class="ctrl-btn sys-btn is-dark" id="btnDbExport" ${x.loading || x.downloading ? "disabled" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>${x.downloading ? t("settings.export.downloading") : t("settings.export.btn_sql")}</button>`;
    return `<div class="card">
      ${UI.head(t("settings.export.title"), t("settings.export.tip"), btn)}
      <div style="padding:12px 20px 18px">${body}</div>
    </div>`;
  }

  const RISK = { high: ["is-neg", "settings.scan.risk_high"], medium: ["is-warn", "settings.scan.risk_medium"], low: ["is-mute", "settings.scan.risk_low"] };

  function scanCard() {
    const x = local.scan || {};
    const sel = x.selected || new Set();
    const busy = x.loading || x.deleting;
    let body;
    if (x.loading) body = `<div class="empty-chart">${t("settings.scan.scanning")}</div>`;
    else if (x.error) body = `<div class="empty-chart" style="color:var(--neg)">${t("common.error")}: ${esc(x.error)}</div>`;
    else if (!x.findings) body = `<div class="empty-chart">${t("settings.scan.desc")}</div>`;
    else if (!x.findings.length) body = `<div class="empty-chart" style="color:var(--pos)">${t("settings.scan.clean")}</div>`;
    else {
      body = `<div class="scan-list">${x.findings.map((f) => {
        const on = sel.has(f.path), r = RISK[f.risk] || RISK.low;
        return `<button type="button" class="scan-row${on ? " on" : ""}" data-scan-path="${esc(f.path)}" role="checkbox" aria-checked="${on}">
          <span class="ck${on ? " on" : ""}"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
          <span style="min-width:0;display:flex;flex-direction:column;gap:3px">
            <span style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px"><b class="mono" style="font-size:12.5px;word-break:break-all">${esc(f.path)}${f.is_dir ? "/" : ""}</b><span class="sys-pill risk ${r[0]}">${t(r[1])}</span><span class="lab3">${fmtBytes(f.size)}</span></span>
            <span class="sub3" style="text-wrap:pretty">${esc(f.reason)}</span>
          </span>
        </button>`;
      }).join("")}</div>
      ${x.findings.length > 1 ? `<div style="display:flex;gap:14px;padding:0 20px 14px"><button type="button" class="link-btn" id="btnScanAll">${t("settings.scan.select_all")}</button><button type="button" class="link-btn" id="btnScanNone">${t("settings.scan.select_none")}</button></div>` : ""}`;
    }
    const sum = x.findings && x.findings.length ? `<span class="lab3" style="font-size:12.5px">${_tf("settings.scan.summary", { n: x.findings.length, size: fmtBytes(x.bytes || 0) })}</span>` : "";
    const delBtn = `<button type="button" class="ctrl-btn sys-btn ${sel.size ? "is-del" : "is-off"}" id="btnScanDelete" ${!sel.size || busy ? "disabled" : ""}>${x.deleting ? t("settings.scan.deleting") : sel.size ? _tf("settings.scan.delete_n", { n: sel.size }) : t("settings.scan.pick")}</button>`;
    const tools = `<button type="button" class="ctrl-btn sys-btn" id="btnScanRun" ${busy ? "disabled" : ""}>${x.findings ? t("settings.scan.rescan") : t("settings.scan.btn")}</button>${delBtn}`;
    return `<div class="card">
      <div class="card-head ch"><div class="ch-title"><div class="card-title">${t("settings.scan.title")}</div>${sum}${UI.tip(t("settings.scan.tip"), { w: "280px" })}</div><div class="ch-tools">${tools}</div></div>
      ${body}
    </div>`;
  }

  /* ── render ───────────────────────────────────────────────── */

  function render() {
    if (local.loading) return `<div class="card card-pad" style="text-align:center;color:var(--ink-3);font-weight:600">${t("common.loading")}</div>`;
    if (local.error) return `<div class="card card-pad" style="text-align:center;color:var(--neg);font-weight:700">${t("common.error")}: ${esc(local.error)}</div>`;
    if (!sections().some(([k]) => k === local.sec)) local.sec = "account";
    const body = local.sec === "brand" ? brandSec()
      : local.sec === "system" ? updateCard() + backupCard() + scanCard()
      : accountSec();
    return `<div class="pg">
      ${UI.flashMsg(local.msg)}
      <div class="set-lay">${nav()}<div class="set-main">${body}</div></div>
    </div>`;
  }
  function rerender() { captureRules(); window.App.rerender(); }

  /* ── system actions ───────────────────────────────────────── */

  function setUpdate(j) {
    local.update = {
      loading: false, current: j.current, latest: j.latest, has_update: !!j.has_update,
      changelog: j.changelog, download_url: j.download_url, last_checked: j.last_checked, fetch_error: j.fetch_error,
    };
  }

  async function fetchUpdateStatus() {
    local.update = Object.assign(local.update || {}, { loading: true });
    try {
      const r = await fetch("api/v2-update.php", { credentials: "same-origin" });
      setUpdate(await r.json());
    } catch (e) {
      local.update = { loading: false, fetch_error: e.message || String(e) };
    }
    rerender();
  }

  async function checkUpdateNow() {
    local.update = Object.assign(local.update || {}, { loading: true });
    rerender();
    try {
      const r = await fetch("api/v2-update.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
        body: JSON.stringify({ action: "check_now" }),
      });
      const j = await r.json();
      // The backend returns the fresh manifest inline (its cache-buster skips
      // both the server cache and the GitHub raw CDN); a second GET could hit
      // the stale CDN again.
      if (j && (j.latest || j.current)) { setUpdate(j); rerender(); }
      else await fetchUpdateStatus();
    } catch (e) {
      local.update = { loading: false, fetch_error: e.message || String(e) };
      rerender();
    }
  }

  async function applyUpdate() {
    const u = local.update;
    if (!u || !u.download_url || !u.latest) return;
    if (!confirm(_tf("settings.sys.apply_confirm", { v: "v" + u.latest }))) return;
    u.installing = u.latest;
    rerender();
    try {
      const r = await fetch("api/v2-update.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
        body: JSON.stringify({ action: "apply", version: u.latest, download_url: u.download_url }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "HTTP " + r.status);
      u.installing = null; u.success = true;
      rerender();
    } catch (e) {
      u.installing = null;
      showMsg("err", t("common.error") + ": " + (e.message || e));
    }
  }

  async function fetchDbExportStats() {
    local.dbExport = { loading: true };
    try {
      const r = await fetch("api/export-db.php?action=stats", { credentials: "same-origin" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      local.dbExport = { loading: false, stats: j.stats || {} };
    } catch (e) {
      local.dbExport = { loading: false, error: e.message || String(e) };
    }
    rerender();
  }

  async function downloadDbExport() {
    const x = local.dbExport || (local.dbExport = {});
    x.downloading = true; x.error = null;
    rerender();
    try {
      const r = await fetch("api/export-db.php", { method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": local.csrf } });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "HTTP " + r.status);
      }
      const blob = await r.blob();
      const m = (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = m ? m[1] : "dashboard-db-" + new Date().toISOString().slice(0, 10) + ".sql";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      x.error = e.message || String(e);
    } finally {
      x.downloading = false;
      rerender();
    }
  }

  async function runScan() {
    local.scan = { loading: true, selected: new Set() };
    rerender();
    try {
      const r = await fetch("api/security-scan.php", { credentials: "same-origin" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "HTTP " + r.status);
      local.scan = { findings: j.findings || [], bytes: j.bytes || 0, truncated: j.truncated, selected: new Set() };
    } catch (e) {
      local.scan = { error: e.message || String(e), selected: new Set() };
    }
    rerender();
  }

  async function deleteScanned() {
    const x = local.scan || {};
    const paths = [...(x.selected || [])];
    if (!paths.length || x.deleting) return;
    if (!window.confirm(_tf("settings.scan.confirm", { n: paths.length }))) return;
    x.deleting = true;
    rerender();
    try {
      const r = await fetch("api/security-scan.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
        body: JSON.stringify({ paths }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "HTTP " + r.status);
      const okN = (j.deleted || []).length, badN = (j.refused || []).length;
      await runScan();
      showMsg(badN ? "err" : "ok", _tf("settings.scan.result", { n: okN, size: fmtBytes(j.bytes || 0) }) + (badN ? " · " + _tf("settings.scan.refused", { n: badN }) : ""));
    } catch (e) {
      x.deleting = false;
      showMsg("err", t("common.error") + ": " + (e.message || e));
    }
  }

  /* ── account / brand actions ──────────────────────────────── */

  async function saveProfile(btn) {
    const fullName = document.getElementById("accFullName").value.trim();
    if (local.saving) return;
    local.saving = true; btn.disabled = true; btn.textContent = t("settings.account.saving");
    try {
      const fd = new FormData();
      fd.append("action", "update_profile");
      fd.append("full_name", fullName);
      const r = await fetch("api/account.php", { method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": local.csrf }, body: fd });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "HTTP " + r.status);
      local.user = Object.assign({}, local.user, j.user || {});
      showMsg("ok", t("settings.account.saved"));
    } catch (e) {
      showMsg("err", t("settings.account.save_failed") + ": " + (e.message || e));
    } finally {
      local.saving = false;
    }
  }

  async function changePassword(btn) {
    const v = (id) => document.getElementById(id).value;
    const cur = v("accCurPwd"), nw = v("accNewPwd"), cf = v("accConfirmPwd");
    if (local.saving) return;
    if (!cur || !nw || !cf) { showMsg("err", t("settings.account.pwd_missing")); return; }
    if (nw !== cf) { showMsg("err", t("settings.account.pwd_mismatch")); return; }
    local.saving = true; btn.disabled = true; btn.textContent = t("settings.account.changing");
    try {
      const r = await fetch("api/account.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
        body: JSON.stringify({ action: "change_password", current_password: cur, new_password: nw, confirm_password: cf }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "HTTP " + r.status);
      showMsg("ok", t("settings.account.pwd_changed"));
    } catch (e) {
      // showMsg re-renders, which also clears the password fields.
      showMsg("err", t("settings.account.change_failed") + ": " + (e.message || e));
    } finally {
      local.saving = false;
    }
  }

  async function saveRules(btn) {
    if (local.saving) return;
    captureRules();
    const rules = local.rules.filter((r) => r.prefix !== "" || r.brand_name !== "");
    for (const r of rules) {
      if (r.prefix.length !== 3) { showMsg("err", _tf("settings.brand.prefix_invalid", { p: r.prefix || "—" })); return; }
      if (!r.brand_name) { showMsg("err", _tf("settings.brand.name_missing", { p: r.prefix })); return; }
    }
    local.saving = true; btn.disabled = true; btn.textContent = t("settings.account.saving");
    try {
      const r = await fetch("api/brand-settings.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
        body: JSON.stringify({ action: "save", rules }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "HTTP " + r.status);
      local.rules = j.rules || [];
      local.saving = false;
      // Re-render from the saved list (duplicates merged by the server).
      local.msg = { kind: "ok", text: j.message || t("settings.brand.saved") };
      window.App.rerender();
      setTimeout(() => { local.msg = null; rerender(); }, 4000);
    } catch (e) {
      local.saving = false;
      showMsg("err", t("settings.brand.save_failed") + ": " + (e.message || e));
    }
  }

  /* ── mount ────────────────────────────────────────────────── */

  function openSystem() {
    if (!local.update) fetchUpdateStatus();
    if (!local.dbExport) fetchDbExportStats();
    if (!local.scan) runScan();
  }

  function mount(root) {
    if (local.loading) {
      fetchInitial().then(() => {
        window.App.rerender();
        // The update check also drives the badge on the System tab.
        if (local.isAdmin && !local.update) fetchUpdateStatus();
      });
      return;
    }
    root.querySelector(".set-nav")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-sec]");
      if (!b || b.dataset.sec === local.sec) return;
      captureRules();
      local.sec = b.dataset.sec;
      window.App.rerender();
    });
    if (local.isAdmin && local.sec === "system") openSystem();
    if (local.isAdmin && !local.update) fetchUpdateStatus();

    root.querySelector("#btnSaveProfile")?.addEventListener("click", (e) => saveProfile(e.currentTarget));
    root.querySelector("#btnChangePwd")?.addEventListener("click", (e) => changePassword(e.currentTarget));

    const list = root.querySelector("#brandRulesList");
    if (list) {
      list.addEventListener("input", (e) => {
        if (e.target.matches('[data-field="prefix"]')) e.target.value = e.target.value.toUpperCase().slice(0, 3);
        captureRules();
        const ex = root.querySelector("#ruleExample");
        if (ex) ex.innerHTML = exampleHtml();
      });
      list.addEventListener("click", (e) => {
        const b = e.target.closest("[data-del-rule]");
        if (!b) return;
        captureRules();
        local.rules.splice(+b.closest(".rule-row").dataset.idx, 1);
        window.App.rerender();
      });
    }
    root.querySelector("#btnAddRule")?.addEventListener("click", () => {
      captureRules();
      local.rules.push({ prefix: "", brand_name: "" });
      window.App.rerender();
      const rows = document.querySelectorAll("#brandRulesList .rule-p");
      rows[rows.length - 1]?.focus();
    });
    root.querySelector("#btnSaveRules")?.addEventListener("click", (e) => saveRules(e.currentTarget));

    root.querySelector("#btnV2UpCheck")?.addEventListener("click", checkUpdateNow);
    root.querySelector("#btnV2UpApply")?.addEventListener("click", applyUpdate);
    root.querySelector("#btnV2UpReload")?.addEventListener("click", () => location.reload());
    root.querySelector("#btnDbExport")?.addEventListener("click", downloadDbExport);
    root.querySelector("#btnScanRun")?.addEventListener("click", runScan);
    root.querySelector("#btnScanDelete")?.addEventListener("click", deleteScanned);
    root.querySelector("#btnScanAll")?.addEventListener("click", () => { local.scan.selected = new Set(local.scan.findings.map((f) => f.path)); rerender(); });
    root.querySelector("#btnScanNone")?.addEventListener("click", () => { local.scan.selected = new Set(); rerender(); });
    root.querySelector(".scan-list")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-scan-path]");
      if (!b) return;
      const set = local.scan.selected;
      if (set.has(b.dataset.scanPath)) set.delete(b.dataset.scanPath); else set.add(b.dataset.scanPath);
      rerender();
    });
  }

  window.Views.settings = {
    titleKey: "page.settings.title",
    eyebrowKey: "page.settings.eyebrow",
    customToolbar: true,
    render,
    mount,
  };
})();
