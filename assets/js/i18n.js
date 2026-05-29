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
    'nav.customers':'Khách hàng','nav.traffic':'Traffic','nav.comparison':'So sánh','nav.plan':'Kế hoạch',
    'nav.analytics':'Phân tích','nav.reconcile':'Đối soát GBS','nav.upload':'Upload','nav.connect':'Kết nối API',
    'nav.logs':'Nhật ký','nav.settings':'Cài đặt','nav.product_list':'Danh sách sản phẩm','nav.data_link':'Liên kết dữ liệu sàn',
    'nav.settings_account':'Cài đặt tài khoản','nav.settings_lang':'Cài đặt ngôn ngữ','nav.system':'Hệ thống',
    'nav.admin':'Quản trị','nav.collapse':'Thu gọn','nav.logout':'Đăng xuất',
    'filter.all':'Tất cả','period.month':'Tháng','period.year':'Năm',
    'preset.today':'Hôm nay','preset.yesterday':'Hôm qua','preset.7days':'7 ngày',
    'preset.30days':'30 ngày','preset.this_month':'Tháng này','preset.last_month':'Tháng trước','preset.this_year':'Năm nay',
    'page.overview.title':'Tổng quan','page.overview.sub':'Doanh thu, đơn hàng và traffic tổng hợp',
    'page.orders.title':'Đơn hàng','page.orders.sub':'Chi tiết đơn hàng theo thời gian và trạng thái',
    'page.products.title':'Sản phẩm','page.products.sub':'Top sản phẩm theo số lượng và doanh thu',
    'page.customers.title':'Khách hàng','page.customers.sub':'Phân tích khách hàng theo địa lý và thanh toán',
    'page.traffic.title':'Traffic','page.traffic.sub':'Lượt xem, lượt truy cập và tỷ lệ chuyển đổi',
    'page.comparison.title':'So sánh sàn','page.comparison.sub':'Hiệu suất Shopee, Lazada và TikTok Shop',
    'page.plan.title':'Kế hoạch','page.plan.sub':'Theo dõi Target YTD, YTG và run-rate cần đạt mục tiêu năm',
    'page.reconcile.title':'Đối soát GBS','page.reconcile.sub':'Khớp file GBS với export Shopee, Lazada và TikTok Shop theo đơn hàng',
    'page.analytics.title':'Phân tích nâng cao','page.analytics.sub':'Heatmap thời gian đặt hàng, doanh thu theo địa lý, sản phẩm và thương hiệu',
    'page.upload.title':'Upload dữ liệu','page.upload.sub':'Tải lên file Excel từ Shopee, Lazada, TikTok Shop',
    'page.logs.title':'Nhật ký hoạt động','page.logs.sub':'Tất cả sự kiện và lỗi được ghi lại tự động',
    'page.connect.title':'Kết nối API','page.connect.sub':'Tự động đồng bộ đơn hàng qua Open Platform API',
    'page.product_list.title':'Danh sách sản phẩm','page.product_list.sub':'Quản lý các SKU lẻ: mã, tên, thương hiệu và giá gốc. Dùng chung cho dashboard (toggle COMBO/SKU) và đối soát GBS.',
    'page.data_link.title':'Liên kết dữ liệu sàn','page.data_link.sub':'Quy đổi SKU COMBO trên sàn về SKU lẻ thực tế. Dùng chung cho dashboard và đối soát GBS.',
    'page.settings_account.title':'Cài đặt tài khoản','page.settings_account.sub':'Quản lý hồ sơ cá nhân, avatar và mật khẩu đăng nhập.',
    'page.settings_lang.title':'Cài đặt ngôn ngữ','page.settings_lang.sub':'Quản lý các bộ ngôn ngữ hiển thị của giao diện.',
    'page.system.title':'Hệ thống','page.system.sub':'Thông tin server, database, cập nhật và các thao tác quản trị nâng cao.',
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
    'admin.form.username':'Tên đăng nhập','admin.form.full_name':'Tên hiển thị','admin.form.full_name_placeholder':'Nguyễn Văn A','admin.form.role':'Vai trò','admin.form.password':'Mật khẩu',
    'admin.form.password_keep':'Để trống để giữ mật khẩu hiện tại','admin.form.password_placeholder':'Từ 8 ký tự, tối thiểu mức Trung bình',
    'admin.form.password_required':'Vui lòng nhập mật khẩu cho tài khoản mới.',
    'admin.form.must_change_password':'Buộc đổi mật khẩu ở lần đăng nhập kế tiếp',
    'admin.form.must_change_password.sub':'Nên bật khi admin cấp mật khẩu tạm hoặc vừa reset mật khẩu cho user.',
    'admin.form.active':'Cho phép đăng nhập','admin.form.active.sub':'Tắt mục này để khóa tài khoản mà không cần xoá.',
    'admin.form.submit_create':'Tạo tài khoản','admin.form.submit_update':'Lưu thay đổi','admin.form.reset':'Đặt lại form',
    'admin.form.note':'Khi đang sửa tài khoản, ô mật khẩu có thể để trống để giữ nguyên mật khẩu cũ. Nếu đổi mật khẩu, mật khẩu mới phải đạt tối thiểu mức Trung bình.',
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
    'kpi.conv_rate':'Tỉ lệ chuyển đổi','kpi.conv_rate.sub':'Đơn / lượt truy cập',
    'kpi.traffic_views':'Lượt xem','kpi.visits':'Lượt truy cập','kpi.bounce_rate':'Tỷ lệ thoát TB',
    'kpi.compare.previous':'so với kỳ trước','kpi.compare.no_previous':'Chưa có dữ liệu kỳ trước',
    'chart.revenue_trend':'Doanh thu theo thời gian','chart.by_platform':'Phân theo sàn',
    'chart.market_share':'Thị phần doanh thu','chart.order_trend':'Xu hướng đơn hàng',
    'chart.completed_vs_cancelled':'Hoàn thành vs Huỷ','chart.order_status':'Trạng thái đơn',
    'chart.orders_platform':'Đơn theo sàn','chart.orders_hour':'Đơn theo giờ trong ngày',
    'chart.top_qty':'Top sản phẩm bán chạy','chart.by_qty':'Theo số lượng',
    'chart.top_revenue':'Top sản phẩm doanh thu cao','chart.by_revenue':'Theo doanh thu',
    'chart.brand_qty_share':'Tỉ trọng doanh số theo thương hiệu','chart.brand_qty_share.sub':'Số lượng bán ra, gom theo 3 ký tự đầu SKU',
    'chart.brand_revenue_share':'Tỉ trọng doanh thu theo thương hiệu','chart.brand_revenue_share.sub':'Doanh thu sau giảm giá của đơn hoàn thành',
    'chart.by_city':'Phân bổ theo tỉnh / thành','chart.traffic_trend':'Traffic theo thời gian','chart.traffic_trend.sub':'Lượt xem + đơn hàng tương quan',
    'chart.customer_segments':'Phân loại khách hàng','chart.customer_segments.sub':'Mới · Cũ · Tiềm năng',
    'seg.new':'Khách mới','seg.returning':'Khách cũ','seg.potential':'Tiềm năng','seg.total_label':'Người mua',
    'chart.traffic_platform':'Traffic theo sàn','chart.radar':'Radar tổng hợp',
    'chart.revenue_city':'Doanh thu theo tỉnh / thành','chart.top15':'Top 15 địa phương',
    'chart.hcm_districts':'Quận / Huyện — TP. Hồ Chí Minh','chart.hanoi_districts':'Quận / Huyện — Hà Nội',
    'card.recent_orders':'Đơn hàng gần đây','card.top_products':'Top sản phẩm',
    'card.order_list':'Danh sách đơn hàng','card.product_list':'Danh sách sản phẩm',
    'card.top5_revenue':'Top 5 doanh thu','card.top_locations':'Top địa phương','card.brand_analysis':'Phân tích thương hiệu',
    'card.customer_leaderboard':'Khách hàng nổi bật','card.customer_leaderboard.sub':'Thống kê theo username trong bộ lọc hiện tại',
    'card.orders_heatmap':'Đơn hàng theo ngày & giờ','card.rev_heatmap':'Doanh thu theo ngày & giờ',
    'th.order_id':'Mã đơn','th.product':'Sản phẩm','th.platform':'Sàn','th.date':'Ngày đặt',
    'th.value':'Giá trị','th.status':'Trạng thái','th.sku':'SKU','th.product_name':'Tên sản phẩm','th.brand':'Thương hiệu',
    'th.qty':'SL','th.qty_sold':'SL bán','th.qty_share':'Tỉ trọng SL',
    'th.revenue':'Doanh thu','th.revenue_share':'Tỉ trọng DT','th.rank':'Hạng','th.username':'Username',
    'beta.try':'Thử bản beta v2.0.0','beta.try_title':'UI mới v2.0.0 — dùng chung database',
    'view_mode.title':'Hiển thị sản phẩm dạng nguyên gốc từ sàn hoặc tách thành SKU đơn lẻ',
    'plan.progress.title':'Tiến độ hiện tại','plan.progress.sub':'Tiến độ chuẩn hóa theo % để so sánh giữa các chỉ tiêu có quy mô khác nhau.',
    'plan.target_table.title':'Target YTD / YTG','plan.target_table.sub':'Bảng điều hành nhanh theo mục tiêu năm, thực đạt hiện tại và mức trung bình cần đạt cho các tháng còn lại.',
    'plan.th.metric':'Chỉ tiêu','plan.th.avg_remaining':'TB/tháng còn lại','plan.th.status':'Trạng thái',
    'plan.loading':'Đang tải kế hoạch...','plan.monthly.title':'Chi tiết theo tháng',
    'plan.monthly.sub':'Thực đạt từng tháng so với mục tiêu trung bình tháng (Target FY / 12).','plan.monthly.loading':'Đang tải dữ liệu tháng...',
    'plan.chart.run_rate':'Tiến độ theo tháng','plan.chart.run_rate.sub':'Actual so với đường target bình quân năm',
    'plan.chart.revenue_actual':'Doanh số actual','plan.chart.revenue_target_month':'Doanh số target/tháng',
    'plan.chart.visits_actual':'Visit actual','plan.chart.visits_target_month':'Visit target/tháng',
    'plan.form.title':'Mục tiêu năm','plan.form.sub':'Nhập mục tiêu doanh số và lượt truy cập cho năm đang xem.',
    'plan.form.year':'Năm','plan.form.revenue_target':'Doanh số mục tiêu','plan.form.visits_target':'Lượt truy cập mục tiêu','plan.form.save':'Lưu mục tiêu',
    'plan.empty':'Chưa có dữ liệu kế hoạch.','plan.monthly.empty':'Chưa có dữ liệu tháng.','plan.progress.empty':'Chưa có dữ liệu để so sánh.',
    'plan.status.on_track':'Đúng tiến độ','plan.status.behind':'Cần bù tốc độ',
    'plan.metric.revenue':'Doanh số','plan.metric.visits':'Lượt truy cập',
    'plan.metric.revenue_sub':'Doanh thu đơn hoàn thành','plan.metric.visits_sub':'Traffic visits toàn sàn',
    'plan.monthly.target_title':'Mục tiêu TB','plan.progress.need_avg':'Cần TB {value} / tháng trong {months} tháng còn lại',
    'plan.progress.year_done_behind':'Năm đã hết kỳ, chưa đạt mục tiêu.','plan.progress.completed_year':'Đã hoàn thành mục tiêu năm.',
    'plan.progress.actual':'Đã đạt','plan.progress.ytg':'Còn lại (YTG)','plan.progress.target_year':'Mục tiêu năm',
    'plan.error.invalid_year':'Năm kế hoạch không hợp lệ.','plan.error.save_failed':'Không thể lưu mục tiêu kế hoạch.','plan.toast.saved':'Đã lưu mục tiêu kế hoạch.',
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
    'account.password.force.title':'Bạn cần đổi mật khẩu trước khi tiếp tục',
    'account.password.force.sub':'Đây là mật khẩu tạm do admin thiết lập. Mật khẩu mới phải đạt tối thiểu mức Trung bình.',
    'account.password.force.modal_title':'Cập nhật mật khẩu bắt buộc',
    'account.password.force.modal_sub':'Hệ thống đang yêu cầu bạn thay mật khẩu tạm trước khi tiếp tục sử dụng dashboard.',
    'account.password.current':'Mật khẩu hiện tại','account.password.new':'Mật khẩu mới','account.password.confirm':'Xác nhận mật khẩu mới',
    'account.password.hint':'Mật khẩu mới phải đạt tối thiểu mức Trung bình: từ 8 ký tự và có ít nhất 2 nhóm ký tự.',
    'account.password.cancel':'Đóng','account.password.logout':'Đăng xuất','account.password.submit':'Cập nhật mật khẩu','account.password.success':'Đã cập nhật mật khẩu.',
    'password.strength.label':'Độ mạnh','password.strength.empty':'Chưa nhập mật khẩu','password.strength.minimum':'Yêu cầu tối thiểu mức Trung bình',
    'password.strength.weak':'Yếu','password.strength.medium':'Trung bình','password.strength.strong':'Mạnh','password.strength.very_strong':'Rất mạnh',
    'password.strength.pass':'Đạt yêu cầu tối thiểu để lưu.','password.strength.fail':'Chưa đạt mức Trung bình để lưu.',
    'password.rule.length':'Từ 8 ký tự trở lên','password.rule.variety':'Ít nhất 2 nhóm ký tự: chữ, số hoặc ký tự đặc biệt',
    'password.error.minimum':'Mật khẩu phải đạt tối thiểu mức Trung bình: từ 8 ký tự và có ít nhất 2 nhóm ký tự.',
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
    'msg.conn_error':'Lỗi kết nối.','msg.server_error':'Lỗi server.','msg.invalid_response':'Phản hồi không hợp lệ từ server.',
    'msg.timeout':'Hết thời gian chờ.','msg.unknown_error':'Lỗi không xác định','msg.failed':'Thất bại.','msg.details':'Chi tiết',
    'msg.all':'tất cả','msg.disconnected':'Đã ngắt kết nối.','msg.save_failed':'Lưu thất bại.',
    'msg.delete_failed':'Xoá thất bại.','msg.credentials_saved':'Đã lưu thông tin xác thực.',
    'msg.app_key_required':'App Key không được để trống.',
    'msg.getting_auth_url':'Đang lấy URL xác thực...','msg.redirecting':'Đang chuyển hướng...',
    'msg.no_auth_url':'Không lấy được URL xác thực.',
    'msg.active':'Hoạt động','msg.inactive':'Tắt','msg.paused':'Tạm dừng','msg.success':'Thành công',
    'msg.not_synced':'Chưa đồng bộ','msg.not_synced_short':'Chưa sync',
    'msg.enable':'Bật','msg.disable':'Tắt',
    'reconcile.price.title':'SKU lẻ',
    'reconcile.price.sub':'Mã SKU đơn lẻ với tên, thương hiệu và giá gốc. Giá gốc dùng để phân bổ doanh thu khi tách combo về SKU đơn lẻ. Có thể thêm/sửa trực tiếp hoặc Import từ Excel.',
    'reconcile.price.panel_title':'Danh sách SKU lẻ','reconcile.price.panel_sub':'Mã SKU lẻ với tên, thương hiệu và giá gốc.',
    'reconcile.price.hint':'Excel cần có cột: SKU, Tên sản phẩm, Thương hiệu (tuỳ chọn), Đơn giá.',
    'reconcile.price.empty':'Chưa có SKU lẻ nào. Có thể thêm thủ công bằng nút bên trên hoặc Import từ Excel (dữ liệu sẽ lưu vào database).',
    'reconcile.combo.title':'Liên kết COMBO ↔ SKU',
    'reconcile.combo.sub':'Một COMBO có thể quy đổi sang nhiều SKU lẻ khác nhau. Số lượng quy đổi dùng để bóc tách qty bán ra; doanh thu phân bổ theo tỉ lệ giá gốc × qty của từng SKU thành phần. Có thể thêm/sửa trực tiếp hoặc Import từ Excel.',
    'reconcile.combo.panel_title':'Liên kết COMBO ↔ SKU','reconcile.combo.panel_sub':'Một SKU combo có thể liên kết nhiều SKU lẻ thực tế, mỗi SKU con có số lượng quy đổi riêng.',
    'reconcile.combo.hint':'Excel cần có cột: SKU Sản phẩm (combo), kèm các cặp Sản phẩm quy đổi N + Số lượng sản phẩm N.',
    'reconcile.combo.empty':'Chưa có liên kết COMBO ↔ SKU. Có thể thêm thủ công bằng nút bên trên hoặc Import từ Excel (dữ liệu sẽ lưu vào database).',
    'reconcile.summary.single_sku':'SKU lẻ','reconcile.summary.combo_links':'Liên kết COMBO',
    'reconcile.summary.unique_combos':'Combo riêng','reconcile.summary.configs':'cấu hình',
    'reconcile.btn.reload':'Tải lại','reconcile.btn.save':'Lưu thay đổi','reconcile.btn.saving':'Đang lưu...',
    'reconcile.btn.import_excel':'Import Excel','reconcile.btn.importing':'Đang nhập...',
    'reconcile.btn.add_row':'Thêm dòng','reconcile.btn.add_combo':'Thêm combo','reconcile.btn.add_child_sku':'+ SKU con',
    'reconcile.btn.delete_sku':'Xoá SKU','reconcile.btn.delete':'Xoá',
    'reconcile.btn.import_title':'Import lần đầu hoặc cập nhật hàng loạt từ Excel; dữ liệu được lưu vào database',
    'reconcile.th.single_sku':'SKU lẻ','reconcile.th.product_name':'Tên sản phẩm','reconcile.th.brand':'Thương hiệu',
    'reconcile.th.unit_price':'Đơn giá','reconcile.th.platform':'Sàn','reconcile.th.combo_sku':'SKU combo',
    'reconcile.th.combo_name':'Tên / từ khóa combo','reconcile.th.product_sku':'SKU sản phẩm trong danh sách',
    'reconcile.th.qty_in_combo':'SL trong combo','reconcile.th.actions':'Thao tác',
    'reconcile.placeholder.product_name':'Tên sản phẩm (tuỳ chọn)','reconcile.placeholder.brand':'Thương hiệu (tuỳ chọn)',
    'reconcile.placeholder.combo_sku':'SKU combo','reconcile.placeholder.combo_name':'Tên hoặc từ khóa combo',
    'reconcile.placeholder.single_sku':'Chọn SKU trong danh sách','reconcile.warning.missing_sku':'SKU này chưa có trong danh sách giá GBS.',
    'reconcile.loading':'Đang tải dữ liệu...','reconcile.loading_settings':'Đang tải cấu hình đối soát...',
    'reconcile.load_error':'Không thể tải cài đặt đối soát.','reconcile.loaded':'Đã tải {prices} SKU lẻ và {combos} liên kết COMBO.',
    'reconcile.saving':'Đang lưu cài đặt đối soát...','reconcile.save_error':'Không thể lưu cài đặt đối soát.',
    'reconcile.saved_default':'Đã lưu thay đổi.','reconcile.saved':'{message} SKU lẻ: {prices}, Liên kết COMBO: {combos}.',
    'reconcile.toast_saved':'Đã lưu cài đặt đối soát GBS.',
    'reconcile.importing_status':'Đang nhập {label} từ Excel vào database...','reconcile.import_error':'Không thể nhập file Excel.',
    'reconcile.imported_default':'Đã nhập dữ liệu từ Excel.','reconcile.imported':'{message} {label}: {count} dòng.',
    'reconcile.toast_imported':'{label}: đã nạp {count} dòng từ Excel.',
    'toast.load_overview':'Không thể tải dữ liệu overview.',
    'toast.load_orders':'Không thể tải dữ liệu đơn hàng.',
    'toast.load_products':'Không thể tải dữ liệu sản phẩm.',
    'toast.load_customers':'Không thể tải dữ liệu khách hàng.',
    'toast.load_traffic':'Không thể tải dữ liệu traffic.',
    'toast.load_comparison':'Không thể tải dữ liệu so sánh.',
    'toast.load_reconcile':'Không thể tải dữ liệu đối soát GBS.',
    'toast.load_heatmap':'Không thể tải dữ liệu heatmap.',
    'toast.sync_done':'Đồng bộ hoàn tất.','toast.sync_error':'Lỗi đồng bộ.',
    'toast.lazada_sync_done':'Đồng bộ Lazada hoàn tất.','toast.lazada_sync_error':'Lỗi đồng bộ Lazada.',
    'toast.shopee_sync_done':'Đồng bộ Shopee hoàn tất',
    'toast.log_cleared':'Đã xoá log thành công.','toast.manifest_saved':'Đã lưu URL manifest!',
    'upload.type_orders':'Đơn hàng','upload.no_history':'Chưa có lịch sử upload',
    'upload.uploading':'Đang tải...','upload.btn_upload_count':'Tải lên ({count} file)',
    'upload.error.not_excel':'"{filename}" không phải file Excel (.xlsx/.xls)',
    'upload.summary.imported':'{count} dòng','upload.summary.skipped':'{count} bỏ qua',
    'upload.summary.errors':'{count} lỗi','upload.no_new_data':'Không có dữ liệu mới',
    'auth.session_expired':'Phiên đăng nhập hết hạn',
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
    'update.check_now':'Kiểm tra ngay','update.manifest_url':'URL Manifest cập nhật',
    'update.manifest_url_hint':'— file JSON chứa thông tin phiên bản mới nhất',
    'update.production_manifest_note':'Production chỉ sử dụng duy nhất manifest này. Không cần nhập URL theo tag phiên bản.',
    'btn.sync':'Đồng bộ','btn.disconnect':'Ngắt kết nối','btn.date_from':'Từ ngày','btn.date_to':'Đến ngày',
    'btn.refresh':'Làm mới','btn.reload':'Tải lại','btn.delete':'Xoá',
    'lang.template_hint':'&nbsp;— chỉnh sửa các giá trị (không đổi key), giữ nguyên <code>_meta</code>, rồi upload.',
    'connect.lazada.step1':'Đăng nhập <strong>open.lazada.com</strong> → <strong>App Console → Create App</strong>',
    'connect.lazada.step2':'Trong phần App Settings, thêm Redirect URL: <code id="lazadaOauthRedirectUri">—</code>',
    'connect.lazada.step3':'Sao chép <strong>App Key</strong> và <strong>App Secret</strong> rồi điền vào form trên',
    'connect.lazada.step4':'Nhấn <strong>Lưu thông tin</strong> rồi nhấn <strong>Kết nối Lazada</strong>',
    'connect.lazada.step5':'Đăng nhập tài khoản Lazada Seller Center và cấp quyền cho app',
    'connect.lazada.step6':'Sau khi kết nối thành công, nhấn <strong>Đồng bộ</strong> để tải đơn hàng về',
    'connect.save_credentials':'Lưu thông tin','connect.sync_all':'Đồng bộ tất cả',
    'connect.placeholder.app_key':'Nhập App Key...','connect.placeholder.app_secret':'Nhập App Secret...',
    'connect.placeholder.partner_id':'Nhập Partner ID...','connect.placeholder.partner_key':'Nhập Partner Key...',
    'connect.shopee.credentials_title':'Thông tin xác thực Shopee Open Platform App',
    'connect.shopee.credentials_sub':'Đăng nhập <strong>open.shopee.com</strong> → My Apps → Create App để lấy Partner ID và Partner Key.',
    'connect.shopee.connect':'Kết nối Shopee','connect.shopee.connected_title':'Shop Shopee đã kết nối',
    'connect.shopee.step1':'Đăng nhập <strong>open.shopee.com</strong> → <strong>My Apps → Create App</strong>',
    'connect.shopee.step2':'Trong App Settings, thêm Redirect URL: <code id="shopeeOauthRedirectUri">—</code>',
    'connect.shopee.step3':'Sao chép <strong>Partner ID</strong> và <strong>Partner Key</strong> rồi điền vào form trên',
    'connect.shopee.step4':'Nhấn <strong>Lưu thông tin</strong> rồi nhấn <strong>Kết nối Shopee</strong>',
    'connect.shopee.step5':'Đăng nhập tài khoản Shopee Seller và cấp quyền cho app',
    'connect.shopee.step6':'Sau khi kết nối thành công, nhấn <strong>Đồng bộ</strong> để tải đơn hàng về',
    'connect.tiktok.credentials_title':'Thông tin xác thực TikTok Shop App',
    'connect.tiktok.credentials_sub':'Tạo app tại <strong>TikTok Shop Partner Center</strong> → App &amp; Service → Create app &amp; service để lấy App Key và App Secret.',
    'connect.tiktok.connect':'Kết nối TikTok Shop','connect.tiktok.connected_title':'Shop đã kết nối',
    'connect.tiktok.step1':'Đăng ký tài khoản <strong>TikTok Shop Partner Center</strong> tại <code>partner.tiktokshop.com</code>',
    'connect.tiktok.step2':'Vào <strong>App &amp; Service → Create app &amp; service</strong>, tạo Custom App',
    'connect.tiktok.step3':'Trong phần cài đặt app, bật <strong>Enable API</strong> và nhập Redirect URL: <code id="oauthRedirectUri">—</code>',
    'connect.tiktok.step4':'Sao chép <strong>App Key</strong> và <strong>App Secret</strong> rồi điền vào form trên',
    'connect.tiktok.step5':'Nhấn <strong>Lưu thông tin</strong> rồi nhấn <strong>Kết nối TikTok Shop</strong>',
    'connect.tiktok.step6':'Đăng nhập tài khoản TikTok Shop và cấp quyền cho app',
    'connect.tiktok.step7':'Sau khi kết nối thành công, nhấn <strong>Đồng bộ</strong> để tải đơn hàng về',
    'connect.lazada.credentials_title':'Thông tin xác thực Lazada Open Platform App',
    'connect.lazada.credentials_sub':'Đăng nhập <strong>open.lazada.com</strong> → App Console → Create App để lấy App Key và App Secret.',
    'connect.lazada.connect':'Kết nối Lazada','connect.lazada.connected_title':'Tài khoản Lazada đã kết nối',
    'connect.oauth.tiktok_success':'Đã kết nối thành công {n} shop TikTok!',
    'connect.oauth.tiktok_error':'Kết nối TikTok thất bại:','connect.oauth.shopee_success':'Đã kết nối shop Shopee thành công!',
    'connect.oauth.shopee_error':'Kết nối Shopee thất bại:','connect.oauth.lazada_success':'Đã kết nối tài khoản Lazada thành công!',
    'connect.oauth.lazada_error':'Kết nối Lazada thất bại:',
    'gbs.upload.empty':'Chưa có file GBS nào trong kho đối soát.',
    'gbs.upload.processing':'Đang xử lý file','gbs.upload.processing_desc':'Hệ thống đang kiểm tra cấu trúc và nhận diện tháng đối soát từ file GBS.',
    'gbs.upload.no_file':'Chưa có file GBS','gbs.upload.empty_hint':'Upload file GBS để hệ thống tự gom tháng đối soát.',
    'gbs.upload.files_saved':'{n} file đang lưu','gbs.upload.months_ready':'{n} tháng sẵn sàng',
    'gbs.upload.latest_file':'Mới nhất: {file} • {time}','gbs.upload.failed':'Upload thất bại',
    'gbs.upload.detail_orders':'{n} đơn','gbs.upload.detail_rows':'{n} dòng','gbs.upload.saved_toast':'GBS: đã lưu file{details}',
    'gbs.th.platform_orders_col':'Đơn sàn','gbs.th.matched_orders':'Đơn khớp',
    'gbs.th.missing_in_gbs':'Thiếu trong GBS','gbs.th.missing_in_platform':'Thiếu dữ liệu sàn',
    'gbs.th.result':'Kết quả','gbs.th.platform_file':'File sàn','gbs.th.note':'Ghi chú',
    'gbs.unmatched.summary':'{n} đơn cần xem','gbs.unmatched.summary_limited':'{n} đơn • xem {limit} dòng đầu',
    'gbs.unmatched.empty':'Không có đơn sàn nào đang lệch hoặc thiếu trong GBS.',
    'gbs.order.platform_statuses':'Sàn','gbs.order.platform_status':'Trạng thái sàn',
    'gbs.stat.file_gbs':'File GBS','gbs.stat.gbs_orders_short':'Đơn GBS','gbs.stat.files_in_store':'{n} file trong kho','gbs.stat.month_count':'{n} tháng',
    'gbs.files.store':'Kho đối soát','gbs.files.delete_confirm':'Xoá file {file} khỏi kho đối soát?',
    'gbs.files.delete_failed':'Xoá thất bại','gbs.files.deleted_toast':'GBS: đã xoá file {file}',
    'gbs.error.prefixed':'GBS: {message}','gbs.run.latest_refresh':'Lần làm mới gần nhất','gbs.run.no_note':'Chưa có ghi chú đối soát.',
    'gbs.mapping.platform_rules':'Quy tắc {platform}','gbs.mapping.logic':'Logic','gbs.mapping.platform_data':'Dữ liệu sàn chung','gbs.mapping.rule':'Quy tắc',
    'gbs.platform.default_scope':'Đối soát theo đơn hàng và quy đổi combo trước khi so sánh.','gbs.platform.open_detail':'Mở chi tiết',
    'gbs.platform.hidden_orders':'Còn {n} đơn chưa hiển thị trong bảng này.','gbs.sku.compared_qty':'so khớp {qty}','gbs.sku.more_rows':'+{n} dòng nữa',
    'customer.conv.detail':'{orders} đơn / {visits} lượt truy cập',
    'brand.btn.save':'Lưu thương hiệu','brand.btn.saving':'Đang lưu...',
    'brand.settings.title':'Quy ước SKU sang Thương hiệu','brand.settings.sub':'Thiết lập tên thương hiệu theo đúng 3 ký tự đầu trong mã SKU để dùng trong phần phân tích.',
    'brand.banner.title':'Nhận diện thương hiệu:','brand.banner.desc':'hệ thống lấy 3 ký tự đầu của SKU sau khi chuẩn hóa chữ hoa.',
    'brand.banner.example':'Ví dụ SKU `MON055GH04VAN` sẽ thuộc mã thương hiệu `MON`.',
    'brand.unmapped':'Chưa quy ước','brand.meta.orders':'{n} đơn','brand.rules_count':'{n} quy ước thương hiệu',
    'brand.empty_rules':'Chưa có quy ước thương hiệu. Thêm mã 3 ký tự đầu SKU để đặt tên thương hiệu.',
    'brand.placeholder.name':'Tên thương hiệu','brand.loaded_count':'Đã tải {n} quy ước thương hiệu.',
    'danger.title':'Vùng nguy hiểm — Reset Database','danger.sub':'Các thao tác dưới đây không thể hoàn tác. Hãy chắc chắn trước khi thực hiện.',
    'danger.orders.title':'Xóa dữ liệu đơn hàng','danger.orders.desc':'Xóa toàn bộ orders, traffic, upload_history, import_errors',
    'danger.orders.button':'Xóa dữ liệu đơn hàng','danger.orders.confirm':'Xóa toàn bộ đơn hàng và traffic?','danger.orders.prompt':'Nhập DELETE ORDERS để xác nhận:',
    'danger.api.title':'Xóa kết nối API','danger.api.desc':'Xóa TikTok & Lazada connections, App Key/Secret đã lưu',
    'danger.api.button':'Xóa kết nối API','danger.api.confirm':'Xóa toàn bộ kết nối API?','danger.api.prompt':'Nhập DELETE API để xác nhận:',
    'danger.logs.title':'Xóa nhật ký hệ thống','danger.logs.desc':'Xóa toàn bộ app_logs (không ảnh hưởng đến dữ liệu)',
    'danger.logs.button':'Xóa nhật ký','danger.logs.confirm':'Xóa toàn bộ nhật ký?','danger.logs.prompt':'Nhập DELETE LOGS để xác nhận:',
    'danger.all.title':'Reset TOÀN BỘ database','danger.all.desc':'Xóa tất cả: đơn hàng, traffic, API keys, logs, cài đặt',
    'danger.all.button':'Reset toàn bộ','danger.all.confirm':'CẢNH BÁO: Xóa TOÀN BỘ dữ liệu không thể khôi phục!','danger.all.prompt':'Nhập RESET ALL để xác nhận:',
  };

  // ── State ─────────────────────────────────────────────────────────────────
  let _lang           = 'vi';
  let _translations   = { ..._vi };
  let _availableLangs = [];

  function languageIconSvg(code = '', className = '') {
    const classes = ['inline-icon', 'lang-icon', className].filter(Boolean).join(' ');
    return `<svg class="${classes}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>`;
  }

  function escHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Core translation ──────────────────────────────────────────────────────
  function t(key) {
    return _translations[key] ?? _vi[key] ?? key;
  }

  function format(key, vars = {}) {
    return String(t(key)).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
  }

  // ── Apply translations to DOM ─────────────────────────────────────────────
  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const val = _translations[el.dataset.i18n] ?? _vi[el.dataset.i18n];
      if (val !== undefined) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const val = _translations[el.dataset.i18nHtml] ?? _vi[el.dataset.i18nHtml];
      if (val !== undefined) el.innerHTML = val;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const val = _translations[el.dataset.i18nTitle] ?? _vi[el.dataset.i18nTitle];
      if (val !== undefined) el.setAttribute('title', val);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const val = _translations[el.dataset.i18nPlaceholder] ?? _vi[el.dataset.i18nPlaceholder];
      if (val !== undefined) el.setAttribute('placeholder', val);
    });

    // Update collapsed nav tooltips
    document.querySelectorAll('.nav-item[data-label]').forEach(item => {
      const map = {
        overview:'nav.overview', orders:'nav.orders', products:'nav.products',
        customers:'nav.customers', traffic:'nav.traffic', comparison:'nav.comparison', plan:'nav.plan',
        'product-list':'nav.product_list', 'data-link':'nav.data_link',
        reconcile:'nav.reconcile', heatmaps:'nav.analytics', upload:'nav.upload', connect:'nav.connect',
        logs:'nav.logs', settings:'nav.settings', 'settings-account':'nav.settings_account',
        'settings-lang':'nav.settings_lang', system:'nav.system', admin:'nav.admin',
      };
      const key = map[item.dataset.page];
      if (key) item.dataset.label = t(key);
    });

    _updateSelectorUI();
    window.syncPasswordStrengthIndicators?.();
    window.syncPasswordModalState?.();
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
        { code: 'vi', name: 'Tiếng Việt', flag: '', builtin: true },
        { code: 'en', name: 'English',    flag: '', builtin: true },
      ];
    }
    return _availableLangs;
  }

  function getAvailableLangs() { return _availableLangs; }
  function getLang()            { return _lang; }

  // ── Update the language selector button ───────────────────────────────────
  function _updateSelectorUI() {
    const meta     = _availableLangs.find(l => l.code === _lang) || { code: _lang };
    const flagEl   = document.getElementById('langFlag');
    const codeEl   = document.getElementById('langCode');
    const currentEl = document.getElementById('userMenuLangCurrent');
    if (flagEl) flagEl.innerHTML = languageIconSvg(meta.code);
    if (codeEl) codeEl.textContent = _lang.toUpperCase();
    if (currentEl) currentEl.innerHTML = `${languageIconSvg(meta.code)} ${escHtml(_lang.toUpperCase())}`;
  }

  return { init, t, format, setLang, getLang, loadLanguage, loadAvailableLangs, getAvailableLangs, applyTranslations, languageIconSvg };
})();

// ── Global helpers (for charts.js, app.js backward compat) ──────────────────
function t(key)              { return I18n.t(key); }
function tFormat(key, vars)  { return I18n.format(key, vars); }
async function setLang(code) { return I18n.setLang(code); }
function getLang()           { return I18n.getLang(); }
function applyTranslations() { return I18n.applyTranslations(); }
