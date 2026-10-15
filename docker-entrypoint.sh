#!/bin/sh
set -e

# AppSail tells us which port to listen on; other hosts use PORT.
export PORT="${X_ZOHO_CATALYST_LISTEN_PORT:-${PORT:-3000}}"
export HOSTNAME=0.0.0.0

if [ "$RUN_MIGRATIONS" = "true" ]; then
  node dist/migrate.cjs
fi

exec node server.js
