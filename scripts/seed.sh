#!/usr/bin/env bash
# Load dev-only seed data into the running Postgres.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set}"

export PGPASSWORD="$POSTGRES_PASSWORD"
psql -h localhost -p 5432 -U cairn -d cairn -v ON_ERROR_STOP=1 -f db/seed/dev_seed.sql
