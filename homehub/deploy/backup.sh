#!/usr/bin/env bash
# Copy the config (rules, scenes, device credentials) somewhere safe. Contains secrets: keep the copy private.
#   sudo bash backup.sh /path/to/usb-or-folder
set -euo pipefail
DEST="${1:?usage: backup.sh <folder>}"; mkdir -p "$DEST"
cp /var/lib/homehub/homehub.json "$DEST/homehub-$(date +%F).json"; chmod 600 "$DEST"/homehub-*.json
echo "Saved to $DEST"
