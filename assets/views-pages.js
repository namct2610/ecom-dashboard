/* ============================================================
   Views: Orders, Products, Customers, Traffic
   ============================================================ */
(function () {
  const S = window.Store, F = window.F, UI = window.UI, C = window.Charts;
  const _t = (k, f) => (window.t ? window.t(k, f) : (f || k));
  const _tf = (k, v) => (window.tf ? window.tf(k, v) : k);
  const escHtml = UI.esc;
  let detailLoadingKey = null;
  // null = theo cấp độ tự nhiên của kỳ đang chọn (S.autoGrain)
  let ordersGrain = null;
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
  const cancelState = { loading: null, failed: null };
  const retentionState = { loading: null, failed: null };
  const skuProfitState = { loading: null, failed: null };

  // Hai thẻ phân tích huỷ đơn. Lý do chỉ có cho đơn nhập từ 3.5.6 (hoặc còn dòng
  // thô để điền bù), nên luôn ghi rõ "có lý do cho n/m đơn huỷ" — không trình
  // bày một phần dữ liệu như thể là toàn bộ.
  function cancelCardsHTML(data, failed) {
    const wideRow = 'style="grid-template-columns:minmax(150px,230px) 1fr auto"';
    const msg = (k, vars) => `<div style="color:var(--ink-3);font-size:13px;padding:6px 0">${vars ? _tf(k, vars) : _t(k)}</div>`;
    const card = (titleKey, body) => `<div data-collapse style="grid-column:span 6" class="card">
      <div class="card-head"><div><div class="card-title">${_t(titleKey)}</div></div></div>
      <div class="card-pad">${body}</div></div>`;

    if (!data) {
      const m = failed ? `<div style="color:var(--neg);font-size:13px;font-weight:700;padding:6px 0">${_t("common.error")}</div>` : msg("orders.cancel.loading");
      return `<div class="g12 section-gap">${card("orders.cancel.reasons_title", m)}${card("orders.cancel.payment_title", m)}</div>`;
    }

    // --- lý do huỷ ---
    const cov = data.reason_coverage || { with_reason: 0, cancelled: 0 };
    let reasons;
    if (!data.cancelled) {
      reasons = msg("orders.cancel.no_cancel");
    } else if (!cov.with_reason) {
      reasons = msg("orders.cancel.no_reason");
    } else {
      const who = (data.by_who || []).map((w) =>
        `<span class="tag" style="margin:0 6px 6px 0">${escHtml(_t("orders.cancel.who." + w.who))} <b class="tnum">${F.pct(w.share)}</b></span>`).join("");
      const maxShare = Math.max(...(data.reasons || []).map((r) => r.share), 1);
      const bars = (data.reasons || []).map((r) => `<div class="cmp-row" ${wideRow}>
          <div class="cmp-name" style="font-weight:600">${escHtml(_t("orders.cancel.group." + r.group))}</div>
          <div class="cmp-track"><div class="cmp-fill" style="width:${r.share / maxShare * 100}%;background:var(--brand)"></div></div>
          <div class="cmp-val">${F.pct(r.share)}</div></div>`).join("");
      const note = cov.with_reason < cov.cancelled
        ? `<div style="margin-top:10px;font-size:12px;color:var(--ink-3)">${_tf("orders.cancel.coverage", { n: F.viInt(cov.with_reason), m: F.viInt(cov.cancelled) })}</div>` : "";
      reasons = `<div style="display:flex;flex-wrap:wrap;margin-bottom:6px">${who}</div>${bars}${note}`;
    }

    // --- tỷ lệ huỷ theo thanh toán ---
    const pays = (data.by_payment || []).filter((p) => p.orders > 0);
    // Nhóm 'none' gần như 100% là đơn huỷ — lấy nó làm chuẩn sẽ ép mọi thanh
    // còn lại thành vệt nhỏ, mất khả năng so COD với thẻ. Chuẩn theo nhóm thật.
    const maxRate = Math.max(...pays.filter((p) => p.method !== "none").map((p) => p.rate), 1);
    const payBody = pays.length ? pays.map((p) => `<div class="cmp-row" ${wideRow}>
        <div class="cmp-name" style="font-weight:600">${escHtml(_t("orders.cancel.pay." + p.method))}</div>
        <div class="cmp-track"><div class="cmp-fill" style="width:${Math.min(100, p.rate / maxRate * 100)}%;background:var(--neg)"></div></div>
        <div class="cmp-val">${F.pct(p.rate)}<div style="font-size:11px;font-weight:600;color:var(--ink-3)">${_tf("orders.cancel.of_orders", { n: F.viInt(p.orders) })}</div></div></div>`).join("")
      : msg("orders.cancel.no_cancel");

    return `<div class="g12 section-gap">${card("orders.cancel.reasons_title", reasons)}${card("orders.cancel.payment_title", payBody)}</div>`;
  }

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
    // ponytail: the 12-col grid divides evenly only for 1/2/3/4/6 cards; otherwise use an n-col grid
    const even = 12 % items.length === 0;
    const grid = even ? "" : ` style="grid-template-columns:repeat(${items.length},1fr)"`;
    const span = even ? 12 / items.length : 1;
    return `<div class="g12"${grid}>${items.map((o) => `<div data-collapse style="grid-column:span ${span}"><div class="card kpi reveal"><div class="kpi-label">${o.ico} ${o.label}</div><div class="kpi-value tnum">${o.value}${o.unit ? `<span class="unit">${o.unit}</span>` : ""}</div><div class="kpi-foot">${o.delta || ""}<span>${o.foot}</span></div></div></div>`).join("")}</div>`;
  }

  // Ten figures stand for 100 visitors' worth of proportion: the rate fills them
  // left to right, the last one part-filled. Conversion is single-digit here, so
  // an honest picture is "most of the first figure" — the big % beside it is what
  // carries the exact number.
  const FIGURES = 10;
  function convFigures(pct, platKey) {
    const filled = Math.max(0, Math.min(100, +pct || 0)) / (100 / FIGURES);
    const cells = Array.from({ length: FIGURES }, (_, i) => {
      const w = Math.max(0, Math.min(1, filled - i)) * 100;
      return `<span class="ppl">${UI.ICON.person}
        <span class="ppl-fill" style="width:${w.toFixed(2)}%;color:var(--${platKey})">${UI.ICON.person}</span>
      </span>`;
    }).join("");
    return `<div class="ppl-row">${cells}</div>`;
  }

  // Shared by the customers render (legend) and mount (donut) so both stay in sync.
  // Hex vars only — Chart.js paints these straight onto canvas and chokes on oklch.
  function segmentSlices(segments) {
    return [
      { label: _t("customers.segment.new"), value: segments.new_buyers || 0, color: "--brand" },
      { label: _t("customers.segment.returning"), value: segments.returning_buyers || 0, color: "--lazada" },
    ];
  }

  // Thẻ giữ chân khách hàng (tab Khách hàng). Tính theo toàn bộ lịch sử đến
  // ngày cuối kỳ, nên ghi rõ ngày cắt và vì sao Lazada không có mặt.
  function retentionCardHTML(data, failed, platform) {
    const wrap = (body) => `<div data-collapse class="card section-gap">
      <div class="card-head"><div><div class="card-title">${_t("customers.retention.title")}</div></div></div>
      <div class="card-pad">${body}</div></div>`;
    const msg = (text, color) => `<div style="color:var(${color || "--ink-3"});font-size:13px;font-weight:${color ? 700 : 400};padding:6px 0">${text}</div>`;

    if (platform === "lazada") return wrap(msg(_t("customers.retention.lazada_only")));
    if (!data) return wrap(failed ? msg(_t("common.error"), "--neg") : msg(_t("customers.retention.loading")));
    if (!data.buyers) return wrap(msg(_t("customers.retention.empty")));

    const iv = data.interval || {};
    const stat = (label, value, sub) => `<div style="padding:12px 14px;border:1px solid var(--line);border-radius:12px">
        <div style="font-size:12px;font-weight:700;color:var(--ink-3)">${label}</div>
        <div style="font-size:24px;font-weight:800;letter-spacing:-.02em;margin-top:4px" class="tnum">${value}</div>
        <div style="font-size:11.5px;color:var(--ink-3);margin-top:2px">${sub}</div></div>`;
    const stats = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px">
      ${stat(_t("customers.retention.repeat_rate"), F.pct(data.repeat_rate), _tf("customers.retention.repeat_sub", { n: F.viInt(data.repeat_buyers), m: F.viInt(data.buyers) }))}
      ${stat(_t("customers.retention.median_gap"), iv.median_days == null ? "—" : `${F.viInt(iv.median_days)} <span style="font-size:13px;color:var(--ink-3)">${_t("customers.retention.days_unit")}</span>`, _t("customers.retention.median_sub"))}
      ${stat(_t("customers.retention.within30"), F.pct(iv.within_30 || 0), _t("customers.retention.within_sub"))}
      ${stat(_t("customers.retention.within90"), F.pct(iv.within_90 || 0), _t("customers.retention.within_sub"))}
    </div>`;

    const cohorts = data.cohorts || [];
    const horizon = cohorts.length ? cohorts[0].retention.length : 0;
    const vals = cohorts.flatMap((c) => c.retention.filter((v) => v != null));
    const maxV = Math.max(...vals, 1);
    const head = `<tr><th>${_t("customers.retention.col_cohort")}</th><th class="num">${_t("customers.retention.col_size")}</th>${
      Array.from({ length: horizon }, (_, i) => `<th class="num">${_tf("customers.retention.col_month", { k: i + 1 })}</th>`).join("")}</tr>`;
    const body = cohorts.map((c) => {
      const [y, m] = c.ym.split("-");
      const cells = c.retention.map((v) => v == null
        ? `<td class="num" style="color:var(--ink-3)">—</td>`
        : `<td class="num tnum" style="background:color-mix(in srgb, var(--brand) ${Math.round(6 + 52 * v / maxV)}%, transparent)">${F.pct(v)}</td>`).join("");
      return `<tr><td style="font-weight:700">${escHtml(_tf("period.month_short", { n: +m, y }))}</td><td class="num tnum">${F.viInt(c.size)}</td>${cells}</tr>`;
    }).join("");
    const [cy, cm, cd] = String(data.cutoff || "").split("-");

    return wrap(`${stats}
      <div style="margin:20px 0 6px;font-weight:700;font-size:13.5px">${_t("customers.retention.cohort_title")}</div>
      <div style="overflow-x:auto"><table class="tbl">${head}${body}</table></div>
      <div class="note" style="margin-top:14px">${UI.ICON.people} ${_tf("customers.retention.note", { date: cd ? `${cd}/${cm}/${cy}` : "" })}</div>`);
  }

  // Thẻ lãi sau phí theo SKU (tab Sản phẩm). Luôn nói rõ bao nhiêu phần trăm
  // phí là số thật (đối soát) và phần còn lại được ước tính bằng cách nào.
  function skuProfitCardHTML(data, failed) {
    const wrap = (body) => `<div data-collapse style="grid-column:span 12" class="card">
      <div class="card-head"><div><div class="card-title">${_t("products.sku_profit.title")}</div></div></div>
      <div class="card-pad">${body}</div></div>`;
    const msg = (text, color) => `<div style="color:var(${color || "--ink-3"});font-size:13px;font-weight:${color ? 700 : 400};padding:6px 0">${text}</div>`;
    if (!data) return wrap(failed ? msg(_t("common.error"), "--neg") : msg(_t("products.sku_profit.loading")));
    // Bỏ hàng tặng như danh sách sản phẩm bên trên (cùng S.categoryOf): doanh thu
    // gần 0 nên mọi phần phí chia vào đều thành "lỗ" hàng trăm phần trăm — báo
    // động giả. Tổng vẫn giữ nguyên vì phí đó là thật.
    const skus = (data.skus || []).filter((x) => x.revenue > 0 && S.categoryOf(x.sku, x.name) !== "gift");
    if (!skus.length) return wrap(msg(_t("products.sku_profit.empty")));

    const t = data.totals || {};
    // Đếm lại hạng trên đúng các dòng đang hiện, để dải ABC khớp với bảng.
    const visRev = skus.reduce((sum, x) => sum + x.revenue, 0);
    const abc = {};
    ["A", "B", "C"].forEach((k) => {
      const rows = skus.filter((x) => x.class === k);
      abc[k] = { count: rows.length, share: visRev ? rows.reduce((sum, x) => sum + x.revenue, 0) / visRev * 100 : 0 };
    });
    const classColor = { A: "--brand", B: "--lazada", C: "--ink-3" };
    const chip = (k) => `<span class="tag" style="border-color:transparent;font-weight:800;background:color-mix(in srgb, var(${classColor[k]}) 16%, transparent);color:var(${classColor[k]})">${k}</span>`;

    const abcStrip = ["A", "B", "C"].map((k) => {
      const v = abc[k] || { count: 0, share: 0 };
      return `<div style="padding:10px 14px;border:1px solid var(--line);border-radius:12px;display:flex;align-items:center;gap:10px">
        ${chip(k)}<div><div style="font-weight:800" class="tnum">${_tf("products.sku_profit.abc_count", { n: F.viInt(v.count) })}</div>
        <div style="font-size:11.5px;color:var(--ink-3)">${_tf("products.sku_profit.abc_share", { p: F.pct(v.share) })}</div></div></div>`;
    }).join("");
    const stat = (label, value, color) => `<div><div style="font-size:12px;font-weight:700;color:var(--ink-3)">${label}</div>
      <div style="font-size:20px;font-weight:800;letter-spacing:-.02em${color ? ";color:var(" + color + ")" : ""}" class="tnum">${value}</div></div>`;
    const totals = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:14px;margin-top:16px">
      ${stat(_t("th.revenue"), F.money(t.revenue || 0))}
      ${stat(_t("products.sku_profit.col_fees"), F.money(t.fees || 0), "--neg")}
      ${stat(_t("products.sku_profit.col_net"), F.money(t.net || 0))}
      ${stat(_t("products.sku_profit.col_margin"), F.pct(t.margin || 0))}
    </div>`;

    const thin = (t.margin || 0) - 5;
    const rows = skus.map((x) => `<tr>
        <td>${chip(x.class)}</td>
        <td><div style="min-width:0"><div class="pname" style="max-width:300px">${escHtml((x.name || x.sku).replace(/^\[.*?\]\s*/, ""))}</div><div class="psku">${escHtml(x.sku)}</div></div></td>
        <td class="num tnum">${F.viInt(x.units)}</td>
        <td class="num"><b>${F.money(x.revenue)}</b></td>
        <td class="num tnum">${F.money(x.fees)} <span style="font-size:11px;color:var(--ink-3)">${F.pct(x.fee_rate)}</span></td>
        <td class="num"><b>${F.money(x.net)}</b></td>
        <td class="num tnum" style="font-weight:800${x.margin < thin ? ";color:var(--neg)" : ""}">${F.pct(x.margin)}</td>
        <td class="num tnum" style="color:var(--ink-3)">${F.pct(x.coverage)}</td></tr>`).join("");
    const head = `<tr><th>${_t("products.sku_profit.col_class")}</th><th>${_t("th.product")}</th><th class="num">${_t("th.qty_sold")}</th><th class="num">${_t("th.revenue")}</th><th class="num">${_t("products.sku_profit.col_fees")}</th><th class="num">${_t("products.sku_profit.col_net")}</th><th class="num">${_t("products.sku_profit.col_margin")}</th><th class="num">${_t("products.sku_profit.col_coverage")}</th></tr>`;

    const plabel = (p) => (S.PLAT[p === "tiktokshop" ? "tiktok" : p] || { label: p }).label;
    const methods = (data.estimate || []).map((e) => _tf("products.sku_profit.method." + e.method, { p: plabel(e.platform), r: e.rate == null ? "" : F.viDec(e.rate, 1) })).join("; ");
    const lowCov = (t.coverage || 0) < 50
      ? `<div class="note" style="margin-top:12px;border-color:var(--warn);color:var(--ink)">${_t("products.sku_profit.low_coverage")}</div>` : "";

    return wrap(`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px">${abcStrip}</div>
      <div style="font-size:11.5px;color:var(--ink-3);margin-top:8px">${_t("products.sku_profit.abc_hint")}</div>
      ${totals}${lowCov}
      <div style="margin-top:16px;max-height:520px;overflow:auto"><table class="tbl">${head}${rows}</table></div>
      <div class="note" style="margin-top:12px">${_tf("products.sku_profit.note", { cov: F.pct(t.coverage || 0), methods: methods || "—" })}</div>`);
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
        <td class="mono" style="font-size:11.5px">${escHtml(o.order_id)}</td>
        <td><span class="pchip">${UI.pdot(o.platform)}${S.PLAT[o.platform].label.replace(" Shop", "")}</span></td>
        <td><div class="pname" style="max-width:280px">${escHtml((o.product || "").replace(/^\[.*?\]\s*/, ""))}</div>${o.items > 1 ? `<span style="font-size:11px;color:var(--ink-3)">+${o.items - 1} ${_t("th.product").toLowerCase()}</span>` : ""}</td>
        <td>${escHtml(o.city)}</td>
        <td class="num tnum">${F.moneyFull(o.amount)}</td>
        <td><span class="status-pill ${cls}">${lab}</span></td>
        <td style="color:var(--ink-3);font-size:12px" class="hide-md">${dtShort(o.created)}</td></tr>`; }).join("");

      return kpis + `
      <div class="g12 section-gap">
        <div data-collapse style="grid-column:span 8" class="card">
          <div class="card-head"><div><div class="card-title">${_t("orders.daily.title")}</div></div>
            <div class="chart-tools">
              ${UI.grainSeg("ordersGrainSeg", ordersGrain || S.autoGrain(st.period))}
              ${UI.fsBtn()}
            </div>
          </div>
          <div class="card-pad" style="padding-top:14px">
            <div class="chart-wrap" style="height:250px"><canvas id="ordChart"></canvas></div>
            ${plat === "all" ? `<div class="legend chart-legend">${S.PKEYS.map((k) => `<span class="legend-item"><span class="legend-swatch" style="background:var(--${k})"></span>${S.PLAT[k].label}</span>`).join("")}</div>` : ""}
          </div>
        </div>
        <div data-collapse style="grid-column:span 4" class="card">
          <div class="card-head"><div><div class="card-title">${_t("th.status")} ${_t("common.orders_unit")}</div></div></div>
          <div class="card-pad"><div class="donut-wrap" style="height:170px"><canvas id="statusDonut"></canvas>
            <div class="donut-center"><div><div class="big tnum">${F.viInt(cur.orders)}</div><div class="small">${_t("common.orders_unit")}</div></div></div></div>
            <div style="margin-top:14px;display:flex;flex-direction:column;gap:9px">
              <div style="display:flex;align-items:center;gap:9px;font-size:13px"><span class="legend-swatch" style="background:var(--pos)"></span>${_t("status.completed")}<span style="margin-left:auto;font-weight:800" class="tnum">${F.viInt(cur.completed)}</span></div>
              <div style="display:flex;align-items:center;gap:9px;font-size:13px"><span class="legend-swatch" style="background:var(--neg)"></span>${_t("status.cancelled")}<span style="margin-left:auto;font-weight:800" class="tnum">${F.viInt(cur.cancelled)}</span></div>
            </div></div>
        </div>
      </div>
      ${cancelCardsHTML(S.getCancellations(st.period, plat), cancelState.failed === st.period + "|" + plat)}
       <div class="card section-gap"><div class="card-head"><div><div class="card-title">${_t("ovw.heat.title")}</div></div></div><div class="card-pad" style="overflow-x:auto">${heatHTML(st.period, plat)}</div></div>
      <div class="card section-gap"><div class="card-head"><div><div class="card-title">${_t("ovw.recent_orders.title")}</div></div></div>
        <div class="card-pad" style="padding:6px;overflow-x:auto"><table class="tbl"><thead><tr><th>${_t("th.order_id")}</th><th>${_t("th.platform")}</th><th>${_t("th.product")}</th><th>${_t("th.region")}</th><th class="num">${_t("th.revenue")}</th><th>${_t("th.status")}</th><th class="hide-md">${_t("th.uploaded_at")}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    },
    mount(root) {
      const st = S.state, range = S.currentRange(), plat = st.platform;
      // businessTrend thay cho dailySeriesRange: nó hiểu cấp độ ngày/tuần/tháng/năm,
      // và trả cùng dạng dữ liệu (label + o_shopee/o_lazada/o_tiktok).
      const buildOrd = (cv) => C.ordersTrend(cv, S.businessTrend(S.state.period, ordersGrain), { platform: S.state.platform });
      const oc = root.querySelector("#ordChart"); if (oc) buildOrd(oc);
      root.querySelector("#ordersGrainSeg")?.addEventListener("click",
        UI.grainHandler("ordersGrainSeg", "ordChart", (g) => { ordersGrain = g; }, buildOrd));
      const cur = S.aggRange(range, plat);
      const sd = root.querySelector("#statusDonut"); if (sd) C.donut(sd, [{ label: _t("status.completed"), value: cur.completed, color: "--pos" }, { label: _t("status.cancelled"), value: cur.cancelled, color: "--neg" }, { label: _t("status.other"), value: Math.max(0, cur.orders - cur.completed - cur.cancelled), color: "--border-strong" }]);
      const cacheKey = st.period + "|" + st.platform;
      lazyCard(cancelState, cacheKey, !!S.getCancellations(st.period, st.platform), S.fetchCancellations, "orders");
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
  let prodGrouping = "single";
  window.Views.products = {
    titleKey: "page.products.title", eyebrowKey: "page.products.eyebrow",
    render() {
      const st = S.state;
      const showPlatform = prodGrouping === "combo";
      const cats = S.categoryBreakdown(st.period, st.platform, prodGrouping).filter((c) => c.cat !== "gift" && c.revenue > 0);
      const list = S.products(st.period, prodMetric, st.platform, prodGrouping).filter((p) => p.cat !== "gift").slice(0, 15);
      const maxV = Math.max(...list.map((p) => prodMetric === "qty" ? p.qty : p.revenue), 1);
      const rows = list.map((p, i) => `<tr>
        <td><div class="prod"><span class="rank">${i + 1}</span><div style="min-width:0"><div class="pname">${escHtml(p.cleanName)}</div><div class="psku">${escHtml(p.sku)}</div></div></div></td>
        <td><span class="tag" style="border-color:transparent;background:color-mix(in oklch, ${S.CAT[p.cat].color.startsWith("--") ? "var(" + S.CAT[p.cat].color + ")" : S.CAT[p.cat].color} 14%, transparent);color:${S.CAT[p.cat].color.startsWith("--") ? "var(" + S.CAT[p.cat].color + ")" : S.CAT[p.cat].color}">${S.catLabel(p.cat)}</span></td>
        ${showPlatform ? `<td>${UI.pchip(p.platform)}</td>` : ""}
        <td class="num">${F.viInt(p.qty)}</td>
        <td class="num"><b>${F.money(p.revenue)}</b></td>
        <td class="num" style="width:120px"><div class="cmp-track"><div class="cmp-fill" style="width:${(prodMetric === "qty" ? p.qty : p.revenue) / maxV * 100}%;background:var(--brand)"></div></div></td>
      </tr>`).join("");
      const totalCatRev = cats.reduce((t, c) => t + c.revenue, 0);
      return `
      <div class="g12">
        <div data-collapse style="grid-column:span 12" class="card">
          <div class="card-head" style="flex-wrap:wrap"><div><div class="card-title">${_t("ovw.category.title")}</div><div class="card-sub">${_t("products.grouping.label")}</div></div>
            <div class="miniseg" id="prodGroupingSeg" role="group" aria-label="${_t("products.grouping.label")}"><button class="${prodGrouping === "combo" ? "active" : ""}" data-grouping="combo" aria-pressed="${prodGrouping === "combo"}">${_t("products.grouping.combo")}</button><button class="${prodGrouping === "single" ? "active" : ""}" data-grouping="single" aria-pressed="${prodGrouping === "single"}">${_t("products.grouping.single")}</button></div>
          </div>
          <div class="card-pad" style="display:flex;flex-wrap:wrap;gap:24px;align-items:center"><div class="donut-wrap" style="height:180px;flex:0 0 240px;min-width:0;max-width:100%"><canvas id="catDonut2"></canvas><div class="donut-center"><div><div class="big tnum">${F.money(totalCatRev)}</div><div class="small">${_t("ovw.top_products.by_rev")}</div></div></div></div>
            <div style="flex:1 1 320px;min-width:0;display:flex;flex-direction:column;gap:10px">
              ${cats.map((c) => `<div><div style="display:flex;align-items:center;gap:9px;font-size:13px;margin-bottom:4px"><span class="legend-swatch" style="background:${UI.cssColor(c.color)}"></span><b>${S.catLabel(c.cat)}</b><span style="margin-left:auto;display:flex;align-items:baseline;gap:7px"><span style="font-weight:800" class="tnum">${F.money(c.revenue)}</span><span class="cat-share tnum" style="font-size:11px;color:var(--ink-3);font-weight:700">${F.pct(totalCatRev ? c.revenue / totalCatRev * 100 : 0)}</span></span></div><div class="cmp-track"><div class="cmp-fill" style="width:${c.revenue / (cats[0].revenue || 1) * 100}%;background:${UI.cssColor(c.color)}"></div></div></div>`).join("")}
            </div></div>
        </div>
        <div data-collapse style="grid-column:span 12" class="card">
          <div class="card-head"><div><div class="card-title">${_t("ovw.top_products.title")}</div></div>
            <div class="miniseg" id="prodSeg"><button class="${prodMetric === "rev" ? "active" : ""}" data-m="rev">${_t("ovw.cmp.revenue")}</button><button class="${prodMetric === "qty" ? "active" : ""}" data-m="qty">${_t("ovw.top_products.by_qty")}</button></div>
          </div>
          <div class="card-pad" style="padding:6px;overflow-x:auto"><table class="tbl"><thead><tr><th>${_t("th.product")}</th><th>${_t("th.category")}</th>${showPlatform ? `<th>${_t("th.platform")}</th>` : ""}<th class="num">${_t("th.qty_sold")}</th><th class="num">${_t("th.revenue")}</th><th class="num">${prodMetric === "qty" ? _t("th.qty_sold") : _t("th.revenue")}</th></tr></thead><tbody>${rows}</tbody></table></div>
        </div>
        ${skuProfitCardHTML(S.getSkuProfit(st.period, st.platform), skuProfitState.failed === st.period + "|" + st.platform)}
      </div>`;
    },
    mount(root) {
      const cats = S.categoryBreakdown(S.state.period, S.state.platform, prodGrouping).filter((c) => c.cat !== "gift" && c.revenue > 0);
      const cn = root.querySelector("#catDonut2"); if (cn) C.donut(cn, cats.map((c) => ({ label: S.catLabel(c.cat), value: c.revenue, color: c.color })), { money: true });
      root.querySelector("#prodGroupingSeg")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { prodGrouping = b.dataset.grouping; window.App.rerender(); } });
      root.querySelector("#prodSeg")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { prodMetric = b.dataset.m; window.App.rerender(); } });
      const cacheKey = S.state.period + "|" + S.state.platform;
      lazyCard(skuProfitState, cacheKey, !!S.getSkuProfit(S.state.period, S.state.platform), S.fetchSkuProfit, "products");
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
        <div data-collapse style="grid-column:span 7"><div class="card"><div class="card-head"><div><div class="card-title">${_t("customers.top_buyers.title")}</div></div></div><div class="card-pad" style="height:320px"></div></div></div>
        <div data-collapse style="grid-column:span 5"><div class="card"><div class="card-head"><div><div class="card-title">${_t("customers.geo.title")}</div></div></div><div class="card-pad" style="height:320px"></div></div></div>
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
      const warehouses = data.warehouse_distribution || [];

      const totalNF = S.PKEYS.map((k) => ({ key: k, ...S.PLAT[k], ...S.trafficAggRange(range, k) }));
      const totalNFVal = totalNF.reduce((t, p) => t + p.nf, 0);

      const kpis = kpiRow([
        { label: _t("customers.summary.total_orders"), ico: `<span class="kpi-ico">${UI.ICON.orders}</span>`, value: F.viInt(summary.total_orders || 0), delta: "", foot: S.periodLabel(st.period).toLowerCase() },
        { label: _t("customers.summary.avg_order"), ico: `<span class="kpi-ico">${UI.ICON.aov}</span>`, value: F.money(summary.avg_order_value || 0), delta: "", foot: _t("kpi.avg_order_foot") },
        { label: _t("customers.summary.unique_buyers"), ico: `<span class="kpi-ico">${UI.ICON.people}</span>`, value: F.viInt(summary.unique_buyers || 0), delta: "", foot: _t("customers.segment.title").toLowerCase() },
        { label: _t("customers.summary.conversion"), ico: `<span class="kpi-ico">${UI.ICON.aov}</span>`, value: F.viDec(summary.conv_rate || 0, 2), unit: "%", delta: "", foot: _t("traffic.conv.sub") },
      ]);

      // Donut slices. new + returning partition unique_buyers, so they share that
      // denominator. potential_buyers are prior-period buyers absent from this one,
      // so they sit outside the total and stay off the donut.
      const totalBuyers = summary.unique_buyers || 0;
      const potential = segments.potential_buyers || 0;
      const segLegend = segmentSlices(segments).map((s) => `<div style="display:flex;align-items:center;gap:9px;font-size:13px">
        <span class="legend-swatch" style="background:var(${s.color})"></span><b>${s.label}</b>
        <span style="margin-left:auto;font-weight:800" class="tnum">${F.viInt(s.value)}<span style="color:var(--ink-3);font-weight:600;margin-left:6px">${F.pct(totalBuyers ? s.value / totalBuyers * 100 : 0)}</span></span>
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
      const geoRows = cities.map((g) => `<tr><td>${escHtml(g.city)}</td><td class="num">${F.viInt(g.orders)}</td><td class="num"><b>${F.money(g.revenue || 0)}</b></td><td class="num">${F.pct(g.percentage ?? 0)}</td><td class="num" style="width:90px"><div class="cmp-track"><div class="cmp-fill" style="width:${g.orders / maxG * 100}%;background:var(--brand)"></div></div></td></tr>`).join("");

      // Warehouse distribution. Populated only by re-imported order files, so it
      // can be empty on data uploaded before the warehouse column existed.
      const maxW = Math.max(...warehouses.map((w) => w.orders), 1);
      const whRows = warehouses.length
        ? warehouses.map((w) => `<tr><td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(w.warehouse)}</td><td class="num">${F.viInt(w.orders)}</td><td class="num"><b>${F.money(w.revenue || 0)}</b></td><td class="num">${F.pct(w.percentage ?? 0)}</td><td class="num" style="width:90px"><div class="cmp-track"><div class="cmp-fill" style="width:${w.orders / maxW * 100}%;background:var(--lazada)"></div></div></td></tr>`).join("")
        : `<tr><td colspan="5" style="text-align:center;color:var(--ink-3);padding:18px 0">${_t("customers.warehouse.empty")}</td></tr>`;

      const fRows = totalNF.map((p) => `<div class="cmp-row"><div class="cmp-name">${UI.pdot(p.key)}${p.label}</div><div class="cmp-track"><div class="cmp-fill" style="width:${totalNFVal ? p.nf / Math.max(...totalNF.map((x) => x.nf), 1) * 100 : 0}%;background:var(--${p.key})"></div></div><div class="cmp-val">${F.viInt(p.nf)}</div></div>`).join("");

      return kpis + `
      <div class="g12 section-gap">
        <div data-collapse style="grid-column:span 7" class="card">
          <div class="card-head"><div><div class="card-title">${_t("customers.top_buyers.title")}</div></div></div>
          <div class="card-pad" style="padding:6px;overflow-x:auto"><table class="tbl"><thead><tr><th>#</th><th>${_t("customers.table.username")}</th><th class="num">${_t("th.orders")}</th><th class="num">${_t("th.revenue")}</th><th></th></tr></thead><tbody>${buyerRows}</tbody></table></div>
        </div>
        <div data-collapse style="grid-column:span 5;display:flex;flex-direction:column;gap:16px">
          <div class="card">
            <div class="card-head"><div><div class="card-title">${_t("customers.geo.title")}</div></div></div>
            <div class="card-pad" style="padding:6px;overflow-x:auto"><table class="tbl"><thead><tr><th>${_t("th.city")}</th><th class="num">${_t("th.orders")}</th><th class="num">${_t("th.revenue")}</th><th class="num">${_t("th.share")}</th><th></th></tr></thead><tbody>${geoRows}</tbody></table></div>
          </div>
          <div class="card">
            <div class="card-head"><div><div class="card-title">${_t("customers.warehouse.title")}</div></div></div>
            <div class="card-pad" style="padding:6px;overflow-x:auto"><table class="tbl"><thead><tr><th>${_t("customers.warehouse.col")}</th><th class="num">${_t("th.orders")}</th><th class="num">${_t("th.revenue")}</th><th class="num">${_t("th.share")}</th><th></th></tr></thead><tbody>${whRows}</tbody></table></div>
          </div>
        </div>
      </div>
      <div class="g12 section-gap">
        <div data-collapse style="grid-column:span 7" class="card">
          <div class="card-head"><div><div class="card-title">${_t("kpi.new_followers")}</div></div></div>
          <div class="card-pad"><div style="font-size:30px;font-weight:800;letter-spacing:-.02em" class="tnum">${F.viInt(totalNFVal)} <span style="font-size:14px;color:var(--ink-3);font-weight:700">${_t("traffic.followers_new")}</span></div><div style="display:flex;flex-direction:column;gap:6px;margin-top:14px">${fRows}</div>
          <div class="note" style="margin-top:16px">${UI.ICON.people} ${_t("customers.followers.note")}</div></div>
        </div>
        <div data-collapse style="grid-column:span 5" class="card">
          <div class="card-head"><div><div class="card-title">${_t("customers.segment.title")}</div></div></div>
          <div class="card-pad">
            <div style="display:grid;grid-template-columns:150px 1fr;gap:18px;align-items:center">
              <div class="donut-wrap" style="height:150px"><canvas id="segDonut"></canvas>
                <div class="donut-center"><div><div class="big tnum">${F.viInt(totalBuyers)}</div><div class="small">${_t("customers.segment.total_buyers")}</div></div></div>
              </div>
              <div>
                <div style="display:flex;flex-direction:column;gap:9px">${segLegend}</div>
                <div style="display:flex;align-items:center;gap:9px;font-size:13px;margin-top:11px;border-top:1px solid var(--surface-3);padding-top:11px">
                  <span class="legend-swatch" style="background:var(--ink-3)"></span><b>${_t("customers.segment.potential")}</b>
                  <span style="margin-left:auto;font-weight:800" class="tnum">${F.viInt(potential)}</span>
                </div>
              </div>
            </div>
            <div class="note" style="margin-top:14px">${UI.ICON.people} ${_t("customers.segment.potential_note")}</div>
          </div>
        </div>
      </div>
      ${retentionCardHTML(S.getRetention(st.period, st.platform), retentionState.failed === st.period + "|" + st.platform, st.platform)}
      <div id="customerDetailPanel"></div>`;
    },
    mount(root) {
      const cacheKey = S.state.period + "|" + S.state.platform;
      if (S.state.platform !== "lazada") {
        lazyCard(retentionState, cacheKey, !!S.getRetention(S.state.period, S.state.platform), S.fetchRetention, "customers");
      }
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

      const segDonut = root.querySelector("#segDonut");
      if (segDonut && cached) C.donut(segDonut, segmentSlices(cached.customer_segments || {}));

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
        <td class="mono" style="font-size:11.5px">${escHtml(o.order_id)}</td>
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
        { label: _t("kpi.pageviews"), ico: `<span class="kpi-ico">${UI.ICON.eye_traffic}</span>`, value: F.num(cur.pv), delta: cmp ? dd(cur.pv, cmp.pv) : "", foot: cmp ? `vs ${F.num(cmp.pv)}` : _t("common.page_views") },
        { label: _t("kpi.visits"), ico: `<span class="kpi-ico">${UI.ICON.people}</span>`, value: F.num(cur.visits), delta: cmp ? dd(cur.visits, cmp.visits) : "", foot: cmp ? `vs ${F.num(cmp.visits)}` : _t("kpi.visits").toLowerCase() },
        { label: _t("kpi.new_visitors"), ico: `<span class="kpi-ico">${UI.ICON.people}</span>`, value: F.num(cur.nv), delta: cmp ? dd(cur.nv, cmp.nv) : "", foot: cmp ? `vs ${F.num(cmp.nv)}` : _t("traffic.visitors_new") },
        { label: _t("kpi.conversion"), ico: `<span class="kpi-ico">${UI.ICON.aov}</span>`, value: F.viDec(cur.conv, 2), unit: "%", delta: cmp ? dd(cur.conv, cmp.conv) : "", foot: _t("traffic.conv.sub") },
        { label: _t("kpi.new_followers"), ico: `<span class="kpi-ico">${UI.ICON.people}</span>`, value: F.viInt(cur.nf), delta: cmp ? dd(cur.nf, cmp.nf) : "", foot: cmp ? `vs ${F.viInt(cmp.nf)}` : _t("traffic.followers_new") },
      ]);
      const tp = S.PKEYS.map((k) => ({ key: k, ...S.PLAT[k], ...S.trafficAggRange(range, k) }));
      const maxVis = Math.max(...tp.map((p) => p.visits), 1);
      const tRows = tp.map((p) => `<tr><td><span class="pchip">${UI.pdot(p.key)}<b>${p.label}</b></span></td><td class="num">${F.viInt(p.pv)}</td><td class="num">${F.viInt(p.visits)}</td><td class="num">${F.viInt(p.completed)}</td><td class="num"><b>${F.pct(p.conv)}</b></td><td class="num">${F.viInt(p.nf)}</td><td class="num" style="width:140px"><div class="cmp-track"><div class="cmp-fill" style="width:${p.visits / maxVis * 100}%;background:var(--${p.key})"></div></div></td></tr>`).join("");
      return kpis + `
      <div class="g12 section-gap">
        <div data-collapse style="grid-column:span 8" class="card">
          <div class="card-head"><div><div class="card-title">${_t("traffic.daily.title")}</div></div>
            <div class="legend">${S.PKEYS.map((k) => `<span class="legend-item"><span class="legend-swatch" style="background:var(--${k})"></span>${S.PLAT[k].label}</span>`).join("")}</div></div>
          <div class="card-pad" style="padding-top:14px"><div class="chart-wrap" style="height:260px"><canvas id="trafChart"></canvas></div></div>
        </div>
        <div data-collapse style="grid-column:span 4" class="card">
          <div class="card-head"><div><div class="card-title">${_t("traffic.conv.title")}</div></div></div>
          <div class="card-pad" style="display:flex;flex-direction:column;gap:14px;padding-top:18px">
            ${tp.map((p) => `<div style="display:flex;align-items:center;gap:14px">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:7px"><span class="legend-swatch" style="background:var(--${p.key})"></span><b>${p.label}</b></div>
                ${convFigures(p.conv, p.key)}
              </div>
              <div class="tnum" style="flex:none;font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1;color:var(--${p.key})">${F.pct(p.conv)}</div>
            </div>`).join("")}
          </div>
        </div>
      </div>
      <div class="card section-gap"><div class="card-head"><div><div class="card-title">${_t("traffic.table.title")}</div></div></div>
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
