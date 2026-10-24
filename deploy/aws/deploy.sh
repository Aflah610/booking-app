#!/bin/bash
# Runs every few minutes on the server (systemd timer). Deploys main once GitHub's tests have passed for it.
set -euo pipefail
cd /opt/mindlap/src
git fetch -q origin main
NEW=$(git rev-parse origin/main)
CUR=$(cat /opt/mindlap/deployed 2>/dev/null || echo none)
[ "$NEW" = "$CUR" ] && [ "${1:-}" != "--force" ] && exit 0
if [ "${1:-}" != "--force" ]; then
  RESULT=$(curl -fsS "https://api.github.com/repos/Aflah610/booking-app/commits/$NEW/check-runs?check_name=check" \
    | python3 -c 'import json,sys; r=json.load(sys.stdin)["check_runs"]; print(r[0]["conclusion"] if r else "missing")')
  if [ "$RESULT" != "success" ]; then echo "$(date -Is) $NEW tests: $RESULT, not deploying"; exit 0; fi
fi
git checkout -q --force "$NEW"
cd deploy/aws
docker compose -p mindlap build app
docker compose -p mindlap up -d
for i in $(seq 1 30); do
  if docker compose -p mindlap exec -T app wget -qO- http://127.0.0.1:3000/api/v1/health 2>/dev/null | grep -q '"ok"'; then
    echo "$NEW" > /opt/mindlap/deployed; echo "$(date -Is) deployed $NEW"; docker image prune -f >/dev/null; exit 0
  fi
  sleep 5
done
echo "$(date -Is) $NEW started but health check failed"; exit 1
