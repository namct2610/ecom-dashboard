/* ============================================================
   View: Upload (Tải dữ liệu) — 3.7 redesign
   Two columns: upload + raw re-export on the left, the monthly data
   coverage grid (with a "needs filling" list) on the right. The ads
   column is gone: there is no way to import ads data yet.
   Reuses /api/upload.php, /api/data-coverage.php, /api/export-raw.php
   ============================================================ */
(function () {
  const UI = window.UI, F = window.F;
  const local = {
    uploading: false,
    queue: [],       // [{ name, size, status:'pending'|'uploading'|'done'|'error', progress, result }]
    msg: null,
    csrf: "",
    catalog: null,   // raw rows on hand, to know what can be re-exported
    exportPick: { platform: "", file_type: "", from: "", to: "" },
    coverage: null,  // { loading, error, months }
    allMonths: false,
  };
  const esc = UI.esc;
  const _tf = (k, v) => (window.tf ? window.tf(k, v) : k);
  const RECENT = 12;
  const COV_TYPES = [
    { key: "traffic", label: "upload.cov.traffic" },
    { key: "orders", label: "upload.cov.orders" },
    { key: "finance", label: "upload.cov.finance" },
  ];
  const TYPE_ORDER = ["orders", "settlement", "traffic"];
  const PLAT_ORDER = ["shopee", "lazada", "tiktokshop"];
  const PLAT_LABEL = { shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok Shop", tiktokshop: "TikTok Shop" };
  const pcss = (p) => (p === "tiktokshop" ? "tiktok" : p);

  // PHP emits its "POST Content-Length exceeds the limit" warning at request
  // startup, before any of our code can set display_errors — so the body is that
  // HTML followed by our JSON. Parsing strictly turns a clear server message
  // into "Unexpected token '<'", so pull the JSON object out of whatever came
  // back and fall back to trimmed text.
  function readJsonText(text, status) {
    try { return JSON.parse(text); } catch (_) { /* fall through */ }
    const i = text.indexOf("{"), j = text.lastIndexOf("}");
    if (i >= 0 && j > i) {
      try { return JSON.parse(text.slice(i, j + 1)); } catch (_) { /* fall through */ }
    }
    const plain = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return { success: false, error: plain.slice(0, 300) || ("HTTP " + status) };
  }

  async function fetchCsrf() {
    if (local.csrf) return local.csrf;
    const r = await fetch("api/auth.php", { credentials: "same-origin" });
    local.csrf = (await r.json()).csrf || "";
    return local.csrf;
  }

  function fmtBytes(b) {
    if (!b) return "—";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return F.viDec(b / 1024, 0) + " KB";
    return F.viDec(b / 1024 / 1024, 1) + " MB";
  }
  const fmtInt = (n) => F.viInt(+n || 0);
  const ml = (ym) => _tf("rec.month_short", { m: +ym.slice(5), y: ym.slice(0, 4) });
  const mlShort = (ym) => _tf("rec.month_short", { m: +ym.slice(5), y: ym.slice(2, 4) });
  const dmy = (s) => (s ? String(s).slice(8, 10) + "/" + String(s).slice(5, 7) + "/" + String(s).slice(0, 4) : "?");

  function showMsg(kind, text) {
    local.msg = { kind, text };
    window.App.rerender();
    setTimeout(() => { local.msg = null; window.App.rerender(); }, 5000);
  }

  // 3 file types; never default to "orders": a settlement file labelled as
  // orders makes people think the import went wrong.
  function typeLabel(dataType) {
    if (dataType === "traffic") return t("upload.type.traffic");
    if (dataType === "settlement") return t("upload.type.settlement");
    return t("upload.type.orders");
  }

  /* ── upload card ───────────────────────────────────────────── */

  const QICON = {
    done: "M20 6 9 17l-5-5",
    uploading: "M17 8l-5-5-5 5M12 3v12",
    pending: "M12 6v6l4 2",
    error: "M18 6 6 18M6 6l12 12",
  };

  function queueItem(q) {
    let detail;
    if (q.status === "pending") detail = t("upload.queue.pending");
    else if (q.status === "uploading") detail = q.progress >= 100 ? t("upload.queue.processing") : _tf("upload.queue.sending", { p: q.progress || 0 });
    else if (q.status === "done") {
      const r = q.result || {};
      detail = [_tf("upload.queue.done", { n: fmtInt(r.imported) }), PLAT_LABEL[r.platform] || r.platform || "?", typeLabel(r.data_type)].join(" · ");
    } else detail = (q.result && q.result.error) || t("upload.queue.error_default");
    return `<div class="uq uq-${q.status}">
      <span class="uq-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${QICON[q.status]}"/>${q.status === "pending" ? '<circle cx="12" cy="12" r="9"/>' : ""}</svg></span>
      <div style="min-width:0;display:flex;flex-direction:column;gap:4px">
        <div style="display:flex;align-items:baseline;gap:8px"><span class="nm" style="flex:1;font-size:13px;font-weight:700" title="${esc(q.name)}">${esc(q.name)}</span><span class="sub3" style="font-size:11.5px;white-space:nowrap">${fmtBytes(q.size)}</span></div>
        ${q.status === "uploading" ? UI.track((q.progress || 0) / 100, "var(--lazada)", 6) : ""}
        <div class="uq-d">${esc(detail)}</div>
      </div>
    </div>`;
  }

  function uploadCard() {
    const done = local.queue.filter((q) => q.status === "done").length;
    const err = local.queue.filter((q) => q.status === "error").length;
    const sum = err
      ? _tf("upload.queue.summary_with_errors", { done, total: local.queue.length, err })
      : _tf("upload.queue.summary", { done, total: local.queue.length });
    return `<div class="card">
      <div class="up-pad">
        <div id="dropZone" class="dz" role="button" tabindex="0">
          <span class="dz-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg></span>
          <div class="dz-t">
            <div style="font-size:15px;font-weight:800">${t("upload.dropzone.title")}</div>
            <div class="sub3" style="font-size:12.5px;line-height:1.5;text-wrap:pretty">${t("upload.dropzone.hint")}</div>
          </div>
          <button type="button" class="ctrl-btn on dz-btn" id="btnPickFile">${t("upload.pick")}</button>
          <input id="fileInput" type="file" multiple accept=".xlsx,.xls" hidden>
        </div>
      </div>
      ${local.queue.length ? `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 20px 6px">
          <div class="lab3" style="font-size:12.5px">${sum}</div>
          ${local.uploading ? "" : `<button type="button" class="link-btn" id="btnClearQueue">${t("upload.clear_queue")}</button>`}
        </div>
        <div style="padding:0 12px 12px;display:flex;flex-direction:column;gap:2px">${local.queue.map(queueItem).join("")}</div>` : ""}
    </div>`;
  }

  /* ── raw re-export ─────────────────────────────────────────── */

  function exportCard() {
    const cat = local.catalog;
    const head = UI.head(t("export.title"), t("export.tip"), "", { w: "280px" });
    if (cat === null) return `<div class="card">${head}<div class="cbody">${UI.skel(3)}</div></div>`;
    if (!cat.length) return `<div class="card">${head}<div class="cbody"><div class="note">${UI.ICON.info}${t("export.empty")}</div></div></div>`;

    const p = local.exportPick;
    const sorted = cat.slice().sort((a, b) =>
      PLAT_ORDER.indexOf(a.platform) - PLAT_ORDER.indexOf(b.platform) || TYPE_ORDER.indexOf(a.file_type) - TYPE_ORDER.indexOf(b.file_type));
    const items = sorted.map((c) => {
      const on = p.platform === c.platform && p.file_type === c.file_type;
      return `<button type="button" class="pick-row${on ? " on" : ""}" data-pick="${esc(c.platform)}|${esc(c.file_type)}" role="radio" aria-checked="${on}">
        <span class="radio"><i></i></span>
        <span style="min-width:0;display:flex;flex-direction:column;gap:1px">
          <span class="pname-dot" style="font-size:13px">${UI.pdot(pcss(c.platform))}${PLAT_LABEL[c.platform] || esc(c.platform)} · ${typeLabel(c.file_type)}</span>
          <span class="sub3 tnum" style="font-size:11.5px">${dmy(c.date_from)} → ${dmy(c.date_to)}</span>
        </span>
        <span style="display:flex;flex-direction:column;align-items:flex-end;gap:1px">
          <b class="tnum" style="font-size:13px">${_tf("export.rows_n", { n: fmtInt(c.rows) })}</b>
          ${c.undated ? `<span style="font-size:11px;font-weight:700;color:var(--neg)">${_tf("export.undated_n", { n: fmtInt(c.undated) })}</span>` : ""}
        </span>
      </button>`;
    }).join("");

    const ready = p.platform && p.file_type && p.from && p.to;
    const label = p.platform ? _tf("export.download_pick", { t: typeLabel(p.file_type).toLowerCase(), p: PLAT_LABEL[p.platform] || p.platform }) : t("export.download");
    return `<div class="card">
      ${head}
      <div style="padding:10px 12px 4px;display:flex;flex-direction:column;gap:2px" role="radiogroup" id="expList">${items}</div>
      <div class="exp-foot">
        <label class="fld">${t("export.from")}<input type="date" class="v2-input" id="expFrom" value="${esc(p.from)}"></label>
        <label class="fld">${t("export.to")}<input type="date" class="v2-input" id="expTo" value="${esc(p.to)}"></label>
        <button type="button" class="ctrl-btn sys-btn is-dark exp-go" id="expBtn" ${ready ? "" : "disabled"}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg><span>${esc(label)}</span>
        </button>
      </div>
    </div>`;
  }

  /* ── coverage ──────────────────────────────────────────────── */

  async function fetchCoverage() {
    local.coverage = { loading: true };
    window.App.rerender();
    try {
      const r = await fetch("api/data-coverage.php", { credentials: "same-origin" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "HTTP " + r.status);
      local.coverage = { months: j.months || [] };
    } catch (e) {
      local.coverage = { error: e.message || String(e) };
    }
    window.App.rerender();
  }

  // State of one cell, with the text it shows and what is missing.
  function cellOf(cell) {
    const c = cell || {};
    const have = +c.have || 0, exp = +c.expected || 0;
    if (exp <= 0 && have <= 0) return { st: "na", t: "—" };     // nothing was due (no finished orders that month)
    if (c.state === "none" || have <= 0) return { st: "none", t: t("upload.cov.legend_none") };
    if (c.state === "full" || have >= exp) return { st: "full", t: "✓" };
    // Order counts get long; the numbers alone fit a phone cell.
    const days = c.unit === "days";
    return {
      st: "partial",
      t: days ? _tf("upload.cov.detail_days", { have: fmtInt(have), total: fmtInt(exp) }) : fmtInt(have) + "/" + fmtInt(exp),
      miss: days ? _tf("upload.cov.miss_days", { n: fmtInt(exp - have) }) : _tf("upload.cov.miss_orders", { n: fmtInt(exp - have) }),
    };
  }

  function coverageCard() {
    const c = local.coverage || {};
    const legend = `<div class="cov-lgd"><span><i class="cv-full"></i>${t("upload.cov.legend_full")}</span><span><i class="cv-partial"></i>${t("upload.cov.legend_partial")}</span><span><i class="cv-none"></i>${t("upload.cov.legend_none")}</span></div>`;
    const head = UI.head(t("upload.cov.title"), t("upload.cov.tip"), legend, { w: "280px" });
    if (c.loading || !c.months && !c.error) return `<div class="card">${head}<div class="cbody">${UI.skel(5)}</div></div>`;
    if (c.error) return `<div class="card">${head}<div class="empty-chart" style="color:var(--neg)">${t("common.error")}: ${esc(c.error)}</div></div>`;
    if (!c.months.length) return `<div class="card">${head}<div class="empty-chart">${t("upload.cov.empty")}</div></div>`;

    const recent = c.months.slice(0, RECENT);
    const gaps = [];
    recent.forEach((m) => COV_TYPES.forEach((ty) => {
      const x = cellOf(m.cells && m.cells[ty.key]);
      if (x.st === "none" || x.st === "partial") gaps.push(`${ml(m.ym)} · ${t(ty.label)} · ${x.st === "none" ? t("upload.cov.gap_none") : x.miss}`);
    }));
    const GAP_MAX = 12;
    const gapBox = gaps.length
      ? `<div class="gap-box">
          <div class="gap-t">${_tf("upload.cov.gap_title", { n: gaps.length, m: recent.length })}</div>
          <div class="gap-chips">${gaps.slice(0, GAP_MAX).map((g) => `<span>${esc(g)}</span>`).join("")}${gaps.length > GAP_MAX ? `<span class="more">+${gaps.length - GAP_MAX}</span>` : ""}</div>
        </div>`
      : `<div class="gap-box ok"><div class="gap-t">${_tf("upload.cov.gap_ok", { m: recent.length })}</div></div>`;

    const rows = (local.allMonths ? c.months : recent).map((m) => `<div class="cov-row">
        <span class="cov-m">${esc(mlShort(m.ym))}</span>
        ${COV_TYPES.map((ty) => { const x = cellOf(m.cells && m.cells[ty.key]); return `<span class="cv cv-${x.st}" title="${esc(ml(m.ym) + " · " + t(ty.label) + (x.miss ? " · " + x.miss : ""))}">${esc(x.t)}</span>`; }).join("")}
      </div>`).join("");
    const more = c.months.length > RECENT
      ? `<button type="button" class="link-btn" id="btnAllMonths" style="margin-top:10px">${local.allMonths ? t("upload.cov.fewer") : _tf("upload.cov.all", { n: c.months.length })}</button>`
      : "";
    return `<div class="card">
      ${head}
      ${gapBox}
      <div style="padding:12px 20px 18px">
        <div class="cov-row cov-h"><span>${t("upload.cov.month")}</span>${COV_TYPES.map((ty) => `<span>${t(ty.label)}</span>`).join("")}</div>
        <div style="display:flex;flex-direction:column;gap:5px">${rows}</div>
        ${more}
      </div>
    </div>`;
  }

  function render() {
    return `<div class="pg">
      ${UI.flashMsg(local.msg)}
      <div class="sys-2col">
        <div class="sys-col">${uploadCard()}${exportCard()}</div>
        ${coverageCard()}
      </div>
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
        showMsg("err", _tf("upload.too_big", { name: f.name }));
        continue;
      }
      accepted.push({ name: f.name, size: f.size, raw: f, status: "pending", progress: 0 });
    }
    if (!accepted.length) { showMsg("err", t("upload.invalid")); return; }
    local.queue = local.queue.concat(accepted);
    window.App.rerender();
    runQueue();
  }

  // XHR rather than fetch: only XHR reports upload progress.
  function send(item, csrf) {
    return new Promise((resolve) => {
      const fd = new FormData();
      fd.append("files[]", item.raw);
      const x = new XMLHttpRequest();
      x.open("POST", "api/upload.php");
      x.withCredentials = true;
      x.setRequestHeader("X-CSRF-Token", csrf);
      let last = 0;
      x.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        item.progress = Math.round(e.loaded / e.total * 100);
        // Re-rendering the page on every progress event is wasteful; every 5%.
        if (item.progress - last >= 5 || item.progress === 100) { last = item.progress; window.App.rerender(); }
      };
      x.onload = () => resolve({ status: x.status, body: readJsonText(x.responseText || "", x.status) });
      x.onerror = () => resolve({ status: 0, body: { success: false, error: t("upload.network_error") } });
      x.send(fd);
    });
  }

  async function runQueue() {
    if (local.uploading) return;
    const pending = local.queue.filter((q) => q.status === "pending");
    if (!pending.length) return;
    local.uploading = true;
    try {
      // api/upload.php enforces CSRF; fetch the token once per upload run.
      const csrf = await fetchCsrf();
      for (const item of pending) {
        item.status = "uploading";
        window.App.rerender();
        const { status, body: j } = await send(item, csrf);
        // upload.php returns { success, message, results: [{file, success, ...}] }
        // No results array means the request never reached the normal path —
        // a 500, a timeout, or a body the server threw away. Surfacing the
        // status and whatever text came back beats a bare "no results".
        const file = j.results && j.results[0]
          ? j.results[0]
          : { success: false, error: j.error || _tf("upload.no_response", { status }) };
        if (file.success) { item.status = "done"; item.result = file; }
        else { item.status = "error"; item.result = { error: file.error || j.error || t("common.error") }; }
        window.App.rerender();
      }
    } catch (e) {
      local.queue.forEach((q) => { if (q.status === "uploading" || q.status === "pending") { q.status = "error"; q.result = { error: e.message || String(e) }; } });
    } finally {
      local.uploading = false;
      const ok = local.queue.filter((q) => q.status === "done").length;
      const err = local.queue.filter((q) => q.status === "error").length;
      // New files change both the coverage grid and what can be re-exported.
      local.catalog = null;
      await Promise.all([fetchCoverage(), fetchCatalog()]);
      if (ok && !err) showMsg("ok", _tf("upload.ok_n", { n: ok }));
      else if (err) showMsg("err", _tf("upload.partial", { err, ok }));
      window.App.rerender();
    }
  }

  async function fetchCatalog() {
    try {
      const r = await fetch("api/export-raw.php?action=catalog", { credentials: "same-origin" });
      const j = await r.json();
      local.catalog = j.success ? (j.catalog || []) : [];
    } catch (_) {
      local.catalog = [];
    }
    // Pick the first item so the button always says what it will download.
    const p = local.exportPick;
    const still = local.catalog.find((c) => c.platform === p.platform && c.file_type === p.file_type);
    if (!still && local.catalog.length) {
      const first = local.catalog.slice().sort((a, b) =>
        PLAT_ORDER.indexOf(a.platform) - PLAT_ORDER.indexOf(b.platform) || TYPE_ORDER.indexOf(a.file_type) - TYPE_ORDER.indexOf(b.file_type))[0];
      pickExport(first);
    }
  }

  // Default to the whole range on hand; the dates can be narrowed after.
  function pickExport(c) {
    local.exportPick = { platform: c.platform, file_type: c.file_type, from: c.date_from || "", to: c.date_to || "" };
  }

  function mount(root) {
    if (local.coverage === null) fetchCoverage();
    if (local.catalog === null) fetchCatalog().then(() => window.App.rerender());

    const dz = root.querySelector("#dropZone"), fi = root.querySelector("#fileInput");
    if (dz && fi) {
      dz.addEventListener("click", (e) => { if (!e.target.closest("#btnPickFile")) fi.click(); });
      dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fi.click(); } });
      ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.add("over"); }));
      ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.remove("over"); }));
      dz.addEventListener("drop", (e) => { const files = e.dataTransfer && e.dataTransfer.files; if (files && files.length) addFiles(files); });
      fi.addEventListener("change", () => { if (fi.files && fi.files.length) addFiles(fi.files); fi.value = ""; });
      root.querySelector("#btnPickFile")?.addEventListener("click", (e) => { e.stopPropagation(); fi.click(); });
    }
    root.querySelector("#btnClearQueue")?.addEventListener("click", () => { local.queue = []; window.App.rerender(); });
    root.querySelector("#btnAllMonths")?.addEventListener("click", () => { local.allMonths = !local.allMonths; window.App.rerender(); });

    root.querySelector("#expList")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pick]");
      if (!b) return;
      const [platform, fileType] = b.dataset.pick.split("|");
      const c = (local.catalog || []).find((x) => x.platform === platform && x.file_type === fileType);
      if (c) { pickExport(c); window.App.rerender(); }
    });
    const sync = () => {
      local.exportPick.from = root.querySelector("#expFrom")?.value || "";
      local.exportPick.to = root.querySelector("#expTo")?.value || "";
      const btn = root.querySelector("#expBtn");
      if (btn) btn.disabled = !(local.exportPick.platform && local.exportPick.from && local.exportPick.to);
    };
    root.querySelector("#expFrom")?.addEventListener("change", sync);
    root.querySelector("#expTo")?.addEventListener("change", sync);
    root.querySelector("#expBtn")?.addEventListener("click", () => {
      const p = local.exportPick;
      if (!p.platform || !p.from || !p.to) return;
      const q = new URLSearchParams({ platform: p.platform, file_type: p.file_type, date_from: p.from, date_to: p.to });
      window.location.href = "api/export-raw.php?" + q.toString();
    });
  }

  window.Views.upload = {
    titleKey: "page.upload.title",
    eyebrowKey: "page.upload.eyebrow",
    customToolbar: true,
    render,
    mount,
  };
})();
