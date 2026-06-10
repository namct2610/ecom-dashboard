/* ============================================================
   View: Users (Quản lý người dùng) — admin only
   Reuses /api/users.php (GET list, POST create/update/delete)
   ============================================================ */
(function () {
  const local = {
    loading: true,
    error: null,
    isAdmin: false,
    csrf: "",
    currentUserId: 0,
    users: [],
    summary: { total: 0, active: 0, admins: 0, last_login_at: null },
    saving: false,
    msg: null,
    edit: null,   // null | {mode:'create'|'edit', user}
  };

  async function fetchInitial() {
    local.loading = true; local.error = null;
    try {
      const auth = await (await fetch("../api/auth.php", { credentials: "same-origin" })).json();
      if (!auth.logged_in) { window.location.href = "../index.php#/login"; return; }
      local.csrf = auth.csrf || "";
      local.isAdmin = (auth.user && auth.user.role === "admin") || auth.role === "admin";
      if (!local.isAdmin) return;

      const r = await fetch("../api/users.php", { credentials: "same-origin" });
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
    window.App.rerender();
    setTimeout(() => { local.msg = null; window.App.rerender(); }, 4000);
  }

  function fmtDateTime(s) {
    if (!s) return "—";
    const d = new Date(s.replace(" ", "T"));
    if (isNaN(d)) return s;
    return d.toLocaleDateString("vi-VN") + " " + d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }

  function flashMsg() {
    if (!local.msg) return "";
    const isOk = local.msg.kind === "ok";
    const bg = isOk ? "color-mix(in oklch, var(--pos) 12%, transparent)" : "color-mix(in oklch, var(--neg) 12%, transparent)";
    const fg = isOk ? "var(--pos)" : "var(--neg)";
    return `<div style="padding:10px 14px;border-radius:var(--r-ctrl);background:${bg};color:${fg};font-weight:700;font-size:13px;margin-bottom:14px">${local.msg.text}</div>`;
  }

  function summaryRow() {
    return `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px">
        ${[
          { lab: "Tổng tài khoản", val: local.summary.total },
          { lab: "Đang hoạt động", val: local.summary.active },
          { lab: "Quản trị viên", val: local.summary.admins },
          { lab: "Lần đăng nhập gần nhất", val: fmtDateTime(local.summary.last_login_at) },
        ].map((k) => `
          <div class="card card-pad" style="padding:14px 16px">
            <div class="eyebrow">${k.lab}</div>
            <div class="tnum" style="font-weight:800;font-size:18px;margin-top:4px">${k.val}</div>
          </div>`).join("")}
      </div>`;
  }

  function rolePill(role) {
    if (role === "admin") return `<span class="status-pill" style="background:color-mix(in oklch, var(--brand) 14%, transparent); color:var(--brand)">Admin</span>`;
    return `<span class="status-pill" style="background:var(--surface-3); color:var(--ink-2)">Staff</span>`;
  }
  function activePill(active) {
    return active
      ? `<span class="status-pill st-done">${t("status.active")}</span>`
      : `<span class="status-pill st-cancel">Tắt</span>`;
  }

  function userRow(u) {
    const isSelf = u.id === local.currentUserId;
    return `
      <tr data-uid="${u.id}">
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:34px;height:34px;border-radius:99px;background:var(--brand);color:#fff;display:grid;place-items:center;font-weight:800;font-size:13px">
              ${(u.username || "?").slice(0, 2).toUpperCase()}
            </div>
            <div style="min-width:0">
              <div style="font-weight:700">${u.username}${isSelf ? ' <span style="font-size:11px;color:var(--ink-3)">(bạn)</span>' : ''}</div>
              <div style="font-size:12px;color:var(--ink-3)">${u.full_name || "—"}</div>
            </div>
          </div>
        </td>
        <td>${rolePill(u.role)}</td>
        <td>${activePill(u.is_active)}</td>
        <td>${u.must_change_password ? `<span class="tag" style="color:var(--neg);border-color:color-mix(in oklch, var(--neg) 30%, transparent)">Phải đổi MK</span>` : "—"}</td>
        <td class="mono" style="font-size:12px;color:var(--ink-3)">${fmtDateTime(u.last_login_at)}</td>
        <td class="num">
          <div style="display:inline-flex;gap:6px;align-items:center;justify-content:flex-end">
            <button class="iconbtn-sq" data-action="edit-user" data-id="${u.id}" aria-label="Sửa">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            ${isSelf ? "" : `<button class="iconbtn-sq" data-action="del-user" data-id="${u.id}" aria-label="Xoá" style="color:var(--neg)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
            </button>`}
          </div>
        </td>
      </tr>`;
  }

  function table() {
    if (!local.users.length) return `<div style="padding:32px;text-align:center;color:var(--ink-3);font-weight:600">Chưa có tài khoản nào.</div>`;
    return `
      <table class="tbl">
        <thead><tr>
          <th>Tài khoản</th><th>${t("users.modal.role")}</th><th>${t("th.status")}</th><th>Yêu cầu</th><th>Đăng nhập gần nhất</th><th></th>
        </tr></thead>
        <tbody>${local.users.map(userRow).join("")}</tbody>
      </table>`;
  }

  function userModal() {
    if (!local.edit) return "";
    const isEdit = local.edit.mode === "edit";
    const u = local.edit.user;
    return `
      <div id="userModalBackdrop" style="position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(4px);z-index:100;display:grid;place-items:center;padding:20px">
        <div class="card" style="max-width:480px;width:100%;padding:22px;box-shadow:var(--shadow-lg)">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px">
            <div>
              <div class="card-title">${isEdit ? "Sửa tài khoản" : "Tạo tài khoản mới"}</div>
              <div class="card-sub">${isEdit ? "Chỉ những trường được điền sẽ bị thay đổi (mật khẩu trống = giữ nguyên)." : "Tài khoản mới có thể đăng nhập ngay sau khi tạo."}</div>
            </div>
            <button class="iconbtn-sq" id="userModalClose" aria-label="${t("common.close")}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <div class="field-row">
            <label class="field-label">Tên đăng nhập</label>
            <input id="umUsername" class="v2-input" type="text" value="${u.username || ''}" ${isEdit ? "disabled" : ""} placeholder="vd: minh.le" />
            <div class="field-hint">a-z, 0-9, ., _, - (tối thiểu 3 ký tự).</div>
          </div>
          <div class="field-row">
            <label class="field-label">${t("settings.account.full_name")}</label>
            <input id="umFullName" class="v2-input" type="text" value="${(u.full_name || '').replace(/"/g, '&quot;')}" />
          </div>
          <div class="field-row">
            <label class="field-label">Mật khẩu ${isEdit ? "(để trống = giữ nguyên)" : ""}</label>
            <input id="umPassword" class="v2-input" type="password" autocomplete="new-password" />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field-row">
              <label class="field-label">${t("users.modal.role")}</label>
              <select id="umRole" class="v2-select">
                <option value="staff" ${u.role === "staff" ? "selected" : ""}>Staff</option>
                <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
              </select>
            </div>
            <div class="field-row">
              <label class="field-label">${t("th.status")}</label>
              <select id="umActive" class="v2-select">
                <option value="1" ${u.is_active ? "selected" : ""}>${t("status.active")}</option>
                <option value="0" ${!u.is_active ? "selected" : ""}>Tắt</option>
              </select>
            </div>
          </div>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-2);font-weight:600;margin-top:4px">
            <input type="checkbox" id="umMustChange" ${u.must_change_password ? "checked" : ""} />
            Bắt buộc đổi mật khẩu ở lần đăng nhập kế tiếp
          </label>

          <div style="margin-top:22px;display:flex;justify-content:flex-end;gap:10px">
            <button class="ctrl-btn" id="userModalCancel">${t("common.cancel")}</button>
            <button class="ctrl-btn on" id="userModalSave" style="background:var(--brand);border-color:var(--brand);color:#fff">${isEdit ? "${t("users.modal.save_btn")}" : "Tạo tài khoản"}</button>
          </div>
        </div>
      </div>`;
  }

  function render() {
    if (local.loading) return `<div class="card card-pad" style="text-align:center;color:var(--ink-3);font-weight:600">${t("common.loading")}</div>`;
    if (!local.isAdmin) return `<div class="card card-pad" style="color:var(--neg);font-weight:700">Trang này chỉ dành cho admin.</div>`;
    if (local.error) return `<div class="card card-pad" style="color:var(--neg);font-weight:700">${t("common.error")}: ${local.error}</div>`;
    return `
      ${flashMsg()}
      ${summaryRow()}
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Người dùng (${local.users.length})</div>
            <div class="card-sub">Admin có toàn quyền; Staff chỉ xem báo cáo.</div>
          </div>
          <button class="ctrl-btn on" id="btnNewUser" style="background:var(--brand);border-color:var(--brand);color:#fff">+ Tạo tài khoản</button>
        </div>
        ${table()}
      </div>
      ${userModal()}`;
  }

  /* ── interactions ────────────────────────────────────────── */

  function openCreate() {
    local.edit = { mode: "create", user: { username: "", full_name: "", role: "staff", is_active: true, must_change_password: false } };
    window.App.rerender();
  }

  function openEdit(id) {
    const u = local.users.find((x) => x.id === id);
    if (!u) return;
    local.edit = { mode: "edit", user: { ...u } };
    window.App.rerender();
  }

  function closeModal() { local.edit = null; window.App.rerender(); }

  async function saveUser() {
    if (local.saving || !local.edit) return;
    const isEdit = local.edit.mode === "edit";
    const username = document.getElementById("umUsername").value.trim();
    const full_name = document.getElementById("umFullName").value.trim();
    const password = document.getElementById("umPassword").value;
    const role = document.getElementById("umRole").value;
    const is_active = document.getElementById("umActive").value === "1";
    const must_change_password = document.getElementById("umMustChange").checked;

    if (!isEdit && !username) { showMsg("err", "Thiếu tên đăng nhập."); return; }
    if (!isEdit && !password)  { showMsg("err", "Tài khoản mới phải có mật khẩu."); return; }

    local.saving = true;
    const btn = document.getElementById("userModalSave");
    if (btn) btn.textContent = "${t("plan.saving")}";
    try {
      const body = isEdit
        ? { action: "update", id: local.edit.user.id, full_name, role, is_active, must_change_password, password }
        : { action: "create", username, full_name, role, is_active, must_change_password, password };
      const r = await fetch("../api/users.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "HTTP " + r.status);
      closeModal();
      await fetchInitial();
      showMsg("ok", isEdit ? "Đã cập nhật tài khoản." : "Đã tạo tài khoản.");
      window.App.rerender();
    } catch (e) {
      if (btn) btn.textContent = isEdit ? "${t("users.modal.save_btn")}" : "Tạo tài khoản";
      showMsg("err", e.message || String(e));
    } finally {
      local.saving = false;
    }
  }

  async function delUser(id) {
    const u = local.users.find((x) => x.id === id);
    if (!u) return;
    if (!confirm(`Xoá tài khoản "${u.username}"? Hành động này không thể hoàn tác.`)) return;
    try {
      const r = await fetch("../api/users.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
        body: JSON.stringify({ action: "delete", id }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "HTTP " + r.status);
      await fetchInitial();
      showMsg("ok", "Đã xoá tài khoản.");
      window.App.rerender();
    } catch (e) {
      showMsg("err", e.message || String(e));
    }
  }

  function bind() {
    document.getElementById("btnNewUser")?.addEventListener("click", openCreate);
    document.querySelectorAll('[data-action="edit-user"]').forEach((b) => b.addEventListener("click", () => openEdit(+b.dataset.id)));
    document.querySelectorAll('[data-action="del-user"]').forEach((b) => b.addEventListener("click", () => delUser(+b.dataset.id)));

    if (local.edit) {
      document.getElementById("userModalClose")?.addEventListener("click", closeModal);
      document.getElementById("userModalCancel")?.addEventListener("click", closeModal);
      document.getElementById("userModalSave")?.addEventListener("click", saveUser);
      document.getElementById("userModalBackdrop")?.addEventListener("click", (e) => {
        if (e.target && e.target.id === "userModalBackdrop") closeModal();
      });
    }
  }

  function mount(root) {
    if (local.loading) { fetchInitial().then(() => window.App.rerender()); return; }
    bind();
  }

  window.Views.users = {
    titleKey: "page.users.title",
    eyebrowKey: "page.users.eyebrow",
    customToolbar: true,
    render,
    mount,
  };
})();
