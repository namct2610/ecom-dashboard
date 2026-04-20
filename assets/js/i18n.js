'use strict';
/* ── i18n — Dashboard v3 ──────────────────────────────────────────────────
 *
 * Architecture: external JSON files in assets/lang/{code}.json
 * - Vietnamese (vi) translations are bundled inline as fallback → zero FOUC
 * - Other languages are loaded async from JSON files
 * - Translations are cached in localStorage for instant subsequent loads
 * - To add a new language: upload a .json file via Settings → Language Management
 *
 * Public API:
 *   I18n.init()                → await on DOMContentLoaded
 *   I18n.setLang(code)         → await to switch language + re-apply DOM
 *   I18n.getLang()             → current language code string
 *   I18n.loadAvailableLangs()  → fetch list from api/lang.php, returns array
 *   I18n.getAvailableLangs()   → return cached list
 *   I18n.applyTranslations()   → walk DOM and update [data-i18n] elements
 *
 * Global helpers (backward compat):
 *   t(key)              → translate a key
 *   setLang(code)       → switch language
 *   getLang()           → get current language code
 *   applyTranslations() → apply to DOM
 * ──────────────────────────────────────────────────────────────────────── */

const I18n = (() => {

  // ── Inline VI fallback — always available, zero network needed ───────────
  const _vi = {
    'nav.overview':'Tổng quan','nav.orders':'Đơn hàng','nav.products':'Sản phẩm',
    'nav.customers':'Khách hàng','nav.traffic':'Traffic','nav.comparison':'So sánh',
    'nav.analytics':'Phân tích','nav.upload':'Upload','nav.connect':'Kết nối API',
    'nav.logs':'Nhật ký','nav.settings':'Cài đặt','nav.admin':'Quản trị','nav.collapse':'Thu gọn','nav.logout':'Đăng xuất',
    'filter.all':'Tất cả','period.month':'Tháng','period.year':'Năm',
    'preset.today':'Hôm nay','preset.yesterday':'Hôm qua','preset.7days':'7 ngày',
    'preset.30days':'30 ngày','preset.this_month':'Tháng này','preset.last_month':'Tháng trước','preset.this_year':'Năm nay',
    'page.overview.title':'Tổng quan','page.overview.sub':'Doanh thu, đơn hàng và traffic tổng hợp',
    'page.orders.title':'Đơn hàng','page.orders.sub':'Chi tiết đơn hàng theo thời gian và trạng thái',
    'page.products.title':'Sản phẩm','page.products.sub':'Top sản phẩm theo số lượng và doanh thu',
    'page.customers.title':'Khách hàng','page.customers.sub':'Phân tích khách hàng theo địa lý và thanh toán',
    'page.traffic.title':'Traffic','page.traffic.sub':'Lượt xem, lượt truy cập và tỷ lệ chuyển đổi',
    'page.comparison.title':'So sánh sàn','page.comparison.sub':'Hiệu suất Shopee, Lazada và TikTok Shop',
    'page.analytics.title':'Phân tích nâng cao','page.analytics.sub':'Heatmap thời gian đặt hàng và doanh thu theo địa lý',
    'page.upload.title':'Upload dữ liệu','page.upload.sub':'Tải lên file Excel từ Shopee, Lazada, TikTok Shop',
    'page.logs.title':'Nhật ký hoạt động','page.logs.sub':'Tất cả sự kiện và lỗi được ghi lại tự động',
    'page.connect.title':'Kết nối API','page.connect.sub':'Tự động đồng bộ đơn hàng qua Open Platform API',
    'page.admin.title':'Quản trị hệ thống','page.admin.sub':'Quản lý tài khoản đăng nhập, cấu hình API và cài đặt vận hành',
    'page.settings.title':'Cài đặt hệ thống','page.settings.sub':'Thông tin server, database và thao tác quản trị',
    'admin.hero.title':'Trung tâm điều phối quản trị','admin.hero.sub':'Tất cả các thay đổi nhạy cảm như tài khoản đăng nhập, kết nối API, cập nhật hệ thống và reset dữ liệu đều được gom về một bảng điều khiển quản trị duy nhất.',
    'admin.stats.total_users':'Tổng tài khoản','admin.stats.total_users.sub':'Tất cả tài khoản đăng nhập',
    'admin.stats.active_users':'Đang hoạt động','admin.stats.active_users.sub':'Có thể đăng nhập',
    'admin.stats.admins':'Quản trị viên','admin.stats.admins.sub':'Có quyền cấu hình hệ thống',
    'admin.stats.last_login':'Đăng nhập gần nhất','admin.stats.last_login.sub':'Dấu mốc hoạt động mới nhất',
    'admin.tab.accounts':'Tài khoản','admin.tab.api':'API & kết nối','admin.tab.system':'Hệ thống',
    'admin.users.title':'Danh sách tài khoản đăng nhập','admin.users.sub':'Tạo mới, phân quyền admin/staff và kiểm soát trạng thái hoạt động của từng tài khoản.',
    'admin.users.refresh':'Làm mới','admin.users.th.user':'Tài khoản','admin.users.th.role':'Vai trò','admin.users.th.status':'Trạng thái',
    'admin.users.th.last_login':'Lần đăng nhập cuối','admin.users.th.actions':'Thao tác','admin.users.empty':'Chưa có tài khoản nào.',
    'admin.users.you':'Bạn','admin.users.edit':'Chỉnh sửa','admin.users.delete_confirm':'Xóa tài khoản này?',
    'admin.form.create':'Tạo tài khoản mới','admin.form.edit':'Cập nhật tài khoản',
    'admin.form.sub':'Mỗi tài khoản staff có thể xem dashboard, chỉ admin mới truy cập được bảng quản trị này.',
    'admin.form.username':'Tên đăng nhập','admin.form.full_name':'Tên hiển thị','admin.form.role':'Vai trò','admin.form.password':'Mật khẩu',
    'admin.form.password_keep':'Để trống để giữ mật khẩu hiện tại','admin.form.active':'Cho phép đăng nhập','admin.form.active.sub':'Tắt mục này để khóa tài khoản mà không cần xoá.',
    'admin.form.submit_create':'Tạo tài khoản','admin.form.submit_update':'Lưu thay đổi','admin.form.reset':'Đặt lại form',
    'admin.form.note':'Khi đang sửa tài khoản, ô mật khẩu có thể để trống để giữ nguyên mật khẩu cũ. Để đổi mật khẩu, chỉ cần nhập mật khẩu mới rồi lưu lại.',
    'admin.role.admin':'Quản trị viên','admin.role.staff':'Nhân viên',
    'admin.state.active':'Hoạt động','admin.state.inactive':'Đã khóa',
    'admin.toast.created':'Đã tạo tài khoản.','admin.toast.updated':'Đã cập nhật tài khoản.','admin.toast.deleted':'Đã xóa tài khoản.',
    'customer.detail.eyebrow':'Hồ sơ khách hàng','customer.detail.loading':'Đang tải thông tin khách hàng...','customer.detail.load_error':'Không thể tải chi tiết khách hàng.',
    'customer.detail.latest_address':'Địa chỉ mới nhất','customer.detail.filtered_orders':'Đơn trong bộ lọc','customer.detail.filtered_revenue':'Doanh thu trong bộ lọc',
    'customer.detail.lifetime_orders':'Tổng đơn toàn thời gian','customer.detail.lifetime_revenue':'Doanh thu toàn thời gian','customer.detail.current_filter':'Theo bộ lọc hiện tại',
    'customer.detail.all_time':'Toàn bộ lịch sử','customer.detail.products':'sản phẩm','customer.detail.profile':'Thông tin mua hàng','customer.detail.profile_sub':'Mốc thời gian và địa chỉ gần nhất của khách hàng.',
    'customer.detail.first_purchase':'Mua lần đầu','customer.detail.last_purchase':'Mua gần nhất','customer.detail.history':'Lịch sử đơn hàng','customer.detail.history_sub':'30 đơn gần nhất của khách hàng trên tất cả sàn.',
    'kpi.revenue':'Doanh thu','kpi.revenue.sub':'Đã hoàn thành',
    'kpi.orders':'Tổng đơn','kpi.orders.sub':'Tất cả trạng thái',
    'kpi.completed':'Hoàn thành','kpi.completed.sub':'Đã giao / hoàn thành',
    'kpi.views':'Lượt xem','kpi.total_orders':'Tổng đơn','kpi.cancelled':'Đã huỷ','kpi.cancel_rate':'Tỷ lệ huỷ',
    'kpi.total_skus':'Tổng SKU','kpi.qty_sold':'Tổng SL đã bán','kpi.qty_sold.sub':'Kể cả đơn huỷ',
    'kpi.qty_delivered':'Tổng SL đã giao','kpi.qty_del.sub':'Đơn hoàn thành',
    'kpi.avg_qty':'SL TB/đơn hàng','kpi.avg_qty.sub':'Sản phẩm/đơn',
    'kpi.aov':'AOV','kpi.aov.sub':'Giá trị trung bình/đơn',
    'kpi.buyers':'Người mua','kpi.buyers.sub':'Người mua khác nhau',
    'kpi.traffic_views':'Lượt xem','kpi.visits':'Lượt truy cập','kpi.bounce_rate':'Tỷ lệ thoát TB',
    'chart.revenue_trend':'Doanh thu theo thời gian','chart.by_platform':'Phân theo sàn',
    'chart.market_share':'Thị phần doanh thu','chart.order_trend':'Xu hướng đơn hàng',
    'chart.completed_vs_cancelled':'Hoàn thành vs Huỷ','chart.order_status':'Trạng thái đơn',
    'chart.orders_platform':'Đơn theo sàn','chart.orders_hour':'Đơn theo giờ trong ngày',
    'chart.top_qty':'Top sản phẩm bán chạy','chart.by_qty':'Theo số lượng',
    'chart.top_revenue':'Top sản phẩm doanh thu cao','chart.by_revenue':'Theo doanh thu',
    'chart.by_city':'Phân bổ theo tỉnh / thành','chart.traffic_trend':'Traffic theo thời gian',
    'chart.traffic_platform':'Traffic theo sàn','chart.radar':'Radar tổng hợp',
    'chart.revenue_city':'Doanh thu theo tỉnh / thành','chart.top15':'Top 15 địa phương',
    'card.recent_orders':'Đơn hàng gần đây','card.top_products':'Top sản phẩm',
    'card.order_list':'Danh sách đơn hàng','card.product_list':'Danh sách sản phẩm',
    'card.top5_revenue':'Top 5 doanh thu','card.top_locations':'Top địa phương',
    'card.customer_leaderboard':'Khách hàng nổi bật','card.customer_leaderboard.sub':'Thống kê theo username trong bộ lọc hiện tại',
    'card.orders_heatmap':'Đơn hàng theo ngày & giờ','card.rev_heatmap':'Doanh thu theo ngày & giờ',
    'th.order_id':'Mã đơn','th.product':'Sản phẩm','th.platform':'Sàn','th.date':'Ngày đặt',
    'th.value':'Giá trị','th.status':'Trạng thái','th.sku':'SKU','th.product_name':'Tên sản phẩm',
    'th.qty':'SL','th.revenue':'Doanh thu','th.rank':'Hạng','th.username':'Username',
    'status.completed':'Hoàn thành','status.delivered':'Đã giao','status.cancelled':'Đã huỷ',
    'status.pending':'Đang xử lý','status.failed':'Thất bại','status.processing':'Đang xử lý',
    'status.waiting':'Chờ xử lý','status.in_transit':'Đang giao',
    'cl.revenue':'Doanh thu','cl.orders':'Đơn hàng','cl.quantity':'Số lượng',
    'cl.views':'Lượt xem','cl.visits':'Lượt truy cập','cl.no_data':'Không có dữ liệu',
    'cl.other':'Khác','cl.orders_unit':'đơn','cl.cancelled':'Đã huỷ',
    'day.0':'CN','day.1':'T2','day.2':'T3','day.3':'T4','day.4':'T5','day.5':'T6','day.6':'T7',
    'radar.revenue':'Doanh thu','radar.orders':'Đơn hàng',
    'radar.market_share':'Thị phần','radar.completion_rate':'Tỷ lệ HT',
    'compare.orders':'Tổng đơn','compare.completed':'Hoàn thành','compare.revenue':'Doanh thu',
    'compare.share':'Thị phần','compare.aov':'AOV','compare.cancel':'Tỷ lệ huỷ',
    'compare.top5':'Top 5 sản phẩm mỗi sàn',
    'common.low':'Ít','common.high':'Nhiều',
    'login.sub':'Đăng nhập để tiếp tục','login.user':'Tên đăng nhập',
    'login.pass':'Mật khẩu','login.btn':'Đăng nhập',
    'user.menu.account':'Tài khoản','user.menu.profile':'Hồ sơ tài khoản','user.menu.admin':'Quản trị hệ thống','user.menu.password':'Đổi mật khẩu',
    'user.menu.language':'Ngôn ngữ hiển thị','user.menu.language_settings':'Cài đặt ngôn ngữ',
    'account.profile.title':'Hồ sơ tài khoản','account.profile.sub':'Bạn có thể tự cập nhật tên hiển thị và ảnh đại diện dùng trong dashboard.',
    'account.profile.full_name':'Tên hiển thị','account.profile.username':'Tên đăng nhập','account.profile.choose_avatar':'Chọn avatar',
    'account.profile.remove_avatar':'Xóa avatar','account.profile.avatar_hint':'Hỗ trợ JPG, PNG, WEBP tối đa 2MB.',
    'account.profile.submit':'Lưu hồ sơ','account.profile.success':'Đã cập nhật hồ sơ tài khoản.',
    'account.password.title':'Đổi mật khẩu','account.password.sub':'Mật khẩu mới sẽ được áp dụng ngay cho lần đăng nhập tiếp theo.',
    'account.password.current':'Mật khẩu hiện tại','account.password.new':'Mật khẩu mới','account.password.confirm':'Xác nhận mật khẩu mới',
    'account.password.hint':'Tối thiểu 6 ký tự. Nên dùng mật khẩu đủ mạnh và khác mật khẩu cũ.',
    'account.password.cancel':'Đóng','account.password.submit':'Cập nhật mật khẩu','account.password.success':'Đã cập nhật mật khẩu.',
    'lang.manage':'Quản lý ngôn ngữ','lang.upload':'Upload ngôn ngữ',
    'lang.add':'Thêm ngôn ngữ','lang.template':'Tải file mẫu',
    'lang.keys':'khóa dịch','lang.delete':'Xoá','lang.builtin':'Tích hợp sẵn',
    'lang.loading':'Đang tải...',
    'login.logging_in':'Đang đăng nhập...','login.failed':'Đăng nhập thất bại.',
    'login.server_error':'Lỗi kết nối server.',
    'period.select':'Chọn kỳ','preset.7days_ago':'7 ngày qua','preset.30days_ago':'30 ngày qua',
    'msg.no_data':'Không có dữ liệu','msg.no_data_yet':'Chưa có dữ liệu',
    'msg.no_orders':'Không có đơn hàng','msg.no_results':'Không có kết quả.',
    'msg.total':'Tổng','msg.syncing':'Đang đồng bộ...','msg.checking':'Đang kiểm tra...',
    'msg.loading':'Đang tải...','msg.error':'Lỗi','msg.unknown':'Không xác định',
    'msg.conn_error':'Lỗi kết nối.','msg.failed':'Thất bại.','msg.details':'Chi tiết',
    'msg.all':'tất cả','msg.disconnected':'Đã ngắt kết nối.','msg.save_failed':'Lưu thất bại.',
    'msg.delete_failed':'Xoá thất bại.','msg.credentials_saved':'Đã lưu thông tin xác thực.',
    'msg.app_key_required':'App Key không được để trống.',
    'msg.getting_auth_url':'Đang lấy URL xác thực...','msg.redirecting':'Đang chuyển hướng...',
    'msg.no_auth_url':'Không lấy được URL xác thực.',
    'msg.active':'Hoạt động','msg.inactive':'Tắt','msg.paused':'Tạm dừng',
    'msg.not_synced':'Chưa đồng bộ','msg.not_synced_short':'Chưa sync',
    'msg.enable':'Bật','msg.disable':'Tắt',
    'toast.load_overview':'Không thể tải dữ liệu overview.',
    'toast.load_orders':'Không thể tải dữ liệu đơn hàng.',
    'toast.load_products':'Không thể tải dữ liệu sản phẩm.',
    'toast.load_customers':'Không thể tải dữ liệu khách hàng.',
    'toast.load_traffic':'Không thể tải dữ liệu traffic.',
    'toast.load_comparison':'Không thể tải dữ liệu so sánh.',
    'toast.load_heatmap':'Không thể tải dữ liệu heatmap.',
    'toast.sync_done':'Đồng bộ hoàn tất.','toast.sync_error':'Lỗi đồng bộ.',
    'toast.lazada_sync_done':'Đồng bộ Lazada hoàn tất.','toast.lazada_sync_error':'Lỗi đồng bộ Lazada.',
    'toast.shopee_sync_done':'Đồng bộ Shopee hoàn tất',
    'toast.log_cleared':'Đã xoá log thành công.','toast.manifest_saved':'Đã lưu URL manifest!',
    'upload.type_orders':'Đơn hàng','upload.no_history':'Chưa có lịch sử upload',
    'log.no_data':'Không có dữ liệu nhật ký','log.load_error':'Lỗi tải dữ liệu:',
    'log.all_scope':'tất cả',
    'connect.no_shops':'Chưa có shop nào được kết nối.',
    'connect.no_lazada':'Chưa có tài khoản nào được kết nối.',
    'connect.no_shopee':'Chưa kết nối shop nào. Nhấn "Kết nối Shopee" để bắt đầu.',
    'connect.lazada_saved':'Đã lưu thông tin xác thực Lazada.',
    'connect.shopee_saved':'Đã lưu thông tin Shopee!','connect.items_unit':'mục',
    'confirm.disconnect_shop':'Ngắt kết nối shop này?',
    'confirm.disconnect_lazada':'Ngắt kết nối tài khoản Lazada này?',
    'confirm.delete_shopee':'Xóa kết nối shop này?',
    'sys.memory_used':'Memory sử dụng','sys.timezone':'Múi giờ',
    'sys.server_time':'Giờ server','sys.installed_at':'Cài đặt lúc',
    'sys.disk':'Dung lượng disk','sys.db_size':'Kích thước DB',
    'sys.disk_free':'GB trống','sys.disk_used':'đã dùng',
    'sys.total_orders':'Tổng đơn hàng','sys.traffic_records':'Bản ghi traffic',
    'sys.uploads':'Lần upload','sys.date_range':'Khoảng thời gian đơn hàng:',
    'sys.no_data':'Chưa có dữ liệu','sys.load_error':'Lỗi tải thông tin:',
    'update.enter_manifest':'Nhập URL Manifest ở trên để bật tính năng kiểm tra cập nhật tự động.',
    'update.manifest_error':'Không thể tải manifest:','update.new_version':'Có bản cập nhật mới:',
    'update.current':'Hiện tại:','update.released':'Phát hành:','update.min_php':'Yêu cầu PHP',
    'update.btn':'Cập nhật ngay','update.up_to_date':'Đang dùng phiên bản mới nhất',
    'update.checked_at':'Kiểm tra lúc:',
    'update.no_info':'Không lấy được thông tin phiên bản. Kiểm tra URL manifest và thử lại.',
    'update.installing':'Đang tải và áp dụng...','update.wait':'Vui lòng không đóng trang (có thể mất 30–60 giây)',
    'update.success':'Cập nhật thành công!','update.reload':'Tải lại trang',
    'update.failed':'Cập nhật thất bại','update.retry':'Thử lại','update.conn_error':'Lỗi kết nối',
    'update.confirm_body':'?\n\nCác file mới sẽ được cài đặt. config.php và uploads/ sẽ được giữ nguyên.\nVui lòng backup trước nếu cần.',
    'btn.sync':'Đồng bộ','btn.disconnect':'Ngắt kết nối','btn.date_from':'Từ ngày','btn.date_to':'Đến ngày',
  };

  // ── State ─────────────────────────────────────────────────────────────────
  let _lang           = 'vi';
  let _translations   = { ..._vi };
  let _availableLangs = [];

  // ── Core translation ──────────────────────────────────────────────────────
  function t(key) {
    return _translations[key] ?? _vi[key] ?? key;
  }

  // ── Apply translations to DOM ─────────────────────────────────────────────
  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const val = _translations[el.dataset.i18n] ?? _vi[el.dataset.i18n];
      if (val !== undefined) el.textContent = val;
    });

    // Update collapsed nav tooltips
    document.querySelectorAll('.nav-item[data-label]').forEach(item => {
      const map = {
        overview:'nav.overview', orders:'nav.orders', products:'nav.products',
        customers:'nav.customers', traffic:'nav.traffic', comparison:'nav.comparison',
        heatmaps:'nav.analytics', upload:'nav.upload', connect:'nav.connect',
        logs:'nav.logs', settings:'nav.settings', admin:'nav.admin',
      };
      const key = map[item.dataset.page];
      if (key) item.dataset.label = t(key);
    });

    _updateSelectorUI();
  }

  // ── Fetch a language file from server ─────────────────────────────────────
  async function _fetchLang(code) {
    const res = await fetch(`assets/lang/${code}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const { _meta, ...translations } = data;    // strip _meta
    return translations;
  }

  // ── Load a language (with localStorage cache) ─────────────────────────────
  async function loadLanguage(code) {
    if (code === 'vi') {
      _translations = { ..._vi };
      _lang = 'vi';
      localStorage.setItem('lang', 'vi');
      return;
    }

    const cacheKey = `i18n_cache_${code}`;

    // Apply from cache immediately (no FOUC on repeat visits)
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        _translations = JSON.parse(cached);
        _lang = code;
        localStorage.setItem('lang', code);
      } catch (_) {}
    }

    // Always fetch fresh to keep cache up to date
    try {
      const translations = await _fetchLang(code);
      _translations = translations;
      _lang = code;
      localStorage.setItem('lang', code);
      localStorage.setItem(cacheKey, JSON.stringify(translations));
    } catch (e) {
      if (!cached) {
        // No cache and fetch failed — fall back to vi
        console.warn(`[i18n] Failed to load "${code}", using vi fallback`, e);
        _lang = 'vi';
        _translations = { ..._vi };
        localStorage.setItem('lang', 'vi');
      }
    }
  }

  // ── Init: called once on DOMContentLoaded ─────────────────────────────────
  async function init() {
    const code = localStorage.getItem('lang') || 'vi';

    if (code === 'vi') {
      _translations = { ..._vi };
      _lang = 'vi';
      applyTranslations();
      return;
    }

    // Try localStorage cache first for instant display (no FOUC)
    const cached = localStorage.getItem(`i18n_cache_${code}`);
    if (cached) {
      try {
        _translations = JSON.parse(cached);
        _lang = code;
        applyTranslations();
        // Refresh cache in background
        loadLanguage(code).then(applyTranslations).catch(() => {});
        return;
      } catch (_) {}
    }

    // No cache — fetch and apply (await so page renders with correct language)
    await loadLanguage(code);
    applyTranslations();
  }

  // ── Switch language ───────────────────────────────────────────────────────
  async function setLang(code) {
    await loadLanguage(code);
    applyTranslations();
  }

  // ── Available languages list ──────────────────────────────────────────────
  async function loadAvailableLangs() {
    try {
      const res  = await fetch('api/lang.php?action=list');
      const data = await res.json();
      _availableLangs = data.languages || [];
    } catch (_) {
      // Fallback when not logged in or API unavailable
      _availableLangs = [
        { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳', builtin: true },
        { code: 'en', name: 'English',    flag: '🇬🇧', builtin: true },
      ];
    }
    return _availableLangs;
  }

  function getAvailableLangs() { return _availableLangs; }
  function getLang()            { return _lang; }

  // ── Update the language selector button ───────────────────────────────────
  function _updateSelectorUI() {
    const meta     = _availableLangs.find(l => l.code === _lang) || { flag: '🌐', code: _lang };
    const flagEl   = document.getElementById('langFlag');
    const codeEl   = document.getElementById('langCode');
    const currentEl = document.getElementById('userMenuLangCurrent');
    if (flagEl) flagEl.textContent = meta.flag;
    if (codeEl) codeEl.textContent = _lang.toUpperCase();
    if (currentEl) currentEl.textContent = `${meta.flag} ${_lang.toUpperCase()}`;
  }

  return { init, t, setLang, getLang, loadLanguage, loadAvailableLangs, getAvailableLangs, applyTranslations };
})();

// ── Global helpers (for charts.js, app.js backward compat) ──────────────────
function t(key)              { return I18n.t(key); }
async function setLang(code) { return I18n.setLang(code); }
function getLang()           { return I18n.getLang(); }
function applyTranslations() { return I18n.applyTranslations(); }
