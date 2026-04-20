# Dashboard v3 — Ghi chú vận hành cho agent khác

## 1. Tổng quan nhanh

- Repo: dashboard PHP/MySQL chạy kiểu shared-hosting.
- Stack chính:
  - PHP + PDO + MySQL
  - PhpSpreadsheet để đọc Excel
  - Frontend thuần `index.php` + JS/CSS tách file
- Timezone mặc định: `Asia/Ho_Chi_Minh`
- Entry backend chung: [includes/bootstrap.php](/Users/etecman/Documents/dashboard-v3/includes/bootstrap.php:1)
- Entry UI chính: [index.php](/Users/etecman/Documents/dashboard-v3/index.php:1)

## 2. Cấu trúc file quan trọng

- [index.php](/Users/etecman/Documents/dashboard-v3/index.php:1)
  - Chứa shell UI, sidebar, page markup, modal, admin form.
- [assets/js/app.js](/Users/etecman/Documents/dashboard-v3/assets/js/app.js:1)
  - Router, auth UI, dashboard pages, admin UI, profile/password modal.
- [assets/js/upload.js](/Users/etecman/Documents/dashboard-v3/assets/js/upload.js:1)
  - UI upload batch.
- [assets/js/charts.js](/Users/etecman/Documents/dashboard-v3/assets/js/charts.js:1)
  - Render chart.
- [assets/js/i18n.js](/Users/etecman/Documents/dashboard-v3/assets/js/i18n.js:1)
  - i18n runtime + fallback VI inline.
- [includes/helpers.php](/Users/etecman/Documents/dashboard-v3/includes/helpers.php:1)
  - Auth/session, CSRF, JSON helpers, date filters, password policy.
- [includes/db.php](/Users/etecman/Documents/dashboard-v3/includes/db.php:1)
  - Kết nối DB, `ensure_schema()`, upsert, parser factory, nhận diện file upload.
- [includes/Parsers/](/Users/etecman/Documents/dashboard-v3/includes/Parsers)
  - Parser đơn hàng và traffic.
- [api/](/Users/etecman/Documents/dashboard-v3/api)
  - Các endpoint JSON cho dashboard/admin/upload/update.
- [build.sh](/Users/etecman/Documents/dashboard-v3/build.sh:1)
  - Build gói zip phát hành.
- [manifest.json](/Users/etecman/Documents/dashboard-v3/manifest.json:1)
  - Manifest update public.
- [version.txt](/Users/etecman/Documents/dashboard-v3/version.txt:1)
  - Phiên bản app hiện tại.

## 3. Auth, user, admin

- Tất cả API dashboard thường gọi `require_auth()`.
- API nhạy cảm gọi `require_admin()`.
- Session user được quản lý trong [includes/helpers.php](/Users/etecman/Documents/dashboard-v3/includes/helpers.php:1).
- Bảng `users` hiện có các trường quan trọng:
  - `username`
  - `full_name`
  - `avatar_path`
  - `password_hash`
  - `must_change_password`
  - `role`
  - `is_active`
- User có thể:
  - tự đổi tên hiển thị
  - tự đổi avatar
  - tự đổi mật khẩu
- Admin có thể:
  - tạo/sửa/khoá/xoá user
  - gán `admin/staff`
  - bật `must_change_password`
  - quản lý API/system/update/lang trong khu admin

## 4. Rule mật khẩu hiện tại

- Password phải đạt tối thiểu mức `Trung bình`.
- Rule backend hiện hành:
  - ít nhất `8 ký tự`
  - có ít nhất `2 nhóm ký tự` trong các nhóm:
    - chữ thường
    - chữ hoa
    - số
    - ký tự đặc biệt
- Logic dùng chung nằm ở:
  - `evaluate_password_strength()`
  - `ensure_password_meets_policy()`
  - trong [includes/helpers.php](/Users/etecman/Documents/dashboard-v3/includes/helpers.php:1)
- UI meter có ở:
  - form admin tạo/sửa tài khoản
  - modal đổi mật khẩu user

## 5. Upload/import dữ liệu

### 5.1. Tổng quan

- Endpoint upload: [api/upload.php](/Users/etecman/Documents/dashboard-v3/api/upload.php:1)
- Upload dùng `files[]` hoặc `file`.
- Chỉ nhận `.xlsx` và `.xls`.
- Sau khi upload:
  - tạo record `upload_history`
  - parse file
  - upsert dữ liệu
  - lưu import errors nếu có

### 5.2. Đơn hàng

- Nhận diện sàn đơn hàng qua header bởi `detect_platform_from_file()`.
- Parser:
  - `ShopeeParser`
  - `LazadaParser`
  - `TiktokShopParser`

### 5.3. Traffic

- Nhận diện traffic giờ không còn phụ thuộc tên file.
- Hàm chính:
  - `detect_upload_profile_from_file()`
  - `detect_traffic_platform_from_file()`
  - `is_traffic_file()`
- Các dấu hiệu nhận diện đang bám đúng 3 mẫu thật trong repo:
  - `Shopee.xlsx`
  - `Lazada.xls`
  - `TiktokShop.xlsx`
- Các file mẫu local này hiện đang nằm ở root repo nhưng **chưa track git**.
- Build release đã loại `*.xlsx` và `*.xls`, nên không đóng gói nhầm file mẫu.

### 5.4. Rule đặc biệt rất quan trọng cho Shopee traffic

- Shopee traffic **chỉ lấy dữ liệu từ sheet `Tất cả`**.
- Không fallback sang `Máy tính` hoặc `Ứng dụng`.
- Nếu file Shopee không có sheet `Tất cả`, parser sẽ báo lỗi và dừng import.
- Logic này nằm ở [includes/Parsers/TrafficParser.php](/Users/etecman/Documents/dashboard-v3/includes/Parsers/TrafficParser.php:1).

### 5.5. Đặc điểm mẫu traffic từng sàn

- Shopee:
  - Có các sheet như `Tất cả`, `Máy tính`, `Ứng dụng`
  - Chỉ import `Tất cả`
- Lazada:
  - Sheet chính là `Các chỉ số quan trọng`
- TikTok Shop:
  - Sheet chính là `Sheet1`
  - Có marker như `Tổng quan dữ liệu`, `Dữ liệu theo ngày`

## 6. Schema và migration

- Không có hệ migration framework riêng.
- Mọi thay đổi schema được vá bằng `ensure_schema()` trong [includes/db.php](/Users/etecman/Documents/dashboard-v3/includes/db.php:31).
- `db()` luôn gọi `ensure_schema()`.
- Sau update hệ thống, `api/update.php` cũng gọi lại `ensure_schema()`.
- Nếu thêm cột/bảng mới, phải cập nhật ít nhất:
  - `ensure_schema()`
  - `setup.php` cho fresh install

## 7. Update system / release system

- Updater class: [includes/Updater.php](/Users/etecman/Documents/dashboard-v3/includes/Updater.php:1)
- Manifest cần các trường:
  - `version`
  - `download_url`
  - `changelog`
  - `min_php`
  - `released_at`
- Updater preserve các path sau khi update:
  - `config.php`
  - `config.local.php`
  - `uploads/`
  - `.installed`

### Build release

- Script build: [build.sh](/Users/etecman/Documents/dashboard-v3/build.sh:1)
- Script hiện loại khỏi zip:
  - `.git`, `.github`, `.idea`, `.vscode`, `.claude`
  - `others/`
  - `release/`
  - `uploads/*`
  - `config.php`, `config.local.php`
  - `.env*`
  - `.installed`
  - `*.zip`
  - `*.xlsx`, `*.xls`

## 8. Quy ước làm việc đã dùng trong repo này

- Nếu thay đổi có ảnh hưởng bản chạy:
  1. sửa code
  2. chạy kiểm tra
  3. bump `version.txt`
  4. cập nhật `manifest.json`
  5. build zip release
  6. commit
  7. tag
  8. push `main`
  9. push tag
  10. kiểm tra public URL trả `HTTP 200`
- Các release gần đây đã theo pattern `v1.2.x`.
- Tag/zip được dùng trực tiếp cho updater public.

## 9. Checklist verify hay dùng

- PHP lint:
  - `php -l <file>`
- JS syntax:
  - `node --check assets/js/app.js`
  - `node --check assets/js/upload.js`
  - `node --check assets/js/i18n.js`
- Composer:
  - `composer validate --no-check-publish`
  - `composer dump-autoload -o`
- Build release:
  - `./build.sh <version>`
- Verify URL public:
  - `curl -I https://raw.githubusercontent.com/namct2610/ecom-dashboard/main/manifest.json`
  - `curl -I https://raw.githubusercontent.com/namct2610/ecom-dashboard/vX.Y.Z/manifest.json`
  - `curl -I https://raw.githubusercontent.com/namct2610/ecom-dashboard/vX.Y.Z/release/dashboard-v3-X.Y.Z.zip`

## 10. Lưu ý dễ quên

- `composer.json` đang ghi `php >= 7.4`, nhưng manifest release đang dùng `min_php = 8.1`.
  - Khi sửa sâu hơn, nên lưu ý sự lệch này.
- 3 file Excel mẫu ở root:
  - `Shopee.xlsx`
  - `Lazada.xls`
  - `TiktokShop.xlsx`
  - hiện là file local để test/đối chiếu, chưa track git.
- Build zip đã exclude các file Excel này.
- Nếu sửa upload/import traffic, nên test lại bằng cả:
  - file mẫu gốc
  - file đổi tên ngẫu nhiên
  - để chắc backend nhận diện theo nội dung file chứ không theo filename.

## 11. Trạng thái hiện tại

- Phiên bản mới nhất tại thời điểm note này: `v1.2.14`
- Mục tiêu hotfix gần nhất:
  - tự nhận diện traffic theo nội dung workbook
  - Shopee traffic chỉ import sheet `Tất cả`

