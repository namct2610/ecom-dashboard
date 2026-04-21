<?php
require_once __DIR__ . '/includes/bootstrap.php';

start_session();

// Generate CSRF token
$csrf = generate_csrf();

$appVersion = file_exists(__DIR__ . '/version.txt')
    ? trim((string) file_get_contents(__DIR__ . '/version.txt'))
    : '0.0.0';
$appUpdatedAt = '';
$manifestPath = __DIR__ . '/manifest.json';
if (file_exists($manifestPath)) {
    $manifestPayload = json_decode((string) file_get_contents($manifestPath), true);
    if (is_array($manifestPayload) && !empty($manifestPayload['released_at'])) {
        $releaseAt = date_create((string) $manifestPayload['released_at']);
        $appUpdatedAt = $releaseAt ? $releaseAt->format('d/m/Y H:i') : (string) $manifestPayload['released_at'];
    }
}
if ($appUpdatedAt === '' && file_exists($manifestPath)) {
    $appUpdatedAt = date('d/m/Y H:i', filemtime($manifestPath) ?: time());
}
$appVersionLabel = 'v' . $appVersion;
$appVersionMeta = $appUpdatedAt !== '' ? $appVersionLabel . ' · ' . $appUpdatedAt : $appVersionLabel;

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
  <link rel="stylesheet" href="assets/css/admin.css">
  <link rel="stylesheet" href="assets/css/upload.css">

  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <!-- i18n (load before app.js so t() is available) -->
  <script src="assets/js/i18n.js"></script>
</head>
<body>

<!-- ── Auth Overlay ──────────────────────────────────────────────────────── -->
<div id="auth-screen" class="hidden">
  <div class="login-box">
    <div class="login-logo">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="12" width="3.5" height="7" rx="1.2" fill="currentColor" opacity="0.28"/>
        <rect x="9.25" y="8" width="3.5" height="11" rx="1.2" fill="currentColor" opacity="0.55"/>
        <rect x="15.5" y="4.5" width="3.5" height="14.5" rx="1.2" fill="currentColor"/>
        <path d="M4 8.25C5.5 8.25 6.36 8.8 7.72 10.05C8.91 11.15 9.68 11.63 10.61 11.63C11.83 11.63 12.68 10.82 13.91 9.45C15.29 7.91 16.49 7 18.62 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="4" cy="8.25" r="1.25" fill="currentColor" opacity="0.85"/>
        <circle cx="18.62" cy="7" r="1.5" fill="currentColor"/>
      </svg>
    </div>
    <div class="login-title">Dashboard v3</div>
    <div class="login-sub" data-i18n="login.sub">Đăng nhập để tiếp tục</div>
    <form id="loginForm" autocomplete="off">
      <div class="login-field">
        <label class="login-label" data-i18n="login.user" for="loginUsername">Tên đăng nhập</label>
        <input id="loginUsername" class="login-input" type="text" placeholder="admin" autocomplete="username" required>
      </div>
      <div class="login-field">
        <label class="login-label" data-i18n="login.pass" for="loginPassword">Mật khẩu</label>
        <input id="loginPassword" class="login-input" type="password" placeholder="••••••••" autocomplete="current-password" required>
      </div>
      <button id="loginBtn" data-i18n="login.btn" type="submit" class="login-btn">Đăng nhập</button>
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
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="12" width="3.5" height="7" rx="1.2" fill="currentColor" opacity="0.28"/>
          <rect x="9.25" y="8" width="3.5" height="11" rx="1.2" fill="currentColor" opacity="0.55"/>
          <rect x="15.5" y="4.5" width="3.5" height="14.5" rx="1.2" fill="currentColor"/>
          <path d="M4 8.25C5.5 8.25 6.36 8.8 7.72 10.05C8.91 11.15 9.68 11.63 10.61 11.63C11.83 11.63 12.68 10.82 13.91 9.45C15.29 7.91 16.49 7 18.62 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="4" cy="8.25" r="1.25" fill="currentColor" opacity="0.85"/>
          <circle cx="18.62" cy="7" r="1.5" fill="currentColor"/>
        </svg>
      </div>
      <div class="sidebar-brand-text">
        <div class="sidebar-brand-name">Dashboard v3</div>
        <div class="sidebar-brand-meta"><?= htmlspecialchars($appVersionMeta, ENT_QUOTES, 'UTF-8') ?></div>
      </div>
    </div>

    <div class="sidebar-nav">
      <div class="nav-item active" data-page="overview" data-label="Tổng quan">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        <span class="nav-label" data-i18n="nav.overview">Tổng quan</span>
      </div>
      <div class="nav-item" data-page="orders" data-label="Đơn hàng">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        <span class="nav-label" data-i18n="nav.orders">Đơn hàng</span>
      </div>
      <div class="nav-item" data-page="products" data-label="Sản phẩm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        <span class="nav-label" data-i18n="nav.products">Sản phẩm</span>
      </div>
      <div class="nav-item" data-page="customers" data-label="Khách hàng">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        <span class="nav-label" data-i18n="nav.customers">Khách hàng</span>
      </div>
      <div class="nav-item" data-page="traffic" data-label="Traffic">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
        <span class="nav-label" data-i18n="nav.traffic">Traffic</span>
      </div>
      <div class="nav-item" data-page="comparison" data-label="So sánh">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
        <span class="nav-label" data-i18n="nav.comparison">So sánh</span>
      </div>
      <div class="nav-item" data-page="reconcile" data-label="Đối soát GBS">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h10M4 9h16M4 13h10M4 17h16"/><path d="M18 4l2 2 4-4"/><path d="M18 12l2 2 4-4"/></svg>
        <span class="nav-label" data-i18n="nav.reconcile">Đối soát GBS</span>
      </div>
      <div class="nav-item" data-page="heatmaps" data-label="Phân tích">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="4" height="4" rx="1"/><rect x="10" y="3" width="4" height="4" rx="1"/><rect x="17" y="3" width="4" height="4" rx="1"/><rect x="3" y="10" width="4" height="4" rx="1"/><rect x="10" y="10" width="4" height="4" rx="1"/><rect x="17" y="10" width="4" height="4" rx="1"/><rect x="3" y="17" width="4" height="4" rx="1"/><rect x="10" y="17" width="4" height="4" rx="1"/><rect x="17" y="17" width="4" height="4" rx="1"/></svg>
        <span class="nav-label" data-i18n="nav.analytics">Phân tích</span>
      </div>
      <div class="nav-item" data-page="upload" data-label="Upload">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
        <span class="nav-label" data-i18n="nav.upload">Upload</span>
      </div>
      <div class="nav-item" data-page="logs" data-label="Nhật ký">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        <span class="nav-label" data-i18n="nav.logs">Nhật ký</span>
      </div>
    </div>

    <div class="sidebar-footer">
      <button id="btnCollapseSidebar" class="btn-collapse-sidebar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        <span class="nav-label" data-i18n="nav.collapse">Thu gọn</span>
      </button>
      <button id="btnLogout" class="btn-logout">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        <span class="btn-logout-label" data-i18n="nav.logout">Đăng xuất</span>
      </button>
    </div>
  </nav>

  <!-- Main -->
  <div id="main">

    <!-- Sidebar overlay (mobile) -->
    <div id="sidebarOverlay"></div>

    <!-- Header -->
    <div id="header">
      <button id="btnMenuToggle" aria-label="Menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <span class="header-title">Dashboard v3</span>

      <!-- Platform filter -->
      <div class="platform-filter">
        <button class="platform-btn active" data-platform="all" data-i18n="filter.all">Tất cả</button>
        <button class="platform-btn" data-platform="shopee">Shopee</button>
        <button class="platform-btn" data-platform="lazada">Lazada</button>
        <button class="platform-btn" data-platform="tiktokshop">TikTok</button>
      </div>

      <div class="header-spacer"></div>

      <!-- Period picker -->
      <div class="period-picker" id="periodPicker">
        <div class="pp-modes">
          <button class="pp-mode active" data-mode="month" data-i18n="period.month">Tháng</button>
          <button class="pp-mode" data-mode="year" data-i18n="period.year">Năm</button>
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
            <button class="pp-preset pp-preset-range" data-preset="today" data-i18n="preset.today">Hôm nay</button>
            <button class="pp-preset pp-preset-range" data-preset="yesterday" data-i18n="preset.yesterday">Hôm qua</button>
            <button class="pp-preset pp-preset-range" data-preset="7days" data-i18n="preset.7days">7 ngày</button>
            <button class="pp-preset pp-preset-range" data-preset="30days" data-i18n="preset.30days">30 ngày</button>
          </div>
          <div class="pp-presets pp-presets-period">
            <button class="pp-preset" data-preset="this-month" data-i18n="preset.this_month">Tháng này</button>
            <button class="pp-preset" data-preset="last-month" data-i18n="preset.last_month">Tháng trước</button>
            <button class="pp-preset" data-preset="this-year" data-i18n="preset.this_year">Năm nay</button>
          </div>
          <div class="pp-grid-head">
            <button class="pp-gyear-arrow" id="periodGridPrev">&#8249;</button>
            <span id="periodGridYear">2026</span>
            <button class="pp-gyear-arrow" id="periodGridNext">&#8250;</button>
          </div>
          <div class="pp-grid" id="periodGrid"></div>
        </div>
      </div>

      <div class="user-menu" id="userMenu">
        <button class="user-menu-btn" id="btnUserMenu" type="button" aria-haspopup="true" aria-expanded="false">
          <span id="adminNavBadge" class="user-menu-badge" style="display:none"></span>
          <div class="user-menu-meta">
            <span class="user-menu-name" id="headerUserName"><?= htmlspecialchars($_SESSION['full_name'] ?? $_SESSION['username'] ?? 'Tài khoản') ?></span>
            <span class="user-menu-role" id="headerUserRole"><?= htmlspecialchars($_SESSION['role'] ?? 'staff') ?></span>
          </div>
          <div class="header-avatar" id="headerAvatar"><?= htmlspecialchars($initials) ?></div>
          <svg class="user-menu-caret" viewBox="0 0 10 6" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4 4 4-4"/></svg>
        </button>

        <div class="user-menu-dropdown" id="userMenuDropdown">
          <div class="user-menu-card">
            <div class="user-menu-card-avatar" id="userMenuAvatar"><?= htmlspecialchars($initials) ?></div>
            <div class="user-menu-card-info">
              <div class="user-menu-card-name" id="userMenuName"><?= htmlspecialchars($_SESSION['full_name'] ?? $_SESSION['username'] ?? 'Tài khoản') ?></div>
              <div class="user-menu-card-username" id="userMenuUsername">@<?= htmlspecialchars($_SESSION['username'] ?? 'guest') ?></div>
              <div class="user-menu-card-role" id="userMenuRole"><?= htmlspecialchars($_SESSION['role'] ?? 'staff') ?></div>
            </div>
          </div>

          <div class="user-menu-divider"></div>

          <button class="user-menu-item" id="btnUserMenuProfile" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21a8 8 0 00-16 0"/><circle cx="12" cy="8" r="4"/></svg>
            <span data-i18n="user.menu.profile">Hồ sơ tài khoản</span>
          </button>

          <button class="user-menu-item" id="btnUserMenuPassword" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V8a5 5 0 0110 0v3"/><circle cx="12" cy="16" r="1"/></svg>
            <span data-i18n="user.menu.password">Đổi mật khẩu</span>
          </button>

          <div class="user-menu-divider"></div>

          <div class="user-menu-lang-head">
            <span data-i18n="user.menu.language">Ngôn ngữ hiển thị</span>
            <span class="user-menu-lang-current" id="userMenuLangCurrent">VI</span>
          </div>
          <div class="user-menu-lang-list" id="userMenuLangList"></div>

          <button class="user-menu-item admin-only hidden-by-role" id="btnUserMenuLangSettings" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M12 4h9"/><path d="M4 9h16"/><path d="M4 15h16"/><path d="M8 4v16"/></svg>
            <span data-i18n="user.menu.language_settings">Cài đặt ngôn ngữ</span>
          </button>

          <button class="user-menu-item admin-only hidden-by-role" id="btnUserMenuAdmin" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 4v5c0 5-3.1 8.7-7 9.9C8.1 20.7 5 17 5 12V7l7-4z"/><path d="M9.5 12.5l1.8 1.8 3.9-4.2"/></svg>
            <span data-i18n="user.menu.admin">Quản trị hệ thống</span>
          </button>

          <div class="user-menu-divider"></div>

          <button class="user-menu-item" id="btnUserMenuLogout" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
            <span data-i18n="nav.logout">Đăng xuất</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div id="content">

      <!-- ── Overview ──────────────────────────────────────────────────── -->
      <div class="page active" id="page-overview">
        <div class="page-header">
          <h1 data-i18n="page.overview.title">Tổng quan</h1>
          <p data-i18n="page.overview.sub">Doanh thu, đơn hàng và traffic tổng hợp</p>
        </div>

        <!-- KPI Row -->
        <div class="grid-4 mb-4">
          <div class="kpi-card border-blue">
            <div class="kpi-label"><span data-i18n="kpi.revenue">Doanh thu</span>
              <span class="kpi-icon blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              </span>
            </div>
            <div class="kpi-value" id="kpi-revenue">—</div>
            <div class="kpi-sub" data-i18n="kpi.revenue.sub">Đã hoàn thành</div>
          </div>
          <div class="kpi-card border-green">
            <div class="kpi-label"><span data-i18n="kpi.orders">Tổng đơn</span>
              <span class="kpi-icon green">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
              </span>
            </div>
            <div class="kpi-value" id="kpi-orders">—</div>
            <div class="kpi-sub" data-i18n="kpi.orders.sub">Tất cả trạng thái</div>
          </div>
          <div class="kpi-card border-purple">
            <div class="kpi-label"><span data-i18n="kpi.completed">Hoàn thành</span>
              <span class="kpi-icon purple">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
            </div>
            <div class="kpi-value" id="kpi-completed">—</div>
            <div class="kpi-sub" data-i18n="kpi.completed.sub">Đã giao / hoàn thành</div>
          </div>
          <div class="kpi-card border-orange">
            <div class="kpi-label"><span data-i18n="kpi.views">Lượt xem</span>
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
                <h3 data-i18n="chart.revenue_trend">Doanh thu theo thời gian</h3>
                <p data-i18n="chart.by_platform">Phân theo sàn</p>
              </div>
            </div>
            <div class="chart-wrap" style="height:200px">
              <canvas id="chartRevenueTrend"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3 data-i18n="chart.market_share">Thị phần doanh thu</h3>
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
            <div class="card-title" data-i18n="card.recent_orders">Đơn hàng gần đây</div>
            <div id="recentOrdersMini"></div>
          </div>
          <div class="card">
            <div class="card-title" data-i18n="card.top_products">Top sản phẩm</div>
            <div id="topProductsOverview"></div>
          </div>
        </div>
      </div>

      <!-- ── Orders ────────────────────────────────────────────────────── -->
      <div class="page" id="page-orders">
        <div class="page-header">
          <h1 data-i18n="page.orders.title">Đơn hàng</h1>
          <p data-i18n="page.orders.sub">Chi tiết đơn hàng theo thời gian và trạng thái</p>
        </div>

        <!-- KPIs -->
        <div class="grid-4 mb-4">
          <div class="kpi-card border-blue">
            <div class="kpi-label" data-i18n="kpi.total_orders">Tổng đơn</div>
            <div class="kpi-value" id="ord-total">—</div>
          </div>
          <div class="kpi-card border-green">
            <div class="kpi-label" data-i18n="kpi.completed">Hoàn thành</div>
            <div class="kpi-value" id="ord-completed">—</div>
          </div>
          <div class="kpi-card border-red">
            <div class="kpi-label" data-i18n="kpi.cancelled">Đã huỷ</div>
            <div class="kpi-value" id="ord-cancelled">—</div>
          </div>
          <div class="kpi-card border-orange">
            <div class="kpi-label" data-i18n="kpi.cancel_rate">Tỷ lệ huỷ</div>
            <div class="kpi-value" id="ord-cancel-rate">—</div>
          </div>
        </div>

        <!-- Order trend + donut -->
        <div class="grid-3-1">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3 data-i18n="chart.order_trend">Xu hướng đơn hàng</h3>
                <p data-i18n="chart.completed_vs_cancelled">Hoàn thành vs Huỷ</p>
              </div>
            </div>
            <div class="chart-wrap" style="height:200px">
              <canvas id="chartOrdersTrend"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3 data-i18n="chart.order_status">Trạng thái đơn</h3>
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
                <h3 data-i18n="chart.orders_platform">Đơn theo sàn</h3>
              </div>
            </div>
            <div class="chart-wrap" style="height:180px">
              <canvas id="chartPlatformOrders"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3 data-i18n="chart.orders_hour">Đơn theo giờ trong ngày</h3>
              </div>
            </div>
            <div class="chart-wrap" style="height:180px">
              <canvas id="chartHourly"></canvas>
            </div>
          </div>
        </div>

        <!-- Orders table -->
        <div class="card">
          <div class="card-title" data-i18n="card.order_list">Danh sách đơn hàng</div>
          <div class="table-wrapper" style="margin-top:10px">
            <table>
              <thead>
                <tr>
                  <th data-i18n="th.order_id">Mã đơn</th>
                  <th data-i18n="th.product">Sản phẩm</th>
                  <th data-i18n="th.platform">Sàn</th>
                  <th data-i18n="th.date">Ngày đặt</th>
                  <th class="text-right" data-i18n="th.value">Giá trị</th>
                  <th data-i18n="th.status">Trạng thái</th>
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
          <h1 data-i18n="page.products.title">Sản phẩm</h1>
          <p data-i18n="page.products.sub">Top sản phẩm theo số lượng và doanh thu</p>
        </div>

        <div class="grid-4 mb-4">
          <div class="kpi-card border-purple">
            <div class="kpi-label" data-i18n="kpi.total_skus">Tổng SKU</div>
            <div class="kpi-value" id="total-skus">—</div>
          </div>
          <div class="kpi-card border-blue">
            <div class="kpi-label" data-i18n="kpi.qty_sold">Tổng SL đã bán</div>
            <div class="kpi-value" id="prod-qty-all">—</div>
            <div class="kpi-sub" data-i18n="kpi.qty_sold.sub">Kể cả đơn huỷ</div>
          </div>
          <div class="kpi-card border-green">
            <div class="kpi-label" data-i18n="kpi.qty_delivered">Tổng SL đã giao</div>
            <div class="kpi-value" id="prod-qty-delivered">—</div>
            <div class="kpi-sub" data-i18n="kpi.qty_del.sub">Đơn hoàn thành</div>
          </div>
          <div class="kpi-card border-orange">
            <div class="kpi-label" data-i18n="kpi.avg_qty">SL TB/đơn hàng</div>
            <div class="kpi-value" id="prod-avg-qty">—</div>
            <div class="kpi-sub" data-i18n="kpi.avg_qty.sub">Sản phẩm/đơn</div>
          </div>
        </div>

        <!-- Top qty + top revenue charts -->
        <div class="grid-2">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3 data-i18n="chart.top_qty">Top sản phẩm bán chạy</h3>
                <p data-i18n="chart.by_qty">Theo số lượng</p>
              </div>
            </div>
            <div class="chart-wrap" style="height:260px">
              <canvas id="chartTopQty"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3 data-i18n="chart.top_revenue">Top sản phẩm doanh thu cao</h3>
                <p data-i18n="chart.by_revenue">Theo doanh thu</p>
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
            <div class="card-title" data-i18n="card.product_list" style="margin-bottom:12px">Danh sách sản phẩm</div>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th data-i18n="th.sku">SKU</th>
                    <th data-i18n="th.product_name">Tên sản phẩm</th>
                    <th data-i18n="th.platform">Sàn</th>
                    <th class="text-right" data-i18n="th.qty">SL</th>
                    <th class="text-right" data-i18n="th.revenue">Doanh thu</th>
                  </tr>
                </thead>
                <tbody id="productsTable"></tbody>
              </table>
            </div>
            <div id="productsPager"></div>
          </div>
          <div class="card">
            <div class="card-title" data-i18n="card.top5_revenue" style="margin-bottom:12px">Top 5 doanh thu</div>
            <div id="topRevMini"></div>
          </div>
        </div>
      </div>

      <!-- ── Customers ─────────────────────────────────────────────────── -->
      <div class="page" id="page-customers">
        <div class="page-header">
          <h1 data-i18n="page.customers.title">Khách hàng</h1>
          <p data-i18n="page.customers.sub">Phân tích khách hàng theo địa lý và phương thức thanh toán</p>
        </div>

        <div class="grid-4 mb-4">
          <div class="kpi-card border-blue">
            <div class="kpi-label" data-i18n="kpi.total_orders">Tổng đơn</div>
            <div class="kpi-value" id="cust-total">—</div>
          </div>
          <div class="kpi-card border-green">
            <div class="kpi-label" data-i18n="kpi.aov">AOV</div>
            <div class="kpi-value" id="cust-aov">—</div>
            <div class="kpi-sub" data-i18n="kpi.aov.sub">Giá trị trung bình/đơn</div>
          </div>
          <div class="kpi-card border-purple">
            <div class="kpi-label" data-i18n="kpi.buyers">Người mua</div>
            <div class="kpi-value" id="cust-buyers">—</div>
            <div class="kpi-sub" data-i18n="kpi.buyers.sub">Người mua khác nhau</div>
          </div>
          <div class="kpi-card border-orange">
            <div class="kpi-label" data-i18n="kpi.conv_rate">Tỉ lệ chuyển đổi</div>
            <div class="kpi-value" id="cust-conv">—</div>
            <div class="kpi-sub" data-i18n="kpi.conv_rate.sub">Đơn / lượt truy cập</div>
          </div>
        </div>

        <div class="grid-2 mb-4">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3 data-i18n="chart.customer_segments">Phân loại khách hàng</h3>
                <p data-i18n="chart.customer_segments.sub">Mới · Cũ · Tiềm năng</p>
              </div>
            </div>
            <div class="donut-wrap" style="height:220px">
              <canvas id="chartCustomerSegments"></canvas>
              <div class="donut-center">
                <div class="donut-center-value" id="custSegTotal">—</div>
                <div class="donut-center-label" data-i18n="seg.total_label">Người mua</div>
              </div>
            </div>
            <div class="chart-legend" id="custSegLegend"></div>
          </div>
          <div class="card">
            <div class="card-title" data-i18n="card.top_locations" style="margin-bottom:12px">Top địa phương</div>
            <div id="cityList"></div>
            <div id="cityListPager"></div>
          </div>
        </div>

        <div class="card customer-leaderboard-card mb-4">
          <div class="chart-header customer-leaderboard-header">
            <div class="chart-header-left">
              <h3 data-i18n="card.customer_leaderboard">Khách hàng nổi bật</h3>
              <p data-i18n="card.customer_leaderboard.sub">Thống kê theo username trong bộ lọc hiện tại</p>
            </div>
          </div>
          <div class="table-wrapper customer-leaderboard-table">
            <table>
              <thead>
                <tr>
                  <th style="width:64px" data-i18n="th.rank">Hạng</th>
                  <th data-i18n="th.username">Username</th>
                  <th class="text-right" data-i18n="cl.orders">Đơn hàng</th>
                  <th class="text-right" data-i18n="cl.quantity">Số lượng</th>
                  <th class="text-right" data-i18n="th.revenue">Doanh thu</th>
                </tr>
              </thead>
              <tbody id="customerStatsTable"></tbody>
            </table>
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
          <h1 data-i18n="page.traffic.title">Traffic</h1>
          <p data-i18n="page.traffic.sub">Lượt xem, lượt truy cập và tỷ lệ chuyển đổi</p>
        </div>

        <div class="grid-4 mb-4">
          <div class="kpi-card border-blue">
            <div class="kpi-label" data-i18n="kpi.traffic_views">Lượt xem</div>
            <div class="kpi-value" id="tr-views">—</div>
          </div>
          <div class="kpi-card border-green">
            <div class="kpi-label" data-i18n="kpi.visits">Lượt truy cập</div>
            <div class="kpi-value" id="tr-visits">—</div>
          </div>
          <div class="kpi-card border-orange">
            <div class="kpi-label" data-i18n="kpi.bounce_rate">Tỷ lệ thoát TB</div>
            <div class="kpi-value" id="tr-bounce">—</div>
          </div>
        </div>

        <div class="mb-4">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-header-left">
                <h3 data-i18n="chart.traffic_trend">Traffic theo thời gian</h3>
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
                <h3 data-i18n="chart.traffic_platform">Traffic theo sàn</h3>
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
          <h1 data-i18n="page.comparison.title">So sánh sàn</h1>
          <p data-i18n="page.comparison.sub">Hiệu suất Shopee, Lazada và TikTok Shop</p>
        </div>

        <!-- Platform stat cards -->
        <div class="grid-3 mb-4">
          <?php foreach (['shopee','lazada','tiktokshop'] as $p): ?>
          <div class="platform-card <?= $p ?>" id="platform-card-<?= $p ?>">
            <div class="platform-card-header">
              <span class="badge badge-<?= $p ?>"><?= $p === 'tiktokshop' ? 'TikTok Shop' : ucfirst($p) ?></span>
            </div>
            <div class="platform-stat-row"><span class="platform-stat-label" data-i18n="compare.orders">Tổng đơn</span><span class="platform-stat-value pc-orders">—</span></div>
            <div class="platform-stat-row"><span class="platform-stat-label" data-i18n="compare.completed">Hoàn thành</span><span class="platform-stat-value pc-completed">—</span></div>
            <div class="platform-stat-row"><span class="platform-stat-label" data-i18n="compare.revenue">Doanh thu</span><span class="platform-stat-value pc-revenue">—</span></div>
            <div class="platform-stat-row"><span class="platform-stat-label" data-i18n="compare.share">Thị phần</span><span class="platform-stat-value pc-share">—</span></div>
            <div class="platform-stat-row"><span class="platform-stat-label" data-i18n="compare.aov">AOV</span><span class="platform-stat-value pc-aov">—</span></div>
            <div class="platform-stat-row"><span class="platform-stat-label" data-i18n="compare.cancel">Tỷ lệ huỷ</span><span class="platform-stat-value pc-cancel">—</span></div>
          </div>
          <?php endforeach; ?>
        </div>

        <!-- Compare charts -->
        <div class="grid-3">
          <div class="chart-card">
            <div class="chart-header"><div class="chart-header-left"><h3 data-i18n="kpi.revenue">Doanh thu</h3></div></div>
            <div class="chart-wrap" style="height:180px"><canvas id="chartCompareRevenue"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-header"><div class="chart-header-left"><h3 data-i18n="kpi.orders">Đơn hàng</h3></div></div>
            <div class="chart-wrap" style="height:180px"><canvas id="chartCompareOrders"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-header"><div class="chart-header-left"><h3 data-i18n="chart.radar">Radar tổng hợp</h3></div></div>
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

      <!-- ── GBS Reconciliation ───────────────────────────────────────── -->
      <div class="page" id="page-reconcile">
        <div class="page-header reconcile-page-header">
          <div class="reconcile-page-heading">
            <h1 data-i18n="page.reconcile.title">Đối soát GBS</h1>
            <p data-i18n="page.reconcile.sub">Đối soát GBS theo tháng với dữ liệu đơn hàng chung của Shopee, Lazada và TikTok Shop</p>
          </div>
          <div class="reconcile-page-actions">
            <button id="btnRefreshReconcile" class="btn btn-secondary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4"/></svg>
              Làm mới
            </button>
          </div>
        </div>
        <input id="reconcileFileInput" type="file" accept=".xlsx,.xls" style="display:none">

        <div class="reconcile-shell">
          <section class="card reconcile-upload-card">
            <div class="reconcile-section-head reconcile-section-head-compact">
              <div>
                <div class="reconcile-kicker">Kho GBS</div>
                <div class="card-title">Upload file GBS theo tháng</div>
                <div class="card-subtitle">GBS quản lý riêng theo file tháng. Dữ liệu sàn lấy trực tiếp từ `orders`, không cần upload lại.</div>
              </div>
              <button type="button" class="btn" id="btnReconcileUploadPrimary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/><path d="M12 5v12"/></svg>
                Thêm file GBS
              </button>
            </div>
            <div class="reconcile-upload-status" id="reconcileUploadStatus">Chưa có file GBS nào trong kho đối soát.</div>
            <div class="reconcile-source-grid">
              <div class="reconcile-source-chip">
                <span class="badge badge-gbs">GBS</span>
                <div>
                  <strong>File tháng</strong>
                  <span>Tự nhận diện theo `Thời gian đối soát`, lưu nhiều file và xoá khi không còn dùng.</span>
                </div>
              </div>
              <div class="reconcile-source-chip">
                <span class="badge badge-shopee">Shopee</span>
                <div>
                  <strong>Nguồn orders chung</strong>
                  <span>Khớp tháng theo `Thời gian hoàn thành đơn hàng`.</span>
                </div>
              </div>
              <div class="reconcile-source-chip">
                <span class="badge badge-lazada">Lazada</span>
                <div>
                  <strong>Nguồn orders chung</strong>
                  <span>Khớp tháng theo `ttsSla` đã đồng bộ vào hệ thống.</span>
                </div>
              </div>
              <div class="reconcile-source-chip">
                <span class="badge badge-tiktokshop">TikTok Shop</span>
                <div>
                  <strong>Đối chiếu mã đơn</strong>
                  <span>Hiện ưu tiên khớp theo mã đơn vì chưa có mốc thời gian ổn định.</span>
                </div>
              </div>
            </div>
          </section>

          <section class="card reconcile-control-card">
            <div class="reconcile-section-head reconcile-section-head-compact">
              <div>
                <div class="reconcile-kicker">Kỳ Đối Soát</div>
                <div class="card-title">Tháng đang xem</div>
                <div class="card-subtitle">Chọn tháng GBS để xác nhận kỳ và xuất danh sách đơn lệch.</div>
              </div>
              <div class="reconcile-control-actions">
                <button id="btnToggleReconcileMonthConfirm" class="btn btn-secondary" disabled>Xác nhận tháng</button>
                <button id="btnExportReconcileUnmatched" class="btn btn-secondary" disabled>Xuất đơn chưa khớp</button>
              </div>
            </div>
            <div id="reconcileSelectedMonthMeta" class="reconcile-current-month">
              Chưa có tháng đối soát nào sẵn sàng.
            </div>
          </section>
        </div>

        <div class="card">
          <div class="reconcile-section-head">
            <div>
              <div class="reconcile-kicker">Các Kỳ GBS</div>
              <div class="card-title">Danh sách tháng GBS</div>
              <div class="card-subtitle">Hệ thống tự gom tháng từ toàn bộ file GBS, chọn nhanh từng kỳ để đối soát.</div>
            </div>
            <div class="reconcile-managed-summary" id="reconcileManagedSummary">0 tháng</div>
          </div>
          <div class="reconcile-month-list" id="reconcileMonthList"></div>
        </div>

        <div class="card reconcile-hero-card">
          <div class="reconcile-hero-copy">
            <div class="reconcile-kicker">Nguyên Tắc Khớp</div>
            <h3>Đối soát GBS theo tháng trên cùng một nguồn dữ liệu đơn hàng</h3>
            <div class="reconcile-hero-points">
              <div class="reconcile-hero-point">
                <strong>NMV</strong>
                <span>`Giá gốc sản phẩm - Voucher / giảm giá nhà bán`, không trừ phần giảm giá của sàn.</span>
              </div>
              <div class="reconcile-hero-point">
                <strong>Combo</strong>
                <span>Quy đổi theo `Combo_to_single`, sau đó phân bổ NMV bằng `Bang_gia` trước khi so sánh.</span>
              </div>
              <div class="reconcile-hero-point">
                <strong>Khóa khớp</strong>
                <span>Đối chiếu theo `platform + order_id`, ưu tiên dữ liệu orders chung để tránh upload trùng.</span>
              </div>
            </div>
          </div>
          <div class="reconcile-run-meta" id="reconcileRunMeta">Chưa tải dữ liệu đối soát.</div>
        </div>

        <div class="grid-4 reconcile-kpi-grid">
          <div class="kpi-card border-blue">
            <div class="kpi-label">Đơn sàn trong phạm vi</div>
            <div class="kpi-value" id="reconcile-stat-platform-orders">0</div>
            <div class="kpi-sub">Dữ liệu lấy từ bảng orders theo logic thời gian của từng sàn</div>
          </div>
          <div class="kpi-card border-green">
            <div class="kpi-label">Đơn giao nhau</div>
            <div class="kpi-value" id="reconcile-stat-common-orders">0</div>
            <div class="kpi-sub">Có mặt đồng thời trong GBS và dữ liệu sàn chung</div>
          </div>
          <div class="kpi-card border-teal">
            <div class="kpi-label">Đơn khớp</div>
            <div class="kpi-value" id="reconcile-stat-matched-orders">0</div>
            <div class="kpi-sub">Khớp số lượng và NMV sau khi quy đổi</div>
          </div>
          <div class="kpi-card border-red">
            <div class="kpi-label">Đơn cần xem</div>
            <div class="kpi-value" id="reconcile-stat-review-orders">0</div>
            <div class="kpi-sub">Bao gồm đơn thiếu ở một phía hoặc lệch sau đối chiếu</div>
          </div>
        </div>

        <div class="card">
          <div class="reconcile-section-head">
            <div>
              <div class="reconcile-kicker">Kho File</div>
              <div class="card-title">Quản lý file GBS</div>
              <div class="card-subtitle">Theo dõi file đã upload, tháng nhận diện được và xoá từng file sau khi hoàn tất đối soát.</div>
            </div>
            <div class="reconcile-managed-summary" id="reconcileManagedFileCount">0 file</div>
          </div>
          <div class="table-wrapper">
            <table class="reconcile-table reconcile-managed-table">
              <thead>
                <tr>
                  <th>File GBS</th>
                  <th>Tháng nhận diện</th>
                  <th>Cập nhật</th>
                  <th class="text-right">Kích thước</th>
                  <th class="text-right">Dòng / Đơn</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody id="reconcileManagedFilesTable"></tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="reconcile-section-head">
            <div>
              <div class="reconcile-kicker">Tổng Quan</div>
              <div class="card-title">Tóm tắt theo sàn</div>
              <div class="card-subtitle">So sánh nhanh số lượng đơn GBS và orders chung theo từng sàn trong tháng đã chọn.</div>
            </div>
          </div>
          <div class="table-wrapper">
            <table class="reconcile-table reconcile-summary-table">
              <thead>
                <tr>
                  <th>Sàn</th>
                  <th>Đơn sàn</th>
                  <th>Đơn GBS</th>
                  <th>Đơn chung</th>
                  <th>Đơn khớp</th>
                  <th>Thiếu trong GBS</th>
                  <th>Thiếu trong file sàn</th>
                </tr>
              </thead>
              <tbody id="reconcileSummaryBody"></tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="reconcile-section-head">
            <div>
              <div class="reconcile-kicker">Cần Xử Lý</div>
              <div class="card-title">Đơn sàn chưa khớp với GBS</div>
              <div class="card-subtitle">Gồm đơn thiếu ở GBS hoặc còn lệch số lượng / NMV. Có thể xuất toàn bộ danh sách theo tháng đang xem.</div>
            </div>
            <div class="reconcile-managed-summary" id="reconcileUnmatchedSummary">0 đơn</div>
          </div>
          <div class="table-wrapper">
            <table class="reconcile-table reconcile-unmatched-table">
              <thead>
                <tr>
                  <th>Sàn</th>
                  <th>Mã đơn</th>
                  <th>Kết quả</th>
                  <th>Thời gian sàn</th>
                  <th>SL / NMV sàn</th>
                  <th>SL / NMV GBS</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody id="reconcileUnmatchedBody"></tbody>
            </table>
          </div>
        </div>

        <details class="card reconcile-disclosure">
          <summary class="reconcile-disclosure-head">
            <div>
              <div class="reconcile-kicker">Thiết Lập Khớp</div>
              <div class="card-title">Quy tắc quy đổi dữ liệu</div>
              <div class="card-subtitle">Mở ra khi cần kiểm tra mapping giữa GBS và nguồn orders chung.</div>
            </div>
            <span class="reconcile-disclosure-label">Xem chi tiết</span>
          </summary>
          <div class="reconcile-disclosure-body">
            <div class="reconcile-map-grid" id="reconcileMappings"></div>
          </div>
        </details>

        <div class="card">
          <div class="reconcile-section-head">
            <div>
              <div class="reconcile-kicker">Chi Tiết Theo Sàn</div>
              <div class="card-title">Bảng đối chiếu chi tiết</div>
              <div class="card-subtitle">Mỗi sàn được thu gọn riêng để giảm chiều dài trang và tập trung vào các phần có chênh lệch.</div>
            </div>
          </div>
          <div class="reconcile-platform-sections" id="reconcilePlatformSections"></div>
        </div>
      </div>

      <!-- ── Heatmaps ──────────────────────────────────────────────────── -->
      <div class="page" id="page-heatmaps">
        <div class="page-header">
          <h1 data-i18n="page.analytics.title">Phân tích nâng cao</h1>
          <p data-i18n="page.analytics.sub">Heatmap thời gian đặt hàng và doanh thu theo địa lý</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">

          <!-- Heatmap đơn hàng -->
          <div class="card" style="min-width:0">
            <div class="card-title" data-i18n="card.orders_heatmap">Đơn hàng theo ngày &amp; giờ</div>
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:10px;flex-wrap:wrap">
              <span data-i18n="common.low" style="font-size:11px;color:var(--text-muted)">Ít</span>
              <?php foreach (['#f1f5f9','#dbeafe','#bfdbfe','#93c5fd','#60a5fa','#3b82f6','#2563eb','#1d4ed8','#1e3a8a','#172554','#0f1629'] as $c): ?>
              <span style="width:14px;height:14px;border-radius:2px;background:<?= htmlspecialchars($c) ?>;display:inline-block"></span>
              <?php endforeach; ?>
              <span data-i18n="common.high" style="font-size:11px;color:var(--text-muted)">Nhiều</span>
            </div>
            <div class="heatmap-container">
              <div id="heatmap7x24"></div>
            </div>
          </div>

          <!-- Heatmap doanh thu -->
          <div class="card" style="min-width:0">
            <div class="card-title" data-i18n="card.rev_heatmap">Doanh thu theo ngày &amp; giờ</div>
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:10px;flex-wrap:wrap">
              <span data-i18n="common.low" style="font-size:11px;color:var(--text-muted)">Ít</span>
              <?php foreach (['#f0fdf4','#dcfce7','#bbf7d0','#86efac','#4ade80','#22c55e','#16a34a','#15803d','#166534','#14532d','#052e16'] as $c): ?>
              <span style="width:14px;height:14px;border-radius:2px;background:<?= htmlspecialchars($c) ?>;display:inline-block"></span>
              <?php endforeach; ?>
              <span data-i18n="common.high" style="font-size:11px;color:var(--text-muted)">Nhiều</span>
            </div>
            <div class="heatmap-container">
              <div id="heatmapRevenue7x24"></div>
            </div>
          </div>

        </div>

        <div class="chart-card">
          <div class="chart-header">
            <div class="chart-header-left">
              <h3 data-i18n="chart.revenue_city">Doanh thu theo tỉnh / thành</h3>
              <p data-i18n="chart.top15">Top 15 địa phương</p>
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
          <h1 data-i18n="page.upload.title">Upload dữ liệu</h1>
          <p data-i18n="page.upload.sub">Tải lên file Excel từ Shopee, Lazada, TikTok Shop</p>
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
              <div class="upload-area-hint">Hỗ trợ .xlsx và .xls — nhiều file cùng lúc, tự nhận diện đúng mẫu traffic Shopee / Lazada / TikTok Shop khi upload</div>
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
          <h1 data-i18n="page.logs.title">Nhật ký hoạt động</h1>
          <p data-i18n="page.logs.sub">Tất cả sự kiện và lỗi được ghi lại tự động</p>
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
            <button id="btnLogRefresh" class="btn btn-secondary btn-sm icon-only-btn" type="button" title="Làm mới" aria-label="Làm mới">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0020.49 15"/></svg>
            </button>
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

      <!-- ── Admin ───────────────────────────────────────────────────── -->
      <div class="page" id="page-admin">
        <div class="page-header">
          <h1 data-i18n="page.admin.title">Quản trị hệ thống</h1>
          <p data-i18n="page.admin.sub">Quản lý tài khoản đăng nhập, cấu hình API và cài đặt vận hành</p>
        </div>

        <div class="admin-shell">
          <div class="admin-hero">
            <div class="admin-hero-title">
              <h2 data-i18n="admin.hero.title">Trung tâm điều phối quản trị</h2>
              <div class="admin-status-pill" id="adminHeroRole">Admin</div>
            </div>
            <p data-i18n="admin.hero.sub">Tất cả các thay đổi nhạy cảm như tài khoản đăng nhập, kết nối API, cập nhật hệ thống và reset dữ liệu đều được gom về một bảng điều khiển quản trị duy nhất.</p>
          </div>

          <div class="grid-4">
            <div class="kpi-card border-blue">
              <div class="kpi-label" data-i18n="admin.stats.total_users">Tổng tài khoản</div>
              <div class="kpi-value" id="admin-total-users">—</div>
              <div class="kpi-sub" data-i18n="admin.stats.total_users.sub">Tất cả tài khoản đăng nhập</div>
            </div>
            <div class="kpi-card border-green">
              <div class="kpi-label" data-i18n="admin.stats.active_users">Đang hoạt động</div>
              <div class="kpi-value" id="admin-active-users">—</div>
              <div class="kpi-sub" data-i18n="admin.stats.active_users.sub">Có thể đăng nhập</div>
            </div>
            <div class="kpi-card border-purple">
              <div class="kpi-label" data-i18n="admin.stats.admins">Quản trị viên</div>
              <div class="kpi-value" id="admin-admin-users">—</div>
              <div class="kpi-sub" data-i18n="admin.stats.admins.sub">Có quyền cấu hình hệ thống</div>
            </div>
            <div class="kpi-card border-orange">
              <div class="kpi-label" data-i18n="admin.stats.last_login">Đăng nhập gần nhất</div>
              <div class="kpi-value" id="admin-last-login">—</div>
              <div class="kpi-sub" data-i18n="admin.stats.last_login.sub">Dấu mốc hoạt động mới nhất</div>
            </div>
          </div>

          <div class="admin-tabbar">
            <button class="admin-tab-btn active" id="btnAdminTabAccounts" data-admin-tab="accounts" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/></svg>
              <span data-i18n="admin.tab.accounts">Tài khoản</span>
            </button>
            <button class="admin-tab-btn" id="btnAdminTabApi" data-admin-tab="api" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
              <span data-i18n="admin.tab.api">API & kết nối</span>
            </button>
            <button class="admin-tab-btn" id="btnAdminTabSystem" data-admin-tab="system" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              <span data-i18n="admin.tab.system">Hệ thống</span>
            </button>
          </div>

          <div class="admin-tab-panel active" data-admin-tab-panel="accounts">
            <div class="admin-grid">
              <div class="admin-panel-card">
                <div class="admin-panel-head">
                  <div>
                    <h3 data-i18n="admin.users.title">Danh sách tài khoản đăng nhập</h3>
                    <p data-i18n="admin.users.sub">Tạo mới, phân quyền admin/staff và kiểm soát trạng thái hoạt động của từng tài khoản.</p>
                  </div>
                  <div class="admin-panel-actions">
                    <button class="btn btn-secondary btn-sm" id="btnAdminUserRefresh" data-i18n="admin.users.refresh">Làm mới</button>
                  </div>
                </div>
                <div class="table-wrapper">
                  <table class="admin-user-table">
                    <thead>
                      <tr>
                        <th data-i18n="admin.users.th.user">Tài khoản</th>
                        <th data-i18n="admin.users.th.role">Vai trò</th>
                        <th data-i18n="admin.users.th.status">Trạng thái</th>
                        <th data-i18n="admin.users.th.last_login">Lần đăng nhập cuối</th>
                        <th class="text-right" data-i18n="admin.users.th.actions">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody id="adminUsersTableBody"></tbody>
                  </table>
                </div>
              </div>

              <div class="admin-panel-card">
                <div class="admin-panel-head">
                  <div>
                    <h3 id="adminUserFormMode" data-i18n="admin.form.create">Tạo tài khoản mới</h3>
                    <p data-i18n="admin.form.sub">Mỗi tài khoản staff có thể xem dashboard, chỉ admin mới truy cập được bảng quản trị này.</p>
                  </div>
                </div>

                <form class="admin-user-form" id="adminUserForm" autocomplete="off">
                  <input type="hidden" id="adminUserId">
                  <div class="admin-field">
                    <label for="adminUserUsername" data-i18n="admin.form.username">Tên đăng nhập</label>
                    <input id="adminUserUsername" type="text" placeholder="staff.analytics" required>
                  </div>

                  <div class="admin-field-grid">
                    <div class="admin-field">
                      <label for="adminUserFullName" data-i18n="admin.form.full_name">Tên hiển thị</label>
                      <input id="adminUserFullName" type="text" placeholder="Nguyễn Văn A">
                    </div>
                    <div class="admin-field">
                      <label for="adminUserRole" data-i18n="admin.form.role">Vai trò</label>
                      <select id="adminUserRole">
                        <option value="staff" data-i18n="admin.role.staff">Nhân viên</option>
                        <option value="admin" data-i18n="admin.role.admin">Quản trị viên</option>
                      </select>
                    </div>
                  </div>

                  <div class="admin-field">
                    <label for="adminUserPassword" data-i18n="admin.form.password">Mật khẩu</label>
                    <input id="adminUserPassword" type="password" placeholder="Từ 8 ký tự, tối thiểu mức Trung bình">
                    <div class="password-strength is-empty" id="adminUserPasswordStrength">
                      <div class="password-strength-bar"><span class="password-strength-fill"></span></div>
                      <div class="password-strength-meta">
                        <span class="password-strength-value" data-i18n="password.strength.empty">Chưa nhập mật khẩu</span>
                        <span class="password-strength-note" data-i18n="password.strength.minimum">Yêu cầu tối thiểu mức Trung bình</span>
                      </div>
                    </div>
                    <div class="password-strength-rules">
                      <span class="password-strength-rule" data-password-rule="length" data-i18n="password.rule.length">Từ 8 ký tự trở lên</span>
                      <span class="password-strength-rule" data-password-rule="variety" data-i18n="password.rule.variety">Ít nhất 2 nhóm ký tự: chữ, số hoặc ký tự đặc biệt</span>
                    </div>
                  </div>

                  <div class="admin-toggle">
                    <div>
                      <label for="adminUserActive" data-i18n="admin.form.active">Cho phép đăng nhập</label>
                      <small data-i18n="admin.form.active.sub">Tắt mục này để khóa tài khoản mà không cần xoá.</small>
                    </div>
                    <input id="adminUserActive" type="checkbox" checked>
                  </div>

                  <div class="admin-toggle">
                    <div>
                      <label for="adminUserMustChangePassword" data-i18n="admin.form.must_change_password">Buộc đổi mật khẩu ở lần đăng nhập kế tiếp</label>
                      <small data-i18n="admin.form.must_change_password.sub">Nên bật khi admin cấp mật khẩu tạm hoặc vừa reset mật khẩu cho user.</small>
                    </div>
                    <input id="adminUserMustChangePassword" type="checkbox" checked>
                  </div>

                  <div class="admin-form-actions">
                    <button class="btn btn-primary" id="btnAdminUserSubmit" type="submit" data-i18n="admin.form.submit_create">Tạo tài khoản</button>
                    <button class="btn btn-secondary" id="btnAdminUserReset" type="button" data-i18n="admin.form.reset">Đặt lại form</button>
                  </div>
                </form>

                <div class="admin-form-note" data-i18n="admin.form.note">Khi đang sửa tài khoản, ô mật khẩu có thể để trống để giữ nguyên mật khẩu cũ. Nếu đổi mật khẩu, mật khẩu mới phải đạt tối thiểu mức Trung bình.</div>
              </div>
            </div>
          </div>

          <div class="admin-tab-panel" data-admin-tab-panel="api">
            <div id="adminApiMount"></div>
          </div>

          <div class="admin-tab-panel" data-admin-tab-panel="system">
            <div id="adminSystemMount"></div>
          </div>
        </div>
      </div>

      <!-- ── Kết nối API ────────────────────────────────────────────────── -->
      <div class="page page-admin-template" id="page-connect" aria-hidden="true">
        <div class="page-header">
          <h1 data-i18n="page.connect.title">Kết nối API</h1>
          <p data-i18n="page.connect.sub">Tự động đồng bộ đơn hàng từ Shopee, TikTok Shop và Lazada qua Open Platform API</p>
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
      <div class="page page-admin-template" id="page-settings" aria-hidden="true">
        <div class="page-header">
          <h1><span data-i18n="page.settings.title">Cài đặt hệ thống</span> <span id="currentVersionBadge" style="font-size:13px;font-weight:500;color:var(--text-muted);vertical-align:middle"></span></h1>
          <p data-i18n="page.settings.sub">Thông tin server, database và các thao tác quản trị nâng cao</p>
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

        <!-- Language management -->
        <div class="card mb-4" id="langSettingsCard">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
            <div class="card-title" style="margin-bottom:0" data-i18n="lang.manage">Quản lý ngôn ngữ</div>
            <label class="btn btn-primary btn-sm" style="cursor:pointer;display:flex;align-items:center;gap:6px">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              <span data-i18n="lang.upload">Upload ngôn ngữ</span>
              <input type="file" id="langFileInput" accept=".json" style="display:none">
            </label>
          </div>
          <div id="langListContent">
            <div style="text-align:center;padding:24px;color:var(--text-muted)">Đang tải...</div>
          </div>
          <div style="margin-top:14px;font-size:12px;color:var(--text-muted)">
            📄 <a href="assets/lang/vi.json" download="lang-template.json" style="color:var(--primary);text-decoration:none" data-i18n="lang.template">Tải file mẫu</a>
            &nbsp;— chỉnh sửa các giá trị (không đổi key), giữ nguyên <code>_meta</code>, rồi upload.
          </div>
        </div>

        <!-- Reconciliation settings -->
        <div class="card mb-4" id="reconcileSettingsCard">
          <div class="reconcile-settings-head">
            <div>
              <div class="card-title" style="margin-bottom:4px">Cài đặt đối soát GBS</div>
              <div class="card-subtitle">Quản lý `Bang_gia` và `Combo_to_single` để đối soát NMV, quy đổi combo và chỉnh sửa trực tiếp ngay trong hệ thống.</div>
            </div>
            <div class="reconcile-settings-actions">
              <button id="btnReloadReconcileSettings" class="btn btn-secondary btn-sm">Tải lại</button>
              <button id="btnSaveReconcileSettings" class="btn btn-primary btn-sm">Lưu cài đặt đối soát</button>
            </div>
          </div>

          <div class="reconcile-settings-banner">
            <strong>NMV đối soát:</strong> Doanh thu giá gốc sản phẩm - Khuyến mãi gian hàng
            <span>(voucher shop và giảm giá nhà bán, không tính phần giảm giá của sàn).</span>
          </div>

          <div class="reconcile-settings-summary" id="reconcileSettingsSummary">
            <span class="reconcile-settings-chip">Đang tải cấu hình đối soát...</span>
          </div>

          <div class="reconcile-settings-grid">
            <section class="reconcile-settings-panel">
              <div class="reconcile-settings-panel-head">
                <div>
                  <h3>Bang_gia</h3>
                  <p>Bảng giá SKU đơn của GBS dùng để phân bổ NMV khi một SKU combo được tách thành nhiều SKU cơ sở.</p>
                </div>
                <div class="reconcile-settings-panel-actions">
                  <button id="btnImportReconcilePrices" class="btn btn-secondary btn-sm">Nhập từ Excel</button>
                  <button id="btnAddReconcilePriceRow" class="btn btn-primary btn-sm">Thêm dòng</button>
                </div>
              </div>
              <div class="reconcile-settings-hint">Nhận file có cột như `Brand code (SKU)` và `Giá trên hóa đơn thanh toán (+VAT)`, hoặc sheet `Bang_gia` trong workbook GBS.</div>
              <div class="table-wrapper">
                <table class="reconcile-settings-table">
                  <thead>
                    <tr>
                      <th>SKU GBS</th>
                      <th>Tên sản phẩm</th>
                      <th class="text-right">Đơn giá</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody id="reconcilePriceTableBody">
                    <tr><td colspan="4" class="reconcile-settings-empty">Đang tải dữ liệu...</td></tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section class="reconcile-settings-panel">
              <div class="reconcile-settings-panel-head">
                <div>
                  <h3>Combo_to_single</h3>
                  <p>Quy đổi SKU combo về SKU đơn của GBS trước khi so sánh số lượng, SKU và NMV với file Shopee, Lazada, TikTok Shop.</p>
                </div>
                <div class="reconcile-settings-panel-actions">
                  <button id="btnImportReconcileCombos" class="btn btn-secondary btn-sm">Nhập từ Excel</button>
                  <button id="btnAddReconcileComboRow" class="btn btn-primary btn-sm">Thêm dòng</button>
                </div>
              </div>
              <div class="reconcile-settings-hint">Nhận file có cột `SKU Sản phẩm`, `Sản phẩm quy đổi N`, `Số lượng sản phẩm N`, hoặc sheet `Combo_to_single` trong workbook GBS.</div>
              <div class="table-wrapper">
                <table class="reconcile-settings-table">
                  <thead>
                    <tr>
                      <th>Sàn</th>
                      <th>SKU combo</th>
                      <th>Tên / từ khóa combo</th>
                      <th>SKU đơn</th>
                      <th class="text-right">SL quy đổi</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody id="reconcileComboTableBody">
                    <tr><td colspan="6" class="reconcile-settings-empty">Đang tải dữ liệu...</td></tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div id="reconcileSettingsResult" class="reconcile-settings-result" aria-live="polite"></div>

          <input type="file" id="reconcilePriceImportInput" accept=".xlsx,.xls" style="display:none">
          <input type="file" id="reconcileComboImportInput" accept=".xlsx,.xls" style="display:none">
        </div>

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

<div class="customer-detail-drawer" id="customerDetailDrawer" aria-hidden="true">
  <div class="customer-detail-backdrop" data-customer-close></div>
  <aside class="customer-detail-panel">
    <div class="customer-detail-header">
      <div class="customer-detail-topline">
        <div>
          <div class="customer-detail-eyebrow" data-i18n="customer.detail.eyebrow">Hồ sơ khách hàng</div>
          <div class="customer-detail-title" id="customerDetailTitle">—</div>
          <div class="customer-detail-subtitle" id="customerDetailSubtitle">—</div>
        </div>
        <button class="customer-close-btn" id="btnCloseCustomerDetail" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="customer-detail-body" id="customerDetailBody">
      <div class="customer-detail-loading" data-i18n="customer.detail.loading">Đang tải thông tin khách hàng...</div>
    </div>
  </aside>
</div>

<div class="password-modal profile-modal" id="profileModal" aria-hidden="true">
  <div class="password-modal-backdrop" data-profile-close></div>
  <div class="password-modal-panel" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle">
    <div class="password-modal-head">
      <div>
        <div class="password-modal-eyebrow" data-i18n="user.menu.account">Tài khoản</div>
        <h3 class="password-modal-title" id="profileModalTitle" data-i18n="account.profile.title">Hồ sơ tài khoản</h3>
        <p class="password-modal-sub" data-i18n="account.profile.sub">Bạn có thể tự cập nhật tên hiển thị và ảnh đại diện dùng trong dashboard.</p>
      </div>
      <button class="password-close-btn" id="btnCloseProfileModal" type="button" aria-label="Close">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <form class="password-form" id="profileForm" autocomplete="off">
      <div class="profile-avatar-section">
        <div class="profile-avatar-preview" id="profileAvatarPreview"><?= htmlspecialchars($initials) ?></div>
        <div class="profile-avatar-actions">
          <input id="profileAvatarFile" type="file" accept="image/png,image/jpeg,image/webp" hidden>
          <button class="btn btn-secondary" id="btnChooseAvatar" type="button" data-i18n="account.profile.choose_avatar">Chọn avatar</button>
          <button class="btn btn-secondary" id="btnRemoveAvatar" type="button" data-i18n="account.profile.remove_avatar">Xóa avatar</button>
          <div class="password-note" data-i18n="account.profile.avatar_hint">Hỗ trợ JPG, PNG, WEBP tối đa 2MB.</div>
        </div>
      </div>

      <div class="password-field">
        <label for="profileFullName" data-i18n="account.profile.full_name">Tên hiển thị</label>
        <input id="profileFullName" type="text" maxlength="255" autocomplete="name">
      </div>

      <div class="password-field">
        <label for="profileUsername" data-i18n="account.profile.username">Tên đăng nhập</label>
        <input id="profileUsername" type="text" disabled>
      </div>

      <div class="password-form-error" id="profileFormError"></div>

      <div class="password-actions">
        <button class="btn btn-secondary" id="btnCancelProfileModal" type="button" data-i18n="account.password.cancel">Đóng</button>
        <button class="btn btn-primary" id="btnSubmitProfileModal" type="submit" data-i18n="account.profile.submit">Lưu hồ sơ</button>
      </div>
    </form>
  </div>
</div>

<div class="password-modal" id="passwordModal" aria-hidden="true">
  <div class="password-modal-backdrop" data-password-close></div>
  <div class="password-modal-panel" role="dialog" aria-modal="true" aria-labelledby="passwordModalTitle">
    <div class="password-modal-head">
      <div>
        <div class="password-modal-eyebrow" data-i18n="user.menu.account">Tài khoản</div>
        <h3 class="password-modal-title" id="passwordModalTitle" data-i18n="account.password.title">Đổi mật khẩu</h3>
        <p class="password-modal-sub" data-i18n="account.password.sub">Mật khẩu mới sẽ được áp dụng ngay cho lần đăng nhập tiếp theo.</p>
      </div>
      <button class="password-close-btn" id="btnClosePasswordModal" type="button" aria-label="Close">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <form class="password-form" id="changePasswordForm" autocomplete="off">
      <div class="password-force-alert" id="passwordForceAlert" hidden>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        </svg>
        <div>
          <strong data-i18n="account.password.force.title">Bạn cần đổi mật khẩu trước khi tiếp tục</strong>
          <span data-i18n="account.password.force.sub">Đây là mật khẩu tạm do admin thiết lập. Mật khẩu mới phải đạt tối thiểu mức Trung bình.</span>
        </div>
      </div>

      <div class="password-field">
        <label for="currentPassword" data-i18n="account.password.current">Mật khẩu hiện tại</label>
        <input id="currentPassword" type="password" autocomplete="current-password" required>
      </div>

      <div class="password-field">
        <label for="newPassword" data-i18n="account.password.new">Mật khẩu mới</label>
        <input id="newPassword" type="password" autocomplete="new-password" required>
        <div class="password-strength is-empty" id="changePasswordStrength">
          <div class="password-strength-bar"><span class="password-strength-fill"></span></div>
          <div class="password-strength-meta">
            <span class="password-strength-value" data-i18n="password.strength.empty">Chưa nhập mật khẩu</span>
            <span class="password-strength-note" data-i18n="password.strength.minimum">Yêu cầu tối thiểu mức Trung bình</span>
          </div>
        </div>
        <div class="password-strength-rules">
          <span class="password-strength-rule" data-password-rule="length" data-i18n="password.rule.length">Từ 8 ký tự trở lên</span>
          <span class="password-strength-rule" data-password-rule="variety" data-i18n="password.rule.variety">Ít nhất 2 nhóm ký tự: chữ, số hoặc ký tự đặc biệt</span>
        </div>
      </div>

      <div class="password-field">
        <label for="confirmPassword" data-i18n="account.password.confirm">Xác nhận mật khẩu mới</label>
        <input id="confirmPassword" type="password" autocomplete="new-password" required>
      </div>

      <div class="password-note" data-i18n="account.password.hint">Mật khẩu mới phải đạt tối thiểu mức Trung bình: từ 8 ký tự và có ít nhất 2 nhóm ký tự.</div>
      <div class="password-form-error" id="changePasswordError"></div>

      <div class="password-actions">
        <button class="btn btn-secondary" id="btnCancelPasswordModal" type="button" data-i18n="account.password.cancel">Đóng</button>
        <button class="btn btn-primary" id="btnSubmitPasswordModal" type="submit" data-i18n="account.password.submit">Cập nhật mật khẩu</button>
      </div>
    </form>
  </div>
</div>

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
      history.replaceState({}, '', location.pathname + '#admin');
      setTimeout(() => window.openAdminTab?.('api'), 300);
    } else if (usp.has('tiktok_error')) {
      toast('Kết nối TikTok thất bại: ' + usp.get('tiktok_error'), 'error');
      history.replaceState({}, '', location.pathname);
    } else if (usp.has('shopee_connected')) {
      toast('Đã kết nối shop Shopee thành công!', 'success');
      history.replaceState({}, '', location.pathname + '#admin');
      setTimeout(() => {
        window.openAdminTab?.('api');
        switchConnectTab('shopee');
      }, 300);
    } else if (usp.has('shopee_error')) {
      toast('Kết nối Shopee thất bại: ' + usp.get('shopee_error'), 'error');
      history.replaceState({}, '', location.pathname);
    } else if (usp.has('lazada_connected')) {
      toast('Đã kết nối tài khoản Lazada thành công!', 'success');
      history.replaceState({}, '', location.pathname + '#admin');
      setTimeout(() => {
        window.openAdminTab?.('api');
        switchConnectTab('lazada');
      }, 300);
    } else if (usp.has('lazada_error')) {
      toast('Kết nối Lazada thất bại: ' + usp.get('lazada_error'), 'error');
      history.replaceState({}, '', location.pathname);
    }
  });
</script>
</body>
</html>
