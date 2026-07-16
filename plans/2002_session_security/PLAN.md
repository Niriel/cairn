# Plan: Session security + auth BFF

Sub-step 2002 of step 20 (`plans/2000_username_identity/`). Rebuild the session
model the credential rides on — a revocable, rotating session behind a small
Cairn-shaped auth BFF, replacing the long-lived non-revocable access JWT the
cookie holds today — _before_ the username sign-in surface (2003) is built on
top. This is the single largest security delta in step 20, the gap exists in
prod independent of usernames, and it is prod-facing.

## Context

Cairn is a live alpha at `cairn.lynnscape.eu` on a self-hosted
Postgres + PostgREST + GoTrue (`supabase/gotrue:v2.158.1`) stack. Auth today is
a transparent cookie/JWT shim: GoTrue returns tokens in a JSON body; the
`auth-proxy` sidecar (`auth-proxy/src/index.ts`) plants the **access token** as
the `cairn_session` HttpOnly cookie and **deletes the refresh token**
(`delete json.refresh_token`, lines 145–157); Caddy (`caddy/Caddyfile.prod`)
and the Vite dev proxy (`web/vite.config.ts`) read that cookie straight into
`Authorization: Bearer …` for `/api` (PostgREST) and avatar writes. The cookie
**is** the access JWT, with `GOTRUE_JWT_EXP=604800` (~7 days,
`docker-compose.yml:41`).

Two consequences are unacceptable once the credential becomes a brute-forceable
password: the cookie is a bearer valid for its full lifetime to anyone who
captures it, and there is **no server-side session record**, so "sign out
everywhere", killing sessions on compromise, and forcing re-auth after a
password change are all impossible. The HttpOnly + token-strip stance is a
_good_ XSS defence and is kept; the gap is narrowly the long-lived,
non-revocable cookie value and the discarded refresh token.

The fix has been approved at the step level (parent PLAN.md "Design revision"):
go full rather than patch. Make the session revocable + rotating, grow the
`auth-proxy` into a Cairn-shaped BFF, and add `__Host-` cookie hardening, an
explicit CSRF check, and sign-in rate-limiting. Sequenced **first** of the
remaining sub-steps because the gap is live in prod today and passwords make it
newly urgent; it keeps the current magic-link credential working through the
BFF so it can deploy on its own, ahead of the username UI (2003).

The favourable part of the existing design: the web app is `adapter-static`
(no runtime server), single-origin (no CORS), and the cookie→bearer attachment
for `/api` is identity-agnostic. The BFF is the **only** place server-side auth
logic can live, and it has to grow for revocable refresh regardless (storing the
refresh token, detecting access expiry, calling GoTrue's refresh, rotating,
re-planting _cannot_ live in a static SPA) — so the Cairn-shaped surface rides
that growth at no extra structural cost.

## Decisions

**Dual cookie: durable revocable refresh token + short-lived minted access
token (R1, R2).** The crux is that the cookie can no longer be the bearer
PostgREST validates, yet Caddy proxies `/api` _directly_ to PostgREST and can
only read a cookie — it cannot do a per-request session-store lookup at the
edge. So we split the one cookie into two:

```
browser ──cookie──▶ Caddy ──Bearer(cairn_access)──▶ PostgREST
                      │
          (cairn_access expired / absent? 401)
                      ▼
browser ──__Host-cairn_session──▶ BFF POST /auth/refresh
                      │  GoTrue /token?grant_type=refresh_token (rotate)
                      ▼  re-plant BOTH cookies, return tokenless 204
__Host-cairn_session = rotating, revocable refresh token (durable, ~30d idle)
cairn_access         = short-lived access JWT (HttpOnly, ~5 min), bearer for /api
```

The access token is minted server-side by the BFF, lives only in a short-lived
HttpOnly cookie page JS cannot read, and is never the durable credential — so
R14's "minted server-side, short-lived, not the durable cookie value" holds.
The rejected stricter reading — an opaque session id in the cookie and the
access token held purely server-side — would force **all** `/api` traffic
through the BFF (the only component that could inject the bearer), turning the
small auth component into a hot-path data proxy and a new failure/scaling
surface, contradicting R5's "small BFF, only server-side auth component" and
requiring a Caddy-routing overhaul. The dual-cookie approach keeps `/api` a
direct proxy and confines the BFF to the `/auth/*` path. **User-confirmed.**

**Lean on GoTrue-native rotation + reuse detection + logout-scope; no custom
session table (R3, R4).** GoTrue v2.158.1 already stores refresh tokens
server-side (`auth.refresh_tokens` / `auth.sessions`), rotates them with reuse
detection (`GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED`,
`..._REUSE_INTERVAL`), and revokes by scope (`POST /logout?scope=global|local`).
That covers rotation, reuse-as-theft-signal, and "sign out everywhere" without
a bespoke session table. A spike (Task 1.1) confirms these behaviours against
the _installed_ image before we build on them; a custom table is added only if
a gap is found. This is the parent PLAN.md default, settled here.

**Short-lived access token via lowered `GOTRUE_JWT_EXP` + a client refresh-on-401
interceptor (R2).** `GOTRUE_JWT_EXP` drops from 604800 to single-digit minutes
(plan: 300 s). The durable refresh cookie's life is independent (idle horizon,
~30 d `Max-Age`; GoTrue refresh tokens persist until revoked/rotated). When the
access cookie expires, the next `/api` call 401s; the web client's fetch wrapper
silently calls `/auth/refresh` once and retries. On boot, the app refreshes
first (a short-lived access cookie may already be expired while the refresh
cookie is valid), so the route guard sees the true signed-in/out state.

The refresh primitive is **single-flight**: a burst of simultaneous `/api` 401s
(common when the 5-min access cookie expires under several in-flight requests)
must collapse to **one** `/auth/refresh`, the way `bootSession` already shares
one `bootPromise`. Concurrent refreshes are the failure mode of rotation +
reuse-detection — a second refresh replaying a just-rotated token past the grace
window would be read as theft and revoke the whole family (a spurious global
sign-out). So the shared `refresh()` lives in the `shared/` tier and is awaited
by boot, the `/api` 401-interceptor, and `auth-client` alike; the
`GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL` grace is the additional backstop.
`/auth/refresh` returns the **tokenless `user`** so boot adopts it directly with
no second `/auth/user` round-trip (which also avoids re-deriving the access
bearer for `/auth/user`).

**`__Host-` is prod-only; cookie names are env-derived (R6, R11).** The
`__Host-` prefix forces `Secure`, which a browser won't return over dev's
plain-HTTP localhost. So prod uses `__Host-cairn_session` / `__Host-cairn_access`
and dev uses `cairn_session` / `cairn_access`; both the BFF and the Vite proxy
derive the name from the same `COOKIE_SECURE` signal (the existing prod-only
`Secure` toggle), so the two stay in lockstep with one branch, not two
hand-maintained name lists. The cookie _name_ is not in `auth-paths.ts` (it's a
per-shim constant), so this divergence doesn't touch the drift-guarded lists.

**CSRF via a required custom header, not double-submit (R7).** For a
same-origin SPA where the browser auto-attaches the cookie, the simplest robust
CSRF defence is a custom request header the fetch client always sets and the BFF
requires on state-changing `/auth/*` requests: a cross-origin attacker cannot
set a custom header without a CORS preflight, and the BFF grants no cross-origin
CORS. A double-submit token (a readable cookie echoed in a header) was the
alternative — more moving parts (token mint, rotation, storage) for no added
protection at single-origin. `__Host-` + `SameSite=Lax` + the header is the
layered posture.

**Rate-limiting + constant-shape failures land as proven middleware now; the
real sign-in handler plugs in at 2003 (R8).** The password sign-in that R18
ultimately guards doesn't exist until 2003, but R18 is assigned to 2002 and the
mechanism must exist before the brute-forceable surface does. So 2002 builds and
**fully unit-tests** the per-IP + per-account throttle and the constant-shape
failure helper against a stubbed sign-in handler, and mounts them on the
`/auth/signin` skeleton. 2003 attaches the username+password credential check
behind the already-tested middleware. This honours R18→2002 (the mechanism lands
and is tested here) without needing the password credential.

Two hardening constraints on that middleware: the per-IP key must come from the
IP **Caddy** sets, never a client-supplied `X-Forwarded-For` (otherwise an
attacker rotates the header to evade the limit and poisons arbitrary buckets);
and because usernames are public (R1), the per-account leg must be a **graded
backoff** that still lets a correct credential through, not a hard lockout an
attacker could weaponise to deny a named victim sign-in. The per-IP leg stays
the primary brute-force bound.

**Force one re-auth on deploy, achieved structurally (R10).** The user chose
"force one re-auth at 2002" over letting old cookies age out, to close the
non-revocable gap immediately. No explicit purge is needed: renaming the prod
durable cookie to `__Host-cairn_session` and re-pointing Caddy's `/api` bearer
at the new `cairn_access` cookie means an old `cairn_session`-only client
fails the `/api` bearer attach and the boot refresh, and is bounced to sign-in.
The double disruption (a second forced re-auth at 2006's password cutover) is
trivial at alpha scale.

**The BFF stops being a purely generic narrowing proxy.** Today the proxy is
endpoint-agnostic: the `auth-paths.ts` lists (`BEARER_AUTH_PATHS`,
`COOKIE_PLANT_PATHS`, `LOGOUT_PATHS`) drive blanket plant/attach/clear behaviour
over a transparent forward. The new Cairn-shaped endpoints (`/auth/refresh`,
`/auth/signout`, and the 2003 `/auth/signin`/`/auth/register`) get **bespoke
handlers** instead. The narrowing lists stay (they still drive the magic-link
pass-through that R9 keeps alive, the Caddy `/auth/*` allow-list, and the web
route guard) and the drift guard stays green; `LOGOUT_PATHS` becomes
`/auth/signout`. The exact list deltas are specified per-task; the drift test
(`auth-proxy/test/auth-paths-drift.test.ts`) enforces the web↔proxy copies stay
identical.

Two generic behaviours still move, atomically, in the same commit as the
re-point (Task 1.3), or magic-link sign-in (R9) breaks: the `COOKIE_PLANT_PATHS`
JSON-sniff plant must plant **both** cookies (so the magic-link `/auth/token`
exchange and the OTP `/auth/verify` path establish the dual cookie, not just an
access token under the durable name), and the `BEARER_AUTH_PATHS` attach (used
by `/auth/user`) must read the **access** cookie, since the durable cookie now
holds a refresh token GoTrue's `/user` would reject. Each move also has a Caddy
allow-list / Vite-mirror counterpart (e.g. `/auth/refresh` must be added to the
`@gotrue` allow-list or it falls through to the SPA in prod); these ride with
the task that introduces the endpoint.

## Architecture

Three test layers per `docs/testing.md`: `auth-proxy/test/` Vitest for BFF
logic, `web/src/**/*.test.ts` Vitest for the client/session, `web/e2e/` Playwright
against the real stack. No pgTAP — 2002 touches no schema/RLS (the GoTrue config
changes are env, not migrations).

### New files

- **`auth-proxy/src/lib/cookies.ts`** — cookie name (env-derived `__Host-`
  prefix), attribute string, dual-cookie plant + clear helpers; the one place
  the prod/dev divergence lives.
- **`auth-proxy/src/lib/csrf.ts`** — the required-custom-header check for
  state-changing `/auth/*` requests.
- **`auth-proxy/src/lib/rate-limit.ts`** — per-IP + per-account sliding-window /
  backoff throttle and the constant-shape failure helper.
- **`auth-proxy/src/lib/session.ts`** — GoTrue translation: refresh-token
  exchange/rotation, reuse-as-revoke handling, logout (local + global).
- **`auth-proxy/test/refresh.test.ts`**, **`signout.test.ts`**,
  **`csrf.test.ts`**, **`rate-limit.test.ts`**, **`cookies.test.ts`** — BFF unit
  tests (stub GoTrue, as `shim.test.ts` does today).
- **`web/src/lib/auth/model/auth-client.test.ts`** additions / new cases for the
  reshaped client (refresh, signout, CSRF header, signOutEverywhere).

### Modified files

- **`auth-proxy/src/index.ts`** — grow into the BFF: mount CSRF + rate-limit
  middleware; add `POST /auth/refresh` and `POST /auth/signout` (reshaping the
  current `DELETE /auth/session`); add `/auth/signin` + `/auth/register` route
  skeletons; dual-cookie plant on the magic-link session-establish path; keep
  the magic-link pass-through (R9).
- **`auth-proxy/src/lib/auth-paths.ts`** + **`web/src/lib/shared/model/auth-paths.ts`**
  — path-list deltas in lockstep (`LOGOUT_PATHS` → `/auth/signout`; add the new
  endpoints where the narrowing still applies). Drift test guards them.
- **`web/vite.config.ts`** — dev parity: re-point `/api` + `/avatars`
  cookie→bearer to `cairn_access`; mirror dual-cookie plant, `/auth/refresh`,
  `/auth/signout`, CSRF.
- **`caddy/Caddyfile.prod`** (+ **`caddy/Caddyfile`** if used in dev) — re-point
  the `/api` + `/avatars` `header_regexp` from `cairn_session` to the access
  cookie; add the new BFF endpoints to the `@gotrue` allow-list.
- **`docker-compose.yml`** / **`docker-compose.prod.yml`** — enable GoTrue
  refresh-token rotation + reuse interval; lower `GOTRUE_JWT_EXP`; BFF env
  (`COOKIE_SECURE` already exists; add CSRF/rate-limit/cookie-name config as
  needed).
- **`web/src/lib/auth/model/auth-client.ts`** — reshape: session-establish +
  `refresh()` + `signOut()`/`signOutEverywhere()` against the BFF; CSRF header on
  state-changing calls. `AuthUser` stays `{ id, email }` (2003 adds username).
- **`web/src/lib/shared/state/session.svelte.ts`** — boot = refresh-then-check;
  sign-out via the BFF. (`assertAuthUser` still requires `email` — magic-link
  yields one; 2003 relaxes it.)
- **The shared `/api` fetch wrapper** — a refresh-on-401-retry-once interceptor.
  (Task locates it; `HttpError` lives near the auth client.)
- **`web/e2e/auth.spec.ts`** — extend with the silent-refresh, revocable-signout,
  and sign-out-everywhere paths.
- **`docs/architecture.md`**, **`docs/deployment.md`** — Phase 0 narrative +
  per-task mechanics edits (R12).

## Phase structure

TDD is non-negotiable: every task writes its failing test (RED) before the
implementation (GREEN), in the same task (commit unit). Phase 0 lands the doc
narrative before code. Producer-before-consumer: the BFF endpoints (Phases 1–3)
land before the web client that calls them (Phase 4); the e2e close is last.

0. **Phase 0 — reconcile session-model docs (R12).** Correct
   `docs/architecture.md` "JWT storage", the `cairn_session` client-storage
   table row, and the Request-flow steps to the dual-cookie revocable model +
   BFF surface + `__Host-`/CSRF; correct `docs/deployment.md`'s auth-proxy
   description + pre-deploy checklist. Narrative only; Caddyfile/compose
   mechanics ride with their tasks. Leaves the synthetic-e-mail "Considered and
   rejected" entry for 2003 (deliberately).

1. **Phase 1 — revocable rotating session core (R1, R2, R3, R4).** Spike-confirm
   GoTrue v2.158.1 rotation/reuse/logout-scope (Task 1.1); enable rotation +
   lower `GOTRUE_JWT_EXP` in compose; the `cookies.ts` dual-cookie helpers;
   `POST /auth/refresh` (rotate + re-plant + reuse→revoke→clear); the
   `/auth/signout` reshape (revoke via `/logout`, clear both; `scope=global`);
   re-point Caddy + Vite `/api` bearer to `cairn_access`. Unit tests against a
   stub GoTrue.

2. **Phase 2 — cookie hardening + CSRF (R6, R7).** Env-derived `__Host-` prefix
   (prod) for both cookies; the CSRF required-custom-header check on
   state-changing `/auth/*`; unit tests (missing header → 403; `__Host-` iff
   secure; both cookies hardened).

3. **Phase 3 — Cairn-shaped surface + rate-limiting (R5, R8).** Define the
   `/auth/signin` + `/auth/register` route skeletons behind the middleware;
   path-list deltas in lockstep (drift test green); per-IP + per-account
   rate-limit + constant-shape failure middleware, fully unit-tested against a
   stub sign-in handler and mounted on `/auth/signin`.

4. **Phase 4 — web client + session model + dev parity (R2, R9, R11).** Reshape
   `auth-client.ts` (refresh, signout/signOutEverywhere, CSRF header) and
   `session.svelte.ts` (boot = refresh-then-check); the `/api` 401-retry-via-
   refresh interceptor; the magic-link callback establishes the session through
   the BFF (R9); mirror everything in the Vite dev proxy. Vitest.

5. **Phase 5 — e2e + prod-facing close (R9, R10, R11).** Playwright real-stack:
   magic-link sign-in → access-cookie present → simulated access-cookie expiry →
   silent refresh → still signed in; signout clears both cookies + revokes;
   "sign out everywhere" invalidates a second session. Confirm prod
   compose/Caddy/`.env.prod` align and document the structural forced re-auth
   (R10). `./scripts/check.sh --e2e` green.

## Reference docs and skills

- **`docs/architecture.md`** — "Authentication", "JWT storage" (the Caddy/shim
  contract this rebuilds), the Request-flow steps, the client-storage table; the
  R12/R19 edit targets.
- **`docs/deployment.md`** — prod vs dev compose, the auth-proxy service, the
  Caddyfile cookie→bearer translation, the pre-deploy auth checklist; all
  prod-facing here.
- **`docs/logging.md`** — no tokens, no e-mail, hashes only; the BFF must keep
  refresh tokens and identifiers out of logs.
- **`docs/testing.md`** — the three test layers; auth-proxy has its own Vitest
  suite (stub-GoTrue pattern in `shim.test.ts`).
- **`.claude/skills/writing-{requirements,plan,tasks}.md`** — the three-file
  format this plan follows.
- **`auth-proxy/src/index.ts`, `web/vite.config.ts`, `caddy/Caddyfile.prod`** —
  the shim/proxy/edge to grow, and the exact cookie→bearer sites to re-point.

## Open questions

- **Access-token lifetime value.** Plan: `GOTRUE_JWT_EXP=300` (5 min). Trades
  refresh frequency against the bearer-capture window. Confirm 300 s feels right
  against the silent-refresh UX in Phase 5; tune in the compose task if the
  refresh chatter is noticeable. Default: 300 s.
- **Whether GoTrue v2.158.1 needs a session table for any R4 behaviour.**
  Default: GoTrue-native suffices (Task 1.1 spike confirms `scope=global` revokes
  all sessions and reuse revokes the family). Only if the spike finds a gap does
  a thin BFF/Postgres session table enter scope — captured as a new requirement +
  task, not a silent addition.
- **CSRF header name + whether `/api` writes also need it.** Plan: a single
  custom header (e.g. `X-Cairn-Auth`) on state-changing `/auth/*`. `/api` writes
  are cross-site-protected by `SameSite=Lax` (it withholds the cookie on
  cross-site sub-resource requests), so the explicit header is scoped to the BFF
  auth endpoints per R7. Confirm in Phase 2 that no state-changing `/api` path
  needs it; default scope = `/auth/*` only.
- **Exact `auth-paths.ts` list deltas.** `LOGOUT_PATHS` → `/auth/signout` is
  certain; whether `/auth/refresh` joins `COOKIE_PLANT_PATHS` or is fully bespoke
  (it plants via its own handler, not the generic sniffer) is settled in Phase 1
  when the handler is written. Drift test enforces lockstep regardless.
