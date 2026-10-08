/* ============================================================
   View: GBS Reconciliation (Đối soát GBS) — 3.7 redesign
   One "match rate" card replaces the 6 tiles + 3 platform cards; a
   strip of months (with their match rate and closed state) replaces
   the month menu; problem orders filter by type.
   Reuses:
     GET  /api/gbs-reconciliation.php?month=YYYY-MM   → full compare data
     POST /api/gbs-reconciliation.php  action=set_confirmed
     GET  /api/reconciliation-files.php               → list GBS source files
     POST /api/reconciliation-files.php               → upload GBS file (multipart)
     POST /api/reconciliation-file-delete.php         → delete a source file
     GET  /api/gbs-reconciliation-export.php?month=&platform=  → export .xlsx
   ============================================================ */
(function () {
  const UI = window.UI, F = window.F;
  const local = {
    loading: true,
    busy: false,     // switching month: keep the old page, dim it
    error: null,
    data: null,      // compare() response
    files: [],
    csrf: "",
    saving: false,
    selectedMonth: null,
    filter: "all",
    limit: 20,       // problem orders shown; "show more" raises it
    msg: null,
  };

  const PKEYS = ["shopee", "lazada", "tiktokshop"];
  const PLAT_LABELS = { shopee: "Shopee", lazada: "Lazada", tiktokshop: "TikTok Shop" };
  const PLAT_CSS = { shopee: "shopee", lazada: "lazada", tiktokshop: "tiktok" };
  const ISSUE = ["mismatch", "missing_in_gbs", "missing_in_platform"];
  const ROW_STEP = 20;
  const NOTE_MAX = 4;
  const LOW_PCT = 98;   // below this a month / platform is shown in amber

  const _t  = (k, f) => (window.t ? window.t(k, f) : (f || k));
  const _tf = (k, v) => (window.tf ? window.tf(k, v) : k);
  const esc = UI.esc;

  // Segment colours, in the order of the stacked bar.
  const SEG = [
    ["matched", "rec.matched", "var(--pos)"],
    ["bundle", "status.matched_combo", "color-mix(in oklch, var(--pos) 45%, var(--surface))"],
    ["mismatch", "rec.mismatch", "var(--neg)"],
    ["missing_gbs", "rec.missing_gbs", "var(--warn-soft)"],
    ["missing_plat", "rec.missing_platform", "var(--ink-3)"],
  ];
  const STATUS = {
    mismatch: ["rec.mismatch", "is-neg"],
    missing_in_gbs: ["rec.missing_gbs", "is-warn"],
    missing_in_platform: ["rec.missing_platform", "is-mute"],
  };

  const fmtInt = (n) => F.viInt(+n || 0);
  const ml = (ym) => _tf("rec.month_short", { m: +ym.slice(5), y: ym.slice(0, 4) });
  function fmtDate(s) {
    if (!s) return "—";
    const d = new Date(String(s).replace(" ", "T"));
    return isNaN(d) ? s : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function formatBytes(b) {
    if (!b) return "—";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return F.viDec(b / 1024, 1) + " KB";
    return F.viDec(b / 1024 / 1024, 1) + " MB";
  }
  // Split of one summary into the five bar segments.
  function parts(s) {
    s = s || {};
    return {
      matched: +s.matched_orders || 0,
      bundle: +s.bundle_match_orders || 0,
      mismatch: +s.mismatch_orders || 0,
      missing_gbs: +s.missing_in_gbs || 0,
      missing_plat: +s.missing_in_platform || 0,
    };
  }
  function matchPct(p) {
    const both = p.matched + p.bundle + p.mismatch;
    return both ? (p.matched + p.bundle) / both * 100 : null;
  }

  function showMsg(kind, text) {
    local.msg = { kind, text };
    window.App.rerender();
    setTimeout(() => { local.msg = null; window.App.rerender(); }, 5000);
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
    local.error = null;
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
      local.busy = false;
    }
  }

  async function fetchFiles() {
    try {
      const r = await fetch("api/reconciliation-files.php", { credentials: "same-origin" });
      const j = await r.json();
      if (j.success) local.files = j.files || [];
    } catch (_) { /* non-fatal */ }
  }

  /* ── pieces ───────────────────────────────────────────────── */

  function monthMeta() {
    return (local.data && local.data.selected_month_meta) || null;
  }

  function topBar() {
    const months = ((local.data && local.data.months) || []).slice().reverse(); // oldest → newest
    const m = local.selectedMonth;
    const confirmed = !!(monthMeta() && monthMeta().confirmed);
    const chips = months.map((mm) => {
      const p = mm.month === m ? matchPct(parts(local.data.summary)) : mm.match_pct;
      const low = p != null && p < LOW_PCT;
      return `<button type="button" class="mchip${mm.month === m ? " on" : ""}" data-month="${esc(mm.month)}">
        <span class="mchip-l">${esc(ml(mm.month))}${mm.confirmed ? `<svg viewBox="0 0 24 24" fill="none" stroke="var(--pos)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-label="${esc(_t("rec.month.confirmed"))}"><path d="M20 6 9 17l-5-5"/></svg>` : ""}</span>
        <span class="mchip-v${low ? " low" : ""}">${p == null ? "—" : F.pct(p)}</span>
      </button>`;
    }).join("");
    const mLabel = m ? ml(m) : "—";
    return `<div class="rec-top">
      <div class="mstrip" id="reMonths">${chips}</div>
      <div class="rec-acts">
        <button type="button" class="ctrl-btn sys-btn ${confirmed ? "is-done" : "is-dark"}" id="reConfirmBtn" ${!m || local.saving ? "disabled" : ""}>${confirmed ? "✓ " + _tf("rec.confirmed_btn", { m: mLabel }) : _tf("rec.confirm_btn", { m: mLabel })}</button>
        <button type="button" class="ctrl-btn sys-btn" id="reExportBtn" ${!m ? "disabled" : ""}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>${_t("rec.export")}
        </button>
      </div>
    </div>`;
  }

  function heroCard() {
    const d = local.data, P = parts(d.summary);
    const both = P.matched + P.bundle + P.mismatch, pct = matchPct(P);
    const segs = SEG.map(([k, lk, c]) => ({ v: P[k], c, text: `${_t(lk)} <b>${fmtInt(P[k])}</b>` }));
    const plats = PKEYS.map((k) => ({ k, s: (d.platforms && d.platforms[k] && d.platforms[k].summary) || {} }));
    const pcol = (p) => (p == null ? "var(--ink-3)" : p < LOW_PCT ? "var(--warn-ink)" : "var(--pos)");
    const pbar = (s) => { const p = parts(s); return UI.stack(SEG.map(([k, , c]) => ({ v: p[k], c })), 8); };
    const cols = "150px 92px 92px minmax(0,1fr) 76px 70px 84px 84px";
    const wide = plats.map(({ k, s }) => {
      const p = matchPct(parts(s));
      return `<div class="gt-row" style="padding:13px 22px">
        <span class="pname-dot" style="font-size:13.5px">${UI.pdot(PLAT_CSS[k])}${PLAT_LABELS[k]}</span>
        <span class="r n13">${fmtInt(s.platform_orders)}</span>
        <span class="r n13">${fmtInt(s.gbs_orders)}</span>
        ${pbar(s)}
        <b class="r n13" style="color:${pcol(p)}">${p == null ? "—" : F.pct(p)}</b>
        <span class="r n13" style="color:var(--neg)">${fmtInt(s.mismatch_orders)}</span>
        <span class="r n13" style="color:var(--ink-2)">${fmtInt(s.missing_in_gbs)}</span>
        <span class="r n13" style="color:var(--ink-2)">${fmtInt(s.missing_in_platform)}</span>
      </div>`;
    }).join("");
    const narrow = plats.map(({ k, s }) => {
      const p = matchPct(parts(s));
      return `<div class="mrow" style="gap:9px">
        <div style="display:flex;align-items:center;gap:9px">${UI.pdot(PLAT_CSS[k])}<b style="flex:1;font-size:14px">${PLAT_LABELS[k]}</b><b class="v15" style="color:${pcol(p)}">${p == null ? "—" : F.pct(p)}</b></div>
        ${pbar(s)}
        <div class="m3" style="font-size:11.5px;font-weight:600;color:var(--ink-3)">
          <span>${_t("rec.mismatch")} <b style="color:var(--neg);font-size:13px">${fmtInt(s.mismatch_orders)}</b></span>
          <span>${_t("rec.missing_gbs")} <b style="color:var(--ink);font-size:13px">${fmtInt(s.missing_in_gbs)}</b></span>
          <span>${_t("rec.missing_platform")} <b style="color:var(--ink);font-size:13px">${fmtInt(s.missing_in_platform)}</b></span>
        </div>
      </div>`;
    }).join("");

    return `<div class="card">
      <div class="rec-hero">
        <div style="display:flex;flex-direction:column;gap:4px">
          <div class="ch-title lab3" style="font-size:12.5px">${_tf("rec.rate_title", { m: ml(local.selectedMonth) })}${UI.tip(_t("rec.rate_tip"), { w: "300px" })}</div>
          <div class="rec-big">${pct == null ? "—" : F.viDec(pct, 1)}<span>%</span></div>
          <div class="sub3" style="font-size:12.5px">${_tf("rec.rate_sub", { a: fmtInt(P.matched + P.bundle), b: fmtInt(both) })}${d.summary && d.summary.cross_month_orders ? " · " + _tf("rec.cross_month", { n: fmtInt(d.summary.cross_month_orders) }) : ""}</div>
        </div>
        <div class="rec-dist">
          ${UI.stack(segs, 12)}
          <div class="lgd rec-lgd">${segs.map((g) => `<span><span class="sw" style="background:${g.c}"></span>${g.text}</span>`).join("")}</div>
        </div>
      </div>
      <div style="border-top:1px solid var(--border)">
        <div class="gt only-wide" style="--cols:${cols};padding:0">
          <div class="gt-head" style="padding:11px 22px"><span>${_t("th.platform")}</span><span class="r">${_t("rec.platform_orders")}</span><span class="r">${_t("rec.gbs_orders")}</span><span>${_t("rec.col.dist")}</span><span class="r">${_t("rec.matched")}</span><span class="r">${_t("rec.mismatch")}</span><span class="r">${_t("rec.missing_gbs")}</span><span class="r">${_t("rec.missing_platform")}</span></div>
          ${wide}
        </div>
        <div class="only-narrow">${narrow}</div>
      </div>
    </div>`;
  }

  // Every order that needs a look, across platforms, in the server's order.
  function issueRows() {
    const out = [];
    const platforms = (local.data && local.data.platforms) || {};
    PKEYS.forEach((k) => ((platforms[k] && platforms[k].orders) || []).forEach((o) => {
      if (ISSUE.includes(o.status)) out.push(o);
    }));
    return out;
  }

  function issuesCard() {
    const all = issueRows();
    const cnt = { all: all.length };
    ISSUE.forEach((s) => { cnt[s] = all.filter((r) => r.status === s).length; });
    const rows = local.filter === "all" ? all : all.filter((r) => r.status === local.filter);
    const shown = rows.slice(0, local.limit);
    const tabs = `<div class="miniseg sys-seg" id="reFilter">${[["all", "common.all"], ["mismatch", "rec.mismatch"], ["missing_in_gbs", "rec.missing_gbs"], ["missing_in_platform", "rec.missing_platform"]].map(([k, lk]) =>
      `<button type="button" class="${local.filter === k ? "active" : ""}" data-k="${k}">${_t(lk)}<span class="seg-n">${fmtInt(cnt[k])}</span></button>`).join("")}</div>`;

    const val = (v, missing) => (missing ? "—" : v);
    const cells = (r) => {
      const noP = r.status === "missing_in_platform";
      const noG = r.status === "missing_in_gbs";
      const qDiff = !noP && !noG && Math.abs((+r.platform_qty || 0) - (+r.gbs_qty || 0)) >= 0.001;
      const nDiff = !noP && !noG && Math.abs(+r.nmv_diff || 0) > 1;
      return {
        q: `${val(fmtInt(r.platform_qty), noP)} → <b style="color:${qDiff ? "var(--neg)" : "var(--ink)"}">${val(fmtInt(r.gbs_qty), noG)}</b>`,
        n: `${val(F.money(+r.platform_nmv), noP)} → <b style="color:${nDiff ? "var(--neg)" : "var(--ink)"}">${val(F.money(+r.gbs_nmv), noG)}</b>`,
      };
    };
    // The service's notes for one-sided orders are long; say the useful part.
    const m = local.selectedMonth;
    const lastDay = new Date(+m.slice(0, 4), +m.slice(5), 0).getDate();
    const nextM = (() => { const d = new Date(+m.slice(0, 4), +m.slice(5), 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); })();
    const noteOf = (r) => {
      if (r.status === "missing_in_platform") return _t("rec.issue.no_platform");
      if (r.status !== "missing_in_gbs") return r.note || "";
      if ((r.cross_month_months || []).length) return r.note || "";
      const day = String(r.platform_reconcile_at || "").slice(0, 10);
      if (!day.startsWith(m)) return _tf("rec.issue.no_gbs", { m: ml(m) });
      const dd = day.slice(8) + "/" + day.slice(5, 7);
      return +day.slice(8) >= lastDay - 2
        ? _tf("rec.issue.late", { d: dd, m: ml(nextM) })
        : _tf("rec.issue.no_gbs_on", { d: dd, m: ml(m) });
    };
    const pill = (s) => `<span class="sys-pill ${STATUS[s][1]}">${_t(STATUS[s][0])}</span>`;
    const pname = (k) => `<span class="pname-dot" style="font-size:12.5px;font-weight:600">${UI.pdot(PLAT_CSS[k])}${PLAT_LABELS[k] === "TikTok Shop" ? "TikTok" : PLAT_LABELS[k]}</span>`;
    const cols = "minmax(0,1.25fr) 84px 96px 74px minmax(0,1fr) minmax(0,1.5fr)";

    const wide = shown.map((r) => { const c = cells(r); return `<div class="gt-row" style="padding:10px 20px;font-size:13px">
        <span class="mono rec-id" title="${esc(r.order_id)}">${esc(r.order_id)}</span>
        ${pname(r.platform)}
        <span>${pill(r.status)}</span>
        <span class="r n13" style="font-size:13px;white-space:nowrap">${c.q}</span>
        <span class="r n13" style="font-size:13px;white-space:nowrap">${c.n}</span>
        <span class="rec-note">${esc(noteOf(r))}</span>
      </div>`; }).join("");
    const narrow = shown.map((r) => { const c = cells(r); return `<div class="mrow">
        <div style="display:flex;align-items:center;gap:8px">${UI.pdot(PLAT_CSS[r.platform])}<span class="mono rec-id" style="flex:1">${esc(r.order_id)}</span>${pill(r.status)}</div>
        <div style="display:flex;gap:14px;font-size:12px;font-weight:600;color:var(--ink-3)" class="tnum"><span>SL ${c.q}</span><span>NMV ${c.n}</span></div>
        <div class="rec-note">${esc(noteOf(r))}</div>
      </div>`; }).join("");

    const body = rows.length
      ? `<div class="gt only-wide" style="--cols:${cols};padding:6px 0 0">
          <div class="gt-head" style="padding:8px 20px"><span>${_t("th.order_id")}</span><span>${_t("th.platform")}</span><span>${_t("rec.col.type")}</span><span class="r">${_t("rec.col.qty")}</span><span class="r">${_t("rec.col.nmv")}</span><span>${_t("th.note")}</span></div>
          ${wide}
        </div>
        <div class="only-narrow" style="padding:4px 0 0">${narrow}</div>`
      : `<div class="empty-chart">${_t(local.filter === "all" ? "rec.issues.none" : "rec.issues.none_type")}</div>`;
    return `<div class="card" style="flex:2 1 640px">
      ${UI.head(_t("rec.issues.title"), _t("rec.issues.tip"), tabs)}
      ${body}
      ${rows.length ? `<div class="card-foot sub3" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">${rows.length > shown.length ? _tf("rec.issues.shown", { a: fmtInt(shown.length), b: fmtInt(rows.length) }) : _tf("rec.issues.shown_all", { n: fmtInt(rows.length) })}${rows.length > shown.length ? `<button type="button" class="link-btn" id="reMore">${_tf("rec.issues.more", { n: fmtInt(Math.min(ROW_STEP, rows.length - shown.length)) })}</button>` : ""}</div>` : ""}
    </div>`;
  }

  // Short, numbered notes worked out from this month's orders — what to do
  // next — instead of the service's fixed list of how matching works (that
  // list stays, folded, under "how it works").
  function notesList() {
    const d = local.data, m = local.selectedMonth, out = [];
    const rows = issueRows();
    PKEYS.forEach((k) => {
      const miss = rows.filter((r) => r.platform === k && r.status === "missing_in_gbs");
      if (miss.length) {
        const days = miss.map((r) => String(r.platform_reconcile_at || "").slice(0, 10)).filter((s) => s.startsWith(m)).sort();
        const last = new Date(+m.slice(0, 4), +m.slice(5), 0).getDate();
        const late = days.filter((s) => +s.slice(8) >= last - 2);
        if (late.length && late.length >= miss.length / 2) {
          out.push(_tf("rec.notes.late", { n: fmtInt(late.length), p: PLAT_LABELS[k], a: +late[0].slice(8), b: +late[late.length - 1].slice(8) + "/" + +m.slice(5) }));
        } else {
          out.push(_tf("rec.notes.missing_gbs", { n: fmtInt(miss.length), p: PLAT_LABELS[k] }));
        }
      }
      const nmvOnly = rows.filter((r) => r.platform === k && r.status === "mismatch" && Math.abs((+r.platform_qty || 0) - (+r.gbs_qty || 0)) < 0.001 && Math.abs(+r.nmv_diff || 0) > 1);
      if (nmvOnly.length) {
        const sum = nmvOnly.reduce((t, r) => t + Math.abs(+r.nmv_diff || 0), 0);
        out.push(_tf("rec.notes.nmv", { n: fmtInt(nmvOnly.length), p: PLAT_LABELS[k], v: F.money(sum) }));
      }
      const qty = rows.filter((r) => r.platform === k && r.status === "mismatch" && Math.abs((+r.platform_qty || 0) - (+r.gbs_qty || 0)) >= 0.001);
      if (qty.length) out.push(_tf("rec.notes.qty", { n: fmtInt(qty.length), p: PLAT_LABELS[k] }));
      const noPlat = rows.filter((r) => r.platform === k && r.status === "missing_in_platform");
      if (noPlat.length) out.push(_tf("rec.notes.missing_plat", { n: fmtInt(noPlat.length), p: PLAT_LABELS[k] }));
    });
    if (d.summary && d.summary.cross_month_orders) out.push(_tf("rec.notes.cross", { n: fmtInt(d.summary.cross_month_orders) }));
    if (!out.length) out.push(_tf("rec.notes.clean", { m: ml(m) }));
    return out;
  }

  function notesCard() {
    const notes = notesList();
    const how = (local.data.insights || []).filter((x) => typeof x === "string");
    return `<div class="card">
      ${UI.head(_tf("rec.notes.title", { m: ml(local.selectedMonth) }), "")}
      <div class="cbody" style="display:flex;flex-direction:column;gap:10px;padding-top:12px">
        ${notes.slice(0, NOTE_MAX).map((n, i) => `<div class="rec-n"><span class="rk">${i + 1}</span><span>${esc(n)}</span></div>`).join("")}
        ${notes.length > NOTE_MAX ? `<details class="sys-more"><summary>${_tf("rec.notes.more", { n: notes.length - NOTE_MAX })}</summary><div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">${notes.slice(NOTE_MAX).map((n, i) => `<div class="rec-n"><span class="rk">${i + 1 + NOTE_MAX}</span><span>${esc(n)}</span></div>`).join("")}</div></details>` : ""}
        ${how.length ? `<details class="sys-more"><summary>${_t("rec.notes.how")}</summary><ul>${how.map((x) => `<li>${esc(x.replace(/`/g, ""))}</li>`).join("")}</ul></details>` : ""}
      </div>
    </div>`;
  }

  function fileMonths(f) {
    const ms = (f.months || []).slice().sort();
    if (!ms.length) return "";
    if (ms.length <= 2) return ms.map(ml).join(", ");
    const a = ms[0], b = ms[ms.length - 1];
    return a.slice(0, 4) === b.slice(0, 4)
      ? "T" + +a.slice(5) + "–T" + +b.slice(5) + "/" + a.slice(0, 4)
      : ml(a) + " – " + ml(b);
  }

  function filesCard() {
    const list = local.files.length
      ? local.files.map((f) => {
        const name = f.original_filename || f.filename || "—";
        const meta = [fileMonths(f), formatBytes(f.size || f.size_bytes), fmtDate(f.uploaded_at)].filter(Boolean).join(" · ");
        return `<div class="frow-file">
          <span class="ficon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6"/></svg></span>
          <div style="min-width:0"><div class="nm" style="font-weight:700;font-size:13px" title="${esc(name)}">${esc(name)}</div><div class="meta">${esc(meta)}</div></div>
          <button type="button" class="sys-x" data-del-file="${esc(f.filename)}" aria-label="${esc(_t("common.delete"))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
        </div>`;
      }).join("")
      : `<div class="empty-chart" style="padding:22px 12px">${_t("rec.files.empty")}</div>`;
    const btn = `<button type="button" class="ctrl-btn on sys-btn-sm" id="reAddFileBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>${_t("rec.files.add")}</button>
      <input id="reFileInput" type="file" accept=".xlsx,.xls" hidden>`;
    return `<div class="card">
      ${UI.head(_t("rec.files.title"), "", btn)}
      <div style="padding:8px 12px 12px;display:flex;flex-direction:column">${list}</div>
    </div>`;
  }

  function render() {
    if (local.loading && !local.data) return `<div class="card card-pad" style="text-align:center;color:var(--ink-3);font-weight:600">${_t("common.loading")}</div>`;
    if (local.error && !local.data) return `<div class="card card-pad" style="text-align:center;color:var(--neg);font-weight:700">${_t("common.error")}: ${esc(local.error)}</div>`;
    const noMonth = !local.selectedMonth;
    return `<div class="pg${local.busy ? " is-busy" : ""}">
      ${UI.flashMsg(local.msg)}
      ${local.error ? `<div class="banner" style="color:var(--neg)">${_t("common.error")}: ${esc(local.error)}</div>` : ""}
      ${noMonth
        ? `<div class="note">${UI.ICON.info}<span>${_t("rec.note.no_data")}</span></div>
           <div class="frow"><div style="flex:1 1 360px;max-width:560px">${filesCard()}</div></div>`
        : `${topBar()}
           ${heroCard()}
           <div class="frow" style="align-items:flex-start">
             ${issuesCard()}
             <div class="sys-col" style="flex:1 1 320px">${notesCard()}${filesCard()}</div>
           </div>`}
    </div>`;
  }

  /* ── interactions ────────────────────────────────────────── */

  function pickMonth(m) {
    if (!m || m === local.selectedMonth || local.busy) return;
    local.busy = true; local.filter = "all"; local.limit = ROW_STEP;
    window.App.rerender();
    fetchCompare(m).then(() => window.App.rerender());
  }

  async function toggleConfirm() {
    if (!local.selectedMonth || local.saving) return;
    const confirmed = !(monthMeta() && monthMeta().confirmed);
    local.saving = true; window.App.rerender();
    try {
      const r = await fetch("api/gbs-reconciliation.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": local.csrf },
        body: JSON.stringify({ action: "set_confirmed", month: local.selectedMonth, confirmed }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "HTTP " + r.status);
      // The month strip and the button read the same flag.
      (local.data.months || []).forEach((mm) => { if (mm.month === local.selectedMonth) mm.confirmed = confirmed; });
      if (local.data.selected_month_meta) local.data.selected_month_meta.confirmed = confirmed;
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
      await ensureCsrf();
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
      await ensureCsrf();
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

  function mount(root) {
    if (local.loading && !local.data) {
      fetchCompare().then(() => window.App.rerender());
      return;
    }
    const strip = root.querySelector("#reMonths");
    if (strip) {
      strip.addEventListener("click", (e) => { const b = e.target.closest("[data-month]"); if (b) pickMonth(b.dataset.month); });
      // Newest months sit on the right; start scrolled to the open one.
      const on = strip.querySelector(".mchip.on");
      if (on) strip.scrollLeft = on.offsetLeft - strip.clientWidth + on.offsetWidth + 24;
    }
    root.querySelector("#reConfirmBtn")?.addEventListener("click", toggleConfirm);
    root.querySelector("#reExportBtn")?.addEventListener("click", exportExcel);
    root.querySelector("#reFilter")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { local.filter = b.dataset.k; local.limit = ROW_STEP; window.App.rerender(); } });
    root.querySelector("#reMore")?.addEventListener("click", () => { local.limit += ROW_STEP; window.App.rerender(); });
    root.querySelector("#reAddFileBtn")?.addEventListener("click", () => root.querySelector("#reFileInput")?.click());
    root.querySelector("#reFileInput")?.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      uploadGbsFile(f);
      e.target.value = "";
    });
    root.querySelectorAll("[data-del-file]").forEach((b) => b.addEventListener("click", () => deleteFile(b.dataset.delFile)));
  }

  window.Views.reconcile = {
    titleKey: "page.reconcile.title",
    eyebrowKey: "page.reconcile.eyebrow",
    customToolbar: true,
    render,
    mount,
  };
})();
