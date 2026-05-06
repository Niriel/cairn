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
  echo "applying $name"
  "${PSQL[@]}" \
    -c "SET cairn.authenticator_password = '$AUTHENTICATOR_PASSWORD'" \
    -c "SET cairn.gotrue_password = '$GOTRUE_PASSWORD'" \
    -f "$f"
  "${PSQL[@]}" -c \
    "INSERT INTO public._migrations(filename) VALUES ('$name') ON CONFLICT DO NOTHING"
done
echo "migrations up to date"
