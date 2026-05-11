#!/usr/bin/env bash
# Apply any pending SQL migrations in db/migrations/ to the dev Postgres.
# Idempotent — already-applied files are skipped via the _migrations ledger.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set (copy .env.example to .env)}"
: "${AUTHENTICATOR_PASSWORD:?AUTHENTICATOR_PASSWORD not set}"
: "${GOTRUE_PASSWORD:?GOTRUE_PASSWORD not set}"

export PGPASSWORD="$POSTGRES_PASSWORD"
PSQL=(psql -h localhost -p 5432 -U cairn -d cairn -v ON_ERROR_STOP=1)

shopt -s nullglob
for f in db/migrations/*.sql; do
  name=$(basename "$f")
  applied=$("${PSQL[@]}" -tAc \
    "SELECT 1 FROM public._migrations WHERE filename='$name' LIMIT 1" \
    2>/dev/null || true)
  if [ "$applied" = "1" ]; then
    continue
  fi
  # Filename-gated `auth.users` poll: migrations numbered 0004+ depend
  # on auth.users existing (created by GoTrue's own startup migration).
  # 0001–0003 must not wait for it — they create the `gotrue` role
  # GoTrue itself needs to log in with. `10#$prefix` forces base-10
  # parsing so a leading zero (`0010_…`) isn't read as octal.
  prefix="${name%%_*}"
  if [ "$((10#$prefix))" -ge 4 ]; then
    start=$SECONDS
    timeout="${MIGRATE_AUTH_USERS_TIMEOUT:-60}"
    while ! "${PSQL[@]}" -tAc \
      "SELECT to_regclass('auth.users') IS NOT NULL" \
      2>/dev/null | grep -q '^t$'; do
      if [ $((SECONDS - start)) -ge "$timeout" ]; then
        echo "timed out after ${timeout}s waiting for auth.users." >&2
        echo "hint: check 'docker compose logs gotrue'." >&2
        exit 1
      fi
      sleep 1
    done
  fi
  echo "applying $name"
  "${PSQL[@]}" \
    -c "SET cairn.authenticator_password = '$AUTHENTICATOR_PASSWORD'" \
    -c "SET cairn.gotrue_password = '$GOTRUE_PASSWORD'" \
    -f "$f"
  "${PSQL[@]}" -c \
    "INSERT INTO public._migrations(filename) VALUES ('$name') ON CONFLICT DO NOTHING"
done
# PostgREST caches the schema at startup; NOTIFY pgrst makes it pick
# up the new schema without a container bounce. v10+ listens on the
# pgrst channel and reloads on receipt.
"${PSQL[@]}" -c "NOTIFY pgrst, 'reload schema'" >/dev/null
echo "migrations up to date"
