#!/usr/bin/env bash
# TempDrop Linux Native Messaging Host Installer
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NATIVE_HOST="$PROJECT_ROOT/native-host/native_host.py"
MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
EXTENSION_ID="${1:-*}"

chmod +x "$NATIVE_HOST"
mkdir -p "$MANIFEST_DIR"

cat > "$MANIFEST_DIR/com.tempdrop.host.json" <<EOF
{
  "name": "com.tempdrop.host",
  "description": "TempDrop Native Host - Moves expired downloads to Trash",
  "path": "$NATIVE_HOST",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

# Also register for Chromium if present
CHROMIUM_DIR="$HOME/.config/chromium/NativeMessagingHosts"
if [ -d "$HOME/.config/chromium" ]; then
  mkdir -p "$CHROMIUM_DIR"
  cp "$MANIFEST_DIR/com.tempdrop.host.json" "$CHROMIUM_DIR/com.tempdrop.host.json"
fi

echo "[✓] TempDrop Native Messaging Host registered at: $MANIFEST_DIR/com.tempdrop.host.json"
