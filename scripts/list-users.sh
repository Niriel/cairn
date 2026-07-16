#!/usr/bin/env bash
# list-users.sh — dump the whole auth.users table to stdout.
#
# WHAT IT DOES
#   Prints every auth.users row, newest first, with the columns an operator
#   needs post-migration: id, username (public.profiles), recovery_email
#   (public.user_settings — the user's real e-mail, if they set one), created_at,
#   deleted_at. Both joins are LEFT, so an auth row with no profile/settings
#   still lists (NULLs). The GoTrue `email` column is deliberately NOT shown —
#   since the username migration it only holds the login identity
#   `<uid>@cairn.internal`, never a real address. recovery_email is private
#   (owner-only via RLS in the app); this script sees it because it runs as the
#   DB owner on the SSH-gated prod box — the same operator-legitimate access as
#   `cairn-admin inspect`. No filtering — pipe through grep/sort yourself.
#   Read-only; touches nothing.
#
# WHEN TO USE
#   On the production VPS, to eyeball who has signed up, map a username to the
#   person's recovery e-mail, or spot soft-deleted accounts (deleted_at set).
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod)

"${COMPOSE[@]}" exec -T postgres \
  psql -U cairn -d cairn -v ON_ERROR_STOP=1 \
  -c "SELECT u.id, p.username, s.recovery_email, u.created_at, u.deleted_at
        FROM auth.users AS u
        LEFT JOIN public.profiles AS p ON p.id = u.id
        LEFT JOIN public.user_settings AS s ON s.id = u.id
       ORDER BY u.created_at DESC;"
