#!/usr/bin/env bash
# HomeHub installer for Raspberry Pi OS (Lite is fine). Run from the cloned repo:
#   sudo bash homehub/deploy/install.sh
# Safe to re-run: it upgrades Node/service files and keeps your data.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run with sudo"; exit 1; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"     # .../homehub
REPO="$(cd "$HERE/.." && pwd)"
APP_USER=homehub
DATA=/var/lib/homehub
NODE_MAJOR=22

echo "==> Node.js ${NODE_MAJOR}"
need_node=1
if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then need_node=0; fi
if [ "$need_node" = 1 ]; then
  case "$(uname -m)" in
    aarch64) arch=arm64 ;; armv7l) arch=armv7l ;; x86_64) arch=x64 ;;
    *) echo "Unsupported CPU $(uname -m) (Pi 1/Zero can't run current Node)"; exit 1 ;;
  esac
  base="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  file="$(grep -o "node-v[0-9.]*-linux-${arch}\.tar\.xz" "$tmp/SHASUMS256.txt" | head -1)"
  curl -fsSL "$base/$file" -o "$tmp/$file"
  (cd "$tmp" && grep " $file\$" SHASUMS256.txt | sha256sum -c -)   # verify download
  mkdir -p /opt/node && tar -xJf "$tmp/$file" -C /opt/node --strip-components=1
  ln -sf /opt/node/bin/node /usr/local/bin/node
fi
node --version

echo "==> user and data directory"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "$DATA"
# the service only reads code; the code directory is owned by whoever cloned it (needed for git pull)
echo "==> systemd service"
sed -e "s|@APP_DIR@|$HERE|g" -e "s|@NODE@|$(command -v node)|g" "$HERE/deploy/homehub.service" > /etc/systemd/system/homehub.service
systemctl daemon-reload
systemctl enable --now homehub
sleep 3
if curl -fsS http://127.0.0.1:8787/healthz >/dev/null; then echo "HomeHub is up."; else echo "Not responding — check: journalctl -u homehub -e"; exit 1; fi

echo "==> keys (needed to sign in)"
sleep 1
journalctl -u homehub --no-pager -n 30 | grep -E "Admin key|Hook key" | tail -2 || true
IP="$(hostname -I | awk '{print $1}')"
echo
echo "Open http://${IP}:8787/ on your phone (same Wi-Fi). Next: sudo bash $HERE/deploy/tunnel.sh home.letsquiz.uk"
