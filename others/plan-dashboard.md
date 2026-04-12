# Business Dashboard Plan

## 1. Database Design

### 1.1 Bảng orders (23 trường)
| Field | Type | Mô tả |
|-------|------|-------|
| id | UUID | Primary key |
| platform | VARCHAR(20) | shopee/lazada/tiktok |
| order_id | VARCHAR(50) | Mã đơn platform |
| order_date | DATETIME | Ngày đặt hàng |
| status | VARCHAR(30) | Trạng thái đơn |
| product_sku | VARCHAR(50) | SKU sản phẩm |
| product_name | TEXT | Tên sản phẩm |
| variation | VARCHAR(100) | Phân loại |
| quantity | INT | Số lượng |
| unit_price | DECIMAL(12,0) | Đơn giá gốc |
| discount_seller | DECIMAL(12,0) | Giảm giá |
| final_price | DECIMAL(12,0) | Giá sau giảm |
| shipping_fee | DECIMAL(12,0) | Phí vận chuyển |
| order_amount | DECIMAL(12,0) | Tổng tiền |
| customer_name | VARCHAR(100) | Tên khách |
| customer_phone | VARCHAR(20) | SĐT |
| shipping_address | TEXT | Địa chỉ |
| city | VARCHAR(50) | Tỉnh/TP |
| district | VARCHAR(50) | Quận/Huyện |
| payment_method | VARCHAR(50) | Thanh toán |
| shipping_provider | VARCHAR(50) | Đơn vị vận chuyển |
| tracking_code | VARCHAR(50) | Mã vận đơn |
| cancel_reason | TEXT | Lý do hủy |

### 1.2 Bảng traffic (5 trường)
| Field | Type | Mô tả |
|-------|------|-------|
| id | UUID | Primary key |
| platform | VARCHAR(20) | Nền tảng |
| date | DATE | Ngày |
| page_views | INT | Lượt xem |
| visitors | INT | Khách truy cập |

### 1.3 Bảng products (4 trường)
| Field | Type | Mô tả |
|-------|------|-------|
| id | UUID | Primary key |
| platform | VARCHAR(20) | Nền tảng |
| sku | VARCHAR(50) | SKU |
| name | VARCHAR(255) | Tên |

---

## 2. Dashboard Pages

### 2.1 Overview (6 biểu đồ)
- KPI Cards: Revenue, Orders, Page Views, Visitors
- Trend Line: Doanh thu theo ngày
- Donut: Doanh thu theo nền tảng
- Bar: Top 5 sản phẩm bán chạy

### 2.2 Orders (5 biểu đồ)
- KPI Cards: Total, Completed, Cancelled, Cancel Rate
- Donut: Orders by status
- Line: Orders by date
- Bar: Orders by platform
- Heatmap: Orders by hour
- Table: Chi tiết đơn hàng

### 2.3 Products (4 biểu đồ)
- KPI Card: Total SKUs
- Bar: Top 10 sản phẩm bán chạy
- Bar: Top 10 sản phẩm doanh thu cao
- Treemap: Doanh thu theo sản phẩm

### 2.4 Customers (4 biểu đồ)
- KPI Cards: Total, New, Returning, AOV
- Bar: Customers by city
- Bar: Customers by district
- Map: Phân bố khách hàng

### 2.5 Traffic (5 biểu đồ)
- KPI Cards: Page Views, Visitors, Bounce Rate
- Line: Views & Visitors by date
- Grouped Bar: Traffic by platform
- Dual Axis: Views vs Orders

### 2.6 Comparison (5 biểu đồ)
- Grouped Bar: Revenue so sánh
- Grouped Bar: Orders so sánh
- Bar: AOV so sánh
- Radar: Metrics so sánh 3 platform
- Table: Top sản phẩm mỗi platform

### 2.7 Heatmap (4 biểu đồ)
- Heatmap 7x24: Doanh thu theo giờ
- Heatmap 7x24: Đơn hàng theo giờ
- Choropleth Map: Doanh thu theo TP
- Heatmap: Doanh thu theo quận

---

## 3. Data Sources

| Loại | Files | Records |
|------|-------|---------|
| Orders Shopee | Data Order - Shopee.xlsx | 1,199 |
| Orders Lazada | Data Order Lazada.xlsx | 88 |
| Orders TikTok | Data Order TiktokShop.xlsx | 15 |
| Traffic Shopee | Data Traffic Shopee.xlsx | 34 days |
| Traffic Lazada | Data Traffic Lazada.xls | 31 days |
| Traffic TikTok | Data Traffic TiktokShop.xlsx | 31 days |

---

## 4. Tech Stack

- **Frontend**: Next.js + React
- **Database**: PostgreSQL
- **Charts**: Recharts
- **UI**: TailwindCSS