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

echo "==> applying test bootstrap (auth stub + roles)"
"${PSQL_TEST[@]}" -f db/test-bootstrap.sql >/dev/null

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

echo "==> checking every test file declares a plan"
# `shopt -s nullglob` is in effect, so capture into an array first — a bare
# `grep -L 'plan(' db/tests/*.sql` would expand to an argless `grep` and
# read from stdin forever when there are no matches.
files=(db/tests/*.sql)
if [ ${#files[@]} -eq 0 ]; then
  echo "  no test files under db/tests/ — nothing to run" >&2
  exit 1
fi
# Match `SELECT plan(...)` or `SELECT no_plan(...)` anchored to a line
# start, not the bare substring `plan(` (a stray mention in an SQL
# comment would otherwise satisfy it). `no_plan()` is the count-free
# pgTAP form used when assertions are added/removed without tracking N.
missing=$(grep -LE '^[[:space:]]*SELECT[[:space:]]+(no_)?plan[[:space:]]*\(' "${files[@]}" || true)
if [ -n "$missing" ]; then
  echo "  test files missing a SELECT plan(N) declaration:" >&2
  # shellcheck disable=SC2001  # sed with ^ anchor is clearer than ${//} for line-prefix
  echo "$missing" | sed 's/^/    /' >&2
  exit 1
fi

echo "==> running pg_prove"
docker compose exec -T postgres \
  pg_prove --ext .sql -h localhost -U cairn -d cairn_test /db/tests
