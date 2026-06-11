#!/usr/bin/env bash
# Reset the dev database and re-apply migrations.
#
# DEV-ONLY. The --full path runs `docker compose down -v`, which destroys the
# postgres_data volume. On the production box that wipes all user data, so this
# script refuses to run when .env resolves to a production env file (see the
# prod guard below) and pins itself to the dev override overlay.
#
# Default — reapply one migration:
#   ./scripts/reset-db.sh 0004_domain_schema.sql
#   Removes the file from the migration ledger so migrate.sh treats it as
#   un-applied, then runs migrate.sh. Everything else is left untouched.
#
#   Caveat: only works cleanly if the migration is fully idempotent (all
#   CREATE statements use OR REPLACE / IF NOT EXISTS). Migrations with bare
#   CREATE FUNCTION will error on re-run because the object already exists —
#   use --full in that case, or apply the changed object manually via psql.
#
# --full — nuke and rebuild from scratch:
#   ./scripts/reset-db.sh --full
#   Tears down the Docker stack (including the postgres_data volume), brings
#   it back up, and waits for Postgres to be ready before running migrate.sh.
#   All data is lost. Useful when you have edited an early migration and want
#   a completely clean slate.
set -euo pipefail

cd "$(dirname "$0")/.."

# Prod guard: reset-db is dev-only and the --full path wipes postgres_data.
# The documented prod setup symlinks .env -> .env.prod (see DEPLOY_RUNBOOK /
# docs/deployment.md), so refuse to run when .env resolves to a *.prod file.
# CAIRN_ALLOW_PROD_RESET=1 overrides — you almost certainly should not.
env_target=$(readlink -f .env 2>/dev/null || true)
if [ -n "$env_target" ] && [[ "$env_target" == *.prod ]]; then
  if [ "${CAIRN_ALLOW_PROD_RESET:-}" != "1" ]; then
    echo "reset-db: refusing to run — .env points at a production env file" >&2
    echo "          ($env_target). This script wipes data and is dev-only." >&2
    echo "          Set CAIRN_ALLOW_PROD_RESET=1 to override." >&2
    exit 1
  fi
  echo "reset-db: WARNING — running against a production env file (override set)." >&2
fi

# Pin to the dev overlay explicitly. Bare `docker compose` auto-loads
# docker-compose.override.yml, but being explicit stops a stray prod overlay
# (or a future COMPOSE_FILE) from ever being torn down / brought up by reset-db.
DC=(docker compose -f docker-compose.yml -f docker-compose.override.yml)

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set (copy .env.example to .env)}"

PSQL=(psql -h localhost -p 5432 -U cairn -d cairn -v ON_ERROR_STOP=1)
export PGPASSWORD="$POSTGRES_PASSWORD"

usage() {
  echo "usage: $0 --full" >&2
  echo "       $0 <migration-filename>   e.g. 0004_domain_schema.sql" >&2
  exit 1
}

if [ $# -eq 0 ]; then
  usage
fi

if [ "$1" = "--full" ]; then
  echo "reset-db: tearing down stack and wiping postgres_data volume…"
  "${DC[@]}" down -v
  "${DC[@]}" up -d

  echo "reset-db: waiting for Postgres to be ready…"
  deadline=$((SECONDS + 60))
  while ((SECONDS < deadline)); do
    if PGPASSWORD="$POSTGRES_PASSWORD" \
      pg_isready -h localhost -p 5432 -U cairn -d cairn -q 2>/dev/null; then
      break
    fi
    sleep 1
  done
  if ! PGPASSWORD="$POSTGRES_PASSWORD" \
    pg_isready -h localhost -p 5432 -U cairn -d cairn -q 2>/dev/null; then
    echo "reset-db: timed out waiting for Postgres" >&2
    exit 1
  fi

  echo "reset-db: applying all migrations…"
  ./scripts/migrate.sh
  echo "reset-db: done — run ./scripts/seed.sh to restore dev data"
else
  filename="$1"
  # Strip any leading path so you can pass db/migrations/0004_… or just the filename.
  filename=$(basename "$filename")

  if [ ! -f "db/migrations/$filename" ]; then
    echo "reset-db: db/migrations/$filename not found" >&2
    exit 1
  fi

  echo "reset-db: removing $filename from migration ledger…"
  "${PSQL[@]}" -c \
    "DELETE FROM public._migrations WHERE filename = '$filename'"

  echo "reset-db: re-applying $filename…"
  ./scripts/migrate.sh
  echo "reset-db: done"
fi
