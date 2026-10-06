/* ============================================================
   View: Platforms & traffic (Sàn & lưu lượng)
   Replaces the old "So sánh sàn" and "Lưu lượng" pages: their
   platform cards, matrix and traffic table were the same table.
   ============================================================ */
(function () {
  const S = window.Store, F = window.F, UI = window.UI;
  const _t = (k, f) => (window.t ? window.t(k, f) : (f || k));
  const _tf = (k, v) => (window.tf ? window.tf(k, v) : k);

  let hideShopee = false;
  let metric = "rev";
  const pc = (k) => `var(--${k})`;

  function render() {
    const st = S.state;
    const range = S.currentRange(), cmpRange = S.compareCurrentRange();
    const X = S.PKEYS.map((k) => {
      const a = S.aggRange(range, k), tr = S.trafficAggRange(range, k);
      return { key: k, ...a, pv: tr.pv, visits: tr.visits, nf: tr.nf, conv: tr.conv, prev: cmpRange ? S.aggRange(cmpRange, k) : null };
    });
    const totRev = X.reduce((t, x) => t + x.revenue, 0);
    const shown = hideShopee ? X.filter((x) => x.key !== "shopee") : X;
    const mx = (f) => Math.max(...shown.map((x) => x[f]), 1e-9);
    const mR = mx("revenue"), mD = mx("completed"), mV = mx("visits"), mC = mx("conv");
    const share = (x) => F.pct(totRev ? x.revenue / totRev * 100 : 0);
    const dlt = (x) => (x.prev ? UI.deltaTxt(x.revenue, x.prev.revenue) : `<span class="dtxt flat">—</span>`);
    const canC = (x) => (x.cancelRate > 16 ? "var(--neg)" : "var(--ink-2)");
    const dLabel = "Δ " + (st.compare === "yoy" ? _t("compare.yoy_short") : _t("compare.prev_short"));

    const cols = "116px minmax(0,1.4fr) 70px minmax(0,.9fr) 80px 70px minmax(0,1fr) minmax(0,1fr) 80px";
    const wide = shown.map((x) => `<div class="gt-row" style="padding:14px 20px">
        <div><div class="pname-dot" style="font-size:13.5px;font-weight:800">${UI.pdot(x.key)}${S.PLAT[x.key].label}</div><div class="sub3" style="font-size:11.5px;padding-left:15px">${_tf("plat.share_rev", { p: share(x) })}</div></div>
        <div class="with-bar"><div class="n14">${F.money(x.revenue)}</div>${UI.track(x.revenue / mR, pc(x.key), 6)}</div>
        <span class="r">${dlt(x)}</span>
        <div class="with-bar"><div class="n13">${F.viInt(x.completed)}</div>${UI.track(x.completed / mD, `color-mix(in oklch, ${pc(x.key)} 75%, transparent)`, 6)}</div>
        <span class="r n13">${F.money(x.aov)}</span>
        <span class="r n13" style="color:${canC(x)}">${F.pct(x.cancelRate)}</span>
        <div class="with-bar"><div class="n13">${F.viInt(x.visits)}</div>${UI.track(x.visits / mV, `color-mix(in oklch, ${pc(x.key)} 75%, transparent)`, 6)}</div>
        <div class="with-bar"><div class="n13" style="font-weight:800">${F.pct(x.conv, 2)}</div>${UI.track(x.conv / mC, pc(x.key), 6)}</div>
        <span class="r n13">${F.viInt(x.nf)}</span>
      </div>`).join("");
    const narrow = shown.map((x) => `<div class="mrow" style="padding:14px 0;gap:12px">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="pdot" style="width:9px;height:9px;background:${pc(x.key)};flex:none"></span>
          <span style="font-size:14px;font-weight:800;flex:1;min-width:0">${S.PLAT[x.key].label} <span class="sub3" style="font-size:11.5px">${share(x)}</span></span>
          <span class="v15">${F.money(x.revenue)}</span>
          <span style="min-width:50px;text-align:right">${dlt(x)}</span>
        </div>
        <div style="margin-top:-4px">${UI.track(x.revenue / mR, pc(x.key))}</div>
        <div class="m3">
          <div><div class="lab3">${_t("plat.col.done")}</div><div class="n13" style="font-weight:800">${F.viInt(x.completed)}</div></div>
          <div><div class="lab3">${_t("kpi.aov")}</div><div class="n13" style="font-weight:800">${F.money(x.aov)}</div></div>
          <div><div class="lab3">% ${_t("common.cancel")}</div><div class="n13" style="font-weight:800;color:${canC(x)}">${F.pct(x.cancelRate)}</div></div>
          <div><div class="lab3">${_t("kpi.visits")}</div><div class="n13" style="font-weight:800">${F.viInt(x.visits)}</div></div>
          <div><div class="lab3">${_t("plat.col.conv")}</div><div class="n13" style="font-weight:800">${F.pct(x.conv, 2)}</div></div>
          <div><div class="lab3">${_t("plat.col.nf")}</div><div class="n13" style="font-weight:800">${F.viInt(x.nf)}</div></div>
        </div>
      </div>`).join("");
    const shopeeShare = totRev ? X[0].revenue / totRev * 100 : 0;
    const toggle = `<button type="button" class="ctrl-btn ${hideShopee ? "on" : ""}" id="hideShopeeBtn" style="height:36px;padding:0 12px;font-size:12.5px">${hideShopee ? _t("ovw.cmp.show_shopee") : _t("ovw.cmp.hide_shopee")}</button>`;

    // ---- funnel: each platform scaled to its own page views, so the shapes
    // compare even though Shopee is tens of times larger ----
    const funnel = X.map((x) => `<div style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800">${UI.pdot(x.key)}${S.PLAT[x.key].label}<span style="margin-left:auto" class="lab3">CR</span><b class="tnum" style="font-size:15px;color:${pc(x.key)}">${F.pct(x.conv, 2)}</b></div>
        ${[["plat.funnel.views", x.pv, 1], ["plat.funnel.visits", x.visits, 0.7], ["plat.funnel.done", x.completed, 1]].map(([lk, v, op]) => `<div class="fun-row">
          <span class="lab3" style="white-space:nowrap">${_t(lk)}</span>
          <div class="trk" style="height:16px;border-radius:5px"><i style="width:${x.pv ? Math.min(100, v / x.pv * 100).toFixed(1) : 0}%;min-width:${v ? 3 : 0}px;background:${pc(x.key)};opacity:${op};border-radius:5px"></i></div>
          <span class="tnum" style="font-size:12.5px;font-weight:800;text-align:right;white-space:nowrap">${F.viInt(v)}</span>
        </div>`).join("")}
      </div>`).join("");

    // ---- last 12 months, one chart per platform with its own scale ----
    const months = S.last12Months(st.period);
    const valOf = (m, k) => (metric === "rev" ? m.rev[k] : metric === "vis" ? m.visits[k] : (m.visits[k] ? m.done[k] / m.visits[k] * 100 : 0));
    const fmt = (v) => (metric === "rev" ? F.money(v) : metric === "vis" ? F.num(v) : F.pct(v, 2));
    const multi = S.PKEYS.map((k) => {
      const arr = months.map((m) => valOf(m, k)), top = Math.max(...arr, 1e-9);
      const last = arr[11], before = arr[10];
      return `<div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">${UI.pdot(k)}<span style="font-size:13px;font-weight:800">${S.PLAT[k].label}</span>
          <span class="v15" style="margin-left:auto;font-size:14px">${fmt(last)}</span>${UI.deltaTxt(last, before, false, metric === "cr")}</div>
        <div class="mini12">${arr.map((v, i) => `<i title="${UI.esc(months[i].label + " · " + fmt(v))}" style="height:${v ? Math.max(4, v / top * 100).toFixed(1) + "%" : "2px"};background:${!v ? "var(--track)" : i === 11 ? pc(k) : `color-mix(in oklch, ${pc(k)} 35%, var(--surface))`}"></i>`).join("")}</div>
      </div>`;
    }).join("");

    return `<div class="pg">
      <div class="card">
        ${UI.head(_t("plat.cmp.title"), _tf("plat.cmp.tip", { p: F.pct(shopeeShare) }), toggle, { w: "320px" })}
        <div class="gt only-wide" style="--cols:${cols}">
          <div class="gt-head"><span>${_t("th.platform")}</span><span>${_t("th.revenue")}</span><span class="r">${dLabel}</span><span>${_t("plat.col.done")}</span><span class="r">${_t("kpi.aov")}</span><span class="r">% ${_t("common.cancel")}</span><span>${_t("kpi.visits")}</span><span>${_t("plat.col.conv")}</span><span class="r">${_t("plat.col.nf")}</span></div>
          ${wide}
        </div>
        <div class="only-narrow" style="padding:8px 16px 6px">${narrow}</div>
      </div>
      <div class="frow">
        <div class="card" style="flex:1 1 420px">
          ${UI.head(_t("plat.funnel.title"), _t("plat.funnel.tip"))}
          <div class="cbody" style="display:flex;flex-direction:column;gap:18px">${funnel}</div>
        </div>
        <div class="card" style="flex:1 1 420px">
          ${UI.head(_t("plat.m12.title"), _t("plat.m12.tip"), UI.seg("m12Metric", [["rev", _t("ovw.cmp.revenue")], ["vis", _t("kpi.visits")], ["cr", "CR"]], metric), { right: true })}
          <div class="cbody" style="display:flex;flex-direction:column;gap:16px">
            ${multi}
            <div style="display:flex;justify-content:space-between;font-size:10.5px;font-weight:600;color:var(--ink-3);margin-top:-8px"><span>${months[0].label}</span><span>${months[5].label}</span><span>${months[11].label}</span></div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function mount(root) {
    root.querySelector("#hideShopeeBtn")?.addEventListener("click", () => { hideShopee = !hideShopee; window.App.rerender(); });
    root.querySelector("#m12Metric")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { metric = b.dataset.k; window.App.rerender(); } });
  }

  window.Views.platforms = { titleKey: "page.platforms.title", eyebrowKey: "page.platforms.eyebrow", noPlatform: true, render, mount };
})();
