#!/usr/bin/env bash
# rebuild.sh — rebuild the production web static bundle from the current
# git checkout.
#
# WHAT IT DOES
#   Runs `docker compose ... build web`, which executes `pnpm install &&
#   pnpm build` inside the `web` image (see web/Dockerfile) and bakes a
#   fresh, content-hashed static bundle into the image. It does NOT touch
#   the running container — the live site keeps serving the old bundle
#   until you swap the image in.
#
# WHEN TO USE
#   On the production VPS, as step 2 of a release — AFTER `git pull` (and
#   `./scripts/migrate.sh` if the release adds migrations) and BEFORE
#   `./scripts/swap-image.sh`. This is the step people forget: a bare
#   `git pull` updates only the source on disk, so new UI (a new screen, a
#   new Settings row, …) never appears until it is rebuilt here and then
#   swapped in. See docs/deployment.md → "A release is: pull, restart".
#
#   Rebuilds the `web` service by default. Pass service names to build
#   others, e.g. `./scripts/rebuild.sh auth-proxy`.
set -euo pipefail

cd "$(dirname "$0")/.."

# Production scripts pin the base + prod overlay and the prod env file
# explicitly — never the dev override (which a bare `docker compose` would
# auto-load). Mirrors the invocation in docs/deployment.md. The .env.prod
# check doubles as a "you're on the prod box" guard: dev rebuilds use a
# bare `docker compose build`, not this script.
if [ ! -f .env.prod ]; then
  echo "rebuild: .env.prod not found — this script is for the production box." >&2
  echo "         (Dev rebuilds use a bare \`docker compose build\`.)" >&2
  exit 1
fi

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod)

"${COMPOSE[@]}" build "${@:-web}"

echo "rebuild: built '${*:-web}'. Run ./scripts/swap-image.sh to put it into service."
