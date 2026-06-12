#!/usr/bin/env bash
# Run the full quality + unit-test gauntlet — exactly what CI runs.
# See docs/quality.md → "A single command to check everything".
#
# By default Playwright (E2E) is NOT run: it needs the full stack up
# and downloads ~500 MB of browser binaries. Pass `--e2e` to append
# `pnpm test:e2e` after the rest of the gauntlet — intended as a
# pre-PR check, not a per-task one.
set -euo pipefail

cd "$(dirname "$0")/.."

run_e2e=0
for arg in "$@"; do
  case "$arg" in
    --e2e) run_e2e=1 ;;
    -h | --help)
      cat <<'EOF'
Usage: scripts/check.sh [--e2e]

  --e2e    Also run Playwright (pnpm test:e2e) after the gauntlet.
           Requires the dev stack to be up (docker compose up -d).
EOF
      exit 0
      ;;
    *)
      printf 'check.sh: unknown argument: %s (try --help)\n' "$arg" >&2
      exit 2
      ;;
  esac
done

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

echo "==> web: format check"
if (cd web && pnpm format:check) >/dev/null; then ok "prettier"; else fail "prettier"; fi

echo "==> web: lint"
if (cd web && pnpm lint); then ok "eslint"; else fail "eslint"; fi

echo "==> sql lint"
if sqlfluff lint db/ scripts/ 2>/dev/null; then ok "sqlfluff"; else fail "sqlfluff"; fi

echo "==> shell lint"
# scripts/*.sh is a literal glob that misses the extension-less
# cairn-admin CLI — name it explicitly. (shfmt below walks the directory
# and resolves it by shebang, so it needs no such addition.)
if shellcheck scripts/*.sh scripts/cairn-admin; then ok "shellcheck"; else fail "shellcheck"; fi

echo "==> shell format"
if shfmt -d -i 2 -ci -bn scripts/; then ok "shfmt"; else fail "shfmt"; fi

echo "==> web: type check"
if (cd web && pnpm check) >/dev/null; then ok "svelte-check"; else fail "svelte-check"; fi

echo "==> database tests (pgTAP)"
if ./scripts/test-db.sh >/dev/null; then ok "pg_prove"; else fail "pg_prove"; fi

echo "==> web: unit tests"
if (cd web && pnpm test) >/dev/null; then ok "vitest"; else fail "vitest"; fi

echo "==> sidecar: install (frozen)"
if (cd sidecar && pnpm install --frozen-lockfile) >/dev/null; then ok "sidecar pnpm install"; else fail "sidecar pnpm install"; fi

echo "==> sidecar: format check"
if (cd sidecar && pnpm format:check) >/dev/null; then ok "sidecar prettier"; else fail "sidecar prettier"; fi

echo "==> sidecar: lint"
if (cd sidecar && pnpm lint); then ok "sidecar eslint"; else fail "sidecar eslint"; fi

echo "==> sidecar: unit tests"
if (cd sidecar && pnpm test) >/dev/null; then ok "sidecar vitest"; else fail "sidecar vitest"; fi

echo "==> auth-proxy: install (frozen)"
if (cd auth-proxy && pnpm install --frozen-lockfile) >/dev/null; then ok "auth-proxy pnpm install"; else fail "auth-proxy pnpm install"; fi

echo "==> auth-proxy: format check"
if (cd auth-proxy && pnpm format:check) >/dev/null; then ok "auth-proxy prettier"; else fail "auth-proxy prettier"; fi

echo "==> auth-proxy: lint"
if (cd auth-proxy && pnpm lint); then ok "auth-proxy eslint"; else fail "auth-proxy eslint"; fi

echo "==> auth-proxy: unit tests"
if (cd auth-proxy && pnpm test) >/dev/null; then ok "auth-proxy vitest"; else fail "auth-proxy vitest"; fi

if [ "$run_e2e" -eq 1 ]; then
  echo "==> web: e2e (playwright)"
  if (cd web && pnpm test:e2e); then ok "playwright"; else fail "playwright"; fi
fi

echo
echo "all checks passed"
