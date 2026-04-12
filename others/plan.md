# 📊 Business Dashboard v3 — Kế hoạch triển khai

## Tổng quan

Dashboard theo dõi kinh doanh trên 3 sàn TMĐT (Shopee, Lazada, TikTok Shop), chạy trên **Shared Hosting** (PHP 7.4+ / MySQL 5.7+). Không dùng Node.js hay framework nặng — toàn bộ backend là PHP thuần, frontend là Vanilla JS + Chart.js.

---

## 1. Yêu cầu chức năng

### 1.1 Chạy trên Shared Hosting
- **Stack**: PHP 7.4+ · MySQL 5.7+ · PhpSpreadsheet · Composer
- **Không cần**: Node.js, React, Next.js, WebSocket, CLI dài hạn
- Upload file lớn (>10 MB) cần cấu hình `.user.ini`: `upload_max_filesize = 50M`, `post_max_size = 55M`, `memory_limit = 256M`, `max_execution_time = 300`
- File tạm sẽ bị xóa ngay sau khi import xong (không lưu lại trên hosting)
- Auth: session PHP đơn giản (username/password lưu trong `config.php`)

### 1.2 Bộ lọc thời gian
- **Chế độ Tháng**: chọn tháng cụ thể (VD: `03/2026`), chart hiển thị theo ngày (granularity = day)
- **Chế độ Năm**: chọn năm (VD: `2026`), chart hiển thị theo tháng (granularity = month)
- Danh sách tháng/năm khả dụng **tự động lấy từ DB** (API `date-periods.php`) — chỉ hiện những period có dữ liệu thực
- Default: tháng gần nhất có dữ liệu
- Filter platform (All / Shopee / Lazada / TikTok) kết hợp với filter thời gian

### 1.3 Upload & Import Excel
- **Batch upload**: kéo thả nhiều file cùng lúc (multiple files)
- **Auto-detect platform**: phân tích header row để nhận diện Shopee / Lazada / TikTok / Traffic
- **Auto-detect data type**: orders vs traffic data
- **Upsert logic**: trùng `(platform, order_id, sku)` → cập nhật, không tạo mới (tránh duplicate)
- **Chunked processing**: xử lý từng batch 500 row để tránh timeout
- Báo cáo kết quả chi tiết: tổng row / imported / skipped / errors
- File tạm bị xóa sau khi xử lý xong
- Giới hạn: 50MB/file, chấp nhận `.xlsx` và `.xls`

---

## 2. Phân tích dữ liệu nguồn

### 2.1 Shopee Orders
| Thông tin | Chi tiết |
|-----------|---------|
| Sheet | `orders` |
| Header row | Row 1 |
| Data starts | Row 2 |
| Date format | `YYYY-MM-DD HH:MM` |
| Nhận diện | `mã đơn hàng`, `ngày đặt hàng`, `phí cố định`, `mã giảm giá của shopee` |

**Cột quan trọng** (theo tên cột, dùng fuzzy matching):
- `mã đơn hàng` → order_id
- `ngày đặt hàng` → order_created_at
- `trạng thái đơn hàng` → status → normalize
- `sku sản phẩm` → sku
- `tên sản phẩm` → product_name
- `giá gốc` → unit_price
- `người bán trợ giá` → seller_discount
- `được shopee trợ giá` → platform_discount
- `giá ưu đãi` → promo_price (subtotal_after_discount / qty)
- `số lượng` → quantity
- `tổng giá trị đơn hàng` → order_total
- `phí vận chuyển mà người mua trả` → shipping_fee
- `phí cố định` → platform_fee_fixed
- `phí dịch vụ` → platform_fee_service
- `phí thanh toán` → platform_fee_payment
- `tỉnh/thành phố` → shipping_city
- `tp / quận / huyện` → shipping_district

**Normalize status Shopee**:
- `hoàn thành` → `completed`
- `đã giao` hoặc `người mua xác nhận đã nhận được hàng...` → `delivered`
- `đã hủy` / `đã huỷ` → `cancelled`
- còn lại → `pending`

### 2.2 Lazada Orders
| Thông tin | Chi tiết |
|-----------|---------|
| Sheet | `sheet1` |
| Header row | Row 1 (English headers) |
| Date format | `DD Mon YYYY HH:MM` (VD: `04 Apr 2026 07:17`) |
| Nhận diện | `orderitemid`, `lazadaid`, `paidprice`, `orderNumber` |

**Cột quan trọng**:
- `orderNumber` → order_id (nhóm đơn)
- `createTime` → order_created_at
- `status` → normalize
- `sellerSku` → sku
- `itemName` → product_name
- `paidPrice` → order_total / subtotal_after_discount
- `unitPrice` → unit_price
- `sellerDiscountTotal` → seller_discount (giá trị âm, lấy abs)
- `shippingFee` → shipping_fee
- `shippingCity` → shipping_city
- `payMethod` → payment_method

**Normalize status Lazada**:
- `delivered` → `completed`
- `confirmed` → `delivered`
- `canceled` / `cancelled` → `cancelled`
- còn lại → `pending`

### 2.3 TikTok Shop Orders
| Thông tin | Chi tiết |
|-----------|---------|
| Sheet | `OrderSKUList` |
| Header row | Row 1 |
| **Description row** | **Row 2 — BỎ QUA khi parse** |
| Data starts | Row 3 |
| Date format | `DD/MM/YYYY HH:MM:SS` |
| Nhận diện | `order id`, `order status`, `seller sku`, `sku unit original price` |

**Cột quan trọng**:
- `Order ID` → order_id
- `Order Status` → status → normalize
- `Created Time` → order_created_at
- `Seller SKU` → sku
- `Product Name` → product_name
- `Quantity` → quantity
- `SKU Unit Original Price` → unit_price
- `SKU Platform Discount` → platform_discount
- `SKU Seller Discount` → seller_discount
- `SKU Subtotal After Discount` → subtotal_after_discount
- `Order Amount` → order_total
- `Province` → shipping_city
- `District` → shipping_district

**Normalize status TikTok**:
- `Đã hoàn tất` / `completed` → `completed`
- `Đã vận chuyển` / `shipped` / `in transit` / `delivered` → `delivered`
- `Đã hủy` / `cancelled` / `canceled` → `cancelled`
- còn lại → `pending`

### 2.4 Traffic Data
| Sàn | Sheet | Cột quan trọng |
|-----|-------|---------------|
| Shopee | `Tất cả` / `Ứng dụng` / `Máy tính` | Ngày, Lượt xem, Lượt truy cập, Tỉ lệ thoát |
| Lazada | `Các chỉ số quan trọng` | Ngày, Lượt xem, Khách truy cập |
| TikTok | `Sheet1` | Ngày, Lượt xem trang, Lượt truy cập trang cửa hàng |

Nhận diện traffic: header chứa `lượt xem`, `lượt truy cập`, `tỉ lệ thoát`, `page views`, `visits`

---

## 3. Database Schema (MySQL)

### 3.1 Bảng `upload_history`
```sql
CREATE TABLE upload_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    platform ENUM('shopee','lazada','tiktokshop') NOT NULL,
    data_type ENUM('orders','traffic') NOT NULL DEFAULT 'orders',
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    total_rows INT DEFAULT 0,
    imported_rows INT DEFAULT 0,
    skipped_rows INT DEFAULT 0,
    status ENUM('pending','processing','completed','failed') DEFAULT 'pending',
    error_message TEXT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME NULL,
    INDEX idx_platform (platform),
    INDEX idx_data_type (data_type),
    INDEX idx_status (status),
    INDEX idx_uploaded_at (uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.2 Bảng `orders`
```sql
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    platform ENUM('shopee','lazada','tiktokshop') NOT NULL,
    order_id VARCHAR(100) NOT NULL,
    buyer_name VARCHAR(255) NULL,
    buyer_username VARCHAR(255) NULL,
    shipping_address VARCHAR(500) NULL,
    shipping_district VARCHAR(100) NULL,
    shipping_city VARCHAR(100) NULL,
    payment_method VARCHAR(100) NULL,
    sku VARCHAR(100) NOT NULL,
    product_name VARCHAR(500),
    variation VARCHAR(255) NULL,
    quantity INT DEFAULT 1,
    unit_price DECIMAL(15,2) DEFAULT 0,
    subtotal_before_discount DECIMAL(15,2) DEFAULT 0,
    platform_discount DECIMAL(15,2) DEFAULT 0,
    seller_discount DECIMAL(15,2) DEFAULT 0,
    subtotal_after_discount DECIMAL(15,2) DEFAULT 0,
    order_total DECIMAL(15,2) DEFAULT 0,
    shipping_fee DECIMAL(15,2) DEFAULT 0,
    platform_fee_fixed DECIMAL(15,2) DEFAULT 0,
    platform_fee_service DECIMAL(15,2) DEFAULT 0,
    platform_fee_payment DECIMAL(15,2) DEFAULT 0,
    normalized_status ENUM('completed','delivered','cancelled','pending') NOT NULL,
    original_status VARCHAR(500),
    order_created_at DATETIME NOT NULL,
    order_paid_at DATETIME NULL,
    order_completed_at DATETIME NULL,
    upload_id INT NULL,
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_platform_order_sku (platform, order_id, sku),
    INDEX idx_platform_status_date (platform, normalized_status, order_created_at),
    INDEX idx_order_created_at (order_created_at),
    INDEX idx_sku (sku),
    INDEX idx_shipping_city (shipping_city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.3 Bảng `traffic_daily`
```sql
CREATE TABLE traffic_daily (
    id INT AUTO_INCREMENT PRIMARY KEY,
    platform ENUM('shopee','lazada','tiktokshop') NOT NULL,
    traffic_date DATE NOT NULL,
    device_type ENUM('all','desktop','mobile') NOT NULL DEFAULT 'all',
    page_views INT DEFAULT 0,
    avg_page_views DECIMAL(10,2) DEFAULT 0,
    avg_session_duration INT DEFAULT 0,
    bounce_rate DECIMAL(5,2) DEFAULT 0,
    visits INT DEFAULT 0,
    new_visitors INT DEFAULT 0,
    returning_visitors INT DEFAULT 0,
    new_followers INT DEFAULT 0,
    upload_id INT NULL,
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_traffic_date (platform, traffic_date, device_type),
    INDEX idx_traffic_date (traffic_date),
    INDEX idx_traffic_platform (platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.4 Bảng `import_errors`
```sql
CREATE TABLE import_errors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    upload_id INT NOT NULL,
    row_number INT NOT NULL,
    raw_order_id VARCHAR(100) NULL,
    raw_sku VARCHAR(100) NULL,
    error_code VARCHAR(100) NOT NULL,
    error_message VARCHAR(500) NOT NULL,
    raw_payload LONGTEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_upload_id (upload_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3.5 Bảng `app_settings`
```sql
CREATE TABLE app_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 4. Kiến trúc hệ thống

### 4.1 Cấu trúc thư mục
```
dashboard-v3/
├── index.php                   # SPA entry point + auth screen
├── config.php                  # DB config, auth credentials, constants
├── .htaccess                   # URL rewriting, security headers, PHP limits
├── .user.ini                   # PHP upload limits for shared hosting
├── composer.json               # phpoffice/phpspreadsheet
├── vendor/                     # Composer deps
├── uploads/                    # Temp upload dir (files deleted after processing)
│
├── api/
│   ├── auth.php                # POST login / POST logout / GET status
│   ├── date-periods.php        # GET available months & years from DB
│   ├── upload.php              # POST multi-file upload & import
│   ├── upload-history.php      # GET upload history list
│   ├── revenue.php             # GET revenue timeseries + summary
│   ├── orders.php              # GET orders list + status breakdown
│   ├── orders-status.php       # GET orders status chart data
│   ├── products.php            # GET top products by qty & revenue
│   ├── customers.php           # GET customer city distribution
│   ├── traffic.php             # GET traffic timeseries
│   ├── heatmap.php             # GET 7×24 order heatmap data
│   └── comparison.php          # GET cross-platform comparison
│
├── includes/
│   ├── bootstrap.php           # Require config, helpers, autoloader
│   ├── db.php                  # PDO factory + ensure_schema() + upsert helpers
│   ├── helpers.php             # sql_filters(), resolve_granularity(), parse_amount()
│   │                           # detect_platform(), normalize_city(), auth helpers
│   └── Parsers/
│       ├── BaseParser.php      # Abstract: sheet(), cell(), resolveColumns()
│       ├── ShopeeParser.php    # Header-based fuzzy column matching
│       ├── LazadaParser.php    # English header parsing
│       ├── TiktokShopParser.php# Skip row 2 (description row)
│       └── TrafficParser.php   # Multi-platform traffic data
│
└── assets/
    ├── css/
    │   ├── variables.css       # Color tokens, spacing scale
    │   ├── base.css            # Reset, typography
    │   ├── layout.css          # Sidebar, header, page grid
    │   ├── components.css      # Cards, badges, buttons, table, modal
    │   ├── charts.css          # Chart wrappers, skeleton loaders
    │   └── upload.css          # Drop zone, progress bar, file list
    └── js/
        ├── app.js              # Router, state, API client, time filter
        ├── charts.js           # Chart.js renderers for each page
        └── upload.js           # Multi-file drag-drop, progress, batch UI
```

### 4.2 Data Flow
```
User uploads files
  → api/upload.php (validate, detect platform, detect data type)
  → Parser::parse() (fuzzy column matching, normalize status/city)
  → upsert_order() / upsert_traffic_daily() (ON DUPLICATE KEY UPDATE)
  → upload_history updated (status=completed, stats)
  → Frontend shows result toast

User selects time filter
  → api/date-periods.php returns available months/years
  → User picks month or year
  → Frontend sends ?period=2026-03&mode=month  OR  ?period=2026&mode=year
  → API uses resolve_granularity() → returns day/month buckets
  → Charts render with appropriate x-axis
```

---

## 5. Bộ lọc thời gian & Granularity

### 5.1 API Filter Parameters
```
GET /api/revenue.php?mode=month&period=2026-03&platform=all
GET /api/revenue.php?mode=year&period=2026&platform=shopee
```

| mode  | period   | Granularity | SQL bucket |
|-------|----------|-------------|------------|
| month | 2026-03  | day         | `DATE(order_created_at)` |
| year  | 2026     | month       | `DATE_FORMAT(order_created_at, '%Y-%m')` |

### 5.2 `sql_filters()` helper
```php
// Builds WHERE clause from $_GET params
// Handles: mode, period, platform
// Returns: [string $where, array $params]
```

### 5.3 Chart hiển thị theo granularity
- **Month mode** (31 points): Line chart, x-axis = `01`, `02`, ..., `31`
- **Year mode** (12 points): Bar/line chart, x-axis = `T1`, `T2`, ..., `T12`
- Heatmap (7×24): chỉ dùng cho month mode, hiển thị theo giờ trong tháng

---

## 6. API Endpoints

### 6.1 `GET /api/date-periods.php`
```json
{
  "months": [{"value":"2026-03","label":"03/2026"},{"value":"2026-02","label":"02/2026"}],
  "years":  [{"value":"2026","label":"Năm 2026"}]
}
```

### 6.2 `GET /api/revenue.php`
```json
{
  "granularity": "day",
  "summary": {"total_revenue":243769463,"total_orders":1046,"avg_order_value":233049},
  "timeseries": [{"date":"2026-03-01","shopee":5023780,"lazada":0,"tiktokshop":0,"total":5023780}],
  "platform_breakdown": {"shopee":{"revenue":241201003,"percentage":98.9}}
}
```

### 6.3 `GET /api/orders.php`
```json
{
  "summary": {"total":1220,"completed":1046,"cancelled":169,"shipping":5,"cancel_rate":13.9},
  "by_platform": {"shopee":{"total":1199,"completed":1033}},
  "timeseries": [{"date":"2026-03-01","total":35,"completed":29,"cancelled":6}],
  "recent": [{"order_id":"...","platform":"shopee","status":"completed","order_total":144000}]
}
```

### 6.4 `GET /api/products.php`
```json
{
  "top_qty": [{"sku":"MON055GC08VAN","name":"...","qty":152,"revenue":21888000,"platform":"shopee"}],
  "top_revenue": [...],
  "total_skus": 48
}
```

### 6.5 `GET /api/customers.php`
```json
{
  "total_orders": 1046,
  "avg_order_value": 233049,
  "city_distribution": [{"city":"Hà Nội","orders":589,"percentage":56.3}]
}
```

### 6.6 `GET /api/traffic.php`
```json
{
  "summary": {"total_views":3726,"total_visitors":1352},
  "timeseries": [{"date":"2026-03-01","shopee":0,"lazada":112,"tiktokshop":45,"total_views":157,"total_visitors":62}],
  "by_platform": {"lazada":{"views":2220,"visitors":322},"tiktokshop":{"views":1506,"visitors":776}}
}
```

### 6.7 `GET /api/heatmap.php`
```json
{
  "orders": [{"weekday":0,"hour":0,"count":3},...],
  "revenue": [{"weekday":0,"hour":0,"amount":450000},...],
  "max_orders": 45,
  "max_revenue": 5000000
}
```

### 6.8 `POST /api/upload.php`
- `Content-Type: multipart/form-data`
- Body: `files[]` (multiple files), `_csrf`
- Response: `{"success":true,"results":[{"file":"...","platform":"shopee","imported":1033,"skipped":166}]}`

---

## 7. Frontend — 7 trang Dashboard

### 7.1 Overview
- KPI cards: Doanh thu, Đơn hàng, Lượt xem, Khách truy cập
- Revenue trend line (by day/month)
- Revenue by platform donut
- Top 5 products bar
- Recent orders mini-list

### 7.2 Orders
- KPI: Total, Completed, Cancelled, Cancel Rate
- Order volume trend line (stacked by platform)
- Status donut
- Platform bar (completed vs cancelled)
- Hourly distribution bar
- Orders table (paginated, filterable)

### 7.3 Products
- Total SKUs KPI
- Top 10 by quantity (horizontal bar)
- Top 10 by revenue (horizontal bar)
- Product table

### 7.4 Customers
- KPI: Total orders, AOV, Cancel rate
- City distribution bar chart
- City ranked list with progress bars

### 7.5 Traffic
- KPI: Page views, Visitors, Conversion rate
- Views & Visitors trend (dual line)
- Platform comparison (grouped bar)
- Views vs Orders (dual axis)

### 7.6 Comparison
- Platform summary cards (Shopee / Lazada / TikTok)
- Revenue comparison bar
- Orders comparison bar
- Radar chart (multi-metric)

### 7.7 Heatmaps
- 7×24 orders heatmap (weekday × hour)
- Revenue by city bar

---

## 8. Upload UI

### 8.1 Drop Zone
- Drag & drop nhiều file (multiple)
- Click chọn file
- Preview danh sách file đã chọn (tên, size, status)
- Nút "Upload tất cả" → sequential upload từng file
- Progress bar per file + tổng

### 8.2 Auto-detect feedback
```
✓ shopee_march.xlsx   → Shopee Orders    → 1,033 imported, 166 skipped
✓ lazada_q1.xlsx      → Lazada Orders    →    45 imported,   0 skipped
✓ traffic_shopee.xlsx → Shopee Traffic   →    31 imported,   0 skipped
✗ unknown.xlsx        → Không nhận diện được sàn
```

### 8.3 Upload History
- Bảng lịch sử upload (10 bản ghi gần nhất)
- Cột: Thời gian, Nền tảng, Loại dữ liệu, File gốc, Imported, Skipped, Trạng thái

---

## 9. Shared Hosting Checklist

| Mục | Giải pháp |
|-----|-----------|
| Upload file lớn | `.user.ini`: `upload_max_filesize=50M`, `post_max_size=55M` |
| Timeout khi process | `set_time_limit(300)`, chunked processing 500 rows |
| Memory | `memory_limit=256M`, PhpSpreadsheet `setReadDataOnly(true)` |
| Security | `.htaccess` bảo vệ `/uploads/`, `/vendor/`, `/includes/` |
| Composer | Vendor commit vào repo hoặc chạy `composer install` 1 lần |
| Session | PHP session native, không cần Redis |
| Cron job | Không cần (xử lý synchronous) |

---

## 10. Kế hoạch triển khai

### Giai đoạn 1 — Backend Foundation
1. `config.php` — DB, auth, constants
2. `.htaccess` + `.user.ini`
3. `composer.json` + install PhpSpreadsheet
4. `includes/db.php` — schema + upsert helpers
5. `includes/helpers.php` — all helper functions
6. `includes/Parsers/` — 4 parsers

### Giai đoạn 2 — API Layer
1. `api/auth.php`
2. `api/date-periods.php`
3. `api/upload.php` (multi-file)
4. `api/revenue.php`, `api/orders.php`, `api/products.php`
5. `api/customers.php`, `api/traffic.php`, `api/heatmap.php`, `api/comparison.php`
6. `api/upload-history.php`

### Giai đoạn 3 — Frontend
1. `assets/css/` — tất cả 6 file CSS
2. `assets/js/app.js` — router, state, API client, time filter
3. `assets/js/charts.js` — tất cả chart renderers
4. `assets/js/upload.js` — drag-drop, batch progress
5. `index.php` — SPA shell, login screen, sidebar, 7 pages

---

## 11. Ghi chú kỹ thuật

### Fuzzy Column Matching
Parser dùng `resolveColumns()` để match tên cột từ file Excel với field trong hệ thống. Match theo exact → substring. Điều này giúp parser hoạt động dù Shopee/Lazada/TikTok thay đổi format file nhẹ.

### Upsert Logic
```sql
INSERT INTO orders (...) VALUES (...)
ON DUPLICATE KEY UPDATE
  order_total = VALUES(order_total),
  normalized_status = VALUES(normalized_status),
  ...
```
Unique key: `(platform, order_id, sku)` — đảm bảo 1 line item = 1 row.

### Granularity SQL
```php
// mode=month → granularity=day
'label' => "DATE_FORMAT(order_created_at, '%d')"
'bucket' => "DATE(order_created_at)"

// mode=year → granularity=month  
'label' => "DATE_FORMAT(order_created_at, '%Y-%m')"
'bucket' => "DATE_FORMAT(order_created_at, '%Y-%m')"
```

### Normalize City
Chuẩn hóa tên tỉnh thành: bỏ prefix `TP. `, `Tỉnh `, map `Hồ Chí Minh` ↔ `TP. Hồ Chí Minh`, `Hà Nội` ↔ `TP. Hà Nội`.
