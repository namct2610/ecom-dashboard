/* global React */
/* eslint-disable */

// ── Utilities ──────────────────────────────────────────────────────────

const isNum = (n) => Number.isFinite(Number(n));
const safeNum = (n, fallback = 0) => isNum(n) ? Number(n) : fallback;
const safeDiv = (num, den, fallback = 0) => {
  const d = safeNum(den);
  return d === 0 ? fallback : safeNum(num) / d;
};
const safePct = (num, den, fallback = 0) => safeDiv(num, den, fallback) * 100;

const fmtVnd = (n) => {
  if (!isNum(n)) return '—';
  n = Number(n);
  if (n >= 1e9) return (n/1e9).toFixed(2).replace(/\.?0+$/,'') + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'') + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(0) + 'K';
  return String(Math.round(n));
};
const fmtFull = (n) => {
  if (!isNum(n)) return '—';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n));
};
const fmtPct = (n, d=1) => (!isNum(n) ? '—' : Number(n).toFixed(d)+'%');

const PLATFORM_COLORS = {
  shopee: '#FF5722',
  lazada: '#4F46E5',
  tiktok: '#111827',
};
const PLATFORM_COLORS_2 = {
  shopee: '#FF8A65',
  lazada: '#818CF8',
  tiktok: '#374151',
};
const PLATFORM_NAME = { shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok Shop' };

// ── i18n ───────────────────────────────────────────────────────────────
const BETA_I18N = {
  vi: {
    // Groups
    'grp.analytics':'Phân tích','grp.sales':'Bán hàng','grp.customers':'Khách hàng',
    'grp.operations':'Vận hành','grp.system':'Hệ thống',
    // Nav items + subs
    'nav.overview':'Tổng quan','nav.overview.sub':'Doanh thu, đơn hàng và traffic tổng hợp',
    'nav.plan':'Kế hoạch','nav.plan.sub':'Mục tiêu năm và run-rate cần đạt',
    'nav.comparison':'So sánh sàn','nav.comparison.sub':'Đối chiếu Shopee, Lazada, TikTok',
    'nav.orders':'Đơn hàng','nav.orders.sub':'Phân tích đơn hàng theo thời gian',
    'nav.products':'Sản phẩm','nav.products.sub':'Top sản phẩm theo doanh thu và số lượng',
    'nav.customers':'Khách hàng','nav.customers.sub':'Phân tích khách hàng theo địa lý',
    'nav.customer_detail':'Chi tiết khách hàng','nav.customer_detail.sub':'Doanh thu và số đơn theo từng khách',
    'nav.traffic':'Lượng truy cập','nav.traffic.sub':'PV, Visitors và tỷ lệ chuyển đổi',
    'nav.reconcile':'Đối soát GBS','nav.reconcile.sub':'Khớp file GBS với export từ các sàn',
    'nav.data_links':'Liên kết dữ liệu sàn','nav.data_links.sub':'Quy tắc khớp dữ liệu sàn với GBS',
    'nav.product_catalog':'Danh sách sản phẩm','nav.product_catalog.sub':'SKU, giá GBS và quy đổi Combo',
    'nav.upload':'Upload dữ liệu','nav.upload.sub':'Tải file Excel từ Shopee, Lazada, TikTok',
    'nav.logs':'Nhật ký','nav.logs.sub':'Sự kiện và lỗi hệ thống',
    'nav.settings':'Cài đặt','nav.settings.sub':'Hồ sơ, ngôn ngữ, thông báo',
    'nav.admin':'Quản trị','nav.admin.sub':'Tài khoản, API kết nối, hệ thống',
    // Topbar / sidebar
    'filter.all':'Tất cả','user.admin':'Quản trị viên','user.staff':'Nhân viên',
    'sidebar.collapse':'Thu gọn','sidebar.profile':'Hồ sơ tài khoản',
    'sidebar.admin_panel':'Quản trị hệ thống','sidebar.logout':'Đăng xuất',
    'topbar.combo_tip':'COMBO: nguyên gốc từ sàn · SKU: tách thành sản phẩm đơn lẻ',
    // Period picker
    'period.by_month':'Theo tháng','period.by_range':'Theo phạm vi','period.by_year':'Theo năm',
    'period.quick_pick':'Chọn nhanh','period.by_period':'Chọn theo kỳ',
    'period.today':'Hôm nay','period.yesterday':'Hôm qua',
    'period.7days':'7 ngày','period.30days':'30 ngày',
    'period.this_month':'Tháng này','period.last_month':'Tháng trước',
    'period.this_year':'Năm nay','period.last_year':'Năm trước',
    'period.from':'Từ ngày','period.to':'Đến ngày','period.apply':'Áp dụng','period.year_label':'Năm',
    // KPI
    'kpi.total_orders':'Tổng đơn hàng','kpi.completed':'Đơn hoàn thành',
    'kpi.cancel_rate':'Tỷ lệ huỷ đơn','kpi.visitors':'Lượt truy cập',
    'kpi.vs_prev':'so với kỳ trước','kpi.pct_of_total':'% trên tổng',
    'kpi.page_views':'lượt xem','kpi.orders_cancelled':'đơn bị huỷ',
    'kpi.goal_target':'mục tiêu < 15%',
    // Overview
    'overview.hero.label':'Doanh thu','overview.current_period':'kỳ hiện tại',
    'overview.hero.sub':'Đã hoàn thành · 3 sàn thương mại điện tử',
    'overview.aov_per_order':'/ đơn TB','overview.completed_orders':'đơn hoàn thành',
    'overview.by_platform':'Phân chia theo sàn','overview.platform_perf':'Hiệu suất từng sàn',
    'overview.monthly_revenue':'Doanh thu tháng',
    'overview.total_label':'Tổng','overview.market_share':'thị phần',
    // Charts
    'chart.revenue_trend':'Doanh thu theo thời gian','chart.market_share':'Thị phần doanh thu',
    'chart.top10':'Top 10 sản phẩm bán chạy','chart.recent_orders':'Đơn hàng gần đây',
    'chart.latest_update':'Cập nhật mới nhất','chart.view_all':'Xem tất cả →',
    'chart.3platforms':'3 sàn TMĐT',
    'chart.orders_by_day':'Số đơn theo ngày · 3 sàn',
    'chart.aov_by_day':'Giá trị đơn trung bình theo ngày',
    'chart.by_3platforms':'Phân theo 3 sàn',
    // Tabs
    'tab.revenue':'Doanh thu','tab.orders':'Đơn hàng','tab.aov':'AOV',
    'tab.by_revenue':'Doanh thu','tab.by_qty':'Số lượng',
    'tab.all':'Tất cả','tab.completed':'Hoàn thành','tab.cancelled':'Huỷ',
    // Table headers
    'th.order_id':'Mã đơn','th.platform':'Sàn','th.status':'Trạng thái','th.amount':'Giá trị',
    // Status
    'status.completed':'Hoàn thành','status.delivered':'Hoàn thành',
    'status.cancelled':'Đã huỷ','status.shipping':'Đang giao',
    // Orders page
    'orders.kpi.total':'Tổng đơn','orders.kpi.completed':'Hoàn thành',
    'orders.kpi.cancelled':'Đã huỷ','orders.kpi.cancel_rate':'Tỷ lệ huỷ',
    'orders.kpi.completed_sub':'thành công','orders.kpi.target_sub':'mục tiêu < 15%',
    'orders.chart.title':'Xu hướng đơn hàng','orders.chart.sub':'Số đơn theo ngày, phân theo sàn',
    'orders.donut.title':'Trạng thái đơn hàng',
    'orders.donut.total':'Tổng đơn',
    'orders.heatmap.title':'Khung giờ đặt hàng cao điểm',
    'orders.heatmap.sub':'Heatmap đơn hàng theo thứ trong tuần × giờ trong ngày',
    'orders.heatmap.low':'Thấp','orders.heatmap.mid':'TB','orders.heatmap.high':'Cao',
    // Peak insights
    'peak.golden':'Giờ vàng','peak.dead':'Khung giờ chết','peak.avg':'Trung bình giờ',
    'peak.dead_desc':'Không có đơn nào — chủ yếu 02–05h sáng','peak.avg_desc':'Trên 7×24 = 168 khung giờ',
    'peak.orders_suffix':'đơn','peak.total_month':'% tổng tháng',
    'peak.dead_suffix':'giờ / tuần',
    'wd.0':'Chủ nhật','wd.1':'Thứ 2','wd.2':'Thứ 3','wd.3':'Thứ 4',
    'wd.4':'Thứ 5','wd.5':'Thứ 6','wd.6':'Thứ 7',
    // Products page
    'products.kpi.sku_count':'Số SKU đang bán','products.kpi.sku_sub':'Tất cả 3 sàn',
    'products.kpi.qty_sold':'Số lượng đã bán','products.kpi.top10_rev':'Doanh thu top 10',
    'products.kpi.bestseller':'Sản phẩm bán chạy nhất','products.kpi.sold':'bán',
    'products.kpi.total_dt':'tổng DT',
    'products.chart.treemap':'Phân bố doanh thu theo sản phẩm',
    'products.chart.treemap_sub':'Kích thước thể hiện tỷ trọng doanh thu',
    'products.top_rev':'Top theo doanh thu','products.top_rev_sub':'10 sản phẩm doanh thu cao nhất',
    'products.top_qty':'Top theo số lượng','products.top_qty_sub':'10 sản phẩm bán nhiều nhất',
    'products.no_data':'Chưa có dữ liệu sản phẩm trong kỳ này.',
    'unit.orders':'đơn','unit.products':'sp',
    // Traffic page
    'traffic.kpi.views':'Tổng lượt xem','traffic.kpi.views_sub':'page views',
    'traffic.kpi.visitors':'Lượt truy cập','traffic.kpi.vis_sub':'unique visitors',
    'traffic.kpi.pv_per_vis':'PV / Visitor','traffic.kpi.pv_unit':'trang/khách',
    'traffic.kpi.conv':'Tỷ lệ chuyển đổi','traffic.kpi.conv_sub':'visitor → đơn',
    'traffic.chart.title':'Lượt xem & lượt truy cập theo ngày',
    'traffic.rev_vs_views':'Doanh thu vs Lượt xem','traffic.rev_vs_views_sub':'Mối tương quan PV → conversion',
    'traffic.plat_perf':'Hiệu suất theo sàn','traffic.plat_perf_sub':'PV, Visitors, Đơn hàng, Conversion',
    'traffic.th.views':'Lượt xem','traffic.th.visitors':'Visitors',
    'traffic.th.orders':'Đơn','traffic.th.conv':'Conversion',
    // Customers
    'customers.kpi.total':'Tổng khách hàng','customers.kpi.total_sub':'người mua trong kỳ',
    'customers.kpi.avg_orders':'Đơn TB/khách','customers.kpi.avg_orders_sub':'số đơn/người',
    'customers.kpi.aov':'AOV','customers.kpi.aov_sub':'Giá trị đơn TB',
    'customers.kpi.top_market':'Thị trường chính',
    'customers.chart.by_city':'Phân bố khách theo tỉnh / thành phố',
    'customers.chart.by_city_sub':'Top khu vực có nhiều đơn nhất',
    'customers.chart.geo':'Tập trung địa lý','customers.chart.geo_sub':'Hà Nội & TP.HCM dẫn dắt doanh số',
    'customers.returning':'Khách quay lại','customers.new_growth':'Tăng trưởng khách mới',
    'customers.potential':'Khách hàng tiềm năng','customers.potential_sub':'đã mua trước kỳ này',
    'customers.no_city_data':'Chưa có dữ liệu khách hàng theo tỉnh / thành trong kỳ này.',
    'customers.detail.title':'Chi tiết khách hàng',
    'customers.detail.sub':'Doanh thu, số đơn và thời điểm mua gần nhất của từng khách',
    'customers.search_placeholder':'Tìm tên, username, khu vực...',
    'customers.kpi.in_table':'Khách trong bảng','customers.kpi.revenue':'Doanh thu',
    'customers.kpi.order_count':'Số đơn','customers.kpi.rev_sub':'theo khách đang lọc',
    'customers.kpi.orders_sub':'đơn hoàn thành / đã giao',
    'customers.th.customer':'Khách hàng','customers.th.area':'Khu vực',
    'customers.th.orders':'Số đơn','customers.th.products':'Sản phẩm',
    'customers.th.revenue':'Doanh thu','customers.th.last_purchase':'Mua gần nhất',
    'customers.no_match':'Chưa có khách hàng phù hợp với bộ lọc.',
    'customers.unknown_name':'Khách chưa đặt tên',
    // Comparison page
    'comparison.orders_share':'đơn · {pct}% tổng',
    'comparison.completion_rate':'Tỷ lệ hoàn thành','comparison.cancel_rate':'Tỷ lệ huỷ',
    'comparison.radar.title':'Radar 5 chỉ số','comparison.radar.sub':'So sánh đa chiều giữa 3 sàn',
    'comparison.completed_vs':'Hoàn thành vs Đã huỷ','comparison.completed_vs_sub':'Số đơn theo trạng thái, mỗi sàn',
    'comparison.top_products':'Sản phẩm bán chạy theo sàn','comparison.top_products_sub':'Top 3 SKU mỗi sàn theo doanh thu',
    'comparison.sold':'đã bán','comparison.no_data':'Chưa có dữ liệu',
    'comparison.radar.orders':'Số đơn','comparison.radar.revenue':'Doanh thu',
    'comparison.radar.aov':'AOV','comparison.radar.completed':'Hoàn thành','comparison.radar.new_buyers':'Khách hàng mới',
    // Plan page
    'plan.hero.label':'Mục tiêu năm','plan.ytd_progress':'Tiến độ YTD',
    'plan.months_of_12':'tháng','plan.on_track':'↑ Đúng tiến độ','plan.behind':'↓ Chậm tiến độ',
    'plan.progress_label':'Tiến độ đạt mục tiêu','plan.remaining':'Còn',
    'plan.achieved':'Đã đạt','plan.pace_marker':'Mốc','plan.months':'tháng',
    'plan.runrate_label':'Run-rate cần đạt','plan.runrate_sub':'mỗi tháng còn lại',
    'plan.current_month':'Tháng hiện tại',
    // App
    'app.loading':'Đang tải dữ liệu…','brand.sub':'TMĐT Suite',
    // Notifications
    'notif.title':'Thông báo','notif.mark_read':'Đánh dấu đã đọc','notif.view_all':'Xem tất cả thông báo →',
    // User menu
    'usermenu.profile':'Hồ sơ tài khoản','usermenu.password':'Đổi mật khẩu',
    'usermenu.lang':'Ngôn ngữ','usermenu.admin':'Quản trị hệ thống','usermenu.logout':'Đăng xuất',
    // Previous period label suffix
    'period.prev_label':'kỳ trước',
  },
  en: {
    // Groups
    'grp.analytics':'Analytics','grp.sales':'Sales','grp.customers':'Customers',
    'grp.operations':'Operations','grp.system':'System',
    // Nav items + subs
    'nav.overview':'Overview','nav.overview.sub':'Revenue, orders and traffic summary',
    'nav.plan':'Plan','nav.plan.sub':'Annual targets and run-rate needed',
    'nav.comparison':'Comparison','nav.comparison.sub':'Compare Shopee, Lazada, TikTok',
    'nav.orders':'Orders','nav.orders.sub':'Order analysis over time',
    'nav.products':'Products','nav.products.sub':'Top products by revenue and quantity',
    'nav.customers':'Customers','nav.customers.sub':'Customer analysis by geography',
    'nav.customer_detail':'Customer Detail','nav.customer_detail.sub':'Revenue and orders per customer',
    'nav.traffic':'Traffic','nav.traffic.sub':'PV, Visitors and conversion rate',
    'nav.reconcile':'GBS Reconcile','nav.reconcile.sub':'Match GBS file against platform exports',
    'nav.data_links':'Platform Data Links','nav.data_links.sub':'Platform data mapping rules for GBS',
    'nav.product_catalog':'Product List','nav.product_catalog.sub':'SKUs, GBS prices and Combo conversions',
    'nav.upload':'Upload Data','nav.upload.sub':'Upload Excel files from Shopee, Lazada, TikTok',
    'nav.logs':'Logs','nav.logs.sub':'System events and errors',
    'nav.settings':'Settings','nav.settings.sub':'Profile, language, notifications',
    'nav.admin':'Admin','nav.admin.sub':'Accounts, API connections, system',
    // Topbar / sidebar
    'filter.all':'All','user.admin':'Administrator','user.staff':'Staff',
    'sidebar.collapse':'Collapse','sidebar.profile':'Account Profile',
    'sidebar.admin_panel':'Admin Panel','sidebar.logout':'Sign out',
    'topbar.combo_tip':'COMBO: original platform item · SKU: split into individual products',
    // Period picker
    'period.by_month':'By Month','period.by_range':'By Range','period.by_year':'By Year',
    'period.quick_pick':'Quick Pick','period.by_period':'By Period',
    'period.today':'Today','period.yesterday':'Yesterday',
    'period.7days':'7 days','period.30days':'30 days',
    'period.this_month':'This month','period.last_month':'Last month',
    'period.this_year':'This year','period.last_year':'Last year',
    'period.from':'From','period.to':'To','period.apply':'Apply','period.year_label':'Year',
    // KPI
    'kpi.total_orders':'Total Orders','kpi.completed':'Completed',
    'kpi.cancel_rate':'Cancel Rate','kpi.visitors':'Visitors',
    'kpi.vs_prev':'vs. prior period','kpi.pct_of_total':'% of total',
    'kpi.page_views':'page views','kpi.orders_cancelled':'cancelled',
    'kpi.goal_target':'target < 15%',
    // Overview
    'overview.hero.label':'Revenue','overview.current_period':'current period',
    'overview.hero.sub':'Completed orders · 3 e-commerce platforms',
    'overview.aov_per_order':'/ avg. order','overview.completed_orders':'completed orders',
    'overview.by_platform':'By platform','overview.platform_perf':'Platform Performance',
    'overview.monthly_revenue':'Monthly revenue',
    'overview.total_label':'Total','overview.market_share':'market share',
    // Charts
    'chart.revenue_trend':'Revenue Over Time','chart.market_share':'Revenue Market Share',
    'chart.top10':'Top 10 Best-Selling Products','chart.recent_orders':'Recent Orders',
    'chart.latest_update':'Latest updates','chart.view_all':'View all →',
    'chart.3platforms':'3 Platforms',
    'chart.orders_by_day':'Daily orders · 3 platforms',
    'chart.aov_by_day':'Average order value per day',
    'chart.by_3platforms':'By 3 platforms',
    // Tabs
    'tab.revenue':'Revenue','tab.orders':'Orders','tab.aov':'AOV',
    'tab.by_revenue':'Revenue','tab.by_qty':'Quantity',
    'tab.all':'All','tab.completed':'Completed','tab.cancelled':'Cancelled',
    // Table headers
    'th.order_id':'Order ID','th.platform':'Platform','th.status':'Status','th.amount':'Amount',
    // Status
    'status.completed':'Completed','status.delivered':'Completed',
    'status.cancelled':'Cancelled','status.shipping':'Shipping',
    // Orders page
    'orders.kpi.total':'Total Orders','orders.kpi.completed':'Completed',
    'orders.kpi.cancelled':'Cancelled','orders.kpi.cancel_rate':'Cancel Rate',
    'orders.kpi.completed_sub':'success rate','orders.kpi.target_sub':'target < 15%',
    'orders.chart.title':'Order Trends','orders.chart.sub':'Orders per day, by platform',
    'orders.donut.title':'Order Status','orders.donut.total':'Total Orders',
    'orders.heatmap.title':'Peak Order Times',
    'orders.heatmap.sub':'Order heatmap by day of week × hour',
    'orders.heatmap.low':'Low','orders.heatmap.mid':'Mid','orders.heatmap.high':'High',
    // Peak insights
    'peak.golden':'Peak Hour','peak.dead':'Dead Hours','peak.avg':'Avg / Hour',
    'peak.dead_desc':'No orders — mainly 2–5 AM','peak.avg_desc':'Over 7×24 = 168 slots',
    'peak.orders_suffix':'orders','peak.total_month':'% of month',
    'peak.dead_suffix':'hrs / week',
    'wd.0':'Sun','wd.1':'Mon','wd.2':'Tue','wd.3':'Wed',
    'wd.4':'Thu','wd.5':'Fri','wd.6':'Sat',
    // Products page
    'products.kpi.sku_count':'Active SKUs','products.kpi.sku_sub':'All 3 platforms',
    'products.kpi.qty_sold':'Quantity Sold','products.kpi.top10_rev':'Top 10 Revenue',
    'products.kpi.bestseller':'Best Seller','products.kpi.sold':'sold',
    'products.kpi.total_dt':'of total rev',
    'products.chart.treemap':'Revenue Distribution by Product',
    'products.chart.treemap_sub':'Size represents revenue share',
    'products.top_rev':'Top by Revenue','products.top_rev_sub':'Top 10 by revenue',
    'products.top_qty':'Top by Quantity','products.top_qty_sub':'Top 10 units sold',
    'products.no_data':'No product data for this period.',
    'unit.orders':'orders','unit.products':'items',
    // Traffic page
    'traffic.kpi.views':'Total Page Views','traffic.kpi.views_sub':'page views',
    'traffic.kpi.visitors':'Visitors','traffic.kpi.vis_sub':'unique visitors',
    'traffic.kpi.pv_per_vis':'PV / Visitor','traffic.kpi.pv_unit':'pages/visitor',
    'traffic.kpi.conv':'Conversion Rate','traffic.kpi.conv_sub':'visitor → order',
    'traffic.chart.title':'Page Views & Visitors by Day',
    'traffic.rev_vs_views':'Revenue vs Page Views','traffic.rev_vs_views_sub':'PV → conversion correlation',
    'traffic.plat_perf':'Platform Performance','traffic.plat_perf_sub':'PV, Visitors, Orders, Conversion',
    'traffic.th.views':'Views','traffic.th.visitors':'Visitors',
    'traffic.th.orders':'Orders','traffic.th.conv':'Conversion',
    // Customers
    'customers.kpi.total':'Total Customers','customers.kpi.total_sub':'buyers this period',
    'customers.kpi.avg_orders':'Orders / Customer','customers.kpi.avg_orders_sub':'orders per buyer',
    'customers.kpi.aov':'AOV','customers.kpi.aov_sub':'Avg. order value',
    'customers.kpi.top_market':'Top Market',
    'customers.chart.by_city':'Customers by Province / City',
    'customers.chart.by_city_sub':'Top regions by orders',
    'customers.chart.geo':'Geographic Concentration','customers.chart.geo_sub':'Hanoi & HCMC lead sales',
    'customers.returning':'Returning Customers','customers.new_growth':'New Customer Growth',
    'customers.potential':'Potential Customers','customers.potential_sub':'purchased before this period',
    'customers.no_city_data':'No customer data by city for this period.',
    'customers.detail.title':'Customer Detail',
    'customers.detail.sub':'Revenue, orders, and last purchase date per customer',
    'customers.search_placeholder':'Search name, username, area...',
    'customers.kpi.in_table':'Customers in Table','customers.kpi.revenue':'Revenue',
    'customers.kpi.order_count':'Orders','customers.kpi.rev_sub':'filtered customers',
    'customers.kpi.orders_sub':'completed / delivered orders',
    'customers.th.customer':'Customer','customers.th.area':'Area',
    'customers.th.orders':'Orders','customers.th.products':'Items',
    'customers.th.revenue':'Revenue','customers.th.last_purchase':'Last Purchase',
    'customers.no_match':'No customers match the filter.',
    'customers.unknown_name':'Unknown Customer',
    // Comparison page
    'comparison.orders_share':'orders · {pct}% share',
    'comparison.completion_rate':'Completion Rate','comparison.cancel_rate':'Cancel Rate',
    'comparison.radar.title':'5-Metric Radar','comparison.radar.sub':'Multi-dimensional comparison across 3 platforms',
    'comparison.completed_vs':'Completed vs Cancelled','comparison.completed_vs_sub':'Orders by status per platform',
    'comparison.top_products':'Top Products by Platform','comparison.top_products_sub':'Top 3 SKUs per platform by revenue',
    'comparison.sold':'sold','comparison.no_data':'No data yet',
    'comparison.radar.orders':'Orders','comparison.radar.revenue':'Revenue',
    'comparison.radar.aov':'AOV','comparison.radar.completed':'Completion','comparison.radar.new_buyers':'New Buyers',
    // Plan page
    'plan.hero.label':'Annual Target','plan.ytd_progress':'YTD Progress',
    'plan.months_of_12':'months','plan.on_track':'↑ On Track','plan.behind':'↓ Behind',
    'plan.progress_label':'Progress toward target','plan.remaining':'Remaining',
    'plan.achieved':'Achieved','plan.pace_marker':'Milestone','plan.months':'months',
    'plan.runrate_label':'Run-rate needed','plan.runrate_sub':'per remaining month',
    'plan.current_month':'Current Month',
    // App
    'app.loading':'Loading data…','brand.sub':'E-Commerce Suite',
    // Notifications
    'notif.title':'Notifications','notif.mark_read':'Mark all read','notif.view_all':'View all notifications →',
    // User menu
    'usermenu.profile':'Account Profile','usermenu.password':'Change Password',
    'usermenu.lang':'Language','usermenu.admin':'Admin Panel','usermenu.logout':'Sign out',
    // Previous period label suffix
    'period.prev_label':'prior period',
  },
};

const LangCtx = React.createContext({ lang: 'vi', setLang: () => {} });

function useT() {
  const { lang } = React.useContext(LangCtx);
  return (key, fallback) => {
    const dict = BETA_I18N[lang] || BETA_I18N.vi;
    return dict[key] ?? fallback ?? key;
  };
}

// Build a smooth (Catmull-Rom → bezier) path
function smoothPath(points) {
  if (!points.length) return '';
  if (points.length < 3) return points.map((p,i)=>(i?'L':'M')+p[0]+','+p[1]).join(' ');
  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i-1] || points[i];
    const p1 = points[i];
    const p2 = points[i+1];
    const p3 = points[i+2] || p2;
    const cp1x = p1[0] + (p2[0]-p0[0])/6;
    const cp1y = p1[1] + (p2[1]-p0[1])/6;
    const cp2x = p2[0] - (p3[0]-p1[0])/6;
    const cp2y = p2[1] - (p3[1]-p1[1])/6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// useResize: returns ref + width
function useWidth() {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(600);
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      const cw = entries[0].contentRect.width;
      if (cw > 0) setW(cw);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ── Sparkline (KPI background) ─────────────────────────────────────────

function Sparkline({ data, color, fill = true, height = 50, strokeWidth = 2 }) {
  const [ref, w] = useWidth();
  if (!data || !data.length) return <div ref={ref} style={{width:'100%', height}} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pad = 2;
  const points = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (w - pad*2),
    height - pad - ((v - min) / range) * (height - pad*2),
  ]);
  const path = smoothPath(points);
  const area = path + ` L ${points[points.length-1][0]},${height} L ${points[0][0]},${height} Z`;
  const gid = React.useId();
  return (
    <div ref={ref} style={{width:'100%', height}}>
      <svg width={w} height={height} style={{display:'block'}}>
        {fill && (
          <>
            <defs>
              <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.55" />
                <stop offset="100%" stopColor={color} stopOpacity="0.05" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gid})`} />
          </>
        )}
        <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── Area Chart (multi-series with hover scrub) ─────────────────────────

function AreaChart({ series, labels, height = 260, mode = 'area', stacked = true, formatY = fmtVnd }) {
  // series: [{ key, name, color, data: [..] }]
  const [ref, w] = useWidth();
  const [hover, setHover] = React.useState(null);
  const ML = 48, MR = 14, MT = 16, MB = 28;
  const innerW = Math.max(1, w - ML - MR);
  const innerH = Math.max(1, height - MT - MB);
  const N = labels.length || 1;

  // For stacked: compute cumulative
  const stacks = series.map((s, idx) => {
    const cum = s.data.map((v, i) => v + (stacked ? series.slice(0, idx).reduce((a,b)=>a+b.data[i], 0) : 0));
    return { ...s, cum };
  });
  const rawMaxVal = stacked
    ? Math.max(...labels.map((_, i) => series.reduce((a,b)=>a+b.data[i], 0)), 0)
    : Math.max(...series.flatMap(s => s.data), 0);
  const emptyScale = rawMaxVal <= 0;
  const maxVal = emptyScale ? 1 : rawMaxVal;

  const x = (i) => ML + (N === 1 ? innerW/2 : (i / (N - 1)) * innerW);
  const y = (v) => MT + innerH - (v / maxVal) * innerH;

  // Y axis ticks (5)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => t * maxVal);

  // Build paths
  const stackPaths = stacks.map((s, idx) => {
    const top = labels.map((_, i) => [x(i), y(s.cum[i])]);
    const bottomVals = stacked && idx > 0
      ? labels.map((_, i) => stacks[idx-1].cum[i])
      : labels.map(() => 0);
    const bottom = bottomVals.map((v, i) => [x(i), y(v)]).reverse();
    const linePath = smoothPath(top);
    const areaPath = linePath + ' L ' + bottom.map(p => p.join(',')).join(' L ') + ' Z';
    return { line: linePath, area: areaPath };
  });

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(N-1, Math.round(((px - ML) / innerW) * (N - 1))));
    setHover({ idx, x: x(idx) });
  };

  const gid = React.useId();
  return (
    <div ref={ref} style={{width:'100%', height, position:'relative'}} onMouseLeave={()=>setHover(null)}>
      <svg width={w} height={height} style={{display:'block', cursor:'crosshair'}}
           onMouseMove={handleMove}>
        <defs>
          {stacks.map((s,i) => (
            <linearGradient key={i} id={`${gid}-g${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.55" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.04" />
            </linearGradient>
          ))}
        </defs>

        {/* Grid */}
        {ticks.map((t,i) => (
          <g key={i}>
            <line x1={ML} x2={ML+innerW} y1={y(t)} y2={y(t)}
                  stroke="var(--line)" strokeDasharray="2 4" strokeWidth={1} />
            <text x={ML-8} y={y(t)+4} textAnchor="end"
                  fill="var(--ink-4)" fontSize="10.5" fontWeight="500">
              {emptyScale ? '0' : formatY(t)}
            </text>
          </g>
        ))}

        {/* X labels: show ~6 evenly */}
        {labels.map((lab, i) => {
          const showCount = Math.min(N, 7);
          const stride = Math.max(1, Math.floor(N / showCount));
          if (i % stride !== 0 && i !== N-1) return null;
          return (
            <text key={i} x={x(i)} y={height-8} textAnchor="middle"
                  fill="var(--ink-4)" fontSize="10.5" fontWeight="500">
              {lab}
            </text>
          );
        })}

        {/* Areas */}
        {mode !== 'line' && stackPaths.map((p, i) => (
          <path key={`a${i}`} d={p.area} fill={`url(#${gid}-g${i})`} />
        ))}
        {/* Lines */}
        {stackPaths.map((p, i) => (
          <path key={`l${i}`} d={p.line}
                fill="none"
                stroke={stacks[i].color}
                strokeWidth={2.2}
                strokeLinejoin="round"
                strokeLinecap="round" />
        ))}

        {/* Hover scrub */}
        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={MT} y2={height-MB}
                  stroke="var(--ink-3)" strokeOpacity="0.35"
                  strokeDasharray="3 3" strokeWidth={1} />
            {stacks.map((s, i) => (
              <circle key={i} cx={hover.x} cy={y(s.cum[hover.idx])} r={5}
                      fill={s.color} stroke="var(--surface)" strokeWidth={2.5} />
            ))}
          </>
        )}
      </svg>

      {hover && (
        <div className="chart-tooltip" style={{
          left: Math.max(80, Math.min(w-80, hover.x)),
          top: 4
        }}>
          <div className="tt-date">{labels[hover.idx]}</div>
          {series.map(s => (
            <div className="tt-row" key={s.key}>
              <span className="tt-dot" style={{background:s.color}} />
              <span className="tt-key">{s.name}</span>
              <span className="tt-val">{formatY(s.data[hover.idx])}</span>
            </div>
          ))}
          {stacked && (
            <div className="tt-row" style={{marginTop:6, borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:5}}>
              <span className="tt-key" style={{fontWeight:700, opacity:1}}>Tổng</span>
              <span className="tt-val">{formatY(series.reduce((a,s)=>a+s.data[hover.idx], 0))}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bar Chart (vertical, multi-series option) ──────────────────────────

function BarChart({ series, labels, height = 260, stacked = false, formatY = fmtVnd }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = React.useState(null);
  const ML = 48, MR = 14, MT = 16, MB = 28;
  const innerW = Math.max(1, w - ML - MR);
  const innerH = Math.max(1, height - MT - MB);
  const N = labels.length || 1;
  const groupW = innerW / N;
  const barW = stacked || series.length === 1
    ? Math.min(groupW * 0.7, 28)
    : Math.min((groupW * 0.7) / series.length, 14);

  const rawMaxVal = stacked
    ? Math.max(...labels.map((_, i) => series.reduce((a,b)=>a+b.data[i], 0)), 0)
    : Math.max(...series.flatMap(s => s.data), 0);
  const emptyScale = rawMaxVal <= 0;
  const maxVal = emptyScale ? 1 : rawMaxVal;
  const y = (v) => MT + innerH - (v / maxVal) * innerH;
  const ticks = [0, 0.5, 1].map(t => t * maxVal);

  return (
    <div ref={ref} style={{width:'100%', height, position:'relative'}} onMouseLeave={()=>setHover(null)}>
      <svg width={w} height={height} style={{display:'block'}}>
        {ticks.map((t,i) => (
          <g key={i}>
            <line x1={ML} x2={ML+innerW} y1={y(t)} y2={y(t)}
                  stroke="var(--line)" strokeDasharray="2 4" />
            <text x={ML-8} y={y(t)+4} textAnchor="end" fill="var(--ink-4)" fontSize="10.5" fontWeight="500">{emptyScale ? '0' : formatY(t)}</text>
          </g>
        ))}
        {labels.map((lab, i) => {
          const gx = ML + i * groupW + groupW/2;
          return (
            <g key={i} onMouseEnter={()=>setHover({idx:i,x:gx})}>
              {/* hover bg */}
              <rect x={ML + i*groupW} y={MT} width={groupW} height={innerH}
                    fill={hover?.idx===i ? 'var(--surface-2)' : 'transparent'} />
              {stacked ? (() => {
                let acc = 0;
                return series.map((s, si) => {
                  const v = s.data[i];
                  const bh = (v / maxVal) * innerH;
                  const bx = gx - barW/2;
                  const by = MT + innerH - (acc + v) / maxVal * innerH;
                  acc += v;
                  return <rect key={si} x={bx} y={by} width={barW} height={bh}
                               fill={s.color} rx={si === series.length-1 ? 4 : 0} />;
                });
              })() : (
                series.map((s, si) => {
                  const v = s.data[i];
                  const bh = (v / maxVal) * innerH;
                  const bx = gx - (series.length*barW)/2 + si*barW;
                  return <rect key={si} x={bx} y={MT + innerH - bh} width={barW-1.5} height={bh}
                               fill={s.color} rx={3} />;
                })
              )}
              {(i % Math.max(1, Math.floor(N/7)) === 0 || i === N-1) && (
                <text x={gx} y={height-8} textAnchor="middle" fill="var(--ink-4)" fontSize="10.5" fontWeight="500">{lab}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="chart-tooltip" style={{ left: Math.max(80, Math.min(w-80, hover.x)), top:4 }}>
          <div className="tt-date">{labels[hover.idx]}</div>
          {series.map(s => (
            <div className="tt-row" key={s.key}>
              <span className="tt-dot" style={{background:s.color}} />
              <span className="tt-key">{s.name}</span>
              <span className="tt-val">{formatY(s.data[hover.idx])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Donut ──────────────────────────────────────────────────────────────

function Donut({ data, size = 180, thickness = 22, center }) {
  // data: [{ key, name, value, color }]
  const total = data.reduce((a,b) => a + safeNum(b.value), 0);
  const r = size/2 - thickness/2 - 2;
  const cx = size/2, cy = size/2;
  let a0 = -Math.PI/2;
  const segs = data.map(s => {
    const value = safeNum(s.value);
    const angle = total > 0 ? (value/total) * Math.PI * 2 : 0;
    const a1 = a0 + angle;
    const x0 = cx + r*Math.cos(a0), y0 = cy + r*Math.sin(a0);
    const x1 = cx + r*Math.cos(a1), y1 = cy + r*Math.sin(a1);
    const large = angle > Math.PI ? 1 : 0;
    const d = `M ${x0},${y0} A ${r},${r} 0 ${large} 1 ${x1},${y1}`;
    const seg = { d, color: s.color, pct: safeDiv(value, total), ...s };
    a0 = a1;
    return seg;
  });
  return (
    <div style={{ position:'relative', width:size, height:size }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        {segs.map((s,i) => (
          <path key={i} d={s.d} stroke={s.color} strokeWidth={thickness}
                fill="none" strokeLinecap="butt" />
        ))}
      </svg>
      <div style={{position:'absolute',inset:0,display:'grid',placeItems:'center',pointerEvents:'none',textAlign:'center'}}>
        {center}
      </div>
    </div>
  );
}

// ── Ranked horizontal bars (top products / cities) ────────────────────

function RankedBars({ items, valueKey = 'value', labelKey = 'name', subKey, format = fmtVnd, colors, maxItems = 10, accent }) {
  const list = items.slice(0, maxItems);
  const max = Math.max(...list.map(it => it[valueKey]), 1);
  return (
    <div style={{display:'flex', flexDirection:'column', gap:10}}>
      {list.map((it, i) => {
        const pct = safePct(it[valueKey], max);
        const color = colors?.[it.platform] || colors?.[i] || accent || 'var(--brand-1)';
        return (
          <div key={i} style={{display:'flex', alignItems:'center', gap:12}}>
            <div style={{
              width: 22, height: 22, borderRadius: 6,
              display:'grid', placeItems:'center',
              background: i < 3 ? color : 'var(--surface-3)',
              color: i < 3 ? '#fff' : 'var(--ink-3)',
              fontSize: 11, fontWeight: 800, flexShrink: 0,
            }}>{i+1}</div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{
                fontSize: 12.5, fontWeight: 600, color: 'var(--ink)',
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                marginBottom: 4,
              }}>{it[labelKey]}</div>
              <div style={{
                height: 6, borderRadius: 999,
                background: 'var(--surface-3)',
                overflow: 'hidden',
                position:'relative',
              }}>
                <div style={{
                  width: pct + '%',
                  height: '100%',
                  background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                  borderRadius: 999,
                  transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
                }} />
              </div>
            </div>
            <div style={{
              fontSize: 12.5, fontWeight: 700, fontVariantNumeric:'tabular-nums',
              minWidth: 70, textAlign: 'right',
            }}>{format(it[valueKey])}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Heatmap (7 × 24) ───────────────────────────────────────────────────

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function Heatmap({ data, height = 260 }) {
  // data: [{ weekday, hour, orders }]  weekday 0..6, hour 0..23
  const [ref, w] = useWidth();
  const [hover, setHover] = React.useState(null);
  const LP = 32, TP = 18, RP = 8, BP = 22;
  const cellW = Math.max(8, (w - LP - RP) / 24);
  const cellH = Math.max(14, (height - TP - BP) / 7);
  const totalH = TP + cellH * 7 + BP;

  const max = Math.max(...data.map(d => d.orders), 1);
  // Build map
  const grid = {};
  for (const d of data) grid[`${d.weekday}-${d.hour}`] = d.orders;

  // Color scale
  const colorAt = (v) => {
    if (!v) return 'var(--surface-3)';
    const t = Math.max(0.06, v / max);
    return `color-mix(in oklab, var(--brand-1) ${Math.round(t*100)}%, var(--surface-3))`;
  };

  return (
    <div ref={ref} style={{width:'100%', height: totalH, position:'relative'}}
         onMouseLeave={()=>setHover(null)}>
      <svg width={w} height={totalH} style={{display:'block'}}>
        {/* Weekday labels */}
        {WEEKDAYS.map((d, i) => (
          <text key={d} x={LP-8} y={TP + cellH*i + cellH/2 + 3.5} textAnchor="end"
                fill="var(--ink-3)" fontSize="11" fontWeight="600">{d}</text>
        ))}
        {/* Hour labels */}
        {Array.from({length:24}).map((_, h) => {
          if (h % 3 !== 0) return null;
          return (
            <text key={h} x={LP + cellW*h + cellW/2} y={TP - 6} textAnchor="middle"
                  fill="var(--ink-3)" fontSize="10" fontWeight="600">{String(h).padStart(2,'0')}h</text>
          );
        })}
        {/* Cells */}
        {Array.from({length:7}).map((_, wd) =>
          Array.from({length:24}).map((_, h) => {
            const v = grid[`${wd}-${h}`] || 0;
            return (
              <rect key={`${wd}-${h}`}
                    x={LP + cellW*h + 1.5}
                    y={TP + cellH*wd + 1.5}
                    width={cellW-3} height={cellH-3}
                    rx={3.5}
                    fill={colorAt(v)}
                    style={{cursor:'pointer', transition:'opacity 0.15s'}}
                    opacity={hover && (hover.wd !== wd || hover.h !== h) ? 0.55 : 1}
                    onMouseEnter={()=>setHover({wd, h, v, x: LP + cellW*h + cellW/2, y: TP + cellH*wd})} />
            );
          })
        )}
      </svg>

      {hover && (
        <div className="chart-tooltip" style={{
          left: Math.max(70, Math.min(w-70, hover.x)),
          top: hover.y - 10,
        }}>
          <div className="tt-date">{WEEKDAYS[hover.wd]} · {String(hover.h).padStart(2,'0')}:00</div>
          <div className="tt-row">
            <span className="tt-dot" style={{background:'var(--brand-1)'}} />
            <span className="tt-key">Đơn hàng</span>
            <span className="tt-val">{hover.v}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Radar chart (3 platforms) ──────────────────────────────────────────

function Radar({ series, axes, size = 280, max }) {
  // series: [{name,color,values:[..]}]
  // axes: [{ name, max? }]
  const cx = size/2, cy = size/2 + 6;
  const r = size/2 - 26;
  const N = axes.length;
  const angle = (i) => -Math.PI/2 + (i / N) * Math.PI * 2;
  const point = (i, v, mx) => {
    const rr = (v/(mx||1)) * r;
    return [cx + rr*Math.cos(angle(i)), cy + rr*Math.sin(angle(i))];
  };
  const maxes = axes.map((a, i) => a.max || max || Math.max(...series.flatMap(s => s.values[i]||0), 1));

  return (
    <svg width={size} height={size} style={{display:'block', overflow:'visible'}}>
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((t, idx) => {
        const pts = axes.map((_, i) => {
          const x = cx + (r*t)*Math.cos(angle(i));
          const y = cy + (r*t)*Math.sin(angle(i));
          return `${x},${y}`;
        }).join(' ');
        return <polygon key={t} points={pts} fill="none"
                       stroke="var(--line)" strokeWidth="1"
                       strokeDasharray={idx === 3 ? '0' : '3 3'} />;
      })}
      {/* Spokes */}
      {axes.map((_, i) => {
        const [x, y] = [cx + r*Math.cos(angle(i)), cy + r*Math.sin(angle(i))];
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" />;
      })}
      {/* Axis labels */}
      {axes.map((a, i) => {
        const lx = cx + (r+14)*Math.cos(angle(i));
        const ly = cy + (r+14)*Math.sin(angle(i));
        let anchor = 'middle';
        if (lx < cx - 5) anchor = 'end';
        else if (lx > cx + 5) anchor = 'start';
        return (
          <text key={i} x={lx} y={ly+4} textAnchor={anchor}
                fontSize="11" fill="var(--ink-2)" fontWeight="600">{a.name}</text>
        );
      })}
      {/* Series */}
      {series.map((s, si) => {
        const pts = s.values.map((v, i) => point(i, v, maxes[i]));
        const d = pts.map((p,i)=>(i?'L':'M')+p[0]+','+p[1]).join(' ') + ' Z';
        return (
          <g key={si}>
            <path d={d} fill={s.color} fillOpacity="0.18" stroke={s.color} strokeWidth="2" />
            {pts.map((p,i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill={s.color} stroke="var(--surface)" strokeWidth="1.5" />)}
          </g>
        );
      })}
    </svg>
  );
}

// ── Half dial gauge ────────────────────────────────────────────────────

function Dial({ value, max = 100, label, color, size = 176, format = (v) => v + '%' }) {
  const pct = Math.max(0, Math.min(1, value/max));
  const cx = size/2, cy = size*0.68;
  const r = size*0.42;
  const a0 = Math.PI, a1 = 0;
  const ac = a0 + (a1-a0) * pct;
  const arc = (a) => [cx + r*Math.cos(a), cy + r*Math.sin(a)];
  const start = arc(a0), endTrack = arc(a1), endVal = arc(ac);
  return (
    <div style={{position:'relative', width:size, height:size*0.74}}>
      <svg width={size} height={size*0.74} style={{display:'block'}}>
        <path d={`M ${start[0]},${start[1]} A ${r},${r} 0 0 1 ${endTrack[0]},${endTrack[1]}`}
              fill="none" stroke="var(--surface-3)" strokeWidth="14" strokeLinecap="round" />
        <path d={`M ${start[0]},${start[1]} A ${r},${r} 0 0 1 ${endVal[0]},${endVal[1]}`}
              fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
      </svg>
      <div style={{
        position:'absolute', inset:0, display:'flex',
        flexDirection:'column', alignItems:'center', justifyContent:'flex-end',
        paddingBottom: 2, textAlign:'center',
      }}>
        <div style={{fontSize:24, fontWeight:800, letterSpacing:'-0.02em'}}>{format(value)}</div>
        <div style={{fontSize:11, color:'var(--ink-3)', fontWeight:600}}>{label}</div>
      </div>
    </div>
  );
}

// ── Mini bars (column sparkline) ───────────────────────────────────────

function MiniBars({ data, color, height = 40, gap = 1.2 }) {
  const [ref, w] = useWidth();
  if (!data.length) return <div ref={ref} style={{width:'100%', height}} />;
  const max = Math.max(...data, 1);
  const bw = (w - gap*(data.length-1)) / data.length;
  return (
    <div ref={ref} style={{width:'100%', height}}>
      <svg width={w} height={height} style={{display:'block'}}>
        {data.map((v,i) => {
          const h = safeDiv(v, max) * height * 0.92;
          return <rect key={i} x={i*(bw+gap)} y={height-h} width={bw} height={h}
                       fill={color} opacity={0.55 + 0.45*safeDiv(v, max)} rx={1.5} />;
        })}
      </svg>
    </div>
  );
}

// ── Stacked horizontal bar (market share) ──────────────────────────────

function StackBar({ segments, height = 12 }) {
  const total = segments.reduce((a,b)=>a+safeNum(b.value), 0);
  return (
    <div className="stack-bar" style={{height}}>
      {segments.map((s,i) => (
        <div key={i} className="seg" style={{
          width: safePct(s.value, total) + '%',
          background: s.color,
        }} title={`${s.name}: ${safePct(s.value, total).toFixed(1)}%`} />
      ))}
    </div>
  );
}

// Expose globally
Object.assign(window, {
  fmtVnd, fmtFull, fmtPct, safeNum, safeDiv, safePct,
  PLATFORM_COLORS, PLATFORM_COLORS_2, PLATFORM_NAME,
  Sparkline, AreaChart, BarChart, Donut, RankedBars, Heatmap, Radar, Dial, MiniBars, StackBar,
});
