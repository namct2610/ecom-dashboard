/* ============================================================
   View: Overview (Tổng quan)
   ============================================================ */
(function () {
  const S = window.Store, F = window.F, UI = window.UI, C = window.Charts;

  let cmpMetric = "revenue";
  let hideShopee = false;
  let trendMode = "revenue";

  function ppChip(cur, prev, invert) {
    if (prev == null) return "";
    const pp = cur - prev;
    let dir = Math.abs(pp) < 0.05 ? "flat" : pp > 0 ? "up" : "down";
    let cls = invert ? (dir === "up" ? "down" : dir === "down" ? "up" : "flat") : dir;
    const arrow = dir === "up" ? UI.ICON.up : dir === "down" ? UI.ICON.down : "";
    return `<span class="delta ${cls}">${arrow}${pp > 0 ? "+" : ""}${F.viDec(pp, 1)} đpt</span>`;
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
    const months = S.cur();
    const cmpMonths = S.cmp();
    const plat = st.platform;
    const cur = S.aggMonths(months, plat);
    const cmp = cmpMonths ? S.aggMonths(cmpMonths, plat) : null;
    const cmpLab = S.compareLabel(st.period, st.compare);
    const cmpShort = "";  // comparison mode is shown in the toolbar; keep KPI footers short

    const dd = (c, p, inv) => UI.deltaChip(F.delta(c, p), inv);

    // KPI cards
    const cards = [
      kpiCard({
        label: "Doanh thu", ico: `<span class="kpi-ico">${UI.ICON.revenue}</span>`,
        value: F.money(cur.revenue),
        delta: cmp ? dd(cur.revenue, cmp.revenue) : "",
        foot: cmp ? `vs ${F.money(cmp.revenue)}` : S.periodLabel(st.period).toLowerCase(),
        spark: "spk_rev",
      }),
      kpiCard({
        label: "Đơn hàng", ico: `<span class="kpi-ico">${UI.ICON.orders}</span>`,
        value: F.viInt(cur.orders), unit: " đơn",
        delta: cmp ? dd(cur.orders, cmp.orders) : "",
        foot: cmp ? `vs ${F.viInt(cmp.orders)} đơn` : `${F.viInt(cur.completed)} hoàn thành`,
        spark: "spk_ord",
      }),
      kpiCard({
        label: "Giá trị đơn TB", ico: `<span class="kpi-ico">${UI.ICON.aov}</span>`,
        value: F.money(cur.aov),
        delta: cmp ? dd(cur.aov, cmp.aov) : "",
        foot: cmp ? `vs ${F.money(cmp.aov)}` : "trên mỗi đơn hoàn thành",
        spark: "spk_aov",
      }),
      kpiCard({
        label: "Tỷ lệ hoàn thành", ico: `<span class="kpi-ico">${UI.ICON.check}</span>`,
        value: F.viDec(cur.completionRate, 1), unit: "%",
        delta: cmp ? ppChip(cur.completionRate, cmp.completionRate) : `<span class="tag" style="color:var(--neg)">${F.pct(cur.cancelRate)} huỷ</span>`,
        foot: `${F.pct(cur.cancelRate)} đơn huỷ`,
      }),
    ].map((c) => `<div data-collapse style="grid-column:span 3">${c}</div>`).join("");

    // monthly trend (13 months)
    const trend = S.monthlyTrend(13);

    // platform comparison
    const pmAll = S.platformMetrics(months);
    const pm = hideShopee ? pmAll.filter((p) => p.key !== "shopee") : pmAll;
    const accessor = { revenue: (p) => p.revenue, orders: (p) => p.orders, aov: (p) => p.aov }[cmpMetric];
    const fmt = { revenue: (v) => F.money(v), orders: (v) => F.viInt(v), aov: (v) => F.money(v) }[cmpMetric];
    const metricLabel = { revenue: "Doanh thu", orders: "Số đơn", aov: "AOV" }[cmpMetric];
    const maxV = Math.max(...pm.map(accessor), 1);
    const cmpRows = pm.map((p) => `
      <div class="cmp-row reveal">
        <div class="cmp-name">${UI.pdot(p.key)}${p.label}</div>
        <div class="cmp-track"><div class="cmp-fill" style="width:${accessor(p) / maxV * 100}%;background:var(--${p.key})"></div></div>
        <div class="cmp-val">${fmt(accessor(p))}</div>
      </div>`).join("");

    // comparison table with YoY/prev delta per platform
    const tblRows = pmAll.map((p) => {
      const pc = cmpMonths ? S.aggMonths(cmpMonths, p.key) : null;
      return `<tr>
        <td><span class="pchip">${UI.pdot(p.key)}<b>${p.label}</b></span></td>
        <td class="num"><b>${F.money(p.revenue)}</b></td>
        <td class="num">${cmpMonths ? dd(p.revenue, pc.revenue) : "—"}</td>
        <td class="num">${F.viInt(p.orders)}</td>
        <td class="num">${F.money(p.aov)}</td>
        <td class="num" style="color:${p.cancelRate > 16 ? "var(--neg)" : "var(--ink-2)"}">${F.pct(p.cancelRate)}</td>
        <td class="num"><div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><span style="min-width:42px;text-align:right"><b>${F.pct(p.share)}</b></span><div class="cmp-track" style="width:80px"><div class="cmp-fill" style="width:${p.share}%;background:var(--${p.key})"></div></div></div></td>
      </tr>`;
    }).join("");

    // top products
    const prods = S.products(st.period, "rev").slice(0, 7);
    const prodRows = prods.map((p, i) => `
      <tr>
        <td><div class="prod"><span class="rank">${i + 1}</span><div style="min-width:0"><div class="pname">${p.cleanName}</div><div class="psku">${p.sku} · ${UI.pchip(p.platform)}</div></div></div></td>
        <td class="num">${F.viInt(p.qty)}</td>
        <td class="num"><b>${F.money(p.revenue)}</b></td>
      </tr>`).join("");

    // geo
    const geo = S.cityDistribution(st.period);
    const geoRows = geo.map((g) => `
      <div class="cmp-row" style="grid-template-columns:140px 1fr auto">
        <div class="cmp-name" style="font-weight:600">${g.city}</div>
        <div class="cmp-track"><div class="cmp-fill" style="width:${g.pct}%;background:${g.other ? "var(--ink-3)" : "var(--brand)"}"></div></div>
        <div class="cmp-val">${F.viInt(g.orders)} <span style="color:var(--ink-3);font-weight:600">(${F.pct(g.pct, 0)})</span></div>
      </div>`).join("");

    // category donut
    const cats = S.categoryBreakdown(st.period).filter((c) => c.revenue > 0);

    // heatmap
    const { m, max } = S.heatMatrix(st.period);
    const days = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
    let heat = `<div style="display:grid;grid-template-columns:30px 1fr;gap:6px;align-items:center;min-width:560px">`;
    heat += `<div></div><div style="display:grid;grid-template-columns:repeat(24,1fr);gap:3px;font-size:9.5px;color:var(--ink-3);font-weight:700">`;
    for (let h = 0; h < 24; h++) heat += `<div style="text-align:center">${h % 3 === 0 ? h : ""}</div>`;
    heat += `</div>`;
    for (let d = 0; d < 7; d++) {
      heat += `<div style="font-size:11px;font-weight:700;color:var(--ink-3)">${days[d]}</div><div class="heat-grid" style="grid-template-columns:repeat(24,1fr)">`;
      for (let h = 0; h < 24; h++) {
        const v = m[d][h], t = max ? v / max : 0;
        const bg = v === 0 ? "var(--track)" : `color-mix(in oklch, var(--brand) ${14 + t * 70}%, var(--surface))`;
        heat += `<div class="heat-cell" ${v ? `data-v="${v}"` : ""} title="${days[d]} ${h}h · ${v} đơn" style="background:${bg}"></div>`;
      }
      heat += `</div>`;
    }
    heat += `</div>`;

    return `
    <div class="g12">${cards}</div>

    <div class="g12 section-gap">
      <div data-collapse style="grid-column:span 8" class="card">
        <div class="card-head">
          <div><div class="card-title">Tình hình kinh doanh theo tháng</div><div class="card-sub">13 tháng gần nhất · ${plat === "all" ? "xếp chồng theo sàn" : S.PLAT[plat].label} · Th6 chưa trọn tháng</div></div>
          ${plat === "all" ? `<div class="legend">${S.PKEYS.map((k) => `<span class="legend-item"><span class="legend-swatch" style="background:var(--${k})"></span>${S.PLAT[k].label}</span>`).join("")}</div>` : ""}
        </div>
        <div class="card-pad" style="padding-top:14px"><div class="chart-wrap" style="height:280px"><canvas id="monthlyChart"></canvas></div></div>
      </div>
      <div data-collapse style="grid-column:span 4" class="card">
        <div class="card-head"><div><div class="card-title">Thị phần doanh thu</div><div class="card-sub">${hideShopee ? "không gồm Shopee" : S.periodLabel(st.period).toLowerCase()}</div></div></div>
        <div class="card-pad">
          <div class="donut-wrap" style="height:172px"><canvas id="shareDonut"></canvas>
            <div class="donut-center"><div><div class="big tnum">${F.money(pm.reduce((t, p) => t + p.revenue, 0))}</div><div class="small">${hideShopee ? "LZ + TT" : "Tổng DT"}</div></div></div>
          </div>
          <div style="margin-top:14px;display:flex;flex-direction:column;gap:9px">
            ${pm.map((p) => `<div style="display:flex;align-items:center;gap:9px;font-size:13px"><span class="legend-swatch" style="background:var(--${p.key})"></span><b>${p.label}</b><span style="margin-left:auto;font-weight:800" class="tnum">${F.pct(p.share)}</span></div>`).join("")}
          </div>
        </div>
      </div>
    </div>

    <div class="card section-gap">
      <div class="card-head">
        <div><div class="card-title">So sánh giữa các sàn</div><div class="card-sub">đo theo <b>${metricLabel}</b> · ${S.periodLabel(st.period).toLowerCase()}</div></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div class="miniseg" id="cmpSeg">
            <button class="${cmpMetric === "revenue" ? "active" : ""}" data-m="revenue">Doanh thu</button>
            <button class="${cmpMetric === "orders" ? "active" : ""}" data-m="orders">Đơn</button>
            <button class="${cmpMetric === "aov" ? "active" : ""}" data-m="aov">AOV</button>
          </div>
          <button class="ctrl-btn ${hideShopee ? "on" : ""}" id="hideShopeeBtn" style="padding:6px 11px;font-size:12.5px">${UI.ICON.eye}<span>${hideShopee ? "Hiện Shopee" : "Ẩn Shopee"}</span></button>
        </div>
      </div>
      <div class="card-pad" style="padding-top:14px">
        ${hideShopee ? `<div class="note" style="margin-bottom:14px">${UI.ICON.info} Đang ẩn Shopee để thấy rõ hai kênh nhỏ. Shopee chiếm <b>${F.pct(pmAll[0].share)}</b> doanh thu kỳ này.</div>` : ""}
        <div style="display:flex;flex-direction:column;gap:2px;margin-bottom:8px">${cmpRows}</div>
        <div style="overflow-x:auto;margin-top:8px">
          <table class="tbl">
            <thead><tr><th>Sàn</th><th class="num">Doanh thu</th><th class="num">${cmpLab ? "Δ " + (st.compare === "yoy" ? "cùng kỳ" : "kỳ trước") : "Δ"}</th><th class="num">Đơn</th><th class="num">AOV</th><th class="num">% ${t("common.cancel")}</th><th class="num">Thị phần</th></tr></thead>
            <tbody>${tblRows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="g12 section-gap">
      <div data-collapse style="grid-column:span 8" class="card">
        <div class="card-head">
          <div><div class="card-title">Xu hướng theo ngày</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()} · ${plat === "all" ? "tất cả sàn" : S.PLAT[plat].label}</div></div>
          <div class="miniseg" id="trendSeg"><button class="${trendMode === "revenue" ? "active" : ""}" data-m="revenue">Doanh thu</button><button class="${trendMode === "orders" ? "active" : ""}" data-m="orders">Đơn</button></div>
        </div>
        <div class="card-pad" style="padding-top:14px"><div class="chart-wrap" style="height:250px"><canvas id="dailyChart"></canvas></div></div>
      </div>
      <div data-collapse style="grid-column:span 4" class="card">
        <div class="card-head"><div><div class="card-title">Theo nhóm sản phẩm</div><div class="card-sub">doanh thu · ${S.periodLabel(st.period).toLowerCase()}</div></div></div>
        <div class="card-pad">
          <div class="donut-wrap" style="height:150px"><canvas id="catDonut"></canvas></div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
            ${cats.map((c) => `<div style="display:flex;align-items:center;gap:9px;font-size:12.5px"><span class="legend-swatch" style="background:${c.color}"></span>${c.label}<span style="margin-left:auto;font-weight:800" class="tnum">${F.money(c.revenue)}</span></div>`).join("")}
          </div>
        </div>
      </div>
    </div>

    <div class="g12 section-gap">
      <div data-collapse style="grid-column:span 7" class="card">
        <div class="card-head"><div><div class="card-title">Top sản phẩm theo doanh thu</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()}</div></div><a class="tag" data-nav="products" style="cursor:pointer">Xem tất cả →</a></div>
        <div class="card-pad" style="padding:6px 6px 8px"><table class="tbl"><thead><tr><th>Sản phẩm</th><th class="num">SL</th><th class="num">Doanh thu</th></tr></thead><tbody>${prodRows}</tbody></table></div>
      </div>
      <div data-collapse style="grid-column:span 5" class="card">
        <div class="card-head"><div><div class="card-title">Phân bố theo khu vực</div><div class="card-sub">theo số đơn</div></div></div>
        <div class="card-pad" style="display:flex;flex-direction:column;gap:2px">${geoRows}</div>
      </div>
    </div>

    <div class="card section-gap">
      <div class="card-head"><div><div class="card-title">Khung giờ đặt đơn</div><div class="card-sub">đậm = nhiều đơn · thứ × giờ · ${S.periodLabel(st.period).toLowerCase()}</div></div></div>
      <div class="card-pad" style="overflow-x:auto">${heat}</div>
    </div>`;
  }

  function mount(root) {
    const st = S.state, months = S.cur(), plat = st.platform;
    const ds = S.dailySeries(months, plat);

    const mc = root.querySelector("#monthlyChart"); if (mc) C.monthlyRevenue(mc, S.monthlyTrend(13), { platform: plat });
    const dc = root.querySelector("#dailyChart"); if (dc) (trendMode === "revenue" ? C.revenueTrend : C.ordersTrend)(dc, ds, { platform: plat });

    const pmAll = S.platformMetrics(months);
    const pm = hideShopee ? pmAll.filter((p) => p.key !== "shopee") : pmAll;
    const dn = root.querySelector("#shareDonut"); if (dn) C.donut(dn, pm.map((p) => ({ label: p.label, value: p.revenue, color: "--" + p.key })));
    const cn = root.querySelector("#catDonut");
    if (cn) { const cats = S.categoryBreakdown(st.period).filter((c) => c.revenue > 0); C.donut(cn, cats.map((c) => ({ label: c.label, value: c.revenue, color: c.color }))); }

    root.querySelector("#trendSeg")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { trendMode = b.dataset.m; window.App.rerender(); } });
    root.querySelector("#cmpSeg")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { cmpMetric = b.dataset.m; window.App.rerender(); } });
    root.querySelector("#hideShopeeBtn")?.addEventListener("click", () => { hideShopee = !hideShopee; window.App.rerender(); });
    root.querySelectorAll("[data-nav]").forEach((a) => a.addEventListener("click", () => window.App.go(a.dataset.nav)));
  }

  window.Views.overview = { titleKey: "page.overview.title", eyebrowKey: "page.overview.eyebrow", render, mount };
})();
