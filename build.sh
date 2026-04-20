#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
  --exclude='*.log' \
  --exclude='.DS_Store' \
  --exclude='__MACOSX/' \
  ./ "$STAGE_ROOT/"

mkdir -p "$STAGE_ROOT/uploads"
if [[ -f "$ROOT_DIR/uploads/.htaccess" ]]; then
  cp "$ROOT_DIR/uploads/.htaccess" "$STAGE_ROOT/uploads/.htaccess"
fi

(
  cd "$STAGE_DIR"
  rm -f "$PACKAGE_PATH"
  zip -qr "$PACKAGE_PATH" "dashboard-v3"
)

echo "Built $PACKAGE_PATH"
