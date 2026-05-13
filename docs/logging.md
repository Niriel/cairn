# Logging

This document describes what Cairn logs, what it deliberately doesn't, and what the operator can do with what's logged. It assumes the architecture in `architecture.md` (a small Hetzner VPS running Postgres, PostgREST, GoTrue, and Caddy as Docker containers, plus the avatar sidecar from `avatars.md`).

The headline rule: **logs exist to help the operator fix the operator's problem.** They are not telemetry, they are not analytics, and they are not a back channel into user behaviour. Cairn ships no third-party logging service, no log shipping to a hyperscaler, and no anonymous usage pings.

## What's logged, by container

| Container | What it logs | Where it goes | Retention |
|---|---|---|---|
| **PostgreSQL** | Startup, shutdown, slow queries (>1s), errors, role login attempts | `docker logs cairn-postgres`, rotated by Docker's `json-file` driver | 7 days, 50 MB cap |
| **PostgREST** | One line per request: method, path (without query string), status code, duration, anon-or-authenticated | `docker logs cairn-postgrest`, same rotation | 7 days, 50 MB cap |
| **GoTrue** | Magic-link sends (recipient hash, not address), token exchanges, signup events | `docker logs cairn-gotrue`, same rotation | 7 days, 50 MB cap |
| **Caddy** | Standard access log (method, path, status, size, duration) plus TLS handshake errors | `/var/log/cairn/caddy-access.log`, rotated daily via `logrotate` | 30 days |
| **Avatar sidecar** | Upload attempts (size, accept/reject reason), resize errors | `docker logs cairn-avatars`, same rotation | 7 days, 50 MB cap |

The retention numbers are caps, not floors — disk pressure on a 40 GB Hetzner VPS makes "keep forever" the wrong default. The Caddy access log lives longest at 30 days because it's the only line of defence against abuse complaints and TLS-failure debugging where a multi-day timeline matters.

## What's deliberately not logged

- **Query strings** on PostgREST or Caddy. PostgREST query strings frequently contain row UUIDs that, combined with the path, would constitute personal data; logging them turns the access log into a shadow audit trail nobody asked for. The path alone (`/items_ranked`) is enough to debug performance.
- **Request bodies.** PostgREST never logs bodies; the avatar sidecar never logs upload bytes. The avatar sidecar logs the *size* and the *accept/reject reason*, not the content type's claim and not the magic-byte sniff result detail.
- **Email addresses.** GoTrue's request log records magic-link sends with the email's `sha256` hash rather than the address. This is enough to debug "a user reports they can't sign in" — the operator can hash their email and grep — without the log file itself being a dump of every user's email.
- **JWT contents.** No log line in any container ever decodes or prints a JWT. PostgREST logs the role (`anon` or `authenticated`); GoTrue logs the user-id only in events where the user-id is the *subject* of the event, never as a contextual annotation on an unrelated request.
- **Client IP addresses past 1 hour.** Caddy's access log includes the client IP — it has to, for rate-limiting and abuse triage — but a daily cron strips the IP column from all log lines older than 24 hours, replacing it with `x.x.x.x`. The recent hour is enough for real-time abuse response; older lines don't need the IP to be useful for debugging.
- **Anything that would be useful for analytics.** Page view tracking, feature-usage counters, A/B test buckets, marketing-attribution headers — none of these exist because the underlying behaviour doesn't exist. Cairn is not a product that needs to know what its users do beyond what's needed to fix bugs.

## What the user is told

The privacy page (see `design/cairn-legal-screens.jsx` → Privacy Policy) lists the logged categories in plain language, with the same retention numbers as above. The list is short:

- *"We keep server logs for up to 30 days for the access log and 7 days for everything else."*
- *"We do not log the contents of your requests — your list names, item names, notes, and votes do not appear in any log file."*
- *"We do not use third-party analytics, crash reporting, or telemetry of any kind."*

Email-hash logging is a level of detail most users won't read about, but it's documented here so the operator can answer the question if asked.

## Operator workflow

When something is broken, the operator's first three commands are:

```bash
docker logs --tail 200 cairn-postgrest
tail -100 /var/log/cairn/caddy-access.log
docker logs --tail 200 cairn-postgres
```

The Caddy access log is plain text; PostgREST and Postgres logs are JSON-shaped one-line records. `jq` is installed on the VPS for filtering. There is no central log aggregator and no dashboard — `grep` and `jq` are the operator's tools, by design.

For a slow-query investigation, Postgres's `log_min_duration_statement = 1000` ensures every >1s query lands in the log with its (parameterized) text. The path from "user complained the items screen is slow" to "see exact statement plus duration" is one `docker logs cairn-postgres | jq 'select(.duration > 1000)'` away.

For an abuse investigation, Caddy's access log is the source of truth — IP, path, status, count. The IP-stripping cron means the operator has at most 24 hours of recent IP-grouped abuse data, which is enough for a same-day rate-limit response and short of a week-long surveillance window.

For a "user says their account is broken" report, GoTrue's log (filtered by the user's email hash) shows the magic-link send history, and PostgREST's log filtered by their role's user-id (when the operator looks it up via `select id from auth.users where email = ?`) shows their recent API activity. Nothing in the logs reveals what they were doing — just that they were.

## What the operator must not do

A few rules the operator is expected to keep, written down because they're easy to violate by accident:

- **Don't add a request-body logger to PostgREST.** PostgREST has one; it's off; leave it off. The bodies contain user content. This is the single fastest way to turn a clean privacy posture into a violation.
- **Don't ship logs off-VPS without re-checking the retention windows.** A "let me grep on my laptop" copy of `/var/log/cairn/caddy-access.log` is fine; uploading it to a shared cloud drive is not.
- **Don't lengthen retention without a reason.** The defaults are short on purpose. If "I wish I still had last month's access log" comes up often enough to matter, raise the cap deliberately — don't drift up by editing logrotate on a whim.
- **Don't add `pg_stat_statements` extension dumps to the public privacy page.** That extension records query text including parameterized values, which can include user content. We use it for tuning *on the operator's session only*, not as a logged artifact.

## What we'd change

If Cairn grows past the "two-people-running-this" scale, the logging story becomes:

- A real log-aggregation tool (Loki, Vector → ClickHouse, whatever) running on the same VPS, not a hyperscaler.
- The retention windows above become defaults rather than caps.
- The operator gets a small dashboard; users see no change.

None of this is v1 work. The single-VPS shape is what makes the logging story this short.
