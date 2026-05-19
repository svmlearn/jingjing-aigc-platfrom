#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$root"

required_files=(
  "deploy/domestic/README.md"
  "deploy/domestic/env/app.env.example"
  "deploy/domestic/env/worker.env.example"
  "deploy/domestic/nginx/jingjing-domestic.conf"
  "deploy/domestic/systemd/jingjing-app.service"
  "deploy/domestic/systemd/jingjing-worker-compose.service"
  "deploy/domestic/pm2/ecosystem.config.cjs"
)

for path in "${required_files[@]}"; do
  test -s "$path"
done

node --check deploy/domestic/pm2/ecosystem.config.cjs >/dev/null

forbidden_marker="DOMESTIC_PHASE1_E2E_""PASS"
if grep -R "$forbidden_marker" deploy/domestic >/dev/null; then
  echo "deployment templates must not contain phase1 pass marker" >&2
  exit 1
fi

echo "domestic deployment templates: ok"
