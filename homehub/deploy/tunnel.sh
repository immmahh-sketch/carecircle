#!/usr/bin/env bash
# Publish HomeHub at https://<hostname> through a Cloudflare Tunnel (no port forwarding).
# Needs the domain's DNS on Cloudflare. Usage: sudo bash tunnel.sh home.letsquiz.uk
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run with sudo"; exit 1; }
HOST="${1:?usage: tunnel.sh home.yourdomain}"

if ! command -v cloudflared >/dev/null; then
  case "$(uname -m)" in aarch64) a=arm64 ;; armv7l) a=arm ;; x86_64) a=amd64 ;; *) echo "unsupported CPU"; exit 1 ;; esac
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${a}" -o /usr/local/bin/cloudflared
  chmod +x /usr/local/bin/cloudflared
fi
cloudflared --version

echo
echo "A login URL is about to appear. Open it in any browser, pick letsquiz.uk, and authorise."
cloudflared tunnel login
NAME=homehub
cloudflared tunnel list | grep -qw "$NAME" || cloudflared tunnel create "$NAME"
cloudflared tunnel route dns -f "$NAME" "$HOST"

ID="$(cloudflared tunnel list -o json | python3 -c 'import sys,json; print(next(t["id"] for t in json.load(sys.stdin) if t["name"]=="homehub"))')"
install -d /etc/cloudflared
cp "$HOME/.cloudflared/${ID}.json" /etc/cloudflared/
cat > /etc/cloudflared/config.yml <<CFG
tunnel: ${ID}
credentials-file: /etc/cloudflared/${ID}.json
ingress:
  - hostname: ${HOST}
    service: http://127.0.0.1:8787
  - service: http_status:404
CFG
cloudflared service install 2>/dev/null || true
systemctl enable --now cloudflared
systemctl restart cloudflared
echo
echo "Done. Try: https://${HOST}/healthz"
echo "IMPORTANT: now add a Cloudflare Access policy (Zero Trust > Access > Applications) so only you can open ${HOST} — see deploy/README.md."
