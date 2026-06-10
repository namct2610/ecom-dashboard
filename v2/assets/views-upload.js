/* ============================================================
   View: Upload (Tải dữ liệu) — Excel order/traffic import
   Reuses /api/upload.php and /api/upload-history.php
   Drag-drop + click-to-pick; multi-file; per-file result rows.
   ============================================================ */
(function () {
  const local = {
    loadingHist: true,
    history: [],
    uploading: false,
    queue: [],       // [{ name, size, status:'pending'|'uploading'|'done'|'error', result }]
    msg: null,
  };

  function fmtBytes(b) {
    if (!b) return "—";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / 1024 / 1024).toFixed(1) + " MB";
  }
  function fmtDT(s) {
    if (!s) return "—";
    const d = new Date(s.replace(" ", "T"));
    if (isNaN(d)) return s;
    return d.toLocaleDateString("vi-VN") + " " + d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }

  async function fetchHistory() {
    local.loadingHist = true;
    try {
      const r = await fetch("../api/upload-history.php?limit=30", { credentials: "same-origin" });
      const j = await r.json();
      if (j.success) local.history = j.history || [];
    } catch (e) {
      // non-fatal
    } finally {
      local.loadingHist = false;
    }
  }

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

  function platPill(p) {
    if (!p) return "—";
    const key = p === "tiktokshop" ? "tiktok" : p;
    const labels = { shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok Shop", tiktokshop: "TikTok Shop" };
    return `<span class="pchip"><span class="pdot" style="background:var(--${key})"></span>${labels[p] || p}</span>`;
  }

  function statusPill(s) {
    if (s === "completed") return `<span class="status-pill st-done">${t("status.completed")}</span>`;
    if (s === "failed")    return `<span class="status-pill st-cancel">${t("status.failed")}</span>`;
    if (s === "processing") return `<span class="status-pill st-ship">${t("status.processing")}</span>`;
    return `<span class="status-pill">${s || "—"}</span>`;
  }

  function dropZone() {
    return `
      <div id="dropZone" style="border:2px dashed var(--border-strong);border-radius:var(--r-card);padding:36px 22px;text-align:center;transition:background .15s, border-color .15s;cursor:pointer">
        <div style="margin:0 auto 12px;width:54px;height:54px;border-radius:14px;background:color-mix(in oklch, var(--brand) 12%, transparent);color:var(--brand);display:grid;place-items:center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/></svg>
        </div>
        <div style="font-weight:800;font-size:15px">Kéo & thả file Excel vào đây</div>
        <div style="font-size:12.5px;color:var(--ink-3);font-weight:600;margin-top:6px">.xlsx / .xls · tối đa 50MB mỗi file · chọn nhiều file một lúc</div>
        <div style="font-size:11.5px;color:var(--ink-3);font-weight:600;margin-top:4px">Sàn (Shopee / Lazada / TikTok) và loại (đơn / lưu lượng) sẽ tự nhận diện.</div>
        <button class="ctrl-btn on" id="btnPickFile" style="background:var(--brand);border-color:var(--brand);color:#fff;margin-top:16px">Chọn file...</button>
        <input id="fileInput" type="file" multiple accept=".xlsx,.xls" style="display:none" />
      </div>`;
  }

  function queueItem(q, idx) {
    let badge;
    if (q.status === "pending") badge = `<span class="tag">Chờ</span>`;
    else if (q.status === "uploading") badge = `<span class="tag" style="color:var(--lazada);border-color:color-mix(in oklch, var(--lazada) 30%, transparent)">Đang gửi…</span>`;
    else if (q.status === "done") {
      const r = q.result || {};
      const platLabel = (r.platform === "tiktokshop" ? "tiktok" : r.platform);
      badge = `<span class="tag" style="color:var(--pos);border-color:color-mix(in oklch, var(--pos) 30%, transparent)">✓ ${r.imported || 0} dòng</span>
               <span class="tag mono">${platLabel || "?"}</span>
               <span class="tag">${r.data_type === "traffic" ? "Lưu lượng" : "Đơn hàng"}</span>`;
    } else {
      badge = `<span class="tag" style="color:var(--neg);border-color:color-mix(in oklch, var(--neg) 30%, transparent)">✗ ${(q.result && q.result.error) || "Lỗi"}</span>`;
    }
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:var(--r-ctrl);background:var(--surface-2);margin-top:8px">
        <div style="width:32px;height:32px;border-radius:8px;background:var(--surface-3);color:var(--ink-2);display:grid;place-items:center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${q.name}</div>
          <div style="font-size:11.5px;color:var(--ink-3);font-weight:600">${fmtBytes(q.size)}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${badge}</div>
      </div>`;
  }

  function uploadCard() {
    const totalDone = local.queue.filter((q) => q.status === "done").length;
    const totalErr  = local.queue.filter((q) => q.status === "error").length;
    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Tải dữ liệu mới</div>
            <div class="card-sub">Upload file đơn hàng / lưu lượng từ các sàn — hệ thống sẽ tự gộp và cập nhật báo cáo.</div>
          </div>
          ${local.queue.length ? `<div style="font-size:12.5px;color:var(--ink-3);font-weight:700">${totalDone}/${local.queue.length} hoàn tất${totalErr ? ` · ${totalErr} lỗi` : ""}</div>` : ""}
        </div>
        <div class="card-pad">
          ${dropZone()}
          ${local.queue.length ? `<div style="margin-top:6px">${local.queue.map(queueItem).join("")}</div>` : ""}
          ${local.queue.length && !local.uploading ? `<div style="margin-top:14px;display:flex;justify-content:flex-end"><button class="ctrl-btn" id="btnClearQueue">${t("upload.clear_queue")}</button></div>` : ""}
        </div>
      </div>`;
  }

  function historyTable() {
    if (local.loadingHist) return `<div style="padding:24px;text-align:center;color:var(--ink-3);font-weight:600">Đang tải lịch sử…</div>`;
    if (!local.history.length) return `<div style="padding:32px;text-align:center;color:var(--ink-3);font-weight:600">Chưa có lịch sử upload.</div>`;
    return `
      <table class="tbl">
        <thead><tr>
          <th>File</th><th>Sàn</th><th>Loại</th>
          <th class="num">Đã nhập</th><th class="num">Bỏ qua</th>
          <th>${t("th.status")}</th><th>Lúc</th>
        </tr></thead>
        <tbody>
          ${local.history.map((h) => `
            <tr>
              <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(h.original_filename || "").replace(/"/g, '&quot;')}">${h.original_filename || "—"}</td>
              <td>${platPill(h.platform)}</td>
              <td>${h.data_type === "traffic" ? "Lưu lượng" : "Đơn hàng"}</td>
              <td class="num tnum">${(+h.imported_rows || 0).toLocaleString("vi-VN")}</td>
              <td class="num tnum">${(+h.skipped_rows || 0).toLocaleString("vi-VN")}</td>
              <td>${statusPill(h.status)}${h.error_message ? `<div style="font-size:11px;color:var(--neg);font-weight:600;margin-top:2px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(h.error_message||'').replace(/"/g,'&quot;')}">${h.error_message}</div>` : ""}</td>
              <td class="mono" style="font-size:12px;color:var(--ink-3)">${fmtDT(h.uploaded_at)}</td>
            </tr>`).join("")}
        </tbody>
      </table>`;
  }

  function render() {
    return `
      ${flashMsg()}
      ${uploadCard()}
      <div class="card section-gap">
        <div class="card-head">
          <div>
            <div class="card-title">Lịch sử upload</div>
            <div class="card-sub">30 lần gần nhất.</div>
          </div>
          <button class="ctrl-btn" id="btnReloadHist">${t("common.reload")}</button>
        </div>
        ${historyTable()}
      </div>`;
  }

  /* ── interactions ────────────────────────────────────────── */

  function addFiles(fileList) {
    if (local.uploading) return;
    const accepted = [];
    for (const f of fileList) {
      const ext = (f.name || "").toLowerCase().split(".").pop();
      if (!["xlsx", "xls"].includes(ext)) continue;
      if (f.size > 50 * 1024 * 1024) {
        showMsg("err", `${f.name}: quá 50MB`);
        continue;
      }
      accepted.push({ name: f.name, size: f.size, raw: f, status: "pending" });
    }
    if (!accepted.length) { showMsg("err", "Không có file hợp lệ."); return; }
    local.queue = local.queue.concat(accepted);
    window.App.rerender();
    runQueue();
  }

  async function runQueue() {
    if (local.uploading) return;
    const pending = local.queue.filter((q) => q.status === "pending");
    if (!pending.length) return;
    local.uploading = true;
    try {
      for (const item of pending) {
        item.status = "uploading";
        window.App.rerender();

        const fd = new FormData();
        fd.append("files[]", item.raw);
        try {
          const r = await fetch("../api/upload.php", { method: "POST", credentials: "same-origin", body: fd });
          const j = await r.json();
          // upload.php returns { success, message, results: [{file, success, ...}] }
          const file = j.results && j.results[0] ? j.results[0] : { success: false, error: "Không có kết quả" };
          if (file.success) {
            item.status = "done";
            item.result = file;
          } else {
            item.status = "error";
            item.result = { error: file.error || j.error || "Lỗi không xác định" };
          }
        } catch (e) {
          item.status = "error";
          item.result = { error: e.message || String(e) };
        }
        window.App.rerender();
      }
    } finally {
      local.uploading = false;
      await fetchHistory();
      const ok = local.queue.filter((q) => q.status === "done").length;
      const err = local.queue.filter((q) => q.status === "error").length;
      if (ok && !err) showMsg("ok", `Tải lên ${ok} file thành công.`);
      else if (err) showMsg("err", `${err} file lỗi · ${ok} thành công.`);
      window.App.rerender();
    }
  }

  function bind() {
    const dz = document.getElementById("dropZone");
    const fi = document.getElementById("fileInput");
    const pickBtn = document.getElementById("btnPickFile");
    if (dz && fi) {
      dz.addEventListener("click", (e) => {
        if (e.target.closest("#btnPickFile")) return; // pickBtn handles itself
        fi.click();
      });
      ["dragenter", "dragover"].forEach((ev) =>
        dz.addEventListener(ev, (e) => {
          e.preventDefault(); e.stopPropagation();
          dz.style.background = "color-mix(in oklch, var(--brand) 6%, transparent)";
          dz.style.borderColor = "var(--brand)";
        })
      );
      ["dragleave", "drop"].forEach((ev) =>
        dz.addEventListener(ev, (e) => {
          e.preventDefault(); e.stopPropagation();
          dz.style.background = "";
          dz.style.borderColor = "";
        })
      );
      dz.addEventListener("drop", (e) => {
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) addFiles(files);
      });
      fi.addEventListener("change", () => { if (fi.files && fi.files.length) addFiles(fi.files); fi.value = ""; });
      pickBtn?.addEventListener("click", (e) => { e.stopPropagation(); fi.click(); });
    }

    document.getElementById("btnClearQueue")?.addEventListener("click", () => {
      local.queue = []; window.App.rerender();
    });
    document.getElementById("btnReloadHist")?.addEventListener("click", () => {
      fetchHistory().then(() => window.App.rerender());
    });
  }

  function mount() {
    if (local.loadingHist && !local.history.length) {
      fetchHistory().then(() => window.App.rerender());
    }
    bind();
  }

  window.Views.upload = {
    titleKey: "page.upload.title",
    eyebrowKey: "page.upload.eyebrow",
    customToolbar: true,
    render,
    mount,
  };
})();
