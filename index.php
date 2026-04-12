<?php
require_once __DIR__ . '/includes/bootstrap.php';

start_session();

// Generate CSRF token
$csrf = generate_csrf();

// Detect current user initials for avatar
$user = $_SESSION['username'] ?? 'A';
$initials = strtoupper(substr($user, 0, 2));
?>
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard v3 — Quản lý kinh doanh</title>
  <meta name="csrf-token" content="<?= htmlspecialchars($csrf) ?>">

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

  <!-- CSS -->
  <link rel="stylesheet" href="assets/css/variables.css">
  <link rel="stylesheet" href="assets/css/base.css">
  <link rel="stylesheet" href="assets/css/layout.css">
  <link rel="stylesheet" href="assets/css/components.css">
  <link rel="stylesheet" href="assets/css/charts.css">
  <link rel="stylesheet" href="assets/css/upload.css">

  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>

<!-- ── Auth Overlay ──────────────────────────────────────────────────────── -->
<div id="auth-screen" class="hidden">
  <div class="login-box">
    <div class="login-logo">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
        <path stroke="currentColor" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
      </svg>
    </div>
    <div class="login-title">Dashboard v3</div>
    <div class="login-sub">Đăng nhập để tiếp tục</div>
    <form id="loginForm" autocomplete="off">
      <div class="login-field">
        <label class="login-label" for="loginUsername">Tên đăng nhập</label>
        <input id="loginUsername" class="login-input" type="text" placeholder="admin" autocomplete="username" required>
      </div>
      <div class="login-field">
        <label class="login-label" for="loginPassword">Mật khẩu</label>
        <input id="loginPassword" class="login-input" type="password" placeholder="••••••••" autocomplete="current-password" required>
      </div>
      <button id="loginBtn" type="submit" class="login-btn">Đăng nhập</button>
      <div id="loginError" class="login-error"></div>
    </form>
  </div>
</div>

<!-- ── Toast Container ───────────────────────────────────────────────────── -->
<div id="toast-container"></div>

<!-- ── App Shell ─────────────────────────────────────────────────────────── -->
<div id="app">

  <!-- Sidebar -->
  <nav id="sidebar">
    <div class="sidebar-brand">
      <div class="sidebar-brand-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
          <path stroke="currentColor" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
        </svg>
      </div>
      <div>
        <div class="sidebar-brand-name">Dashboard v3</div>
        <div class="sidebar-brand-sub">Shopee · Lazada · TikTok</div>
      </div>
    </div>

    <div class="sidebar-nav">
      <div class="nav-item active" data-page="overview">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        Tổng quan
      </div>
      <div class="nav-item" data-page="orders">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        Đơn hàng
      </div>
      <div class="nav-item" data-page="products">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        Sản phẩm
      </div>
      <div class="nav-item" data-page="customers">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        Khách hàng
      </div>
      <div class="nav-item" data-page="traffic">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
        Traffic
      </div>
      <div class="nav-item" data-page="comparison">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
        So sánh
      </div>
      <div class="nav-item" data-page="heatmaps">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="4" height="4" rx="1"/><rect x="10" y="3" width="4" height="4" rx="1"/><rect x="17" y="3" width="4" height="4" rx="1"/><rect x="3" y="10" width="4" height="4" rx="1"/><rect x="10" y="10" width="4" height="4" rx="1"/><rect x="17" y="10" width="4" height="4" rx="1"/><rect x="3" y="17" width="4" height="4" rx="1"/><rect x="10" y="17" width="4" height="4" rx="1"/><rect x="17" y="17" width="4" height="4" rx="1"/></svg>
        Phân tích
      </div>
      <div class="nav-item" data-page="upload">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
        Upload
      </div>
      <div class="nav-item" data-page="connect">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        Kết nối API
      </div>
      <div class="nav-item" data-page="logs">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        Nhật ký
      </div>
      <div class="nav-item" data-page="settings" style="position:relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        Cài đặt
        <span id="updateNavBadge" style="display:none;position:absolute;top:6px;right:8px;width:8px;height:8px;border-radius:50%;background:#ef4444;box-shadow:0 0 0 2px var(--sidebar-bg,#1e293b)"></span>
      </div>
    </div>

    <div class="sidebar-footer">
      <button id="btnLogout" class="btn-logout">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        Đăng xuất
      </button>
    </div>
  </nav>

  <!-- Main -->
  <div id="main">

    <!-- Header -->
    <div id="header">
      <span class="header-title">Dashboard v3</span>

      <!-- Platform filter -->
      <div class="platform-filter">
        <button class="platform-btn active" data-platform="all">Tất cả</button>
        <button class="platform-btn" data-platform="shopee">Shopee</button>
        <button class="platform-btn" data-platform="lazada">Lazada</button>
        <button class="platform-btn" data-platform="tiktokshop">TikTok</button>
      </div>

      <div class="header-spacer"></div>

      <!-- Period picker -->
      <div class="period-picker" id="periodPicker">
        <div class="pp-modes">
          <button class="pp-mode active" data-mode="month">Tháng</button>
          <button class="pp-mode" data-mode="year">Năm</button>
        </div>
        <div class="pp-nav">
          <button class="pp-arrow" id="periodPrev">&#8249;</button>
          <button class="pp-label" id="periodLabelBtn">
            <span id="periodLabel">--</span>
            <span class="pp-caret">&#9660;</span>
          </button>
          <button class="pp-arrow" id="periodNext">&#8250;</button>
        </div>
        <div class="pp-panel" id="periodPanel">
          <div class="pp-presets">
            <button class="pp-preset pp-preset-range" data-preset="today">Hôm nay</button>
            <button class="pp-preset pp-preset-range" data-preset="yesterday">Hôm qua</button>
            <button class="pp-preset pp-preset-range" data-preset="7days">7 ngày</button>
            <button class="pp-preset pp-preset-range" data-preset="30days">30 ngày</button>
          </div>
          <div class="pp-presets pp-presets-period">
            <button class="pp-preset" data-preset="this-month">Tháng này</button>
            <button class="pp-preset" data-preset="last-month">Tháng trước</button>
            <button class="pp-preset" data-preset="this-year">Năm nay</button>
          </div>
          <div class="pp-grid-head">
            <button class="pp-gyear-arrow" id="periodGridPrev">&#8249;</button>
            <span id="periodGridYear">2026</span>
            <button class="pp-gyear-arrow" id="periodGridNext">&#8250;</button>
          </div>
          <div class="pp-grid" id="periodGrid"></div>
        </div>
      </div>

      <div class="header-avatar"><?= htmlspecialchars($initials) ?></div>
    </div>

    <!-- Content -->
    <div id="content">

      <!-- ── Overview ──────────────────────────────────────────────────── -->
      <div class="page active" id="page-overview">
        <div class="page-header">
          <h1>Tổng quan</h1>
          <p>Doanh thu, đơn hàng và traffic tổng hợp</p>
        </div>

        <!-- KPI Row -->
        <div class="grid-4 mb-4">
          <div class="kpi-card border-blue">
            <div class="kpi-label">Doanh thu
              <span class="kpi-icon blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              </span>
            </div>
            <div class="kpi-value" id="kpi-revenue">—</div>
            <div class="kpi-sub">Đã hoàn thành</div>
          </div>
          <div class="kpi-card border-green">
            <div class="kpi-label">Tổng đơn
              <span class="kpi-icon green">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
              </span>
            </div>
            <div class="kpi-value" id="kpi-orders">—</div>
            <div class="kpi-sub">Tất cả trạng thái</div>
          </div>
          <div class="kpi-card border-purple">
            <div class="kpi-label">Hoàn thành
              <span class="kpi-icon purple">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
            </div>
            <div class="kpi-value" id="kpi-completed">—</div>
            <div class="kpi-sub">Đã giao / hoàn thành</div>
          </div>
          <div class="kpi-card border-orange">
            <div class="kpi-label">Lượt xem
              <span class="kpi-icon orange">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </span>
            </div>
            <div class="kpi-value" id="kpi-views">—</div>
            <div class="kpi-sub">Truy cập: <span id="kpi-visitors">—</span> lượt</div>
          </div>
        </div>

        <!-- Revenue trend + platform donut -->
        <div class="grid-3-1">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3>Doanh thu theo thời gian</h3>
                <p>Phân theo sàn</p>
              </div>
            </div>
            <div class="chart-wrap" style="height:200px">
              <canvas id="chartRevenueTrend"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3>Thị phần doanh thu</h3>
              </div>
            </div>
            <div class="donut-wrap" style="height:160px">
              <canvas id="chartPlatformDonut"></canvas>
            </div>
            <div id="platformLegend" style="margin-top:12px"></div>
          </div>
        </div>

        <!-- Recent orders + top products -->
        <div class="grid-2">
          <div class="card">
            <div class="card-title">Đơn hàng gần đây</div>
            <div id="recentOrdersMini"></div>
          </div>
          <div class="card">
            <div class="card-title">Top sản phẩm</div>
            <div id="topProductsOverview"></div>
          </div>
        </div>
      </div>

      <!-- ── Orders ────────────────────────────────────────────────────── -->
      <div class="page" id="page-orders">
        <div class="page-header">
          <h1>Đơn hàng</h1>
          <p>Chi tiết đơn hàng theo thời gian và trạng thái</p>
        </div>

        <!-- KPIs -->
        <div class="grid-4 mb-4">
          <div class="kpi-card border-blue">
            <div class="kpi-label">Tổng đơn</div>
            <div class="kpi-value" id="ord-total">—</div>
          </div>
          <div class="kpi-card border-green">
            <div class="kpi-label">Hoàn thành</div>
            <div class="kpi-value" id="ord-completed">—</div>
          </div>
          <div class="kpi-card border-red">
            <div class="kpi-label">Đã huỷ</div>
            <div class="kpi-value" id="ord-cancelled">—</div>
          </div>
          <div class="kpi-card border-orange">
            <div class="kpi-label">Tỷ lệ huỷ</div>
            <div class="kpi-value" id="ord-cancel-rate">—</div>
          </div>
        </div>

        <!-- Order trend + donut -->
        <div class="grid-3-1">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3>Xu hướng đơn hàng</h3>
                <p>Hoàn thành vs Huỷ</p>
              </div>
            </div>
            <div class="chart-wrap" style="height:200px">
              <canvas id="chartOrdersTrend"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3>Trạng thái đơn</h3>
              </div>
            </div>
            <div class="donut-wrap" style="height:160px">
              <canvas id="chartOrdersStatus"></canvas>
            </div>
            <div id="statusLegend" style="margin-top:10px"></div>
          </div>
        </div>

        <!-- Platform orders + hourly -->
        <div class="grid-2">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3>Đơn theo sàn</h3>
              </div>
            </div>
            <div class="chart-wrap" style="height:180px">
              <canvas id="chartPlatformOrders"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3>Đơn theo giờ trong ngày</h3>
              </div>
            </div>
            <div class="chart-wrap" style="height:180px">
              <canvas id="chartHourly"></canvas>
            </div>
          </div>
        </div>

        <!-- Orders table -->
        <div class="card">
          <div class="card-title">Danh sách đơn hàng</div>
          <div class="table-wrapper" style="margin-top:10px">
            <table>
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Sản phẩm</th>
                  <th>Sàn</th>
                  <th>Ngày đặt</th>
                  <th class="text-right">Giá trị</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody id="ordersTable"></tbody>
            </table>
          </div>
          <div id="ordersPager"></div>
        </div>
      </div>

      <!-- ── Products ──────────────────────────────────────────────────── -->
      <div class="page" id="page-products">
        <div class="page-header">
          <h1>Sản phẩm</h1>
          <p>Top sản phẩm theo số lượng và doanh thu</p>
        </div>

        <div class="grid-4 mb-4">
          <div class="kpi-card border-purple" style="grid-column:span 1">
            <div class="kpi-label">Tổng SKU</div>
            <div class="kpi-value" id="total-skus">—</div>
          </div>
        </div>

        <!-- Top qty + top revenue charts -->
        <div class="grid-2">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3>Top sản phẩm bán chạy</h3>
                <p>Theo số lượng</p>
              </div>
            </div>
            <div class="chart-wrap" style="height:260px">
              <canvas id="chartTopQty"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3>Top sản phẩm doanh thu cao</h3>
                <p>Theo doanh thu</p>
              </div>
            </div>
            <div class="chart-wrap" style="height:260px">
              <canvas id="chartTopRev"></canvas>
            </div>
          </div>
        </div>

        <!-- Mini bars + products table -->
        <div class="grid-3-1">
          <div class="card">
            <div class="card-title" style="margin-bottom:12px">Danh sách sản phẩm</div>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Tên sản phẩm</th>
                    <th>Sàn</th>
                    <th class="text-right">SL</th>
                    <th class="text-right">Doanh thu</th>
                  </tr>
                </thead>
                <tbody id="productsTable"></tbody>
              </table>
            </div>
            <div id="productsPager"></div>
          </div>
          <div class="card">
            <div class="card-title" style="margin-bottom:12px">Top 5 doanh thu</div>
            <div id="topRevMini"></div>
          </div>
        </div>
      </div>

      <!-- ── Customers ─────────────────────────────────────────────────── -->
      <div class="page" id="page-customers">
        <div class="page-header">
          <h1>Khách hàng</h1>
          <p>Phân tích khách hàng theo địa lý và phương thức thanh toán</p>
        </div>

        <div class="grid-4 mb-4">
          <div class="kpi-card border-blue">
            <div class="kpi-label">Tổng đơn</div>
            <div class="kpi-value" id="cust-total">—</div>
          </div>
          <div class="kpi-card border-green">
            <div class="kpi-label">AOV</div>
            <div class="kpi-value" id="cust-aov">—</div>
            <div class="kpi-sub">Giá trị trung bình/đơn</div>
          </div>
          <div class="kpi-card border-purple">
            <div class="kpi-label">Người mua</div>
            <div class="kpi-value" id="cust-buyers">—</div>
            <div class="kpi-sub">Người mua khác nhau</div>
          </div>
        </div>

        <div class="grid-2">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3>Phân bổ theo tỉnh / thành</h3>
                <p style="color:var(--pending);font-size:11px;margin-top:2px">* Dữ liệu Lazada đã được loại bỏ — Lazada ẩn thông tin địa chỉ</p>
              </div>
            </div>
            <div class="chart-wrap" style="height:300px">
              <canvas id="chartCities"></canvas>
            </div>
          </div>
          <div class="card">
            <div class="card-title" style="margin-bottom:12px">Top địa phương</div>
            <div id="cityList"></div>
            <div id="cityListPager"></div>
          </div>
        </div>

        <!-- District breakdown -->
        <div class="grid-2 mt-4">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3>Quận / Huyện — TP. Hồ Chí Minh</h3>
                <p>Shopee &amp; TikTok Shop</p>
              </div>
            </div>
            <div class="chart-wrap" style="height:320px">
              <canvas id="chartHcmDistricts"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3>Quận / Huyện — Hà Nội</h3>
                <p>Shopee &amp; TikTok Shop</p>
              </div>
            </div>
            <div class="chart-wrap" style="height:320px">
              <canvas id="chartHanoiDistricts"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Traffic ───────────────────────────────────────────────────── -->
      <div class="page" id="page-traffic">
        <div class="page-header">
          <h1>Traffic</h1>
          <p>Lượt xem, lượt truy cập và tỷ lệ chuyển đổi</p>
        </div>

        <div class="grid-4 mb-4">
          <div class="kpi-card border-blue">
            <div class="kpi-label">Lượt xem</div>
            <div class="kpi-value" id="tr-views">—</div>
          </div>
          <div class="kpi-card border-green">
            <div class="kpi-label">Lượt truy cập</div>
            <div class="kpi-value" id="tr-visits">—</div>
          </div>
          <div class="kpi-card border-orange">
            <div class="kpi-label">Tỷ lệ thoát TB</div>
            <div class="kpi-value" id="tr-bounce">—</div>
          </div>
        </div>

        <div class="mb-4">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3>Traffic theo thời gian</h3>
                <p>Lượt xem + đơn hàng tương quan</p>
              </div>
            </div>
            <div class="chart-wrap" style="height:220px">
              <canvas id="chartTrafficTrend"></canvas>
            </div>
          </div>
        </div>

        <div class="grid-2">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3>Traffic theo sàn</h3>
              </div>
            </div>
            <div class="chart-wrap" style="height:180px">
              <canvas id="chartTrafficPlatform"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Comparison ────────────────────────────────────────────────── -->
      <div class="page" id="page-comparison">
        <div class="page-header">
          <h1>So sánh sàn</h1>
          <p>Hiệu suất Shopee, Lazada và TikTok Shop</p>
        </div>

        <!-- Platform stat cards -->
        <div class="grid-3 mb-4">
          <?php foreach (['shopee','lazada','tiktokshop'] as $p): ?>
          <div class="platform-card <?= $p ?>" id="platform-card-<?= $p ?>">
            <div class="platform-card-header">
              <span class="badge badge-<?= $p ?>"><?= $p === 'tiktokshop' ? 'TikTok Shop' : ucfirst($p) ?></span>
            </div>
            <div class="platform-stat-row"><span class="platform-stat-label">Tổng đơn</span><span class="platform-stat-value pc-orders">—</span></div>
            <div class="platform-stat-row"><span class="platform-stat-label">Hoàn thành</span><span class="platform-stat-value pc-completed">—</span></div>
            <div class="platform-stat-row"><span class="platform-stat-label">Doanh thu</span><span class="platform-stat-value pc-revenue">—</span></div>
            <div class="platform-stat-row"><span class="platform-stat-label">Thị phần</span><span class="platform-stat-value pc-share">—</span></div>
            <div class="platform-stat-row"><span class="platform-stat-label">AOV</span><span class="platform-stat-value pc-aov">—</span></div>
            <div class="platform-stat-row"><span class="platform-stat-label">Tỷ lệ huỷ</span><span class="platform-stat-value pc-cancel">—</span></div>
          </div>
          <?php endforeach; ?>
        </div>

        <!-- Compare charts -->
        <div class="grid-3">
          <div class="chart-card">
            <div class="chart-header"><div class="chart-header-left"><h3>Doanh thu</h3></div></div>
            <div class="chart-wrap" style="height:180px"><canvas id="chartCompareRevenue"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-header"><div class="chart-header-left"><h3>Đơn hàng</h3></div></div>
            <div class="chart-wrap" style="height:180px"><canvas id="chartCompareOrders"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-header"><div class="chart-header-left"><h3>Radar tổng hợp</h3></div></div>
            <div class="chart-wrap" style="height:180px"><canvas id="chartRadar"></canvas></div>
          </div>
        </div>

        <!-- Top products table -->
        <div class="card">
          <div class="card-title" style="margin-bottom:10px">Top 5 sản phẩm mỗi sàn</div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Shopee</th>
                  <th>Lazada</th>
                  <th>TikTok Shop</th>
                </tr>
              </thead>
              <tbody id="comparisonTable"></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ── Heatmaps ──────────────────────────────────────────────────── -->
      <div class="page" id="page-heatmaps">
        <div class="page-header">
          <h1>Phân tích nâng cao</h1>
          <p>Heatmap thời gian đặt hàng và doanh thu theo địa lý</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">

          <!-- Heatmap đơn hàng -->
          <div class="card">
            <div class="card-title">Đơn hàng theo ngày &amp; giờ</div>
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:10px;flex-wrap:wrap">
              <span style="font-size:11px;color:var(--text-muted)">Ít</span>
              <?php foreach (['#f1f5f9','#dbeafe','#bfdbfe','#93c5fd','#60a5fa','#3b82f6','#2563eb','#1d4ed8','#1e3a8a','#172554','#0f1629'] as $c): ?>
              <span style="width:14px;height:14px;border-radius:2px;background:<?= htmlspecialchars($c) ?>;display:inline-block"></span>
              <?php endforeach; ?>
              <span style="font-size:11px;color:var(--text-muted)">Nhiều</span>
            </div>
            <div class="heatmap-container">
              <div id="heatmap7x24"></div>
            </div>
          </div>

          <!-- Heatmap doanh thu -->
          <div class="card">
            <div class="card-title">Doanh thu theo ngày &amp; giờ</div>
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:10px;flex-wrap:wrap">
              <span style="font-size:11px;color:var(--text-muted)">Ít</span>
              <?php foreach (['#f0fdf4','#dcfce7','#bbf7d0','#86efac','#4ade80','#22c55e','#16a34a','#15803d','#166534','#14532d','#052e16'] as $c): ?>
              <span style="width:14px;height:14px;border-radius:2px;background:<?= htmlspecialchars($c) ?>;display:inline-block"></span>
              <?php endforeach; ?>
              <span style="font-size:11px;color:var(--text-muted)">Nhiều</span>
            </div>
            <div class="heatmap-container">
              <div id="heatmapRevenue7x24"></div>
            </div>
          </div>

        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-header-left">
              <h3>Doanh thu theo tỉnh / thành</h3>
              <p>Top 15 địa phương</p>
            </div>
          </div>
          <div class="chart-wrap" style="height:340px">
            <canvas id="chartRevenueCity"></canvas>
          </div>
        </div>
      </div>

      <!-- ── Upload ────────────────────────────────────────────────────── -->
      <div class="page" id="page-upload">
        <div class="page-header">
          <h1>Upload dữ liệu</h1>
          <p>Tải lên file Excel từ Shopee, Lazada, TikTok Shop</p>
        </div>

        <div class="grid-3-1">
          <div class="card">
            <!-- Drop zone -->
            <div class="upload-area" id="uploadArea">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
              <div class="upload-area-title">Kéo thả file vào đây</div>
              <div class="upload-area-sub">hoặc <span id="browseBtn">chọn file</span> từ máy tính</div>
              <div class="upload-area-hint">Hỗ trợ .xlsx và .xls — nhiều file cùng lúc</div>
              <input id="fileInput" type="file" accept=".xlsx,.xls" multiple style="display:none">
            </div>

            <!-- File queue -->
            <div class="file-queue" id="fileQueue"></div>

            <!-- Actions -->
            <div class="upload-actions">
              <button id="btnUpload" class="btn btn-primary btn-sm" disabled>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                Tải lên
              </button>
              <button id="btnClear" class="btn btn-secondary btn-sm">Xoá đã xong</button>
            </div>

            <!-- Results -->
            <div class="file-queue" id="uploadResults" style="margin-top:20px"></div>
          </div>

          <div class="card">
            <div class="card-title">Hướng dẫn</div>
            <div class="card-subtitle">Hệ thống tự động nhận diện sàn và loại dữ liệu</div>
            <div style="font-size:12px;color:var(--text-secondary);line-height:1.7">
              <p style="margin-bottom:8px"><strong>Sàn được hỗ trợ:</strong></p>
              <ul style="padding-left:16px;margin-bottom:12px">
                <li>Shopee — file xuất từ Seller Centre</li>
                <li>Lazada — file Orders export</li>
                <li>TikTok Shop — Order Management export</li>
              </ul>
              <p style="margin-bottom:8px"><strong>Loại file:</strong></p>
              <ul style="padding-left:16px;margin-bottom:12px">
                <li><strong>Orders</strong> — dữ liệu đơn hàng</li>
                <li><strong>Traffic</strong> — lượt xem, lượt truy cập</li>
              </ul>
              <p style="margin-bottom:8px"><strong>Lưu ý:</strong></p>
              <ul style="padding-left:16px">
                <li>File tối đa 50MB mỗi file</li>
                <li>Dữ liệu trùng sẽ được cập nhật (upsert)</li>
                <li>File sẽ bị xoá sau khi xử lý</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Upload history -->
        <div class="card" style="margin-top:16px">
          <div class="card-title">Lịch sử upload</div>
          <div class="table-wrapper" style="margin-top:10px">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Sàn</th>
                  <th>Loại</th>
                  <th>File</th>
                  <th class="text-right">Đã import</th>
                  <th class="text-right">Bỏ qua</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody id="uploadHistoryTable"></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ── Logs ────────────────────────────────────────────────────── -->
      <div class="page" id="page-logs">
        <div class="page-header">
          <h1>Nhật ký hoạt động</h1>
          <p>Tất cả sự kiện và lỗi được ghi lại tự động</p>
        </div>

        <!-- Stats row -->
        <div class="grid-5 mb-4" id="logStats">
          <div class="kpi-card border-blue">  <div class="kpi-label">Tất cả</div>  <div class="kpi-value" id="log-stat-all">—</div></div>
          <div class="kpi-card border-green"> <div class="kpi-label">Info</div>    <div class="kpi-value" id="log-stat-info">—</div></div>
          <div class="kpi-card border-orange"><div class="kpi-label">Warning</div> <div class="kpi-value" id="log-stat-warning">—</div></div>
          <div class="kpi-card border-red">   <div class="kpi-label">Error</div>   <div class="kpi-value" id="log-stat-error">—</div></div>
          <div class="kpi-card border-purple"><div class="kpi-label">Critical</div><div class="kpi-value" id="log-stat-critical">—</div></div>
        </div>

        <div class="card">
          <!-- Filter bar -->
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
            <select id="logFilterLevel" style="height:34px;padding:0 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-primary);font-size:13px">
              <option value="">Tất cả mức</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="critical">Critical</option>
            </select>
            <select id="logFilterCategory" style="height:34px;padding:0 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-primary);font-size:13px">
              <option value="">Tất cả danh mục</option>
              <option value="auth">Auth</option>
              <option value="upload">Upload</option>
              <option value="api">API</option>
              <option value="admin">Admin</option>
              <option value="tiktok">TikTok</option>
              <option value="lazada">Lazada</option>
              <option value="app">App</option>
            </select>
            <input id="logSearch" type="text" placeholder="Tìm kiếm..." style="height:34px;padding:0 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-primary);font-size:13px;flex:1;min-width:180px">
            <button id="btnLogRefresh" class="btn btn-secondary btn-sm">Làm mới</button>
            <button id="btnLogClear" class="btn btn-sm" style="background:var(--red,#ef4444);color:#fff;border:none;padding:0 14px;height:34px;border-radius:6px;cursor:pointer;font-size:13px">Xoá log</button>
          </div>

          <!-- Table -->
          <div class="table-wrapper">
            <table id="logsTable">
              <thead>
                <tr>
                  <th style="width:140px">Thời gian</th>
                  <th style="width:80px">Mức</th>
                  <th style="width:80px">Danh mục</th>
                  <th>Thông điệp</th>
                  <th style="width:80px">IP</th>
                  <th style="width:40px"></th>
                </tr>
              </thead>
              <tbody id="logsTableBody">
                <tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">Đang tải...</td></tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div id="logsPagination" style="display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap"></div>
        </div>
      </div>

      <!-- ── Kết nối API ────────────────────────────────────────────────── -->
      <div class="page" id="page-connect">
        <div class="page-header">
          <h1>Kết nối API</h1>
          <p>Tự động đồng bộ đơn hàng từ Shopee, TikTok Shop và Lazada qua Open Platform API</p>
        </div>

        <!-- Platform tabs -->
        <div style="display:flex;gap:8px;margin-bottom:20px;border-bottom:2px solid var(--border);padding-bottom:0">
          <button id="btnConnectTabShopee" class="connect-tab connect-tab-active" onclick="switchConnectTab('shopee')" style="padding:8px 20px;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid var(--primary,#4f46e5);margin-bottom:-2px;color:var(--primary,#4f46e5)">Shopee</button>
          <button id="btnConnectTabTiktok" class="connect-tab" onclick="switchConnectTab('tiktok')" style="padding:8px 20px;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;color:var(--text-muted)">TikTok Shop</button>
          <button id="btnConnectTabLazada" class="connect-tab" onclick="switchConnectTab('lazada')" style="padding:8px 20px;font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;color:var(--text-muted)">Lazada</button>
        </div>

        <!-- ── Shopee Tab ─────────────────────────────────────────────────── -->
        <div id="connectTabShopee">
          <!-- Credentials card -->
          <div class="card mb-4">
            <div class="card-title">Thông tin xác thực Shopee Open Platform App</div>
            <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">
              Đăng nhập <strong>open.shopee.com</strong> → My Apps → Create App để lấy Partner ID và Partner Key.
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:600px">
              <div>
                <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block" for="shopeePartnerId">Partner ID</label>
                <input id="shopeePartnerId" type="number" class="login-input" placeholder="Nhập Partner ID..." style="width:100%;margin-top:4px">
              </div>
              <div>
                <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block" for="shopeePartnerKey">Partner Key</label>
                <input id="shopeePartnerKey" type="password" class="login-input" placeholder="Nhập Partner Key..." style="width:100%;margin-top:4px">
              </div>
            </div>
            <div style="margin-top:12px;display:flex;gap:10px;align-items:center">
              <button id="btnShopeeSaveCredentials" class="btn btn-primary">Lưu thông tin</button>
              <button id="btnConnectShopee" class="btn btn-secondary" style="display:flex;align-items:center;gap:6px">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                Kết nối Shopee
              </button>
              <span id="shopeeConnectStatus" style="font-size:13px;color:var(--text-muted)"></span>
            </div>
          </div>

          <!-- Connected shops -->
          <div class="card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
              <div class="card-title" style="margin-bottom:0">Shop Shopee đã kết nối</div>
              <div style="display:flex;gap:8px">
                <button id="btnShopeeSyncAll" class="btn btn-primary btn-sm" style="display:flex;align-items:center;gap:6px">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                  Đồng bộ tất cả
                </button>
                <button id="btnShopeeRefresh" class="btn btn-secondary btn-sm">Làm mới</button>
              </div>
            </div>
            <div class="table-wrapper">
              <table id="shopeeShopsTable">
                <thead>
                  <tr>
                    <th>Shop</th>
                    <th style="width:90px">Shop ID</th>
                    <th style="width:100px">Trạng thái</th>
                    <th style="width:140px">Token hết hạn</th>
                    <th style="width:140px">Đồng bộ lần cuối</th>
                    <th style="width:110px">Từ ngày</th>
                    <th style="width:120px">Thao tác</th>
                  </tr>
                </thead>
                <tbody id="shopeeShopsTableBody">
                  <tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">Đang tải...</td></tr>
                </tbody>
              </table>
            </div>
            <div id="shopeeSyncResults" style="margin-top:16px"></div>
          </div>

          <!-- How to guide -->
          <div class="card mt-4" style="background:var(--bg-base)">
            <div class="card-title">Hướng dẫn kết nối Shopee</div>
            <ol style="color:var(--text-secondary);font-size:13px;line-height:2;padding-left:20px">
              <li>Đăng nhập <strong>open.shopee.com</strong> → <strong>My Apps → Create App</strong></li>
              <li>Trong App Settings, thêm Redirect URL: <code id="shopeeOauthRedirectUri">—</code></li>
              <li>Sao chép <strong>Partner ID</strong> và <strong>Partner Key</strong> rồi điền vào form trên</li>
              <li>Nhấn <strong>Lưu thông tin</strong> rồi nhấn <strong>Kết nối Shopee</strong></li>
              <li>Đăng nhập tài khoản Shopee Seller và cấp quyền cho app</li>
              <li>Sau khi kết nối thành công, nhấn <strong>Đồng bộ</strong> để tải đơn hàng về</li>
            </ol>
          </div>
        </div><!-- /#connectTabShopee -->

        <!-- ── TikTok Tab ─────────────────────────────────────────────────── -->
        <div id="connectTabTiktok" style="display:none">
          <!-- Credentials card -->
          <div class="card mb-4">
            <div class="card-title">Thông tin xác thực TikTok Shop App</div>
            <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">
              Tạo app tại <strong>TikTok Shop Partner Center</strong> → App &amp; Service → Create app &amp; service để lấy App Key và App Secret.
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:600px">
              <div>
                <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block" for="tiktokAppKey">App Key</label>
                <input id="tiktokAppKey" type="text" class="login-input" placeholder="Nhập App Key..." style="width:100%;margin-top:4px">
              </div>
              <div>
                <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block" for="tiktokAppSecret">App Secret</label>
                <input id="tiktokAppSecret" type="password" class="login-input" placeholder="Nhập App Secret..." style="width:100%;margin-top:4px">
              </div>
            </div>
            <div style="margin-top:12px;display:flex;gap:10px;align-items:center">
              <button id="btnSaveCredentials" class="btn btn-primary">Lưu thông tin</button>
              <button id="btnConnectTiktok" class="btn btn-secondary" style="display:flex;align-items:center;gap:6px">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                Kết nối TikTok Shop
              </button>
              <span id="connectStatus" style="font-size:13px;color:var(--text-muted)"></span>
            </div>
          </div>

          <!-- Connected shops -->
          <div class="card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
              <div class="card-title" style="margin-bottom:0">Shop đã kết nối</div>
              <div style="display:flex;gap:8px">
                <button id="btnSyncAll" class="btn btn-primary btn-sm" style="display:flex;align-items:center;gap:6px">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                  Đồng bộ tất cả
                </button>
                <button id="btnRefreshShops" class="btn btn-secondary btn-sm">Làm mới</button>
              </div>
            </div>
            <div id="shopsTableWrapper">
              <div class="table-wrapper">
                <table id="shopsTable">
                  <thead>
                    <tr>
                      <th>Shop</th>
                      <th style="width:80px">Khu vực</th>
                      <th style="width:100px">Trạng thái</th>
                      <th style="width:140px">Token hết hạn</th>
                      <th style="width:140px">Đồng bộ lần cuối</th>
                      <th style="width:110px">Từ ngày</th>
                      <th style="width:120px">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody id="shopsTableBody">
                    <tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">Đang tải...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div id="syncResults" style="margin-top:16px"></div>
          </div>

          <!-- How to guide TikTok -->
          <div class="card mt-4" style="background:var(--bg-base)">
            <div class="card-title">Hướng dẫn kết nối TikTok Shop</div>
            <ol style="color:var(--text-secondary);font-size:13px;line-height:2;padding-left:20px">
              <li>Đăng ký tài khoản <strong>TikTok Shop Partner Center</strong> tại <code>partner.tiktokshop.com</code></li>
              <li>Vào <strong>App &amp; Service → Create app &amp; service</strong>, tạo Custom App</li>
              <li>Trong phần cài đặt app, bật <strong>Enable API</strong> và nhập Redirect URL: <code id="oauthRedirectUri">—</code></li>
              <li>Sao chép <strong>App Key</strong> và <strong>App Secret</strong> rồi điền vào form trên</li>
              <li>Nhấn <strong>Lưu thông tin</strong> rồi nhấn <strong>Kết nối TikTok Shop</strong></li>
              <li>Đăng nhập tài khoản TikTok Shop và cấp quyền cho app</li>
              <li>Sau khi kết nối thành công, nhấn <strong>Đồng bộ</strong> để tải đơn hàng về</li>
            </ol>
          </div>
        </div><!-- /#connectTabTiktok -->

        <!-- ── Lazada Tab ──────────────────────────────────────────────────── -->
        <div id="connectTabLazada" style="display:none">
          <!-- Credentials card -->
          <div class="card mb-4">
            <div class="card-title">Thông tin xác thực Lazada Open Platform App</div>
            <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">
              Đăng nhập <strong>open.lazada.com</strong> → App Console → Create App để lấy App Key và App Secret.
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:600px">
              <div>
                <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block" for="lazadaAppKey">App Key</label>
                <input id="lazadaAppKey" type="text" class="login-input" placeholder="Nhập App Key..." style="width:100%;margin-top:4px">
              </div>
              <div>
                <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block" for="lazadaAppSecret">App Secret</label>
                <input id="lazadaAppSecret" type="password" class="login-input" placeholder="Nhập App Secret..." style="width:100%;margin-top:4px">
              </div>
            </div>
            <div style="margin-top:12px;display:flex;gap:10px;align-items:center">
              <button id="btnLazadaSaveCredentials" class="btn btn-primary">Lưu thông tin</button>
              <button id="btnConnectLazada" class="btn btn-secondary" style="display:flex;align-items:center;gap:6px">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                Kết nối Lazada
              </button>
              <span id="lazadaConnectStatus" style="font-size:13px;color:var(--text-muted)"></span>
            </div>
          </div>

          <!-- Connected accounts -->
          <div class="card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
              <div class="card-title" style="margin-bottom:0">Tài khoản Lazada đã kết nối</div>
              <div style="display:flex;gap:8px">
                <button id="btnLazadaSyncAll" class="btn btn-primary btn-sm" style="display:flex;align-items:center;gap:6px">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                  Đồng bộ tất cả
                </button>
                <button id="btnLazadaRefresh" class="btn btn-secondary btn-sm">Làm mới</button>
              </div>
            </div>
            <div class="table-wrapper">
              <table id="lazadaAccountsTable">
                <thead>
                  <tr>
                    <th>Tài khoản</th>
                    <th style="width:80px">Quốc gia</th>
                    <th style="width:100px">Trạng thái</th>
                    <th style="width:140px">Token hết hạn</th>
                    <th style="width:140px">Đồng bộ lần cuối</th>
                    <th style="width:110px">Từ ngày</th>
                    <th style="width:120px">Thao tác</th>
                  </tr>
                </thead>
                <tbody id="lazadaAccountsTableBody">
                  <tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">Đang tải...</td></tr>
                </tbody>
              </table>
            </div>
            <div id="lazadaSyncResults" style="margin-top:16px"></div>
          </div>

          <!-- How to guide Lazada -->
          <div class="card mt-4" style="background:var(--bg-base)">
            <div class="card-title">Hướng dẫn kết nối Lazada</div>
            <ol style="color:var(--text-secondary);font-size:13px;line-height:2;padding-left:20px">
              <li>Đăng nhập <strong>open.lazada.com</strong> → <strong>App Console → Create App</strong></li>
              <li>Trong phần App Settings, thêm Redirect URL: <code id="lazadaOauthRedirectUri">—</code></li>
              <li>Sao chép <strong>App Key</strong> và <strong>App Secret</strong> rồi điền vào form trên</li>
              <li>Nhấn <strong>Lưu thông tin</strong> rồi nhấn <strong>Kết nối Lazada</strong></li>
              <li>Đăng nhập tài khoản Lazada Seller Center và cấp quyền cho app</li>
              <li>Sau khi kết nối thành công, nhấn <strong>Đồng bộ</strong> để tải đơn hàng về</li>
            </ol>
          </div>
        </div><!-- /#connectTabLazada -->

      </div>

      <!-- ── Cài đặt ────────────────────────────────────────────────────── -->
      <div class="page" id="page-settings">
        <div class="page-header">
          <h1>Cài đặt hệ thống <span id="currentVersionBadge" style="font-size:13px;font-weight:500;color:var(--text-muted);vertical-align:middle"></span></h1>
          <p>Thông tin server, database và các thao tác quản trị nâng cao</p>
        </div>

        <!-- System info -->
        <div class="card mb-4">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
            <div class="card-title" style="margin-bottom:0">Thông tin hệ thống</div>
            <button id="btnRefreshSysInfo" class="btn btn-secondary btn-sm">🔄 Làm mới</button>
          </div>
          <div id="sysInfoContent">
            <div style="text-align:center;padding:32px;color:var(--text-muted)">Đang tải...</div>
          </div>
        </div>

        <!-- Data stats -->
        <div class="card mb-4">
          <div class="card-title">Thống kê dữ liệu</div>
          <div id="dataStatsContent">
            <div style="text-align:center;padding:24px;color:var(--text-muted)">Đang tải...</div>
          </div>
        </div>

        <!-- Auto update -->
        <div class="card mb-4">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
            <div class="card-title" style="margin-bottom:0">Cập nhật tự động</div>
            <button id="btnCheckUpdateNow" class="btn btn-secondary btn-sm">🔄 Kiểm tra ngay</button>
          </div>

          <div style="margin-bottom:16px">
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px">
              URL Manifest cập nhật
              <span style="font-size:11px;opacity:.7">— file JSON chứa thông tin phiên bản mới nhất</span>
            </label>
            <div style="display:flex;gap:8px">
              <input type="url" id="inputManifestUrl" class="form-control"
                     placeholder="https://example.com/dashboard-manifest.json"
                     style="flex:1;font-size:13px">
              <button id="btnSaveManifestUrl" class="btn btn-primary btn-sm">Lưu</button>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:5px">
              Format JSON: <code>{"version":"1.1.0","download_url":"https://...","changelog":"..."}</code>
            </div>
          </div>

          <div id="updateStatusPanel">
            <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">Đang tải...</div>
          </div>
        </div><!-- /auto update -->

        <!-- Danger zone -->
        <div class="card" style="border:2px solid #fecaca">
          <div class="card-title" style="color:#dc2626">⚠️ Vùng nguy hiểm — Reset Database</div>
          <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px">
            Các thao tác dưới đây không thể hoàn tác. Hãy chắc chắn trước khi thực hiện.
          </p>

          <div style="display:flex;flex-direction:column;gap:12px">

            <!-- Reset orders -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#fef2f2;border-radius:10px;gap:16px;flex-wrap:wrap">
              <div>
                <div style="font-weight:600;font-size:14px;color:#1e293b">Xóa dữ liệu đơn hàng</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Xóa toàn bộ orders, traffic, upload_history, import_errors</div>
              </div>
              <button class="btn btn-sm" style="background:#ef4444;color:#fff;border:none;white-space:nowrap"
                      onclick="confirmReset('reset_orders','Xóa toàn bộ đơn hàng và traffic?','Nhập DELETE ORDERS để xác nhận:','DELETE ORDERS')">
                Xóa dữ liệu đơn hàng
              </button>
            </div>

            <!-- Reset API connections -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#fef2f2;border-radius:10px;gap:16px;flex-wrap:wrap">
              <div>
                <div style="font-weight:600;font-size:14px;color:#1e293b">Xóa kết nối API</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Xóa TikTok & Lazada connections, App Key/Secret đã lưu</div>
              </div>
              <button class="btn btn-sm" style="background:#ef4444;color:#fff;border:none;white-space:nowrap"
                      onclick="confirmReset('reset_api_connections','Xóa toàn bộ kết nối API?','Nhập DELETE API để xác nhận:','DELETE API')">
                Xóa kết nối API
              </button>
            </div>

            <!-- Reset logs -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#fffbeb;border-radius:10px;gap:16px;flex-wrap:wrap">
              <div>
                <div style="font-weight:600;font-size:14px;color:#1e293b">Xóa nhật ký hệ thống</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Xóa toàn bộ app_logs (không ảnh hưởng đến dữ liệu)</div>
              </div>
              <button class="btn btn-sm" style="background:#f59e0b;color:#fff;border:none;white-space:nowrap"
                      onclick="confirmReset('reset_logs','Xóa toàn bộ nhật ký?','Nhập DELETE LOGS để xác nhận:','DELETE LOGS')">
                Xóa nhật ký
              </button>
            </div>

            <!-- Full reset -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#fef2f2;border:2px dashed #fca5a5;border-radius:10px;gap:16px;flex-wrap:wrap">
              <div>
                <div style="font-weight:700;font-size:14px;color:#dc2626">💣 Reset TOÀN BỘ database</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Xóa tất cả: đơn hàng, traffic, API keys, logs, cài đặt</div>
              </div>
              <button class="btn btn-sm" style="background:#7f1d1d;color:#fff;border:none;white-space:nowrap"
                      onclick="confirmReset('reset_all','CẢNH BÁO: Xóa TOÀN BỘ dữ liệu không thể khôi phục!','Nhập RESET ALL để xác nhận:','RESET ALL')">
                💣 Reset toàn bộ
              </button>
            </div>

          </div><!-- reset actions -->

          <div id="resetResult" style="margin-top:16px"></div>
        </div><!-- danger zone -->

      </div><!-- /#page-settings -->

    </div><!-- /#content -->
  </div><!-- /#main -->
</div><!-- /#app -->

<!-- Scripts -->
<script src="assets/js/charts.js"></script>
<script src="assets/js/upload.js"></script>
<script src="assets/js/app.js"></script>
<script>
  // Expose Upload globally for inline onclick handlers in upload.js
  window.Upload = Upload;

  // Init upload UI when its nav item is clicked
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('[data-page="upload"]')?.addEventListener('click', () => {
      setTimeout(() => Upload.init(), 80);
    });

    // Show toast after OAuth redirect
    const usp = new URLSearchParams(location.search);
    if (usp.has('tiktok_connected')) {
      const n = usp.get('tiktok_connected');
      toast(`Đã kết nối thành công ${n} shop TikTok!`, 'success');
      history.replaceState({}, '', location.pathname + '#connect');
    } else if (usp.has('tiktok_error')) {
      toast('Kết nối TikTok thất bại: ' + usp.get('tiktok_error'), 'error');
      history.replaceState({}, '', location.pathname);
    } else if (usp.has('shopee_connected')) {
      toast('Đã kết nối shop Shopee thành công!', 'success');
      history.replaceState({}, '', location.pathname + '#connect');
      setTimeout(() => switchConnectTab('shopee'), 300);
    } else if (usp.has('shopee_error')) {
      toast('Kết nối Shopee thất bại: ' + usp.get('shopee_error'), 'error');
      history.replaceState({}, '', location.pathname);
    } else if (usp.has('lazada_connected')) {
      toast('Đã kết nối tài khoản Lazada thành công!', 'success');
      history.replaceState({}, '', location.pathname + '#connect');
      setTimeout(() => switchConnectTab('lazada'), 300);
    } else if (usp.has('lazada_error')) {
      toast('Kết nối Lazada thất bại: ' + usp.get('lazada_error'), 'error');
      history.replaceState({}, '', location.pathname);
    }
  });
</script>
</body>
</html>
