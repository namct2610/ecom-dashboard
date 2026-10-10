/* ============================================================
   View: Connect (Kết nối sàn) — 3.7 redesign
   No tabs: the three platforms sit side by side with their state and
   main action; the app credentials form opens only when needed; every
   shop of every platform is in one table, expiring tokens in amber.
   Reuses:
     /api/shopee-connect.php  /api/lazada-connect.php  /api/tiktok-connect.php
   ============================================================ */
(function () {
  const UI = window.UI;
  const esc = UI.esc;
  const _tf = (k, v) => (window.tf ? window.tf(k, v) : k);
  const WARN_DAYS = 7;   // a token this close to expiry is flagged

  const CONFIGS = {
    shopee: {
      label: "Shopee", css: "shopee", ini: "S",
      api: "api/shopee-connect.php",
      credentials: [
        { key: "partner_id", labelKey: "connect.label.partner_id", type: "number", placeholderKey: "connect.placeholder.partner_id" },
        { key: "partner_key", labelKey: "connect.label.partner_key", type: "password", placeholderKey: "connect.placeholder.partner_key" },
      ],
      keyName: "partner_id", keyLabelKey: "connect.label.partner_id", hasSecretFlag: "has_key",
      listKey: "shops", idField: "shop_id", nameField: "shop_name",
      oauthHintKey: "connect.hint.shopee",
    },
    lazada: {
      label: "Lazada", css: "lazada", ini: "L",
      api: "api/lazada-connect.php",
      credentials: [
        { key: "app_key", labelKey: "connect.label.app_key", type: "text", placeholderKey: "connect.placeholder.lazada_app_key" },
        { key: "app_secret", labelKey: "connect.label.app_secret", type: "password", placeholderKey: "connect.placeholder.lazada_app_secret" },
      ],
      keyName: "app_key", keyLabelKey: "connect.label.app_key", hasSecretFlag: "has_secret",
      listKey: "accounts", idField: "account_id", nameField: "account_name",
      oauthHintKey: "connect.hint.lazada",
    },
    tiktokshop: {
      label: "TikTok Shop", css: "tiktok", ini: "T",
      api: "api/tiktok-connect.php",
      credentials: [
        { key: "app_key", labelKey: "connect.label.app_key", type: "text", placeholderKey: "connect.placeholder.tiktok_app_key" },
        { key: "app_secret", labelKey: "connect.label.app_secret", type: "password", placeholderKey: "connect.placeholder.tiktok_app_secret" },
      ],
      keyName: "app_key", keyLabelKey: "connect.label.app_key", hasSecretFlag: "has_secret",
      listKey: "shops", idField: "shop_id", nameField: "shop_name",
      oauthHintKey: "connect.hint.tiktok",
    },
  };
  const PKEYS = ["shopee", "lazada", "tiktokshop"];

  const local = {
    loaded: false,
    data: { shopee: null, lazada: null, tiktokshop: null },
    edit: null,      // platform whose credentials form is open
    csrf: "",
    saving: false,
    syncing: false,
    msg: null,
  };

  function parseDT(s) {
    if (!s) return null;
    const d = new Date(String(s).replace(" ", "T"));
    return isNaN(d) ? null : d;
  }
  // "08/10 06:00" — the year only when it is not this year.
  function fmtShort(s) {
    const d = parseDT(s);
    if (!d) return "—";
    const p = (n) => String(n).padStart(2, "0");
    const same = d.getFullYear() === new Date().getFullYear();
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + (same ? "" : "/" + d.getFullYear()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function fmtDateShort(s) {
    if (!s) return "—";
    const [y, m, d] = String(s).slice(0, 10).split("-");
    return y && m && d ? d + "/" + m + "/" + y : s;
  }
  function showMsg(kind, text) {
    local.msg = { kind, text };
    window.App.rerender();
    setTimeout(() => { local.msg = null; window.App.rerender(); }, 4500);
  }

  async function ensureAuth() {
    if (local.csrf) return;
    try {
      const auth = await (await fetch("api/auth.php", { credentials: "same-origin" })).json();
      local.csrf = auth.csrf || "";
    } catch (_) { local.csrf = ""; }
  }

  async function fetchStatus(pk) {
    try {
      const r = await fetch(CONFIGS[pk].api + "?action=status", { credentials: "same-origin" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "HTTP " + r.status);
      local.data[pk] = j;
    } catch (e) {
      local.data[pk] = { _error: e.message || String(e) };
    }
  }
  async function fetchAll() {
    await ensureAuth();
    await Promise.all(PKEYS.map(fetchStatus));
    local.loaded = true;
  }

  async function postAction(pk, body) {
    await ensureAuth();
    const r = await fetch(CONFIGS[pk].api, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.success) throw new Error(j.error || "HTTP " + r.status);
    return j;
  }

  /* ── derived state ───────────────────────────────────────── */

  const listOf = (pk) => ((local.data[pk] || {})[CONFIGS[pk].listKey] || []);
  const isOn = (c) => +c.is_active === 1;
  const configured = (pk) => { const d = local.data[pk] || {}; return !!(d[CONFIGS[pk].keyName] && d[CONFIGS[pk].hasSecretFlag]); };

  // Days left on the refresh token (the one that forces a new authorisation);
  // the access token renews itself on every sync.
  function tokenDays(c) {
    const d = parseDT(c.refresh_token_expire_at || c.access_token_expire_at);
    return d ? Math.floor((d - Date.now()) / 86400000) : null;
  }
  function tokenPill(c) {
    if (!isOn(c)) return `<span class="sys-pill is-mute">${t("connect.tk.paused")}</span>`;
    const n = tokenDays(c);
    if (n == null) return `<span class="sys-pill is-mute">—</span>`;
    if (n < 0) return `<span class="sys-pill is-neg">${t("connect.tk.expired")}</span>`;
    if (n <= WARN_DAYS) return `<span class="sys-pill is-warn">${_tf("connect.tk.expires_in", { n })}</span>`;
    return `<span class="sys-pill is-pos">${_tf("connect.tk.left", { n })}</span>`;
  }

  // One line of state + the main action for a platform card.
  function platState(pk) {
    const d = local.data[pk] || {};
    if (d._error) return { tone: "neg", text: t("common.error"), cta: "connect.cta.retry", act: "reload", kind: "" };
    if (!configured(pk)) return { tone: "mute", text: t("connect.st.not_configured"), cta: "connect.cta.setup", act: "edit", kind: "on" };
    const list = listOf(pk);
    if (!list.length) return { tone: "mute", text: t("connect.st.no_shop"), cta: "connect.cta.authorize", act: "auth", kind: "on" };
    const on = list.filter(isOn);
    const days = on.map(tokenDays).filter((n) => n != null);
    const worst = days.length ? Math.min(...days) : null;
    if (worst != null && worst < 0) return { tone: "neg", text: t("connect.st.expired"), cta: "connect.cta.reauthorize", act: "auth", kind: "is-dark" };
    if (worst != null && worst <= WARN_DAYS) return { tone: "warn", text: _tf("connect.st.expires_in", { n: worst }), cta: "connect.cta.reauthorize", act: "auth", kind: "is-dark" };
    const unit = pk === "lazada" ? "connect.st.accounts" : "connect.st.shops";
    return { tone: "pos", text: _tf(unit, { n: list.length, on: on.length }), cta: pk === "lazada" ? "connect.cta.add_account" : "connect.cta.add_shop", act: "auth", kind: "" };
  }

  /* ── HTML ───────────────────────────────────────────────── */

  function platCard(pk) {
    const cfg = CONFIGS[pk], d = local.data[pk] || {}, s = platState(pk);
    const last = listOf(pk).map((c) => c.last_synced_at).filter(Boolean).sort().pop();
    const appVal = d[cfg.keyName] ? `${t(cfg.keyLabelKey)} ${esc(d[cfg.keyName])}` : "—";
    const open = local.edit === pk;
    return `<div class="card pcard2${open ? " on" : ""}">
      <div style="display:flex;align-items:center;gap:12px">
        <span class="plogo2" style="background:var(--${cfg.css})">${cfg.ini}</span>
        <div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:800">${cfg.label}</div><div class="pst is-${s.tone}"><i></i>${esc(s.text)}</div></div>
      </div>
      <div class="kv">
        <div><span>${t("connect.app")}</span><span class="nm" style="font-weight:600;font-size:12.5px">${appVal}</span></div>
        <div><span>${t("connect.last_sync")}</span><span class="tnum">${fmtShort(last)}</span></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:auto">
        <button type="button" class="ctrl-btn sys-btn ${s.kind}" style="flex:1 1 0" data-plat-act="${s.act}" data-pk="${pk}">${t(s.cta)}</button>
        <button type="button" class="ctrl-btn sys-sq${open ? " on-ink" : ""}" data-plat-act="edit" data-pk="${pk}" aria-label="${esc(t("connect.app_info"))}" aria-expanded="${open}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7H10M7 7H3M21 17h-4M14 17H3M7 4v6M17 14v6"/></svg></button>
      </div>
    </div>`;
  }

  function editCard() {
    const pk = local.edit;
    if (!pk) return "";
    const cfg = CONFIGS[pk], d = local.data[pk] || {};
    return `<div class="card" id="credCard">
      <div class="card-head ch" style="align-items:center">
        <div class="ch-title">${UI.pdot(cfg.css)}<div class="card-title">${_tf("connect.cred.title", { label: cfg.label })}</div></div>
        <button type="button" class="sys-x" id="credClose" aria-label="${esc(t("common.close"))}" style="color:var(--ink-3)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="cred-grid">
        ${cfg.credentials.map((f) => {
          const val = f.type === "password" ? "" : (d[f.key] || "");
          const saved = f.type === "password" && d[cfg.hasSecretFlag];
          return `<label class="fld">${t(f.labelKey)}${saved ? ` <span style="color:var(--pos)">${t("connect.saved_badge")}</span>` : ""}
            <input class="v2-input" data-cred="${f.key}" type="${f.type}" autocomplete="off" placeholder="${esc(saved ? t("connect.placeholder.keep_secret") : t(f.placeholderKey))}" value="${esc(val)}"></label>`;
        }).join("")}
        <div class="cred-acts">
          <button type="button" class="ctrl-btn sys-btn" data-cred-act="save" ${local.saving ? "disabled" : ""}>${t("common.save")}</button>
          <button type="button" class="ctrl-btn sys-btn on" data-cred-act="save-auth" ${local.saving ? "disabled" : ""}>${t("connect.save_auth_btn")}</button>
        </div>
      </div>
      <div class="sub3" style="padding:0 20px 18px;font-size:12.5px;line-height:1.5;text-wrap:pretty">${t(cfg.oauthHintKey)}</div>
    </div>`;
  }

  function shopsCard() {
    const rows = [];
    PKEYS.forEach((pk) => listOf(pk).forEach((c) => rows.push({ pk, c })));
    const nOn = rows.filter((r) => isOn(r.c)).length;
    const syncBtn = rows.length
      ? `<button type="button" class="ctrl-btn sys-btn is-dark" id="syncAllBtn" ${local.syncing ? "disabled" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M18 2v5h-5M6 22v-5h5"/></svg>${local.syncing ? t("connect.syncing") : t("common.sync_all")}</button>`
      : "";
    const title = `${t("connect.shops.title")}<span class="lab3" style="font-size:12.5px;margin-left:6px">${rows.length ? _tf("connect.shops.sum", { n: rows.length, on: nOn }) : ""}</span>`;
    if (!rows.length) {
      return `<div class="card">${UI.head(title, t("connect.shops.tip"), "", { w: "280px" })}<div class="empty-chart">${t("connect.list.empty")}</div></div>`;
    }
    const sw = (c) => `<button type="button" class="sw-btn" data-row-act="toggle" role="switch" aria-checked="${isOn(c)}"><span class="sw${isOn(c) ? " on" : ""}"><i></i></span><span class="only-wide">${isOn(c) ? t("common.enabled") : t("common.disabled")}</span></button>`;
    const fromBtn = (c) => `<button type="button" class="from-btn tnum" data-row-act="from" data-value="${esc(c.sync_from_date || "")}">${c.sync_from_date ? fmtDateShort(c.sync_from_date) : t("connect.pick_date")}</button>`;
    const attrs = (pk, c) => `data-pk="${pk}" data-id="${esc(c[CONFIGS[pk].idField])}"`;
    const nameOf = (pk, c) => esc(c[CONFIGS[pk].nameField] || c[CONFIGS[pk].idField]);
    const cols = "minmax(0,1.6fr) 110px 110px 120px minmax(0,1fr) 110px 88px";
    const wide = rows.map(({ pk, c }) => `<div class="gt-row shop-row${isOn(c) ? "" : " off"}" ${attrs(pk, c)} style="padding:11px 20px;font-size:13px">
        <div class="dim" style="min-width:0"><div class="nm" style="font-weight:700;font-size:13px">${nameOf(pk, c)}</div><div class="mono" style="font-size:11px;color:var(--ink-3)">${esc(c[CONFIGS[pk].idField])}${c.country || c.region ? " · " + esc(c.country || c.region) : ""}</div></div>
        <span class="pname-dot dim" style="font-size:12.5px;font-weight:600">${UI.pdot(CONFIGS[pk].css)}${CONFIGS[pk].label === "TikTok Shop" ? "TikTok" : CONFIGS[pk].label}</span>
        <span class="dim">${fromBtn(c)}</span>
        <span class="tnum dim" style="color:var(--ink-2);font-weight:600">${fmtShort(c.last_synced_at)}</span>
        <span class="dim">${tokenPill(c)}</span>
        ${sw(c)}
        <div style="display:flex;gap:4px;justify-content:flex-end">
          <button type="button" class="ctrl-btn sys-sq sm" data-row-act="sync" aria-label="${esc(t("common.sync"))}" title="${esc(t("common.sync"))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M18 2v5h-5M6 22v-5h5"/></svg></button>
          <button type="button" class="ctrl-btn sys-sq sm danger" data-row-act="disconnect" aria-label="${esc(t("common.disconnect"))}" title="${esc(t("common.disconnect"))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
        </div>
      </div>`).join("");
    const narrow = rows.map(({ pk, c }) => `<div class="mrow shop-row${isOn(c) ? "" : " off"}" ${attrs(pk, c)} style="gap:9px">
        <div style="display:flex;align-items:center;gap:10px">${UI.pdot(CONFIGS[pk].css)}
          <div class="dim" style="flex:1;min-width:0"><div class="nm" style="font-weight:700">${nameOf(pk, c)}</div><div class="sub3" style="font-size:11.5px">${CONFIGS[pk].label} · ${esc(c[CONFIGS[pk].idField])}</div></div>
          ${sw(c)}
        </div>
        <div class="dim" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;font-size:12px;font-weight:600;color:var(--ink-3)">
          <span>${t("connect.from")} ${fromBtn(c)}</span><span>${t("connect.last")} <b style="color:var(--ink)">${fmtShort(c.last_synced_at)}</b></span>${tokenPill(c)}
        </div>
        <div style="display:flex;gap:8px">
          <button type="button" class="ctrl-btn sys-btn" style="flex:1" data-row-act="sync">${t("common.sync")}</button>
          <button type="button" class="ctrl-btn sys-btn" style="flex:1;color:var(--neg)" data-row-act="disconnect">${t("common.disconnect")}</button>
        </div>
      </div>`).join("");
    return `<div class="card">
      ${UI.head(title, t("connect.shops.tip"), syncBtn, { w: "280px" })}
      <div class="gt only-wide" style="--cols:${cols};padding:10px 0 8px">
        <div class="gt-head" style="padding:8px 20px"><span>${t("connect.col.shop")}</span><span>${t("th.platform")}</span><span>${t("th.sync_from")}</span><span>${t("th.last_synced")}</span><span>${t("connect.col.token")}</span><span>${t("th.status")}</span><span></span></div>
        ${wide}
      </div>
      <div class="only-narrow" style="padding:4px 0">${narrow}</div>
    </div>`;
  }

  function render() {
    if (!local.loaded) return `${UI.skelPage()}`;
    return `<div class="pg">
      ${UI.flashMsg(local.msg)}
      <div class="plat3">${PKEYS.map(platCard).join("")}</div>
      ${editCard()}
      ${shopsCard()}
    </div>`;
  }

  /* ── handlers ───────────────────────────────────────────── */

  // Same id handling as the old tabs: numeric ids go back as numbers.
  const idVal = (raw) => (/^\d+$/.test(raw) && Number.isSafeInteger(+raw) ? +raw : raw);

  async function saveCreds(root) {
    const pk = local.edit;
    if (!pk || local.saving) return false;
    const body = { action: "save_credentials" };
    root.querySelectorAll("[data-cred]").forEach((inp) => {
      if (inp.value !== "") body[inp.dataset.cred] = inp.type === "number" ? +inp.value : inp.value;
    });
    local.saving = true; window.App.rerender();
    try {
      await postAction(pk, body);
      await fetchStatus(pk);
      showMsg("ok", _tf("connect.saved", { label: CONFIGS[pk].label }));
      return true;
    } catch (e) {
      showMsg("err", t("common.error") + ": " + (e.message || e));
      return false;
    } finally {
      local.saving = false; window.App.rerender();
    }
  }

  async function authorize(pk) {
    try {
      const j = await postAction(pk, { action: "get_auth_url" });
      if (!j.auth_url) { showMsg("err", t("connect.no_auth_url")); return; }
      if (confirm(_tf("connect.open_oauth", { label: CONFIGS[pk].label }))) {
        // Redirect current page — keeps the session cookie intact so the
        // OAuth callback can verify state. Opening a new tab risks the
        // callback landing in a tab the user isn't watching.
        window.location.href = j.auth_url;
      }
    } catch (e) {
      showMsg("err", t("common.error") + ": " + (e.message || e));
    }
  }

  async function syncAll() {
    const pks = PKEYS.filter((pk) => listOf(pk).some(isOn));
    if (!pks.length || local.syncing) return;
    if (!confirm(t("connect.confirm_sync_all_plats"))) return;
    local.syncing = true; window.App.rerender();
    let ok = 0, total = 0;
    const errs = [];
    for (const pk of pks) {
      try {
        const j = await postAction(pk, { action: "sync" });
        (j.results || []).forEach((r) => { total++; if (r.success) ok++; });
      } catch (e) {
        errs.push(CONFIGS[pk].label + ": " + (e.message || e));
      }
    }
    await Promise.all(pks.map(fetchStatus));
    local.syncing = false;
    showMsg(ok === total && !errs.length ? "ok" : "err", _tf("connect.sync_result", { ok, total }) + (errs.length ? " · " + errs.join(" · ") : ""));
  }

  async function rowAction(row, act, btn) {
    const pk = row.dataset.pk, cfg = CONFIGS[pk], id = idVal(row.dataset.id);
    const item = listOf(pk).find((c) => String(c[cfg.idField]) === row.dataset.id);
    if (act === "from") {
      if (!window.DatePicker) return;
      window.DatePicker.open(btn, btn.dataset.value || "", async (val) => {
        if (val !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(val)) return;
        try {
          await postAction(pk, { action: "set_sync_from", [cfg.idField]: id, sync_from_date: val });
          if (item) item.sync_from_date = val || null;
          showMsg("ok", t("connect.sync_from_updated"));
        } catch (e) {
          showMsg("err", t("common.error") + ": " + (e.message || e));
        }
      });
      return;
    }
    try {
      if (act === "toggle") {
        await postAction(pk, { action: "toggle_active", [cfg.idField]: id, is_active: item && isOn(item) ? 0 : 1 });
      } else if (act === "sync") {
        btn.disabled = true;
        const j = await postAction(pk, { action: "sync", [cfg.idField]: id });
        const r = (j.results || [])[0];
        if (r && r.success) showMsg("ok", t("connect.synced_one"));
        else showMsg("err", t("common.error") + ": " + ((r && r.error) || t("common.unknown")));
      } else if (act === "disconnect") {
        if (!confirm(_tf("connect.disconnect_confirm", { id: row.dataset.id }))) return;
        await postAction(pk, { action: "disconnect", [cfg.idField]: id });
        showMsg("ok", t("connect.disconnected"));
      }
      await fetchStatus(pk);
      window.App.rerender();
    } catch (e) {
      showMsg("err", t("common.error") + ": " + (e.message || e));
    }
  }

  function bind(root) {
    root.querySelectorAll("[data-plat-act]").forEach((b) => b.addEventListener("click", async () => {
      const pk = b.dataset.pk, act = b.dataset.platAct;
      if (act === "edit") {
        local.edit = local.edit === pk ? null : pk;
        window.App.rerender();
        if (local.edit) document.getElementById("credCard")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else if (act === "auth") {
        authorize(pk);
      } else if (act === "reload") {
        await fetchStatus(pk); window.App.rerender();
      }
    }));
    root.querySelector("#credClose")?.addEventListener("click", () => { local.edit = null; window.App.rerender(); });
    root.querySelectorAll("[data-cred-act]").forEach((b) => b.addEventListener("click", async () => {
      const pk = local.edit;
      const ok = await saveCreds(root);
      if (ok && b.dataset.credAct === "save-auth") authorize(pk);
    }));
    root.querySelector("#syncAllBtn")?.addEventListener("click", syncAll);
    root.querySelectorAll(".shop-row").forEach((row) => row.addEventListener("click", (e) => {
      const b = e.target.closest("[data-row-act]");
      if (!b) return;
      e.stopPropagation();
      rowAction(row, b.dataset.rowAct, b);
    }));
  }

  let _oauthFlashShown = false;

  function mount(root) {
    // After an OAuth redirect, say which platform was just connected. Clean
    // the URL *before* showMsg, or rerender → mount → showMsg loops.
    if (!_oauthFlashShown) {
      const params = new URLSearchParams(window.location.search);
      const okMap = { shopee_connected: "shopee", lazada_connected: "lazada", tiktok_connected: "tiktokshop" };
      const errMap = { shopee_error: "shopee", lazada_error: "lazada", tiktok_error: "tiktokshop" };
      let kind = null, text = null;
      for (const [param, pk] of Object.entries(okMap)) {
        if (!params.has(param)) continue;
        const n = parseInt(params.get(param), 10);
        const msg = isNaN(n) || n <= 1
          ? t(pk === "lazada" ? "connect.connected_account" : "connect.connected_shop")
          : _tf("connect.connected_shops", { n });
        kind = "ok"; text = CONFIGS[pk].label + ": " + msg;
        break;
      }
      if (!kind) {
        for (const [param, pk] of Object.entries(errMap)) {
          if (!params.has(param)) continue;
          kind = "err"; text = CONFIGS[pk].label + ": " + params.get(param);
          break;
        }
      }
      if (kind) {
        _oauthFlashShown = true;
        history.replaceState(null, "", window.location.pathname + window.location.hash);
        local.loaded = false;
        fetchAll().then(() => showMsg(kind, text));
        return;
      }
    }
    if (!local.loaded) {
      fetchAll().then(() => window.App.rerender());
      return;
    }
    bind(root);
  }

  window.Views.connect = {
    titleKey: "page.connect.title",
    eyebrowKey: "page.connect.eyebrow",
    customToolbar: true,
    render,
    mount,
  };
})();
