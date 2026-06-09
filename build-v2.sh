#!/usr/bin/env bash

# Build a v2-only release zip.
# The bundle contains ONLY files owned by the v2 UI channel, so applying it
# never touches v1 code:
#   v2/                  — entire UI (HTML, assets, version.txt)
#   api/v2-data.php      — data endpoint feeding v2
#   api/v2-update.php    — self-update endpoint for v2
#
# Output: release/dashboard-v2-X.Y.Z.zip
# Version is read from v2/version.txt unless overridden by arg #1.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ ! -f "v2/version.txt" ]]; then
  echo "v2/version.txt not found." >&2
  exit 1
fi

VERSION="${1:-$(tr -d '\r\n' < v2/version.txt)}"
PACKAGE_NAME="dashboard-v2-${VERSION}.zip"
RELEASE_DIR="$ROOT_DIR/release"
PACKAGE_PATH="$RELEASE_DIR/$PACKAGE_NAME"
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dashboard-v2-release.XXXXXX")"
STAGE_ROOT="$STAGE_DIR/dashboard-v2"

cleanup() { rm -rf "$STAGE_DIR"; }
trap cleanup EXIT

mkdir -p "$RELEASE_DIR" "$STAGE_ROOT/v2/assets" "$STAGE_ROOT/api"

# v2 UI bundle (HTML + assets + version.txt). Exclude editor noise.
rsync -a \
  --exclude='.DS_Store' \
  --exclude='__MACOSX/' \
  v2/ "$STAGE_ROOT/v2/"

# v2 backend (data + self-updater)
cp api/v2-data.php   "$STAGE_ROOT/api/v2-data.php"
cp api/v2-update.php "$STAGE_ROOT/api/v2-update.php"

# Stamp the bundle with the version (idempotent — overwrite even if same)
echo "$VERSION" > "$STAGE_ROOT/v2/version.txt"

(
  cd "$STAGE_DIR"
  rm -f "$PACKAGE_PATH"
  zip -qr "$PACKAGE_PATH" "dashboard-v2"
)

echo "Built $PACKAGE_PATH"
