# Logging

This document describes what Cairn logs, what it deliberately doesn't, and what the operator can do with what's logged. It assumes the architecture in `architecture.md` (a small Hetzner VPS running Postgres, PostgREST, GoTrue, and Caddy as Docker containers, plus the avatar sidecar from `avatars.md`).

The headline rule: **logs exist to help the operator fix the operator's problem.** They are not telemetry, they are not analytics, and they are not a back channel into user behaviour. Cairn ships no third-party logging service, no log shipping to a hyperscaler, and no anonymous usage pings.

## What's logged, by container

| Container          | What it logs                                                                                                                                                        | Where it goes                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **PostgreSQL**     | Startup, shutdown, checkpoints, errors (terse: the error and its parameterised statement, no DETAIL), failed logins                                                 | `docker compose logs postgres`, rotated by Docker's `json-file` driver |
| **PostgREST**      | Startup and schema-cache events only — no request lines (`PGRST_LOG_LEVEL=crit`)                                                                                    | `docker compose logs postgrest`, same rotation                         |
| **GoTrue**         | One JSON line per request (method, path without query string, status, duration, `remote_addr`), plus error lines for failed grants; account events keyed by user-id | `docker compose logs gotrue`, same rotation                            |
| **auth-proxy**     | Startup and errors; never credentials, usernames, recovery addresses, codes, or tokens (see below)                                                                  | `docker compose logs auth-proxy`, same rotation                        |
| **Caddy**          | Runtime and TLS errors, and an error line for each 5xx it generates (client address, headers and query string filtered out) — **no access log** in production       | `docker compose logs caddy`, same rotation                             |
| **Avatar sidecar** | Startup and uncaught errors only                                                                                                                                    | `docker compose logs sidecar`, same rotation                           |

**Retention is by size, not by days.** Every production container uses the `json-file` driver with `max-size: 10m` and `max-file: 5` (the `x-logging` anchor in `docker-compose.prod.yml`; `scripts/check-prod-logging.sh`, run by `scripts/check.sh`, fails if any prod service lacks it), so each service keeps at most ~50 MB and Docker discards the oldest lines beyond that. On a quiet box that can mean weeks of history; on a busy one, days. The caps exist because the driver's default is unbounded — "keep forever" is the wrong default on a 40 GB VPS and the wrong posture for a privacy policy. Recreating a container (`docker compose up -d` after a config change) also discards its log.

**No access log.** Caddy writes no per-request access log in production (`caddy/Caddyfile.prod` has no site-level `log` directive). An access log would be the one place client IP addresses accumulate, and keeping it honest would need a rotation policy plus an IP-stripping job. Not having one is simpler and more private. Caddy still writes an `http.log.error` line, request included, for every 5xx it generates itself (an upstream that is down or restarting — every redeploy), so the global `log default` block in `caddy/Caddyfile.prod` filters those lines: it deletes `remote_ip`, `remote_port`, `client_ip` and `headers`, and cuts the query string off `uri`, keeping the method, host, path and error. Abuse response leans on the auth-proxy's in-memory rate limiter instead (see below).

## What's deliberately not logged

- **Query strings.** PostgREST query strings frequently contain row UUIDs and filter values that, combined with the path, would constitute personal data. PostgREST's own request log (at any level that prints requests) writes the full query string plus the User-Agent, so it runs at `PGRST_LOG_LEVEL=crit` and prints no request lines at all; GoTrue logs paths without query strings; Caddy has no access log and strips the query string from its error lines.
- **Request bodies and row contents.** No service logs request bodies; the avatar sidecar never logs upload bytes. Postgres runs with `log_error_verbosity=terse` (`docker-compose.yml`), because at the default verbosity a constraint violation's `DETAIL` line repeats the offending row (`Failing row contains (…)`, `Key (…)=(…) already exists`) — user content in the log. Terse keeps the error message and the statement; PostgREST's statements are parameterised (`$1`), so no values appear.
- **Email addresses.** No real e-mail address appears in any container log. GoTrue's login identifier is the uid-derived `<uid>@cairn.internal`, which carries no personal data, so its token-exchange and signup lines identify an account by user-id, never by a deliverable address. The one real address a user may have — their recovery e-mail — is handled only by the auth BFF, which never logs it (see the recovery bullet below). To trace "a user reports they can't sign in," the operator resolves their username to a user-id and greps by that.
- **Sign-in credentials and usernames at the auth BFF.** The auth-proxy (the Cairn-shaped backend-for-frontend; see `architecture.md`) never logs the submitted username, password, recovery e-mail, or any token — not on a sign-in, a registration, a refresh, or a rate-limit decision. A username is _public_ (it's the `@handle`), but a _sign-in attempt_ keyed to a username is behavioural data the log has no reason to keep, and a password must never touch a log under any circumstance. The per-IP / per-account sign-in rate-limiter holds its counters in memory only (`auth-proxy/src/lib/rate-limit.ts`), so even the throttle state is never written to disk.
- **Recovery addresses, codes, and the reset password at the auth BFF.** Cairn-orchestrated password recovery (see `architecture.md`) adds new sensitive values the BFF handles — the candidate/on-file recovery address, the 6-digit verification and reset codes, the scoped-role JWT, and the **new password** submitted on a reset. None of these ever appears in a log line: no recovery e-mail (at most a hash, like the GoTrue rule below), no code, no token, no JWT, and the BFF must **never log the reset request body** (it carries the plaintext new password). The codes cross to the database only as a SHA-256 hash, never plaintext. The one unavoidable plaintext crossing is the new password itself: R6's pgcrypto design means `reset_password` receives it as an RPC argument so `crypt()` can run in the DB. That argument therefore transits the PostgREST→Postgres boundary, which is why Postgres full-statement logging (`log_statement`) must stay **off** — it is by default (`none`) — and must not be turned on for the auth/recovery path. (The slow-query logger `log_min_duration_statement` — off by default, see "Operator workflow" — logs the _parameterized_ statement text, not the bound argument values, so it does not expand the password; the rule is "don't enable `log_statement`," not "never use the slow-query log.")
- **JWT contents.** No log line in any container ever decodes or prints a JWT. GoTrue logs the user-id only in events where the user-id is the _subject_ of the event, never as a contextual annotation on an unrelated request.
- **Client IP addresses.** There is no access log (see above). The one service that _would_ record a client IP is GoTrue: its `remote_addr` field is taken from `X-Forwarded-For` / `X-Real-IP` when present. Caddy adds those headers on every request it proxies, but GoTrue never receives them: the auth-proxy calls GoTrue only from its dedicated handlers, which send nothing but `content-type` / `Authorization`, and answers every other `/auth/*` request with a 404 — it has no generic pass-through (`auth-proxy/src/index.ts`, tested in `auth-proxy/test/shim.test.ts`). GoTrue therefore only ever sees, and logs, the auth-proxy's container address. PostgREST and the sidecar see Caddy's container address and log no requests. The auth-proxy reads the real IP from `X-Real-IP` for rate limiting, in memory only.
- **Anything that would be useful for analytics.** Page view tracking, feature-usage counters, A/B test buckets, marketing-attribution headers — none of these exist because the underlying behaviour doesn't exist. Cairn is not a product that needs to know what its users do beyond what's needed to fix bugs.

## Audit

Verified in step 14 (`plans/1400_legal_about/`, Task 1.2) against the dev stack with a documentation-range client address (`203.0.113.7`) in the forwarding headers, plus a reading of the production request path (`caddy/Caddyfile.prod`, `auth-proxy/src/`, `sidecar/src/`). Findings, and what was changed in response:

- **GoTrue recorded the forwarded client IP** in `remote_addr`. In production, normal app traffic never carried it (the auth-proxy's dedicated handlers send only `content-type` / `Authorization`), but any request reaching the generic pass-through — e.g. a `GET /auth/refresh`, which Caddy's method-agnostic `/auth/refresh*` route forwards — did. **Fixed:** first by stripping `X-Forwarded-For`, `X-Real-IP`, and `Forwarded` in the pass-through; then (step 14, Phase 6) by removing the pass-through altogether, so anything but a dedicated handler gets a 404 and never reaches GoTrue.
- **Postgres repeated row contents** in the `DETAIL` of constraint-violation errors. Username and recovery-e-mail RPCs were already safe (they catch the violation and raise a generic message), but item and list writes were not. **Fixed:** `log_error_verbosity=terse`.
- **PostgREST's request lines carried the full query string and User-Agent** (at its default level, for every 5xx). It logs the socket peer (Caddy), not the client. **Fixed:** `PGRST_LOG_LEVEL=crit`.
- **Caddy's error lines carried the client IP, the request headers and the full URI** for each 5xx it generated itself (found in the branch's code review, reproduced with `caddy:2.9.1` against a dead upstream). **Fixed:** the `log default` filter described above.
- **The sidecar could log a request body.** Its `express.json()` parser, which no route used, attached the raw text of a malformed JSON body to the error the sidecar logged. **Fixed:** the parser is removed.
- **No e-mail address, username, password, code, or token** appeared in any log after exercising the flows; GoTrue identities are `<uid>@cairn.internal`. The auth-proxy logs only its startup line; the sidecar only startup and uncaught errors; Caddy only runtime/TLS errors and its filtered 5xx lines.
- **Doc corrections.** Slow-query logging is off (`log_min_duration_statement = -1`), PostgREST does not log one line per request, and the sidecar does not log upload attempts — the table above now says so.

## What the user is told

The privacy policy (`/about/privacy`; see `legal.md` for the claims table) describes the logs in plain language:

- _"Our servers keep short technical logs to keep Cairn running. Each service keeps at most about 50 MB; older lines are deleted automatically. There is no web access log."_
- _"We do not log the contents of your requests — your list names, item names, notes, and votes do not appear in any log file."_
- _"We do not use third-party analytics, crash reporting, or telemetry of any kind."_

The uid-only identification of accounts in the logs is a level of detail most users won't read about, but it's documented here so the operator can answer the question if asked.

## Operator workflow

When something is broken, the operator's first three commands are:

```bash
docker compose logs --tail 200 postgrest
docker compose logs --tail 200 auth-proxy
docker compose logs --tail 200 postgres
```

GoTrue's log is JSON, one record per line; Postgres, PostgREST, and the auth-proxy write plain text. `jq` is installed on the VPS for filtering. There is no central log aggregator and no dashboard — `grep` and `jq` are the operator's tools, by design.

For a slow-query investigation, slow-query logging is **off** by default (`log_min_duration_statement = -1`). Turn it on for the investigation — `ALTER SYSTEM SET log_min_duration_statement = 1000; SELECT pg_reload_conf();` as the `cairn` superuser — reproduce, read `docker compose logs postgres | grep duration:`, then `ALTER SYSTEM RESET log_min_duration_statement; SELECT pg_reload_conf();`. It logs the parameterised statement text and the duration, never bound values.

For abuse, there is no IP-grouped history to investigate, by design: the auth-proxy's per-IP and per-account rate limiter throttles sign-in and registration in memory, and a persistent problem is handled at the firewall or with `GOTRUE_DISABLE_SIGNUP` rather than by mining logs.

For a "user says their account is broken" report, the operator resolves the account's user-id (`select id from profiles where lower(username) = lower(?)`), then filters GoTrue's log by that uid to see their sign-in / refresh history. PostgREST logs no requests, so there is no per-account API history — that's deliberate. Nothing in the logs reveals what anyone was doing.

## What the operator must not do

A few rules the operator is expected to keep, written down because they're easy to violate by accident:

- **Don't raise PostgREST's log level or Postgres's error verbosity in production.** `PGRST_LOG_LEVEL` above `crit` logs query strings and User-Agents; `log_error_verbosity` above `terse` logs row contents on constraint errors. Both are the fastest way to turn a clean privacy posture into a policy violation. If you need either to debug, raise it briefly and reset it.
- **Don't ship logs off-VPS without re-checking the retention windows.** A "let me grep on my laptop" copy of `docker compose logs` output is fine; uploading it to a shared cloud drive is not.
- **Don't lengthen retention without a reason.** The defaults are short on purpose. If "I wish I still had last month's access log" comes up often enough to matter, raise the cap deliberately — don't drift up by editing the compose `x-logging` options on a whim — and update the privacy policy when you do (see `legal.md`).
- **Don't add `pg_stat_statements` extension dumps to the public privacy page.** That extension records query text including parameterized values, which can include user content. We use it for tuning _on the operator's session only_, not as a logged artifact.

## What we'd change

If Cairn grows past the "two-people-running-this" scale, the logging story becomes:

- A real log-aggregation tool (Loki, Vector → ClickHouse, whatever) running on the same VPS, not a hyperscaler.
- The retention windows above become defaults rather than caps.
- The operator gets a small dashboard; users see no change.

None of this is v1 work. The single-VPS shape is what makes the logging story this short.
