'use strict';
/* ── i18n — Dashboard v3 ──────────────────────────────────────────────── */

const LANG = {
  vi: {
    // Navigation
    'nav.overview':   'Tổng quan',
    'nav.orders':     'Đơn hàng',
    'nav.products':   'Sản phẩm',
    'nav.customers':  'Khách hàng',
    'nav.traffic':    'Traffic',
    'nav.comparison': 'So sánh',
    'nav.analytics':  'Phân tích',
    'nav.upload':     'Upload',
    'nav.connect':    'Kết nối API',
    'nav.logs':       'Nhật ký',
    'nav.settings':   'Cài đặt',
    'nav.collapse':   'Thu gọn',
    'nav.logout':     'Đăng xuất',
    // Header controls
    'filter.all':          'Tất cả',
    'period.month':        'Tháng',
    'period.year':         'Năm',
    'preset.today':        'Hôm nay',
    'preset.yesterday':    'Hôm qua',
    'preset.7days':        '7 ngày',
    'preset.30days':       '30 ngày',
    'preset.this_month':   'Tháng này',
    'preset.last_month':   'Tháng trước',
    'preset.this_year':    'Năm nay',
    // Page titles
    'page.overview.title': 'Tổng quan',
    'page.overview.sub':   'Doanh thu, đơn hàng và traffic tổng hợp',
    'page.orders.title':   'Đơn hàng',
    'page.orders.sub':     'Chi tiết đơn hàng theo thời gian và trạng thái',
    'page.products.title': 'Sản phẩm',
    'page.products.sub':   'Top sản phẩm theo số lượng và doanh thu',
    'page.customers.title':'Khách hàng',
    'page.customers.sub':  'Phân tích khách hàng theo địa lý và thanh toán',
    'page.traffic.title':  'Traffic',
    'page.traffic.sub':    'Lượt xem, lượt truy cập và tỷ lệ chuyển đổi',
    'page.comparison.title':'So sánh sàn',
    'page.comparison.sub': 'Hiệu suất Shopee, Lazada và TikTok Shop',
    'page.analytics.title':'Phân tích nâng cao',
    'page.analytics.sub':  'Heatmap thời gian đặt hàng và doanh thu theo địa lý',
    'page.upload.title':   'Upload dữ liệu',
    'page.upload.sub':     'Tải lên file Excel từ Shopee, Lazada, TikTok Shop',
    'page.logs.title':     'Nhật ký hoạt động',
    'page.logs.sub':       'Tất cả sự kiện và lỗi được ghi lại tự động',
    'page.connect.title':  'Kết nối API',
    'page.connect.sub':    'Tự động đồng bộ đơn hàng qua Open Platform API',
    'page.settings.title': 'Cài đặt hệ thống',
    'page.settings.sub':   'Thông tin server, database và thao tác quản trị',
    // Overview KPIs
    'kpi.revenue':         'Doanh thu',
    'kpi.revenue.sub':     'Đã hoàn thành',
    'kpi.orders':          'Tổng đơn',
    'kpi.orders.sub':      'Tất cả trạng thái',
    'kpi.completed':       'Hoàn thành',
    'kpi.completed.sub':   'Đã giao / hoàn thành',
    'kpi.views':           'Lượt xem',
    // Orders KPIs
    'kpi.total_orders':    'Tổng đơn',
    'kpi.cancelled':       'Đã huỷ',
    'kpi.cancel_rate':     'Tỷ lệ huỷ',
    // Products KPIs
    'kpi.total_skus':      'Tổng SKU',
    'kpi.qty_sold':        'Tổng SL đã bán',
    'kpi.qty_sold.sub':    'Kể cả đơn huỷ',
    'kpi.qty_delivered':   'Tổng SL đã giao',
    'kpi.qty_del.sub':     'Đơn hoàn thành',
    'kpi.avg_qty':         'SL TB/đơn hàng',
    'kpi.avg_qty.sub':     'Sản phẩm/đơn',
    // Customers KPIs
    'kpi.aov':             'AOV',
    'kpi.aov.sub':         'Giá trị trung bình/đơn',
    'kpi.buyers':          'Người mua',
    'kpi.buyers.sub':      'Người mua khác nhau',
    // Traffic KPIs
    'kpi.traffic_views':   'Lượt xem',
    'kpi.visits':          'Lượt truy cập',
    'kpi.bounce_rate':     'Tỷ lệ thoát TB',
    // Charts
    'chart.revenue_trend':  'Doanh thu theo thời gian',
    'chart.by_platform':    'Phân theo sàn',
    'chart.market_share':   'Thị phần doanh thu',
    'chart.order_trend':    'Xu hướng đơn hàng',
    'chart.completed_vs_cancelled': 'Hoàn thành vs Huỷ',
    'chart.order_status':   'Trạng thái đơn',
    'chart.orders_platform':'Đơn theo sàn',
    'chart.orders_hour':    'Đơn theo giờ trong ngày',
    'chart.top_qty':        'Top sản phẩm bán chạy',
    'chart.by_qty':         'Theo số lượng',
    'chart.top_revenue':    'Top sản phẩm doanh thu cao',
    'chart.by_revenue':     'Theo doanh thu',
    'chart.by_city':        'Phân bổ theo tỉnh / thành',
    'chart.traffic_trend':  'Traffic theo thời gian',
    'chart.traffic_platform':'Traffic theo sàn',
    'chart.radar':          'Radar tổng hợp',
    'chart.revenue_city':   'Doanh thu theo tỉnh / thành',
    'chart.top15':          'Top 15 địa phương',
    // Cards
    'card.recent_orders':   'Đơn hàng gần đây',
    'card.top_products':    'Top sản phẩm',
    'card.order_list':      'Danh sách đơn hàng',
    'card.product_list':    'Danh sách sản phẩm',
    'card.top5_revenue':    'Top 5 doanh thu',
    'card.top_locations':   'Top địa phương',
    'card.orders_heatmap':  'Đơn hàng theo ngày & giờ',
    'card.rev_heatmap':     'Doanh thu theo ngày & giờ',
    // Table headers
    'th.order_id':          'Mã đơn',
    'th.product':           'Sản phẩm',
    'th.platform':          'Sàn',
    'th.date':              'Ngày đặt',
    'th.value':             'Giá trị',
    'th.status':            'Trạng thái',
    'th.sku':               'SKU',
    'th.product_name':      'Tên sản phẩm',
    'th.qty':               'SL',
    'th.revenue':           'Doanh thu',
    // Misc
    'common.low':           'Ít',
    'common.high':          'Nhiều',
    'login.sub':            'Đăng nhập để tiếp tục',
    'login.user':           'Tên đăng nhập',
    'login.pass':           'Mật khẩu',
    'login.btn':            'Đăng nhập',
  },

  en: {
    // Navigation
    'nav.overview':   'Overview',
    'nav.orders':     'Orders',
    'nav.products':   'Products',
    'nav.customers':  'Customers',
    'nav.traffic':    'Traffic',
    'nav.comparison': 'Comparison',
    'nav.analytics':  'Analytics',
    'nav.upload':     'Upload',
    'nav.connect':    'API Connect',
    'nav.logs':       'Activity Logs',
    'nav.settings':   'Settings',
    'nav.collapse':   'Collapse',
    'nav.logout':     'Sign out',
    // Header controls
    'filter.all':          'All',
    'period.month':        'Month',
    'period.year':         'Year',
    'preset.today':        'Today',
    'preset.yesterday':    'Yesterday',
    'preset.7days':        '7 days',
    'preset.30days':       '30 days',
    'preset.this_month':   'This month',
    'preset.last_month':   'Last month',
    'preset.this_year':    'This year',
    // Page titles
    'page.overview.title': 'Overview',
    'page.overview.sub':   'Revenue, orders and traffic summary',
    'page.orders.title':   'Orders',
    'page.orders.sub':     'Order details by time and status',
    'page.products.title': 'Products',
    'page.products.sub':   'Top products by quantity and revenue',
    'page.customers.title':'Customers',
    'page.customers.sub':  'Customer analysis by geography and payment',
    'page.traffic.title':  'Traffic',
    'page.traffic.sub':    'Views, visits and conversion rate',
    'page.comparison.title':'Platform Comparison',
    'page.comparison.sub': 'Shopee, Lazada and TikTok Shop performance',
    'page.analytics.title':'Advanced Analytics',
    'page.analytics.sub':  'Order time heatmap and revenue by geography',
    'page.upload.title':   'Upload Data',
    'page.upload.sub':     'Upload Excel files from Shopee, Lazada, TikTok Shop',
    'page.logs.title':     'Activity Logs',
    'page.logs.sub':       'All events and errors are automatically logged',
    'page.connect.title':  'API Connections',
    'page.connect.sub':    'Auto-sync orders via Open Platform API',
    'page.settings.title': 'System Settings',
    'page.settings.sub':   'Server info, database and administration',
    // Overview KPIs
    'kpi.revenue':         'Revenue',
    'kpi.revenue.sub':     'Completed',
    'kpi.orders':          'Total Orders',
    'kpi.orders.sub':      'All statuses',
    'kpi.completed':       'Completed',
    'kpi.completed.sub':   'Delivered / completed',
    'kpi.views':           'Views',
    // Orders KPIs
    'kpi.total_orders':    'Total Orders',
    'kpi.cancelled':       'Cancelled',
    'kpi.cancel_rate':     'Cancel Rate',
    // Products KPIs
    'kpi.total_skus':      'Total SKUs',
    'kpi.qty_sold':        'Total Qty Sold',
    'kpi.qty_sold.sub':    'Incl. cancelled',
    'kpi.qty_delivered':   'Total Qty Delivered',
    'kpi.qty_del.sub':     'Completed orders',
    'kpi.avg_qty':         'Avg Qty/Order',
    'kpi.avg_qty.sub':     'Products/order',
    // Customers KPIs
    'kpi.aov':             'AOV',
    'kpi.aov.sub':         'Average value per order',
    'kpi.buyers':          'Buyers',
    'kpi.buyers.sub':      'Unique buyers',
    // Traffic KPIs
    'kpi.traffic_views':   'Views',
    'kpi.visits':          'Visits',
    'kpi.bounce_rate':     'Avg Bounce Rate',
    // Charts
    'chart.revenue_trend':  'Revenue over time',
    'chart.by_platform':    'By platform',
    'chart.market_share':   'Revenue market share',
    'chart.order_trend':    'Order trend',
    'chart.completed_vs_cancelled': 'Completed vs Cancelled',
    'chart.order_status':   'Order status',
    'chart.orders_platform':'Orders by platform',
    'chart.orders_hour':    'Orders by hour of day',
    'chart.top_qty':        'Best-selling products',
    'chart.by_qty':         'By quantity',
    'chart.top_revenue':    'Top revenue products',
    'chart.by_revenue':     'By revenue',
    'chart.by_city':        'Distribution by province / city',
    'chart.traffic_trend':  'Traffic over time',
    'chart.traffic_platform':'Traffic by platform',
    'chart.radar':          'Overall Radar',
    'chart.revenue_city':   'Revenue by province / city',
    'chart.top15':          'Top 15 locations',
    // Cards
    'card.recent_orders':   'Recent Orders',
    'card.top_products':    'Top Products',
    'card.order_list':      'Order List',
    'card.product_list':    'Product List',
    'card.top5_revenue':    'Top 5 Revenue',
    'card.top_locations':   'Top Locations',
    'card.orders_heatmap':  'Orders by day & hour',
    'card.rev_heatmap':     'Revenue by day & hour',
    // Table headers
    'th.order_id':          'Order ID',
    'th.product':           'Product',
    'th.platform':          'Platform',
    'th.date':              'Date',
    'th.value':             'Value',
    'th.status':            'Status',
    'th.sku':               'SKU',
    'th.product_name':      'Product Name',
    'th.qty':               'Qty',
    'th.revenue':           'Revenue',
    // Misc
    'common.low':           'Low',
    'common.high':          'High',
    'login.sub':            'Sign in to continue',
    'login.user':           'Username',
    'login.pass':           'Password',
    'login.btn':            'Sign in',
  }
};

let _lang = localStorage.getItem('lang') || 'vi';

function t(key) {
  return LANG[_lang]?.[key] ?? LANG.vi[key] ?? key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = LANG[_lang]?.[key] ?? LANG.vi[key];
    if (val !== undefined) el.textContent = val;
  });
  // Update nav data-label tooltips (used when sidebar is collapsed)
  document.querySelectorAll('.nav-item[data-label]').forEach(item => {
    const page = item.dataset.page;
    const map = {
      overview: 'nav.overview', orders: 'nav.orders', products: 'nav.products',
      customers: 'nav.customers', traffic: 'nav.traffic', comparison: 'nav.comparison',
      heatmaps: 'nav.analytics', upload: 'nav.upload', connect: 'nav.connect',
      logs: 'nav.logs', settings: 'nav.settings',
    };
    if (map[page]) item.dataset.label = t(map[page]);
  });
  const btn = document.getElementById('btnLang');
  if (btn) btn.textContent = _lang === 'vi' ? 'EN' : 'VI';
  document.documentElement.lang = _lang === 'vi' ? 'vi' : 'en';
}

function setLang(lang) {
  _lang = lang;
  localStorage.setItem('lang', lang);
  applyTranslations();
}

function getLang() { return _lang; }
