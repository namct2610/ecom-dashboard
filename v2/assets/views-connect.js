/* ============================================================
   View: Connect (Kết nối sàn) — Shopee / Lazada / TikTok OAuth
   Single page with 3 tabs sharing logic via per-platform config.
   Reuses:
     /api/shopee-connect.php  /api/lazada-connect.php  /api/tiktok-connect.php
   ============================================================ */
(function () {
  const CONFIGS = {
    shopee: {
      label: "Shopee",
      colorVar: "--shopee",
      api: "../api/shopee-connect.php",
      credentials: [
        { key: "partner_id", label: "Partner ID", type: "number", placeholder: "Mã số nguyên do Shopee cấp" },
        { key: "partner_key", label: "Partner Key", type: "password", placeholder: "Chuỗi bí mật" },
      ],
      // status response fields: { partner_id, has_key, shops:[...] }
      statusKeys: { keyName: "partner_id", hasSecretFlag: "has_key", listKey: "shops",
                    listIdField: "shop_id", listNameField: "shop_name", listExtra: [] },
      oauthHint: "Sau khi bấm \"Cấp quyền\", bạn sẽ được dẫn sang Shopee để chọn shop. Hệ thống nhận callback và lưu token tự động.",
    },
    lazada: {
      label: "Lazada",
      colorVar: "--lazada",
      api: "../api/lazada-connect.php",
      credentials: [
        { key: "app_key",    label: "App Key",    type: "text",     placeholder: "App Key từ Lazada Open Platform" },
        { key: "app_secret", label: "App Secret", type: "password", placeholder: "App Secret" },
      ],
      statusKeys: { keyName: "app_key", hasSecretFlag: "has_secret", listKey: "accounts",
                    listIdField: "account_id", listNameField: "account_name",
                    listExtra: [{ field: "country", label: "Quốc gia" }] },
      oauthHint: "Bấm \"Cấp quyền\" để mở trang đăng nhập Lazada Seller Center. Sau khi chấp nhận, hệ thống lưu token và đồng bộ đơn được.",
    },
    tiktokshop: {
      label: "TikTok Shop",
      colorVar: "--tiktok",
      api: "../api/tiktok-connect.php",
      credentials: [
        { key: "app_key",    label: "App Key",    type: "text",     placeholder: "App Key từ TikTok Partner Center" },
        { key: "app_secret", label: "App Secret", type: "password", placeholder: "App Secret" },
      ],
      statusKeys: { keyName: "app_key", hasSecretFlag: "has_secret", listKey: "shops",
                    listIdField: "shop_id", listNameField: "shop_name",
                    listExtra: [{ field: "region", label: "Khu vực" }] },
      oauthHint: "Bấm \"Cấp quyền\" để vào trang ủy quyền của TikTok. Hệ thống lưu token và đồng bộ shop sau khi nhận callback.",
    },
  };

  const local = {
    tab: "shopee",
    loading: { shopee: true, lazada: true, tiktokshop: true },
    data: { shopee: null, lazada: null, tiktokshop: null },
    csrf: "",
    saving: false,
    msg: null,
  };

  function fmtDate(s) {
    if (!s) return "—";
    const d = new Date(String(s).replace(" ", "T"));
    if (isNaN(d)) return s;
    return d.toLocaleDateString("vi-VN") + " " + d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }
  function showMsg(kind, text) {
    local.msg = { kind, text };
    window.App.rerender();
    setTimeout(() => { local.msg = null; window.App.rerender(); }, 4500);
  }
  function flashMsg() {
    if (!local.msg) return "";
    const isOk = local.msg.kind === "ok";
    const bg = isOk ? "color-mix(in oklch, var(--pos) 12%, transparent)" : "color-mix(in oklch, var(--neg) 12%, transparent)";
    const fg = isOk ? "var(--pos)" : "var(--neg)";
    return `<div style="padding:10px 14px;border-radius:var(--r-ctrl);background:${bg};color:${fg};font-weight:700;font-size:13px;margin-bottom:14px">${local.msg.text}</div>`;
  }

  async function ensureAuth() {
    if (local.csrf) return true;
    const auth = await (await fetch("../api/auth.php", { credentials: "same-origin" })).json();
    if (!auth.logged_in) { window.location.href = "../index.php#/login"; return false; }
    local.csrf = auth.csrf || "";
    return true;
  }

  async function fetchStatus(platformKey) {
    if (!(await ensureAuth())) return;
    local.loading[platformKey] = true;
    try {
      const cfg = CONFIGS[platformKey];
      const r = await fetch(cfg.api + "?action=status", { credentials: "same-origin" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "HTTP " + r.status);
      local.data[platformKey] = j;
    } catch (e) {
      local.data[platformKey] = { _error: e.message || String(e) };
    } finally {
      local.loading[platformKey] = false;
    }
  }

  async function postAction(platformKey, body) {
    const cfg = CONFIGS[platformKey];
    const r = await fetch(cfg.api, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.success) throw new Error(j.error || "HTTP " + r.status);
    return j;
  }

  /* ── HTML ───────────────────────────────────────────────── */

  function tabBar() {
    const tabs = ["shopee", "lazada", "tiktokshop"];
    return `<div class="segment" style="margin-bottom:16px">
      ${tabs.map((k) => `<button class="${local.tab === k ? "active" : ""}" data-tab="${k}">
        <span class="pdot" style="background:var(${CONFIGS[k].colorVar})"></span>${CONFIGS[k].label}
      </button>`).join("")}
    </div>`;
  }

  function credentialsCard(platformKey) {
    const cfg = CONFIGS[platformKey];
    const data = local.data[platformKey] || {};
    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Thông tin ứng dụng (${cfg.label})</div>
            <div class="card-sub">Sau khi lưu, bấm "Cấp quyền" để bắt đầu OAuth.</div>
          </div>
        </div>
        <div class="card-pad">
          ${cfg.credentials.map((f) => {
            const val = (f.type === "password") ? "" : (data[f.key] || "");
            const filledNote = (f.type === "password" && data[cfg.statusKeys.hasSecretFlag]) ? `<span style="font-size:11.5px;color:var(--pos);font-weight:700;margin-left:8px">✓ Đã lưu</span>` : "";
            return `
              <div class="field-row">
                <label class="field-label">${f.label}${filledNote}</label>
                <input class="v2-input" data-cred="${f.key}" type="${f.type}"
                       placeholder="${f.placeholder || ""}"
                       value="${(val || "").toString().replace(/"/g, '&quot;')}" />
              </div>`;
          }).join("")}
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:4px">
            <button class="ctrl-btn on" data-action="save-creds" style="background:var(--brand);border-color:var(--brand);color:#fff">${t("connect.save_btn")}</button>
            <button class="ctrl-btn" data-action="get-auth-url">Cấp quyền (OAuth)</button>
          </div>
          <div class="field-hint" style="margin-top:10px">${cfg.oauthHint}</div>
        </div>
      </div>`;
  }

  function connectionsCard(platformKey) {
    const cfg = CONFIGS[platformKey];
    const data = local.data[platformKey] || {};
    const list = data[cfg.statusKeys.listKey] || [];
    const idF = cfg.statusKeys.listIdField;
    const nameF = cfg.statusKeys.listNameField;
    const extra = cfg.statusKeys.listExtra || [];

    return `
      <div class="card section-gap">
        <div class="card-head">
          <div>
            <div class="card-title">Kết nối đã có (${list.length})</div>
            <div class="card-sub">Mỗi shop/account được lưu kèm access token. Sàn yêu cầu refresh định kỳ.</div>
          </div>
          ${list.length ? `<button class="ctrl-btn on" data-action="sync-all" style="background:var(--brand);border-color:var(--brand);color:#fff">Đồng bộ tất cả</button>` : ""}
        </div>
        ${list.length ? `
          <table class="tbl">
            <thead><tr>
              <th>${cfg.label === "Lazada" ? "Account" : "Shop"}</th>
              ${extra.map((c) => `<th>${c.label}</th>`).join("")}
              <th>Hết hạn token</th>
              <th>Đồng bộ từ</th>
              <th>Lần đồng bộ cuối</th>
              <th>${t("th.status")}</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${list.map((c) => `<tr data-id="${c[idF]}">
                <td>
                  <div style="font-weight:700">${c[nameF] || c[idF]}</div>
                  <div class="mono" style="font-size:11px;color:var(--ink-3)">${c[idF]}</div>
                </td>
                ${extra.map((col) => `<td>${c[col.field] || "—"}</td>`).join("")}
                <td class="mono" style="font-size:12px">${fmtDate(c.access_token_expire_at)}</td>
                <td><input type="date" class="v2-input" data-sync-from-input style="padding:6px 10px;font-size:12.5px" value="${c.sync_from_date || ''}" /></td>
                <td class="mono" style="font-size:12px;color:var(--ink-3)">${fmtDate(c.last_synced_at)}</td>
                <td>
                  <label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;cursor:pointer">
                    <input type="checkbox" data-toggle-active ${+c.is_active === 1 ? "checked" : ""} style="accent-color:var(--brand)" />
                    ${+c.is_active === 1 ? "Bật" : "Tắt"}
                  </label>
                </td>
                <td class="num">
                  <div style="display:inline-flex;gap:6px">
                    <button class="iconbtn-sq" data-action="sync-one" title="Đồng bộ">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18 2v5h-5"/><path d="M6 22v-5h5"/></svg>
                    </button>
                    <button class="iconbtn-sq" data-action="disconnect" title="Ngắt kết nối" style="color:var(--neg)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                    </button>
                  </div>
                </td>
              </tr>`).join("")}
            </tbody>
          </table>`
          : `<div style="padding:24px;text-align:center;color:var(--ink-3);font-weight:600">Chưa có shop/account nào. Hãy nhập thông tin ứng dụng và bấm "Cấp quyền" để bắt đầu.</div>`}
      </div>`;
  }

  function platformPane(platformKey) {
    if (local.loading[platformKey] && !local.data[platformKey]) {
      return `<div class="card card-pad" style="text-align:center;color:var(--ink-3);font-weight:600">${t("common.loading")}</div>`;
    }
    const d = local.data[platformKey];
    if (d && d._error) {
      return `<div class="card card-pad" style="color:var(--neg);font-weight:700">${t("common.error")}: ${d._error}</div>`;
    }
    return credentialsCard(platformKey) + connectionsCard(platformKey);
  }

  function render() {
    return `${flashMsg()}${tabBar()}${platformPane(local.tab)}`;
  }

  /* ── handlers ───────────────────────────────────────────── */

  async function onSaveCreds() {
    if (local.saving) return;
    const cfg = CONFIGS[local.tab];
    const body = { action: "save_credentials" };
    document.querySelectorAll("[data-cred]").forEach((inp) => {
      const k = inp.dataset.cred;
      const v = inp.value;
      if (v !== "") body[k] = (inp.type === "number") ? +v : v;
    });
    local.saving = true;
    try {
      await postAction(local.tab, body);
      showMsg("ok", "Đã lưu thông tin " + cfg.label + ".");
      await fetchStatus(local.tab);
      window.App.rerender();
    } catch (e) {
      showMsg("err", "${t("common.error")}: " + (e.message || e));
    } finally { local.saving = false; }
  }

  async function onGetAuthUrl() {
    try {
      const j = await postAction(local.tab, { action: "get_auth_url" });
      if (j.auth_url) {
        if (confirm("Mở trang cấp quyền " + CONFIGS[local.tab].label + " trong tab mới?")) {
          window.open(j.auth_url, "_blank", "noopener");
        }
      } else {
        showMsg("err", "Không nhận được URL cấp quyền.");
      }
    } catch (e) {
      showMsg("err", "${t("common.error")}: " + (e.message || e));
    }
  }

  async function onSyncAll() {
    if (!confirm("Đồng bộ tất cả " + CONFIGS[local.tab].label + " đang bật?")) return;
    try {
      const j = await postAction(local.tab, { action: "sync" });
      const ok = (j.results || []).filter((r) => r.success).length;
      const total = (j.results || []).length;
      showMsg(ok === total ? "ok" : "err", "Đồng bộ: " + ok + "/" + total + " thành công.");
      await fetchStatus(local.tab);
      window.App.rerender();
    } catch (e) {
      showMsg("err", "Lỗi sync: " + (e.message || e));
    }
  }

  async function onRowAction(row, action) {
    const cfg = CONFIGS[local.tab];
    const idF = cfg.statusKeys.listIdField;
    const id = +row.dataset.id;
    try {
      if (action === "sync-one") {
        const j = await postAction(local.tab, { action: "sync", [idF]: id });
        const r = (j.results || [])[0];
        if (r && r.success) showMsg("ok", "Đã đồng bộ.");
        else showMsg("err", "${t("common.error")}: " + ((r && r.error) || "không rõ"));
      } else if (action === "disconnect") {
        if (!confirm("Ngắt kết nối " + id + "?")) return;
        await postAction(local.tab, { action: "disconnect", [idF]: id });
        showMsg("ok", "Đã ngắt kết nối.");
      }
      await fetchStatus(local.tab);
      window.App.rerender();
    } catch (e) {
      showMsg("err", "${t("common.error")}: " + (e.message || e));
    }
  }

  async function onToggleActive(row, checked) {
    const idF = CONFIGS[local.tab].statusKeys.listIdField;
    try {
      await postAction(local.tab, { action: "toggle_active", [idF]: +row.dataset.id, is_active: checked ? 1 : 0 });
      await fetchStatus(local.tab);
      window.App.rerender();
    } catch (e) {
      showMsg("err", "${t("common.error")}: " + (e.message || e));
    }
  }

  async function onSetSyncFrom(row, value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const idF = CONFIGS[local.tab].statusKeys.listIdField;
    try {
      await postAction(local.tab, { action: "set_sync_from", [idF]: +row.dataset.id, sync_from_date: value });
      showMsg("ok", "Đã cập nhật ngày đồng bộ.");
    } catch (e) {
      showMsg("err", "${t("common.error")}: " + (e.message || e));
    }
  }

  function bind() {
    document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
      local.tab = b.dataset.tab;
      // lazy-load other tabs on first switch
      if (local.loading[local.tab] && !local.data[local.tab]) {
        fetchStatus(local.tab).then(() => window.App.rerender());
      } else {
        window.App.rerender();
      }
    }));
    document.querySelector('[data-action="save-creds"]')?.addEventListener("click", onSaveCreds);
    document.querySelector('[data-action="get-auth-url"]')?.addEventListener("click", onGetAuthUrl);
    document.querySelector('[data-action="sync-all"]')?.addEventListener("click", onSyncAll);
    document.querySelectorAll("tr[data-id]").forEach((row) => {
      row.querySelector('[data-action="sync-one"]')?.addEventListener("click", () => onRowAction(row, "sync-one"));
      row.querySelector('[data-action="disconnect"]')?.addEventListener("click", () => onRowAction(row, "disconnect"));
      row.querySelector('[data-toggle-active]')?.addEventListener("change", (e) => onToggleActive(row, e.target.checked));
      row.querySelector('[data-sync-from-input]')?.addEventListener("change", (e) => onSetSyncFrom(row, e.target.value));
    });
  }

  function mount() {
    if (local.loading[local.tab] && !local.data[local.tab]) {
      fetchStatus(local.tab).then(() => window.App.rerender());
      return;
    }
    bind();
  }

  window.Views.connect = {
    titleKey: "page.connect.title",
    eyebrowKey: "page.connect.eyebrow",
    customToolbar: true,
    render,
    mount,
  };
})();
