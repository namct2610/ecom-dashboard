/* ============================================================
   Views: Orders, Products, Customers
   (Traffic moved into the Platforms page in 3.6.0.)
   ============================================================ */
(function () {
  const S = window.Store, F = window.F, UI = window.UI;
  const _t = (k, f) => (window.t ? window.t(k, f) : (f || k));
  const _tf = (k, v) => (window.tf ? window.tf(k, v) : k);
  const escHtml = UI.esc;
  const pc = (k) => `var(--${k})`;
  const platKey = (p) => (p === "tiktokshop" ? "tiktok" : p);
  let detailLoadingKey = null;

  // Tải nền cho các thẻ phụ: gọi một lần cho mỗi (kỳ|sàn), vẽ lại khi có dữ
  // liệu. Lỗi thì đánh dấu và KHÔNG tự gọi lại cho kỳ đó — nếu không, mount →
  // lỗi → vẽ lại → mount sẽ lặp vô hạn khi API hỏng. Đổi kỳ/sàn hoặc tải lại
  // trang để thử lại.
  function lazyCard(state, key, has, load, page) {
    if (has || state.loading === key || state.failed === key) return;
    state.loading = key;
    load().then(() => {
      if (state.loading === key && S.state.page === page) window.App.rerender();
    }).catch(() => {
      state.failed = key;
      if (S.state.page === page) window.App.rerender();
    }).finally(() => {
      if (state.loading === key) state.loading = null;
    });
  }
  function ensureDetail(page) {
    const st = S.state, key = st.period + "|" + st.platform;
    if (S.getRangeDetail(st.period, st.platform) || detailLoadingKey === key) return;
    detailLoadingKey = key;
    S.ensureRangeDetail(st.period, st.platform).then(() => {
      if (detailLoadingKey === key && S.state.page === page) window.App.rerender();
    }).catch(() => {}).finally(() => {
      if (detailLoadingKey === key) detailLoadingKey = null;
    });
  }
  const cancelState = { loading: null, failed: null };
  const retentionState = { loading: null, failed: null };
  const skuProfitState = { loading: null, failed: null };
  const skuSingleState = { loading: null, failed: null };

  const msgHTML = (text, err) => `<div style="color:var(${err ? "--neg" : "--ink-3"});font-size:13px;font-weight:${err ? 700 : 600};padding:6px 0">${text}</div>`;
  const loadingOr = (failed, key) => msgHTML(failed ? _t("common.error") : _t(key), failed);

  // Orders recognise three kinds; delivered counts as done.
  const kindOf = (s) => (s === "cancelled" ? "cancelled" : s === "completed" || s === "delivered" ? "done" : "pending");
  function statusInfo(s) {
    const k = kindOf(s);
    if (k === "cancelled") return [_t("status.cancelled"), "st-cancel"];
    if (k === "pending") return [_t("status.processing"), "st-ship"];
    return [_t("status.completed"), "st-done"];
  }
  const dtShort = (s) => { const [d, t] = String(s || "").split(" "); const p = (d || "").split("-"); return p.length < 3 ? "—" : p[2] + "/" + p[1] + (t ? " " + t.slice(0, 5) : ""); };
  const CAL_D = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const dayLabels = () => CAL_D.map((d) => _t("period.cal." + d));

  /* ===================== ORDERS ===================== */
  let ordGrain = null;
  let recentFilter = "all";

  function statusTrendState() {
    const st = S.state, opts = S.grainOptions(st.period);
    const g = ordGrain && opts.includes(ordGrain) ? ordGrain : S.defaultGrain(st.period);
    const plats = st.platform === "all" ? S.PKEYS : [st.platform];
    const rows = S.periodSeries(st.period, g).map((b) => {
      const sum = (f) => plats.reduce((t, k) => t + b[f][k], 0);
      const ord = sum("ord"), done = sum("done"), canc = sum("canc");
      return { label: b.label, full: b.full, partial: b.partial, done, canc, pend: Math.max(0, ord - done - canc), ord };
    });
    return { opts, g, rows };
  }
  function statusReadout(ts, i) {
    const { rows, g } = ts;
    const rate = (c, o) => F.pct(o ? c / o * 100 : 0);
    if (i == null) {
      const ord = rows.reduce((t, r) => t + r.ord, 0), canc = rows.reduce((t, r) => t + r.canc, 0);
      const avgKey = { day: "orders.trend.avg_day", week: "orders.trend.avg_week", month: "orders.trend.avg_month", year: "orders.trend.avg_year" }[g];
      return `<div class="sub3" style="font-weight:700">${_tf(avgKey, { v: F.viInt(rows.length ? ord / rows.length : 0) })}</div>
        <div class="readout"><span class="big-val" style="font-size:22px">${F.viInt(ord)} ${_t("common.orders_unit")}</span>
          <span class="part"><span class="sw" style="background:var(--neg);border-radius:3px"></span>${_t("orders.trend.cancel_rate")}<b>${rate(canc, ord)}</b></span></div>`;
    }
    const r = rows[i];
    return `<div class="sub3" style="font-weight:700">${escHtml(r.full)}</div>
      <div class="readout"><span class="big-val" style="font-size:22px">${F.viInt(r.ord)} ${_t("common.orders_unit")}</span>
        <span class="part"><span class="sw" style="background:var(--pos);border-radius:3px"></span>${_t("orders.short.done")}<b>${F.viInt(r.done)}</b></span>
        <span class="part"><span class="sw" style="background:var(--neg);border-radius:3px"></span>${_t("orders.short.cancel")}<b>${F.viInt(r.canc)}</b></span>
        <span class="part">${_t("orders.trend.cancel_rate")}<b>${rate(r.canc, r.ord)}</b></span></div>`;
  }
  function mountStatusTrend(card) {
    if (!card) return;
    const ts = statusTrendState();
    const items = ts.opts.map((k) => [k, _t("period.mode." + k)]);
    const chart = ts.rows.length
      ? UI.bars(ts.rows.map((r) => ({ label: r.label, partial: r.partial, segs: [{ v: r.done, c: "var(--pos)" }, { v: r.canc, c: "var(--neg)" }, { v: r.pend, c: "var(--ink-3)" }] })), (v) => F.viInt(v), (v) => F.viInt(v))
      : `<div class="empty-chart">${_t("common.empty_data")}</div>`;
    card.innerHTML = `${UI.head(_t("orders.trend.title"), _t("orders.trend.tip"), (items.length > 1 ? UI.seg("ordGrain", items, ts.g) : "") + `<span class="only-wide">${UI.fsBtn()}</span>`)}
      <div class="cread" id="ordRead">${statusReadout(ts, null)}</div>
      ${chart}
      <div class="lgd-btns" style="pointer-events:none">
        <button type="button"><span class="sw" style="background:var(--pos)"></span>${_t("status.completed")}</button>
        <button type="button"><span class="sw" style="background:var(--neg)"></span>${_t("status.cancelled")}</button>
        <button type="button"><span class="sw" style="background:var(--ink-3)"></span>${_t("status.processing")}</button>
      </div>`;
    const read = card.querySelector("#ordRead");
    UI.wireBars(card.querySelector(".bchart"), (i) => { read.innerHTML = statusReadout(ts, i); });
    card.querySelector("#ordGrain")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { ordGrain = b.dataset.k; mountStatusTrend(card); } });
  }

  // Lý do chỉ có cho đơn nhập từ 3.5.6 (hoặc còn dòng thô để điền bù), nên luôn
  // ghi rõ "có lý do cho n/m đơn huỷ" — không trình bày một phần dữ liệu như
  // thể là toàn bộ.
  const WHO_C = { buyer: "var(--ink-2)", system: "var(--ink-3)", seller: "var(--brand)", unknown: "var(--border-strong)" };
  function cancelCardsHTML(data, failed) {
    const card = (title, tip, body, right) => `<div class="card" style="flex:1 1 420px">${UI.head(title, tip, right)}<div class="cbody">${body}</div></div>`;
    const reasonsTitle = _t("orders.cancel.reasons_title"), payTitle = _t("orders.cancel.payment_title");
    if (!data) {
      const m = loadingOr(failed, "orders.cancel.loading");
      return `<div class="frow">${card(reasonsTitle, _t("orders.cancel.reasons_tip"), m)}${card(payTitle, _t("orders.cancel.payment_tip"), m)}</div>`;
    }

    const cov = data.reason_coverage || { with_reason: 0, cancelled: 0 };
    let reasons;
    if (!data.cancelled) reasons = msgHTML(_t("orders.cancel.no_cancel"));
    else if (!cov.with_reason) reasons = msgHTML(_t("orders.cancel.no_reason"));
    else {
      const who = (data.by_who || []).filter((w) => w.share > 0);
      const maxShare = Math.max(...(data.reasons || []).map((r) => r.share), 1);
      reasons = `<div style="display:flex;flex-direction:column;gap:14px">
        <div><div class="lab3" style="margin-bottom:6px">${_t("orders.cancel.who_title")}</div>
          ${UI.stack(who.map((w) => ({ v: w.share, c: WHO_C[w.who] || "var(--ink-3)" })), 12)}
          <div style="margin-top:7px">${UI.legend(who.map((w) => ({ c: WHO_C[w.who] || "var(--ink-3)", text: `${escHtml(_t("orders.cancel.who." + w.who))} <b>${F.pct(w.share)}</b>` })))}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">${(data.reasons || []).map((r) => `<div class="brow">
          <span class="bl">${escHtml(_t("orders.cancel.group." + r.group))}</span>${UI.track(r.share / maxShare, "var(--ink-2)", 9)}<b class="bv">${F.pct(r.share)}</b></div>`).join("")}</div>
      </div>`;
    }
    const covNote = cov.cancelled ? `<span class="card-note">${_tf("orders.cancel.coverage_short", { n: F.viInt(cov.with_reason), m: F.viInt(cov.cancelled) })}</span>` : "";

    // Nhóm 'none' (chưa chọn phương thức) gần như 100% là đơn huỷ — lấy nó làm
    // chuẩn sẽ ép mọi thanh còn lại thành vệt nhỏ, nên thang đo bỏ nhóm đó ra.
    const avg = data.rate || 0;
    const pays = (data.by_payment || []).filter((p) => p.orders > 0);
    const pMax = Math.max(...pays.filter((p) => p.method !== "none").map((p) => p.rate), avg, 1) * 1.1;
    const payBody = pays.length ? `<div style="display:flex;flex-direction:column;gap:4px">${pays.map((p) => {
      const hi = p.rate > avg;
      return `<div class="brow" style="padding:8px 0">
        <div style="min-width:0"><div class="nm" style="font-size:13px;font-weight:700">${escHtml(_t("orders.cancel.pay." + p.method))}</div><div class="sub3" style="font-size:11.5px">${_tf("orders.cancel.of_orders", { n: F.viInt(p.orders) })}</div></div>
        <div class="trk" style="height:10px;position:relative;overflow:visible"><i style="width:${Math.min(100, p.rate / pMax * 100).toFixed(1)}%;background:${hi ? "var(--neg)" : "var(--ink-3)"}"></i><span class="avg-mark" style="left:${(avg / pMax * 100).toFixed(1)}%"></span></div>
        <b class="bv" style="font-size:13.5px;color:${hi ? "var(--neg)" : "var(--ink)"}">${F.pct(p.rate)}</b></div>`;
    }).join("")}</div>` : msgHTML(_t("orders.cancel.no_cancel"));

    return `<div class="frow">
      ${card(reasonsTitle, _tf("orders.cancel.reasons_tip_cov", { n: F.viInt(cov.with_reason), m: F.viInt(cov.cancelled) }), reasons, covNote)}
      ${card(payTitle, _tf("orders.cancel.payment_tip_avg", { avg: F.pct(avg) }), payBody)}
    </div>`;
  }

  // Heatmap: 24 one-hour cells on wide screens; on phones 8 three-hour cells
  // with the count inside, so nothing scrolls sideways.
  function heatBlock(m, bucket) {
    const days = dayLabels();
    const grid = m.map((r) => (bucket === 3 ? Array.from({ length: 8 }, (_, b) => r[b * 3] + r[b * 3 + 1] + r[b * 3 + 2]) : r));
    let max = 0, pk = [0, 0];
    grid.forEach((r, d) => r.forEach((v, h) => { if (v > max) { max = v; pk = [d, h]; } }));
    const hours = bucket === 3 ? Array.from({ length: 8 }, (_, b) => b * 3 + "h") : Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? String(h) : ""));
    const cells = grid.map((r, d) => `<div class="hm-row"><div class="hm-day">${days[d]}</div><div class="hm-cells">${r.map((v, h) => {
      const t = max ? v / max : 0;
      const bg = v === 0 ? "var(--track)" : `color-mix(in oklch, var(--brand) ${(14 + t * 70).toFixed(0)}%, var(--surface))`;
      return `<div class="hm-c" data-d="${d}" data-h="${h}" data-v="${v}" style="background:${bg};color:${t > 0.5 ? "#fff" : "var(--ink-2)"}">${bucket === 3 && v ? v : ""}</div>`;
    }).join("")}</div></div>`).join("");
    return { html: `<div class="hm${bucket === 3 ? " h3" : ""}" style="--hc:${bucket === 3 ? 8 : 24}" data-bucket="${bucket}" data-pk="${pk[0]},${pk[1]}" data-max="${max}">
        <div class="hm-row"><div></div><div class="hm-cells">${hours.map((h) => `<div class="hm-hours">${h}</div>`).join("")}</div></div>${cells}</div>`, grid, pk };
  }
  function heatRead(bucket, d, h, v, isPeak) {
    const slot = bucket === 3 ? `${h * 3}h–${h * 3 + 3}h` : `${h}h–${h + 1}h`;
    return `<span class="lab3" style="font-size:12px">${_t(isPeak ? "orders.heat.peak" : "orders.heat.viewing")}</span>
      <span style="font-size:15px;font-weight:800">${dayLabels()[d]} · ${slot}</span>
      <span class="tnum" style="font-size:13px;font-weight:800;color:var(--brand)">${F.viInt(v)} ${_t("common.orders_unit")}</span>`;
  }
  function heatCard(key, platform) {
    const { m } = S.heatMatrix(key, platform);
    const blocks = [heatBlock(m, 1), heatBlock(m, 3)];
    const scale = `<div style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:var(--ink-3)">${_t("orders.heat.less")}${["var(--track)", 30, 57, 84].map((p) =>
      `<span style="width:14px;height:14px;border-radius:4px;background:${typeof p === "number" ? `color-mix(in oklch, var(--brand) ${p}%, var(--surface))` : p}"></span>`).join("")}${_t("orders.heat.more")}</div>`;
    return `<div class="card">${UI.head(_t("ovw.heat.title"), _t("orders.heat.tip"), scale)}
      ${blocks.map((b, i) => { const [d, h] = b.pk; return `<div class="${i ? "only-narrow" : "only-wide"} hm-wrap">
        <div class="readout cread" style="align-items:baseline;gap:8px;min-height:0">${heatRead(i ? 3 : 1, d, h, b.grid[d][h], true)}</div>${b.html}</div>`; }).join("")}
    </div>`;
  }
  function wireHeat(root) {
    root.querySelectorAll(".hm-wrap").forEach((wrap) => {
      const hm = wrap.querySelector(".hm"), read = wrap.querySelector(".readout");
      const bucket = +hm.dataset.bucket, [pd, ph] = hm.dataset.pk.split(",").map(Number);
      const peakCell = hm.querySelector(`.hm-c[data-d="${pd}"][data-h="${ph}"]`);
      const show = (c) => {
        hm.querySelectorAll(".hm-c.sel").forEach((x) => x.classList.remove("sel"));
        if (c) c.classList.add("sel");
        const t = c || peakCell;
        if (t) read.innerHTML = heatRead(bucket, +t.dataset.d, +t.dataset.h, +t.dataset.v, !c);
      };
      hm.addEventListener("mouseover", (e) => { const c = e.target.closest(".hm-c"); if (c) show(c); });
      hm.addEventListener("click", (e) => { const c = e.target.closest(".hm-c"); if (c) show(c); });
      hm.addEventListener("mouseleave", () => show(null));
    });
  }

  function recentInner(list) {
    const filters = [["all", _t("common.all")], ["done", _t("orders.short.done")], ["cancelled", _t("orders.short.cancel")], ["pending", _t("status.processing")]];
    const rows = list.filter((o) => recentFilter === "all" || kindOf(o.status) === recentFilter);
    const pill = (o) => { const [lab, cls] = statusInfo(o.status); return `<span class="status-pill ${cls}">${lab}</span>`; };
    const pname = (o) => `${escHtml((o.product || "").replace(/^\[.*?\]\s*/, ""))}${o.items > 1 ? ` <span class="sub3" style="font-size:11px">+${o.items - 1}</span>` : ""}`;
    const plat = (o) => (S.PLAT[o.platform] ? S.PLAT[o.platform].label.replace(" Shop", "") : o.platform);
    const wide = rows.map((o) => `<div class="gt-row">
        <span class="mono" style="font-size:11.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis">${escHtml(o.order_id)}</span>
        <span class="pname-dot">${UI.pdot(o.platform)}${plat(o)}</span>
        <span class="nm" style="font-size:13px">${pname(o)}</span>
        <span class="nm" style="font-size:13px;font-weight:500;color:var(--ink-2)">${escHtml(o.city || "—")}</span>
        <b class="r tnum" style="font-size:13.5px">${F.moneyFull(o.amount)}</b>
        <span>${pill(o)}</span>
        <span class="r sub3 tnum">${dtShort(o.created)}</span>
      </div>`).join("");
    const narrow = rows.map((o) => `<div class="mrow">
        <div style="display:flex;align-items:center;gap:8px">${UI.pdot(o.platform)}<span class="mono" style="font-size:11px;color:var(--ink-3);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${escHtml(o.order_id)}</span>${pill(o)}</div>
        <div class="nm">${pname(o)}</div>
        <div style="display:flex;align-items:baseline;gap:8px" class="sub3"><span>${escHtml(o.city || "—")}</span><span>·</span><span class="tnum">${dtShort(o.created)}</span>
          <b class="tnum" style="margin-left:auto;font-size:14px;color:var(--ink);font-weight:800">${F.moneyFull(o.amount)}</b></div>
      </div>`).join("");
    const empty = `<div class="empty-chart">${_t("common.no_results")}</div>`;
    return `${UI.head(_t("ovw.recent_orders.title"), _t("orders.recent.tip"), UI.seg("recentSeg", filters, recentFilter))}
      <div class="gt only-wide" style="--cols:170px 100px minmax(0,2fr) minmax(0,1fr) 120px 130px 90px">
        <div class="gt-head"><span>${_t("th.order_id")}</span><span>${_t("th.platform")}</span><span>${_t("th.product")}</span><span>${_t("th.region")}</span><span class="r">${_t("orders.recent.value")}</span><span>${_t("th.status")}</span><span class="r">${_t("orders.recent.time")}</span></div>
        ${wide || empty}
      </div>
      <div class="mlist only-narrow">${narrow || empty}</div>`;
  }
  function recentList() {
    const st = S.state, rd = S.getRangeDetail(st.period, st.platform);
    const src = Array.isArray(rd && rd.recentOrders) ? rd.recentOrders : (S.DASH.recentOrders || []);
    return src.filter((o) => st.platform === "all" || o.platform === st.platform).slice(0, 40);
  }
  function mountRecent(card) {
    if (!card) return;
    card.innerHTML = recentInner(recentList());
    card.querySelector("#recentSeg")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { recentFilter = b.dataset.k; mountRecent(card); } });
  }

  window.Views.orders = {
    titleKey: "page.orders.title", eyebrowKey: "page.orders.eyebrow",
    render() {
      const st = S.state, range = S.currentRange(), cmpRange = S.compareCurrentRange(), plat = st.platform;
      const cur = S.aggRange(range, plat), cmp = cmpRange ? S.aggRange(cmpRange, plat) : null;
      const pen = Math.max(0, cur.orders - cur.completed - cur.cancelled);
      const pPen = cmp ? Math.max(0, cmp.orders - cmp.completed - cmp.cancelled) : null;
      const rows = [
        [_t("status.completed"), cur.completed, cmp && cmp.completed, "var(--pos)", false],
        [_t("status.cancelled"), cur.cancelled, cmp && cmp.cancelled, "var(--neg)", true],
        [_t("status.processing"), pen, pPen, "var(--ink-3)", true],
      ];
      const status = `<div class="card" style="flex:1 1 340px;display:flex;flex-direction:column">
        ${UI.head(_t("orders.status.title"), _t("orders.status.tip") + (cmp ? " " + _tf("orders.status.tip_cmp", { cmp: S.compareLabel(st.period, st.compare).toLowerCase() }) : ""))}
        <div class="cbody" style="display:flex;flex-direction:column;gap:16px;flex:1">
          <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="huge-val">${F.viInt(cur.orders)}</span><span class="unit3">${_t("common.orders_unit")}</span>${cmp ? UI.deltaTxt(cur.orders, cmp.orders) : ""}</div>
          ${UI.stack(rows.map((r) => ({ v: r[1], c: r[3] })), 14)}
          <div>${rows.map(([label, n, p, c, inv]) => `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto 64px 64px;align-items:center;gap:10px;padding:11px 0;border-top:1px solid var(--border)">
            <span style="display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:700;min-width:0"><span style="width:9px;height:9px;border-radius:3px;background:${c};flex:none"></span>${label}</span>
            <b class="v15">${F.viInt(n)}</b>
            <span class="r tnum" style="font-size:12.5px;font-weight:700;color:var(--ink-3)">${F.pct(cur.orders ? n / cur.orders * 100 : 0)}</span>
            <span class="r">${cmp ? UI.deltaTxt(n, p, inv) : ""}</span>
          </div>`).join("")}</div>
        </div>
      </div>`;

      return `<div class="pg">
        <div class="frow">${status}<div class="card" id="ordTrendCard" style="flex:2 1 560px"></div></div>
        ${cancelCardsHTML(S.getCancellations(st.period, plat), cancelState.failed === st.period + "|" + plat)}
        ${heatCard(st.period, plat)}
        <div class="card" id="recentCard"></div>
      </div>`;
    },
    mount(root) {
      const st = S.state;
      mountStatusTrend(root.querySelector("#ordTrendCard"));
      mountRecent(root.querySelector("#recentCard"));
      wireHeat(root);
      lazyCard(cancelState, st.period + "|" + st.platform, !!S.getCancellations(st.period, st.platform), S.fetchCancellations, "orders");
      ensureDetail("orders");
    },
  };

  /* ===================== PRODUCTS ===================== */
  let prodGrouping = "single";
  let prodSort = "rev";
  let prodClass = null;
  let prodAll = false;
  const CLASS_C = { A: "var(--brand)", B: "var(--lazada)", C: "var(--ink-3)" };
  const tint = (c, p) => `color-mix(in oklch, ${c} ${p}%, transparent)`;

  function productsData() {
    const st = S.state;
    const single = prodGrouping === "single";
    const data = single ? S.getSkuProfitSingle(st.period, st.platform) : S.getSkuProfit(st.period, st.platform);
    const failed = (single ? skuSingleState : skuProfitState).failed === st.period + "|" + st.platform;
    return { data, failed };
  }

  window.Views.products = {
    titleKey: "page.products.title", eyebrowKey: "page.products.eyebrow",
    render() {
      const st = S.state;
      const { data, failed } = productsData();

      // ---- categories (from the range detail, gifts left out) ----
      const cats = S.categoryBreakdown(st.period, st.platform, prodGrouping).filter((c) => c.cat !== "gift" && c.revenue > 0);
      const cTot = cats.reduce((t, c) => t + c.revenue, 0), cMax = Math.max(...cats.map((c) => c.revenue), 1);
      const catCard = `<div class="card" style="flex:1 1 300px">${UI.head(_t("ovw.category.title"), _t("products.cat.tip"), "", { right: true })}
        <div class="clist">${cats.map((c) => `<div style="display:flex;flex-direction:column;gap:6px;padding:8px 0">
          <div style="display:flex;align-items:baseline;gap:8px;font-size:13px"><span class="nm" style="flex:1;font-size:13px">${S.catLabel(c.cat)}</span><b class="tnum">${F.money(c.revenue)}</b><span class="tnum" style="color:var(--ink-3);font-weight:600;width:46px;text-align:right">${F.pct(cTot ? c.revenue / cTot * 100 : 0)}</span></div>
          ${UI.track(c.revenue / cMax, "var(--ink-2)")}</div>`).join("") || msgHTML(_t("common.empty_data"))}</div></div>`;

      if (!data) {
        const m = loadingOr(failed, "products.sku_profit.loading");
        return `<div class="pg"><div class="frow">
          <div class="card" style="flex:1 1 300px">${UI.head(_t("products.profit.title"), _t("products.profit.tip_loading"))}<div class="cbody">${m}</div></div>
          <div class="card" style="flex:1 1 300px">${UI.head(_t("products.abc.title"), _t("products.abc.tip"))}<div class="cbody">${m}</div></div>
          ${catCard}</div>
          <div class="card">${UI.head(_t("products.table.title"), _t("products.table.tip"))}<div class="cbody">${m}</div></div></div>`;
      }

      // Bỏ hàng tặng như danh sách sản phẩm (cùng S.categoryOf): doanh thu gần 0
      // nên mọi phần phí chia vào đều thành "lỗ" hàng trăm phần trăm — báo động
      // giả. Tổng ở thẻ Lãi sau phí vẫn giữ nguyên vì phí đó là thật.
      const skus = (data.skus || []).filter((x) => x.revenue > 0 && S.categoryOf(x.sku, x.name) !== "gift");
      const t = data.totals || {};
      const visRev = skus.reduce((s, x) => s + x.revenue, 0);
      const abc = ["A", "B", "C"].map((k) => {
        const rows = skus.filter((x) => x.class === k);
        return { k, n: rows.length, share: visRev ? rows.reduce((s, x) => s + x.revenue, 0) / visRev * 100 : 0 };
      });
      if (prodClass && !abc.some((a) => a.k === prodClass && a.n)) prodClass = null;

      const plabel = (p) => (S.PLAT[platKey(p)] || { label: p }).label;
      const methods = (data.estimate || []).map((e) => _tf("products.sku_profit.method." + e.method, { p: plabel(e.platform), r: e.rate == null ? "" : F.viDec(e.rate, 1) })).join("; ");
      const net = t.net || 0, fees = t.fees || 0;
      const profitCard = `<div class="card" style="flex:1 1 300px">${UI.head(_t("products.profit.title"), _tf("products.profit.tip", { cov: F.pct(t.coverage || 0), methods: methods || "—" }), "", { w: "300px" })}
        <div class="cbody" style="display:flex;flex-direction:column;gap:14px">
          <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="huge-val" style="font-size:32px">${F.money(net)}</span><span style="font-size:13px;font-weight:800;color:var(--pos)">${_tf("products.profit.margin", { p: F.pct(t.margin || 0) })}</span></div>
          ${UI.stack([{ v: Math.max(net, 0), c: "var(--pos)" }, { v: fees, c: "var(--neg)" }], 14)}
          <div class="m3" style="gap:10px">
            <div><div class="lab3">${_t("th.revenue")}</div><div class="v15">${F.money(t.revenue || 0)}</div></div>
            <div><div class="lab3" style="display:flex;align-items:center;gap:5px"><span class="sw" style="width:7px;height:7px;border-radius:2px;background:var(--neg)"></span>${_t("products.sku_profit.col_fees")}</div><div class="v15">${F.money(fees)}</div></div>
            <div><div class="lab3" style="display:flex;align-items:center;gap:5px"><span class="sw" style="width:7px;height:7px;border-radius:2px;background:var(--pos)"></span>${_t("products.profit.left")}</div><div class="v15">${F.money(net)}</div></div>
          </div>
          ${(t.coverage || 0) < 50 ? `<div class="sub3" style="color:var(--warn);font-weight:700">${_t("products.profit.low_cov")}</div>` : ""}
        </div></div>`;

      const abcCard = `<div class="card" style="flex:1 1 300px">${UI.head(_t("products.abc.title"), _t("products.abc.tip"))}
        <div class="cbody" style="display:flex;flex-direction:column;gap:14px">
          ${UI.stack(abc.map((a) => ({ v: a.share, c: CLASS_C[a.k] })), 14)}
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">${abc.map((a) => `<button type="button" class="abc-btn" data-cls="${a.k}" style="${prodClass === a.k ? `border-color:${CLASS_C[a.k]};background:color-mix(in oklch, ${CLASS_C[a.k]} 6%, var(--surface))` : ""}">
            <div style="display:flex;align-items:center;gap:7px"><span class="chip-k" style="width:22px;background:${tint(CLASS_C[a.k], 14)};color:${CLASS_C[a.k]}">${a.k}</span><b class="tnum" style="font-size:14px">${_tf("products.sku_profit.abc_count", { n: F.viInt(a.n) })}</b></div>
            <div class="sub3" style="font-size:11.5px;margin-top:4px;white-space:nowrap">${_tf("products.sku_profit.abc_share", { p: F.pct(a.share) })}</div>
          </button>`).join("")}</div>
        </div></div>`;

      // ---- one product table: ranking column switched by tab ----
      const key = { rev: "revenue", qty: "units", net: "net", m: "margin" }[prodSort];
      const list = skus.filter((x) => !prodClass || x.class === prodClass).sort((a, b) => b[key] - a[key]);
      const shownList = prodAll ? list : list.slice(0, 15);
      const rMax = Math.max(...list.map((x) => x.revenue), 1);
      const thin = (t.margin || 0) - 5;
      const nameOf = (x) => escHtml((x.name || x.sku).replace(/^\[.*?\]\s*/, ""));
      const plats = (x) => (x.platforms || []).map(platKey).filter((p) => S.PLAT[p]);
      const barC = (x) => { const p = plats(x); return p.length === 1 ? pc(p[0]) : "var(--brand)"; };
      const platMeta = (x) => { const p = plats(x); return p.length ? `<span>·</span><span style="display:inline-flex;align-items:center;gap:5px;font-weight:700;color:var(--ink-2)">${p.map((k) => UI.pdot(k)).join("")}${p.length === 1 ? S.PLAT[p[0]].label.replace(" Shop", "") : ""}</span>` : ""; };
      const clsChip = (x) => `<span class="chip-k" style="background:${tint(CLASS_C[x.class], 14)};color:${CLASS_C[x.class]}">${x.class}</span>`;
      const marginC = (x) => (x.margin < thin ? "var(--neg)" : "var(--pos)");
      const wide = shownList.map((x, i) => `<div class="gt-row">
          <span class="rk${i === 0 ? " first" : ""}">${i + 1}</span>
          <div style="min-width:0"><div class="nm">${nameOf(x)}</div><div class="meta"><span class="mono">${escHtml(x.sku)}</span><span>·</span><span>${S.catLabel(S.categoryOf(x.sku, x.name))}</span>${platMeta(x)}</div></div>
          ${clsChip(x)}
          <span class="r tnum" style="font-size:13.5px">${F.viInt(x.units)}</span>
          <div class="cell-bar">${UI.track(x.revenue / rMax, barC(x))}<b style="min-width:52px">${F.money(x.revenue)}</b></div>
          <span class="r tnum" style="font-size:13px;color:var(--ink-2)">${F.money(x.fees)}</span>
          <b class="r tnum" style="font-size:13.5px">${F.money(x.net)}</b>
          <div class="cell-bar">${UI.track(x.margin / 100, marginC(x))}<b style="min-width:44px;font-size:13px;color:${x.margin < thin ? "var(--neg)" : "var(--ink)"}">${F.pct(x.margin)}</b></div>
        </div>`).join("");
      const narrow = shownList.map((x, i) => `<div class="mrow" style="display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px">
          <span class="rk${i === 0 ? " first" : ""}">${i + 1}</span>
          <div style="min-width:0;display:flex;flex-direction:column;gap:6px">
            <div style="display:flex;align-items:flex-start;gap:8px"><div class="nm" style="flex:1">${nameOf(x)}</div>${clsChip(x)}</div>
            <div class="cell-bar">${UI.track(x.revenue / rMax, barC(x), 6)}<b style="font-size:14px">${F.money(x.revenue)}</b></div>
            <div class="m3" style="gap:8px;font-size:12px">
              <div><div class="lab3">${_t("th.qty_sold")}</div><b class="tnum">${F.viInt(x.units)}</b></div>
              <div><div class="lab3">${_t("products.sku_profit.col_net")}</div><b class="tnum">${F.money(x.net)}</b></div>
              <div><div class="lab3">${_t("products.sku_profit.col_margin")}</div><b class="tnum" style="color:${x.margin < thin ? "var(--neg)" : "var(--ink)"}">${F.pct(x.margin)}</b></div>
            </div>
          </div>
        </div>`).join("");
      const more = list.length > 15 ? `<div style="padding:4px 20px 16px;text-align:center"><button type="button" class="ctrl-btn" id="prodMore" style="height:34px;margin:0 auto">${prodAll ? _t("products.table.less") : _tf("products.table.more", { n: F.viInt(list.length) })}</button></div>` : "";
      const tools = UI.seg("prodGroupingSeg", [["single", _t("products.grouping.single_short")], ["combo", _t("products.grouping.combo_short")]], prodGrouping)
        + UI.seg("prodSortSeg", [["rev", _t("ovw.cmp.revenue")], ["qty", _t("products.sort.qty")], ["net", _t("products.sort.net")], ["m", _t("products.sort.margin")]], prodSort);
      const clsBtn = prodClass ? `<button type="button" class="chip-btn" id="prodClsClear">${_tf("products.table.class_on", { k: prodClass })} ✕</button>` : "";
      const tableHead = `<div class="card-head ch"><div class="ch-title"><div class="card-title">${_t("products.table.title")}</div>${UI.tip(_t("products.table.tip"), { w: "300px" })}${clsBtn}</div><div class="ch-tools">${tools}</div></div>`;
      const table = `<div class="card">${tableHead}
        ${list.length ? `<div class="gt only-wide" style="--cols:28px minmax(0,2.2fr) 44px 70px minmax(0,1.3fr) 90px 100px minmax(0,1fr)">
          <div class="gt-head"><span>#</span><span>${_t("th.product")}</span><span>${_t("products.sku_profit.col_class")}</span><span class="r">${_t("th.qty_sold")}</span><span>${_t("th.revenue")}</span><span class="r">${_t("products.sku_profit.col_fees")}</span><span class="r">${_t("products.sku_profit.col_net")}</span><span>${_t("products.sku_profit.col_margin")}</span></div>
          ${wide}</div>
        <div class="mlist only-narrow">${narrow}</div>${more}` : `<div class="cbody">${msgHTML(_t("products.sku_profit.empty"))}</div>`}
      </div>`;

      return `<div class="pg"><div class="frow">${profitCard}${abcCard}${catCard}</div>${table}</div>`;
    },
    mount(root) {
      const st = S.state, key = st.period + "|" + st.platform;
      if (prodGrouping === "single") lazyCard(skuSingleState, key, !!S.getSkuProfitSingle(st.period, st.platform), S.fetchSkuProfitSingle, "products");
      else lazyCard(skuProfitState, key, !!S.getSkuProfit(st.period, st.platform), S.fetchSkuProfit, "products");
      ensureDetail("products");
      const pick = (id, fn) => root.querySelector(id)?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { fn(b.dataset.k); window.App.rerender(); } });
      pick("#prodGroupingSeg", (k) => { prodGrouping = k; });
      pick("#prodSortSeg", (k) => { prodSort = k; });
      root.querySelectorAll("[data-cls]").forEach((b) => b.addEventListener("click", () => { prodClass = prodClass === b.dataset.cls ? null : b.dataset.cls; window.App.rerender(); }));
      root.querySelector("#prodClsClear")?.addEventListener("click", () => { prodClass = null; window.App.rerender(); });
      root.querySelector("#prodMore")?.addEventListener("click", () => { prodAll = !prodAll; window.App.rerender(); });
    },
  };

  /* ===================== CUSTOMERS ===================== */
  let customerLoadingKey = null;
  const customerErrors = {};
  let distTab = "geo";

  function kpiShell(label, tipText, value, foot, viz, tipRight) {
    return `<div class="card kpi reveal">
      <div class="kpi-label"><span class="kl">${label}</span>${UI.tip(tipText, tipRight ? { right: true } : null)}</div>
      <div class="kpi-value tnum">${value}</div>
      <div class="kpi-foot"><span>${foot}</span></div>
      <div class="kpi-viz">${viz || ""}</div>
    </div>`;
  }

  window.Views.customers = {
    titleKey: "page.customers.title", eyebrowKey: "page.customers.eyebrow",
    render() {
      const st = S.state, plat = st.platform;
      const cacheKey = st.period + "|" + plat;
      const data = (S._customerCache || {})[cacheKey];
      const err = customerErrors[cacheKey];
      if (err) {
        return `<div class="card card-pad" style="text-align:center;color:var(--neg);font-weight:700">${_t("common.error")}: ${escHtml(err)}
          <div style="margin-top:12px"><button class="ctrl-btn" id="custRetry">${_t("common.retry")}</button></div></div>`;
      }
      const ret = plat === "lazada" ? null : S.getRetention(st.period, plat);
      const retFailed = retentionState.failed === cacheKey;
      const dash = `<span style="color:var(--ink-3)">—</span>`;
      const retWait = plat === "lazada" ? _t("cust.kpi.lazada_na") : retFailed ? _t("common.error") : _t("common.loading");

      // ---- KPIs ----
      const summary = (data && data.summary) || {}, seg = (data && data.customer_segments) || {};
      const nNew = seg.new_buyers || 0, nRet = seg.returning_buyers || 0;
      const buyersCard = plat === "lazada"
        ? kpiShell(_t("cust.kpi.buyers"), _t("cust.kpi.buyers_tip_plain"), dash, _t("cust.kpi.lazada_na"), "")
        : data
        ? kpiShell(_t("cust.kpi.buyers"), _t("cust.kpi.buyers_tip_plain") + " " + _t("customers.segment.potential_note"), F.viInt(summary.unique_buyers || 0),
            _tf("cust.kpi.potential", { n: F.viInt(seg.potential_buyers || 0) }),
            UI.stack([{ v: nNew, c: "var(--brand)" }, { v: nRet, c: "var(--lazada)" }]) + UI.legend([{ c: "var(--brand)", text: _tf("cust.kpi.new_n", { n: F.viInt(nNew) }) }, { c: "var(--lazada)", text: _tf("cust.kpi.ret_n", { n: F.viInt(nRet) }) }]))
        : kpiShell(_t("cust.kpi.buyers"), _t("cust.kpi.buyers_tip_plain"), dash, _t("common.loading"), "");
      const iv = (ret && ret.interval) || {};
      const w30 = iv.within_30 || 0, w60 = iv.within_60 || 0, w90 = iv.within_90 || 0;
      const gapBuckets = [w30, w60 - w30, w90 - w60, 100 - w90].map((v) => Math.max(0, v));
      const gMax = Math.max(...gapBuckets, 1);
      const cut = String((ret && ret.cutoff) || "").split("-");
      const cutTxt = cut.length === 3 ? `${cut[2]}/${cut[1]}/${cut[0]}` : "";
      const kpis = [
        buyersCard,
        kpiShell(_t("cust.kpi.repeat"), _tf("cust.kpi.repeat_tip", { date: cutTxt || "—" }),
          ret && ret.buyers ? `${F.viDec(ret.repeat_rate, 1)}<span class="unit">%</span>` : dash,
          ret && ret.buyers ? _tf("customers.retention.repeat_sub", { n: F.viInt(ret.repeat_buyers), m: F.viInt(ret.buyers) }) : retWait,
          ret && ret.buyers ? UI.track(ret.repeat_rate / 100, "var(--lazada)") : "", true),
        kpiShell(_t("cust.kpi.cycle"), _t("cust.kpi.cycle_tip"),
          iv.median_days != null ? `${F.viInt(iv.median_days)}<span class="unit" style="margin-left:4px">${_t("customers.retention.days_unit")}</span>` : dash,
          iv.median_days != null ? _t("cust.kpi.median") : retWait,
          iv.pairs ? `<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;align-items:end;height:26px">${gapBuckets.map((v, i) => `<div style="height:${Math.max(v / gMax * 100, 4).toFixed(1)}%;background:${i === 0 ? "var(--pos)" : "var(--ink-3)"};border-radius:3px 3px 0 0"></div>`).join("")}</div>
            <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;font-size:10px;font-weight:700;color:var(--ink-3);text-align:center;margin-top:-4px">${["≤30", "60", "90", ">90"].map((l) => `<span>${l}</span>`).join("")}</div>` : ""),
        kpiShell(_t("cust.kpi.back90"), _t("cust.kpi.back90_tip"),
          iv.pairs ? `${F.viDec(w90, 0)}<span class="unit">%</span>` : dash,
          iv.pairs ? _tf("cust.kpi.in30", { p: F.pct(w30, 0) }) : retWait,
          iv.pairs ? `<div class="trk" style="display:flex"><i style="width:${w30.toFixed(1)}%;background:var(--pos);border-radius:0"></i><i style="width:${Math.max(0, w90 - w30).toFixed(1)}%;background:color-mix(in oklch, var(--pos) 45%, var(--surface));border-radius:0"></i></div>` : "", true),
      ].join("");

      // ---- cohorts: newest 6 first-purchase months ----
      let cohort;
      if (plat === "lazada") cohort = msgHTML(_t("customers.retention.lazada_only"));
      else if (!ret) cohort = loadingOr(retFailed, "customers.retention.loading");
      else if (!ret.buyers) cohort = msgHTML(_t("customers.retention.empty"));
      else {
        const rows = (ret.cohorts || []).slice(-6);
        const H = 5;
        const vals = rows.flatMap((c) => c.retention.slice(0, H).filter((v) => v != null));
        const maxR = Math.max(...vals, 1);
        const cell = (v, i) => {
          const hide = i >= 3 ? " only-wide" : "";
          if (v == null) return `<div class="coh-c${hide}" style="background:var(--surface-2);color:var(--ink-3)">—</div>`;
          return `<div class="coh-c${hide}" style="background:color-mix(in oklch, var(--brand) ${Math.round(8 + 70 * v / maxR)}%, var(--surface));color:${v / maxR > 0.55 ? "#fff" : "var(--ink)"}">${F.pct(v)}</div>`;
        };
        cohort = `<div class="coh coh-head" style="font-size:11px;font-weight:700;color:var(--ink-3);padding-bottom:6px">
            <span>${_t("customers.retention.col_cohort")}</span><span class="r">${_t("customers.retention.col_size")}</span>
            ${Array.from({ length: H }, (_, i) => `<span style="text-align:center"${i >= 3 ? ' class="only-wide"' : ""}>T+${i + 1}</span>`).join("")}
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">${rows.map((c) => {
            const [y, m] = c.ym.split("-");
            return `<div class="coh"><span style="font-size:13px;font-weight:700;white-space:nowrap">${escHtml(_tf("period.month_short", { n: +m, y }))}</span>
              <span class="r tnum" style="font-size:12.5px;font-weight:600;color:var(--ink-2);padding-right:6px">${F.viInt(c.size)}</span>
              ${c.retention.slice(0, H).map(cell).join("")}</div>`;
          }).join("")}</div>`;
      }

      // ---- top buyers ----
      const buyers = ((data && data.buyer_stats) || []).slice(0, 10);
      const bMax = buyers.length ? buyers[0].revenue || 1 : 1;
      const buyerRows = !data ? msgHTML(_t("common.loading")) : buyers.length ? buyers.map((b, i) => `<div class="buyer-row" data-buyer="${escHtml(b.buyer_username)}" style="display:grid;grid-template-columns:var(--bc);align-items:center;gap:12px;padding:10px 0;border-bottom:${i === buyers.length - 1 ? "none" : "1px solid var(--border)"};cursor:pointer">
          <span class="rk${i === 0 ? " first" : ""}">${i + 1}</span>
          <div style="min-width:0"><div class="nm" style="font-weight:700">${escHtml(b.buyer_name || b.buyer_username || "—")}</div>
            <div class="sub3" style="font-size:11.5px;white-space:nowrap">${_tf("cust.top.sub", { n: F.viInt(b.order_count), d: b.last_order_at ? dtShort(b.last_order_at).slice(0, 5) : "—" })}</div></div>
          ${UI.track(b.revenue / bMax, "var(--brand)")}
          <b class="r tnum" style="font-size:13.5px">${F.money(b.revenue)}</b>
        </div>`).join("") : msgHTML(_t("common.empty_data"));

      // ---- distribution: region or warehouse, with orders and revenue ----
      const src = distTab === "geo"
        ? ((data && data.city_distribution) || []).map((g) => ({ name: g.city, orders: g.orders, revenue: g.revenue || 0, pct: g.percentage ?? 0, other: g.city === "Khác" }))
        : ((data && data.warehouse_distribution) || []).map((w) => ({ name: w.warehouse, orders: w.orders, revenue: w.revenue || 0, pct: w.percentage ?? 0 }));
      const dMax = Math.max(...src.map((g) => g.orders), 1);
      const distRows = !data ? msgHTML(_t("common.loading")) : src.length ? src.map((g) => `<div class="brow" style="--bcols:var(--gc);padding:9px 0">
          <span class="bl" style="font-size:13.5px">${escHtml(g.name)}</span>
          ${UI.track(g.orders / dMax, g.other ? "var(--ink-3)" : distTab === "geo" ? "var(--brand)" : "var(--lazada)", 10)}
          <div class="r" style="white-space:nowrap"><b class="tnum" style="font-size:13.5px">${F.viInt(g.orders)}</b><span class="tnum" style="color:var(--ink-3);font-weight:600;margin-left:5px;font-size:13px">(${F.pct(g.pct, 0)})</span>
            <div class="sub3 tnum" style="font-size:11.5px">${F.money(g.revenue)}</div></div>
        </div>`).join("") : msgHTML(_t(distTab === "geo" ? "common.empty_data" : "customers.warehouse.empty"));

      return `<div class="pg">
        ${plat === "lazada" ? `<div class="banner">${UI.ICON.info}<span>${_t("cust.lazada_banner")}</span></div>` : ""}
        <div class="kpis">${kpis}</div>
        <div class="card">${UI.head(_t("customers.retention.cohort_title"), _tf("cust.cohort.tip", { date: cutTxt || "—" }), "", { w: "280px" })}<div class="cbody">${cohort}</div></div>
        <div class="frow">
          <div class="card" style="flex:2 1 560px">${UI.head(_t("customers.top_buyers.title"), _t("cust.top.tip"))}<div class="clist cust-buyers">${buyerRows}</div></div>
          <div class="card" style="flex:1 1 320px">${UI.head(_t("cust.dist.title"), _t("cust.dist.tip"), UI.seg("distSeg", [["geo", _t("cust.dist.geo")], ["wh", _t("cust.dist.wh")]], distTab))}<div class="clist cust-dist" style="gap:2px">${distRows}</div></div>
        </div>
        <div id="customerDetailPanel"></div>
      </div>`;
    },
    mount(root) {
      const st = S.state, cacheKey = st.period + "|" + st.platform;
      if (st.platform !== "lazada") lazyCard(retentionState, cacheKey, !!S.getRetention(st.period, st.platform), S.fetchRetention, "customers");
      const cached = (S._customerCache || {})[cacheKey];
      if (!cached && customerLoadingKey !== cacheKey && !customerErrors[cacheKey]) {
        customerLoadingKey = cacheKey;
        S.fetchCustomers().then(() => {
          customerLoadingKey = null;
          delete customerErrors[cacheKey];
          if (S.state.page === "customers") window.App.rerender();
        }).catch((e) => {
          customerLoadingKey = null;
          customerErrors[cacheKey] = (e && e.message) ? e.message : String(e);
          if (S.state.page === "customers") window.App.rerender();
        });
      }
      root.querySelector("#custRetry")?.addEventListener("click", () => { delete customerErrors[cacheKey]; customerLoadingKey = null; window.App.rerender(); });
      root.querySelector("#distSeg")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { distTab = b.dataset.k; window.App.rerender(); } });
      root.querySelectorAll(".buyer-row").forEach((row) => row.addEventListener("click", () => { if (row.dataset.buyer) showCustomerDetail(row.dataset.buyer); }));
    },
  };

  function showCustomerDetail(buyerUsername) {
    const panel = document.getElementById("customerDetailPanel");
    if (!panel) return;
    panel.innerHTML = `<div class="card"><div class="card-pad" style="text-align:center;color:var(--ink-3);font-weight:600">${_t("common.loading")}</div></div>`;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

    S.fetchCustomerDetail(buyerUsername).then((data) => {
      if (!data || !data.profile) { panel.innerHTML = ""; return; }
      const p = data.profile, s = data.summary || {}, orders = data.orders || [];
      const dtLong = (v) => { if (!v) return "—"; const [d, tm] = v.split(" "); const q = d.split("-"); return q[2] + "/" + q[1] + "/" + q[0] + (tm ? " " + tm.slice(0, 5) : ""); };
      const plat = (o) => platKey(o.platform);
      const orderRows = orders.slice(0, 20).map((o) => { const [lab, cls] = statusInfo(o.normalized_status); return `<tr>
        <td><span class="pchip">${UI.pdot(plat(o))}${S.PLAT[plat(o)] ? S.PLAT[plat(o)].label.replace(" Shop", "") : escHtml(o.platform)}</span></td>
        <td class="mono" style="font-size:11.5px">${escHtml(o.order_id)}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml((o.products || "").split(" • ").slice(0, 2).join(" · ") || "—")}</td>
        <td class="num tnum">${F.moneyFull(o.order_total)}</td>
        <td><span class="status-pill ${cls}">${lab}</span></td>
        <td style="color:var(--ink-3);font-size:12px" class="hide-md">${dtLong(o.order_created_at)}</td>
      </tr>`; }).join("");
      const stat = (label, v) => `<div><div class="eyebrow">${label}</div><div style="margin-top:4px">${v}</div></div>`;
      panel.innerHTML = `<div class="card">
        <div class="card-head ch"><div class="ch-title"><div class="card-title">${_t("customers.detail.title")} · ${escHtml(p.buyer_name || buyerUsername)}</div></div><button class="ctrl-btn" id="custDetailBack" style="height:34px">${_t("customers.detail.back")}</button></div>
        <div class="cbody">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;margin-bottom:18px">
            ${stat(_t("customers.detail.lifetime"), `<span class="big-val" style="font-size:22px">${F.viInt(s.lifetime_order_count || 0)}</span> <span class="sub3">${_t("common.orders_unit")}</span>`)}
            ${stat(_t("th.revenue"), `<span class="big-val" style="font-size:22px">${F.money(s.lifetime_revenue || 0)}</span>`)}
            ${stat(_t("customers.detail.first_purchase"), `<span style="font-size:13px;font-weight:600">${dtLong(p.first_purchase_at)}</span>`)}
            ${stat(_t("customers.detail.last_purchase"), `<span style="font-size:13px;font-weight:600">${dtLong(p.last_purchase_at)}</span>`)}
          </div>
          ${s.filtered_order_count != null ? `<div class="note" style="margin-bottom:14px">${UI.ICON.info} ${_t("customers.detail.orders_in_period")} · ${F.viInt(s.filtered_order_count)} ${_t("common.orders_unit")} · ${F.money(s.filtered_revenue || 0)}</div>` : ""}
          <div style="font-weight:800;font-size:14px;margin-bottom:8px">${_t("customers.detail.order_history")}</div>
          <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>${_t("th.platform")}</th><th>${_t("th.order_id")}</th><th>${_t("th.product")}</th><th class="num">${_t("customers.table.amount")}</th><th>${_t("th.status")}</th><th class="hide-md">${_t("orders.recent.time")}</th></tr></thead><tbody>${orderRows}</tbody></table></div>
        </div>
      </div>`;
      document.getElementById("custDetailBack")?.addEventListener("click", () => { panel.innerHTML = ""; });
    }).catch(() => {
      panel.innerHTML = `<div class="card card-pad" style="text-align:center;color:var(--neg);font-weight:700">${_t("common.error")}</div>`;
    });
  }
})();
