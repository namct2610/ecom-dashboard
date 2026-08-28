/* ============================================================
   View: Chi phí sàn (Platform cost analysis)
     GET  /api/costs.php?...period filters  → cost breakdown
     POST /api/costs.php  {rates:{...}}     → save fee rates (admin)
   ============================================================ */
(function () {
  const S = window.Store, F = window.F, UI = window.UI, C = window.Charts;
  const _t = (k, f) => (window.t ? window.t(k, f) : (f || k));
  const _tf = (k, v) => (window.tf ? window.tf(k, v) : k);

  const PKEYS = ["shopee", "lazada", "tiktokshop"];
  const PLAT_CSS = { shopee: "shopee", lazada: "lazada", tiktokshop: "tiktok" };
  const PLAT_LABEL = { shopee: "Shopee", lazada: "Lazada", tiktokshop: "TikTok Shop" };

  const local = { loading: false, error: null, data: null, key: null, saving: false, msg: null, editing: false, draft: {} };

  function periodKey() {
    return S.state.period + "|" + S.state.platform;
  }

  // Cùng cách truyền kỳ như trang Khách hàng (store.js fetchCustomers): quy kỳ
  // trên header về khoảng ngày rồi gửi date_from/date_to.
  function queryString() {
    const range = S.rangeFromKey(S.state.period);
    const p = new URLSearchParams({ date_from: range.start, date_to: range.end });
    if (S.state.platform !== "all") {
      p.set("platform", S.state.platform === "tiktok" ? "tiktokshop" : S.state.platform);
    }
    return p.toString();
  }

  // csrf + quyền admin lấy từ api/auth.php, giống views-users.js / views-plan.js
  let auth = null;
  async function ensureAuth() {
    if (auth) return auth;
    try {
      const r = await fetch("api/auth.php", { credentials: "same-origin" });
      const j = await r.json();
      auth = { csrf: j.csrf || j.csrf_token || "", isAdmin: (j.user && j.user.role === "admin") || j.role === "admin" };
    } catch (_) {
      auth = { csrf: "", isAdmin: false };
    }
    return auth;
  }

  async function load() {
    const key = periodKey();
    if (local.loading || local.key === key) return;
    local.loading = true; local.error = null; local.key = key;
    try {
      await ensureAuth();
      const r = await fetch("api/costs.php?" + queryString(), { credentials: "same-origin" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "HTTP " + r.status);
      local.data = j;
      local.draft = JSON.parse(JSON.stringify(j.rates || {}));
    } catch (e) {
      local.error = e.message || String(e);
      local.key = null;
    } finally {
      local.loading = false;
      window.App.rerender();
    }
  }

  function kpis(s) {
    const items = [
      { lab: _t("costs.kpi.revenue"), val: F.money(s.revenue || 0), foot: _t("costs.kpi.revenue_foot") },
      { lab: _t("costs.kpi.fee"), val: F.money(s.fee_total || 0), foot: _t("costs.kpi.fee_foot"), color: "var(--neg)" },
      { lab: _t("costs.kpi.fee_pct"), val: F.viDec(s.fee_pct || 0, 2) + "%", foot: _t("costs.kpi.fee_pct_foot"), color: "var(--neg)" },
      { lab: _t("costs.kpi.net"), val: F.money(s.net_revenue || 0), foot: _t("costs.kpi.net_foot"), color: "var(--pos)" },
      { lab: _t("costs.kpi.per_order"), val: F.money(s.fee_per_order || 0), foot: _t("costs.kpi.per_order_foot") },
    ];
    return `<div class="g12" style="grid-template-columns:repeat(5,1fr)">${items.map((k) => `
      <div data-collapse style="grid-column:span 1"><div class="card kpi">
        <div class="kpi-label">${k.lab}</div>
        <div class="kpi-value tnum" style="${k.color ? "color:" + k.color : ""}">${k.val}</div>
        <div class="kpi-foot"><span>${k.foot}</span></div>
      </div></div>`).join("")}</div>`;
  }

  function feeMixCard(s) {
    const parts = [
      { lab: _t("costs.fee.fixed"), val: s.fee_fixed || 0, color: "--shopee" },
      { lab: _t("costs.fee.service"), val: s.fee_service || 0, color: "--lazada" },
      { lab: _t("costs.fee.payment"), val: s.fee_payment || 0, color: "--tiktok" },
    ];
    const total = parts.reduce((t, p) => t + p.val, 0) || 1;
    return `
      <div data-collapse style="grid-column:span 5" class="card">
        <div class="card-head"><div><div class="card-title">${_t("costs.mix.title")}</div><div class="card-sub">${_t("costs.mix.sub")}</div></div></div>
        <div class="card-pad" style="display:flex;flex-wrap:wrap;gap:24px;align-items:center">
          <div class="donut-wrap" style="height:170px;flex:0 0 200px;min-width:0;max-width:100%">
            <canvas id="feeMixDonut"></canvas>
            <div class="donut-center"><div><div class="big tnum">${F.money(s.fee_total || 0)}</div><div class="small">${_t("costs.kpi.fee")}</div></div></div>
          </div>
          <div style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:10px">
            ${parts.map((p) => `<div>
              <div style="display:flex;align-items:center;gap:9px;font-size:13px;margin-bottom:4px">
                <span class="legend-swatch" style="background:var(${p.color})"></span><b>${p.lab}</b>
                <span style="margin-left:auto;font-weight:800" class="tnum">${F.money(p.val)}</span>
                <span style="color:var(--ink-3);font-weight:700;min-width:52px;text-align:right" class="tnum">${F.viDec(p.val / total * 100, 1)}%</span>
              </div>
              <div class="cmp-track"><div class="cmp-fill" style="width:${p.val / total * 100}%;background:var(${p.color})"></div></div>
            </div>`).join("")}
          </div>
        </div>
      </div>`;
  }

  function trendCard() {
    return `
      <div data-collapse style="grid-column:span 7" class="card">
        <div class="card-head"><div><div class="card-title">${_t("costs.trend.title")}</div><div class="card-sub">${_t("costs.trend.sub")}</div></div></div>
        <div class="card-pad" style="padding-top:14px"><div class="chart-wrap" style="height:230px"><canvas id="costTrend"></canvas></div></div>
      </div>`;
  }

  function sourceBadge(source) {
    return source === "actual"
      ? `<span class="status-pill st-done">${_t("costs.source.actual")}</span>`
      : `<span class="status-pill st-ship">${_t("costs.source.estimated")}</span>`;
  }

  function platformTable(platforms) {
    const rows = PKEYS.filter((k) => platforms[k]).map((k) => {
      const p = platforms[k];
      return `<tr>
        <td><span class="pchip">${UI.pdot(PLAT_CSS[k])}${PLAT_LABEL[k]}</span></td>
        <td>${sourceBadge(p.source)}</td>
        <td class="num tnum">${F.viInt(p.orders)}</td>
        <td class="num tnum">${F.money(p.revenue)}</td>
        <td class="num tnum">${p.fee_fixed ? F.money(p.fee_fixed) : "—"}</td>
        <td class="num tnum">${p.fee_service ? F.money(p.fee_service) : "—"}</td>
        <td class="num tnum">${p.fee_payment ? F.money(p.fee_payment) : "—"}</td>
        <td class="num tnum"><b>${F.money(p.fee_total)}</b></td>
        <td class="num tnum" style="color:var(--neg);font-weight:700">${F.viDec(p.fee_pct, 2)}%</td>
        <td class="num tnum" style="color:var(--pos)">${F.money(p.net_revenue)}</td>
      </tr>`;
    }).join("");

    return `
      <div class="card section-gap">
        <div class="card-head"><div><div class="card-title">${_t("costs.table.title")}</div><div class="card-sub">${_t("costs.table.sub")}</div></div></div>
        <div class="card-pad" style="padding:6px;overflow-x:auto">
          <table class="tbl"><thead><tr>
            <th>${_t("th.platform")}</th><th>${_t("costs.table.source")}</th>
            <th class="num">${_t("th.orders")}</th><th class="num">${_t("th.revenue")}</th>
            <th class="num">${_t("costs.fee.fixed")}</th><th class="num">${_t("costs.fee.service")}</th>
            <th class="num">${_t("costs.fee.payment")}</th><th class="num">${_t("costs.kpi.fee")}</th>
            <th class="num">${_t("costs.table.pct")}</th><th class="num">${_t("costs.kpi.net")}</th>
          </tr></thead><tbody>${rows}</tbody></table>
        </div>
      </div>`;
  }

  function ratesCard(data) {
    const isAdmin = !!(auth && auth.isAdmin);
    const rates = local.editing ? local.draft : (data.rates || {});
    const rows = PKEYS.map((k) => {
      const r = rates[k] || { commission: 0, payment: 0 };
      const usesActual = (data.platforms[k] || {}).source === "actual";
      const cell = (field) => local.editing && !usesActual
        ? `<input type="number" step="0.1" min="0" max="100" data-rate="${k}" data-field="${field}" value="${r[field]}" style="width:78px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);color:var(--ink);font-family:inherit;font-size:13px;text-align:right">`
        : `<span class="tnum">${usesActual ? "—" : F.viDec(r[field] || 0, 1) + "%"}</span>`;
      return `<tr>
        <td><span class="pchip">${UI.pdot(PLAT_CSS[k])}${PLAT_LABEL[k]}</span></td>
        <td>${usesActual ? sourceBadge("actual") : sourceBadge("estimated")}</td>
        <td class="num">${cell("commission")}</td>
        <td class="num">${cell("payment")}</td>
        <td style="font-size:12px;color:var(--ink-3)">${usesActual ? _t("costs.rates.from_file") : _t("costs.rates.from_config")}</td>
      </tr>`;
    }).join("");

    return `
      <div class="card section-gap">
        <div class="card-head">
          <div><div class="card-title">${_t("costs.rates.title")}</div><div class="card-sub">${_t("costs.rates.sub")}</div></div>
          ${isAdmin ? (local.editing
            ? `<div style="display:flex;gap:8px">
                 <button class="ctrl-btn" id="costRatesCancel">${_t("common.cancel")}</button>
                 <button class="ctrl-btn on" id="costRatesSave" ${local.saving ? "disabled" : ""} style="background:var(--brand);border-color:var(--brand);color:#fff">${local.saving ? _t("costs.rates.saving") : _t("common.save")}</button>
               </div>`
            : `<button class="ctrl-btn" id="costRatesEdit">${_t("costs.rates.edit")}</button>`) : ""}
        </div>
        <div class="card-pad" style="padding:6px;overflow-x:auto">
          <table class="tbl"><thead><tr>
            <th>${_t("th.platform")}</th><th>${_t("costs.table.source")}</th>
            <th class="num">${_t("costs.rates.commission")}</th><th class="num">${_t("costs.rates.payment")}</th>
            <th>${_t("costs.rates.note_col")}</th>
          </tr></thead><tbody>${rows}</tbody></table>
        </div>
      </div>`;
  }

  function notesCard(data) {
    const notes = [
      _t("costs.note.per_order"),
      _t("costs.note.revenue_basis"),
      _t("costs.note.shipping") + (data.summary.shipping_fee ? " (" + F.money(data.summary.shipping_fee) + ")" : ""),
      _t("costs.note.excluded"),
    ];
    if (data.has_estimated) notes.unshift(_t("costs.note.estimated"));
    return `
      <div class="card section-gap">
        <div class="card-head"><div><div class="card-title">${_t("costs.notes.title")}</div><div class="card-sub">${_t("costs.notes.sub")}</div></div></div>
        <div class="card-pad">
          <ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:7px;font-size:13.5px;line-height:1.55;color:var(--ink-2)">
            ${notes.map((n) => `<li>${n}</li>`).join("")}
          </ul>
        </div>
      </div>`;
  }

  function render() {
    if (local.error) return `<div class="card card-pad" style="text-align:center;color:var(--neg);font-weight:700">${_t("common.error")}: ${UI.esc(local.error)}</div>`;
    if (!local.data) return `<div class="card card-pad" style="text-align:center;color:var(--ink-3);font-weight:600">${_t("common.loading")}</div>`;

    const d = local.data;
    if (!d.summary.orders) {
      return `<div class="note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>${_t("costs.empty")}</div>`;
    }

    return (local.msg ? UI.flashMsg(local.msg) : "") + kpis(d.summary) + `
      <div class="g12 section-gap">${feeMixCard(d.summary)}${trendCard()}</div>`
      + platformTable(d.platforms) + ratesCard(d) + notesCard(d);
  }

  function mount(root) {
    if (local.key !== periodKey()) { load(); return; }
    if (!local.data || !local.data.summary.orders) return;

    const s = local.data.summary;
    const dn = root.querySelector("#feeMixDonut");
    if (dn) C.donut(dn, [
      { label: _t("costs.fee.fixed"), value: s.fee_fixed || 0, color: "--shopee" },
      { label: _t("costs.fee.service"), value: s.fee_service || 0, color: "--lazada" },
      { label: _t("costs.fee.payment"), value: s.fee_payment || 0, color: "--tiktok" },
    ]);

    const tc = root.querySelector("#costTrend");
    const trend = local.data.trend || [];
    if (tc && trend.length) {
      C.lineSeries(tc, trend.map((t) => t.month), [
        { label: _t("th.revenue"), data: trend.map((t) => t.revenue), color: "--pos" },
        { label: _t("costs.kpi.fee"), data: trend.map((t) => t.fee_total), color: "--neg" },
      ], { money: true });
    }

    root.querySelector("#costRatesEdit")?.addEventListener("click", () => {
      local.editing = true; local.draft = JSON.parse(JSON.stringify(local.data.rates || {})); window.App.rerender();
    });
    root.querySelector("#costRatesCancel")?.addEventListener("click", () => {
      local.editing = false; window.App.rerender();
    });
    root.querySelectorAll("[data-rate]").forEach((el) => el.addEventListener("input", () => {
      const k = el.dataset.rate, f = el.dataset.field;
      local.draft[k] = local.draft[k] || { commission: 0, payment: 0 };
      local.draft[k][f] = Math.max(0, Math.min(100, parseFloat(el.value) || 0));
    }));
    root.querySelector("#costRatesSave")?.addEventListener("click", saveRates);
  }

  async function saveRates() {
    if (local.saving) return;
    local.saving = true; window.App.rerender();
    try {
      const r = await fetch("api/costs.php", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": (auth && auth.csrf) || "" },
        body: JSON.stringify({ rates: local.draft }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "HTTP " + r.status);
      local.editing = false; local.key = null;
      local.msg = { kind: "ok", text: _t("costs.rates.saved") };
      await load();
    } catch (e) {
      local.msg = { kind: "err", text: _t("common.error") + ": " + (e.message || e) };
    } finally {
      local.saving = false; window.App.rerender();
      setTimeout(() => { local.msg = null; window.App.rerender(); }, 5000);
    }
  }

  window.Views.costs = { titleKey: "page.costs.title", eyebrowKey: "page.costs.eyebrow", render, mount };
})();
