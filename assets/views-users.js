/* ============================================================
   View: Users (Người dùng) — admin only — 3.7 redesign
   The 4 summary tiles became one line; accounts are edited in a
   panel beside the list (desktop) or a sheet from the bottom
   (phone) instead of a modal dialog.
   Reuses /api/users.php (GET list, POST create/update/delete)
   ============================================================ */
(function () {
  const UI = window.UI;
  const esc = UI.esc;
  const _tf = (k, v) => (window.tf ? window.tf(k, v) : k);
  const local = {
    loading: true,
    error: null,
    isAdmin: false,
    csrf: "",
    currentUserId: 0,
    users: [],
    summary: { total: 0, active: 0, admins: 0 },
    filter: "all",
    query: "",
    saving: false,
    msg: null,
    edit: null,   // null | { mode:'create'|'edit', id, username, full_name, role, is_active, must_change_password, password }
  };

  async function fetchInitial() {
    local.error = null;
    try {
      const auth = await (await fetch("api/auth.php", { credentials: "same-origin" })).json();
      local.csrf = auth.csrf || "";
      local.isAdmin = (auth.user && auth.user.role === "admin") || auth.role === "admin";
      if (!local.isAdmin) return;
      const r = await fetch("api/users.php", { credentials: "same-origin" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "HTTP " + r.status);
      local.users = j.users || [];
      local.summary = j.summary || local.summary;
      local.currentUserId = j.current_user_id || 0;
    } catch (e) {
      local.error = e.message || String(e);
    } finally {
      local.loading = false;
    }
  }

  function showMsg(kind, text) {
    local.msg = { kind, text };
    rerender();
    setTimeout(() => { local.msg = null; rerender(); }, 4000);
  }

  function fmtDateTime(s) {
    if (!s) return "";
    const d = new Date(String(s).replace(" ", "T"));
    if (isNaN(d)) return s;
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }
  const initials = (u) => String(u || "?").replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
  const avCls = (role, active) => (!active ? "is-off" : role === "admin" ? "is-admin" : "is-staff");
  const matches = (u, q) => !q || (u.username + " " + (u.full_name || "")).toLowerCase().includes(q);

  /* ── list ─────────────────────────────────────────────────── */

  function userRow(u) {
    const self = u.id === local.currentUserId;
    const sel = local.edit && local.edit.mode === "edit" && local.edit.id === u.id;
    const flag = !u.is_active ? `<span class="sys-pill is-mute">${t("users.flag.locked")}</span>`
      : u.must_change_password ? `<span class="sys-pill is-warn">${t("users.flag.must_change")}</span>` : "";
    const last = u.last_login_at ? fmtDateTime(u.last_login_at) : t("users.never");
    return `<button type="button" class="urow${sel ? " sel" : ""}${u.is_active ? "" : " off"}" data-uid="${u.id}" data-q="${esc((u.username + " " + (u.full_name || "")).toLowerCase())}">
      <span class="uav ${avCls(u.role, u.is_active)}">${esc(initials(u.username))}</span>
      <span style="min-width:0;display:flex;flex-direction:column;gap:1px">
        <span class="nm" style="font-weight:700">${esc(u.username)}${self ? ` <span class="sub3" style="font-size:11px">(${t("common.you")})</span>` : ""}</span>
        <span class="sub3 nm"><span>${esc(u.full_name || "—")}</span><span class="only-narrow-i"> · ${esc(u.last_login_at ? last.slice(0, 5) : last)}</span></span>
      </span>
      <span class="upills"><span class="sys-pill ${u.role === "admin" ? "is-brand" : "is-mute"}">${t(u.role === "admin" ? "role.admin" : "role.staff")}</span>${flag}</span>
      <span class="ulast only-wide tnum">${esc(last)}</span>
    </button>`;
  }

  function listCard() {
    const q = local.query.trim().toLowerCase();
    const list = local.users.filter((u) => (local.filter === "all" || u.role === local.filter) && matches(u, q));
    const s = local.summary;
    return `<div class="card ulist">
      <div class="card-head ch">
        <div style="flex:1 1 auto;min-width:0"><div class="card-title">${t("users.title")}</div><div class="sub3" style="font-size:12.5px">${_tf("users.sum", { n: s.total, a: s.active, ad: s.admins })}</div></div>
        <button type="button" class="ctrl-btn on sys-btn" id="btnNewUser"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>${t("users.new_btn")}</button>
      </div>
      <div class="ubar">
        ${UI.seg("userFilter", [["all", t("common.all")], ["admin", t("role.admin")], ["staff", t("role.staff")]], local.filter)}
        <label class="usearch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M21 21l-4.3-4.3"/></svg><input type="search" id="userSearch" value="${esc(local.query)}" placeholder="${esc(t("users.search"))}" aria-label="${esc(t("users.search"))}"></label>
      </div>
      <div class="ulist-rows" id="userRows">
        ${list.length ? list.map(userRow).join("") : ""}
        <div class="empty-chart" id="userEmpty"${list.length ? " hidden" : ""}>${t(local.users.length ? "users.no_match" : "users.empty")}</div>
      </div>
    </div>`;
  }

  /* ── edit panel / sheet ───────────────────────────────────── */

  function panel() {
    const e = local.edit;
    if (!e) return "";
    const isNew = e.mode === "create";
    const base = isNew ? null : local.users.find((u) => u.id === e.id);
    const self = !isNew && e.id === local.currentUserId;
    const sub = isNew ? t("users.panel.new_sub") : _tf("users.panel.last", { d: base && base.last_login_at ? fmtDateTime(base.last_login_at) : t("users.never_short") });
    const roleBtn = (k, lk, dk) => `<button type="button" class="role-opt${e.role === k ? " on" : ""}" data-role="${k}" ${self ? "disabled" : ""}><b>${t(lk)}</b><span>${t(dk)}</span></button>`;
    return `<div class="upanel-wrap" id="userPanelWrap">
      <div class="upanel card" role="dialog" aria-modal="false" aria-labelledby="upTitle">
        <div class="up-head">
          <span class="uav lg ${isNew ? "is-new" : avCls(e.role, e.is_active)}">${isNew ? "+" : esc(initials(e.username))}</span>
          <div style="flex:1;min-width:0"><div class="nm" style="font-size:15px;font-weight:800" id="upTitle">${isNew ? t("users.modal.create_title") : esc(e.username)}</div><div class="sub3">${esc(sub)}</div></div>
          <button type="button" class="sys-x" data-close aria-label="${esc(t("common.close"))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="up-body">
          ${isNew ? `<label class="fld">${t("th.username")}<input class="v2-input" id="umUsername" type="text" autocomplete="off" value="${esc(e.username)}" placeholder="${esc(t("users.modal.placeholder.username"))}"><span class="field-hint" style="margin:0">${t("users.modal.username_hint")}</span></label>` : ""}
          <label class="fld">${t("settings.account.full_name")}<input class="v2-input" id="umFullName" type="text" value="${esc(e.full_name)}"></label>
          <div class="fld">${t("users.modal.role")}<div class="role-grid">${roleBtn("admin", "role.admin", "users.role.admin_desc")}${roleBtn("staff", "role.staff", "users.role.staff_desc")}</div></div>
          <button type="button" class="tgl-row" id="umActive" ${self ? "disabled" : ""}>
            <span style="flex:1"><b>${t("users.active.title")}</b><span>${t(self ? "users.active.self" : "users.active.desc")}</span></span>
            <span class="sw lg${e.is_active ? " on" : ""}"><i></i></span>
          </button>
          <div class="up-pwd">
            <label class="fld">${t(isNew ? "users.modal.pwd_set" : "users.modal.pwd_keep")}<input class="v2-input" id="umPassword" type="password" autocomplete="new-password" value="${esc(e.password)}"></label>
            <button type="button" class="ck-row" id="umMust"><span class="ck${e.must_change_password ? " on" : ""}"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>${t("users.modal.must_change_pwd")}</button>
          </div>
        </div>
        <div class="up-foot">
          ${!isNew && !self ? `<button type="button" class="ctrl-btn sys-btn danger-txt" id="umDelete">${t("users.delete_btn")}</button>` : ""}
          <span style="flex:1"></span>
          <button type="button" class="ctrl-btn sys-btn" data-close>${t("common.cancel")}</button>
          <button type="button" class="ctrl-btn on sys-btn" id="umSave" ${local.saving ? "disabled" : ""}>${local.saving ? t("settings.account.saving") : t(isNew ? "users.modal.create_btn" : "users.modal.save_btn")}</button>
        </div>
      </div>
    </div>`;
  }

  function render() {
    if (local.loading) return `${UI.skelPage()}`;
    if (!local.isAdmin) return `<div class="card card-pad" style="color:var(--neg);font-weight:700">${t("users.admin_only")}</div>`;
    if (local.error) return `<div class="card card-pad" style="color:var(--neg);font-weight:700">${t("common.error")}: ${esc(local.error)}</div>`;
    return `<div class="pg">
      ${UI.flashMsg(local.msg)}
      <div class="users-lay${local.edit ? " has-panel" : ""}">${listCard()}${panel()}</div>
    </div>`;
  }

  /* ── interactions ────────────────────────────────────────── */

  // Keep what was typed when a button in the panel re-renders the page.
  function capture() {
    const e = local.edit;
    if (!e) return;
    const v = (id) => document.getElementById(id);
    if (v("umUsername")) e.username = v("umUsername").value;
    if (v("umFullName")) e.full_name = v("umFullName").value;
    if (v("umPassword")) e.password = v("umPassword").value;
  }
  function rerender() { capture(); window.App.rerender(); }

  function openCreate() {
    local.edit = { mode: "create", id: 0, username: "", full_name: "", role: "staff", is_active: true, must_change_password: true, password: "" };
    window.App.rerender();
    focusFirst();
  }
  function openEdit(id) {
    const u = local.users.find((x) => x.id === id);
    if (!u) return;
    local.edit = { mode: "edit", id: u.id, username: u.username, full_name: u.full_name || "", role: u.role, is_active: !!u.is_active, must_change_password: !!u.must_change_password, password: "" };
    window.App.rerender();
    focusFirst();
  }
  function focusFirst() {
    const el = document.getElementById("umUsername") || document.getElementById("umFullName");
    if (el && window.matchMedia("(min-width: 761px)").matches) el.focus();
  }
  function closePanel() { local.edit = null; window.App.rerender(); }

  async function post(body) {
    const r = await fetch("api/users.php", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok || !j.success) throw new Error(j.error || "HTTP " + r.status);
    return j;
  }

  async function saveUser() {
    capture();
    const e = local.edit;
    if (local.saving || !e) return;
    const isEdit = e.mode === "edit";
    const username = e.username.trim(), full_name = e.full_name.trim();
    if (!isEdit && !username) { showMsg("err", t("users.username_required")); return; }
    if (!isEdit && !e.password) { showMsg("err", t("users.password_required")); return; }
    local.saving = true; window.App.rerender();
    try {
      const common = { full_name, role: e.role, is_active: e.is_active, must_change_password: e.must_change_password, password: e.password };
      await post(isEdit ? { action: "update", id: e.id, ...common } : { action: "create", username, ...common });
      local.edit = null;
      await fetchInitial();
      showMsg("ok", isEdit ? t("users.updated") : t("users.created"));
    } catch (err) {
      showMsg("err", err.message || String(err));
    } finally {
      local.saving = false; rerender();
    }
  }

  async function delUser() {
    const e = local.edit;
    if (!e || e.mode !== "edit") return;
    if (!confirm(_tf("users.delete_confirm", { u: e.username }))) return;
    try {
      await post({ action: "delete", id: e.id });
      local.edit = null;
      await fetchInitial();
      showMsg("ok", t("users.deleted"));
    } catch (err) {
      showMsg("err", err.message || String(err));
    }
  }

  // Search filters the rows already on the page, so the box keeps focus.
  function applySearch(root) {
    const q = local.query.trim().toLowerCase();
    let shown = 0;
    root.querySelectorAll(".urow").forEach((r) => { const ok = !q || r.dataset.q.includes(q); r.hidden = !ok; if (ok) shown++; });
    const empty = root.querySelector("#userEmpty");
    if (empty) { empty.hidden = shown > 0; empty.textContent = t(local.users.length ? "users.no_match" : "users.empty"); }
  }

  let keyBound = false;
  function mount(root) {
    if (local.loading) { fetchInitial().then(() => window.App.rerender()); return; }
    root.querySelector("#btnNewUser")?.addEventListener("click", openCreate);
    root.querySelector("#userFilter")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { local.filter = b.dataset.k; rerender(); } });
    const search = root.querySelector("#userSearch");
    search?.addEventListener("input", () => { local.query = search.value; applySearch(root); });
    root.querySelector("#userRows")?.addEventListener("click", (e) => { const r = e.target.closest(".urow"); if (r) { capture(); openEdit(+r.dataset.uid); } });

    const wrap = root.querySelector("#userPanelWrap");
    if (wrap) {
      wrap.addEventListener("click", (e) => {
        if (e.target === wrap || e.target.closest("[data-close]")) { closePanel(); return; }
        const role = e.target.closest("[data-role]");
        if (role && !role.disabled) { local.edit.role = role.dataset.role; rerender(); return; }
        if (e.target.closest("#umActive") && !root.querySelector("#umActive").disabled) { local.edit.is_active = !local.edit.is_active; rerender(); return; }
        if (e.target.closest("#umMust")) { local.edit.must_change_password = !local.edit.must_change_password; rerender(); return; }
        if (e.target.closest("#umSave")) { saveUser(); return; }
        if (e.target.closest("#umDelete")) delUser();
      });
      wrap.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("input")) saveUser(); });
    }
    // The sheet covers the page on phones; stop the page scrolling under it.
    document.body.classList.toggle("sheet-open", !!local.edit);
    if (!keyBound) {
      keyBound = true;
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && local.edit && window.Store.state.page === "users") closePanel(); });
    }
  }

  window.Views.users = {
    titleKey: "page.users.title",
    eyebrowKey: "page.users.eyebrow",
    customToolbar: true,
    render,
    mount,
  };
})();
