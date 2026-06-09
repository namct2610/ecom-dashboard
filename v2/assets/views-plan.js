/* ============================================================
   View: Plan (Kế hoạch) — year-level revenue & visits targets
   Reads/writes /api/plan.php (same backend as v1)
   ============================================================ */
(function () {
  const F = window.F, UI = window.UI, C = window.Charts, S = window.Store;

  // Module-local UI state
  const local = {
    year: new Date().getFullYear(),
    loading: false,
    data: null,
    error: null,
    saving: false,
  };

  const monthLabel = (ym) => "Th" + (+ym.split("-")[1]);

  function fmtMoney(n) { return F.money(n); }
  function fmtVisits(n) { return F.num(n); }

  function statusPill(s) {
    if (s === "on_track") return `<span class="status-pill st-done">Đúng kế hoạch</span>`;
    return `<span class="status-pill st-cancel">Chậm tiến độ</span>`;
  }

  function rateBar(ratePct, color) {
    const w = Math.max(0, Math.min(100, ratePct));
    return `<div class="cmp-track" style="height:8px;background:var(--track)"><div class="cmp-fill" style="width:${w}%;background:${color}"></div></div>`;
  }

  function planMetricCard(m, fmt, color) {
    const isOnTrack = m.status === "on_track";
    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">${m.label}</div>
            <div class="card-sub">Mục tiêu ${local.year} · Đã chạy ${local.data.elapsed_months}/12 tháng</div>
          </div>
          ${statusPill(m.status)}
        </div>
        <div class="card-pad">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
            <div>
              <div class="eyebrow">Thực tế YTD</div>
              <div class="kpi-value tnum" style="margin-top:4px">${fmt(m.actual)}</div>
              <div style="font-size:12.5px;color:var(--ink-3);font-weight:600;margin-top:2px">
                ${m.elapsed_months > 0 ? F.viDec(m.ytd_rate, 1) + "% so với mục tiêu YTD" : "Chưa có dữ liệu"}
              </div>
            </div>
            <div>
              <div class="eyebrow">Mục tiêu năm</div>
              <div class="kpi-value tnum" style="margin-top:4px">${fmt(m.target)}</div>
              <div style="font-size:12.5px;color:var(--ink-3);font-weight:600;margin-top:2px">
                ${m.target > 0 ? F.viDec(m.target_rate, 1) + "% đã đạt" : "Chưa đặt mục tiêu"}
              </div>
            </div>
          </div>

          <div style="margin-top:18px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span class="eyebrow">Tiến độ</span>
              <span style="font-size:12px;font-weight:700;color:${isOnTrack ? 'var(--pos)' : 'var(--neg)'}">
                ${m.target > 0 ? F.viDec(m.target_rate, 1) + "%" : "—"}
              </span>
            </div>
            ${rateBar(m.target_rate, color)}
          </div>

          <div style="margin-top:18px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;border-top:1px solid var(--border);padding-top:14px">
            <div>
              <div class="eyebrow">Mục tiêu YTD</div>
              <div class="mono" style="font-weight:800;font-size:14px;margin-top:3px">${fmt(m.target_ytd)}</div>
            </div>
            <div>
              <div class="eyebrow">Chênh YTD</div>
              <div class="mono" style="font-weight:800;font-size:14px;margin-top:3px;color:${m.gap_ytd >= 0 ? 'var(--pos)' : 'var(--neg)'}">
                ${m.gap_ytd >= 0 ? "+" : ""}${fmt(m.gap_ytd)}
              </div>
            </div>
            <div>
              <div class="eyebrow">Còn phải đạt</div>
              <div class="mono" style="font-weight:800;font-size:14px;margin-top:3px">${fmt(m.ytg)}</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function chartCard(title, canvasId) {
    return `<div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">${title}</div>
          <div class="card-sub">12 tháng năm ${local.year} · cột = thực tế · đường = mục tiêu (mục tiêu năm ÷ 12)</div>
        </div>
      </div>
      <div class="card-pad">
        <div class="chart-wrap" style="height:240px"><canvas id="${canvasId}"></canvas></div>
      </div>
    </div>`;
  }

  function modalSetTargets(rev, vis) {
    return `
      <div id="planModalBackdrop" style="position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(4px);z-index:100;display:grid;place-items:center;padding:20px">
        <div class="card" style="max-width:440px;width:100%;padding:22px;box-shadow:var(--shadow-lg)">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
            <div>
              <div class="card-title">Đặt mục tiêu năm ${local.year}</div>
              <div class="card-sub">Mục tiêu được chia đều 12 tháng để tính tiến độ.</div>
            </div>
            <button class="iconbtn-sq" id="planModalClose" aria-label="Đóng">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <div style="margin-top:18px">
            <label style="display:block;font-size:12.5px;font-weight:700;color:var(--ink-2);margin-bottom:6px">Doanh số mục tiêu (VND)</label>
            <input type="text" id="planRevTarget" class="plan-input" inputmode="numeric"
                   value="${(rev || 0).toLocaleString('vi-VN')}" />
          </div>

          <div style="margin-top:14px">
            <label style="display:block;font-size:12.5px;font-weight:700;color:var(--ink-2);margin-bottom:6px">Lượt truy cập mục tiêu</label>
            <input type="text" id="planVisitsTarget" class="plan-input" inputmode="numeric"
                   value="${(vis || 0).toLocaleString('vi-VN')}" />
          </div>

          <div style="margin-top:22px;display:flex;justify-content:flex-end;gap:10px">
            <button class="ctrl-btn" id="planCancelBtn">Huỷ</button>
            <button class="ctrl-btn on" id="planSaveBtn" style="background:var(--brand);border-color:var(--brand);color:#fff">Lưu mục tiêu</button>
          </div>
        </div>
      </div>`;
  }

  function loadingCard(msg) {
    return `<div class="card card-pad" style="text-align:center;color:var(--ink-3);font-weight:600">${msg || "Đang tải..."}</div>`;
  }

  function errorCard(msg) {
    return `<div class="card card-pad" style="text-align:center;color:var(--neg);font-weight:700">${msg}</div>`;
  }

  /* ---------- header toolbar (year picker + set targets button) ---------- */
  // The router stuffs the rendered HTML into #controls; for Plan we replace the
  // default platform/period/compare segment with year + set-target controls.
  function renderToolbar() {
    return `
      <button class="period" id="planYearBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        <span class="ptxt">Năm ${local.year}</span>
        <span class="pcaret">▾</span>
      </button>
      <button class="ctrl-btn on" id="planSetTargetBtn" style="background:var(--brand);border-color:var(--brand);color:#fff">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        Đặt mục tiêu
      </button>`;
  }

  /* ---------- main render ---------- */
  function render() {
    if (local.loading || !local.data) {
      return loadingCard("Đang tải kế hoạch năm " + local.year + "...");
    }
    if (local.error) {
      return errorCard("Không tải được kế hoạch: " + local.error);
    }

    const d = local.data;
    const revMetric = d.metrics.find((m) => m.key === "revenue");
    const visMetric = d.metrics.find((m) => m.key === "visits");

    return `
      <div class="g12" style="grid-template-columns:repeat(12,1fr);gap:16px">
        <div style="grid-column:span 6" data-collapse>${planMetricCard(revMetric, fmtMoney, "var(--shopee)")}</div>
        <div style="grid-column:span 6" data-collapse>${planMetricCard(visMetric, fmtVisits, "var(--lazada)")}</div>

        <div style="grid-column:span 6" data-collapse>${chartCard("Doanh số theo tháng", "planRevChart")}</div>
        <div style="grid-column:span 6" data-collapse>${chartCard("Lượt truy cập theo tháng", "planVisitsChart")}</div>
      </div>
    `;
  }

  function renderInToolbar() {
    const controls = document.getElementById("controls");
    if (controls) controls.innerHTML = renderToolbar();

    document.getElementById("planYearBtn")?.addEventListener("click", openYearPicker);
    document.getElementById("planSetTargetBtn")?.addEventListener("click", openTargetModal);
  }

  /* ---------- year picker (popover) ---------- */
  let openPop = null;
  function closePop() { if (openPop) { openPop.remove(); openPop = null; document.removeEventListener("click", outsidePop, true); } }
  function outsidePop(e) { if (openPop && !openPop.contains(e.target)) closePop(); }
  function openYearPicker(e) {
    e.stopPropagation();
    closePop();
    const thisYear = new Date().getFullYear();
    const years = [];
    for (let y = thisYear + 1; y >= thisYear - 4; y--) years.push(y);

    const m = document.createElement("div"); m.className = "menu";
    m.innerHTML = `<div class="menu-label">Chọn năm kế hoạch</div>` +
      years.map((y) => `<div class="menu-item ${y === local.year ? "sel" : ""}" data-y="${y}">Năm ${y}</div>`).join("");
    document.body.appendChild(m);
    const r = e.currentTarget.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + "px";
    m.style.left = Math.min(r.left, window.innerWidth - m.offsetWidth - 12) + "px";
    m.querySelectorAll(".menu-item").forEach((el) => el.addEventListener("click", () => {
      local.year = +el.dataset.y;
      closePop();
      fetchData().then(() => window.App.rerender());
    }));
    openPop = m;
    setTimeout(() => document.addEventListener("click", outsidePop, true), 0);
  }

  /* ---------- target modal ---------- */
  function openTargetModal() {
    if (!local.data) return;
    const rev = local.data.targets.revenue;
    const vis = local.data.targets.visits;
    const wrap = document.createElement("div");
    wrap.innerHTML = modalSetTargets(rev, vis);
    document.body.appendChild(wrap.firstElementChild);

    const closeBtn = document.getElementById("planModalClose");
    const cancelBtn = document.getElementById("planCancelBtn");
    const saveBtn = document.getElementById("planSaveBtn");
    const backdrop = document.getElementById("planModalBackdrop");
    const revIn = document.getElementById("planRevTarget");
    const visIn = document.getElementById("planVisitsTarget");

    const cleanup = () => backdrop?.remove();

    // re-format on blur, allow free typing while focused
    [revIn, visIn].forEach((input) => {
      input.addEventListener("blur", () => {
        const n = +String(input.value).replace(/[^\d]/g, "") || 0;
        input.value = n.toLocaleString("vi-VN");
      });
    });

    closeBtn?.addEventListener("click", cleanup);
    cancelBtn?.addEventListener("click", cleanup);
    backdrop?.addEventListener("click", (e) => { if (e.target === backdrop) cleanup(); });
    saveBtn?.addEventListener("click", async () => {
      if (local.saving) return;
      local.saving = true;
      saveBtn.textContent = "Đang lưu...";
      try {
        const revenue_target = +String(revIn.value).replace(/[^\d]/g, "") || 0;
        const visits_target  = +String(visIn.value).replace(/[^\d]/g, "") || 0;
        const csrf = await ensureCsrf();
        const res = await fetch("../api/plan.php", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify({ year: local.year, revenue_target, visits_target }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = await res.json();
        if (!j.success) throw new Error(j.error || "Lưu không thành công");
        cleanup();
        await fetchData();
        window.App.rerender();
      } catch (err) {
        saveBtn.textContent = "Lưu mục tiêu";
        alert("Lỗi: " + (err.message || err));
      } finally {
        local.saving = false;
      }
    });
  }

  /* ---------- CSRF (lazy, cached) ---------- */
  let csrfCache = null;
  async function ensureCsrf() {
    if (csrfCache) return csrfCache;
    try {
      const r = await fetch("../api/auth.php?action=status", { credentials: "same-origin" });
      const j = await r.json();
      csrfCache = j.csrf_token || j.csrf || "";
    } catch (_) { csrfCache = ""; }
    return csrfCache;
  }

  /* ---------- data ---------- */
  async function fetchData() {
    local.loading = true;
    local.error = null;
    try {
      const r = await fetch("../api/plan.php?year=" + local.year, { credentials: "same-origin" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Phản hồi không hợp lệ");
      local.data = j;
    } catch (e) {
      local.error = e.message || String(e);
      local.data = null;
    } finally {
      local.loading = false;
    }
  }

  /* ---------- mount: render charts after DOM is in place ---------- */
  function mount(root) {
    renderInToolbar();
    if (local.loading || local.error || !local.data) {
      // first time entering the page: trigger fetch + re-render
      if (!local.data && !local.loading && !local.error) {
        fetchData().then(() => window.App.rerender());
      }
      return;
    }
    const labels = local.data.monthly.map((m) => monthLabel(m.month));

    const comboCfg = (actualData, targetData, color, fmt, fullFmt) => ({
      data: {
        labels,
        datasets: [
          { type: "bar", label: "Thực tế", data: actualData,
            backgroundColor: color, borderRadius: 6, maxBarThickness: 26 },
          { type: "line", label: "Mục tiêu", data: targetData,
            borderColor: C.col("--ink"), backgroundColor: "transparent", borderWidth: 2, tension: 0,
            pointRadius: 0, pointHoverRadius: 4, borderDash: [4, 4] },
        ],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { color: C.col("--ink-3"), font: { size: 10.5 } }, border: { display: false } },
          y: { beginAtZero: true, grid: { color: C.col("--grid"), drawTicks: false },
               ticks: { color: C.col("--ink-3"), font: { size: 11 }, callback: (v) => fmt(v) },
               border: { display: false } },
        },
        plugins: {
          legend: { display: true, position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, color: C.col("--ink-2") } },
          tooltip: {
            backgroundColor: C.col("--invert-bg"), titleColor: C.col("--invert-fg"), bodyColor: C.col("--invert-fg"),
            padding: 11, cornerRadius: 9,
            callbacks: { label: (c) => " " + c.dataset.label + ": " + fullFmt(c.raw) }
          },
        },
      },
    });

    const revChart = document.getElementById("planRevChart");
    if (revChart) {
      C.mk(revChart, comboCfg(
        local.data.monthly.map((m) => m.revenue),
        local.data.monthly.map((m) => m.revenue_target),
        "rgba(226,0,26,0.85)", F.money, F.moneyFull
      ));
    }

    const visChart = document.getElementById("planVisitsChart");
    if (visChart) {
      C.mk(visChart, comboCfg(
        local.data.monthly.map((m) => m.visits),
        local.data.monthly.map((m) => m.visits_target),
        "rgba(31,95,174,0.85)", F.num, F.viInt
      ));
    }
  }

  window.Views.plan = {
    title: "Kế hoạch",
    eyebrow: "Mục tiêu năm & tiến độ",
    customToolbar: true,
    render,
    mount,
  };
})();
