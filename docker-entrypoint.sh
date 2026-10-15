#!/bin/sh
set -e

# AppSail tells us which port to listen on; other hosts use PORT.
export PORT="${X_ZOHO_CATALYST_LISTEN_PORT:-${PORT:-3000}}"
export HOSTNAME=0.0.0.0

# A failed migration must not stop the server: hosts like AppSail only report "execution failed", while a
# running server shows what is missing at /api/v1/health.
if [ "$RUN_MIGRATIONS" = "true" ]; then
  node dist/migrate.cjs || echo "[migrate] Migrations failed; starting the server anyway. Check /api/v1/health." >&2
fi

exec node server.js
