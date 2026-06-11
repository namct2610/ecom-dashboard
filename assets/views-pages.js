/* ============================================================
   Views: Orders, Products, Customers, Traffic
   ============================================================ */
(function () {
  const S = window.Store, F = window.F, UI = window.UI, C = window.Charts;
  const _t = (k, f) => (window.t ? window.t(k, f) : (f || k));
  const _tf = (k, v) => (window.tf ? window.tf(k, v) : k);
  const escHtml = (s) => String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  let detailLoadingKey = null;

  const CAL_D = ["mon","tue","wed","thu","fri","sat","sun"];
  const dayLabels = () => CAL_D.map((d) => _t("period.cal." + d));

  function heatHTML(key, platform) {
    const { m, max } = S.heatMatrix(key, platform);
    const days = dayLabels();
    let h = `<div style="display:grid;grid-template-columns:30px 1fr;gap:6px;align-items:center;min-width:560px"><div></div><div style="display:grid;grid-template-columns:repeat(24,1fr);gap:3px;font-size:9.5px;color:var(--ink-3);font-weight:700">`;
    for (let x = 0; x < 24; x++) h += `<div style="text-align:center">${x % 3 === 0 ? x : ""}</div>`;
    h += `</div>`;
    for (let d = 0; d < 7; d++) {
      h += `<div style="font-size:11px;font-weight:700;color:var(--ink-3)">${days[d]}</div><div class="heat-grid" style="grid-template-columns:repeat(24,1fr)">`;
      for (let x = 0; x < 24; x++) { const v = m[d][x], t = max ? v / max : 0; const bg = v === 0 ? "var(--track)" : `color-mix(in oklch, var(--brand) ${14 + t * 70}%, var(--surface))`; h += `<div class="heat-cell" ${v ? `data-v="${v}"` : ""} title="${days[d]} ${x}h · ${v} ${_t("common.orders_unit")}" style="background:${bg}"></div>`; }
      h += `</div>`;
    }
    return h + `</div>`;
  }

  function statusInfo(s) {
    if (s === "cancelled") return [_t("status.cancelled"), "st-cancel"];
    if (s === "pending") return [_t("status.processing"), "st-ship"];
    return [_t("status.completed"), "st-done"];
  }
  const dtShort = (s) => { const [d, t] = s.split(" "); const p = d.split("-"); return p[2] + "/" + p[1] + " " + t.slice(0, 5); };

  function kpiRow(items) {
    return `<div class="g12">${items.map((o) => `<div data-collapse style="grid-column:span 3"><div class="card kpi reveal"><div class="kpi-label">${o.ico} ${o.label}</div><div class="kpi-value tnum">${o.value}${o.unit ? `<span class="unit">${o.unit}</span>` : ""}</div><div class="kpi-foot">${o.delta || ""}<span>${o.foot}</span></div></div></div>`).join("")}</div>`;
  }

  /* ===================== ORDERS ===================== */
  window.Views.orders = {
    titleKey: "page.orders.title", eyebrowKey: "page.orders.eyebrow", 
    render() {
      const st = S.state, range = S.currentRange(), cmpRange = S.compareCurrentRange(), plat = st.platform;
      const cur = S.aggRange(range, plat), cmp = cmpRange ? S.aggRange(cmpRange, plat) : null;
      const cmpLab = S.compareLabel(st.period, st.compare);
      const stt = S.statusBreakdown(st.period, plat);
      const pending = (stt.pending || 0);
      const dd = (c, p, inv) => UI.deltaChip(F.delta(c, p), inv);
      const kpis = kpiRow([
        { label: _t("kpi.orders"), ico: `<span class="kpi-ico">${UI.ICON.orders}</span>`, value: F.viInt(cur.orders), unit: " " + _t("common.orders_unit"), delta: cmp ? dd(cur.orders, cmp.orders) : "", foot: cmp ? `vs ${F.viInt(cmp.orders)} ${_t("common.orders_unit")}` : S.periodLabel(st.period).toLowerCase() },
        { label: _t("kpi.completed"), ico: `<span class="kpi-ico">${UI.ICON.check}</span>`, value: F.viInt(cur.completed), delta: `<span class="tag" style="color:var(--pos)">${F.pct(cur.completionRate)}</span>`, foot: _t("kpi.completed_unit") },
        { label: _t("kpi.cancelled"), ico: `<span class="kpi-ico">${UI.ICON.cancel}</span>`, value: F.viInt(cur.cancelled), delta: `<span class="tag" style="color:var(--neg)">${F.pct(cur.cancelRate)}</span>`, foot: _t("kpi.cancelled_foot") },
        { label: _t("status.processing"), ico: `<span class="kpi-ico">${UI.ICON.orders}</span>`, value: F.viInt(pending), foot: _t("kpi.pending_foot") },
      ]);
      // recent (filter by platform if not all)
      const rangeDetail = S.getRangeDetail(st.period, plat);
      const recentSource = Array.isArray(rangeDetail && rangeDetail.recentOrders)
        ? rangeDetail.recentOrders
        : S.DASH.recentOrders;
      const recent = recentSource.filter((o) => plat === "all" || o.platform === plat).slice(0, 40);
      const rows = recent.map((o) => { const [lab, cls] = statusInfo(o.status); return `<tr>
        <td class="mono" style="font-size:11.5px">${o.order_id}</td>
        <td><span class="pchip">${UI.pdot(o.platform)}${S.PLAT[o.platform].label.replace(" Shop", "")}</span></td>
        <td><div class="pname" style="max-width:280px">${(o.product || "").replace(/^\[.*?\]\s*/, "")}</div>${o.items > 1 ? `<span style="font-size:11px;color:var(--ink-3)">+${o.items - 1} ${_t("th.product").toLowerCase()}</span>` : ""}</td>
        <td>${o.city}</td>
        <td class="num tnum">${F.moneyFull(o.amount)}</td>
        <td><span class="status-pill ${cls}">${lab}</span></td>
        <td style="color:var(--ink-3);font-size:12px" class="hide-md">${dtShort(o.created)}</td></tr>`; }).join("");

      return kpis + `
      <div class="g12 section-gap">
        <div data-collapse style="grid-column:span 8" class="card">
          <div class="card-head"><div><div class="card-title">${_t("orders.daily.title")}</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()} · ${plat === "all" ? _t("ovw.trend.all_platforms") : S.PLAT[plat].label}</div></div></div>
          <div class="card-pad" style="padding-top:14px"><div class="chart-wrap" style="height:250px"><canvas id="ordChart"></canvas></div></div>
        </div>
        <div data-collapse style="grid-column:span 4" class="card">
          <div class="card-head"><div><div class="card-title">${_t("th.status")} ${_t("common.orders_unit")}</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()}</div></div></div>
          <div class="card-pad"><div class="donut-wrap" style="height:170px"><canvas id="statusDonut"></canvas>
            <div class="donut-center"><div><div class="big tnum">${F.viInt(cur.orders)}</div><div class="small">${_t("common.orders_unit")}</div></div></div></div>
            <div style="margin-top:14px;display:flex;flex-direction:column;gap:9px">
              <div style="display:flex;align-items:center;gap:9px;font-size:13px"><span class="legend-swatch" style="background:var(--pos)"></span>${_t("status.completed")}<span style="margin-left:auto;font-weight:800" class="tnum">${F.viInt(cur.completed)}</span></div>
              <div style="display:flex;align-items:center;gap:9px;font-size:13px"><span class="legend-swatch" style="background:var(--neg)"></span>${_t("status.cancelled")}<span style="margin-left:auto;font-weight:800" class="tnum">${F.viInt(cur.cancelled)}</span></div>
            </div></div>
        </div>
      </div>
       <div class="card section-gap"><div class="card-head"><div><div class="card-title">${_t("ovw.heat.title")}</div><div class="card-sub">${_t("ovw.heat.density")} · ${_t("period.cal.mon")} × h · ${S.periodLabel(st.period).toLowerCase()}</div></div></div><div class="card-pad" style="overflow-x:auto">${heatHTML(st.period, plat)}</div></div>
      <div class="card section-gap"><div class="card-head"><div><div class="card-title">${_t("ovw.recent_orders.title")}</div><div class="card-sub">${_tf("orders.recent_n", { n: recent.length })}${plat !== "all" ? " · " + S.PLAT[plat].label : ""}</div></div></div>
        <div class="card-pad" style="padding:6px;overflow-x:auto"><table class="tbl"><thead><tr><th>${_t("th.order_id")}</th><th>${_t("th.platform")}</th><th>${_t("th.product")}</th><th>${_t("th.region")}</th><th class="num">${_t("th.revenue")}</th><th>${_t("th.status")}</th><th class="hide-md">${_t("th.uploaded_at")}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    },
    mount(root) {
      const st = S.state, range = S.currentRange(), plat = st.platform;
      const oc = root.querySelector("#ordChart"); if (oc) C.ordersTrend(oc, S.dailySeriesRange(range, plat), { platform: plat });
      const cur = S.aggRange(range, plat);
      const sd = root.querySelector("#statusDonut"); if (sd) C.donut(sd, [{ label: _t("status.completed"), value: cur.completed, color: "--pos" }, { label: _t("status.cancelled"), value: cur.cancelled, color: "--neg" }, { label: _t("status.other"), value: Math.max(0, cur.orders - cur.completed - cur.cancelled), color: "--border-strong" }]);
      const cacheKey = st.period + "|" + st.platform;
      if (!S.getRangeDetail(st.period, st.platform) && detailLoadingKey !== cacheKey) {
        detailLoadingKey = cacheKey;
        S.ensureRangeDetail(st.period, st.platform).then(() => {
          if (detailLoadingKey === cacheKey) window.App.rerender();
        }).catch(() => {}).finally(() => {
          if (detailLoadingKey === cacheKey) detailLoadingKey = null;
        });
      }
    },
  };

  /* ===================== PRODUCTS ===================== */
  let prodMetric = "rev";
  window.Views.products = {
    titleKey: "page.products.title", eyebrowKey: "page.products.eyebrow",
    render() {
      const st = S.state;
      const cats = S.categoryBreakdown(st.period, st.platform).filter((c) => c.revenue > 0);
      const list = S.products(st.period, prodMetric, st.platform).slice(0, 15);
      const maxV = Math.max(...list.map((p) => prodMetric === "qty" ? p.qty : p.revenue), 1);
      const rows = list.map((p, i) => `<tr>
        <td><div class="prod"><span class="rank">${i + 1}</span><div style="min-width:0"><div class="pname">${p.cleanName}</div><div class="psku">${p.sku}</div></div></div></td>
        <td><span class="tag" style="border-color:transparent;background:color-mix(in oklch, ${S.CAT[p.cat].color.startsWith("--") ? "var(" + S.CAT[p.cat].color + ")" : S.CAT[p.cat].color} 14%, transparent);color:${S.CAT[p.cat].color.startsWith("--") ? "var(" + S.CAT[p.cat].color + ")" : S.CAT[p.cat].color}">${S.catLabel(p.cat)}</span></td>
        <td><span class="pchip">${UI.pdot(p.platform)}${S.PLAT[p.platform].label.replace(" Shop", "")}</span></td>
        <td class="num">${F.viInt(p.qty)}</td>
        <td class="num"><b>${F.money(p.revenue)}</b></td>
        <td class="num" style="width:120px"><div class="cmp-track"><div class="cmp-fill" style="width:${(prodMetric === "qty" ? p.qty : p.revenue) / maxV * 100}%;background:var(--brand)"></div></div></td>
      </tr>`).join("");
      const totalCatRev = cats.reduce((t, c) => t + c.revenue, 0);
      return `
      <div class="g12">
        <div data-collapse style="grid-column:span 5" class="card">
          <div class="card-head"><div><div class="card-title">${_t("ovw.category.title")}</div><div class="card-sub">${_t("ovw.category.by_revenue")} · ${S.periodLabel(st.period).toLowerCase()}</div></div></div>
          <div class="card-pad"><div class="donut-wrap" style="height:180px"><canvas id="catDonut2"></canvas><div class="donut-center"><div><div class="big tnum">${F.money(totalCatRev)}</div><div class="small">${_t("ovw.top_products.by_rev")}</div></div></div></div>
            <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
              ${cats.map((c) => `<div><div style="display:flex;align-items:center;gap:9px;font-size:13px;margin-bottom:4px"><span class="legend-swatch" style="background:${UI.cssColor(c.color)}"></span><b>${S.catLabel(c.cat)}</b><span style="margin-left:auto;font-weight:800" class="tnum">${F.money(c.revenue)}</span></div><div class="cmp-track"><div class="cmp-fill" style="width:${c.revenue / (cats[0].revenue || 1) * 100}%;background:${UI.cssColor(c.color)}"></div></div></div>`).join("")}
            </div></div>
        </div>
        <div data-collapse style="grid-column:span 7" class="card">
          <div class="card-head"><div><div class="card-title">${_t("ovw.top_products.title")}</div><div class="card-sub">${_t("ovw.top_products.sub", { period: S.periodLabel(st.period).toLowerCase() })}</div>
            <div class="miniseg" id="prodSeg"><button class="${prodMetric === "rev" ? "active" : ""}" data-m="rev">${_t("ovw.cmp.revenue")}</button><button class="${prodMetric === "qty" ? "active" : ""}" data-m="qty">${_t("ovw.top_products.by_qty")}</button></div>
          </div>
          <div class="card-pad" style="padding:6px;overflow-x:auto"><table class="tbl"><thead><tr><th>${_t("th.product")}</th><th>${_t("th.category")}</th><th>${_t("th.platform")}</th><th class="num">${_t("th.qty_sold")}</th><th class="num">${_t("th.revenue")}</th><th class="num">${prodMetric === "qty" ? _t("th.qty_sold") : _t("th.revenue")}</th></tr></thead><tbody>${rows}</tbody></table></div>
        </div>
      </div>`;
    },
    mount(root) {
      const cats = S.categoryBreakdown(S.state.period, S.state.platform).filter((c) => c.revenue > 0);
      const cn = root.querySelector("#catDonut2"); if (cn) C.donut(cn, cats.map((c) => ({ label: S.catLabel(c.cat), value: c.revenue, color: c.color })));
      root.querySelector("#prodSeg")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { prodMetric = b.dataset.m; window.App.rerender(); } });
      const cacheKey = S.state.period + "|" + S.state.platform;
      if (!S.getRangeDetail(S.state.period, S.state.platform) && detailLoadingKey !== cacheKey) {
        detailLoadingKey = cacheKey;
        S.ensureRangeDetail(S.state.period, S.state.platform).then(() => {
          if (detailLoadingKey === cacheKey) window.App.rerender();
        }).catch(() => {}).finally(() => {
          if (detailLoadingKey === cacheKey) detailLoadingKey = null;
        });
      }
    },
  };

  /* ===================== CUSTOMERS ===================== */
  let customerDetailData = null;
  let customerLoadingKey = null;
  const customerErrors = {};

  function customerLoadingShell() {
    return `
      <div class="g12">
        ${Array.from({ length: 4 }).map(() => `<div data-collapse style="grid-column:span 3"><div class="card kpi"><div class="card-pad" style="padding:20px"><div style="height:12px;width:42%;border-radius:999px;background:var(--surface-3)"></div><div style="height:28px;width:68%;border-radius:12px;background:var(--surface-2);margin-top:14px"></div><div style="height:10px;width:54%;border-radius:999px;background:var(--surface-3);margin-top:14px"></div></div></div></div>`).join("")}
      </div>
      <div class="g12 section-gap">
        <div data-collapse style="grid-column:span 7"><div class="card"><div class="card-head"><div><div class="card-title">${_t("customers.top_buyers.title")}</div><div class="card-sub">${_t("common.loading")}</div></div></div><div class="card-pad" style="height:320px"></div></div></div>
        <div data-collapse style="grid-column:span 5"><div class="card"><div class="card-head"><div><div class="card-title">${_t("customers.geo.title")}</div><div class="card-sub">${_t("common.loading")}</div></div></div><div class="card-pad" style="height:320px"></div></div></div>
      </div>`;
  }

  window.Views.customers = {
    titleKey: "page.customers.title", eyebrowKey: "page.customers.eyebrow",
    render() {
      const st = S.state, range = S.currentRange(), plat = st.platform;

      const cacheKey = st.period + "|" + st.platform;
      const apiData = (window.Store._customerCache || {})[cacheKey];
      const customerError = customerErrors[cacheKey];

      if (customerError) {
        return `<div class="card card-pad" style="text-align:center;color:var(--neg);font-weight:700">
          ${_t("common.error")}: ${escHtml(customerError)}
          <div style="margin-top:12px"><button class="ctrl-btn" id="custRetry">${_t("common.retry")}</button></div>
        </div>`;
      }

      if (!apiData) {
        if (customerLoadingKey !== cacheKey) {
          customerLoadingKey = cacheKey;
          S.fetchCustomers().then(() => {
            customerLoadingKey = null;
            delete customerErrors[cacheKey];
            window.App.rerender();
          }).catch((e) => {
            customerLoadingKey = null;
            customerErrors[cacheKey] = (e && e.message) ? e.message : String(e);
            window.App.rerender();
          });
        }
        return customerLoadingShell();
      }

      const data = apiData;
      const summary = data.summary || {};
      const segments = data.customer_segments || {};
      const buyers = data.buyer_stats || [];
      const cities = data.city_distribution || [];

      const totalNF = S.PKEYS.map((k) => ({ key: k, ...S.PLAT[k], ...S.trafficAggRange(range, k) }));
      const totalNFVal = totalNF.reduce((t, p) => t + p.nf, 0);

      const kpis = kpiRow([
        { label: _t("customers.summary.total_orders"), ico: `<span class="kpi-ico">${UI.ICON.orders}</span>`, value: F.viInt(summary.total_orders || 0), delta: "", foot: S.periodLabel(st.period).toLowerCase() },
        { label: _t("customers.summary.avg_order"), ico: `<span class="kpi-ico">${UI.ICON.aov}</span>`, value: F.money(summary.avg_order_value || 0), delta: "", foot: _t("kpi.avg_order_foot") },
        { label: _t("customers.summary.unique_buyers"), ico: `<span class="kpi-ico">${UI.ICON.people}</span>`, value: F.viInt(summary.unique_buyers || 0), delta: "", foot: _t("customers.segment.title").toLowerCase() },
        { label: _t("customers.summary.conversion"), ico: `<span class="kpi-ico">${UI.ICON.aov}</span>`, value: F.viDec(summary.conv_rate || 0, 2), unit: "%", delta: "", foot: _t("traffic.conv.sub") },
      ]);

      // Segment cards
      const segCards = [
        { key: "new_buyers", label: _t("customers.segment.new"), count: segments.new_buyers || 0, color: "var(--pos)" },
        { key: "returning_buyers", label: _t("customers.segment.returning"), count: segments.returning_buyers || 0, color: "var(--shopee)" },
        { key: "potential_buyers", label: _t("customers.segment.potential"), count: segments.potential_buyers || 0, color: "var(--ink-3)" },
      ].map((s) => `<div class="card card-pad" style="text-align:center">
        <div style="font-size:28px;font-weight:800;letter-spacing:-.02em;color:${s.color}" class="tnum">${F.viInt(s.count)}</div>
        <div style="font-size:12.5px;color:var(--ink-3);font-weight:600;margin-top:4px">${s.label}</div>
      </div>`).join("");

      // Top buyers table
      const maxRev = buyers.length ? buyers[0].revenue : 1;
      const buyerRows = buyers.slice(0, 15).map((b, i) => {
        const name = b.buyer_name || b.buyer_username || "—";
        return `<tr data-buyer="${escHtml(b.buyer_username)}" style="cursor:pointer" class="buyer-row">
          <td>${i + 1}</td>
          <td style="font-weight:700;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(name)}</td>
          <td class="num">${F.viInt(b.order_count)}</td>
          <td class="num"><b>${F.money(b.revenue)}</b></td>
          <td class="num" style="width:120px"><div class="cmp-track"><div class="cmp-fill" style="width:${b.revenue / maxRev * 100}%;background:var(--brand)"></div></div></td>
        </tr>`;
      }).join("");

      // City distribution
      const maxG = Math.max(...cities.map((g) => g.orders), 1);
      const geoRows = cities.map((g) => `<tr><td>${g.city}</td><td class="num">${F.viInt(g.orders)}</td><td class="num">${F.pct(g.percentage ?? 0)}</td><td class="num" style="width:160px"><div class="cmp-track"><div class="cmp-fill" style="width:${g.orders / maxG * 100}%;background:var(--brand)"></div></div></td></tr>`).join("");

      const fRows = totalNF.map((p) => `<div class="cmp-row"><div class="cmp-name">${UI.pdot(p.key)}${p.label}</div><div class="cmp-track"><div class="cmp-fill" style="width:${totalNFVal ? p.nf / Math.max(...totalNF.map((x) => x.nf), 1) * 100 : 0}%;background:var(--${p.key})"></div></div><div class="cmp-val">${F.viInt(p.nf)}</div></div>`).join("");

      return kpis + `
      <div class="g12 section-gap">${segCards}</div>
      <div class="g12 section-gap">
        <div data-collapse style="grid-column:span 7" class="card">
          <div class="card-head"><div><div class="card-title">${_t("customers.top_buyers.title")}</div><div class="card-sub">${_tf("customers.top_buyers.sub", { period: S.periodLabel(st.period).toLowerCase() })}</div></div></div>
          <div class="card-pad" style="padding:6px;overflow-x:auto"><table class="tbl"><thead><tr><th>#</th><th>${_t("customers.table.username")}</th><th class="num">${_t("th.orders")}</th><th class="num">${_t("th.revenue")}</th><th></th></tr></thead><tbody>${buyerRows}</tbody></table></div>
        </div>
        <div data-collapse style="grid-column:span 5" class="card">
          <div class="card-head"><div><div class="card-title">${_t("customers.geo.title")}</div><div class="card-sub">${_t("ovw.geo.by_orders")} · ${S.periodLabel(st.period).toLowerCase()}</div></div></div>
          <div class="card-pad" style="padding:6px"><table class="tbl"><thead><tr><th>${_t("th.city")}</th><th class="num">${_t("th.orders")}</th><th class="num">${_t("th.share")}</th><th></th></tr></thead><tbody>${geoRows}</tbody></table></div>
        </div>
      </div>
      <div class="g12 section-gap">
        <div data-collapse style="grid-column:span 5" class="card">
          <div class="card-head"><div><div class="card-title">${_t("kpi.new_followers")}</div><div class="card-sub">${_t("ovw.trend.all_platforms")} · ${S.periodLabel(st.period).toLowerCase()}</div></div></div>
          <div class="card-pad"><div style="font-size:30px;font-weight:800;letter-spacing:-.02em" class="tnum">${F.viInt(totalNFVal)} <span style="font-size:14px;color:var(--ink-3);font-weight:700">${_t("traffic.followers_new")}</span></div><div style="display:flex;flex-direction:column;gap:6px;margin-top:14px">${fRows}</div>
          <div class="note" style="margin-top:16px">${UI.ICON.people} ${_t("customers.followers.note")}</div></div>
        </div>
        <div data-collapse style="grid-column:span 7" class="card">
          <div class="card-head"><div><div class="card-title">${_t("customers.segment.title")}</div></div></div>
          <div class="card-pad" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding-top:14px">
            ${segCards}
          </div>
        </div>
      </div>
      <div id="customerDetailPanel"></div>`;
    },
    mount(root) {
      const cacheKey = S.state.period + "|" + S.state.platform;
      const cached = (window.Store._customerCache || {})[cacheKey];
      const customerError = customerErrors[cacheKey];
      if (!cached && !customerLoadingKey && !customerError) {
        customerLoadingKey = cacheKey;
        S.fetchCustomers().then(() => {
          customerLoadingKey = null;
          delete customerErrors[cacheKey];
          window.App.rerender();
        }).catch((e) => {
          customerLoadingKey = null;
          customerErrors[cacheKey] = (e && e.message) ? e.message : String(e);
          window.App.rerender();
        });
      }

      // Retry handler when previous fetch errored.
      root.querySelector("#custRetry")?.addEventListener("click", () => {
        delete customerErrors[cacheKey];
        customerLoadingKey = null;
        window.App.rerender();
      });

      // Detail loading for range
      if (!S.getRangeDetail(S.state.period, S.state.platform) && detailLoadingKey !== cacheKey) {
        detailLoadingKey = cacheKey;
        S.ensureRangeDetail(S.state.period, S.state.platform).then(() => {
          if (detailLoadingKey === cacheKey) window.App.rerender();
        }).catch(() => {}).finally(() => {
          if (detailLoadingKey === cacheKey) detailLoadingKey = null;
        });
      }

      // Click handler for buyer rows
      root.querySelectorAll(".buyer-row").forEach((row) => {
        row.addEventListener("click", () => {
          const buyer = row.dataset.buyer;
          if (!buyer) return;
          showCustomerDetail(buyer);
        });
      });
    },
  };

  function showCustomerDetail(buyerUsername) {
    const panel = document.getElementById("customerDetailPanel");
    if (!panel) return;
    panel.innerHTML = `<div class="card section-gap"><div class="card-pad" style="text-align:center;color:var(--ink-3);font-weight:600">${_t("common.loading")}</div></div>`;

    S.fetchCustomerDetail(buyerUsername).then((data) => {
      if (!data || !data.profile) { panel.innerHTML = ""; return; }
      const p = data.profile;
      const s = data.summary || {};
      const orders = data.orders || [];
      const st = S.state;

      const dtShort2 = (s) => { if (!s) return "—"; const [d, t] = s.split(" "); const p = d.split("-"); return p[2] + "/" + p[1] + "/" + p[0] + (t ? " " + t.slice(0, 5) : ""); };

      const statusPill = (status) => { const [lab, cls] = statusInfo(status); return `<span class="status-pill ${cls}">${lab}</span>`; };

      const orderRows = orders.slice(0, 20).map((o) => `<tr>
        <td><span class="pchip">${UI.pdot(o.platform === "tiktokshop" ? "tiktok" : o.platform)}${S.PLAT[o.platform === "tiktokshop" ? "tiktok" : o.platform] ? S.PLAT[o.platform === "tiktokshop" ? "tiktok" : o.platform].label.replace(" Shop", "") : o.platform}</span></td>
        <td class="mono" style="font-size:11.5px">${o.order_id}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(o.products || "").split(" • ").slice(0, 2).join(" · ") || "—"}</td>
        <td class="num tnum">${F.moneyFull(o.order_total)}</td>
        <td>${statusPill(o.normalized_status)}</td>
        <td style="color:var(--ink-3);font-size:12px" class="hide-md">${dtShort2(o.order_created_at)}</td>
      </tr>`).join("");

      panel.innerHTML = `
      <div class="card section-gap">
        <div class="card-head">
          <div>
            <div class="card-title">${_t("customers.detail.title")}</div>
            <div class="card-sub">${escHtml(p.buyer_name || p.buyer_username)}${p.shipping_city ? " · " + escHtml(p.shipping_city) : ""}</div>
          </div>
          <button class="ctrl-btn" id="custDetailBack">${_t("customers.detail.back")}</button>
        </div>
        <div class="card-pad">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:18px">
            <div><div class="eyebrow">${_t("customers.detail.lifetime")}</div><div style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin-top:4px" class="tnum">${F.viInt(s.lifetime_order_count || 0)} <span style="font-size:13px;color:var(--ink-3);font-weight:600">${_t("common.orders_unit")}</span></div></div>
            <div><div class="eyebrow">${_t("th.revenue")}</div><div style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin-top:4px" class="tnum">${F.money(s.lifetime_revenue || 0)}</div></div>
            <div><div class="eyebrow">${_t("customers.detail.first_purchase")}</div><div style="font-size:13px;font-weight:600;margin-top:6px">${dtShort2(p.first_purchase_at)}</div></div>
            <div><div class="eyebrow">${_t("customers.detail.last_purchase")}</div><div style="font-size:13px;font-weight:600;margin-top:6px">${dtShort2(p.last_purchase_at)}</div></div>
          </div>
          ${s.filtered_order_count != null ? `<div class="note" style="margin-bottom:14px">${UI.ICON.info} ${_t("customers.detail.orders_in_period")} · ${F.viInt(s.filtered_order_count)} ${_t("common.orders_unit")} · ${F.money(s.filtered_revenue || 0)}</div>` : ""}
          <div style="font-weight:800;font-size:14px;margin-bottom:8px">${_t("customers.detail.order_history")}</div>
          <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>${_t("th.platform")}</th><th>${_t("th.order_id")}</th><th>${_t("th.product")}</th><th class="num">${_t("customers.table.amount")}</th><th>${_t("th.status")}</th><th class="hide-md">${_t("th.uploaded_at")}</th></tr></thead><tbody>${orderRows}</tbody></table></div>
        </div>
      </div>`;

      document.getElementById("custDetailBack")?.addEventListener("click", () => {
        panel.innerHTML = "";
        panel.scrollIntoView({ behavior: "smooth" });
      });
    }).catch(() => {
      panel.innerHTML = `<div class="card card-pad" style="text-align:center;color:var(--neg);font-weight:700">${_t("common.error")}</div>`;
    });
  }

  /* ===================== TRAFFIC ===================== */
  window.Views.traffic = {
    titleKey: "page.traffic.title", eyebrowKey: "page.traffic.eyebrow",
    render() {
      const st = S.state, range = S.currentRange(), cmpRange = S.compareCurrentRange(), plat = st.platform;
      const cur = S.trafficAggRange(range, plat), cmp = cmpRange ? S.trafficAggRange(cmpRange, plat) : null;
      const cmpLab = S.compareLabel(st.period, st.compare);
      const dd = (c, p) => UI.deltaChip(F.delta(c, p));
      const kpis = kpiRow([
        { label: _t("kpi.pageviews"), ico: `<span class="kpi-ico">${UI.ICON.eye_traffic}</span>`, value: F.num(cur.pv), delta: cmp ? dd(cur.pv, cmp.pv) : "", foot: cmp ? `vs ${F.num(cmp.pv)} · ${cmpLab}` : _t("common.page_views") },
        { label: _t("kpi.visits"), ico: `<span class="kpi-ico">${UI.ICON.people}</span>`, value: F.num(cur.visits), delta: cmp ? dd(cur.visits, cmp.visits) : "", foot: cmp ? `vs ${F.num(cmp.visits)} · ${cmpLab}` : _t("kpi.visits").toLowerCase() },
        { label: _t("kpi.conversion"), ico: `<span class="kpi-ico">${UI.ICON.aov}</span>`, value: F.viDec(cur.conv, 2), unit: "%", delta: cmp ? dd(cur.conv, cmp.conv) : "", foot: _t("traffic.conv.sub") },
        { label: _t("kpi.new_followers"), ico: `<span class="kpi-ico">${UI.ICON.people}</span>`, value: F.viInt(cur.nf), delta: cmp ? dd(cur.nf, cmp.nf) : "", foot: cmp ? `vs ${F.viInt(cmp.nf)}` : _t("traffic.followers_new") },
      ]);
      const tp = S.PKEYS.map((k) => ({ key: k, ...S.PLAT[k], ...S.trafficAggRange(range, k) }));
      const maxVis = Math.max(...tp.map((p) => p.visits), 1);
      const tRows = tp.map((p) => `<tr><td><span class="pchip">${UI.pdot(p.key)}<b>${p.label}</b></span></td><td class="num">${F.viInt(p.pv)}</td><td class="num">${F.viInt(p.visits)}</td><td class="num">${F.viInt(p.completed)}</td><td class="num"><b>${F.pct(p.conv)}</b></td><td class="num">${F.viInt(p.nf)}</td><td class="num" style="width:140px"><div class="cmp-track"><div class="cmp-fill" style="width:${p.visits / maxVis * 100}%;background:var(--${p.key})"></div></div></td></tr>`).join("");
      return kpis + `
      <div class="g12 section-gap">
        <div data-collapse style="grid-column:span 8" class="card">
          <div class="card-head"><div><div class="card-title">${_t("traffic.daily.title")}</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()} · ${plat === "all" ? _t("ovw.trend.all_platforms") : S.PLAT[plat].label}</div></div>
            <div class="legend">${S.PKEYS.map((k) => `<span class="legend-item"><span class="legend-swatch" style="background:var(--${k})"></span>${S.PLAT[k].label}</span>`).join("")}</div></div>
          <div class="card-pad" style="padding-top:14px"><div class="chart-wrap" style="height:260px"><canvas id="trafChart"></canvas></div></div>
        </div>
        <div data-collapse style="grid-column:span 4" class="card">
          <div class="card-head"><div><div class="card-title">${_t("traffic.conv.title")}</div><div class="card-sub">${_t("traffic.conv.sub")}</div></div></div>
          <div class="card-pad" style="display:flex;flex-direction:column;gap:14px;padding-top:18px">
            ${tp.map((p) => `<div><div style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:5px"><span class="legend-swatch" style="background:var(--${p.key})"></span><b>${p.label}</b><span style="margin-left:auto;font-weight:800" class="tnum">${F.pct(p.conv)}</span></div><div class="cmp-track" style="height:9px"><div class="cmp-fill" style="width:${Math.min(100, p.conv / Math.max(...tp.map((x) => x.conv), 1) * 100)}%;background:var(--${p.key})"></div></div><div style="font-size:11.5px;color:var(--ink-3);font-weight:600;margin-top:4px">${_tf("traffic.conv_line", { visits: F.viInt(p.visits), orders: F.viInt(p.completed) })}</div></div>`).join("")}
          </div>
        </div>
      </div>
      <div class="card section-gap"><div class="card-head"><div><div class="card-title">${_t("traffic.table.title")}</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()}</div></div></div>
        <div class="card-pad" style="padding:6px;overflow-x:auto"><table class="tbl"><thead><tr><th>${_t("th.platform")}</th><th class="num">${_t("kpi.pageviews")}</th><th class="num">${_t("kpi.visits")}</th><th class="num">${_t("kpi.completed")}</th><th class="num">${_t("th.conv_pct")}</th><th class="num">${_t("kpi.new_followers")}</th><th></th></tr></thead><tbody>${tRows}</tbody></table></div></div>`;
    },
    mount(root) {
      const st = S.state, range = S.currentRange();
      const tc = root.querySelector("#trafChart");
      if (tc) {
        const defs = S.PKEYS.map((k) => { const s = S.trafficSeriesRange(range, k); return { label: S.PLAT[k].label, data: s.map((d) => d.visits), color: "--" + k, _dates: s.map((d) => d.date) }; });
        const basis = S.trafficSeriesRange(range, "shopee");
        const labels = (basis[0] ? basis : S.trafficSeriesRange(range, "lazada")).map((d) => { const p = d.date.split("-"); return p[2] + "/" + p[1]; });
        C.lineSeries(tc, labels, defs);
      }
    },
  };
})();
