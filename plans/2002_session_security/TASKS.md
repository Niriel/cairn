# Tasks

Sub-step 2002 of step 20. Make the session revocable + rotating behind a
Cairn-shaped auth BFF, harden the cookie, add CSRF + sign-in rate-limiting —
keeping the magic-link credential working so this ships independently. See
`REQUIREMENTS.md` (R1–R12) and `PLAN.md` for the full design; each task below is
self-contained.

## Reference skills and docs

- **`docs/architecture.md`** — "Authentication", "JWT storage" (the shim
  contract being rebuilt), the Request-flow steps, the client-storage table.
- **`docs/deployment.md`** — prod vs dev compose, the auth-proxy service, the
  Caddyfile cookie→bearer translation, the pre-deploy auth checklist.
- **`docs/logging.md`** — no tokens, no e-mail, hashes only; keep refresh tokens
  and identifiers out of BFF logs.
- **`docs/testing.md`** — three test layers; the stub-GoTrue Vitest pattern in
  `auth-proxy/test/shim.test.ts` is the model for new BFF tests.
- **`.claude/skills/writing-tasks.md`** — RED-before-GREEN, commit-unit tasks.

## Phase 0 — reconcile session-model docs (R12)

### [ ] 0.1 Correct `docs/architecture.md` to the dual-cookie revocable session + BFF

**Created:** 2026-06-15T17:55:34Z
**Completed:**

**Why:** This sub-plan reverses load-bearing claims the docs (and 2001) recorded
— that `cairn_session` _is_ the ~7-day access JWT and the refresh token is
discarded. Downstream sub-plans (2003+) must reference the corrected session
model, not the stale one. Doc narrative lands before code (Phase 0).

**Prerequisites:** None.

**Decisions:**

- This is the **session-model** half of the parent R19 reconciliation. Do **not**
  touch the synthetic-e-mail "Considered and rejected" entry (≈ line 327) or the
  `data-model.md` `set_username` notes — those are the identity-mechanism half,
  corrected by 2003. Leaving them is deliberate; note it in the commit body.
- The new model: the **durable** cookie (`__Host-cairn_session` in prod) holds a
  rotating, revocable **refresh token**, ~30-day idle `Max-Age`; a **separate
  short-lived** `cairn_access` HttpOnly cookie holds the BFF-minted access JWT
  (single-digit minutes) that Caddy/Vite attach as the `/api` bearer; refresh
  uses rotation with reuse detection; sign-out revokes server-side and
  "sign out everywhere" revokes all sessions; cookie is `__Host-`-hardened with
  an explicit CSRF header on state-changing `/auth/*`.
- Keep the HttpOnly + narrowing + token-strip framing (still true and still a
  good XSS defence). Keep the magic-link URL-hash trade-off note (the magic-link
  flow is unchanged here; retired in 2006).

**Reference:** `docs/architecture.md` lines 143–170 ("JWT storage: HttpOnly
cookie via a Caddy shim"), line 277 (the `cairn_session` row in the
client-side-storage table). Two _separate_ Request-flow walkthroughs need
correcting: the **"show me my lists" flow** step 3 (≈ 238 — the `/api` bearer)
and the **"A login request" magic-link flow** steps 7–8 (≈ 253–254 — the
session plant). They are different numbered lists; correct both.

**Files:**

- `docs/architecture.md` (modify)

**Steps:**

1. Rewrite the "JWT storage" section (143–170): describe the dual cookie
   (durable revocable refresh token + short-lived BFF-minted access token), the
   BFF minting access on demand, refresh rotation + reuse detection, the
   `__Host-` prefix + CSRF posture, and that Caddy/Vite attach the _access_
   cookie (not the durable one) to `/api`. Preserve the narrowing paragraph and
   the security-trade-off note.
2. Correct the `cairn_session` row in the client-storage table (≈ 277): replace
   "The auth JWT … ~7-day Max-Age (raised to ~30-day when refresh-token rotation
   lands)" with the two cookies — durable refresh (~30-day idle, revocable) and
   short-lived access (~5-min) — and that both are HttpOnly/Secure(prod)/Lax.
3. Correct the **"show me my lists" flow** step 3 (≈ 238): it attaches the
   _access_ cookie (`cairn_access`) as the bearer, not the durable cookie.
   Separately, correct the **"A login request" magic-link flow** steps 7–8
   (≈ 253–254): step 7 now plants **both** cookies via the BFF (durable refresh +
   short-lived access); step 8 notes the short-lived access token + the client
   refresh-on-401. Don't conflate the two flows — they are distinct numbered
   lists in the doc.
4. Verify the prose is internally consistent (no remaining "cairn_session is the
   JWT" claims outside the magic-link hash note).

**Verify:** `pnpm --dir web exec prettier --check ../docs/architecture.md` (or
`./scripts/check.sh` prettier step) · manual read for consistency.

### [ ] 0.2 Correct `docs/deployment.md` auth-proxy description + pre-deploy checklist

**Created:** 2026-06-15T17:55:34Z
**Completed:**

**Why:** The deployment doc describes the auth-proxy as "the response-side half
of the cookie/JWT shim (cookie-plant + token-strip)" and its pre-deploy checklist
predates the BFF. Operators reading it before a deploy must see the BFF, the
dual cookie, and the new auth posture.

**Prerequisites:** Task 0.1 (consistent vocabulary for the new model).

**Decisions:**

- Update the **prose/narrative** only here; the concrete Caddyfile cookie→bearer
  re-point and the compose env additions are doc-mechanics that ride with their
  implementation tasks (1.2, 1.6) per R12.
- The pre-deploy checklist's item 1 ("password grant must be unreachable for
  real accounts") stays true for 2002 (magic-link only) but flips in 2003; note
  that it changes then rather than editing it away now.

**Reference:** `docs/deployment.md` line 120 (auth-proxy bullet), lines 132–142
(the Caddyfile section), lines 313–321 (pre-deploy auth checklist).

**Files:**

- `docs/deployment.md` (modify)

**Steps:**

1. Rewrite the auth-proxy bullet (≈ 120): it is now a small Cairn-shaped BFF —
   dual-cookie plant, refresh rotation + reuse detection, `/auth/refresh` +
   `/auth/signout`, CSRF check, sign-in rate-limiting — not just cookie-plant +
   token-strip.
2. In the Caddyfile section (132–142), note that the `/api` + avatar-write
   cookie→bearer translation reads the short-lived **access** cookie and that the
   `/auth/*` allow-list includes the new BFF endpoints (exact regex lands in
   Task 1.2's Caddyfile edit).
3. Add a 2002 line to the pre-deploy checklist: GoTrue refresh-token rotation
   enabled, `GOTRUE_JWT_EXP` lowered, durable cookie `__Host-`-prefixed, CSRF
   enforced. Annotate that checklist item 1 changes in 2003.

**Verify:** prettier check on `docs/deployment.md` · manual read.

## Phase 1 — revocable rotating session core (R1, R2, R3, R4)

### [ ] 1.1 Spike: confirm GoTrue v2.158.1 rotation, reuse detection, and logout scope

**Created:** 2026-06-15T17:55:34Z
**Completed:**

**Why:** The whole plan rides on GoTrue-native rotation/reuse/`scope=global`
(no custom session table). The end-to-end check 2001 deferred must be settled
against the _installed_ image before Phase 1 builds on it.

**Prerequisites:** Local stack up (`docker compose up`). No _committed_ code
change: the spike **temporarily** flips the GoTrue rotation env vars
(`GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED` + the reuse-interval var) to
observe rotation/reuse behaviour, then reverts them — Task 1.2 is what lands them
permanently. So step 1's "rotation enabled" means this throwaway env flip, not a
commit.

**Decisions:**

- Confirm, against the running `supabase/gotrue:v2.158.1`: (a) with rotation
  enabled, `POST /token?grant_type=refresh_token` returns a **new** refresh
  token and the old one stops working past the reuse interval; (b) replaying a
  rotated refresh token past the grace window revokes the **family** (subsequent
  refresh with any sibling fails); (c) `POST /logout?scope=global` (with a
  bearer) invalidates all of that user's refresh tokens; (d) the relevant env
  vars are `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED` and
  `GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL` (note any naming differences in
  this version).
- If any behaviour is missing, **stop and report** — it changes the plan (a thin
  session table would enter scope as a new requirement + task). Do not silently
  work around a gap.

**Reference:** `docs/architecture.md` "Authentication"; the GoTrue config in
`docker-compose.yml:36-46`.

**Files:**

- None (investigation). Record findings in this task's **Notes** when complete.

**Steps:**

1. With rotation enabled in the dev GoTrue env, sign in a seed user (the
   existing `/auth/token?grant_type=password` dev path), capture the refresh
   token, exchange it, and confirm a new token is issued and the old one is
   rejected past the reuse interval.
2. Replay a rotated token past the grace window; confirm the family is revoked.
3. Call `/logout?scope=global` with a valid bearer; confirm all the user's
   refresh tokens are invalidated.
4. Record the confirmed behaviours, the exact env-var names, and the reuse
   interval default in **Notes**.

**Verify:** Manual against the local stack; findings recorded in Notes. (No
automated test — this is a capability spike; the behaviours are pinned by the
unit tests in 1.3/1.4.)

### [ ] 1.2 Enable GoTrue rotation + short access TTL; re-point Caddy/Vite to the access cookie

**Created:** 2026-06-15T17:55:34Z
**Completed:**

**Why:** The access token must be short-lived (R2) and refresh tokens must rotate
with reuse detection (R3); and once the durable cookie holds a refresh token, the
`/api` bearer must come from the new short-lived access cookie, not the durable
cookie.

**Prerequisites:** Task 1.1 (confirmed env-var names + behaviours).

**Decisions:**

- `docker-compose.yml`: set `GOTRUE_JWT_EXP` to `300` (5 min, see PLAN.md Open
  questions), enable `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true`, set
  `GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL` (use the name Task 1.1 confirmed).
  These are base-compose changes (apply to dev and prod).
- **The reuse interval is load-bearing — do not set it to "small" or 0.** Boot
  now _always_ refreshes (Task 4.1), rotating the durable token on every cold
  load. The single-flight `refresh()` dedupes only _within one JS realm_; two tabs
  / a PWA-window + a tab booting near-simultaneously each read the same durable
  cookie and each replay it. The reuse interval — **not** single-flight — is the
  only defence for that cross-realm case: a too-short interval makes a normal
  multi-tab open look like token theft and revokes the whole family (R3), a
  spurious "signed out everywhere". Pin it to a value that safely covers
  multi-tab boot skew + clock skew (GoTrue's ~10 s default is the floor, not a
  ceiling to shave below). Record the chosen value here.
- The access cookie is named `cairn_access` (dev) / `__Host-cairn_access` (prod);
  the durable cookie keeps `cairn_session` (dev) / `__Host-cairn_session` (prod).
  This task only **re-points the bearer source**; the `__Host-` prefix + the
  durable cookie's new refresh-token contents land in 1.3/Phase 2.
- `caddy/Caddyfile.prod`: change both `header_regexp … Cookie cairn_session=…`
  occurrences (the `/api` and avatar-write `@cookie`/`@avatar_cookie` matchers)
  to the access cookie name. Mirror in `web/vite.config.ts` (`/api` + `/avatars`
  `readBearerFromCookie`). This is the doc-mechanics edit that rides with R12.
- **Expect the running stack to be intentionally degraded between this task and
  1.3 — this is not a regression.** Two transient effects, both resolved when 1.3
  lands the dual-cookie plant + refresh in one atomic commit: (1) lowering
  `GOTRUE_JWT_EXP` to 300 s with **no** refresh mechanism yet means the
  `cairn_session`-as-access-JWT expires after ~5 min and the user is silently
  logged out (there is nothing to refresh it until 1.3); (2) re-pointing the
  `/api` bearer to a `cairn_access` cookie nobody plants yet makes `/api` run as
  `anon`. Both are throwaway feature-branch states never deployed alone (the
  branch deploys whole). Don't try to "fix" them inside 1.2 — they go away in 1.3.

**Reference:** `caddy/Caddyfile.prod:24-28,42-50`; `web/vite.config.ts:30-101`;
`docker-compose.yml:41` (`GOTRUE_JWT_EXP`).

**Files:**

- `docker-compose.yml` (modify)
- `caddy/Caddyfile.prod` (modify)
- `web/vite.config.ts` (modify)
- `docs/deployment.md` (modify — note the access-cookie bearer in the Caddyfile
  section if 0.2 left the exact name to here)

**Steps:**

1. GREEN — edit `docker-compose.yml`: lower `GOTRUE_JWT_EXP`, enable rotation +
   reuse interval (names from Task 1.1).
2. GREEN — re-point Caddy `/api` + avatar-write cookie→bearer to the access
   cookie name; mirror in `web/vite.config.ts`'s `readBearerFromCookie` callers
   for `/api` and `/avatars` (the cookie helper takes the access name there).
3. GREEN — restart the stack; confirm a signed-in dev user's `/api` calls still
   succeed once an access cookie is being planted (this becomes fully true after
   1.3 plants it; until then, confirm the regex change is syntactically valid via
   `docker compose config` and Caddy validate).

**Verify:** `docker compose config` (compose valid) · Caddy config validate ·
`pnpm --dir web check` (vite.config types) · `./scripts/check.sh` lint/format.

### [ ] 1.3 Dual-cookie reshape of the proxy: plant, bearer-read, `POST /auth/refresh`

**Created:** 2026-06-15T17:55:34Z
**Completed:**

**Why:** The core of the revocable model, landed as **one atomic commit** so no
intermediate state breaks magic-link sign-in: the BFF must plant _both_ cookies
on every session-establish (not just `/auth/refresh` — the magic-link
`/auth/token` and `/auth/verify` paths too), read the _access_ cookie (not the
durable one) wherever it attaches a bearer, and expose `/auth/refresh` to
exchange the durable refresh token for a fresh access token, re-plant the
rotated refresh, and treat a revoked-family response as a hard sign-out
(R1, R2, R3, R9). Because Task 1.2 re-points `/api` to `cairn_access`, every
cookie site in the proxy has to move together or magic-link login dies.

**Prerequisites:** Task 1.2 (rotation enabled; `/api` + avatar bearer re-pointed
to the access cookie in Caddy + Vite).

**Decisions:**

- New `auth-proxy/src/lib/cookies.ts`: `plantSession(res, { accessToken,
refreshToken, expiresIn })` sets both cookies (the durable `Max-Age` is a
  **hardcoded ~30 d idle horizon** — _not_ the legacy `COOKIE_MAX_AGE` env, which
  was the old single-cookie value and is retired in Task 5.2), and
  `clearSession(res)` clears both.
- **The access cookie's `Max-Age` must exceed the JWT TTL, not equal it.** If the
  access cookie expires _with_ the JWT (`Max-Age = expiresIn`), the browser drops
  it at expiry and the next `/api` call carries **no** cookie — Caddy attaches no
  bearer, PostgREST runs as `anon`, and an RLS-protected path can answer `403` or
  a `200` empty result, **not** the `401` the refresh-on-401 interceptor (Task 4.2)
  needs. Set the access `Max-Age` to `expiresIn` **plus a slack** (e.g. a couple
  of minutes) so an _expired-but-present_ JWT is still sent and PostgREST returns
  an unambiguous `401 jwt expired`, which reliably fires the silent refresh. (The
  durable refresh cookie's idle horizon is the real session lifetime; this slack
  only governs how the access bearer signals expiry.) The cookie names +
  `__Host-`/`Secure` come from a single env-derived helper
  (`COOKIE_SECURE === 'true'` → prod names + Secure); the `__Host-` prefix itself
  is wired in Phase 2 but the name helper is introduced here so 1.3's tests pin
  the dev shape. Export the **access-cookie name + reader** too, so the
  bearer-attach site can use it.
- **Reshape the generic plant, don't add a second one.** The existing
  `COOKIE_PLANT_PATHS` JSON-sniff plant (`index.ts:141-151`, fires on
  `/auth/token` + `/auth/verify` — the magic-link click-link exchange _and_ the
  OTP code-entry path) must call `plantSession` with **both** the access token
  and the refresh token from the GoTrue body, so a magic-link sign-in plants the
  dual cookie. Without this, the access token lands in the durable cookie name
  and `/api` 401s / boot-refresh fails — magic-link (R9) breaks. Mirror the same
  dual-cookie plant in the Vite dev proxy (`vite.config.ts` `proxyRes`).
- **Re-point the bearer-attach to the access cookie.** The `BEARER_AUTH_PATHS`
  read (`index.ts:83-86`, used by `/auth/user`) and its Vite mirror
  (`vite.config.ts:117-123`) must read the **access** cookie, not the durable
  one — the durable cookie now holds a refresh token, which GoTrue's `/user`
  would reject. Use the access-cookie reader from `cookies.ts`.
- New `auth-proxy/src/lib/session.ts`: `refresh(refreshToken)` calls GoTrue
  `POST /token?grant_type=refresh_token` and returns a typed three-way result:
  `ok` with `{ accessToken, refreshToken, expiresIn, user }`; `revoked` on a
  reuse/invalid/revoked-family response (authoritative); `unavailable` on a GoTrue
  5xx or unreachable upstream (transient — see the handler decision below for why
  these must not be conflated).
- `POST /auth/refresh` handler: read the durable refresh cookie; if absent →
  401 + clear. Call `refresh()`; on success re-plant both cookies and return a
  **tokenless 200 carrying the `user` payload** (no token fields) — so the web
  client's boot can adopt the user directly without a second `/auth/user`
  round-trip (this is the canonical answer to the earlier "200/204" ambiguity;
  Task 4.1 consumes it). On `revoked`/invalid → clear both cookies + 401. Never
  log the token (`docs/logging.md`).
- **Distinguish an authoritative revocation from a transient upstream failure —
  do not clear the durable cookie on a blip.** Only an authoritative GoTrue
  response (refresh token invalid / reuse-detected / revoked-family) clears the
  cookies + 401s. A GoTrue 5xx or an unreachable upstream (the existing handler's
  `fetch`-throws-`502` shape) must return a **non-clearing** error (e.g. 503) that
  leaves **both** cookies intact, so a momentary outage doesn't sign everyone out.
  This matters because boot now *always* refreshes (Task 4.1): a transient failure
  on cold start that cleared the durable cookie would force a needless re-auth, and
  a response lost *after* GoTrue already rotated could later trip reuse-detection
  into a spurious global revoke. So `session.ts`'s `refresh()` returns three
  outcomes — `ok`, `revoked` (authoritative → clear+401), `unavailable` (transient
  → 503, no cookie change) — not two.
- The browser never sees `grant_type` or any token — the handler owns the GoTrue
  translation (R5).
- **Routing:** `/auth/refresh` must reach the BFF in _both_ environments. Add
  `/auth/refresh*` to the Caddy `@gotrue` allow-list (`Caddyfile.prod:35`) — a
  path not on the list falls through to the SPA (`web:80`), so refresh would
  silently 404/serve HTML in prod. In dev, add a bespoke `/auth/refresh`
  middleware to the Vite proxy (it cannot forward to GoTrue:9999, which has no
  `/refresh`). **Allow-list ownership:** this task owns _only_ the `/auth/refresh*`
  add. The now-dead `/auth/session*` **drop** is owned by Task 1.4 (the task that
  renames logout), not here — do not touch it in 1.3. Each new endpoint's
  introducing task owns its own `@gotrue` entry; Task 5.2 is the final
  cross-check, not the place edits first land.

**Reference:** `auth-proxy/src/index.ts:96-166` (the existing fetch-to-GoTrue +
plant pattern to reshape); `auth-proxy/test/shim.test.ts` (the stub-GoTrue test
harness to reuse; its case (a) pins the single-cookie plant and must be
updated); `web/vite.config.ts:113-172` (the dev proxy mirror).

**Files:**

- `auth-proxy/src/lib/cookies.ts` (create)
- `auth-proxy/src/lib/session.ts` (create)
- `auth-proxy/src/index.ts` (modify — dual-cookie generic plant, access-cookie
  bearer-read, the `/auth/refresh` handler)
- `caddy/Caddyfile.prod` (modify — add `/auth/refresh*` to `@gotrue`)
- `web/vite.config.ts` (modify — dual-cookie plant, access-cookie bearer-read,
  bespoke `/auth/refresh` handler)
- `auth-proxy/test/cookies.test.ts` (create)
- `auth-proxy/test/refresh.test.ts` (create)
- `auth-proxy/test/shim.test.ts` (modify — case (a) now asserts dual cookies)

**Steps:**

1. RED — `cookies.test.ts`: `plantSession` sets both `cairn_session` (refresh)
   and `cairn_access` (access) with the right `Max-Age`s (durable ~30 d, access
   = `expiresIn` **+ slack**, strictly greater than `expiresIn`) and
   HttpOnly/SameSite; `clearSession` clears both with `Max-Age=0`. Run vitest;
   confirm red.
2. RED — update `shim.test.ts` case (a): `/auth/token` now plants **both**
   `cairn_session=<refresh_token>` and `cairn_access=<access_token>` (was a
   single `cairn_session=<access_token>`); `/auth/magiclink` still plants
   neither. Confirm red.
3. RED — `refresh.test.ts` against a stub GoTrue: (a) valid refresh cookie →
   stub returns new tokens → response re-plants both cookies, rotated refresh
   differs, body carries the **tokenless `user`** and **no** token; (b) no
   refresh cookie → 401, no GoTrue call; (c) stub returns a reuse/invalid
   (revoked-family) response → both cookies cleared + 401; (d) stub returns a 5xx
   (or is unreachable) → **503 with both cookies left intact** (transient, not a
   sign-out). Confirm red.
4. GREEN — implement `cookies.ts`, `session.ts`; reshape the generic plant to
   dual-cookie and re-point the `/auth/user` bearer-read to the access cookie in
   `index.ts`; add the `/auth/refresh` handler; add `/auth/refresh*` to the Caddy
   `@gotrue` allow-list; mirror all of it in the Vite dev proxy (dual plant,
   access-cookie bearer-read, bespoke `/auth/refresh` handler). Re-run vitest;
   confirm green.

**Verify:** `pnpm --dir auth-proxy test` · `pnpm --dir web check` · Caddy config
validate · `./scripts/check.sh` (lint/format/types).

### [ ] 1.4 Reshape sign-out into revocable `POST /auth/signout` (+ sign-out-everywhere)

**Created:** 2026-06-15T17:55:34Z
**Completed:**

**Why:** Sign-out today is a local cookie-clear that leaves the token valid
(`DELETE /auth/session`). It must revoke server-side (R4), and a global variant
must revoke all of the user's sessions for compromise-kill / future
password-change re-auth.

**Prerequisites:** Tasks 1.1 (logout-scope confirmed), 1.3 (`clearSession`,
session helpers exist).

**Decisions:**

- New `POST /auth/signout` (reshaping the current `DELETE /auth/session`
  local-clear): mint an access token from the durable refresh cookie if needed,
  call GoTrue `POST /logout` (`scope=local` by default), then `clearSession`.
  `POST /auth/signout?scope=global` (or a body flag) calls `/logout?scope=global`
  to revoke **all** the user's sessions. Always clear cookies even if the GoTrue
  call fails (explicit user intent wins — mirrors the current `signOut` finally).
- `LOGOUT_PATHS` in both `auth-paths.ts` copies changes `/auth/session` →
  `/auth/signout`; keep the dev Vite DELETE-shim and prod handler in step (the
  drift test guards the copies). Update the dev Vite shim to the new path/method.
- **Allow-list ownership (do both here, not later):** add `/auth/signout*` to the
  Caddy `@gotrue` allow-list **and** remove the now-dead `/auth/session*` entry in
  the same `Caddyfile.prod` edit. Both belong to this task — it is the one that
  renames logout. A missing `/auth/signout*` entry falls through to the SPA
  (`web:80`) → signout 404s in prod, and `caddy validate` (syntax-only) and the
  dev-stack e2e won't catch it; only Task 5.2's manual audit would. Add
  `caddy/Caddyfile.prod` to this task's Files (below).

**Reference:** `auth-proxy/src/index.ts:67-72` (the current DELETE clear);
`web/vite.config.ts:58-70` (the dev DELETE shim); `auth-paths.ts` `LOGOUT_PATHS`.

**Files:**

- `auth-proxy/src/index.ts` (modify)
- `auth-proxy/src/lib/session.ts` (modify — add `logout(refreshToken, scope)`)
- `web/src/lib/shared/model/auth-paths.ts` (modify — `LOGOUT_PATHS`)
- `auth-proxy/src/lib/auth-paths.ts` (modify — copy in lockstep)
- `caddy/Caddyfile.prod` (modify — add `/auth/signout*` to `@gotrue`, drop `/auth/session*`)
- `web/vite.config.ts` (modify — dev signout shim)
- `auth-proxy/test/signout.test.ts` (create)

**Steps:**

1. RED — `signout.test.ts` against a stub GoTrue: (a) `POST /auth/signout` calls
   GoTrue `/logout` (default scope) and clears both cookies (204); (b)
   `?scope=global` calls `/logout?scope=global`; (c) GoTrue `/logout` failing
   still clears both cookies. Confirm red.
2. RED — confirm the existing drift test (`auth-paths-drift.test.ts`) goes red
   after editing only one `auth-paths.ts` copy (proves the guard works), then
   make both copies match.
3. GREEN — implement `/auth/signout` + `logout()`; update both `auth-paths.ts`
   copies (`LOGOUT_PATHS` → `/auth/signout`), the dev Vite shim, and
   `caddy/Caddyfile.prod` (add `/auth/signout*` to `@gotrue`, drop the dead
   `/auth/session*`). Re-run; green.

**Verify:** `pnpm --dir auth-proxy test` · `./scripts/check.sh`.

## Phase 2 — cookie hardening + CSRF (R6, R7)

### [ ] 2.1 `__Host-` prefix (prod) for both cookies, env-derived names

**Created:** 2026-06-15T17:55:34Z
**Completed:**

**Why:** The durable + access cookies must use the `__Host-` prefix in prod
(forces Secure + Path=/ + no Domain, closing subdomain injection), while dev's
plain-HTTP localhost keeps the unprefixed names (R6).

**Prerequisites:** Task 1.3 (`cookies.ts` + the name helper exist).

**Decisions:**

- The cookie-name helper returns `__Host-cairn_session` / `__Host-cairn_access`
  iff `COOKIE_SECURE === 'true'`, else `cairn_session` / `cairn_access`. The
  `__Host-` prefix demands `Secure` + `Path=/` + no `Domain` — assert the
  attribute string satisfies all three in prod mode.
- Caddy + Vite read the cookie name from the same signal. In prod Caddy's
  `header_regexp` must match `__Host-cairn_access`; mirror the dev name in Vite.
  Update `caddy/Caddyfile.prod` access-cookie regex to the `__Host-` name.
- The web app never reads these cookies (HttpOnly), so no web-side name change.
- **Parity risk (R11):** the dual-cookie name + attribute logic now lives in two
  hand-maintained places — `auth-proxy/src/lib/cookies.ts` (prod) and the
  re-implementation in `web/vite.config.ts` (dev). The `auth-paths` drift guard
  cannot cover this: cookie behaviour is **computed logic** (the `__Host-` prefix
  derived from `COOKIE_SECURE`, the attribute string) in `cookies.ts`, not a
  literal const in the guarded `auth-paths.ts`, so widening the guard to string
  consts (Task 2.2, for `CSRF_HEADER`) does not reach it either; and the two
  packages can't easily deep-equal across the boundary. So pin the cookie contract
  two ways: (a) cross-reference comments in both files naming each other as the
  must-match sibling; (b) treat Task 5.1's real-stack cookie-contract assertions
  (both cookies present, names, HttpOnly, SameSite=Lax) as the **authoritative
  dev parity check** — note that dependency in Task 5.1.

**Reference:** `auth-proxy/src/lib/cookies.ts` (from 1.3); `auth-proxy/src/index.ts:31-34`
(`cookieAttrs` + `COOKIE_SECURE`); MDN `__Host-` prefix rules.

**Files:**

- `auth-proxy/src/lib/cookies.ts` (modify)
- `caddy/Caddyfile.prod` (modify — access-cookie regex to `__Host-` name)
- `auth-proxy/test/cookies.test.ts` (modify)
- `auth-proxy/test/shim.test.ts` (modify — its `sessionCookie()` helper + case (f))

**Steps:**

1. RED — extend `cookies.test.ts`: with `COOKIE_SECURE=true`, both cookies use
   the `__Host-` prefix and the attribute string includes `Secure; Path=/` and
   **no** `Domain`; with `COOKIE_SECURE` unset, names are unprefixed and not
   Secure. Confirm red.
2. RED — **fix the collateral break in `shim.test.ts`.** Its `sessionCookie()`
   helper matches `c.startsWith('cairn_session=')` (`shim.test.ts:65-69`) and
   case (f) (`:125-132`) plants under `COOKIE_SECURE=true` — once 2.1 prefixes the
   name to `__Host-cairn_session`, the helper returns `undefined` and case (f)
   throws. Make the helper prefix-aware (match `(?:__Host-)?cairn_session=`) and
   confirm case (f) asserts the `__Host-`-prefixed name + `Secure` under
   `COOKIE_SECURE=true`. Confirm red.
3. GREEN — implement the env-derived prefixing in `cookies.ts`; update the prod
   Caddyfile access-cookie regex. Re-run both test files; green.

**Verify:** `pnpm --dir auth-proxy test` · Caddy config validate · `./scripts/check.sh`.

### [ ] 2.2 CSRF: required custom header on state-changing `/auth/*`

**Created:** 2026-06-15T17:55:34Z
**Completed:**

**Why:** On top of `SameSite=Lax`, state-changing auth requests must carry an
explicit CSRF defence the BFF validates — a custom header a cross-origin attacker
cannot set without a preflight the BFF won't grant (R7).

**Prerequisites:** Task 1.3 (`/auth/refresh`), 1.4 (`/auth/signout`).

**Decisions:**

- New `auth-proxy/src/lib/csrf.ts`: `requireCsrf(req)` returns true iff the
  required custom header (`CSRF_HEADER` = `X-Cairn-Auth`, imported from
  `./auth-paths.js` — see the lockstep-registry decision below for where the name
  lives) is present. A state-changing `/auth/*` request (`/auth/refresh`,
  `/auth/signout`, and the 2003 `/auth/signin`/`/auth/register`) lacking it is
  rejected **403 before any side effect** (no GoTrue call, no cookie change).
- The header name is consumed in four places — the BFF (`auth-proxy/src/lib/csrf.ts`),
  the Vite mirror (`web/vite.config.ts`), and on the web side `auth-client.ts`
  _and_ `session.svelte.ts`. **Decided (do not re-litigate): put it in the existing
  drift-guarded web↔proxy lockstep registry and widen the guard to catch a
  divergence at build time** (chosen over a comment-only cross-reference because
  the BFF can't import across the package boundary and a silent drift, though
  fail-closed, should be a machine catch). Add `export const CSRF_HEADER =
  'X-Cairn-Auth'` to the canonical `web/src/lib/shared/model/auth-paths.ts`
  **and** its verbatim copy `auth-proxy/src/lib/auth-paths.ts` — the same
  byte-identical pair the drift test already compares. Broaden that file's purpose
  comment from "URL path lists" to "auth constants that must stay byte-identical
  across the web↔proxy boundary"; the header name is exactly such a constant. All
  consumers import `CSRF_HEADER` from their local `auth-paths` module — the web
  trio (`vite.config.ts`, `auth-client.ts`, `session.svelte.ts`, all of which may
  import `shared/model/`) from `shared/model/auth-paths`, and the BFF `csrf.ts`
  from `./auth-paths.js`. No literal is duplicated anywhere.
- **Widen the drift guard so the string const is actually protected.** The
  existing `auth-proxy/test/auth-paths-drift.test.ts` only parses **array**
  exports (its extractor regex matches `[...]`), so a bare string const would slip
  through unguarded. Generalize the extractor to also capture quoted
  string-literal const exports (`export const NAME = '...'`), and add `CSRF_HEADER`
  to the anchor assertion's expected-key list (`:33-41`, which currently hardcodes
  the five array names). Then a future edit that changes the header on one side
  only fails the build. Add the drift-test file and both `auth-paths.ts` copies to
  this task's Files.
- **No cross-origin CORS — verify it, don't just assume it.** The whole custom-header
  CSRF defence holds only because a cross-origin attacker can't set `X-Cairn-Auth`
  without a preflight the BFF won't grant. Assert that the BFF emits **no**
  `Access-Control-Allow-Origin` / `Access-Control-Allow-Headers` on the Cairn-shaped
  endpoints (including the `OPTIONS` preflight case), and that the GoTrue pass-through
  does not forward GoTrue's own CORS headers for those endpoints. If any such header
  is ever present the defence is void, so this is a load-bearing assertion, not
  hygiene.
- The magic-link pass-through endpoints (`/auth/magiclink`, `/auth/verify`,
  `/auth/token`) are GoTrue's own wire protocol kept alive for R9; the CSRF check
  applies to the **Cairn-shaped** BFF endpoints. Document which endpoints are in
  scope so 2003 inherits the rule.
- **Accepted exception — login-CSRF on the magic-link plant path.** `/auth/token`
  (and `/auth/verify`) establish a session from the _body's_ `refresh_token`, not
  the cookie, so `SameSite=Lax` does not protect them and they sit outside the
  CSRF check above. That leaves a residual **login-CSRF** vector (a cross-site
  auto-POST carrying the attacker's refresh token plants the attacker's session in
  the victim's browser). This is **deliberately accepted** for 2002: the path is
  GoTrue's retained magic-link surface (R9), it retires in 2003, and the alpha is
  small — recorded in `REQUIREMENTS.md` Non-requirements. R7's "every
  state-changing `/auth/*`" therefore means every _Cairn-shaped_ state-changing
  endpoint; the GoTrue pass-throughs are the named exception, not an oversight.
- The web auth-client sends the header on its state-changing calls (Phase 4); the
  dev Vite proxy enforces the same check for parity.

**Reference:** `docs/architecture.md` "JWT storage" (the narrowing discipline —
the CSRF check is a sibling narrowing); OWASP CSRF custom-header pattern.

**Files:**

- `auth-proxy/src/lib/csrf.ts` (create — `requireCsrf`; imports `CSRF_HEADER` from `./auth-paths.js`)
- `auth-proxy/src/index.ts` (modify — gate the Cairn-shaped endpoints)
- `web/src/lib/shared/model/auth-paths.ts` (modify — add `CSRF_HEADER`; broaden the purpose comment)
- `auth-proxy/src/lib/auth-paths.ts` (modify — copy `CSRF_HEADER` in lockstep)
- `auth-proxy/test/auth-paths-drift.test.ts` (modify — parse string consts; add `CSRF_HEADER` to the anchor)
- `web/vite.config.ts` (modify — mirror the check in dev; import `CSRF_HEADER` from `shared/model/auth-paths`)
- `auth-proxy/test/csrf.test.ts` (create)

**Steps:**

1. RED — `csrf.test.ts`: `POST /auth/refresh` and `POST /auth/signout` **without**
   the header → 403, no cookie change, no GoTrue call (assert the stub saw
   nothing); **with** the header → proceed normally. Add a CORS assertion: a
   cross-origin `OPTIONS` preflight (and the normal response) on the Cairn-shaped
   endpoints carries **no** `Access-Control-Allow-Origin` / `Access-Control-Allow-Headers`,
   and the pass-through does not forward GoTrue's CORS headers for them. Confirm red.
2. RED — widen `auth-paths-drift.test.ts`: generalize its extractor to also capture
   quoted string-literal const exports and add `CSRF_HEADER` to the anchor's
   expected-key list. Confirm it goes **red** when `CSRF_HEADER` is added to only
   one `auth-paths.ts` copy (proves the widened guard works), then make both copies
   match. Confirm red on `csrf.test.ts`.
3. GREEN — add `CSRF_HEADER = 'X-Cairn-Auth'` to both `auth-paths.ts` copies
   (broaden the purpose comment); implement `csrf.ts` importing `CSRF_HEADER` from
   `./auth-paths.js`, gate the Cairn-shaped endpoints in `index.ts`, mirror the
   check in the dev Vite proxy importing `CSRF_HEADER` from `shared/model/auth-paths`.
   Re-run; green.

**Verify:** `pnpm --dir auth-proxy test` · `pnpm --dir web check` · `./scripts/check.sh`.

## Phase 3 — Cairn-shaped surface + rate-limiting (R5, R8)

### [ ] 3.1 Define `/auth/signin` + `/auth/register` route skeletons behind the middleware

**Created:** 2026-06-15T17:55:34Z
**Completed:**

**Why:** R5's Cairn-shaped surface must exist as routes so the CSRF + rate-limit
middleware can be mounted and tested now; 2003 fills in the credential logic.
Defining the skeletons here (not in 2003) lets the rate-limit + CSRF guards be
proven against a real route.

**Prerequisites:** Tasks 2.2 (CSRF), 1.3/1.4 (the BFF shape).

**Decisions:**

- Add `POST /auth/signin` and `POST /auth/register` handlers that, for 2002,
  return a clear "not yet implemented" (e.g. 501) **after** passing through the
  CSRF + rate-limit guards — so the guards are exercised but no credential path
  is half-built. 2003 replaces the 501 body with the username+password logic.
- **Pin the identifier field in the `/auth/signin` body now.** The per-account
  rate-limit leg (Task 3.2) keys on an identifier from the request body, so even
  though the full credential is 2003's, this task fixes the field name as
  **`username`** in the `/auth/signin` JSON body. The 501 skeleton parses just
  enough to expose that field to the rate-limit middleware; 2003 adds `password`
  and the credential check.
- Add `/auth/signin*` + `/auth/register*` to the Caddy `@gotrue` allow-list
  (this task owns those entries) and add bespoke dev handlers to the Vite proxy
  (see dev-parity decision below). They are **bespoke** BFF handlers with their
  own plant — **not** generic narrowing targets, so they need **no**
  `auth-paths.ts` entry at all (none of the five existing lists —
  `PUBLIC_AUTH_PATHS`, `SIGNED_IN_REDIRECT_PATHS`, `BEARER_AUTH_PATHS`,
  `COOKIE_PLANT_PATHS`, `LOGOUT_PATHS` — semantically fits a 501 skeleton, and
  adding them to `COOKIE_PLANT_PATHS`/`BEARER_AUTH_PATHS` would wrongly trigger
  the generic plant/bearer). **So do not touch `auth-paths.ts` in this task** —
  the drift guard stays green untouched. If a genuine need for a _new_ array
  later surfaces, that change must also add `auth-proxy/test/auth-paths-drift.test.ts`
  to its Files and update the anchor assertion (the hardcoded expected-key list —
  by now the five arrays plus `CSRF_HEADER`, which Task 2.2 added) in the same
  task, or the build breaks.
- **Dev parity (R11):** mirror the two skeletons in the Vite dev proxy
  (`web/vite.config.ts`) as bespoke middleware — exactly as 1.3/1.4 do for
  `/auth/refresh` and `/auth/signout`. Without this, a dev `POST /auth/signin`
  falls through to GoTrue:9999 (no such route) → 404, and the CSRF + rate-limit
  middleware mounted on those routes is never exercised in dev. The dev mirror
  enforces the same CSRF check (missing header → 403) so dev and prod behave
  identically.
- Document the full intended BFF surface (`/auth/register|signin|signout|refresh`)
  in a header comment in `index.ts` so 2003 has the contract.

**Reference:** `auth-proxy/src/index.ts` (handler structure); `caddy/Caddyfile.prod:35`
(the `@gotrue` allow-list); `auth-paths.ts`.

**Files:**

- `auth-proxy/src/index.ts` (modify)
- `caddy/Caddyfile.prod` (modify — add `/auth/signin*` + `/auth/register*` to `@gotrue`)
- `web/vite.config.ts` (modify — bespoke dev handlers for the two skeletons + the
  mirrored CSRF check, so dev exercises the same routes as prod, per R11)
- `auth-proxy/test/shim.test.ts` or a new test (modify/create)
- (no `auth-paths.ts` edit — see Decisions; the bespoke endpoints take no list entry)

**Steps:**

1. RED — test: `POST /auth/signin` / `/auth/register` with the CSRF header →
   501 (skeleton) and the CSRF/rate-limit middleware ran; without the header → 403. Confirm red.
2. GREEN — add the skeleton handlers + Caddy allow-list entries (BFF) and the
   bespoke dev mirrors in `web/vite.config.ts`. Do **not** edit `auth-paths.ts`,
   so the drift test stays green untouched. Re-run; green.

**Verify:** `pnpm --dir auth-proxy test` · Caddy validate · `./scripts/check.sh`.

### [ ] 3.2 Per-IP + per-account sign-in rate-limiting with constant-shape failures

**Created:** 2026-06-15T17:55:34Z
**Completed:**

**Why:** Username + password is brute-forceable in a way magic-link was not, so
the BFF must throttle repeated sign-in failures per source IP **and** per account
identifier, and keep failures constant-shape (R8). The mechanism must exist
before the password surface (2003) does; it is built and proven here.

**Prerequisites:** Task 3.1 (the `/auth/signin` route to mount it on).

**Decisions:**

- New `auth-proxy/src/lib/rate-limit.ts`: an in-memory sliding-window / backoff
  keyed by **both** source IP and the account identifier carried in the sign-in
  request, plus `constantShapeFailure()` returning an identical error body+status
  regardless of which factor failed. Tunables (window, threshold, lockout) via
  env with sane defaults; document them.
- **What counts as a "failure" is an explicit signal from the handler, not any
  non-2xx.** The throttle increments only when the sign-in handler reports a
  *credential* failure (so 2003's real check decides what counts), **not** on every
  non-2xx. In particular the 2002 `/auth/signin` skeleton returns **501** (Task 3.1),
  which is **not** a failure and must **not** increment any bucket — otherwise the
  skeleton self-throttles. The unit tests drive a stub handler that can report
  success / credential-failure on demand to exercise the throttle; mounting it on
  the live skeleton (still 501 in 2002) only proves the middleware is wired.
- **In-memory state is per-process and resets on restart/deploy — a known, accepted
  limitation at single-instance alpha.** A container restart or redeploy clears all
  per-IP / per-account backoff, so this is brute-force *friction*, not durable
  protection; it is sound only because the auth-proxy runs as a single instance.
  Record this in a comment so it isn't later mistaken for persistent throttling (a
  shared/persistent store is a follow-up if the BFF is ever scaled out).
- **Pin the identifier field now (needed for the per-account key).** The
  per-account leg can't key on anything until the `/auth/signin` body has a
  defined identifier field, but the credential body is otherwise 2003's. So this
  task (with 3.1) fixes the field name as **`username`** in the `/auth/signin`
  JSON body — enough for the rate-limit key and the constant-shape failure tests
  — and 2003 fills in the password + the real credential check alongside it.
  Missing/blank `username` keys only the per-IP leg (no per-account bucket).
- **Trusted client IP, not a spoofable header.** The BFF sits behind Caddy
  (`reverse_proxy auth-proxy:3002`), so a raw `X-Forwarded-For` is
  attacker-controllable — reading it naively would let an attacker rotate the
  header to evade the per-IP limit and poison/spoof arbitrary IP buckets. Derive
  the client IP **only** from the value Caddy itself sets (express `trust proxy`
  configured to the single Caddy hop, or a Caddy-set `X-Real-IP`), never a
  forwarded header the BFF didn't originate. Caddy must be confirmed to forward a
  trustworthy client IP (Task 5.2).
- **Per-account backoff must not be a weaponizable lockout.** Usernames are
  public (R1), so a hard temporary account lockout lets an attacker deny any
  named victim sign-in by spamming failures from many IPs. Make the per-account
  leg a **graded backoff** (escalating delay / soft throttle that still lets a
  correct credential through), not a hard denial — or gate the hard lock on
  repeated _same-IP_ failure. The per-IP leg stays the primary brute-force bound.
- Fully unit-test the middleware against a **stub sign-in handler** (no password
  credential needed): N failures from one IP → throttled; N failures for one
  account from varied IPs → graded/throttled; a client-supplied `X-Forwarded-For`
  is **ignored** (the trusted Caddy value wins); a legitimate credential still
  succeeds for an account under attack from _other_ IPs; a success resets/!counts;
  the failure response shape is byte-identical across "wrong credential" vs
  "unknown account" simulations. Mount it on the `/auth/signin` skeleton from 3.1.
- 2003 attaches the real username+password check behind this middleware; the
  per-username keying completes then. Note this boundary in a comment.
- **Dev-parity stance (R11) — deliberate exception.** The rate-limiter is a
  Node/Express BFF protection, fully unit-tested here; it is **not** mirrored into
  the Vite dev proxy (reimplementing the sliding window + per-IP/per-account state
  in `vite.config.ts` for a 501 skeleton is not worth it). The dev `/auth/signin`
  mirror (Task 3.1) reproduces the _route_ and the _CSRF_ gate so dev/prod paths
  match; the throttle itself stays prod/BFF-only. Record this as a conscious
  parity exception so it doesn't read later as a missed mirror.
- Keep identifiers/IPs out of logs beyond what `docs/logging.md` allows (hashes
  only).

**Reference:** `docs/logging.md` (no raw identifiers in logs); `REQUIREMENTS.md`
R8; `PLAN.md` "rate-limiting … land as proven middleware now".

**Files:**

- `auth-proxy/src/lib/rate-limit.ts` (create)
- `auth-proxy/src/index.ts` (modify — mount on `/auth/signin`)
- `auth-proxy/test/rate-limit.test.ts` (create)

**Steps:**

1. RED — `rate-limit.test.ts`: per-IP throttle after the threshold; per-account
   graded backoff across IPs; a client-supplied `X-Forwarded-For` is ignored in
   favour of the trusted Caddy-set IP; a correct credential still succeeds for an
   account under attack from other IPs; success resets; constant-shape failure
   body identical for two distinct simulated failure causes. Confirm red.
2. GREEN — implement `rate-limit.ts` + `constantShapeFailure()` with the trusted
   client-IP derivation and graded per-account backoff, mount on the
   `/auth/signin` skeleton. Re-run; green.

**Verify:** `pnpm --dir auth-proxy test` · `./scripts/check.sh`.

## Phase 4 — web client + session model + dev parity (R2, R9, R11)

### [ ] 4.1 Reshape `auth-client.ts` + session boot for the revocable model

**Created:** 2026-06-15T17:55:34Z
**Completed:**

**Why:** The web client must call the BFF's Cairn-shaped endpoints (refresh,
signout, sign-out-everywhere) with the CSRF header, and boot must refresh-then-
check because a short-lived access cookie may be expired while the durable
refresh cookie is still valid (R2, R9).

**Prerequisites:** Tasks 1.3 (`/auth/refresh`), 1.4 (`/auth/signout`), 2.2 (CSRF
header name).

**Decisions:**

- **The CSRF header name has a shared home, added in Task 2.2.** `CSRF_HEADER =
  'X-Cairn-Auth'` lives in `web/src/lib/shared/model/auth-paths.ts` (the
  drift-guarded web↔proxy lockstep registry). `session.svelte.ts` lives in the
  `shared/` tier and **cannot import from the `auth/` domain**
  (`docs/frontend-layout.md` one-way tier rule), but `auth-paths` is in
  `shared/model/`, so both `session.svelte.ts` and `auth-client.ts` import
  `CSRF_HEADER` from it. Never a bare literal duplicated across files. Web↔proxy
  lockstep is enforced by the drift guard, which Task 2.2 widened to cover string
  consts — so a divergence fails the build.
- **A single shared in-flight `refresh()` — never a per-caller refresh.** With
  rotation + reuse detection, two concurrent refreshes would replay a rotated
  token and can revoke the whole family (false global sign-out). So the refresh
  primitive must dedupe concurrent callers behind one shared promise, exactly as
  `bootSession` already shares `bootPromise`. **Note its limit:** single-flight
  dedupes only _within one JS realm_ — two browser tabs / a PWA-window + a tab
  cannot share a promise, so a concurrent cross-tab boot-refresh is guarded
  **only** by the GoTrue reuse interval (Task 1.2), not by this. That is why the
  interval must be sized to cover multi-tab boot skew, not set "small". Put this
  single-flight `refresh()`
  in the `shared/` tier (importable by `shared/state/session.svelte.ts`,
  `shared/http/postgrest.ts`, _and_ the `auth/` domain) so boot, the `/api`
  401-interceptor (Task 4.2), and `auth-client` all await the _same_ in-flight
  request. It POSTs `/auth/refresh` with the CSRF header and resolves to the
  tokenless `user` the BFF returns (Task 1.3). `auth-client.ts` delegates to it
  (auth → shared import is allowed).
- `auth-client.ts`: reshape `logout()` → `signOut()` (POST `/auth/signout`) and
  add `signOutEverywhere()` (POST `/auth/signout?scope=global`); the magic-link
  callback's session-establish posts the refresh token to the BFF (R9). Add the
  CSRF header (from the shared constant) to every state-changing call. `AuthUser`
  stays `{ id, email }` — 2003 adds `username` and relaxes `assertAuthUser`;
  **do not** change it here.
- `session.svelte.ts` `bootSession()`: call the shared `refresh()` first; on
  success adopt the `user` it returns directly → signed-in (**no** separate
  `/auth/user` fetch — that round-trip is removed, which also sidesteps having to
  re-derive the access bearer for `/auth/user`); on an **authoritative 401** →
  signed-out. On a **transient** outcome (the handler's 503, a network error, any
  non-401 failure — see Task 1.3, which makes `/auth/refresh` return 503 not 401
  on a GoTrue blip) **do not** force signed-out: leave the status `unknown` (the
  current "unknown"-guard branch already does this) so a momentary outage on cold
  start doesn't bounce a validly-signed-in user to sign-in. Signed-out is reserved
  for an authoritative revocation.
  `signOut()` posts `/auth/signout` (CSRF header from the shared constant) then
  forces signed-out in `finally` (preserve the current "explicit intent wins").
- Keep the existing magic-link request/verify/callback components working
  (R9) — only the session-establish + signout endpoints reshape.
- **The callback page needs little or no behavioural change.** It *already*
  establishes the session via the BFF — `exchangeRefreshToken(refreshToken)` POSTs
  `/auth/token?grant_type=refresh_token`, a `COOKIE_PLANT_PATHS` path R9 keeps
  alive, and Task 1.3 makes that generic plant set **both** cookies. So `+page.svelte`
  is not reshaped onto a new endpoint; the only delta is that the `await bootSession()`
  it already calls now does a `/auth/refresh` first (a no-op 401 on the callback,
  since no durable cookie exists yet). Do **not** invent a new callback flow. Update
  `page.test.ts` for the boot-refresh interaction; touch `+page.svelte` only if the
  boot-refresh ordering surfaces a concrete need.

**Reference:** `web/src/lib/auth/model/auth-client.ts` (functions:
`exchangeRefreshToken`, `logout`, `verifyOtp`, `sendMagicLink`);
`web/src/lib/shared/state/session.svelte.ts` (`bootSession`, `signOut`,
`assertAuthUser`); the Explore map in this plan's PLAN.md Architecture.

**Files:**

- `web/src/lib/shared/model/auth-paths.ts` (`CSRF_HEADER` added in Task 2.2 —
  import it; do not re-add)
- `web/src/lib/auth/model/auth-client.ts` (modify)
- `web/src/lib/auth/model/auth-client.test.ts` (modify)
- `web/src/lib/shared/state/session.svelte.ts` (modify — add the single-flight
  `refresh()`; boot adopts its `user`; `signOut()` posts `/auth/signout`)
- `web/src/lib/shared/state/session.test.ts` (modify)
- `web/src/routes/auth/callback/+page.svelte` (modify only if the boot-refresh
  ordering needs it — session-establish already goes via the BFF; see Decisions)
- `web/src/routes/auth/callback/page.test.ts` (modify — boot-refresh interaction)

**Steps:**

1. RED — session tests: the shared `refresh()` POSTs `/auth/refresh` with the
   CSRF header (from the shared constant) and adopts the tokenless `user`;
   **concurrent callers share one in-flight request** (N parallel `refresh()`
   calls → exactly one `/auth/refresh` fetch); `bootSession()` refreshes →
   signed-in on success (using the returned `user`, no `/auth/user` call),
   signed-out when refresh **401s authoritatively**, and **stays `unknown` (not
   signed-out) on a transient 503/network failure**. Confirm red.
2. RED — auth-client tests: `signOut()` / `signOutEverywhere()` POST the right
   path/scope with the CSRF header; `auth-client`'s refresh delegates to the
   shared single-flight `refresh()`. Confirm red.
3. GREEN — import `CSRF_HEADER` from `shared/model/auth-paths` (added in Task 2.2),
   implement the single-flight `refresh()` in `session.svelte.ts`, the client +
   boot changes, and the callback adjustment. Re-run vitest; green. Keep
   `AuthUser` requiring `email`.

**Verify:** `pnpm --dir web test` · `pnpm --dir web check` · `pnpm --dir web lint`.

### [ ] 4.2 `/api` 401-retry-via-refresh interceptor + dev-proxy parity

**Created:** 2026-06-15T17:55:34Z
**Completed:**

**Why:** With short-lived access cookies, an `/api` call will 401 when the access
cookie expires; the client must silently refresh once and retry so the user isn't
bounced to sign-in every few minutes (R2). The dev Vite proxy must mirror the BFF
so dev and prod behave identically (R11).

**Prerequisites:** Task 4.1 (`refresh()` exists); Tasks 1.3/1.4/2.2 (BFF
endpoints + CSRF mirrored in Vite already, per their dev-parity steps).

**Decisions:**

- The shared `/api` fetch wrapper is `web/src/lib/shared/http/postgrest.ts`
  (its `request()` already calls `onUnauthorized()` on a 401). On a 401 from
  `/api`, call the **shared single-flight `refresh()`** from
  `session.svelte.ts` (Task 4.1) — **not** a fresh per-call refresh — then retry
  the original request **once**; if refresh fails, fall through to
  `onUnauthorized()` (signed-out). Guard against infinite loops (single retry;
  refresh failure is terminal). This relies on the expired access bearer
  producing a **401**: Task 1.3 sizes the access cookie's `Max-Age` to outlive the
  JWT so the (expired) bearer is still sent and PostgREST returns `401 jwt
expired`, rather than the cookie vanishing and the request silently running as
  `anon`. If a path is ever found to answer `403`/`200`-empty on an expired
  bearer instead of `401`, that path needs the same refresh trigger — note it. Because `refresh()` is single-flight, a burst of
  simultaneous `/api` 401s collapses to one `/auth/refresh`, so rotation +
  reuse-detection can't read concurrent retries as token theft and revoke the
  family (the `GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL` set in Task 1.2 is
  the additional backstop).
- **Avatar writes need the same retry.** Avatar writes use raw `fetch`, not the
  `/api` wrapper — `POST /avatars` and `DELETE /avatars/me` in
  `routes/(app)/profile/+page.svelte` and `DELETE /avatars/me` in
  `account/components/DeleteAccountScreen.svelte`. With a 5-minute access cookie
  they 401 after an idle period with no silent refresh, so an upload fails
  unexplained. Factor a small shared bearer-write helper (single-flight
  refresh-on-401-retry-once) at `shared/http/bearer-write.ts` and route the
  avatar-write sites through it, so they get the same recovery as `/api`.
- Confirm the Vite dev proxy already mirrors `/auth/refresh`, `/auth/signout`,
  the dual-cookie plant, and the CSRF check (added in their Phase 1/2 dev-parity
  steps); if any is missing, add it here so dev exercises the same flow.

**Reference:** `web/src/lib/shared/state/session.svelte.ts` (`onUnauthorized`,
the single-flight `refresh()`); `web/src/lib/shared/http/postgrest.ts` (the
`/api` wrapper, `request()`); `web/vite.config.ts` (the dev proxy to keep in
parity).

**Files:**

- `web/src/lib/shared/http/postgrest.ts` (modify — 401 → shared refresh + retry)
- `web/src/lib/shared/http/postgrest.test.ts` (modify)
- `web/src/lib/shared/http/bearer-write.ts` (create — shared refresh-on-401 retry
  for raw bearer writes) + `web/src/lib/shared/http/bearer-write.test.ts` (create)
- `web/src/routes/(app)/profile/+page.svelte` (modify — avatar writes via the helper)
- `web/src/lib/account/components/DeleteAccountScreen.svelte` (modify — avatar delete via the helper)
- `web/vite.config.ts` (modify — fill any remaining dev-parity gap)

**Steps:**

1. RED — `postgrest.test.ts`: a 401 from `/api` triggers exactly one (shared)
   `refresh()` then one retry; on retry success the result resolves; on refresh
   failure `onUnauthorized` fires and no second retry happens; N concurrent 401s
   produce exactly one `/auth/refresh`. Helper test: a raw bearer write that 401s
   refreshes once and retries once. Confirm red.
2. GREEN — implement the `/api` interceptor against the shared `refresh()`, the
   bearer-write helper, and route avatar writes through it; close any dev-proxy
   parity gap. Re-run; green.

**Verify:** `pnpm --dir web test` · `pnpm --dir web check` · `pnpm --dir web lint`.

## Phase 5 — e2e + prod-facing close (R9, R10, R11)

### [ ] 5.1 Playwright: silent refresh, revocable sign-out, sign-out-everywhere

**Created:** 2026-06-15T17:55:34Z
**Completed:**

**Why:** The revocable model's user-visible behaviours — staying signed in across
access-token expiry, sign-out actually revoking, and "sign out everywhere"
killing other sessions — must be proven against the real stack (R9, R10, R11).

**Prerequisites:** Phases 1–4 merged into the sub-branch; local stack up.
(Playwright is machine-conditional — chromium + firefox on the work box; if it
can't run here, say so explicitly per the testing rules.)

**Decisions:**

- Extend `web/e2e/auth.spec.ts` (the existing real-stack magic-link suite):
  (a) sign in via magic-link, assert **both** cookies present (durable
  `__Host-`/`cairn_session` refresh + `cairn_access`), HttpOnly + SameSite=Lax.
  This cookie-contract assertion is the **authoritative dev/prod cookie-parity
  check** (Task 2.1 parity-risk note) — it runs against the real dev stack and
  catches a Vite proxy that drifted from `cookies.ts`;
  (b) **simulate access-cookie expiry** by **overwriting** `cairn_access` with an
  expired-but-well-formed JWT (right name, valid JWT shape, `exp` in the past),
  **not** by deleting it. This is load-bearing: with `PGRST_DB_ANON_ROLE=anon`, a
  request carrying **no** bearer runs as `anon` and a select returns `200 []`, which
  never fires the refresh-on-401 interceptor — so deleting the cookie tests the wrong
  path and can false-green. An expired-but-present bearer is what makes PostgREST
  return `401 jwt expired` (the exact path Task 1.3's `Max-Age`-slack and Task 4.2's
  interceptor depend on). After the action hits `/api`, assert the user stays signed
  in (the silent `/auth/refresh` + retry fires and a fresh `cairn_access` appears) —
  overwriting avoids waiting out the 5-min TTL while still exercising the real 401;
  (c) sign out → both cookies cleared and a subsequent `/api` call is
  unauthorized; (d) "sign out everywhere" from one context invalidates a second
  signed-in context (its next refresh 401s).
- Do not assert on token contents (HttpOnly; and `docs/logging.md` discipline) —
  assert on cookie presence/absence and signed-in/out UI state.

**Reference:** `web/e2e/auth.spec.ts` (the magic-link happy-path + cookie-contract
assertions to extend); `docs/testing.md` (Playwright layer; machine-conditional).

**Files:**

- `web/e2e/auth.spec.ts` (modify)

**Steps:**

1. RED — add the four scenarios; run against the stack; confirm they fail before
   the implementation is wired end-to-end (or confirm they pass if Phases 1–4 are
   already merged — note which, and that the assertions exercise the new paths).
2. GREEN — fix any integration gaps surfaced; get all green.
3. If Playwright cannot run in this environment, **say so explicitly** and do not
   claim a pass.

**Verify:** `cd web && pnpm test:e2e` (or `./scripts/check.sh --e2e`).

### [ ] 5.2 Prod-facing close: confirm compose/Caddy/.env align + document the forced re-auth

**Created:** 2026-06-15T17:55:34Z
**Completed:**

**Why:** 2002 changes the live `auth-proxy`, the cookies, the Caddyfile, and
GoTrue config; before merge, the prod overlay must be coherent and the
deploy-time forced re-auth (R10) documented for the operator.

**Prerequisites:** Tasks 1.2, 1.3, 1.4, 2.1, 3.x merged on the sub-branch.

**Decisions:**

- Walk `docker-compose.yml` + `docker-compose.prod.yml` + `caddy/Caddyfile.prod`
  - `.env.prod` (per `docs/deployment.md`) and confirm: GoTrue rotation + lowered
    JWT_EXP apply in prod; the access-cookie `__Host-` name matches the Caddy
    regex; the `/auth/*` allow-list includes the new endpoints (`/auth/refresh`,
    `/auth/signout`, `/auth/signin`, `/auth/register`) and drops the dead
    `/auth/session*`; any new BFF env (CSRF header name, rate-limit tunables) is
    present with prod-safe defaults.
- **Retire the stale `COOKIE_MAX_AGE`.** `docker-compose.prod.yml:63` still sets
  `COOKIE_MAX_AGE: "604800"` (7 d) — the old single-cookie value. Task 1.3 settled
  that `cookies.ts` hardcodes the durable ~30 d idle horizon and does **not** read
  this env (the access cookie tracks `expiresIn`), so the env is simply dead:
  **remove it.** (No "or set it to ~30 d" branch — 1.3 already decided `cookies.ts`
  doesn't read it.)
- **Confirm Caddy forwards a trustworthy client IP** to the auth-proxy so the
  rate-limiter's per-IP key (Task 3.2) is sound and not driven by a spoofable
  `X-Forwarded-For`.
- Document the **forced re-auth** in `docs/deployment.md`: on deploy, existing
  `cairn_session`-only clients are bounced to sign-in (structural — the `__Host-`
  rename + access-cookie re-point, no purge needed). Note any one-time
  user-facing message if warranted; the alpha is small.
- Re-confirm the pre-deploy auth checklist (0.2) reads correctly for the shipped
  state.

**Reference:** `docs/deployment.md` (prod compose, Caddyfile, `.env.prod`,
pre-deploy checklist); `caddy/Caddyfile.prod`; the compose overlays.

**Files:**

- `docs/deployment.md` (modify)
- `docker-compose.prod.yml` (modify if a prod-only override is needed)

**Steps:**

1. Audit the prod overlay for coherence (per Decisions); fix any drift.
2. Document the forced re-auth + any operator note in `docs/deployment.md`.
3. Run the full gauntlet including e2e.

**Verify:** `docker compose -f docker-compose.yml -f docker-compose.prod.yml config`
(prod overlay valid) · `./scripts/check.sh --e2e`.
