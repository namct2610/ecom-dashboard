/* ============================================================
   Store — state, selectors & formatters over the REAL dump
   window.DASH = aggregated from production DB (2024-03 → 2026-06)
   Periods are months; comparison = previous period or YoY (real).
   ============================================================ */
(function () {
  const DASH = window.DASH;

  const PLAT = {
    shopee: { key: "shopee", label: "Shopee", short: "S", color: "var(--shopee)", raw: "#ee4d2d" },
    lazada: { key: "lazada", label: "Lazada", short: "L", color: "var(--lazada)", raw: "#2c3ce0" },
    tiktok: { key: "tiktok", label: "TikTok Shop", short: "T", color: "var(--tiktok)", raw: "#00b3a4" },
  };
  const PKEYS = ["shopee", "lazada", "tiktok"];

  /* ---- formatters (vi-VN) ---- */
  const viInt = (n) => Math.round(n || 0).toLocaleString("vi-VN");
  const viDec = (n, d = 1) => (n || 0).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
  function money(n) {
    n = n || 0; const a = Math.abs(n);
    if (a >= 1e9) return viDec(n / 1e9, 2) + " Tỷ";
    if (a >= 1e6) return viDec(n / 1e6, 1) + " Tr";
    if (a >= 1e3) return Math.round(n / 1e3) + "K";
    return viInt(n);
  }
  const moneyFull = (n) => viInt(n) + "₫";
  function num(n) { n = n || 0; if (Math.abs(n) >= 1e6) return viDec(n / 1e6, 1) + "Tr"; if (Math.abs(n) >= 10000) return viDec(n / 1e3, 1) + "K"; return viInt(n); }
  const pct = (n, d = 1) => viDec(n || 0, d) + "%";
  function delta(cur, prev) {
    if (prev == null || prev === 0) return { dir: "flat", pct: null };
    const c = (cur - prev) / prev * 100;
    return { dir: Math.abs(c) < 0.05 ? "flat" : c > 0 ? "up" : "down", pct: c };
  }
  const F = { viInt, viDec, money, moneyFull, num, pct, delta };

  /* ---- month helpers ---- */
  const MONTH_VI = (ym) => { const [y, m] = ym.split("-"); return "Th" + (+m) + "/" + y; };
  const MONTH_VI_LONG = (ym) => { const [y, m] = ym.split("-"); return "Tháng " + (+m) + ", " + y; };
  function addMonth(ym, delta) {
    let [y, m] = ym.split("-").map(Number); m += delta;
    while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; }
    return y + "-" + String(m).padStart(2, "0");
  }

  const monthlyMap = {}; DASH.monthly.forEach((m) => (monthlyMap[m.ym] = m));

  /* ---- period model ---- */
  // periodKey: "m:2026-05" | "3m"
  function curMonths(key) {
    if (key === "3m") return DASH.focusMonths.slice();
    return [key.slice(2)];
  }
  function compareMonths(key, mode) {
    if (mode === "none") return null;
    const cur = curMonths(key);
    if (mode === "yoy") return cur.map((ym) => addMonth(ym, -12));
    // prev: shift the whole window back by its length
    const len = cur.length;
    return cur.map((ym) => addMonth(ym, -len));
  }
  function periodLabel(key) {
    if (key === "3m") return "3 tháng gần nhất";
    return MONTH_VI_LONG(key.slice(2));
  }
  function compareLabel(key, mode) {
    if (mode === "none") return "";
    if (mode === "yoy") return key === "3m" ? "cùng kỳ năm trước" : "cùng kỳ " + (+key.slice(2, 6) - 1);
    return key === "3m" ? "3 tháng liền trước" : "tháng trước";
  }

  /* ---- aggregate over a set of months (exact, from monthly) ---- */
  function aggMonths(months, platform) {
    if (!months) return null;
    let revenue = 0, orders = 0, completed = 0, cancelled = 0;
    months.forEach((ym) => {
      const m = monthlyMap[ym]; if (!m) return;
      if (platform === "all") { revenue += m.revenue; orders += m.orders; completed += m.completed; cancelled += m.cancelled; }
      else { const p = m.plat[platform]; revenue += p.rev; orders += p.ord; completed += p.done; cancelled += p.canc; }
    });
    return {
      revenue, orders, completed, cancelled,
      aov: completed ? revenue / completed : 0,
      cancelRate: orders ? cancelled / orders * 100 : 0,
      completionRate: orders ? completed / orders * 100 : 0,
    };
  }

  function platformMetrics(months) {
    const totalRev = PKEYS.reduce((t, k) => t + aggMonths(months, k).revenue, 0);
    return PKEYS.map((k) => {
      const a = aggMonths(months, k);
      return { key: k, ...PLAT[k], ...a, share: totalRev ? a.revenue / totalRev * 100 : 0 };
    });
  }

  /* ---- daily series for charts ---- */
  function dailySeries(months, platform) {
    const set = new Set(months);
    return DASH.daily.filter((d) => set.has(d.date.slice(0, 7))).map((d) => {
      const s = d.s, l = d.l, t = d.t; // [rev,ord,done,canc]
      const rev = { shopee: s[0], lazada: l[0], tiktok: t[0] };
      const ord = { shopee: s[1], lazada: l[1], tiktok: t[1] };
      return {
        date: d.date,
        revenue: platform === "all" ? s[0] + l[0] + t[0] : rev[platform],
        orders: platform === "all" ? s[1] + l[1] + t[1] : ord[platform],
        shopee: s[0], lazada: l[0], tiktok: t[0],
        o_shopee: s[1], o_lazada: l[1], o_tiktok: t[1],
      };
    });
  }

  /* ---- monthly trend (last n months) ---- */
  function monthlyTrend(n) {
    const arr = DASH.monthly.slice(-n);
    return arr.map((m) => ({
      ym: m.ym, label: MONTH_VI(m.ym), revenue: m.revenue, orders: m.orders,
      shopee: m.plat.shopee.rev, lazada: m.plat.lazada.rev, tiktok: m.plat.tiktok.rev,
      partial: m.ym === "2026-06",
    }));
  }

  /* ---- products (merge across focus months if needed) ---- */
  function categoryOf(sku, name) {
    const s = (sku || "").toUpperCase(); const n = (name || "").toLowerCase();
    if (s.startsWith("GIFT") || n.includes("hàng tặng") || n.includes("free gift")) return "gift";
    if (s.startsWith("MNS") || n.includes("sữa chua")) return "yogurt";
    if (s.startsWith("MNF") || n.includes("phô mai tươi")) return "freshcheese";
    if (s.startsWith("GMS") || n.includes("phô mai lát") || n.includes("gourmet slices")) return "slices";
    if (s.startsWith("MON") || n.includes("váng sữa")) return "monte";
    return "other";
  }
  const CAT = {
    monte: { label: "Váng sữa Monte", color: "var(--shopee)" },
    yogurt: { label: "Sữa chua Montinis", color: "var(--lazada)" },
    freshcheese: { label: "Phô mai tươi", color: "#2A9D8F" },
    slices: { label: "Phô mai lát", color: "var(--tiktok)" },
    gift: { label: "Quà tặng (0đ)", color: "var(--ink-3)" },
    other: { label: "Khác", color: "var(--border-strong)" },
  };
  const cleanName = (n) => (n || "").replace(/^\[.*?\]\s*/, "").replace(/\s*-\s*HÀNG TẶNG.*$/i, "").trim();

  function detailMonths(key) { return curMonths(key).filter((ym) => DASH.monthDetail[ym]); }

  function products(key, metric) {
    const months = detailMonths(key);
    const merged = {};
    months.forEach((ym) => {
      const list = DASH.monthDetail[ym][metric === "qty" ? "topQty" : "topRev"];
      list.forEach((p) => {
        const e = merged[p.sku] || (merged[p.sku] = { sku: p.sku, name: p.name, qty: 0, revenue: 0, platform: p.platform });
        e.qty += p.qty; e.revenue += p.revenue;
      });
    });
    const arr = Object.values(merged).map((p) => ({ ...p, cat: categoryOf(p.sku, p.name), cleanName: cleanName(p.name) }));
    arr.sort((a, b) => (metric === "qty" ? b.qty - a.qty : b.revenue - a.revenue));
    return arr;
  }

  function categoryBreakdown(key) {
    const arr = products(key, "rev");
    const map = {};
    arr.forEach((p) => {
      const c = p.cat; const e = map[c] || (map[c] = { cat: c, ...CAT[c], revenue: 0, qty: 0, count: 0 });
      e.revenue += p.revenue; e.qty += p.qty; e.count++;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }

  function cityDistribution(key) {
    const months = detailMonths(key); const agg = {};
    months.forEach((ym) => DASH.monthDetail[ym].city.forEach((c) => (agg[c.city] = (agg[c.city] || 0) + c.orders)));
    const total = Object.values(agg).reduce((t, v) => t + v, 0);
    const rows = Object.entries(agg).map(([city, orders]) => ({ city, orders })).sort((a, b) => b.orders - a.orders);
    const top = rows.filter((r) => r.city !== "Khác").slice(0, 6);
    const known = top.reduce((t, r) => t + r.orders, 0);
    if (total - known > 0) top.push({ city: "Khác", orders: total - known, other: true });
    return top.map((r) => ({ ...r, pct: total ? r.orders / total * 100 : 0 }));
  }

  function heatMatrix(key) {
    const months = detailMonths(key);
    const m = Array.from({ length: 7 }, () => Array(24).fill(0)); let max = 0;
    months.forEach((ym) => DASH.monthDetail[ym].heat.forEach((h) => { m[h.weekday][h.hour] += h.orders; }));
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) if (m[d][h] > max) max = m[d][h];
    return { m, max };
  }

  function statusBreakdown(key) {
    const months = detailMonths(key); const st = { completed: 0, delivered: 0, cancelled: 0, pending: 0 };
    months.forEach((ym) => { const s = DASH.monthDetail[ym].status; Object.keys(st).forEach((k) => (st[k] += s[k] || 0)); });
    return st;
  }

  /* ---- traffic ---- */
  function trafficSeries(months, platform) {
    const set = new Set(months);
    return DASH.trafficDaily.filter((d) => set.has(d.date.slice(0, 7))).map((d) => {
      const get = (k) => (platform === "all" ? PKEYS.reduce((t, p) => t + ((d[p] && d[p][k]) || 0), 0) : (d[platform] ? d[platform][k] : 0));
      return { date: d.date, pv: get("pv"), visits: get("visits"), nf: get("nf") };
    });
  }
  function trafficAgg(months, platform) {
    const s = trafficSeries(months, platform);
    const pv = s.reduce((t, d) => t + d.pv, 0), visits = s.reduce((t, d) => t + d.visits, 0), nf = s.reduce((t, d) => t + d.nf, 0);
    const ord = aggMonths(months, platform);
    return { pv, visits, nf, orders: ord.orders, completed: ord.completed, conv: visits ? ord.completed / visits * 100 : 0 };
  }
  function trafficByPlatform(months) {
    return PKEYS.map((k) => ({ key: k, ...PLAT[k], ...trafficAgg(months, k) }));
  }

  /* ---- state ---- */
  const saved = JSON.parse(localStorage.getItem("zm_state_v3") || "{}");
  const state = {
    page: saved.page || "overview",
    platform: saved.platform || "all",
    period: saved.period || "m:2026-05",
    compare: saved.compare || "prev", // prev | yoy | none
    theme: saved.theme || "light",
    collapsed: saved.collapsed || false,
  };
  function save() { localStorage.setItem("zm_state_v3", JSON.stringify(state)); }

  window.Store = {
    DASH, PLAT, PKEYS, CAT, state, save, F,
    MONTH_VI, MONTH_VI_LONG, addMonth,
    curMonths, compareMonths, periodLabel, compareLabel,
    aggMonths, platformMetrics, dailySeries, monthlyTrend,
    products, categoryBreakdown, cityDistribution, heatMatrix, statusBreakdown, categoryOf,
    trafficSeries, trafficAgg, trafficByPlatform,
    cur: () => curMonths(state.period),
    cmp: () => compareMonths(state.period, state.compare),
  };
  window.F = F;
})();
