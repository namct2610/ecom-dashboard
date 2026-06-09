/* ============================================================
   View: Compare platforms (So sánh sàn)
   ============================================================ */
(function () {
  const S = window.Store, F = window.F, UI = window.UI, C = window.Charts;

  function render() {
    const st = S.state;
    const months = S.cur();
    const cmpMonths = S.cmp();
    const cmpLab = S.compareLabel(st.period, st.compare);
    const pm = S.platformMetrics(months);
    const traf = S.trafficByPlatform(months);
    const trafMap = {}; traf.forEach((t) => (trafMap[t.key] = t));
    const dd = (c, p, inv) => UI.deltaChip(F.delta(c, p), inv);

    // platform cards
    const cards = pm.map((p) => {
      const pc = cmpMonths ? S.aggMonths(cmpMonths, p.key) : null;
      const tp = S.products(st.period, "rev").filter((x) => x.platform === p.key)[0];
      const tf = trafMap[p.key];
      const rows = [
        ["Đơn hàng", F.viInt(p.orders), pc ? dd(p.orders, pc.orders) : ""],
        ["Hoàn thành", F.viInt(p.completed), pc ? dd(p.completed, pc.completed) : ""],
        ["Giá trị đơn TB", F.money(p.aov), pc ? dd(p.aov, pc.aov) : ""],
        ["Tỷ lệ huỷ", F.pct(p.cancelRate), ""],
        ["Lượt truy cập", F.viInt(tf.visits), ""],
        ["Tỷ lệ chuyển đổi", F.pct(tf.conv), ""],
      ];
      return `<div data-collapse style="grid-column:span 4;--bd:var(--${p.key})" class="card pcard reveal">
        <div class="phead">${UI.platLogo(p.key)}<div><div style="font-weight:800;font-size:15px">${p.label}</div><div style="font-size:12px;color:var(--ink-3);font-weight:600">${F.pct(p.share)} thị phần</div></div></div>
        <div style="padding:0 18px 8px"><div style="font-size:26px;font-weight:800;letter-spacing:-.02em" class="tnum">${F.money(p.revenue)}</div><div style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--ink-3);font-weight:600;margin-top:2px">${pc ? dd(p.revenue, pc.revenue) : ""}<span>${pc ? "vs " + F.money(pc.revenue) + " · " + cmpLab : "doanh thu kỳ này"}</span></div></div>
        ${rows.map((r) => `<div class="pmetric"><span class="lab">${r[0]}</span><span style="display:flex;align-items:center;gap:8px">${r[2]}<span class="val tnum">${r[1]}</span></span></div>`).join("")}
        <div class="pmetric" style="flex-direction:column;align-items:flex-start;gap:5px"><span class="lab">Sản phẩm bán chạy nhất</span><span style="font-weight:600;font-size:13px;line-height:1.3">${tp ? tp.cleanName : "—"}</span></div>
      </div>`;
    }).join("");

    // monthly multi-line trajectory
    const trend = S.monthlyTrend(12);

    // matrix
    const tblRows = pm.map((p) => {
      const pc = cmpMonths ? S.aggMonths(cmpMonths, p.key) : null;
      const tf = trafMap[p.key];
      return `<tr>
        <td><span class="pchip">${UI.pdot(p.key)}<b>${p.label}</b></span></td>
        <td class="num"><b>${F.money(p.revenue)}</b></td>
        <td class="num">${cmpMonths ? dd(p.revenue, pc.revenue) : "—"}</td>
        <td class="num">${F.viInt(p.orders)}</td>
        <td class="num">${F.pct(p.completionRate)}</td>
        <td class="num" style="color:${p.cancelRate > 16 ? "var(--neg)" : "var(--ink-2)"}">${F.pct(p.cancelRate)}</td>
        <td class="num">${F.money(p.aov)}</td>
        <td class="num">${F.viInt(tf.visits)}</td>
        <td class="num">${F.pct(tf.conv)}</td>
        <td class="num"><b>${F.pct(p.share)}</b></td>
      </tr>`;
    }).join("");

    return `
    <div class="note section0" style="margin-bottom:16px">${UI.ICON.info} Đang so sánh <b>${S.periodLabel(st.period)}</b>${cmpLab ? ` với <b>${cmpLab}</b>` : ""}. Đổi kỳ &amp; kiểu so sánh ở thanh trên.</div>
    <div class="g12">${cards}</div>

    <div class="card section-gap">
      <div class="card-head"><div><div class="card-title">Quỹ đạo doanh thu theo tháng</div><div class="card-sub">12 tháng gần nhất · mỗi đường một sàn</div></div>
        <div class="legend">${S.PKEYS.map((k) => `<span class="legend-item"><span class="legend-swatch" style="background:var(--${k})"></span>${S.PLAT[k].label}</span>`).join("")}</div>
      </div>
      <div class="card-pad" style="padding-top:14px"><div class="chart-wrap" style="height:300px"><canvas id="trajChart"></canvas></div></div>
    </div>

    <div class="card section-gap">
      <div class="card-head"><div><div class="card-title">Bảng so sánh chi tiết</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()}</div></div></div>
      <div class="card-pad" style="overflow-x:auto;padding:6px">
        <table class="tbl"><thead><tr><th>Sàn</th><th class="num">Doanh thu</th><th class="num">Δ ${st.compare === "yoy" ? "cùng kỳ" : st.compare === "prev" ? "kỳ trước" : ""}</th><th class="num">Đơn</th><th class="num">% HT</th><th class="num">% Huỷ</th><th class="num">AOV</th><th class="num">Truy cập</th><th class="num">% CĐ</th><th class="num">Thị phần</th></tr></thead><tbody>${tblRows}</tbody></table>
      </div>
    </div>`;
  }

  function mount(root) {
    const trend = S.monthlyTrend(12);
    const tc = root.querySelector("#trajChart");
    if (tc) C.lineSeries(tc, trend.map((t) => t.label), S.PKEYS.map((k) => ({ label: S.PLAT[k].label, data: trend.map((t) => t[k]), color: "--" + k })), { money: true });
  }

  window.Views.compare = { title: "So sánh sàn", eyebrow: "Phân tích đối chiếu", render, mount };
})();
