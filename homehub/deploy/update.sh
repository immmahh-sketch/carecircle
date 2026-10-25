#!/usr/bin/env bash
# Pull the latest HomeHub code, run the tests, restart, and roll back if it doesn't come up healthy.
#   sudo bash homehub/deploy/update.sh        (optionally: BRANCH=main)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; REPO="$(cd "$HERE/.." && pwd)"
OWNER="$(stat -c %U "$REPO")"
git_() { sudo -u "$OWNER" git -C "$REPO" "$@"; }
BRANCH="${BRANCH:-$(git_ rev-parse --abbrev-ref HEAD)}"
OLD="$(git_ rev-parse HEAD)"
git_ fetch origin "$BRANCH"
git_ merge --ff-only "origin/$BRANCH"
NEW="$(git_ rev-parse HEAD)"
[ "$OLD" = "$NEW" ] && { echo "Already up to date ($NEW)."; exit 0; }

rollback() { echo "!! update failed, rolling back to $OLD"; git_ reset --hard "$OLD"; systemctl restart homehub; exit 1; }
(cd "$HERE" && node --test "test/*.test.js" >/dev/null 2>&1) || { echo "tests failed"; rollback; }
systemctl restart homehub
for i in 1 2 3 4 5 6 7 8 9 10; do sleep 2; curl -fsS http://127.0.0.1:8787/healthz >/dev/null && { echo "Updated $OLD -> $NEW"; exit 0; }; done
rollback
