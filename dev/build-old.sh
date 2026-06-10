#!/usr/bin/env bash

# Build a legacy (v1) release zip.
# After the v2→root restructure, v1 lives under /old/. Updates for the
# legacy channel touch ONLY /old/, leaving the new main app untouched.
#
# Contents:
#   old/index.php
#   old/assets/**
#   old/manifest.json
#   old/version.txt
#
# Output: release/dashboard-old-X.Y.Z.zip
# Version is read from old/version.txt unless overridden by arg #1.

set -euo pipefail

# Lives in dev/; climb one level for the actual repo root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f "old/version.txt" ]]; then
  echo "old/version.txt not found." >&2
  exit 1
fi

VERSION="${1:-$(tr -d '\r\n' < old/version.txt)}"
PACKAGE_NAME="dashboard-old-${VERSION}.zip"
RELEASE_DIR="$ROOT_DIR/release"
PACKAGE_PATH="$RELEASE_DIR/$PACKAGE_NAME"
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dashboard-old-release.XXXXXX")"
STAGE_ROOT="$STAGE_DIR/dashboard-old"

cleanup() { rm -rf "$STAGE_DIR"; }
trap cleanup EXIT

mkdir -p "$RELEASE_DIR" "$STAGE_ROOT/old"

rsync -a \
  --exclude='.DS_Store' \
  --exclude='__MACOSX/' \
  old/ "$STAGE_ROOT/old/"

# Stamp the bundled version (override the file even if it matches — keeps
# bundle reproducible when CLI VERSION arg differs from old/version.txt).
echo "$VERSION" > "$STAGE_ROOT/old/version.txt"

(
  cd "$STAGE_DIR"
  rm -f "$PACKAGE_PATH"
  zip -qr "$PACKAGE_PATH" "dashboard-old"
)

echo "Built $PACKAGE_PATH"
