#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  release.sh — Build ZIP, tạo GitHub Release và upload tự động
#
#  Cách dùng:
#    export GITHUB_TOKEN=github_pat_xxxxx
#    ./release.sh
#
#  Hoặc truyền token trực tiếp:
#    GITHUB_TOKEN=github_pat_xxxxx ./release.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="namct2610/dashboard-v3"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Kiểm tra token ────────────────────────────────────────────────────────────
if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "❌ Thiếu GITHUB_TOKEN."
  echo "   Dùng: export GITHUB_TOKEN=github_pat_xxxxx && ./release.sh"
  exit 1
fi

# ── Đọc version ───────────────────────────────────────────────────────────────
VERSION=$(cat "$SCRIPT_DIR/version.txt" | tr -d '[:space:]')
TAG="v${VERSION}"
ZIP_NAME="dashboard-v3-${VERSION}.zip"
ZIP_PATH="$SCRIPT_DIR/../${ZIP_NAME}"

echo "🚀 Releasing ${TAG}..."
echo ""

# ── Build ZIP ─────────────────────────────────────────────────────────────────
echo "📦 Building ZIP..."
cd "$SCRIPT_DIR"

if [ ! -d "vendor" ]; then
  echo "   vendor/ chưa có — chạy composer install..."
  composer install --no-dev --optimize-autoloader --quiet
fi

chmod +x build.sh
./build.sh --quiet 2>/dev/null || ./build.sh

# Tìm file zip vừa tạo
BUILT_ZIP=$(ls "$SCRIPT_DIR/../dashboard-v3-"*.zip 2>/dev/null | sort -r | head -1)
if [[ -z "$BUILT_ZIP" ]]; then
  echo "❌ Không tìm thấy file ZIP sau khi build."
  exit 1
fi

# Đổi tên thành versioned name
cp "$BUILT_ZIP" "$ZIP_PATH"
echo "   ZIP: $(basename "$ZIP_PATH") ($(du -sh "$ZIP_PATH" | cut -f1))"
echo ""

# ── Đọc changelog từ manifest.json ───────────────────────────────────────────
CHANGELOG=$(php -r "
  \$m = json_decode(file_get_contents('manifest.json'), true);
  echo \$m['changelog'] ?? 'Release ${TAG}';
" 2>/dev/null || echo "Release ${TAG}")

# ── Tạo git tag ───────────────────────────────────────────────────────────────
echo "🏷  Tạo tag ${TAG}..."
git tag -f "$TAG"
git push origin "$TAG" --force \
  -c "credential.helper=" \
  --push-option= 2>/dev/null || \
git push "https://${GITHUB_TOKEN}@github.com/${REPO}.git" "$TAG" --force 2>&1 | grep -v "^remote:" || true

# ── Xóa release cũ nếu có ────────────────────────────────────────────────────
OLD_ID=$(curl -sf \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/releases/tags/${TAG}" 2>/dev/null | \
  php -r "echo (json_decode(file_get_contents('php://stdin'),true)['id'] ?? '');" 2>/dev/null || true)

if [[ -n "$OLD_ID" ]]; then
  echo "   Xóa release cũ #${OLD_ID}..."
  curl -sf -X DELETE \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO}/releases/${OLD_ID}" > /dev/null
fi

# ── Tạo GitHub Release ────────────────────────────────────────────────────────
echo "📋 Tạo GitHub Release ${TAG}..."
PAYLOAD=$(php -r "echo json_encode([
  'tag_name'   => '${TAG}',
  'name'       => 'Dashboard v3 — ${TAG}',
  'body'       => \$argv[1],
  'draft'      => false,
  'prerelease' => false,
]);" -- "$CHANGELOG")

RELEASE_RESP=$(curl -sf \
  -X POST \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "https://api.github.com/repos/${REPO}/releases")

RELEASE_ID=$(echo "$RELEASE_RESP" | php -r "echo json_decode(file_get_contents('php://stdin'),true)['id'] ?? '';" 2>/dev/null)
UPLOAD_URL=$(echo "$RELEASE_RESP" | php -r "echo json_decode(file_get_contents('php://stdin'),true)['upload_url'] ?? '';" 2>/dev/null | sed 's/{?name,label}//')

if [[ -z "$RELEASE_ID" ]]; then
  echo "❌ Tạo release thất bại:"
  echo "$RELEASE_RESP"
  exit 1
fi

echo "   Release ID: ${RELEASE_ID}"

# ── Upload ZIP ────────────────────────────────────────────────────────────────
echo "⬆️  Upload ${ZIP_NAME}..."
UPLOAD_RESP=$(curl -sf \
  -X POST \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/zip" \
  --data-binary "@${ZIP_PATH}" \
  "${UPLOAD_URL}?name=${ZIP_NAME}")

ASSET_URL=$(echo "$UPLOAD_RESP" | php -r "echo json_decode(file_get_contents('php://stdin'),true)['browser_download_url'] ?? '';" 2>/dev/null)

if [[ -z "$ASSET_URL" ]]; then
  echo "❌ Upload ZIP thất bại:"
  echo "$UPLOAD_RESP"
  exit 1
fi

# ── Dọn dẹp ──────────────────────────────────────────────────────────────────
rm -f "$ZIP_PATH"
rm -f "$BUILT_ZIP"

echo ""
echo "✅ Release thành công!"
echo ""
echo "   📦 ZIP   : ${ASSET_URL}"
echo "   🔗 Release: https://github.com/${REPO}/releases/tag/${TAG}"
echo ""
echo "   Manifest download_url đã trỏ đúng:"
echo "   $(php -r "echo json_decode(file_get_contents('manifest.json'),true)['download_url'];")"
