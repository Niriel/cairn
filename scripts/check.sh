#!/usr/bin/env bash
# Run the full quality + unit-test gauntlet — exactly what CI runs.
# See docs/quality.md → "A single command to check everything".
#
# Playwright (E2E) is intentionally NOT in here: it needs the full
# stack up and downloads ~500 MB of browser binaries. Run separately
# with `cd web && pnpm test:e2e`.
set -euo pipefail

cd "$(dirname "$0")/.."

ok()   { printf '  \e[32mok\e[0m   %s\n' "$1"; }
fail() {
  printf '  \e[31mFAIL\e[0m %s\n' "$1"
  exit 1
}
need() {
  command -v "$1" >/dev/null 2>&1 || {
    printf '  \e[31mFAIL\e[0m missing host tool: %s — see README.md "Prerequisites"\n' "$1"
    exit 1
  }
}

need pnpm
need sqlfluff
need shellcheck
need shfmt
need docker

echo "==> web: install (frozen)"
(cd web && pnpm install --frozen-lockfile) >/dev/null && ok "pnpm install"

echo "==> web: type check"
(cd web && pnpm check) >/dev/null && ok "svelte-check"

echo "==> web: lint"
(cd web && pnpm lint) && ok "eslint"

echo "==> web: format check"
(cd web && pnpm format:check) >/dev/null && ok "prettier"

echo "==> sql lint"
sqlfluff lint db/ scripts/ 2>/dev/null && ok "sqlfluff" || fail "sqlfluff"

echo "==> shell lint"
shellcheck scripts/*.sh && ok "shellcheck"

echo "==> shell format"
shfmt -d -i 2 -ci -bn scripts/ && ok "shfmt"

echo "==> database tests (pgTAP)"
./scripts/test-db.sh >/dev/null && ok "pg_prove"

echo "==> web: unit tests"
(cd web && pnpm test) >/dev/null && ok "vitest"

echo
echo "all checks passed"
