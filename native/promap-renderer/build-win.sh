#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="promap-cross"
OUT_DIR="$SCRIPT_DIR/win-out"

# Build Docker image if it doesn't exist
if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
	echo "Building cross-compilation Docker image (one-time)..."
	docker build -f Dockerfile.windows -t "$IMAGE_NAME" .
fi

# Clean output directory
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Cross-compile
echo "Cross-compiling for Windows..."
docker run --rm -v "$SCRIPT_DIR":/src "$IMAGE_NAME" \
	cargo build --release --target x86_64-pc-windows-gnu

# Copy binary and FFmpeg DLLs to output
echo "Copying binary and DLLs..."
cp target/x86_64-pc-windows-gnu/release/promap-renderer.exe "$OUT_DIR/"
docker run --rm -v "$OUT_DIR":/out "$IMAGE_NAME" \
	bash -c "cp /opt/ffmpeg-win/bin/*.dll /out/"

# Zip it up
ZIP_FILE="$SCRIPT_DIR/promap-renderer-win-x64.zip"
rm -f "$ZIP_FILE"
cd "$OUT_DIR"
zip -j "$ZIP_FILE" ./*
cd "$SCRIPT_DIR"

echo ""
echo "Done! Output in: win-out/"
ls -lh "$OUT_DIR"
echo ""
echo "Zip: $(ls -lh "$ZIP_FILE" | awk '{print $5}') → $ZIP_FILE"
