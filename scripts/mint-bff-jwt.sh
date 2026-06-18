#!/usr/bin/env bash
# mint-bff-jwt.sh — mint the scoped-role JWT the auth-proxy uses for the
# signed-out password-reset RPCs (request_password_reset / reset_password).
#
# WHAT IT DOES
#   Prints to stdout an HS256 JWT carrying {"role":"cairn_auth_bff"} and a
#   far-future exp (~10 years), signed with JWT_SECRET. PostgREST verifies it
#   with the same secret and SET ROLEs to cairn_auth_bff — the only Postgres
#   role granted EXECUTE on the reset RPCs. This is the standard PostgREST
#   service-role pattern.
#
# WHEN TO USE
#   Once at deploy time (and again on rotation). The token is NOT minted on BFF
#   boot, so it can be rotated independently of a restart. Paste the output into
#   AUTH_BFF_DB_JWT in .env.prod (prod) or .env (dev). This is a high-value
#   secret — a reset-takeover primitive — so treat it like JWT_SECRET itself:
#   never commit it, never log it, store the prod copy in the password manager.
#
# USAGE
#   JWT_SECRET=<your secret> ./scripts/mint-bff-jwt.sh
#   # or, for dev, with JWT_SECRET in .env:
#   ./scripts/mint-bff-jwt.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# JWT_SECRET may come from the environment (the documented prod path) or, for
# dev convenience, from .env. It MUST be the same secret GoTrue signs with and
# PostgREST verifies with, or the token is rejected.
if [ -z "${JWT_SECRET:-}" ] && [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
: "${JWT_SECRET:?JWT_SECRET not set (pass it in the environment or put it in .env)}"

JWT_SECRET="$JWT_SECRET" node -e '
  const crypto = require("node:crypto");
  const secret = process.env.JWT_SECRET;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  // ~10 years out — long-lived so it survives restarts, rotated by re-running.
  const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60;
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({ role: "cairn_auth_bff", exp });
  const data = header + "." + payload;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  process.stdout.write(data + "." + sig + "\n");
'
