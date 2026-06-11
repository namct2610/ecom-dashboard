/* ============================================================
   View: Overview (Tổng quan)
   ============================================================ */
(function () {
  const S = window.Store, F = window.F, UI = window.UI, C = window.Charts;
  const _t = (k, f) => (window.t ? window.t(k, f) : (f || k));
  const _tf = (k, v) => (window.tf ? window.tf(k, v) : k);
  let detailLoadingKey = null;

  let cmpMetric = "revenue";
  let hideShopee = false;

  function ppChip(cur, prev, invert) {
    if (prev == null) return "";
    const pp = cur - prev;
    let dir = Math.abs(pp) < 0.05 ? "flat" : pp > 0 ? "up" : "down";
    let cls = invert ? (dir === "up" ? "down" : dir === "down" ? "up" : "flat") : dir;
    const arrow = dir === "up" ? UI.ICON.up : dir === "down" ? UI.ICON.down : "";
    return `<span class="delta ${cls}">${arrow}${pp > 0 ? "+" : ""}${F.viDec(pp, 1)}%</span>`;
  }

  function kpiCard(o) {
    return `<div class="card kpi reveal">
      <div class="kpi-label">${o.ico} ${o.label}</div>
      <div class="kpi-value tnum">${o.value}${o.unit ? `<span class="unit">${o.unit}</span>` : ""}</div>
      <div class="kpi-foot">${o.delta || ""}<span>${o.foot}</span></div>
    </div>`;
  }

  function render() {
    const st = S.state;
    const range = S.currentRange();
    const cmpRange = S.compareCurrentRange();
    const plat = st.platform;
    const cur = S.aggRange(range, plat);
    const cmp = cmpRange ? S.aggRange(cmpRange, plat) : null;
    const cmpLab = S.compareLabel(st.period, st.compare);
    const dd = (c, p, inv) => UI.deltaChip(F.delta(c, p), inv);

    // KPI cards
    const cards = [
      kpiCard({
        label: _t("kpi.revenue"), ico: `<span class="kpi-ico">${UI.ICON.revenue}</span>`,
        value: F.money(cur.revenue),
        delta: cmp ? dd(cur.revenue, cmp.revenue) : "",
        foot: cmp ? `vs ${F.money(cmp.revenue)}` : S.periodLabel(st.period).toLowerCase(),
      }),
      kpiCard({
        label: _t("kpi.orders"), ico: `<span class="kpi-ico">${UI.ICON.orders}</span>`,
        value: F.viInt(cur.orders), unit: " " + _t("common.orders_unit"),
        delta: cmp ? dd(cur.orders, cmp.orders) : "",
        foot: cmp ? `vs ${F.viInt(cmp.orders)} ${_t("common.orders_unit")}` : `${F.viInt(cur.completed)} ${_t("kpi.completed_unit")}`,
      }),
      kpiCard({
        label: _t("kpi.aov"), ico: `<span class="kpi-ico">${UI.ICON.aov}</span>`,
        value: F.money(cur.aov),
        delta: cmp ? dd(cur.aov, cmp.aov) : "",
        foot: cmp ? `vs ${F.money(cmp.aov)}` : _t("kpi.avg_order_foot"),
      }),
      kpiCard({
        label: _t("kpi.completion_rate"), ico: `<span class="kpi-ico">${UI.ICON.check}</span>`,
        value: F.viDec(cur.completionRate, 1), unit: "%",
        delta: cmp ? ppChip(cur.completionRate, cmp.completionRate) : `<span class="tag" style="color:var(--neg)">${F.pct(cur.cancelRate)} ${_t("kpi.cancelled_foot").split(" ")[0]}</span>`,
        foot: `${F.pct(cur.cancelRate)} ${_t("kpi.cancelled_foot")}`,
      }),
    ].map((c) => `<div data-collapse style="grid-column:span 3">${c}</div>`).join("");

    // ── Row 2: Revenue trend + Share donut ──
    const trend = S.businessTrend(st.period);
    const trendModeName = S.periodMode(st.period);
    const trendSub = trendModeName === "month"
      ? `${_tf("period.month_n", { n: +(S.periodLabel(st.period).match(/\d+/) || [0])[0], y: range.start.slice(0, 4) })} · ${plat === "all" ? _t("ovw.trend.all_platforms") : S.PLAT[plat].label}`
      : trendModeName === "year"
        ? `${_t("ovw.trend.title").toLowerCase()} · ${plat === "all" ? _t("ovw.trend.all_platforms") : S.PLAT[plat].label}`
        : `${S.periodLabel(st.period).toLowerCase()} · ${plat === "all" ? _t("ovw.trend.all_platforms") : S.PLAT[plat].label}`;

    const pmAll = S.PKEYS.map((k) => ({ key: k, ...S.PLAT[k], ...S.aggRange(range, k) }));
    const totalRev = pmAll.reduce((t, p) => t + p.revenue, 0);
    pmAll.forEach((p) => { p.share = totalRev ? p.revenue / totalRev * 100 : 0; });
    const pm = hideShopee ? pmAll.filter((p) => p.key !== "shopee") : pmAll;

    // ── Row 3: Order trend + Category donut ──

    // ── Row 4: Platform comparison + Geo distribution ──
    const metricLabel = { revenue: _t("ovw.cmp.revenue"), orders: _t("ovw.cmp.orders"), aov: _t("ovw.cmp.aov") }[cmpMetric];
    const accessor = { revenue: (p) => p.revenue, orders: (p) => p.orders, aov: (p) => p.aov }[cmpMetric];
    const fmt = { revenue: (v) => F.money(v), orders: (v) => F.viInt(v), aov: (v) => F.money(v) }[cmpMetric];
    const maxV = Math.max(...pm.map(accessor), 1);
    const cmpRows = pm.map((p) => `
      <div class="cmp-row reveal">
        <div class="cmp-name">${UI.pdot(p.key)}${p.label}</div>
        <div class="cmp-track"><div class="cmp-fill" style="width:${accessor(p) / maxV * 100}%;background:var(--${p.key})"></div></div>
        <div class="cmp-val">${fmt(accessor(p))}</div>
      </div>`).join("");

    const tblRows = pmAll.map((p) => {
      const pc = cmpRange ? S.aggRange(cmpRange, p.key) : null;
      return `<tr>
        <td><span class="pchip">${UI.pdot(p.key)}<b>${p.label}</b></span></td>
        <td class="num"><b>${F.money(p.revenue)}</b></td>
        <td class="num">${cmpRange ? dd(p.revenue, pc.revenue) : "—"}</td>
        <td class="num">${F.viInt(p.orders)}</td>
        <td class="num">${F.money(p.aov)}</td>
        <td class="num" style="color:${p.cancelRate > 16 ? "var(--neg)" : "var(--ink-2)"}">${F.pct(p.cancelRate)}</td>
        <td class="num"><div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><span style="min-width:42px;text-align:right"><b>${F.pct(p.share)}</b></span><div class="cmp-track" style="width:80px"><div class="cmp-fill" style="width:${p.share}%;background:var(--${p.key})"></div></div></div></td>
      </tr>`;
    }).join("");

    // geo
    const geo = S.cityDistribution(st.period, plat);
    const geoRows = geo.map((g) => `
      <div class="cmp-row" style="grid-template-columns:140px 1fr auto">
        <div class="cmp-name" style="font-weight:600">${g.city}</div>
        <div class="cmp-track"><div class="cmp-fill" style="width:${g.pct}%;background:${g.other ? "var(--ink-3)" : "var(--brand)"}"></div></div>
        <div class="cmp-val">${F.viInt(g.orders)} <span style="color:var(--ink-3);font-weight:600">(${F.pct(g.pct, 0)})</span></div>
      </div>`).join("");

    // category donut
    const cats = S.categoryBreakdown(st.period, plat).filter((c) => c.revenue > 0);

    // ── Row 5: Top 3 products + Heatmap ──
    const prods = S.products(st.period, "rev", plat).slice(0, 3);
    const prodRows = prods.map((p, i) => `
      <tr>
        <td><div class="prod"><span class="rank">${i + 1}</span><div style="min-width:0"><div class="pname">${p.cleanName}</div><div class="psku">${p.sku} · ${UI.pchip(p.platform)}</div></div></div></td>
        <td class="num">${F.viInt(p.qty)}</td>
        <td class="num"><b>${F.money(p.revenue)}</b></td>
      </tr>`).join("");

    // heatmap
    const { m, max } = S.heatMatrix(st.period, plat);
    const days = dayLabels();
    let heat = `<div style="display:grid;grid-template-columns:30px 1fr;gap:6px;align-items:center;min-width:560px">`;
    heat += `<div></div><div style="display:grid;grid-template-columns:repeat(24,1fr);gap:3px;font-size:9.5px;color:var(--ink-3);font-weight:700">`;
    for (let h = 0; h < 24; h++) heat += `<div style="text-align:center">${h % 3 === 0 ? h : ""}</div>`;
    heat += `</div>`;
    for (let d = 0; d < 7; d++) {
      heat += `<div style="font-size:11px;font-weight:700;color:var(--ink-3)">${days[d]}</div><div class="heat-grid" style="grid-template-columns:repeat(24,1fr)">`;
      for (let h = 0; h < 24; h++) {
        const v = m[d][h], t = max ? v / max : 0;
        const bg = v === 0 ? "var(--track)" : `color-mix(in oklch, var(--brand) ${14 + t * 70}%, var(--surface))`;
        heat += `<div class="heat-cell" ${v ? `data-v="${v}"` : ""} title="${days[d]} ${h}h · ${v} ${_t("common.orders_unit")}" style="background:${bg}"></div>`;
      }
      heat += `</div>`;
    }
    heat += `</div>`;

    return `
    <div class="g12">${cards}</div>

    <!-- Row 2: Revenue trend + Share donut -->
    <div class="g12 section-gap">
        <div data-collapse style="grid-column:span 8" class="card">
          <div class="card-head">
            <div><div class="card-title">${_t("ovw.trend.title")}</div><div class="card-sub">${trendSub}</div></div>
            ${plat === "all" ? `<div class="legend">${S.PKEYS.map((k) => `<span class="legend-item"><span class="legend-swatch" style="background:var(--${k})"></span>${S.PLAT[k].label}</span>`).join("")}</div>` : ""}
          </div>
        <div class="card-pad" style="padding-top:14px"><div class="chart-wrap" style="height:280px"><canvas id="monthlyChart"></canvas></div></div>
      </div>
      <div data-collapse style="grid-column:span 4" class="card">
        <div class="card-head"><div><div class="card-title">${_t("ovw.share.title")}</div><div class="card-sub">${hideShopee ? _t("ovw.share.hiding") : S.periodLabel(st.period).toLowerCase()}</div></div></div>
        <div class="card-pad">
          <div class="donut-wrap" style="height:172px"><canvas id="shareDonut"></canvas>
            <div class="donut-center"><div><div class="big tnum">${F.money(pm.reduce((t, p) => t + p.revenue, 0))}</div><div class="small">${hideShopee ? _t("ovw.share.total_lz_tt") : _t("ovw.share.total_revenue")}</div></div></div>
          </div>
          <div style="margin-top:14px;display:flex;flex-direction:column;gap:9px">
            ${pm.map((p) => `<div style="display:flex;align-items:center;gap:9px;font-size:13px"><span class="legend-swatch" style="background:var(--${p.key})"></span><b>${p.label}</b><span style="margin-left:auto;font-weight:800" class="tnum">${F.pct(p.share)}</span></div>`).join("")}
          </div>
        </div>
      </div>
    </div>

    <!-- Row 3: Order trend + Category donut -->
    <div class="g12 section-gap">
      <div data-collapse style="grid-column:span 8" class="card">
        <div class="card-head">
          <div><div class="card-title">${_t("ovw.daily.title")}</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()} · ${plat === "all" ? _t("ovw.trend.all_platforms") : S.PLAT[plat].label}</div></div>
          ${plat === "all" ? `<div class="legend">${S.PKEYS.map((k) => `<span class="legend-item"><span class="legend-swatch" style="background:var(--${k})"></span>${S.PLAT[k].label}</span>`).join("")}</div>` : ""}
        </div>
        <div class="card-pad" style="padding-top:14px"><div class="chart-wrap" style="height:280px"><canvas id="dailyChart"></canvas></div></div>
      </div>
      <div data-collapse style="grid-column:span 4" class="card">
        <div class="card-head"><div><div class="card-title">${_t("ovw.category.title")}</div><div class="card-sub">${_t("ovw.category.by_revenue")} · ${S.periodLabel(st.period).toLowerCase()}</div></div></div>
        <div class="card-pad">
          <div class="donut-wrap" style="height:150px"><canvas id="catDonut"></canvas></div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
            ${cats.map((c) => `<div style="display:flex;align-items:center;gap:9px;font-size:12.5px"><span class="legend-swatch" style="background:${UI.cssColor(c.color)}"></span>${S.catLabel(c.cat)}<span style="margin-left:auto;font-weight:800" class="tnum">${F.money(c.revenue)}</span></div>`).join("")}
          </div>
        </div>
      </div>
    </div>

    <!-- Row 4: Platform comparison + Geo distribution -->
    <div class="g12 section-gap">
      <div data-collapse style="grid-column:span 8" class="card">
        <div class="card-head">
          <div><div class="card-title">${_t("ovw.cmp.title")}</div><div class="card-sub">${_t("ovw.cmp.metric_label")} <b>${metricLabel}</b> · ${S.periodLabel(st.period).toLowerCase()}</div></div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <div class="miniseg" id="cmpSeg">
              <button class="${cmpMetric === "revenue" ? "active" : ""}" data-m="revenue">${_t("ovw.cmp.revenue")}</button>
              <button class="${cmpMetric === "orders" ? "active" : ""}" data-m="orders">${_t("ovw.cmp.orders")}</button>
              <button class="${cmpMetric === "aov" ? "active" : ""}" data-m="aov">${_t("ovw.cmp.aov")}</button>
            </div>
            <button class="ctrl-btn ${hideShopee ? "on" : ""}" id="hideShopeeBtn" style="padding:6px 11px;font-size:12.5px">${UI.ICON.eye}<span>${hideShopee ? _t("ovw.cmp.show_shopee") : _t("ovw.cmp.hide_shopee")}</span></button>
          </div>
        </div>
        <div class="card-pad" style="padding-top:14px">
          ${hideShopee ? `<div class="note" style="margin-bottom:14px">${UI.ICON.info} ${_tf("ovw.cmp.hiding_note", { pct: F.pct(pmAll[0].share) })}</div>` : ""}
          <div style="display:flex;flex-direction:column;gap:2px;margin-bottom:8px">${cmpRows}</div>
          <div style="overflow-x:auto;margin-top:8px">
            <table class="tbl">
              <thead><tr><th>${_t("th.platform")}</th><th class="num">${_t("th.revenue")}</th><th class="num">${cmpLab ? "Δ " + (st.compare === "yoy" ? _t("compare.yoy_short") : _t("compare.prev_short")) : "Δ"}</th><th class="num">${_t("th.orders")}</th><th class="num">${_t("kpi.aov")}</th><th class="num">% ${_t("common.cancel")}</th><th class="num">${_t("th.share")}</th></tr></thead>
              <tbody>${tblRows}</tbody>
            </table>
          </div>
        </div>
      </div>
      <div data-collapse style="grid-column:span 4" class="card">
        <div class="card-head"><div><div class="card-title">${_t("ovw.geo.title")}</div><div class="card-sub">${_t("ovw.geo.by_orders")}</div></div></div>
        <div class="card-pad" style="display:flex;flex-direction:column;gap:2px">${geoRows}</div>
      </div>
    </div>

    <!-- Row 5: Top 3 products + Heatmap -->
    <div class="g12 section-gap">
      <div data-collapse style="grid-column:span 5" class="card">
        <div class="card-head"><div><div class="card-title">${_t("ovw.top_products.title")}</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()}</div></div><a class="tag" data-nav="products" style="cursor:pointer">${_t("ovw.top_products.view_all")}</a></div>
        <div class="card-pad" style="padding:6px 6px 8px"><table class="tbl"><thead><tr><th>${_t("th.product")}</th><th class="num">${_t("th.qty_sold")}</th><th class="num">${_t("th.revenue")}</th></tr></thead><tbody>${prodRows}</tbody></table></div>
      </div>
      <div data-collapse style="grid-column:span 7" class="card">
        <div class="card-head"><div><div class="card-title">${_t("ovw.heat.title")}</div><div class="card-sub">${_t("ovw.heat.density")} · ${_t("period.cal.mon")} × h · ${S.periodLabel(st.period).toLowerCase()}</div></div></div>
        <div class="card-pad" style="overflow-x:auto">${heat}</div>
      </div>
    </div>`;
  }

  const CAL_D = ["mon","tue","wed","thu","fri","sat","sun"];
  function dayLabels() { return CAL_D.map((d) => _t("period.cal." + d)); }

  function mount(root) {
    const st = S.state, range = S.currentRange(), plat = st.platform;
    const ds = S.dailySeriesRange(range, plat);

    const mc = root.querySelector("#monthlyChart"); if (mc) C.monthlyRevenue(mc, S.businessTrend(st.period), { platform: plat });
    const dc = root.querySelector("#dailyChart"); if (dc) C.ordersTrend(dc, ds, { platform: plat });

    const pmAll2 = S.PKEYS.map((k) => ({ key: k, ...S.PLAT[k], ...S.aggRange(range, k) }));
    const totalRev2 = pmAll2.reduce((t, p) => t + p.revenue, 0);
    pmAll2.forEach((p) => { p.share = totalRev2 ? p.revenue / totalRev2 * 100 : 0; });
    const pm2 = hideShopee ? pmAll2.filter((p) => p.key !== "shopee") : pmAll2;
    const dn = root.querySelector("#shareDonut"); if (dn) C.donut(dn, pm2.map((p) => ({ label: p.label, value: p.revenue, color: "--" + p.key })));
    const cn = root.querySelector("#catDonut");
    if (cn) { const cats = S.categoryBreakdown(st.period, plat).filter((c) => c.revenue > 0); C.donut(cn, cats.map((c) => ({ label: S.catLabel(c.cat), value: c.revenue, color: c.color }))); }

    root.querySelector("#cmpSeg")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { cmpMetric = b.dataset.m; window.App.rerender(); } });
    root.querySelector("#hideShopeeBtn")?.addEventListener("click", () => { hideShopee = !hideShopee; window.App.rerender(); });
    root.querySelectorAll("[data-nav]").forEach((a) => a.addEventListener("click", () => window.App.go(a.dataset.nav)));

    const cacheKey = st.period + "|" + st.platform;
    if (!S.getRangeDetail(st.period, st.platform) && detailLoadingKey !== cacheKey) {
      detailLoadingKey = cacheKey;
      S.ensureRangeDetail(st.period, st.platform).then(() => {
        if (detailLoadingKey === cacheKey) window.App.rerender();
      }).catch(() => {}).finally(() => {
        if (detailLoadingKey === cacheKey) detailLoadingKey = null;
      });
    }
  }

  window.Views.overview = { titleKey: "page.overview.title", eyebrowKey: "page.overview.eyebrow", render, mount };
})();