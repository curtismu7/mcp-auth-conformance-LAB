#!/bin/sh
# One command on the host: install if needed, build the UI if needed, preflight, start.
#   ./scripts/run.sh          (then open http://127.0.0.1:4901/)
# External probing stays off. To probe a real URL you typed, see docs/live-checks.md.
set -e
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm ci
[ -f web/dist/index.html ] || npm run build
npm run doctor
exec npm start
