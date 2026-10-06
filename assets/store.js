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

  /* ---- formatters (locale-aware) ---- */
  const isEn = () => !!(window.I18n && window.I18n.getLang() === 'en');
  const fmtLabel = (key, fallback) => (window.t ? window.t(key, fallback) : fallback);
  const viInt = (n) => Math.round(n || 0).toLocaleString(isEn() ? "en-US" : "vi-VN");
  const viDec = (n, d = 1) => (n || 0).toLocaleString(isEn() ? "en-US" : "vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
  function money(n) {
    n = n || 0; const a = Math.abs(n);
    if (a >= 1e9) return viDec(n / 1e9, 2) + fmtLabel("fmt.billion", isEn() ? "B" : "Tỷ");
    if (a >= 1e6) return viDec(n / 1e6, 1) + fmtLabel("fmt.million", isEn() ? "M" : "Tr");
    if (a >= 1e3) return Math.round(n / 1e3).toLocaleString(isEn() ? "en-US" : "vi-VN") + fmtLabel("fmt.thousand", "K");
    return viInt(n);
  }
  const moneyFull = (n) => viInt(n) + fmtLabel("fmt.currency", "₫");
  function num(n) {
    n = n || 0;
    if (Math.abs(n) >= 1e6) return viDec(n / 1e6, 1) + fmtLabel("fmt.million", isEn() ? "M" : "Tr");
    if (Math.abs(n) >= 10000) return viDec(n / 1e3, 1) + fmtLabel("fmt.thousand", "K");
    return viInt(n);
  }
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

  function appBaseHref() {
    const url = new URL(window.location.href);
    let path = url.pathname || "/";
    if (!path.endsWith("/")) {
      const last = path.slice(path.lastIndexOf("/") + 1);
      path = last.includes(".") ? path.slice(0, path.lastIndexOf("/") + 1) : path + "/";
    }
    return url.origin + path;
  }

  function buildApiUrl(path) {
    return new URL(String(path || "").replace(/^\/+/, ""), appBaseHref());
  }

  // Shared guard for live API calls. index.html bounces to the login page at
  // startup when the session is missing, but a session that expires AFTER the
  // app loaded only shows up on the next live call (the Customers tab fetches
  // fresh every visit, so it is usually the first to hit it). Treat a 401 the
  // same way startup does — send the user to log in again — instead of letting a
  // raw "HTTP 401" land in the view.
  let authRedirecting = false;
  function checkApiResponse(r) {
    if (r.status === 401) {
      if (!authRedirecting) {
        authRedirecting = true;
        window.location.replace(buildApiUrl("login.html").toString());
      }
      throw new Error("HTTP 401");
    }
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r;
  }

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
    // All-time has nothing meaningful to compare against — there is no earlier
    // period left. Refuse here rather than in each view, so no caller can render
    // a delta chip against a half-empty range.
    if (mode === "none" || key === "all") return null;
    const cur = rangeFromKey(key);
    if (mode === "yoy") {
      const cmpStart = shiftDateYear(cur.start, -1);
      const cmpEnd = shiftDateYear(cur.end, -1);
      const dates = allDates();
      const latestDate = dates[dates.length - 1] || cmpEnd;
      const latestDateLastYear = shiftDateYear(latestDate, -1);
      const cappedEnd = cmpEnd > latestDateLastYear ? latestDateLastYear : cmpEnd;
      return normalizeRange(cmpStart, cappedEnd, cur.mode);
    }
    const span = diffDays(cur.start, cur.end) + 1;
    return shiftRange(cur, -span);
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
    if (mode === "none" || key === "all") return "";
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

  function mondayOf(dateStr) {
    const d = parseDate(dateStr);
    const dow = (d.getDay() + 6) % 7; // 0 = Monday
    return addDays(dateStr, -dow);
  }

  /* ---- period series ----
     Buckets that cover EXACTLY the selected range, so a chart's total is the
     same number the KPI cards show. Days after the newest data are left out
     rather than drawn as empty bars. A bucket that runs past either edge (the
     first and last week of a month, the week still in progress) is marked
     partial and drawn dimmed. */
  const BUCKET_OF = { day: (d) => d, week: mondayOf, month: (d) => d.slice(0, 7), year: (d) => d.slice(0, 4) };
  function bucketSpan(k, grain) {
    if (grain === "day") return [k, k];
    if (grain === "week") return [k, addDays(k, 6)];
    if (grain === "month") return [monthStart(k), monthEnd(k)];
    return [yearStart(k), yearEnd(k)];
  }
  function bucketLabel(k, grain) {
    if (grain === "day" || grain === "week") return fmtDateShort(k).slice(0, 5);
    if (grain === "month") return MONTH_VI(k);
    return _TF("period.year_short", { y: k });
  }
  function bucketFull(k, grain) {
    if (grain === "day") return _TF("period.day_n", { date: fmtDateShort(k) });
    if (grain === "week") return _TF("period.week_n", { start: fmtDateShort(k), end: fmtDateShort(addDays(k, 6)) });
    if (grain === "month") return MONTH_VI_LONG(k);
    return _TF("period.year_n", { y: k });
  }
  const zero3 = () => ({ shopee: 0, lazada: 0, tiktok: 0 });
  function periodSeries(key, grain) {
    const range = rangeFromKey(key);
    const dates = allDates();
    const last = dates[dates.length - 1] || range.end;
    const end = range.end < last ? range.end : last;
    const map = new Map();
    for (let d = range.start; d <= end; d = addDays(d, 1)) {
      const k = BUCKET_OF[grain](d);
      let b = map.get(k);
      if (!b) {
        const [s, e] = bucketSpan(k, grain);
        b = { k, label: bucketLabel(k, grain), full: bucketFull(k, grain), partial: s < range.start || e > end,
              rev: zero3(), ord: zero3(), done: zero3(), canc: zero3() };
        map.set(k, b);
      }
      const day = dailyMap[d];
      if (!day) continue;
      [["shopee", day.s], ["lazada", day.l], ["tiktok", day.t]].forEach(([p, r]) => {
        b.rev[p] += r[0] || 0; b.ord[p] += r[1] || 0; b.done[p] += r[2] || 0; b.canc[p] += r[3] || 0;
      });
    }
    return [...map.values()];
  }
  // Grains worth offering for a period: at least two bars, and few enough that
  // each bar is still visible. A single day falls back to one bar.
  const GRAIN_LIMIT = [["day", 62], ["week", 26], ["month", 36], ["year", Infinity]];
  function grainCounts(key) {
    const range = rangeFromKey(key);
    const sets = { day: new Set(), week: new Set(), month: new Set(), year: new Set() };
    for (let d = range.start; d <= range.end; d = addDays(d, 1)) Object.keys(sets).forEach((g) => sets[g].add(BUCKET_OF[g](d)));
    const n = {}; Object.keys(sets).forEach((g) => { n[g] = sets[g].size; });
    return n;
  }
  function grainOptions(key) {
    const n = grainCounts(key);
    const opts = ["day", "week", "month", "year"].filter((g) => n[g] >= 2 && n[g] <= 400);
    return opts.length ? opts : ["day"];
  }
  function defaultGrain(key) {
    const n = grainCounts(key), opts = grainOptions(key);
    const hit = GRAIN_LIMIT.find(([g, lim]) => opts.includes(g) && n[g] <= lim);
    return hit ? hit[0] : opts[0];
  }

  // Twelve months ending at the selected period's last month — the platform
  // page's small multiples. Traffic comes from trafficMonthly, orders from monthly.
  const trafficMonthMap = {}; (DASH.trafficMonthly || []).forEach((m) => { trafficMonthMap[m.ym] = m; });
  function last12Months(key) {
    let endYm = rangeFromKey(key).end.slice(0, 7);
    if (DASH.latestMonth && endYm > DASH.latestMonth) endYm = DASH.latestMonth;
    return Array.from({ length: 12 }, (_, i) => addMonth(endYm, i - 11)).map((ym) => {
      const m = monthlyMap[ym], tm = trafficMonthMap[ym];
      const row = { ym, label: MONTH_VI(ym), rev: zero3(), done: zero3(), visits: zero3() };
      PKEYS.forEach((p) => {
        if (m) { row.rev[p] = m.plat[p].rev || 0; row.done[p] = m.plat[p].done || 0; }
        if (tm && tm[p]) row.visits[p] = tm[p].visits || 0;
      });
      return row;
    });
  }

  /* ---- products (merge across focus months if needed) ---- */
  function categoryOf(sku, name) {
    const s = (sku || "").toUpperCase(); const n = (name || "").toLowerCase();
    if (s.startsWith("GIFT") || n.includes("hàng tặng") || n.includes("free gift")) return "gift";
    if (s.startsWith("MNS") || n.includes("sữa chua")) return "yogurt";
    if (s.startsWith("MNF") || s.startsWith("MTG") || n.includes("phô mai tươi")) return "freshcheese";
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
    const url = buildApiUrl("api/v2-range-detail.php");
    url.searchParams.set("date_from", range.start);
    url.searchParams.set("date_to", range.end);
    if (activePlatform && activePlatform !== "all") {
      url.searchParams.set("platform", activePlatform === "tiktok" ? "tiktokshop" : activePlatform);
    }
    rangeDetailInflight[cacheKey] = fetch(url.toString(), { credentials: "same-origin" })
      .then(checkApiResponse)
      .then((r) => r.json())
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

  function products(key, metric, platform, grouping, splitPlatforms = false) {
    const activePlatform = platform || state.platform;
    const field = (metric === "qty" ? "topQty" : "topRev") + (grouping === "combo" ? "Combo" : "");
    const cached = getRangeDetail(key, activePlatform);
    const hasCachedRows = cached && Array.isArray(cached[field]);
    const rows = hasCachedRows ? cached[field] : [];
    const mergePlatforms = activePlatform === "all" && !splitPlatforms;
    const merged = {};
    const addRows = (list) => list.forEach((p) => {
      if (activePlatform && activePlatform !== "all" && p.platform !== activePlatform) return;
      const bucket = mergePlatforms ? p.sku : p.sku + "\u0000" + p.platform;
      const e = merged[bucket] || (merged[bucket] = {
        sku: p.sku,
        name: p.name,
        qty: 0,
        revenue: 0,
        platform: mergePlatforms ? "all" : p.platform,
      });
      e.qty += Number(p.qty) || 0;
      e.revenue += Number(p.revenue) || 0;
    });

    if (hasCachedRows) addRows(rows);
    else detailMonths(key).forEach((ym) => addRows(DASH.monthDetail[ym][field] || []));

    const arr = Object.values(merged).map((p) => ({ ...p, cat: categoryOf(p.sku, p.name), cleanName: cleanName(p.name) }));
    arr.sort((a, b) => (metric === "qty" ? b.qty - a.qty : b.revenue - a.revenue));
    return arr;
  }

  function categoryBreakdown(key, platform, grouping) {
    const arr = products(key, "rev", platform, grouping);
    const map = {};
    arr.forEach((p) => {
      const c = p.cat; const e = map[c] || (map[c] = { cat: c, ...CAT[c], revenue: 0, qty: 0, count: 0 });
      e.revenue += p.revenue; e.qty += p.qty; e.count++;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
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

  /* ---- customer data ---- */
  const customerCache = {};
  const customerInflight = {};

  function fetchCustomers() {
    const range = rangeFromKey(state.period);
    const cacheKey = state.period + "|" + state.platform;
    if (customerCache[cacheKey]) return Promise.resolve(customerCache[cacheKey]);
    if (customerInflight[cacheKey]) return customerInflight[cacheKey];
    const url = buildApiUrl("api/customers.php");
    url.searchParams.set("date_from", range.start);
    url.searchParams.set("date_to", range.end);
    if (state.platform !== "all") url.searchParams.set("platform", state.platform === "tiktok" ? "tiktokshop" : state.platform);
    customerInflight[cacheKey] = fetch(url.toString(), { credentials: "same-origin" })
      .then(checkApiResponse).then((r) => r.json())
      .then((data) => { customerCache[cacheKey] = data; delete customerInflight[cacheKey]; return data; })
      .catch((err) => { delete customerInflight[cacheKey]; throw err; });
    return customerInflight[cacheKey];
  }

  // API phụ cho từng thẻ (phân tích huỷ đơn, giữ chân khách...). Cache theo
  // kỳ + sàn như fetchCustomers; get() chỉ đọc cache để render đồng bộ, còn
  // fetch() mới gọi mạng — view gọi nó trong mount rồi vẽ lại khi có dữ liệu.
  function cachedApi(path) {
    const cache = {};
    const inflight = {};
    return {
      get(period, platform) { return cache[period + "|" + platform] || null; },
      fetch() {
        const range = rangeFromKey(state.period);
        const cacheKey = state.period + "|" + state.platform;
        if (cache[cacheKey]) return Promise.resolve(cache[cacheKey]);
        if (inflight[cacheKey]) return inflight[cacheKey];
        const url = buildApiUrl(path);
        url.searchParams.set("date_from", range.start);
        url.searchParams.set("date_to", range.end);
        if (state.platform !== "all") url.searchParams.set("platform", state.platform === "tiktok" ? "tiktokshop" : state.platform);
        inflight[cacheKey] = fetch(url.toString(), { credentials: "same-origin" })
          .then(checkApiResponse).then((r) => r.json())
          .then((data) => { cache[cacheKey] = data; delete inflight[cacheKey]; return data; })
          .catch((err) => { delete inflight[cacheKey]; throw err; });
        return inflight[cacheKey];
      },
    };
  }
  const cancelApi = cachedApi("api/cancellations.php");
  const retentionApi = cachedApi("api/retention.php");
  const skuProfitApi = cachedApi("api/costs.php?view=sku");
  const skuProfitSingleApi = cachedApi("api/costs.php?view=sku&group=single");

  function fetchCustomerDetail(buyerUsername) {
    const range = rangeFromKey(state.period);
    const url = buildApiUrl("api/customers.php");
    url.searchParams.set("action", "detail");
    url.searchParams.set("buyer_username", buyerUsername);
    url.searchParams.set("date_from", range.start);
    url.searchParams.set("date_to", range.end);
    if (state.platform !== "all") url.searchParams.set("platform", state.platform === "tiktok" ? "tiktokshop" : state.platform);
    return fetch(url.toString(), { credentials: "same-origin" })
      .then(checkApiResponse).then((r) => r.json());
  }

  /* ---- traffic ---- */
  function trafficSeriesRange(range, platform) {
    return (DASH.trafficDaily || []).filter((d) => d.date >= range.start && d.date <= range.end).map((d) => {
      const get = (k) => (platform === "all" ? PKEYS.reduce((t, p) => t + ((d[p] && d[p][k]) || 0), 0) : (d[platform] ? d[platform][k] : 0));
      return { date: d.date, pv: get("pv"), visits: get("visits"), nf: get("nf"), nv: get("nv") };
    });
  }
  function trafficAggRange(range, platform) {
    const s = trafficSeriesRange(range, platform);
    const pv = s.reduce((t, d) => t + d.pv, 0), visits = s.reduce((t, d) => t + d.visits, 0), nf = s.reduce((t, d) => t + d.nf, 0);
    const nv = s.reduce((t, d) => t + d.nv, 0);
    const ord = aggRange(range, platform);
    return { pv, visits, nf, nv, orders: ord.orders, completed: ord.completed, conv: visits ? ord.completed / visits * 100 : 0 };
  }
  /* ---- state ---- */
  const saved = JSON.parse(localStorage.getItem("zm_state_v3") || "{}");
  // 3.6.0 merged "compare" and "traffic" into one "platforms" page.
  const MOVED = { compare: "platforms", traffic: "platforms" };
  const state = {
    page: MOVED[saved.page] || saved.page || "overview",
    platform: saved.platform || "all",
    period: saved.period || (DASH.latestMonth ? "m:" + DASH.latestMonth : "3m"),
    compare: saved.compare || "prev", // prev | yoy | none
    theme: saved.theme || "light",
    collapsed: saved.collapsed || false,
  };
  function save() { localStorage.setItem("zm_state_v3", JSON.stringify(state)); }

  window.Store = {
    _customerCache: customerCache,
    DASH, PLAT, PKEYS, CAT, state, save, F,
    MONTH_VI, MONTH_VI_LONG, addMonth, parseDate, fmtDate, fmtDateShort, catLabel,
    curMonths, periodLabel, compareLabel, periodMode, rangeFromKey, compareRange, aggRange,
    periodSeries, grainOptions, defaultGrain, last12Months, MOVED,
    products, categoryBreakdown, heatMatrix, categoryOf, ensureRangeDetail, getRangeDetail,
    trafficSeriesRange, trafficAggRange,
    fetchCustomers, fetchCustomerDetail,
    getCancellations: cancelApi.get, fetchCancellations: cancelApi.fetch,
    getRetention: retentionApi.get, fetchRetention: retentionApi.fetch,
    getSkuProfit: skuProfitApi.get, fetchSkuProfit: skuProfitApi.fetch,
    getSkuProfitSingle: skuProfitSingleApi.get, fetchSkuProfitSingle: skuProfitSingleApi.fetch,
    currentRange: () => rangeFromKey(state.period),
    compareCurrentRange: () => compareRange(state.period, state.compare),
  };
  window.F = F;
})();
