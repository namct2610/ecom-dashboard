/* ============================================================
   View: Settings (Cài đặt)
   Sections:
     - Account: change password (+ profile full name)
     - Brand SKU rules: 3-char SKU prefix → brand name (admin only)
   Reuses v1 backends: /api/auth.php (GET status), /api/account.php,
                       /api/brand-settings.php
   ============================================================ */
(function () {
  const UI = window.UI;

  const local = {
    loading: true,
    error: null,
    user: null,      // { username, full_name, role, ... }
    csrf: "",
    rules: [],       // [{prefix, brand_name}, ...]
    isAdmin: false,
    saving: false,
    msg: null,       // { kind:"ok"|"err", text }
    update: null,    // { loading, current, latest, has_update, changelog, download_url, last_checked, fetch_error, installing }
    dbExport: null,  // { loading, stats, error, downloading }
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

  /* ── HTML fragments ─────────────────────────────────────────── */

  function flashMsg() {
    if (!local.msg) return "";
    const isOk = local.msg.kind === "ok";
    const bg = isOk ? "color-mix(in oklch, var(--pos) 12%, transparent)" : "color-mix(in oklch, var(--neg) 12%, transparent)";
    const fg = isOk ? "var(--pos)" : "var(--neg)";
    return `<div style="padding:10px 14px;border-radius:var(--r-ctrl);background:${bg};color:${fg};font-weight:700;font-size:13px;margin-bottom:14px">${local.msg.text}</div>`;
  }

  function accountCard() {
    const u = local.user || {};
    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">${t("settings.account.title")}</div>
            <div class="card-sub">${tf("settings.account.sub", { u: u.username || "—", r: u.role || "—" })}</div>
          </div>
        </div>
        <div class="card-pad">
          <div class="field-row">
            <label class="field-label">${t("settings.account.full_name")}</label>
            <input id="accFullName" class="v2-input" type="text" value="${(u.full_name || "").replace(/"/g, '&quot;')}" placeholder="${t("settings.account.placeholder.full_name")}" maxlength="120" />
          </div>
          <div style="display:flex;justify-content:flex-end;margin-bottom:24px">
            <button class="ctrl-btn on" id="btnSaveProfile" style="background:var(--brand);border-color:var(--brand);color:#fff">${t("settings.account.save_profile")}</button>
          </div>

          <div style="border-top:1px solid var(--border);padding-top:18px">
            <div style="font-weight:800;font-size:14px;margin-bottom:14px">${t("settings.account.change_pwd")}</div>
            <div class="field-row">
              <label class="field-label">${t("settings.account.cur_pwd")}</label>
              <input id="accCurPwd" class="v2-input" type="password" autocomplete="current-password" />
            </div>
            <div class="field-row">
              <label class="field-label">${t("settings.account.new_pwd")}</label>
              <input id="accNewPwd" class="v2-input" type="password" autocomplete="new-password" />
              <div class="field-hint">${t("settings.account.new_pwd_hint")}</div>
            </div>
            <div class="field-row">
              <label class="field-label">${t("settings.account.confirm_pwd")}</label>
              <input id="accConfirmPwd" class="v2-input" type="password" autocomplete="new-password" />
            </div>
            <div style="display:flex;justify-content:flex-end">
              <button class="ctrl-btn on" id="btnChangePwd" style="background:var(--brand);border-color:var(--brand);color:#fff">${t("settings.account.change_pwd")}</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function brandRuleRow(rule, idx) {
    const prefix = (rule.prefix || "").replace(/"/g, "&quot;");
    const brand = (rule.brand_name || "").replace(/"/g, "&quot;");
    return `
      <div class="brand-rule-row" data-idx="${idx}" style="display:grid;grid-template-columns:120px 1fr 40px;gap:10px;align-items:center;margin-bottom:8px">
        <input class="v2-input mono" data-field="prefix" type="text" value="${prefix}" maxlength="3" placeholder="${t("settings.brand.placeholder.prefix")}" style="text-transform:uppercase;text-align:center;font-weight:800" />
        <input class="v2-input" data-field="brand_name" type="text" value="${brand}" placeholder="${t("settings.brand.placeholder.name")}" maxlength="120" />
        <button class="iconbtn-sq" data-action="del-rule" aria-label="${t("common.delete")}" style="color:var(--neg)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>
      </div>`;
  }

  function brandCard() {
    if (!local.isAdmin) {
      return `<div class="card card-pad" style="color:var(--ink-3);font-size:13px;font-weight:600">
        ${tf("settings.brand.admin_only", { r: (local.user||{}).role || "—" })}
      </div>`;
    }

    const list = local.rules.length
      ? local.rules.map(brandRuleRow).join("")
      : `<div style="color:var(--ink-3);font-size:13px;font-weight:600;padding:14px 0">${t("settings.brand.empty")}</div>`;

    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">${t("settings.brand.title")}</div>
            <div class="card-sub">${t("settings.brand.sub")}</div>
          </div>
          <button class="ctrl-btn" id="btnAddRule">${t("settings.brand.add_row")}</button>
        </div>
        <div class="card-pad">
          <div id="brandRulesList">${list}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
            <span class="field-hint">${t("settings.brand.hint")}</span>
            <button class="ctrl-btn on" id="btnSaveRules" style="background:var(--brand);border-color:var(--brand);color:#fff">${t("settings.brand.save_rules")}</button>
          </div>
        </div>
      </div>`;
  }

  function updateCard() {
    if (!local.isAdmin) return "";
    const u = local.update || {};
    let body;
    if (u.installing) {
      body = `<div style="text-align:center;color:var(--ink-2);font-weight:700">${t("v2up.installing")} v${u.installing}…</div>`;
    } else if (u.success) {
      body = `<div style="text-align:center">
        <div style="color:var(--pos);font-weight:700;margin-bottom:8px">${t("v2up.success")}</div>
        <button class="ctrl-btn on" id="btnV2UpReload" style="background:var(--brand);border-color:var(--brand);color:#fff">${t("v2up.reload")}</button>
      </div>`;
    } else if (u.fetch_error && !u.latest) {
      body = `<div style="padding:10px 14px;border-radius:var(--r-ctrl);background:color-mix(in oklch, #f0a945 18%, transparent);color:#92400e;font-weight:600;font-size:13px">${u.fetch_error}</div>`;
    } else if (u.has_update) {
      body = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
          <div>
            <div style="color:var(--brand);font-weight:800;font-size:15px">${t("v2up.has_update")}: v${u.latest}</div>
            <div style="font-size:12.5px;color:var(--ink-3);font-weight:600;margin-top:3px">
              ${t("v2up.current")} v${u.current}
              ${u.last_checked ? ` · ${t("v2up.checked_at")} ${u.last_checked}` : ""}
            </div>
          </div>
          <button class="ctrl-btn on" id="btnV2UpApply" style="background:var(--brand);border-color:var(--brand);color:#fff">${t("v2up.apply")}</button>
        </div>
        ${u.changelog ? `<div style="margin-top:12px;padding:10px 14px;background:var(--surface-2);border-radius:var(--r-ctrl);font-size:12.5px;white-space:pre-wrap;line-height:1.7;color:var(--ink-2)">${escapeHtml(u.changelog)}</div>` : ""}`;
    } else {
      body = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div>
            <div style="font-weight:700;color:var(--pos)">✓ ${t("v2up.up_to_date")} (v${u.current || "—"})</div>
            <div style="font-size:12.5px;color:var(--ink-3);font-weight:600;margin-top:3px">${u.last_checked ? `${t("v2up.checked_at")} ${u.last_checked}` : ""}</div>
          </div>
        </div>`;
    }

    return `
      <div class="card section-gap">
        <div class="card-head">
          <div>
            <div class="card-title">${t("v2up.card.title")}</div>
            <div class="card-sub">${t("v2up.card.sub")}</div>
          </div>
          <button class="ctrl-btn" id="btnV2UpCheck">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18 2v5h-5"/><path d="M6 22v-5h5"/></svg>
            ${t("v2up.check_now")}
          </button>
        </div>
        <div class="card-pad">
          ${u.loading ? `<div style="text-align:center;color:var(--ink-3);font-weight:600">${t("common.loading")}</div>` : body}
        </div>
      </div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  /* ── DB export card ─────────────────────────────────────────── */

  function dbExportCard() {
    if (!local.isAdmin) return "";
    const x = local.dbExport || {};
    const stats = x.stats || null;

    let body;
    if (x.loading) {
      body = `<div style="color:var(--ink-3);font-weight:600">${t("common.loading")}</div>`;
    } else if (x.error) {
      body = `<div style="color:var(--neg);font-weight:700;margin-bottom:8px">${t("common.error")}: ${escapeHtml(x.error)}</div>`;
    } else if (stats) {
      const rows = Object.entries(stats).map(([tbl, cnt]) =>
        `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:13px">
          <span style="font-family:monospace;color:var(--ink-2)">${escapeHtml(tbl)}</span>
          <span class="tnum" style="color:var(--ink-3);font-weight:700">${cnt.toLocaleString("vi-VN")}</span>
        </div>`
      ).join("");
      body = `<div style="margin-bottom:14px">${rows}</div>`;
    } else {
      body = `<div style="color:var(--ink-3);font-size:13px;margin-bottom:12px">${t("settings.export.desc")}</div>`;
    }

    const btnLabel = x.downloading ? t("settings.export.downloading") :
                     x.loading     ? t("common.loading") :
                                     t("settings.export.btn");
    const btnDisabled = x.loading || x.downloading ? "disabled" : "";

    return `
      <div class="card section-gap">
        <div class="card-head">
          <div>
            <div class="card-title">${t("settings.export.title")}</div>
            <div class="card-sub">${t("settings.export.sub")}</div>
          </div>
          <button class="ctrl-btn on" id="btnDbExport" ${btnDisabled}
                  style="background:var(--brand);border-color:var(--brand);color:#fff">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            ${btnLabel}
          </button>
        </div>
        <div class="card-pad">${body}</div>
      </div>`;
  }

  async function fetchDbExportStats() {
    local.dbExport = { loading: true };
    window.App.rerender();
    try {
      const r = await fetch("api/export-db.php?action=stats", { credentials: "same-origin" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      local.dbExport = { loading: false, stats: j.stats || {} };
    } catch (e) {
      local.dbExport = { loading: false, error: e.message || String(e) };
    }
    window.App.rerender();
  }

  async function downloadDbExport() {
    if (!local.dbExport) local.dbExport = {};
    local.dbExport.downloading = true;
    local.dbExport.error = null;
    window.App.rerender();
    try {
      const r = await fetch("api/export-db.php", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRF-Token": local.csrf },
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "HTTP " + r.status);
      }
      const blob = await r.blob();
      const disp = r.headers.get("Content-Disposition") || "";
      const match = disp.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : ("dashboard-db-" + new Date().toISOString().slice(0, 10) + ".sql");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      local.dbExport.error = e.message || String(e);
    } finally {
      local.dbExport.downloading = false;
      window.App.rerender();
    }
  }

  /* ── render / mount ──────────────────────────────────────────── */

  function render() {
    if (local.loading) {
      return `<div class="card card-pad" style="text-align:center;color:var(--ink-3);font-weight:600">${t("common.loading")}</div>`;
    }
    if (local.error) {
      return `<div class="card card-pad" style="text-align:center;color:var(--neg);font-weight:700">${t("common.error")}: ${local.error}</div>`;
    }
    return `
      ${flashMsg()}
      <div class="g12" style="grid-template-columns:repeat(12,1fr);gap:16px">
        <div style="grid-column:span 6" data-collapse>${accountCard()}</div>
        <div style="grid-column:span 6" data-collapse>${brandCard()}</div>
      </div>
      ${updateCard()}
      ${dbExportCard()}`;
  }

  /* ── v2 self-update ───────────────────────────────────────── */

  async function fetchUpdateStatus() {
    local.update = local.update || {};
    local.update.loading = true;
    window.App.rerender();
    try {
      const r = await fetch("api/v2-update.php", { credentials: "same-origin" });
      const j = await r.json();
      local.update = {
        loading: false,
        current: j.current,
        latest: j.latest,
        has_update: j.has_update,
        changelog: j.changelog,
        download_url: j.download_url,
        last_checked: j.last_checked,
        fetch_error: j.fetch_error,
      };
    } catch (e) {
      local.update = { loading: false, fetch_error: e.message || String(e) };
    }
    window.App.rerender();
  }

  async function checkUpdateNow() {
    local.update = local.update || {};
    local.update.loading = true;
    window.App.rerender();
    try {
      const r = await fetch("api/v2-update.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
        body: JSON.stringify({ action: "check_now" }),
      });
      const j = await r.json();
      // Backend now returns the fresh manifest inline (cache-buster bypasses
      // both server cache and GitHub raw CDN). Apply directly — no second
      // round-trip that could re-hit the stale CDN.
      if (j && (j.latest || j.current)) {
        local.update = {
          loading: false,
          current: j.current,
          latest: j.latest,
          has_update: !!j.has_update,
          changelog: j.changelog,
          download_url: j.download_url,
          last_checked: j.last_checked,
          fetch_error: j.fetch_error,
        };
        window.App.rerender();
      } else {
        await fetchUpdateStatus();
      }
    } catch (e) {
      local.update = { loading: false, fetch_error: e.message || String(e) };
      window.App.rerender();
    }
  }

  async function applyV2Update() {
    if (!local.update || !local.update.download_url || !local.update.latest) return;
    if (!confirm(t("v2up.has_update") + ": v" + local.update.latest + "?")) return;
    local.update.installing = local.update.latest;
    window.App.rerender();
    try {
      const r = await fetch("api/v2-update.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
        body: JSON.stringify({ action: "apply", version: local.update.latest, download_url: local.update.download_url }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "HTTP " + r.status);
      local.update.installing = null;
      local.update.success = true;
      window.App.rerender();
    } catch (e) {
      local.update.installing = null;
      showMsg("err", t("common.error") + ": " + (e.message || e));
    }
  }

  /* ── interactions ───────────────────────────────────────────── */

  function showMsg(kind, text) {
    local.msg = { kind, text };
    window.App.rerender();
    setTimeout(() => { local.msg = null; window.App.rerender(); }, 4000);
  }

  async function saveProfile() {
    const fullName = document.getElementById("accFullName").value.trim();
    const btn = document.getElementById("btnSaveProfile");
    if (!btn || local.saving) return;
    local.saving = true; btn.textContent = t("plan.saving");
    try {
      const fd = new FormData();
      fd.append("action", "update_profile");
      fd.append("full_name", fullName);
      const r = await fetch("api/account.php", {
        method: "POST", credentials: "same-origin",
        headers: { "X-CSRF-Token": local.csrf },
        body: fd,
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "HTTP " + r.status);
      local.user = j.user;
      showMsg("ok", t("settings.account.saved"));
    } catch (e) {
      btn.textContent = t("settings.account.save_profile");
      showMsg("err", t("settings.account.save_failed") + ": " + (e.message || e));
    } finally {
      local.saving = false;
    }
  }

  async function changePassword() {
    const cur = document.getElementById("accCurPwd").value;
    const nw  = document.getElementById("accNewPwd").value;
    const cf  = document.getElementById("accConfirmPwd").value;
    const btn = document.getElementById("btnChangePwd");
    if (!btn || local.saving) return;
    if (!cur || !nw || !cf) { showMsg("err", t("settings.account.pwd_missing")); return; }
    if (nw !== cf) { showMsg("err", t("settings.account.pwd_mismatch")); return; }
    local.saving = true; btn.textContent = t("settings.account.changing");
    try {
      const r = await fetch("api/account.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
        body: JSON.stringify({ action: "change_password",
          current_password: cur, new_password: nw, confirm_password: cf }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "HTTP " + r.status);
      document.getElementById("accCurPwd").value = "";
      document.getElementById("accNewPwd").value = "";
      document.getElementById("accConfirmPwd").value = "";
      showMsg("ok", t("settings.account.pwd_changed"));
    } catch (e) {
      btn.textContent = t("settings.account.change_pwd");
      showMsg("err", t("settings.account.change_failed") + ": " + (e.message || e));
    } finally {
      local.saving = false;
    }
  }

  function collectRulesFromDOM() {
    const rows = document.querySelectorAll(".brand-rule-row");
    const out = [];
    rows.forEach((row) => {
      const prefix = (row.querySelector('[data-field="prefix"]').value || "").toUpperCase().trim();
      const brand_name = (row.querySelector('[data-field="brand_name"]').value || "").trim();
      if (prefix === "" && brand_name === "") return;
      out.push({ prefix, brand_name });
    });
    return out;
  }

  async function saveRules() {
    const btn = document.getElementById("btnSaveRules");
    if (!btn || local.saving) return;
    const rules = collectRulesFromDOM();
    // Validate client-side first
    for (const r of rules) {
      if (r.prefix.length !== 3) { showMsg("err", tf("settings.brand.prefix_invalid", { p: r.prefix || "—" })); return; }
      if (!r.brand_name) { showMsg("err", tf("settings.brand.name_missing", { p: r.prefix })); return; }
    }
    local.saving = true; btn.textContent = t("plan.saving");
    try {
      const r = await fetch("api/brand-settings.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
        body: JSON.stringify({ action: "save", rules }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "HTTP " + r.status);
      local.rules = j.rules || [];
      showMsg("ok", j.message || t("settings.brand.saved"));
      window.App.rerender();
    } catch (e) {
      btn.textContent = t("settings.brand.save_rules");
      showMsg("err", t("settings.brand.save_failed") + ": " + (e.message || e));
    } finally {
      local.saving = false;
    }
  }

  function addRule() {
    local.rules.push({ prefix: "", brand_name: "" });
    window.App.rerender();
  }

  function delRule(idx) {
    local.rules.splice(idx, 1);
    window.App.rerender();
  }

  function bind(root) {
    document.getElementById("btnSaveProfile")?.addEventListener("click", saveProfile);
    document.getElementById("btnChangePwd")?.addEventListener("click", changePassword);
    document.getElementById("btnSaveRules")?.addEventListener("click", saveRules);
    document.getElementById("btnAddRule")?.addEventListener("click", addRule);
    document.querySelectorAll('[data-action="del-rule"]').forEach((b) => {
      b.addEventListener("click", () => {
        const row = b.closest(".brand-rule-row");
        if (row) delRule(+row.dataset.idx);
      });
    });
    // keep DOM in sync with local.rules: prefix uppercase
    document.querySelectorAll('.brand-rule-row [data-field="prefix"]').forEach((inp) => {
      inp.addEventListener("input", () => { inp.value = inp.value.toUpperCase().slice(0, 3); });
    });
    // v2 update card
    document.getElementById("btnV2UpCheck")?.addEventListener("click", checkUpdateNow);
    document.getElementById("btnV2UpApply")?.addEventListener("click", applyV2Update);
    document.getElementById("btnV2UpReload")?.addEventListener("click", () => location.reload());
    // db export
    document.getElementById("btnDbExport")?.addEventListener("click", downloadDbExport);
  }

  function mount(root) {
    if (local.loading) {
      fetchInitial().then(() => {
        window.App.rerender();
        // lazy-load the update status only for admins, after the page renders
        if (local.isAdmin && !local.update) fetchUpdateStatus();
      });
      return;
    }
    bind(root);
    // lazy-load update + db stats on the first mount if not yet fetched
    if (local.isAdmin && !local.update) fetchUpdateStatus();
    if (local.isAdmin && !local.dbExport) fetchDbExportStats();
  }

  window.Views.settings = {
    titleKey: "page.settings.title",
    eyebrowKey: "page.settings.eyebrow",
    customToolbar: true,
    render,
    mount,
  };
})();
