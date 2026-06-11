/* ============================================================
   View: Compare platforms (So sánh sàn)
   ============================================================ */
(function () {
  const S = window.Store, F = window.F, UI = window.UI, C = window.Charts;
  const _t = (k, f) => (window.t ? window.t(k, f) : (f || k));
  const _tf = (k, v) => (window.tf ? window.tf(k, v) : k);
  let detailLoadingKey = null;

  function render() {
    const st = S.state;
    const range = S.currentRange();
    const cmpRange = S.compareCurrentRange();
    const cmpLab = S.compareLabel(st.period, st.compare);
    const pm = S.PKEYS.map((k) => ({ key: k, ...S.PLAT[k], ...S.aggRange(range, k) }));
    const totalRev = pm.reduce((t, p) => t + p.revenue, 0);
    pm.forEach((p) => { p.share = totalRev ? p.revenue / totalRev * 100 : 0; });
    const traf = S.PKEYS.map((k) => ({ key: k, ...S.PLAT[k], ...S.trafficAggRange(range, k) }));
    const trafMap = {}; traf.forEach((t) => (trafMap[t.key] = t));
    const dd = (c, p, inv) => UI.deltaChip(F.delta(c, p), inv);

    // platform cards
    const cards = pm.map((p) => {
      const pc = cmpRange ? S.aggRange(cmpRange, p.key) : null;
      const tp = trafMap[p.key];
      const rows = [
        [_t("kpi.orders"), F.viInt(p.orders), pc ? dd(p.orders, pc.orders) : ""],
        [_t("kpi.completed"), F.viInt(p.completed), pc ? dd(p.completed, pc.completed) : ""],
        [_t("kpi.aov"), F.money(p.aov), pc ? dd(p.aov, pc.aov) : ""],
        [_t("kpi.cancel_rate"), F.pct(p.cancelRate), ""],
        [_t("kpi.visits"), F.viInt(tp.visits), ""],
        [_t("kpi.conversion"), F.pct(tp.conv), ""],
      ];
      return `<div data-collapse style="grid-column:span 4;--bd:var(--${p.key})" class="card pcard reveal">
        <div class="phead">${UI.platLogo(p.key)}<div><div style="font-weight:800;font-size:15px">${p.label}</div><div style="font-size:12px;color:var(--ink-3);font-weight:600">${F.pct(p.share)} ${_t("compare.share")}</div></div></div>
        <div style="padding:0 18px 8px"><div style="font-size:26px;font-weight:800;letter-spacing:-.02em" class="tnum">${F.money(p.revenue)}</div><div style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--ink-3);font-weight:600;margin-top:2px">${pc ? dd(p.revenue, pc.revenue) : ""}<span>${pc ? "vs " + F.money(pc.revenue) + " · " + cmpLab : _t("compare.revenue_period")}</span></div></div>
        ${rows.map((r) => `<div class="pmetric"><span class="lab">${r[0]}</span><span style="display:flex;align-items:center;gap:8px">${r[2]}<span class="val tnum">${r[1]}</span></span></div>`).join("")}
        <div class="pmetric" style="flex-direction:column;align-items:flex-start;gap:5px"><span class="lab">${_t("compare.metric.top_product")}</span><span style="font-weight:600;font-size:13px;line-height:1.3">${tp ? (S.products(st.period, "rev", "all").filter((x) => x.platform === p.key)[0] || {}).cleanName || "—" : "—"}</span></div>
      </div>`;
    }).join("");

    // monthly multi-line trajectory
    const trend = S.businessTrend(st.period);

    // matrix
    const tblRows = pm.map((p) => {
      const pc = cmpRange ? S.aggRange(cmpRange, p.key) : null;
      const tf = trafMap[p.key];
      return `<tr>
        <td><span class="pchip">${UI.pdot(p.key)}<b>${p.label}</b></span></td>
        <td class="num"><b>${F.money(p.revenue)}</b></td>
        <td class="num">${cmpRange ? dd(p.revenue, pc.revenue) : "—"}</td>
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
    <div class="note section0" style="margin-bottom:16px">${UI.ICON.info} ${_t("compare.note")} <b>${S.periodLabel(st.period)}</b>${cmpLab ? ` ${_t("compare.note")} <b>${cmpLab}</b>` : ""}. ${_t("compare.note_sub")}</div>
    <div class="g12">${cards}</div>

    <div class="card section-gap">
      <div class="card-head"><div><div class="card-title">${_t("compare.trend.title")}</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()} · ${_t("compare.trend.sub")}</div></div>
        <div class="legend">${S.PKEYS.map((k) => `<span class="legend-item"><span class="legend-swatch" style="background:var(--${k})"></span>${S.PLAT[k].label}</span>`).join("")}</div>
      </div>
      <div class="card-pad" style="padding-top:14px"><div class="chart-wrap" style="height:300px"><canvas id="trajChart"></canvas></div></div>
    </div>

    <div class="card section-gap">
      <div class="card-head"><div><div class="card-title">${_t("compare.detail.title")}</div><div class="card-sub">${S.periodLabel(st.period).toLowerCase()}</div></div></div>
      <div class="card-pad" style="overflow-x:auto;padding:6px">
        <table class="tbl"><thead><tr><th>${_t("th.platform")}</th><th class="num">${_t("th.revenue")}</th><th class="num">Δ ${st.compare === "yoy" ? _t("compare.yoy_short") : st.compare === "prev" ? _t("compare.prev_short") : ""}</th><th class="num">${_t("th.orders")}</th><th class="num">${_t("th.completion_rate_pct")}</th><th class="num">% ${_t("common.cancel")}</th><th class="num">${_t("kpi.aov")}</th><th class="num">${_t("kpi.visits")}</th><th class="num">${_t("th.conv_pct")}</th><th class="num">${_t("th.share")}</th></tr></thead><tbody>${tblRows}</tbody></table>
      </div>
    </div>`;
  }

  function mount(root) {
    const trend = S.businessTrend(S.state.period);
    const tc = root.querySelector("#trajChart");
    if (tc) C.lineSeries(tc, trend.map((t) => t.label), S.PKEYS.map((k) => ({ label: S.PLAT[k].label, data: trend.map((t) => t[k]), color: "--" + k })), { money: true });
    const cacheKey = S.state.period + "|all";
    if (!S.getRangeDetail(S.state.period, "all") && detailLoadingKey !== cacheKey) {
      detailLoadingKey = cacheKey;
      S.ensureRangeDetail(S.state.period, "all").then(() => {
        if (detailLoadingKey === cacheKey) window.App.rerender();
      }).catch(() => {}).finally(() => {
        if (detailLoadingKey === cacheKey) detailLoadingKey = null;
      });
    }
  }

  window.Views.compare = { titleKey: "page.compare.title", eyebrowKey: "page.compare.eyebrow", render, mount };
})();