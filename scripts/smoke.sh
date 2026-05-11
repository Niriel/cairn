#!/usr/bin/env bash
# End-to-end smoke check: verifies the dev stack is reachable and wired.
# Run after `docker compose up -d` and `./scripts/migrate.sh`.
set -euo pipefail

ok() { printf '  \e[32mok\e[0m  %s\n' "$1"; }
fail() {
  printf '  \e[31mFAIL\e[0m %s\n' "$1"
  exit 1
}

echo "PostgREST root (OpenAPI):"
if curl -sf http://localhost:3000/ >/dev/null; then
  ok "http://localhost:3000/"
else
  fail "PostgREST not responding"
fi

# Note: there used to be an anon GET /profiles probe here as a
# schema-up check. Once migration 0004 lands, anon has no SELECT
# grant on profiles, so PostgREST returns 401 before RLS even runs
# — not an empty array we could relax against. Until step 3
# (plans/0000_implementation_order.md) lands an authenticated
# probe, use the manual \dt/\dv/\df check from PLAN.md →
# Verification to confirm the schema is up.

echo "GoTrue /health:"
name=$(curl -sf http://localhost:9999/health | jq -r .name)
if [ "$name" = "GoTrue" ]; then
  ok "GoTrue $name"
else
  fail "unexpected health response: $name"
fi

echo "Mailpit UI:"
if curl -sf http://localhost:8025/ >/dev/null; then
  ok "http://localhost:8025/"
else
  fail "Mailpit UI not reachable"
fi

echo "SvelteKit dev server (optional):"
if curl -sIf http://localhost:5173/ >/dev/null 2>&1; then
  ok "http://localhost:5173/"
else
  # shellcheck disable=SC2016  # literal backticks: showing the user the command to type
  printf '  skipped (run `pnpm dev` in web/ to test)\n'
fi

echo "all backend services healthy"
