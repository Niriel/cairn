# Logging

This document describes what Cairn logs, what it deliberately doesn't, and what the operator can do with what's logged. It assumes the architecture in `architecture.md` (a small Hetzner VPS running Postgres, PostgREST, GoTrue, and Caddy as Docker containers, plus the avatar sidecar from `avatars.md`).

The headline rule: **logs exist to help the operator fix the operator's problem.** They are not telemetry, they are not analytics, and they are not a back channel into user behaviour. Cairn ships no third-party logging service, no log shipping to a hyperscaler, and no anonymous usage pings.

## What's logged, by container

| Container          | What it logs                                                                                            | Where it goes                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **PostgreSQL**     | Startup, shutdown, slow queries (>1s), errors, role login attempts                                      | `docker compose logs postgres`, rotated by Docker's `json-file` driver |
| **PostgREST**      | One line per request: method, path (without query string), status code, duration, anon-or-authenticated | `docker compose logs postgrest`, same rotation                         |
| **GoTrue**         | Sign-in / refresh token exchanges and signup events, keyed by user-id (never a deliverable address)     | `docker compose logs gotrue`, same rotation                            |
| **auth-proxy**     | Startup and errors; never credentials, usernames, recovery addresses, codes, or tokens (see below)      | `docker compose logs auth-proxy`, same rotation                        |
| **Caddy**          | Runtime and TLS errors only — **no access log** in production                                           | `docker compose logs caddy`, same rotation                             |
| **Avatar sidecar** | Upload attempts (size, accept/reject reason), resize errors                                             | `docker compose logs sidecar`, same rotation                           |

**Retention is by size, not by days.** Every production container uses the `json-file` driver with `max-size: 10m` and `max-file: 5` (the `x-logging` anchor in `docker-compose.prod.yml`), so each service keeps at most ~50 MB and Docker discards the oldest lines beyond that. On a quiet box that can mean weeks of history; on a busy one, days. The caps exist because the driver's default is unbounded — "keep forever" is the wrong default on a 40 GB VPS and the wrong posture for a privacy policy. Recreating a container (`docker compose up -d` after a config change) also discards its log.

**No access log.** Caddy writes no per-request access log in production (`caddy/Caddyfile.prod` has no `log` directive). An access log would be the one place client IP addresses accumulate, and keeping it honest would need a rotation policy plus an IP-stripping job. Not having one is simpler and more private. Abuse response leans on the auth-proxy's in-memory rate limiter instead (see below).

## What's deliberately not logged

- **Query strings** on PostgREST or Caddy. PostgREST query strings frequently contain row UUIDs that, combined with the path, would constitute personal data; logging them turns the access log into a shadow audit trail nobody asked for. The path alone (`/items_ranked`) is enough to debug performance.
- **Request bodies.** PostgREST never logs bodies; the avatar sidecar never logs upload bytes. The avatar sidecar logs the _size_ and the _accept/reject reason_, not the content type's claim and not the magic-byte sniff result detail.
- **Email addresses.** No real e-mail address appears in any container log. GoTrue's login identifier is the uid-derived `<uid>@cairn.internal`, which carries no personal data, so its token-exchange and signup lines identify an account by user-id, never by a deliverable address. The one real address a user may have — their recovery e-mail — is handled only by the auth BFF, which never logs it (see the recovery bullet below). To trace "a user reports they can't sign in," the operator resolves their username to a user-id and greps by that.
- **Sign-in credentials and usernames at the auth BFF.** The auth-proxy (the Cairn-shaped backend-for-frontend; see `architecture.md`) never logs the submitted username, password, recovery e-mail, or any token — not on a sign-in, a registration, a refresh, or a rate-limit decision. A username is _public_ (it's the `@handle`), but a _sign-in attempt_ keyed to a username is behavioural data the log has no reason to keep, and a password must never touch a log under any circumstance. The per-IP / per-account sign-in rate-limiter holds its counters in memory only (`auth-proxy/src/lib/rate-limit.ts`), so even the throttle state is never written to disk.
- **Recovery addresses, codes, and the reset password at the auth BFF.** Cairn-orchestrated password recovery (see `architecture.md`) adds new sensitive values the BFF handles — the candidate/on-file recovery address, the 6-digit verification and reset codes, the scoped-role JWT, and the **new password** submitted on a reset. None of these ever appears in a log line: no recovery e-mail (at most a hash, like the GoTrue rule below), no code, no token, no JWT, and the BFF must **never log the reset request body** (it carries the plaintext new password). The codes cross to the database only as a SHA-256 hash, never plaintext. The one unavoidable plaintext crossing is the new password itself: R6's pgcrypto design means `reset_password` receives it as an RPC argument so `crypt()` can run in the DB. That argument therefore transits the PostgREST→Postgres boundary, which is why Postgres full-statement logging (`log_statement`) must stay **off** — it is by default (`none`) — and must not be turned on for the auth/recovery path. (The slow-query logger `log_min_duration_statement = 1000` logs the _parameterized_ statement text, not the bound argument values, so it does not expand the password; the rule is "don't enable `log_statement`," not "disable the slow-query log.")
- **JWT contents.** No log line in any container ever decodes or prints a JWT. PostgREST logs the role (`anon` or `authenticated`); GoTrue logs the user-id only in events where the user-id is the _subject_ of the event, never as a contextual annotation on an unrelated request.
- **Client IP addresses.** There is no access log (see above), and no service is meant to record a client IP. Whether any upstream log picks one up from a forwarded header (`X-Forwarded-For`, which Caddy's `reverse_proxy` adds by default) is exactly what the audit below verifies.
- **Anything that would be useful for analytics.** Page view tracking, feature-usage counters, A/B test buckets, marketing-attribution headers — none of these exist because the underlying behaviour doesn't exist. Cairn is not a product that needs to know what its users do beyond what's needed to fix bugs.

## Audit

_Pending — step 14, Task 1.2 (`plans/1400_legal_about/`)._ The table above is the design; the audit records what each container's log output actually contains after exercising sign-in, registration, password recovery, and avatar upload, and whether a real client IP can reach any log on the production request path. Until it lands, the privacy policy must not claim more than the design.

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

PostgREST and Postgres logs are JSON-shaped one-line records. `jq` is installed on the VPS for filtering. There is no central log aggregator and no dashboard — `grep` and `jq` are the operator's tools, by design.

For a slow-query investigation, Postgres's `log_min_duration_statement = 1000` ensures every >1s query lands in the log with its (parameterized) text. The path from "user complained the items screen is slow" to "see exact statement plus duration" is one `docker compose logs --no-log-prefix postgres | jq 'select(.duration > 1000)'` away.

For abuse, there is no IP-grouped history to investigate, by design: the auth-proxy's per-IP and per-account rate limiter throttles sign-in and registration in memory, and a persistent problem is handled at the firewall or with `GOTRUE_DISABLE_SIGNUP` rather than by mining logs.

For a "user says their account is broken" report, the operator resolves the account's user-id (`select id from profiles where lower(username) = lower(?)`), then filters GoTrue's log by that uid to see their sign-in / refresh history. PostgREST logs only the role (`anon` / `authenticated`), not the user, so its log can't be filtered per account — that's deliberate. Nothing in the logs reveals what anyone was doing.

## What the operator must not do

A few rules the operator is expected to keep, written down because they're easy to violate by accident:

- **Don't add a request-body logger to PostgREST.** PostgREST has one; it's off; leave it off. The bodies contain user content. This is the single fastest way to turn a clean privacy posture into a violation.
- **Don't ship logs off-VPS without re-checking the retention windows.** A "let me grep on my laptop" copy of `docker compose logs` output is fine; uploading it to a shared cloud drive is not.
- **Don't lengthen retention without a reason.** The defaults are short on purpose. If "I wish I still had last month's access log" comes up often enough to matter, raise the cap deliberately — don't drift up by editing the compose `x-logging` options on a whim — and update the privacy policy when you do (see `legal.md`).
- **Don't add `pg_stat_statements` extension dumps to the public privacy page.** That extension records query text including parameterized values, which can include user content. We use it for tuning _on the operator's session only_, not as a logged artifact.

## What we'd change

If Cairn grows past the "two-people-running-this" scale, the logging story becomes:

- A real log-aggregation tool (Loki, Vector → ClickHouse, whatever) running on the same VPS, not a hyperscaler.
- The retention windows above become defaults rather than caps.
- The operator gets a small dashboard; users see no change.

None of this is v1 work. The single-VPS shape is what makes the logging story this short.
