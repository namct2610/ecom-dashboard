#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Dashboard v3 — Build & Package Script
#  Tạo file ZIP sẵn sàng deploy lên shared hosting.
#
#  Cách dùng:
#    chmod +x build.sh
#    ./build.sh              → tạo dashboard-v3-YYYYMMDD-HHmm.zip
#    ./build.sh --no-vendor  → không bao gồm vendor/ (cần chạy composer trên host)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="dashboard-v3"
TIMESTAMP="$(date '+%Y%m%d-%H%M')"
OUTPUT_NAME="${PROJECT_NAME}-${TIMESTAMP}.zip"
OUTPUT_PATH="${SCRIPT_DIR}/../${OUTPUT_NAME}"
INCLUDE_VENDOR=true

# ── Parse args ────────────────────────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --no-vendor) INCLUDE_VENDOR=false ;;
    --help|-h)
      echo "Dùng: ./build.sh [--no-vendor]"
      echo "  --no-vendor   Bỏ qua thư mục vendor/ (host phải có Composer)"
      exit 0
      ;;
  esac
done

cd "$SCRIPT_DIR"

# ── Pre-checks ────────────────────────────────────────────────────────────────
echo "🔍 Kiểm tra trước khi đóng gói..."

if ! command -v zip &>/dev/null; then
  echo "❌ Lỗi: lệnh 'zip' không tìm thấy. Cài đặt: brew install zip (macOS) hoặc apt install zip (Linux)"
  exit 1
fi

if [ "$INCLUDE_VENDOR" = true ] && [ ! -d "vendor" ]; then
  echo "❌ Lỗi: thư mục vendor/ không tìm thấy."
  echo "   Chạy: composer install --no-dev --optimize-autoloader"
  exit 1
fi

if [ ! -f "config.php" ]; then
  echo "⚠️  Cảnh báo: config.php không tìm thấy — package sẽ không có file config."
  echo "   Người dùng sẽ cần chạy setup.php sau khi upload."
fi

# ── Clean up previous build ───────────────────────────────────────────────────
[ -f "$OUTPUT_PATH" ] && rm -f "$OUTPUT_PATH"

echo ""
echo "📦 Đang đóng gói ${PROJECT_NAME}..."
echo "   Output: ${OUTPUT_PATH}"
echo ""

# ── Build zip ────────────────────────────────────────────────────────────────
# Exclusion patterns
EXCLUDES=(
  "*.DS_Store"
  "*/__MACOSX/*"
  "*/.git/*"
  "*/.git"
  "*/.gitignore"
  "*/node_modules/*"
  "*/uploads/*"
  "*/.installed"
  "*/build.sh"
  "*/*.zip"
  "*/composer.lock"
  "*/.env"
  "*/.env.*"
  "*/phpunit*"
  "*/.phpunit*"
  "*/tests/*"
  "*/test/*"
  "*/.vscode/*"
  "*/.idea/*"
  "*/stitch/*"
  "*/tiktok-api/*"
  "*/*.log"
  "*/*.sh"
  "*/browser.py"
)

# Build exclude string for zip
EXCLUDE_ARGS=()
for pattern in "${EXCLUDES[@]}"; do
  EXCLUDE_ARGS+=("--exclude=$pattern")
done

# Always include uploads dir with .htaccess only (create placeholder)
mkdir -p uploads
[ ! -f "uploads/.htaccess" ] && printf "Order deny,allow\nDeny from all\n" > "uploads/.htaccess"

if [ "$INCLUDE_VENDOR" = true ]; then
  zip -r "$OUTPUT_PATH" . "${EXCLUDE_ARGS[@]}" -q
else
  EXCLUDE_ARGS+=("--exclude=*/vendor/*")
  zip -r "$OUTPUT_PATH" . "${EXCLUDE_ARGS[@]}" -q
fi

# ── Post-build info ───────────────────────────────────────────────────────────
SIZE=$(du -sh "$OUTPUT_PATH" 2>/dev/null | cut -f1)
FILE_COUNT=$(unzip -l "$OUTPUT_PATH" 2>/dev/null | tail -1 | awk '{print $2}')

echo "✅ Đóng gói thành công!"
echo ""
echo "   📁 File: $(basename "$OUTPUT_PATH")"
echo "   📏 Kích thước: ${SIZE}"
echo "   📄 Số file: ${FILE_COUNT}"
echo ""
echo "─────────────────────────────────────────────────────────────────────────"
echo "  Hướng dẫn deploy lên Shared Hosting:"
echo "─────────────────────────────────────────────────────────────────────────"
echo ""
echo "  1. Upload file ZIP lên public_html (hoặc thư mục con)"
echo "  2. Giải nén trên host (File Manager hoặc SSH: unzip ${OUTPUT_NAME})"
if [ "$INCLUDE_VENDOR" = false ]; then
  echo "  3. SSH vào host: composer install --no-dev --optimize-autoloader"
  echo "  4. Truy cập: https://yourdomain.com/setup.php"
else
  echo "  3. Truy cập: https://yourdomain.com/setup.php"
fi
echo ""
echo "  Wizard sẽ:"
echo "    • Kiểm tra điều kiện hệ thống (PHP, extensions, quyền thư mục)"
echo "    • Hướng dẫn cấu hình database"
echo "    • Tạo tài khoản admin"
echo "    • Khởi tạo tất cả bảng database"
echo ""
echo "  Sau khi cài đặt xong:"
echo "    ⚠️  Xóa hoặc đổi tên setup.php trên server để bảo mật"
echo ""
echo "─────────────────────────────────────────────────────────────────────────"
