#!/usr/bin/env bash
# Fail unless every service in the merged production compose config caps its
# container log (json-file driver with max-size and max-file). The privacy
# policy states the cap (see docs/logging.md and docs/legal.md), and it holds
# only while each prod service carries `logging: *default-logging` — this
# catches a new service that forgets it. Run from scripts/check.sh.
set -euo pipefail

cd "$(dirname "$0")/.."

# .env.prod.example supplies every variable compose interpolation needs; only
# the rendered structure is inspected, never the values.
# shellcheck disable=SC2016 # the single-quoted program is JavaScript; its ${} are JS template literals
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.prod.example config --format json \
  | node -e '
const config = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
const services = Object.entries(config.services ?? {});
const uncapped = services
  .filter(([, service]) => {
    const logging = service.logging ?? {};
    const options = logging.options ?? {};
    return logging.driver !== "json-file" || !options["max-size"] || !options["max-file"];
  })
  .map(([name]) => name);
if (uncapped.length > 0) {
  console.error(`uncapped prod container logs: ${uncapped.join(", ")}`);
  process.exit(1);
}
console.log(`${services.length} prod services cap their logs`);
'
