/* ============================================================
   Views: Orders, Products, Customers, Traffic
   ============================================================ */
(function () {
  const S = window.Store, F = window.F, UI = window.UI, C = window.Charts;

  const days = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  function heatHTML(key) {
    const { m, max } = S.heatMatrix(key);
    let h = `<div style="display:grid;grid-template-columns:30px 1fr;gap:6px;align-items:center;min-width:560px"><div></div><div style="display:grid;grid-template-columns:repeat(24,1fr);gap:3px;font-size:9.5px;color:var(--ink-3);font-weight:700">`;
    for (let x = 0; x < 24; x++) h += `<div style="text-align:center">${x % 3 === 0 ? x : ""}</div>`;
    h += `</div>`;
    for (let d = 0; d < 7; d++) {
      h += `<div style="font-size:11px;font-weight:700;color:var(--ink-3)">${days[d]}</div><div class="heat-grid" style="grid-template-columns:repeat(24,1fr)">`;
      for (let x = 0; x < 24; x++) { const v = m[d][x], t = max ? v / max : 0; const bg = v === 0 ? "var(--track)" : `color-mix(in oklch, var(--brand) ${14 + t * 70}%, var(--surface))`; h += `<div class="heat-cell" ${v ? `data-v="${v}"` : ""} title="${days[d]} ${x}h · ${v} đơn" style="background:${bg}"></div>`; }
      h += `</div>`;
    }
    return h + `</div>`;
  }

  function statusInfo(s) {
    if (s === "cancelled") return ["Đã huỷ", "st-cancel"];
    if (s === "pending") return ["${t("status.processing")}", "st-ship"];
    return ["Hoàn thành", "st-done"];
  }
  const dtShort = (s) => { const [d, t] = s.split(" "); const p = d.split("-"); return p[2] + "/" + p[1] + " " + t.slice(0, 5); };

  function kpiRow(items) {
    return `<div class="g12">${items.map((o) => `<div data-collapse style="grid-column:span 3"><div class="card kpi reveal"><div class="kpi-label">${o.ico} ${o.label}</div><div class="kpi-value tnum">${o.value}${o.unit ? `<span class="unit">${o.unit}</span>` : ""}</div><div class="kpi-foot">${o.delta || ""}<span>${o.foot}</span></div></div></div>`).join("")}</div>`;
  }

  /* ===================== ORDERS ===================== */
  window.Views.orders = {
    titleKey: "page.orders.title", eyebrowKey: "page.orders.eyebrow", 
    render() {
      const st = S.state, months = S.cur(), cmpMonths = S.cmp(), plat = st.platform;
      const cur = S.aggMonths(months, plat), cmp = cmpMonths ? S.aggMonths(cmpMonths, plat) : null;
      const cmpLab = S.compareLabel(st.period, st.compare);
      const stt = S.statusBreakdown(st.period);
      const pending = (stt.pending || 0);
      const dd = (c, p, inv) => UI.deltaChip(F.delta(c, p), inv);
      const kpis = kpiRow([
        { label: "Tổng đơn", ico: `<span class="kpi-ico">${UI.ICON.orders}</span>`, value: F.viInt(cur.orders), unit: " đơn", delta: cmp ? dd(cur.orders, cmp.orders) : "", foot: cmp ? `vs ${F.viInt(cmp.orders)} · ${cmpLab}` : S.periodLabel(st.period).toLowerCase() },
        { label: "Hoàn thành", ico: `<span class="kpi-ico">${UI.ICON.check}</span>`, value: F.viInt(cur.completed), delta: `<span class="tag" style="color:var(--pos)">${F.pct(cur.completionRate)}</span>`, foot: "đơn giao thành công" },
        { label: "Đã huỷ", ico: `<span class="kpi-ico">${UI.ICON.cancel}</span>`, value: F.viInt(cur.cancelled), delta: `<span class="tag" style="color:var(--neg)">${F.pct(cur.cancelRate)}</span>`, foot: "đơn bị huỷ" },
        { label: "${t("status.processing")}", ico: `<span class="kpi-ico">${UI.ICON.orders}</span>`, value: F.viInt(pending), foot: "chờ hoàn tất (kỳ chi tiết)" },
      ]);
      // recent (filter by platform if not all)
      const recent = S.DASH.recentOrders.filter((o) => plat === "all" || o.platform === plat).slice(0, 40);
      const rows = recent.map((o) => { const [lab, cls] = statusInfo(o.status); return `<tr>
        <td class="mono" style="font-size:11.5px">${o.order_id}</td>
        <td><span class="pchip">${UI.pdot(o.platform)}${S.PLAT[o.platform].label.replace(" Shop", "")}</span></td>
        <td><div class="pname" style="max-width:280px">${(o.product || "").replace(/^\[.*?\]\s*/, "")}</div>${o.items > 1 ? `<span style="font-size:11px;color:var(--ink-3)">+${o.items - 1} SP khác</span>` : ""}</td>
        <td>${o.city}</td>
        <td class="num tnum">${F.moneyFull(o.amount)}</td>
        <td><span class="status-pill ${cls}">${lab}</span></td>
        <td style="color:var(--ink-3);font-size:12px" class="hide-md">${dtShort(o.created)}</td></tr>`; }).join("");

      return kpis + `
      <div class="g12 section-gap">
        <div data-collapse style="grid-column:span 8" class="card">
          <div class="card-head"><div><div class="card-title">Đơn theo ngày</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()} · ${plat === "all" ? "xếp chồng theo sàn" : S.PLAT[plat].label}</div></div></div>
          <div class="card-pad" style="padding-top:14px"><div class="chart-wrap" style="height:250px"><canvas id="ordChart"></canvas></div></div>
        </div>
        <div data-collapse style="grid-column:span 4" class="card">
          <div class="card-head"><div><div class="card-title">${t("th.status")} đơn</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()}</div></div></div>
          <div class="card-pad"><div class="donut-wrap" style="height:170px"><canvas id="statusDonut"></canvas>
            <div class="donut-center"><div><div class="big tnum">${F.viInt(cur.orders)}</div><div class="small">đơn</div></div></div></div>
            <div style="margin-top:14px;display:flex;flex-direction:column;gap:9px">
              <div style="display:flex;align-items:center;gap:9px;font-size:13px"><span class="legend-swatch" style="background:var(--pos)"></span>Hoàn thành<span style="margin-left:auto;font-weight:800" class="tnum">${F.viInt(cur.completed)}</span></div>
              <div style="display:flex;align-items:center;gap:9px;font-size:13px"><span class="legend-swatch" style="background:var(--neg)"></span>Đã huỷ<span style="margin-left:auto;font-weight:800" class="tnum">${F.viInt(cur.cancelled)}</span></div>
            </div></div>
        </div>
      </div>
      <div class="card section-gap"><div class="card-head"><div><div class="card-title">Khung giờ đặt đơn</div><div class="card-sub">thứ × giờ · ${S.periodLabel(st.period).toLowerCase()}</div></div></div><div class="card-pad" style="overflow-x:auto">${heatHTML(st.period)}</div></div>
      <div class="card section-gap"><div class="card-head"><div><div class="card-title">Đơn gần đây</div><div class="card-sub">${recent.length} đơn mới nhất${plat !== "all" ? " · " + S.PLAT[plat].label : ""}</div></div></div>
        <div class="card-pad" style="padding:6px;overflow-x:auto"><table class="tbl"><thead><tr><th>Mã đơn</th><th>Sàn</th><th>Sản phẩm</th><th>Khu vực</th><th class="num">Giá trị</th><th>${t("th.status")}</th><th class="hide-md">Thời gian</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    },
    mount(root) {
      const st = S.state, months = S.cur(), plat = st.platform;
      const oc = root.querySelector("#ordChart"); if (oc) C.ordersTrend(oc, S.dailySeries(months, plat), { platform: plat });
      const cur = S.aggMonths(months, plat);
      const sd = root.querySelector("#statusDonut"); if (sd) C.donut(sd, [{ label: "Hoàn thành", value: cur.completed, color: "--pos" }, { label: "Đã huỷ", value: cur.cancelled, color: "--neg" }, { label: "Khác", value: Math.max(0, cur.orders - cur.completed - cur.cancelled), color: "--border-strong" }]);
    },
  };

  /* ===================== PRODUCTS ===================== */
  let prodMetric = "rev";
  window.Views.products = {
    titleKey: "page.products.title", eyebrowKey: "page.products.eyebrow",
    render() {
      const st = S.state;
      const cats = S.categoryBreakdown(st.period).filter((c) => c.revenue > 0);
      const list = S.products(st.period, prodMetric).slice(0, 15);
      const maxV = Math.max(...list.map((p) => prodMetric === "qty" ? p.qty : p.revenue), 1);
      const rows = list.map((p, i) => `<tr>
        <td><div class="prod"><span class="rank">${i + 1}</span><div style="min-width:0"><div class="pname">${p.cleanName}</div><div class="psku">${p.sku}</div></div></div></td>
        <td><span class="tag" style="border-color:transparent;background:color-mix(in oklch, ${S.CAT[p.cat].color} 14%, transparent);color:${S.CAT[p.cat].color}">${S.CAT[p.cat].label}</span></td>
        <td><span class="pchip">${UI.pdot(p.platform)}${S.PLAT[p.platform].label.replace(" Shop", "")}</span></td>
        <td class="num">${F.viInt(p.qty)}</td>
        <td class="num"><b>${F.money(p.revenue)}</b></td>
        <td class="num" style="width:120px"><div class="cmp-track"><div class="cmp-fill" style="width:${(prodMetric === "qty" ? p.qty : p.revenue) / maxV * 100}%;background:var(--brand)"></div></div></td>
      </tr>`).join("");
      const totalCatRev = cats.reduce((t, c) => t + c.revenue, 0);
      return `
      <div class="g12">
        <div data-collapse style="grid-column:span 5" class="card">
          <div class="card-head"><div><div class="card-title">Cơ cấu nhóm sản phẩm</div><div class="card-sub">theo doanh thu · ${S.periodLabel(st.period).toLowerCase()}</div></div></div>
          <div class="card-pad"><div class="donut-wrap" style="height:180px"><canvas id="catDonut2"></canvas><div class="donut-center"><div><div class="big tnum">${F.money(totalCatRev)}</div><div class="small">top SP</div></div></div></div>
            <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
              ${cats.map((c) => `<div><div style="display:flex;align-items:center;gap:9px;font-size:13px;margin-bottom:4px"><span class="legend-swatch" style="background:${c.color}"></span><b>${c.label}</b><span style="margin-left:auto;font-weight:800" class="tnum">${F.money(c.revenue)}</span></div><div class="cmp-track"><div class="cmp-fill" style="width:${c.revenue / (cats[0].revenue || 1) * 100}%;background:${c.color}"></div></div></div>`).join("")}
            </div></div>
        </div>
        <div data-collapse style="grid-column:span 7" class="card">
          <div class="card-head"><div><div class="card-title">Bảng xếp hạng sản phẩm</div><div class="card-sub">top 15 · ${S.periodLabel(st.period).toLowerCase()}</div></div>
            <div class="miniseg" id="prodSeg"><button class="${prodMetric === "rev" ? "active" : ""}" data-m="rev">Doanh thu</button><button class="${prodMetric === "qty" ? "active" : ""}" data-m="qty">Số lượng</button></div>
          </div>
          <div class="card-pad" style="padding:6px;overflow-x:auto"><table class="tbl"><thead><tr><th>Sản phẩm</th><th>Nhóm</th><th>Sàn</th><th class="num">SL</th><th class="num">Doanh thu</th><th class="num">${prodMetric === "qty" ? "SL" : "DT"}</th></tr></thead><tbody>${rows}</tbody></table></div>
        </div>
      </div>`;
    },
    mount(root) {
      const cats = S.categoryBreakdown(S.state.period).filter((c) => c.revenue > 0);
      const cn = root.querySelector("#catDonut2"); if (cn) C.donut(cn, cats.map((c) => ({ label: c.label, value: c.revenue, color: c.color })));
      root.querySelector("#prodSeg")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { prodMetric = b.dataset.m; window.App.rerender(); } });
    },
  };

  /* ===================== CUSTOMERS ===================== */
  window.Views.customers = {
    titleKey: "page.customers.title", eyebrowKey: "page.customers.eyebrow",
    render() {
      const st = S.state, months = S.cur();
      const geo = S.cityDistribution(st.period);
      const maxG = Math.max(...geo.map((g) => g.orders), 1);
      const traf = S.trafficByPlatform(months);
      const totalNF = traf.reduce((t, p) => t + p.nf, 0);
      const geoRows = geo.map((g) => `<tr><td>${g.city}</td><td class="num">${F.viInt(g.orders)}</td><td class="num">${F.pct(g.pct, 1)}</td><td class="num" style="width:160px"><div class="cmp-track"><div class="cmp-fill" style="width:${g.orders / maxG * 100}%;background:${g.other ? "var(--ink-3)" : "var(--brand)"}"></div></div></td></tr>`).join("");
      const fRows = traf.map((p) => `<div class="cmp-row"><div class="cmp-name">${UI.pdot(p.key)}${p.label}</div><div class="cmp-track"><div class="cmp-fill" style="width:${totalNF ? p.nf / Math.max(...traf.map((x) => x.nf), 1) * 100 : 0}%;background:var(--${p.key})"></div></div><div class="cmp-val">${F.viInt(p.nf)}</div></div>`).join("");
      return `
      <div class="note section0" style="margin-bottom:16px">${UI.ICON.info} Dữ liệu khách hàng được ẩn danh theo nguồn sàn — tập trung vào <b>phân bố khu vực</b> và <b>tăng trưởng người theo dõi</b>.</div>
      <div class="g12">
        <div data-collapse style="grid-column:span 7" class="card">
          <div class="card-head"><div><div class="card-title">Phân bố đơn theo khu vực</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()}</div></div></div>
          <div class="card-pad" style="padding:6px"><table class="tbl"><thead><tr><th>Khu vực</th><th class="num">Số đơn</th><th class="num">Tỷ trọng</th><th></th></tr></thead><tbody>${geoRows}</tbody></table></div>
        </div>
        <div data-collapse style="grid-column:span 5" class="card">
          <div class="card-head"><div><div class="card-title">Người theo dõi mới</div><div class="card-sub">theo sàn · ${S.periodLabel(st.period).toLowerCase()}</div></div></div>
          <div class="card-pad"><div style="font-size:30px;font-weight:800;letter-spacing:-.02em;margin-bottom:14px" class="tnum">${F.viInt(totalNF)} <span style="font-size:14px;color:var(--ink-3);font-weight:700">người mới</span></div><div style="display:flex;flex-direction:column;gap:6px">${fRows}</div>
          <div class="note" style="margin-top:16px">${UI.ICON.people} Hai thị trường lớn nhất là <b>Hà Nội</b> và <b>TP.HCM</b>, chiếm phần lớn đơn hàng.</div></div>
        </div>
      </div>`;
    },
    mount() {},
  };

  /* ===================== TRAFFIC ===================== */
  window.Views.traffic = {
    titleKey: "page.traffic.title", eyebrowKey: "page.traffic.eyebrow",
    render() {
      const st = S.state, months = S.cur(), cmpMonths = S.cmp(), plat = st.platform;
      const cur = S.trafficAgg(months, plat), cmp = cmpMonths ? S.trafficAgg(cmpMonths, plat) : null;
      const cmpLab = S.compareLabel(st.period, st.compare);
      const dd = (c, p) => UI.deltaChip(F.delta(c, p));
      const kpis = kpiRow([
        { label: "Lượt xem trang", ico: `<span class="kpi-ico">${UI.ICON.eye_traffic}</span>`, value: F.num(cur.pv), delta: cmp ? dd(cur.pv, cmp.pv) : "", foot: cmp ? `vs ${F.num(cmp.pv)} · ${cmpLab}` : "page views" },
        { label: "Lượt truy cập", ico: `<span class="kpi-ico">${UI.ICON.people}</span>`, value: F.num(cur.visits), delta: cmp ? dd(cur.visits, cmp.visits) : "", foot: cmp ? `vs ${F.num(cmp.visits)} · ${cmpLab}` : "visits" },
        { label: "Tỷ lệ chuyển đổi", ico: `<span class="kpi-ico">${UI.ICON.aov}</span>`, value: F.viDec(cur.conv, 2), unit: "%", delta: cmp ? dd(cur.conv, cmp.conv) : "", foot: "đơn HT / lượt truy cập" },
        { label: "Người theo dõi mới", ico: `<span class="kpi-ico">${UI.ICON.people}</span>`, value: F.viInt(cur.nf), delta: cmp ? dd(cur.nf, cmp.nf) : "", foot: cmp ? `vs ${F.viInt(cmp.nf)}` : "follower mới" },
      ]);
      const tp = S.trafficByPlatform(months);
      const maxVis = Math.max(...tp.map((p) => p.visits), 1);
      const tRows = tp.map((p) => `<tr><td><span class="pchip">${UI.pdot(p.key)}<b>${p.label}</b></span></td><td class="num">${F.viInt(p.pv)}</td><td class="num">${F.viInt(p.visits)}</td><td class="num">${F.viInt(p.completed)}</td><td class="num"><b>${F.pct(p.conv)}</b></td><td class="num">${F.viInt(p.nf)}</td><td class="num" style="width:140px"><div class="cmp-track"><div class="cmp-fill" style="width:${p.visits / maxVis * 100}%;background:var(--${p.key})"></div></div></td></tr>`).join("");
      return kpis + `
      <div class="g12 section-gap">
        <div data-collapse style="grid-column:span 8" class="card">
          <div class="card-head"><div><div class="card-title">Lượt truy cập theo ngày</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()} · theo sàn</div></div>
            <div class="legend">${S.PKEYS.map((k) => `<span class="legend-item"><span class="legend-swatch" style="background:var(--${k})"></span>${S.PLAT[k].label}</span>`).join("")}</div></div>
          <div class="card-pad" style="padding-top:14px"><div class="chart-wrap" style="height:260px"><canvas id="trafChart"></canvas></div></div>
        </div>
        <div data-collapse style="grid-column:span 4" class="card">
          <div class="card-head"><div><div class="card-title">Chuyển đổi theo sàn</div><div class="card-sub">đơn HT trên 100 lượt truy cập</div></div></div>
          <div class="card-pad" style="display:flex;flex-direction:column;gap:14px;padding-top:18px">
            ${tp.map((p) => `<div><div style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:5px"><span class="legend-swatch" style="background:var(--${p.key})"></span><b>${p.label}</b><span style="margin-left:auto;font-weight:800" class="tnum">${F.pct(p.conv)}</span></div><div class="cmp-track" style="height:9px"><div class="cmp-fill" style="width:${Math.min(100, p.conv / Math.max(...tp.map((x) => x.conv), 1) * 100)}%;background:var(--${p.key})"></div></div><div style="font-size:11.5px;color:var(--ink-3);font-weight:600;margin-top:4px">${F.viInt(p.visits)} truy cập → ${F.viInt(p.completed)} đơn</div></div>`).join("")}
          </div>
        </div>
      </div>
      <div class="card section-gap"><div class="card-head"><div><div class="card-title">Lưu lượng theo sàn</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()}</div></div></div>
        <div class="card-pad" style="padding:6px;overflow-x:auto"><table class="tbl"><thead><tr><th>Sàn</th><th class="num">Lượt xem</th><th class="num">Truy cập</th><th class="num">Đơn HT</th><th class="num">% Chuyển đổi</th><th class="num">Follower mới</th><th></th></tr></thead><tbody>${tRows}</tbody></table></div></div>`;
    },
    mount(root) {
      const st = S.state, months = S.cur();
      const tc = root.querySelector("#trafChart");
      if (tc) {
        const defs = S.PKEYS.map((k) => { const s = S.trafficSeries(months, k); return { label: S.PLAT[k].label, data: s.map((d) => d.visits), color: "--" + k, _dates: s.map((d) => d.date) }; });
        const labels = (S.trafficSeries(months, "shopee")[0] ? S.trafficSeries(months, "shopee") : S.trafficSeries(months, "lazada")).map((d) => { const p = d.date.split("-"); return p[2] + "/" + p[1]; });
        C.lineSeries(tc, labels, defs);
      }
    },
  };
})();
