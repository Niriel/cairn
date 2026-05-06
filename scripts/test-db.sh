#!/usr/bin/env bash
# Run the pgTAP test suite against a throwaway cairn_test database.
# Drops & recreates cairn_test from migrations every run so tests
# never depend on dev seed data — see docs/testing.md.
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
PSQL_ADMIN=(psql -h localhost -p 5432 -U cairn -d postgres -v ON_ERROR_STOP=1)
PSQL_TEST=(psql -h localhost -p 5432 -U cairn -d cairn_test -v ON_ERROR_STOP=1)

echo "==> resetting cairn_test"
"${PSQL_ADMIN[@]}" -c "DROP DATABASE IF EXISTS cairn_test;"
"${PSQL_ADMIN[@]}" -c "CREATE DATABASE cairn_test;"

echo "==> applying migrations"
shopt -s nullglob
for f in db/migrations/*.sql; do
  name=$(basename "$f")
  echo "  - $name"
  "${PSQL_TEST[@]}" \
    -c "SET cairn.authenticator_password = '$AUTHENTICATOR_PASSWORD'" \
    -c "SET cairn.gotrue_password = '$GOTRUE_PASSWORD'" \
    -f "$f" >/dev/null
done

echo "==> loading pgTAP extension"
"${PSQL_TEST[@]}" -c "CREATE EXTENSION IF NOT EXISTS pgtap;" >/dev/null

echo "==> running pg_prove"
docker compose exec -T postgres \
  pg_prove --ext .sql -h localhost -U cairn -d cairn_test /db/tests
