/* ============================================================
   View: Overview (Tổng quan)
   KPI + one trend chart (revenue/orders tabs) + platform share +
   top products + categories. Platform comparison moved to the
   Platforms page, the heatmap to Orders, regions to Customers.
   ============================================================ */
(function () {
  const S = window.Store, F = window.F, UI = window.UI;
  const _t = (k, f) => (window.t ? window.t(k, f) : (f || k));
  const _tf = (k, v) => (window.tf ? window.tf(k, v) : k);
  let detailLoadingKey = null;

  // Trend card state. grain null = the period's natural grain (S.defaultGrain).
  let metric = "revenue";
  let grain = null;
  const off = {};

  const pc = (k) => `var(--${k})`;

  function kpiCard(o) {
    return `<div class="card kpi reveal">
      <div class="kpi-label"><span class="kpi-ico">${o.ico}</span><span class="kl">${o.label}</span>${UI.tip(o.tip, o.tipRight ? { right: true } : null)}</div>
      <div class="kpi-value tnum">${o.value}${o.unit ? `<span class="unit">${o.unit}</span>` : ""}</div>
      <div class="kpi-foot">${o.delta || ""}<span>${o.foot}</span></div>
      <div class="kpi-viz">${o.viz}</div>
    </div>`;
  }

  // ---- trend card (rebuilt in place on its own controls, so fullscreen survives) ----
  function trendState() {
    const st = S.state, opts = S.grainOptions(st.period);
    const g = grain && opts.includes(grain) ? grain : S.defaultGrain(st.period);
    const isRev = metric === "revenue";
    const plats = st.platform === "all" ? S.PKEYS.filter((k) => !off[k]) : [st.platform];
    const series = S.periodSeries(st.period, g);
    const val = (b, k) => (isRev ? b.rev[k] : b.done[k]);
    const totals = series.map((b) => plats.reduce((t, k) => t + val(b, k), 0));
    return { st, opts, g, isRev, plats, series, val, totals };
  }
  const fmtV = (isRev, v) => (isRev ? F.money(v) : F.viInt(v) + " " + _t("common.orders_unit"));
  const axisFmt = (isRev) => (v) => (isRev ? (v ? F.money(v) : "0") : F.viInt(v));

  function readoutHTML(ts, i) {
    const { isRev, plats, series, val, totals, g, st } = ts;
    if (i == null) {
      const sum = totals.reduce((t, v) => t + v, 0);
      const cmpR = S.compareCurrentRange();
      let prev = null;
      if (cmpR) prev = plats.reduce((t, k) => { const a = S.aggRange(cmpR, k); return t + (isRev ? a.revenue : a.completed); }, 0);
      const peak = Math.max(...totals, 0), pi = totals.indexOf(peak);
      const avgKey = { day: "ovw.trend.avg_day", week: "ovw.trend.avg_week", month: "ovw.trend.avg_month", year: "ovw.trend.avg_year" }[g];
      return `<div class="readout"><span class="big-val">${fmtV(isRev, sum)}</span>${cmpR ? UI.deltaChip(F.delta(sum, prev)) : ""}</div>
        <div class="sub3" style="display:flex;gap:4px 16px;flex-wrap:wrap;margin-top:3px">
          <span>${_tf(avgKey, { v: fmtV(isRev, series.length ? sum / series.length : 0) })}</span>
          ${pi >= 0 && peak > 0 ? `<span>${_tf("ovw.trend.peak", { label: series[pi].label, v: fmtV(isRev, peak) })}</span>` : ""}
        </div>`;
    }
    const b = series[i];
    const parts = plats.length > 1 ? plats.map((k) => `<span class="part"><span class="sw" style="background:${pc(k)}"></span>${S.PLAT[k].label.replace(" Shop", "")}<b>${isRev ? F.money(val(b, k)) : F.viInt(val(b, k))}</b></span>`).join("") : "";
    return `<div class="sub3" style="font-weight:700">${UI.esc(b.full)}</div>
      <div class="readout"><span class="big-val">${fmtV(isRev, totals[i])}</span>${parts}</div>`;
  }

  function trendInner(ts) {
    const { st, opts, g, isRev, plats, series, val } = ts;
    const grainItems = opts.map((k) => [k, _t("period.mode." + k)]);
    const chart = series.length
      ? UI.bars(series.map((b) => ({ label: b.label, partial: b.partial, segs: plats.map((k) => ({ v: val(b, k), c: pc(k) })) })),
          axisFmt(isRev), (v) => (isRev ? F.money(v) : F.viInt(v)))
      : `<div class="empty-chart">${_t("common.empty_data")}</div>`;
    const legend = st.platform === "all"
      ? `<div class="lgd-btns">${S.PKEYS.map((k) => `<button type="button" class="${off[k] ? "off" : ""}" data-off="${k}"><span class="sw" style="background:${pc(k)}"></span>${S.PLAT[k].label}</button>`).join("")}</div>`
      : "";
    return `${UI.head(_t("ovw.trend.title"), _t("ovw.trend.tip"),
        UI.seg("trendMetric", [["revenue", _t("ovw.cmp.revenue")], ["orders", _t("ovw.trend.orders")]], metric)
        + (grainItems.length > 1 ? UI.seg("trendGrain", grainItems, g) : "")
        + `<span class="only-wide">${UI.fsBtn()}</span>`, { w: "320px" })}
      <div class="cread" id="trendRead">${readoutHTML(ts, null)}</div>
      <div id="trendChart">${chart}</div>
      ${legend}`;
  }

  function mountTrend(card) {
    if (!card) return;
    const ts = trendState();
    card.innerHTML = trendInner(ts);
    const read = card.querySelector("#trendRead");
    UI.wireBars(card.querySelector(".bchart"), (i) => { read.innerHTML = readoutHTML(ts, i); });
    const redo = () => mountTrend(card);
    card.querySelector("#trendMetric")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { metric = b.dataset.k; redo(); } });
    card.querySelector("#trendGrain")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { grain = b.dataset.k; redo(); } });
    card.querySelectorAll("[data-off]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.off;
      off[k] = !off[k];
      if (S.PKEYS.every((x) => off[x])) off[k] = false; // keep at least one platform drawn
      redo();
    }));
  }

  function render() {
    const st = S.state;
    const range = S.currentRange();
    const cmpRange = S.compareCurrentRange();
    const plat = st.platform;
    const cur = S.aggRange(range, plat);
    const cmp = cmpRange ? S.aggRange(cmpRange, plat) : null;
    const dd = (c, p, inv) => UI.deltaChip(F.delta(c, p), inv);
    const periodTxt = S.periodLabel(st.period);
    const cmpTip = cmpRange ? " " + _tf("ovw.kpi.cmp_suffix", { cmp: S.compareLabel(st.period, st.compare).toLowerCase() }) : "";

    // Spark bars follow the trend's default grain so a long period stays readable.
    const g = S.defaultGrain(st.period);
    const series = S.periodSeries(st.period, g);
    const sumP = (b, f) => (plat === "all" ? S.PKEYS.reduce((t, k) => t + b[f][k], 0) : b[f][plat]);
    const sparkColor = plat === "all" ? "var(--ink-3)" : pc(plat);
    const sRev = series.map((b) => sumP(b, "rev"));
    const sDone = series.map((b) => sumP(b, "done"));
    const sAov = series.map((b, i) => (sDone[i] ? sRev[i] / sDone[i] : 0));
    const other = Math.max(0, cur.orders - cur.completed - cur.cancelled);
    const ppChip = (c, p) => {
      if (p == null) return "";
      const v = c - p, dir = Math.abs(v) < 0.05 ? "flat" : v > 0 ? "up" : "down";
      return `<span class="delta ${dir}">${dir === "up" ? UI.ICON.up : dir === "down" ? UI.ICON.down : ""}${v > 0 ? "+" : ""}${F.viDec(v, 1)}%</span>`;
    };

    const kpis = [
      kpiCard({
        ico: UI.ICON.revenue, label: _t("kpi.revenue"), tip: _t("ovw.kpi.revenue_tip") + cmpTip,
        value: F.money(cur.revenue), delta: cmp ? dd(cur.revenue, cmp.revenue) : "",
        foot: cmp ? `vs ${F.money(cmp.revenue)}` : periodTxt, viz: UI.spark(sRev, sparkColor),
      }),
      kpiCard({
        ico: UI.ICON.orders, label: _t("kpi.orders"), tip: _t("ovw.kpi.orders_tip"),
        value: F.viInt(cur.orders), unit: " " + _t("common.orders_unit"), delta: cmp ? dd(cur.orders, cmp.orders) : "",
        foot: cmp ? `vs ${F.viInt(cmp.orders)} ${_t("common.orders_unit")}` : `${F.viInt(cur.completed)} ${_t("kpi.completed_unit")}`,
        viz: UI.spark(sDone, sparkColor),
      }),
      kpiCard({
        ico: UI.ICON.aov, label: _t("kpi.aov"), tip: _t("ovw.kpi.aov_tip"),
        value: F.money(cur.aov), delta: cmp ? dd(cur.aov, cmp.aov) : "",
        foot: cmp ? `vs ${F.money(cmp.aov)}` : _t("kpi.avg_order_foot"), viz: UI.spark(sAov, sparkColor),
      }),
      kpiCard({
        ico: UI.ICON.check, label: _t("kpi.completion_rate"), tip: _t("ovw.kpi.cr_tip"), tipRight: true,
        value: F.viDec(cur.completionRate, 1), unit: "%", delta: cmp ? ppChip(cur.completionRate, cmp.completionRate) : "",
        foot: cmp ? `vs ${F.pct(cmp.completionRate)}` : `${F.pct(cur.cancelRate)} ${_t("kpi.cancelled_foot")}`,
        viz: UI.stack([{ v: cur.completed, c: "var(--pos)" }, { v: cur.cancelled, c: "var(--neg)" }, { v: other, c: "var(--ink-3)" }])
          + UI.legend([
            { c: "var(--pos)", text: `${F.viInt(cur.completed)} ${_t("ovw.kpi.seg_done")}` },
            { c: "var(--neg)", text: `${F.viInt(cur.cancelled)} ${_t("ovw.kpi.seg_cancel")}` },
            { c: "var(--ink-3)", text: `${F.viInt(other)} ${_t("ovw.kpi.seg_other")}` },
          ].filter((x, i) => [cur.completed, cur.cancelled, other][i] > 0)),
      }),
    ].join("");

    // ---- share by platform: 100% bars instead of a donut (Shopee is ~99%,
    // so the small slices were unreadable) ----
    const pm = S.PKEYS.map((k) => ({ key: k, ...S.aggRange(range, k) }));
    const totRev = pm.reduce((t, p) => t + p.revenue, 0), totOrd = pm.reduce((t, p) => t + p.orders, 0);
    const shareBars = [["ovw.share.rev_bar", "revenue"], ["ovw.share.ord_bar", "orders"]].map(([lk, f]) => `<div>
        <div class="lab3" style="margin-bottom:6px">${_t(lk)}</div>
        ${UI.stack(pm.map((p) => ({ v: p[f], c: pc(p.key) })), 14)}
      </div>`).join("");
    const shareRows = pm.map((p) => `<div style="display:grid;grid-template-columns:minmax(0,1fr) 62px 62px;align-items:center;gap:8px;padding:10px 8px;margin:0 -8px;border-top:1px solid var(--border);border-radius:8px;${plat === p.key ? "background:var(--surface-2)" : ""}">
        <div style="min-width:0">
          <div class="pname-dot">${UI.pdot(p.key)}${S.PLAT[p.key].label}</div>
          <div class="sub3 tnum" style="margin-top:2px;padding-left:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${F.money(p.revenue)} · ${F.viInt(p.orders)} ${_t("common.orders_unit")}</div>
        </div>
        <div class="r v15" style="font-size:14px">${F.pct(totRev ? p.revenue / totRev * 100 : 0)}</div>
        <div class="r tnum" style="font-size:13px;font-weight:700;color:var(--ink-2)">${F.pct(totOrd ? p.orders / totOrd * 100 : 0)}</div>
      </div>`).join("");

    // ---- top 5 products (gifts left out, as on the Products page) ----
    const top = S.products(st.period, "rev", plat).filter((p) => p.cat !== "gift").slice(0, 5);
    const tMax = Math.max(...top.map((p) => p.revenue), 1);
    const tColor = (p) => (p.platform && p.platform !== "all" ? pc(p.platform) : "var(--brand)");
    const topWide = top.map((p, i) => `<div class="gt-row">
        <span class="rk${i === 0 ? " first" : ""}">${i + 1}</span>
        <div style="min-width:0"><div class="nm">${UI.esc(p.cleanName)}</div><div class="meta"><span class="mono">${UI.esc(p.sku)}</span><span>·</span><span>${S.catLabel(p.cat)}</span></div></div>
        <div class="r tnum" style="font-size:13.5px">${F.viInt(p.qty)}</div>
        <div class="cell-bar">${UI.track(p.revenue / tMax, tColor(p))}<b style="min-width:64px">${F.money(p.revenue)}</b></div>
      </div>`).join("");
    const topNarrow = top.map((p, i) => `<div class="mrow" style="display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px">
        <span class="rk${i === 0 ? " first" : ""}">${i + 1}</span>
        <div style="min-width:0">
          <div class="nm">${UI.esc(p.cleanName)}</div>
          <div class="meta"><span class="mono">${UI.esc(p.sku)}</span><span>·</span><span>${F.viInt(p.qty)} ${_t("ovw.top.qty_unit")}</span></div>
          <div class="cell-bar" style="margin-top:8px">${UI.track(p.revenue / tMax, tColor(p), 6)}<b>${F.money(p.revenue)}</b></div>
        </div>
      </div>`).join("");
    // Products and categories come from the period's range detail (fetched in
    // mount); say "loading" until it lands rather than "no data".
    const detailReady = !!S.getRangeDetail(st.period, plat);
    const waitOrEmpty = `<div class="empty-chart">${_t(detailReady ? "common.empty_data" : "common.loading")}</div>`;
    const topBody = top.length ? `<div class="gt only-wide" style="--cols:28px minmax(0,2fr) 80px minmax(0,1.3fr)">
        <div class="gt-head"><span>#</span><span>${_t("th.product")}</span><span class="r">${_t("th.qty_sold")}</span><span>${_t("th.revenue")}</span></div>${topWide}</div>
      <div class="mlist only-narrow">${topNarrow}</div>` : waitOrEmpty;

    // ---- categories (horizontal bars instead of a donut) ----
    const cats = S.categoryBreakdown(st.period, plat).filter((c) => c.revenue > 0);
    const cTot = cats.reduce((t, c) => t + c.revenue, 0), cMax = Math.max(...cats.map((c) => c.revenue), 1);
    const catRows = cats.map((c) => `<div style="display:flex;flex-direction:column;gap:6px;padding:9px 0">
        <div style="display:flex;align-items:baseline;gap:8px;font-size:13px">
          <span class="nm" style="flex:1;font-size:13px">${S.catLabel(c.cat)}</span>
          <b class="tnum" style="font-weight:800">${F.money(c.revenue)}</b>
          <span class="tnum" style="color:var(--ink-3);font-weight:600;width:46px;text-align:right">${F.pct(cTot ? c.revenue / cTot * 100 : 0)}</span>
        </div>${UI.track(c.revenue / cMax, "var(--ink-2)")}
      </div>`).join("") || waitOrEmpty;

    return `<div class="pg">
      <div class="kpis">${kpis}</div>
      <div class="frow">
        <div class="card" id="trendCard" style="flex:2 1 560px"></div>
        <div class="card" style="flex:1 1 300px;display:flex;flex-direction:column">
          ${UI.head(_t("ovw.share.title"), _t("ovw.share.tip"))}
          <div class="cbody" style="display:flex;flex-direction:column;gap:16px;flex:1;padding-top:18px">
            <div style="display:flex;align-items:baseline;gap:8px"><span class="big-val">${F.money(totRev)}</span><span class="lab3" style="font-size:11px;letter-spacing:.03em">${_t("ovw.share.total_revenue")}</span></div>
            <div style="display:flex;flex-direction:column;gap:12px">${shareBars}</div>
            <div>
              <div style="display:grid;grid-template-columns:minmax(0,1fr) 62px 62px;gap:8px;font-size:11px;font-weight:700;letter-spacing:.04em;color:var(--ink-3);padding-bottom:8px">
                <span>${_t("th.platform")}</span><span class="r">${_t("ovw.share.col_rev")}</span><span class="r">${_t("ovw.share.col_ord")}</span>
              </div>${shareRows}
            </div>
          </div>
        </div>
      </div>
      <div class="frow">
        <div class="card" style="flex:2 1 560px">
          ${UI.head(_t("ovw.top_products.title"), _t("ovw.top.tip"), `<a class="tag" data-nav="products" style="cursor:pointer">${_t("ovw.top_products.view_all")}</a>`)}
          ${topBody}
        </div>
        <div class="card" style="flex:1 1 300px">
          ${UI.head(_t("ovw.category.title"), _t("ovw.category.tip"), "", { right: true })}
          <div class="clist">${catRows}</div>
        </div>
      </div>
    </div>`;
  }

  function mount(root) {
    const st = S.state;
    mountTrend(root.querySelector("#trendCard"));
    root.querySelectorAll("[data-nav]").forEach((a) => a.addEventListener("click", () => window.App.go(a.dataset.nav)));

    const cacheKey = st.period + "|" + st.platform;
    if (!S.getRangeDetail(st.period, st.platform) && detailLoadingKey !== cacheKey) {
      detailLoadingKey = cacheKey;
      S.ensureRangeDetail(st.period, st.platform).then(() => {
        if (detailLoadingKey === cacheKey && S.state.page === "overview") window.App.rerender();
      }).catch(() => {}).finally(() => {
        if (detailLoadingKey === cacheKey) detailLoadingKey = null;
      });
    }
  }

  window.Views.overview = { titleKey: "page.overview.title", eyebrowKey: "page.overview.eyebrow", render, mount };
})();
