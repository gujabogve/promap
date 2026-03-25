#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo "=== Step 1: Build native renderer ==="
cd native/promap-renderer
./build-win.sh
cd "$PROJECT_DIR"

echo ""
echo "=== Step 2: Build Electron app ==="
npx electron-vite build

echo ""
echo "=== Step 3: Package for Windows ==="
npx electron-builder --win --dir

echo ""
echo "=== Step 4: Create zip ==="
RELEASE_DIR="$PROJECT_DIR/release/win-unpacked"
ZIP_FILE="$PROJECT_DIR/release/ProMap-win-x64.zip"
rm -f "$ZIP_FILE"
cd "$RELEASE_DIR"
zip -r "$ZIP_FILE" .
cd "$PROJECT_DIR"

echo ""
echo "Done!"
echo "Zip: $(ls -lh "$ZIP_FILE" | awk '{print $5}') → $ZIP_FILE"
