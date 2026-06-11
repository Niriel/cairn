#!/usr/bin/env bash
# list-users.sh — dump the whole auth.users table to stdout.
#
# WHAT IT DOES
#   Selects the readable columns (id, email, email_confirmed_at, created_at,
#   deleted_at) from auth.users inside the running postgres container and
#   prints every row, newest first. No filtering — pipe through grep/sort
#   yourself. Read-only; touches nothing.
#
# WHEN TO USE
#   On the production VPS, to eyeball who has signed up (e.g. spotting the
#   pre-AUTOCONFIRM-fix stragglers with a NULL email_confirmed_at).
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod)

"${COMPOSE[@]}" exec -T postgres \
  psql -U cairn -d cairn -v ON_ERROR_STOP=1 \
  -c "SELECT id, email, email_confirmed_at, created_at, deleted_at FROM auth.users ORDER BY created_at DESC;"
