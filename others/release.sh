#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  release.sh — Build ZIP, tạo GitHub Release và upload tự động
#
#  Cách dùng:
#    export GITHUB_TOKEN=github_pat_xxxxx
#    ./others/release.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO="namct2610/dashboard-v3"

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "❌ Thiếu GITHUB_TOKEN."
  echo "   Dùng: export GITHUB_TOKEN=github_pat_xxxxx && ./others/release.sh"
  exit 1
fi

VERSION=$(cat "$PROJECT_DIR/version.txt" | tr -d '[:space:]')
TAG="v${VERSION}"
ZIP_NAME="dashboard-v3-${VERSION}.zip"
ZIP_PATH="$PROJECT_DIR/../${ZIP_NAME}"

echo "🚀 Releasing ${TAG}..."
echo ""

# ── Build ─────────────────────────────────────────────────────────────────────
echo "📦 Building ZIP..."
cd "$PROJECT_DIR"

if [ ! -d "vendor" ]; then
  echo "   Chạy composer install..."
  composer install --no-dev --optimize-autoloader --quiet
fi

bash "$SCRIPT_DIR/build.sh" --quiet

BUILT_ZIP=$(ls "$PROJECT_DIR/../dashboard-v3-"*.zip 2>/dev/null | sort -r | head -1)
if [[ -z "$BUILT_ZIP" ]]; then
  echo "❌ Không tìm thấy file ZIP sau khi build."; exit 1
fi

cp "$BUILT_ZIP" "$ZIP_PATH"
echo "   ZIP: $(basename "$ZIP_PATH") ($(du -sh "$ZIP_PATH" | cut -f1))"
echo ""

# ── Changelog ─────────────────────────────────────────────────────────────────
CHANGELOG=$(php -r "echo json_decode(file_get_contents('$PROJECT_DIR/manifest.json'),true)['changelog'] ?? 'Release $TAG';" 2>/dev/null || echo "Release $TAG")

# ── Git tag ───────────────────────────────────────────────────────────────────
echo "🏷  Tag ${TAG}..."
git -C "$PROJECT_DIR" tag -f "$TAG"
git -C "$PROJECT_DIR" push "https://${GITHUB_TOKEN}@github.com/${REPO}.git" "$TAG" --force 2>&1 | grep -v "^remote:" || true

# ── Xóa release cũ nếu có ────────────────────────────────────────────────────
OLD_ID=$(curl -sf \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/releases/tags/${TAG}" 2>/dev/null | \
  php -r "echo json_decode(file_get_contents('php://stdin'),true)['id'] ?? '';" 2>/dev/null || true)

if [[ -n "$OLD_ID" ]]; then
  echo "   Xóa release cũ #${OLD_ID}..."
  curl -sf -X DELETE \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO}/releases/${OLD_ID}" > /dev/null
fi

# ── Tạo Release ───────────────────────────────────────────────────────────────
echo "📋 Tạo GitHub Release ${TAG}..."
PAYLOAD=$(php -r "echo json_encode([
  'tag_name'   => '$TAG',
  'name'       => 'Dashboard v3 — $TAG',
  'body'       => \$argv[1],
  'draft'      => false,
  'prerelease' => false,
]);" -- "$CHANGELOG")

RELEASE_RESP=$(curl -sf -X POST \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "https://api.github.com/repos/${REPO}/releases")

RELEASE_ID=$(echo "$RELEASE_RESP" | php -r "echo json_decode(file_get_contents('php://stdin'),true)['id'] ?? '';" 2>/dev/null)
UPLOAD_URL=$(echo "$RELEASE_RESP" | php -r "echo json_decode(file_get_contents('php://stdin'),true)['upload_url'] ?? '';" 2>/dev/null | sed 's/{?name,label}//')

if [[ -z "$RELEASE_ID" ]]; then
  echo "❌ Tạo release thất bại:"; echo "$RELEASE_RESP"; exit 1
fi

# ── Upload ZIP ────────────────────────────────────────────────────────────────
echo "⬆️  Upload ${ZIP_NAME}..."
UPLOAD_RESP=$(curl -sf -X POST \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/zip" \
  --data-binary "@${ZIP_PATH}" \
  "${UPLOAD_URL}?name=${ZIP_NAME}")

ASSET_URL=$(echo "$UPLOAD_RESP" | php -r "echo json_decode(file_get_contents('php://stdin'),true)['browser_download_url'] ?? '';" 2>/dev/null)

if [[ -z "$ASSET_URL" ]]; then
  echo "❌ Upload ZIP thất bại:"; echo "$UPLOAD_RESP"; exit 1
fi

# ── Cleanup ───────────────────────────────────────────────────────────────────
rm -f "$ZIP_PATH"
[ "$BUILT_ZIP" != "$ZIP_PATH" ] && rm -f "$BUILT_ZIP"

echo ""
echo "✅ Release ${TAG} thành công!"
echo "   📦 ZIP    : ${ASSET_URL}"
echo "   🔗 Release: https://github.com/${REPO}/releases/tag/${TAG}"
