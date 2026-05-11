#!/usr/bin/env bash
# Run the full quality + unit-test gauntlet — exactly what CI runs.
# See docs/quality.md → "A single command to check everything".
#
# Playwright (E2E) is intentionally NOT in here: it needs the full
# stack up and downloads ~500 MB of browser binaries. Run separately
# with `cd web && pnpm test:e2e`.
set -euo pipefail

cd "$(dirname "$0")/.."

ok() { printf '  \e[32mok\e[0m   %s\n' "$1"; }
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
if (cd web && pnpm install --frozen-lockfile) >/dev/null; then ok "pnpm install"; else fail "pnpm install"; fi

echo "==> web: type check"
if (cd web && pnpm check) >/dev/null; then ok "svelte-check"; else fail "svelte-check"; fi

echo "==> web: lint"
if (cd web && pnpm lint); then ok "eslint"; else fail "eslint"; fi

echo "==> web: format check"
if (cd web && pnpm format:check) >/dev/null; then ok "prettier"; else fail "prettier"; fi

echo "==> sql lint"
if sqlfluff lint db/ scripts/ 2>/dev/null; then ok "sqlfluff"; else fail "sqlfluff"; fi

echo "==> shell lint"
if shellcheck scripts/*.sh; then ok "shellcheck"; else fail "shellcheck"; fi

echo "==> shell format"
if shfmt -d -i 2 -ci -bn scripts/; then ok "shfmt"; else fail "shfmt"; fi

echo "==> database tests (pgTAP)"
if ./scripts/test-db.sh >/dev/null; then ok "pg_prove"; else fail "pg_prove"; fi

echo "==> web: unit tests"
if (cd web && pnpm test) >/dev/null; then ok "vitest"; else fail "vitest"; fi

echo
echo "all checks passed"
