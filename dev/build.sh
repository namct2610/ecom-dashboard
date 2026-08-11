#!/usr/bin/env bash

set -euo pipefail

# Lives in dev/; climb one level for the actual repo root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

VERSION="${1:-$(tr -d '\r\n' < version.txt)}"
PACKAGE_NAME="dashboard-v3-${VERSION}.zip"
RELEASE_DIR="$ROOT_DIR/release"
PACKAGE_PATH="$RELEASE_DIR/$PACKAGE_NAME"
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dashboard-v3-release.XXXXXX")"
STAGE_ROOT="$STAGE_DIR/dashboard-v3"

cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

if [[ ! -f "$ROOT_DIR/vendor/autoload.php" ]]; then
  echo "vendor/autoload.php not found. Run composer install before building." >&2
  exit 1
fi

mkdir -p "$RELEASE_DIR" "$STAGE_ROOT"

rsync -a \
  --exclude='.git/' \
  --exclude='.github/' \
  --exclude='.idea/' \
  --exclude='.vscode/' \
  --exclude='.claude/' \
  --exclude='others/' \
  --exclude='release/' \
  --exclude='uploads/*' \
  --exclude='config.php' \
  --exclude='config.local.php' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.installed' \
  --exclude='*.zip' \
  --exclude='*.xlsx' \
  --exclude='*.xls' \
  --exclude='*.sql' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  --exclude='__MACOSX/' \
  --exclude='dev/' \
  ./ "$STAGE_ROOT/"

mkdir -p "$STAGE_ROOT/uploads"
if [[ -f "$ROOT_DIR/uploads/.htaccess" ]]; then
  cp "$ROOT_DIR/uploads/.htaccess" "$STAGE_ROOT/uploads/.htaccess"
fi

# Bake the version into index.html and login.html so the browser cache-busts on
# every release. Both pages carry `?v=` asset links (theme.css, the favicon), so
# leaving login.html out pinned its assets at whatever `?v=` the source had.
# Replaces the literal `?v=20` query-string (in the static <link>/script src) and
# the `var V = 20;` initializer with the current VERSION.
for page in index.html login.html; do
  if [[ -f "$STAGE_ROOT/$page" ]]; then
    sed -E -i.bak \
      -e "s/\\?v=[0-9.]+/?v=${VERSION}/g" \
      -e "s/var V = [^;]+;/var V = '${VERSION}';/" \
      "$STAGE_ROOT/$page"
    rm -f "$STAGE_ROOT/$page.bak"
  fi
done

(
  cd "$STAGE_DIR"
  rm -f "$PACKAGE_PATH"
  zip -qr "$PACKAGE_PATH" "dashboard-v3"
)

echo "Built $PACKAGE_PATH"
