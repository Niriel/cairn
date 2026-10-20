#!/usr/bin/env bash
# Load dev-only seed data into the running stack.
#
# Two phases:
#   1. POST /signup to GoTrue for each seed user — GoTrue owns the
#      auth.users schema and its trigger (tg_profile_on_signup)
#      creates the matching public.profiles + user_settings rows
#      synchronously.
#   2. Run db/seed/dev_seed.sql to set display_name on those rows
#      (the trigger seeds them with the provisional username; the SQL overwrites).
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set}"

GOTRUE_URL="http://localhost:9999"
DEV_PASSWORD="cairn-dev"

wait_for_gotrue() {
  local deadline=$((SECONDS + 30))
  while ((SECONDS < deadline)); do
    if curl -sf "${GOTRUE_URL}/health" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "seed: GoTrue did not become healthy at ${GOTRUE_URL}/health within 30s" >&2
  exit 1
}

signup_one() {
  local email="$1"
  local body
  body=$(printf '{"email":"%s","password":"%s"}' "$email" "$DEV_PASSWORD")
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "${GOTRUE_URL}/signup" \
    -H 'Content-Type: application/json' \
    -d "$body")
  case "$code" in
    200 | 201)
      echo "seed: created ${email}"
      ;;
    422)
      echo "seed: exists  ${email}"
      ;;
    *)
      echo "seed: signup for ${email} failed with HTTP ${code}" >&2
      exit 1
      ;;
  esac
}

# Give a freshly-signed-up seed user a known, fixed username and the
# stable GoTrue identity (<uid>@cairn.internal), so it resolves and
# password-grants under the username sign-in flow. Keyed on the original
# signup e-mail, which still exists when this runs (the e-mail rewrite is
# the last write). Idempotent: a re-run finds the e-mail already rewritten
# and the UPDATEs are no-ops.
adopt_one() {
  local email="$1"
  local username="$2"
  psql -h localhost -p 5432 -U cairn -d cairn -v ON_ERROR_STOP=1 \
    -v email="$email" -v username="$username" <<'SQL'
UPDATE public.profiles p
SET username = :'username'
FROM auth.users u
WHERE p.id = u.id AND u.email = :'email';

UPDATE auth.users
SET email = id || '@cairn.internal'
WHERE email = :'email';
SQL
}

wait_for_gotrue

for email in alice@example.test bob@example.test carol@example.test; do
  signup_one "$email"
done

export PGPASSWORD="$POSTGRES_PASSWORD"
psql -h localhost -p 5432 -U cairn -d cairn -v ON_ERROR_STOP=1 -f db/seed/dev_seed.sql

adopt_one alice@example.test alice
adopt_one bob@example.test bob
adopt_one carol@example.test carol
