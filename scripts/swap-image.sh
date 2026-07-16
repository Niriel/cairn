#!/usr/bin/env bash
# swap-image.sh — bring freshly-built production images into service.
#
# WHAT IT DOES
#   Runs `docker compose ... up -d --force-recreate` — recreates EVERY
#   container, not just the ones Compose thinks changed. This is deliberate:
#   Compose does NOT notice edits behind a bind mount (the Caddyfile is the
#   classic trap — a changed file on the same mount looks unchanged), so a
#   plain `up -d` can silently leave Caddy on the old config, or a container
#   on an old image / stale env. Recreating everything costs a few seconds of
#   full-stack restart — the database included — and buys never having to
#   guess which container missed the update.
#
# WHEN TO USE
#   On the production VPS, as the final step of a release — AFTER
#   `./scripts/rebuild.sh`. Run on its own it simply reconciles the running
#   containers against the compose files (a harmless no-op if nothing
#   changed), so it is also the right command after editing
#   docker-compose*.yml. See docs/deployment.md → "A release is: pull,
#   restart".
#
#   HEADS UP: the PWA service worker caches the previous bundle and only
#   updates when the new build's content hash differs. After swapping, a
#   client may still show the old UI until it hard-refreshes (or closes all
#   open tabs and reopens). That cache — not this script — is the usual
#   reason "I deployed but see no change" persists past the rebuild.
set -euo pipefail

cd "$(dirname "$0")/.."

# Pin the base + prod overlay and the prod env file explicitly — never the
# dev override. The .env.prod check doubles as a "you're on the prod box"
# guard. Mirrors the invocation in docs/deployment.md.
if [ ! -f .env.prod ]; then
  echo "swap-image: .env.prod not found — this script is for the production box." >&2
  exit 1
fi

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod)

"${COMPOSE[@]}" up -d --force-recreate "$@"

echo "swap-image: containers reconciled. Check status with:"
echo "  ${COMPOSE[*]} ps"
