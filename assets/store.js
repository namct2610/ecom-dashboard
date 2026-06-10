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

  /* ---- date/month helpers ---- */
  // MONTH_VI / MONTH_VI_LONG kept for back-compat; they delegate to i18n when
  // the active language is not Vietnamese (EN returns "5/2026" / "5/2026").
  const MONTH_VI = (ym) => {
    const [y, m] = ym.split("-");
    if (window.tf) return window.tf("period.month_short", { n: +m, y });
    return "Th" + (+m) + "/" + y;
  };
  const MONTH_VI_LONG = (ym) => {
    const [y, m] = ym.split("-");
    if (window.tf) return window.tf("period.month_n", { n: +m, y });
    return "Tháng " + (+m) + ", " + y;
  };
  function addMonth(ym, delta) {
    let [y, m] = ym.split("-").map(Number); m += delta;
    while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; }
    return y + "-" + String(m).padStart(2, "0");
  }
  function parseDate(s) {
    const [y, m, d] = String(s || "").split("-").map(Number);
    return new Date(y || 1970, (m || 1) - 1, d || 1);
  }
  function fmtDate(d) {
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  }
  function fmtDateShort(s) {
    const d = parseDate(s);
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }
  function addDays(s, days) {
    const d = parseDate(s);
    d.setDate(d.getDate() + days);
    return fmtDate(d);
  }
  function diffDays(a, b) {
    const ms = parseDate(b).setHours(0, 0, 0, 0) - parseDate(a).setHours(0, 0, 0, 0);
    return Math.round(ms / 86400000);
  }
  function monthStart(ym) { return ym + "-01"; }
  function monthEnd(ym) {
    const d = parseDate(ym + "-01");
    d.setMonth(d.getMonth() + 1, 0);
    return fmtDate(d);
  }
  function yearStart(y) { return y + "-01-01"; }
  function yearEnd(y) { return y + "-12-31"; }
  function startOfWeek(s) {
    const d = parseDate(s);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return fmtDate(d);
  }
  function endOfWeek(s) {
    return addDays(startOfWeek(s), 6);
  }
  function shiftDateYear(s, delta) {
    const d = parseDate(s);
    d.setFullYear(d.getFullYear() + delta);
    return fmtDate(d);
  }
  function shiftRange(range, days) {
    return { ...range, start: addDays(range.start, days), end: addDays(range.end, days) };
  }

  const monthlyMap = {}; DASH.monthly.forEach((m) => (monthlyMap[m.ym] = m));
  const dailyMap = {};
  DASH.daily.forEach((d) => { dailyMap[d.date] = d; });
  const allDates = () => (DASH.daily || []).map((d) => d.date).sort();
  const rangeDetailCache = {};
  const rangeDetailInflight = {};

  /* ---- period model ----
     supported keys:
       "m:YYYY-MM" — single month
       "3m"        — last 3 months in DASH.focusMonths
       "6m"        — last 6 months in DASH.monthly
       "ytd"       — months in latestMonth year up to (and including) latestMonth
       "y:YYYY"    — all months of year YYYY in dataset
       "all"       — every month in dataset
  */
  const allMonths = () => DASH.monthly.map((m) => m.ym).sort();

  function normalizeRange(start, end, mode) {
    if (start > end) [start, end] = [end, start];
    return { mode, start, end };
  }
  function rangeFromKey(key) {
    const dates = allDates();
    const latestDate = dates[dates.length - 1] || ((DASH.latestMonth || "2026-01") + "-01");
    if (!key || key === "3m") {
      const months = DASH.focusMonths && DASH.focusMonths.length ? DASH.focusMonths.slice() : allMonths().slice(-3);
      return normalizeRange(monthStart(months[0]), monthEnd(months[months.length - 1]), "month");
    }
    if (key === "6m") {
      const months = allMonths().slice(-6);
      return normalizeRange(monthStart(months[0]), monthEnd(months[months.length - 1]), "month");
    }
    if (key === "all") {
      const months = allMonths();
      return normalizeRange(monthStart(months[0]), monthEnd(months[months.length - 1]), "custom");
    }
    if (key === "ytd") {
      const y = (DASH.latestMonth || allMonths().slice(-1)[0]).slice(0, 4);
      return normalizeRange(yearStart(y), monthEnd(DASH.latestMonth), "year");
    }
    if (key.startsWith("d:")) {
      const day = key.slice(2) || latestDate;
      return normalizeRange(day, day, "day");
    }
    if (key.startsWith("w:")) {
      const day = key.slice(2) || latestDate;
      return normalizeRange(startOfWeek(day), endOfWeek(day), "week");
    }
    if (key.startsWith("m:")) {
      const ym = key.slice(2) || (DASH.latestMonth || allMonths().slice(-1)[0]);
      return normalizeRange(monthStart(ym), monthEnd(ym), "month");
    }
    if (key.startsWith("y:")) {
      const y = key.slice(2) || String(parseDate(latestDate).getFullYear());
      return normalizeRange(yearStart(y), yearEnd(y), "year");
    }
    if (key.startsWith("c:")) {
      const parts = key.slice(2).split(":");
      return normalizeRange(parts[0] || latestDate, parts[1] || parts[0] || latestDate, "custom");
    }
    return normalizeRange(latestDate, latestDate, "day");
  }
  function monthsInRange(range) {
    const out = [];
    let ym = range.start.slice(0, 7);
    const endYm = range.end.slice(0, 7);
    while (ym <= endYm) {
      if (monthlyMap[ym]) out.push(ym);
      ym = addMonth(ym, 1);
    }
    return out;
  }
  function curMonths(key) {
    return monthsInRange(rangeFromKey(key));
  }
  function compareRange(key, mode) {
    if (mode === "none") return null;
    const cur = rangeFromKey(key);
    if (mode === "yoy") return normalizeRange(shiftDateYear(cur.start, -1), shiftDateYear(cur.end, -1), cur.mode);
    const span = diffDays(cur.start, cur.end) + 1;
    return shiftRange(cur, -span);
  }
  function compareMonths(key, mode) {
    const r = compareRange(key, mode);
    return r ? monthsInRange(r) : null;
  }
  const _T = (k, f) => (window.t ? window.t(k, f) : f || k);
  const _TF = (k, v) => (window.tf ? window.tf(k, v) : k);

  function periodLabel(key) {
    if (key === "3m")  return _T("period.3m");
    if (key === "6m")  return _T("period.6m");
    if (key === "ytd") return _T("period.ytd");
    if (key === "all") return _T("period.all");
    const r = rangeFromKey(key);
    if (r.mode === "day") return _TF("period.day_n", { date: fmtDateShort(r.start) });
    if (r.mode === "week") return _TF("period.week_n", { start: fmtDateShort(r.start), end: fmtDateShort(r.end) });
    if (r.mode === "month") return MONTH_VI_LONG(r.start.slice(0, 7));
    if (r.mode === "year") return _TF("period.year_n", { y: r.start.slice(0, 4) });
    if (r.mode === "custom") return _TF("period.custom_n", { start: fmtDateShort(r.start), end: fmtDateShort(r.end) });
    return _T("period.all");
  }
  function compareLabel(key, mode) {
    if (mode === "none") return "";
    const cur = rangeFromKey(key);
    const cmp = compareRange(key, mode);
    if (!cmp) return "";
    if (mode === "yoy") {
      if (cur.mode === "year") return _TF("compare.yoy_year", { y: cmp.start.slice(0, 4) });
      return _T("compare.yoy_short");
    }
    if (cur.mode === "month") return _T("compare.last_month");
    if (cur.mode === "year") return _T("compare.last_year");
    if (cur.mode === "week") return _T("compare.prev_week");
    if (cur.mode === "day") return _T("compare.prev_day");
    return _T("compare.prev_short");
  }

  function periodMode(key) {
    return rangeFromKey(key).mode;
  }
  function coercePeriod(key, mode) {
    const r = rangeFromKey(key);
    if (mode === "day") return "d:" + r.end;
    if (mode === "week") return "w:" + r.end;
    if (mode === "month") return "m:" + r.end.slice(0, 7);
    if (mode === "year") return "y:" + r.end.slice(0, 4);
    if (mode === "custom") return "c:" + r.start + ":" + r.end;
    return key;
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

  function aggRange(range, platform) {
    if (!range) return null;
    let revenue = 0, orders = 0, completed = 0, cancelled = 0;
    allDates().forEach((date) => {
      if (date < range.start || date > range.end) return;
      const d = dailyMap[date];
      if (!d) return;
      const buckets = { shopee: d.s, lazada: d.l, tiktok: d.t };
      if (platform === "all") {
        PKEYS.forEach((k) => {
          revenue += buckets[k][0] || 0;
          orders += buckets[k][1] || 0;
          completed += buckets[k][2] || 0;
          cancelled += buckets[k][3] || 0;
        });
      } else if (buckets[platform]) {
        revenue += buckets[platform][0] || 0;
        orders += buckets[platform][1] || 0;
        completed += buckets[platform][2] || 0;
        cancelled += buckets[platform][3] || 0;
      }
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
  function dailySeriesRange(range, platform) {
    return (DASH.daily || []).filter((d) => d.date >= range.start && d.date <= range.end).map((d) => {
      const s = d.s, l = d.l, t = d.t;
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
  function businessTrend(key) {
    const range = rangeFromKey(key);
    if (range.mode === "year") {
      const years = Array.from(new Set(allMonths().map((ym) => ym.slice(0, 4)))).sort();
      return years.map((y) => {
        const months = allMonths().filter((ym) => ym.startsWith(y));
        return {
          label: _TF("period.year_short", { y }),
          shopee: aggMonths(months, "shopee").revenue,
          lazada: aggMonths(months, "lazada").revenue,
          tiktok: aggMonths(months, "tiktok").revenue,
          partial: false,
        };
      });
    }
    if (range.mode === "month") {
      const center = range.start.slice(0, 7);
      const months = [];
      for (let i = -6; i <= 5; i++) months.push(addMonth(center, i));
      return months.filter((ym) => monthlyMap[ym]).map((ym) => ({
        label: MONTH_VI(ym),
        shopee: monthlyMap[ym].plat.shopee.rev,
        lazada: monthlyMap[ym].plat.lazada.rev,
        tiktok: monthlyMap[ym].plat.tiktok.rev,
        partial: ym === DASH.latestMonth && periodMode(key) === "month",
      }));
    }
    if (range.mode === "day") {
      const from = addDays(range.end, -29);
      return dailySeriesRange(normalizeRange(from, range.end, "day"), "all").map((d) => ({
        label: fmtDateShort(d.date).slice(0, 5),
        shopee: d.shopee,
        lazada: d.lazada,
        tiktok: d.tiktok,
        partial: false,
      }));
    }
    const data = dailySeriesRange(range, "all");
    return data.map((d) => ({
      label: fmtDateShort(d.date).slice(0, 5),
      shopee: d.shopee,
      lazada: d.lazada,
      tiktok: d.tiktok,
      partial: false,
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
  // Color keys here MUST be raw CSS-var names ("--shopee") or hex —
  // charts.js col() only resolves keys that startsWith("--").
  // Previously "var(--shopee)" form fell through unparsed, so donut
  // slices for categories rendered with Chart.js's default palette.
  const CAT = {
    monte: { label: "Váng sữa Monte", color: "--shopee", i18n: "cat.monte" },
    yogurt: { label: "Sữa chua Montinis", color: "--lazada", i18n: "cat.yogurt" },
    freshcheese: { label: "Phô mai tươi", color: "#2A9D8F", i18n: "cat.freshcheese" },
    slices: { label: "Phô mai lát", color: "--tiktok", i18n: "cat.slices" },
    gift: { label: "Quà tặng (0đ)", color: "--ink-3", i18n: "cat.gift" },
    other: { label: "Khác", color: "--border-strong", i18n: "cat.other" },
  };
  const cleanName = (n) => (n || "").replace(/^\[.*?\]\s*/, "").replace(/\s*-\s*HÀNG TẶNG.*$/i, "").trim();

  function catLabel(cat) {
    const _t = (k, f) => (window.t ? window.t(k, f) : f || k);
    return _t(CAT[cat] && CAT[cat].i18n, CAT[cat] ? CAT[cat].label : cat);
  }

  function detailMonths(key) { return curMonths(key).filter((ym) => DASH.monthDetail[ym]); }

  function rangeDetailKey(key, platform) {
    return String(key) + "|" + String(platform || state.platform || "all");
  }

  function getRangeDetail(key, platform) {
    return rangeDetailCache[rangeDetailKey(key, platform)] || null;
  }
  async function ensureRangeDetail(key, platform) {
    const cacheKey = rangeDetailKey(key, platform);
    const activePlatform = platform || state.platform || "all";
    if (rangeDetailCache[cacheKey]) return rangeDetailCache[cacheKey];
    if (rangeDetailInflight[cacheKey]) return rangeDetailInflight[cacheKey];
    const range = rangeFromKey(key);
    const url = new URL("api/v2-range-detail.php", window.location.href);
    url.searchParams.set("date_from", range.start);
    url.searchParams.set("date_to", range.end);
    if (activePlatform && activePlatform !== "all") {
      url.searchParams.set("platform", activePlatform === "tiktok" ? "tiktokshop" : activePlatform);
    }
    rangeDetailInflight[cacheKey] = fetch(url.toString(), { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((data) => {
        rangeDetailCache[cacheKey] = data;
        delete rangeDetailInflight[cacheKey];
        return data;
      })
      .catch((err) => {
        delete rangeDetailInflight[cacheKey];
        throw err;
      });
    return rangeDetailInflight[cacheKey];
  }

  function products(key, metric, platform) {
    const activePlatform = platform || state.platform;
    const cached = getRangeDetail(key, activePlatform);
    if (cached && (cached.topRev || cached.topQty)) {
      const src = metric === "qty" ? (cached.topQty || []) : (cached.topRev || []);
      return src.map((p) => ({ ...p, cat: categoryOf(p.sku, p.name), cleanName: cleanName(p.name) }));
    }
    const months = detailMonths(key);
    const merged = {};
    months.forEach((ym) => {
      const list = DASH.monthDetail[ym][metric === "qty" ? "topQty" : "topRev"];
      list.forEach((p) => {
        if (activePlatform && activePlatform !== "all" && p.platform !== activePlatform) return;
        const e = merged[p.sku] || (merged[p.sku] = { sku: p.sku, name: p.name, qty: 0, revenue: 0, platform: p.platform });
        e.qty += p.qty; e.revenue += p.revenue;
      });
    });
    const arr = Object.values(merged).map((p) => ({ ...p, cat: categoryOf(p.sku, p.name), cleanName: cleanName(p.name) }));
    arr.sort((a, b) => (metric === "qty" ? b.qty - a.qty : b.revenue - a.revenue));
    return arr;
  }

  function categoryBreakdown(key, platform) {
    const arr = products(key, "rev", platform);
    const map = {};
    arr.forEach((p) => {
      const c = p.cat; const e = map[c] || (map[c] = { cat: c, ...CAT[c], revenue: 0, qty: 0, count: 0 });
      e.revenue += p.revenue; e.qty += p.qty; e.count++;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }

  function cityDistribution(key, platform) {
    const activePlatform = platform || state.platform;
    const cached = getRangeDetail(key, activePlatform);
    if (cached && Array.isArray(cached.city)) {
      const total = cached.city.reduce((t, r) => t + (r.orders || 0), 0);
      const top = cached.city.filter((r) => r.city !== "Khác").slice(0, 6);
      const known = top.reduce((t, r) => t + r.orders, 0);
      if (total - known > 0) top.push({ city: "Khác", orders: total - known, other: true, revenue: 0 });
      return top.map((r) => ({ ...r, pct: total ? r.orders / total * 100 : 0 }));
    }
    const months = detailMonths(key); const agg = {};
    months.forEach((ym) => DASH.monthDetail[ym].city.forEach((c) => (agg[c.city] = (agg[c.city] || 0) + c.orders)));
    const total = Object.values(agg).reduce((t, v) => t + v, 0);
    const rows = Object.entries(agg).map(([city, orders]) => ({ city, orders })).sort((a, b) => b.orders - a.orders);
    const top = rows.filter((r) => r.city !== "Khác").slice(0, 6);
    const known = top.reduce((t, r) => t + r.orders, 0);
    if (total - known > 0) top.push({ city: "Khác", orders: total - known, other: true });
    return top.map((r) => ({ ...r, pct: total ? r.orders / total * 100 : 0 }));
  }

  function heatMatrix(key, platform) {
    const activePlatform = platform || state.platform;
    const cached = getRangeDetail(key, activePlatform);
    if (cached && Array.isArray(cached.heat)) {
      const m = Array.from({ length: 7 }, () => Array(24).fill(0)); let max = 0;
      cached.heat.forEach((h) => { m[h.weekday][h.hour] += h.orders; if (m[h.weekday][h.hour] > max) max = m[h.weekday][h.hour]; });
      return { m, max };
    }
    const months = detailMonths(key);
    const m = Array.from({ length: 7 }, () => Array(24).fill(0)); let max = 0;
    months.forEach((ym) => DASH.monthDetail[ym].heat.forEach((h) => { m[h.weekday][h.hour] += h.orders; }));
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) if (m[d][h] > max) max = m[d][h];
    return { m, max };
  }

  function statusBreakdown(key, platform) {
    const activePlatform = platform || state.platform;
    const cached = getRangeDetail(key, activePlatform);
    if (cached && cached.status) return cached.status;
    const months = detailMonths(key); const st = { completed: 0, delivered: 0, cancelled: 0, pending: 0 };
    months.forEach((ym) => { const s = DASH.monthDetail[ym].status; Object.keys(st).forEach((k) => (st[k] += s[k] || 0)); });
    return st;
  }

  /* ---- customer data ---- */
  const customerCache = {};
  let customerInflight = null;

  function fetchCustomers() {
    const range = rangeFromKey(state.period);
    const cacheKey = state.period + "|" + state.platform;
    if (customerCache[cacheKey]) return Promise.resolve(customerCache[cacheKey]);
    if (customerInflight) return customerInflight;
    const url = new URL("api/customers.php", window.location.href);
    url.searchParams.set("date_from", range.start);
    url.searchParams.set("date_to", range.end);
    if (state.platform !== "all") url.searchParams.set("platform", state.platform === "tiktok" ? "tiktokshop" : state.platform);
    customerInflight = fetch(url.toString(), { credentials: "same-origin" })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((data) => { customerCache[cacheKey] = data; customerInflight = null; return data; })
      .catch((err) => { customerInflight = null; throw err; });
    return customerInflight;
  }

  function fetchCustomerDetail(buyerUsername) {
    const range = rangeFromKey(state.period);
    const url = new URL("api/customers.php", window.location.href);
    url.searchParams.set("action", "detail");
    url.searchParams.set("buyer_username", buyerUsername);
    url.searchParams.set("date_from", range.start);
    url.searchParams.set("date_to", range.end);
    if (state.platform !== "all") url.searchParams.set("platform", state.platform === "tiktok" ? "tiktokshop" : state.platform);
    return fetch(url.toString(), { credentials: "same-origin" })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }

  /* ---- traffic ---- */
  function trafficSeries(months, platform) {
    const set = new Set(months);
    return DASH.trafficDaily.filter((d) => set.has(d.date.slice(0, 7))).map((d) => {
      const get = (k) => (platform === "all" ? PKEYS.reduce((t, p) => t + ((d[p] && d[p][k]) || 0), 0) : (d[platform] ? d[platform][k] : 0));
      return { date: d.date, pv: get("pv"), visits: get("visits"), nf: get("nf") };
    });
  }
  function trafficSeriesRange(range, platform) {
    return (DASH.trafficDaily || []).filter((d) => d.date >= range.start && d.date <= range.end).map((d) => {
      const get = (k) => (platform === "all" ? PKEYS.reduce((t, p) => t + ((d[p] && d[p][k]) || 0), 0) : (d[platform] ? d[platform][k] : 0));
      return { date: d.date, pv: get("pv"), visits: get("visits"), nf: get("nf") };
    });
  }
  function trafficAggRange(range, platform) {
    const s = trafficSeriesRange(range, platform);
    const pv = s.reduce((t, d) => t + d.pv, 0), visits = s.reduce((t, d) => t + d.visits, 0), nf = s.reduce((t, d) => t + d.nf, 0);
    const ord = aggRange(range, platform);
    return { pv, visits, nf, orders: ord.orders, completed: ord.completed, conv: visits ? ord.completed / visits * 100 : 0 };
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
    period: saved.period || (DASH.latestMonth ? "m:" + DASH.latestMonth : "3m"),
    compare: saved.compare || "prev", // prev | yoy | none
    theme: saved.theme || "light",
    collapsed: saved.collapsed || false,
  };
  function save() { localStorage.setItem("zm_state_v3", JSON.stringify(state)); }

  window.Store = {
    DASH, PLAT, PKEYS, CAT, state, save, F,
    MONTH_VI, MONTH_VI_LONG, addMonth, parseDate, fmtDate, fmtDateShort, catLabel,
    curMonths, compareMonths, periodLabel, compareLabel, periodMode, rangeFromKey, compareRange, coercePeriod,
    aggMonths, aggRange, platformMetrics, dailySeries, dailySeriesRange, monthlyTrend, businessTrend,
    products, categoryBreakdown, cityDistribution, heatMatrix, statusBreakdown, categoryOf, ensureRangeDetail, getRangeDetail,
    trafficSeries, trafficSeriesRange, trafficAgg, trafficAggRange, trafficByPlatform,
    fetchCustomers, fetchCustomerDetail,
    cur: () => curMonths(state.period),
    cmp: () => compareMonths(state.period, state.compare),
    currentRange: () => rangeFromKey(state.period),
    compareCurrentRange: () => compareRange(state.period, state.compare),
  };
  window.F = F;
})();
