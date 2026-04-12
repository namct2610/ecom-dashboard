#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Dashboard v3 — Build & Package Script
#  Tạo file ZIP sẵn sàng deploy lên shared hosting.
#
#  Cách dùng (chạy từ bất kỳ đâu):
#    ./others/build.sh              → zip với vendor/
#    ./others/build.sh --no-vendor  → zip không có vendor/
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_NAME="dashboard-v3"
VERSION=$(cat "$PROJECT_DIR/version.txt" | tr -d '[:space:]')
OUTPUT_NAME="${PROJECT_NAME}-${VERSION}.zip"
OUTPUT_PATH="${PROJECT_DIR}/../${OUTPUT_NAME}"
INCLUDE_VENDOR=true
QUIET=false

for arg in "$@"; do
  case $arg in
    --no-vendor) INCLUDE_VENDOR=false ;;
    --quiet|-q)  QUIET=true ;;
    --help|-h)
      echo "Dùng: ./others/build.sh [--no-vendor] [--quiet]"
      exit 0 ;;
  esac
done

[[ "$QUIET" == false ]] && echo "🔍 Kiểm tra trước khi đóng gói..."

if ! command -v zip &>/dev/null; then
  echo "❌ Lỗi: lệnh 'zip' không tìm thấy."
  exit 1
fi

if [ "$INCLUDE_VENDOR" = true ] && [ ! -d "$PROJECT_DIR/vendor" ]; then
  echo "⚠️  vendor/ chưa có. Chạy: composer install --no-dev --optimize-autoloader"
  INCLUDE_VENDOR=false
fi

[ -f "$OUTPUT_PATH" ] && rm -f "$OUTPUT_PATH"

[[ "$QUIET" == false ]] && echo "" && echo "📦 Đóng gói ${PROJECT_NAME} v${VERSION}..."

cd "$PROJECT_DIR"

mkdir -p uploads
[ ! -f "uploads/.htaccess" ] && printf "Order deny,allow\nDeny from all\n" > "uploads/.htaccess"

EXCLUDES=(
  "*.DS_Store"
  "*/__MACOSX/*"
  "*/.git/*"
  "*/.git"
  "*/.gitignore"
  "*/.github/*"
  "*/node_modules/*"
  "*/uploads/*"
  "*/.installed"
  "*/.env"
  "*/.env.*"
  "*/*.zip"
  "*/others/*"
  "*/phpunit*"
  "*/.phpunit*"
  "*/tests/*"
  "*/test/*"
  "*/.vscode/*"
  "*/.idea/*"
  "*/*.log"
  "*/.claude/*"
)

EXCLUDE_ARGS=()
for p in "${EXCLUDES[@]}"; do
  EXCLUDE_ARGS+=("--exclude=$p")
done

[ "$INCLUDE_VENDOR" = false ] && EXCLUDE_ARGS+=("--exclude=*/vendor/*")

zip -r "$OUTPUT_PATH" . "${EXCLUDE_ARGS[@]}" -q

SIZE=$(du -sh "$OUTPUT_PATH" 2>/dev/null | cut -f1)
FILE_COUNT=$(unzip -l "$OUTPUT_PATH" 2>/dev/null | tail -1 | awk '{print $2}')

if [[ "$QUIET" == false ]]; then
  echo ""
  echo "✅ Đóng gói thành công!"
  echo "   📁 File : $(basename "$OUTPUT_PATH")"
  echo "   📏 Size : ${SIZE}"
  echo "   📄 Files: ${FILE_COUNT}"
  echo ""
  echo "  Deploy: upload ZIP → giải nén trên host → truy cập setup.php"
fi
