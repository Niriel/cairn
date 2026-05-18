# Plan: Auth + HTTP client

How we land master-plan step 3: the magic-link auth surface
(LoginRequest, LoginCheck, callback), the session store and route
guard that decide who sees what, a thin PostgREST wrapper, the dev
login shortcut, and the GoTrue + Vite-proxy wiring that joins it all.

## Context

Steps 1 (DB foundation) and 2 (web foundation primitives) are merged.
The schema's `tg_profile_on_signup` trigger
(`db/migrations/0004_domain_schema.sql:272`) is ready: every insert
into `auth.users` synchronously seeds a `profiles` row (with
`display_name = 'New user'`) and a `user_settings` row (with
`invite_policy = 'everybody'`), skipping the tombstone UUID. The
Vite cookie→bearer shim is wired (`web/vite.config.ts:1-71`) — its
`proxyRes` handler sniffs `access_token` from any 2xx JSON body on
the `/auth/*` proxy and emits the `cairn_session` HttpOnly cookie.
Step 2 also shipped the primitives we lean on here:
`web/src/lib/basic/components/Button.svelte`,
`web/src/lib/shared/components/{TopBar,Snackbar,CairnGlyph,CairnWordmark}.svelte`,
and the `pushHistoryGuard` back-stack utility.

What's missing: every user-facing surface. The web app has no auth
screens, no session state, no PostgREST client. Step 4 (MVP product
surface) immediately needs all four, so the boundary between Step 3
and Step 4 is "the user can log in and the layout knows they're
logged in." `docs/development.md:225-227` and `docs/development.md:249`
explicitly defer the dev seed and the `VITE_DEV_LOGIN_SHORTCUT` knob
to this step.

Three architectural constraints shape the design:

- **HttpOnly cookie, no JS-readable token.** `docs/architecture.md:139`
  picks the cookie over `localStorage` for the safety it buys against
  a compromised dependency. The JWT is never visible to the web app's
  JavaScript; the Vite proxy (Caddy in prod) handles the cookie ↔
  bearer translation.
- **Static-adapter SvelteKit.** No server-side load runs at request
  time, so `+layout.ts` cannot `redirect()`. The route guard lives in
  `+layout.svelte` with a reactive `$effect`.
- **Three-tier `lib/` layout.** `docs/frontend-layout.md:41-43`:
  `shared/` cannot import from per-domain folders. The session store
  is consumed by `+layout.svelte` (cross-cutting) and the PostgREST
  wrapper in `shared/http/` — so the store lives in `shared/state/`,
  not `auth/state/`. Only the screens (LoginRequest, LoginCheck) and
  the GoTrue-specific HTTP helpers stay in the `auth/` domain folder.

The Vite dev-server proxy is the single subtle piece. Today the
`/auth` proxy entry forwards every `/auth/*` request to GoTrue. The
callback URL the docs commit to — `https://cairn.<domain>/auth/callback`
(`docs/ui.md:148`, `docs/architecture.md:228`) — is a page the user's
browser navigates to from the email, not a GoTrue endpoint. We need
the proxy to forward only the GoTrue API paths and let SvelteKit
serve the page routes.

## Decisions

**Vite proxy split via `bypass`, not separate proxy keys.** Vite's
`proxy` config supports a `bypass(req)` callback that, when it
returns a string, treats the request as resolved by SvelteKit
instead of forwarded. A single `/auth` entry with `bypass` is much
smaller than three separate entries per GoTrue endpoint, and adding
a new GoTrue call later doesn't require touching the proxy table.
The bypass list is the closed set of page routes
(`/auth/login`, `/auth/check`, `/auth/callback`) — everything else
under `/auth/*` is GoTrue. (R10)

**Preserve the pre-rewrite URL for `proxyReq` / `proxyRes`
narrowing.** Vite's `rewrite: (p) => p.replace(/^\/auth/, '')`
mutates `req.url` *before* `proxy.web(req, res)` runs, so by the
time the `proxyReq` and `proxyRes` event handlers fire, `req.url`
has been stripped to `/user`, `/verify`, `/token?…`. The new
narrowing predicates (`isSegmentMatch(req.url,
BEARER_AUTH_PATHS)`, `…COOKIE_PLANT_PATHS`) expect the
pre-rewrite `/auth/...` form because they share their constants
with R7's route guard and the `bypass` callback. The fix is a tiny
**pre-proxy middleware** registered through a `cairn-auth-shim`
plugin's `configureServer(server)` hook: it stamps
`(req as any).cairnOriginalUrl = req.url` for `/auth/*` requests
before Vite's proxy middleware runs, and the proxyReq/proxyRes
handlers consult `cairnOriginalUrl ?? req.url`. The same plugin
hosts the Task 1.5 `DELETE /auth/session` short-circuit, so one
plugin owns all dev-only auth shims. The `bypass` callback is
unaffected — Vite invokes `bypass` *before* `rewrite`. (R10)

**`DELETE /auth/session` as a `configureServer` middleware, not in the
proxy `configure`.** The cookie-clearing logout endpoint is Cairn's
own — not a GoTrue API — so it doesn't belong inside the proxy
response handler. A small Vite plugin with `configureServer(server)
{ server.middlewares.use('/auth/session', …) }` is the cleanest
short-circuit and matches what the production Caddy block will look
like. (R5, R10)

**Custom thin PostgREST wrapper, no `@supabase/postgrest-js`.** The
surface Step 4 needs is small: `select`, `insert`, `update`, `delete`,
`rpc`. Cairn's guiding principle is "the simplest thing that works"
(`docs/architecture.md`), the upstream client carries a Supabase-
shaped abstraction we don't need, and writing the wrapper ourselves
costs ~40 lines plus a test file. The wrapper does only what's
specific to Cairn: cookie-bearing fetch, 401 → session reset, typed
PostgREST error parsing. (R6)

**Typed `HttpError` on the auth client too, matching the PostgREST
wrapper.** Task 3.1 originally landed `auth-client.ts` throwing
plain `new Error(message)` on non-2xx, deferring the
inline-vs-snackbar split to "the runtime caller catches and routes."
The runtime caller — `LoginRequest` (R1, Task 3.2c) — has no signal
to route on when every rejection is the same `Error` class. The fix
is symmetric with R6's `AuthError` / `ApiError`: export a small
`HttpError extends Error { status: number }` from
`auth/model/auth-client.ts` and throw it from every non-2xx branch.
The screen then classifies on `err instanceof HttpError && status
in [400,500)` → inline error vs everything else → Snackbar; real
`fetch` network failures stay `TypeError` and fall through the
"else" branch naturally, which gives 5xx and network the same UX
without conflating them at the source. The class lives in
`auth/model/` not `shared/http/` because it carries GoTrue-shaped
semantics; PostgREST's typed errors carry PostgREST-shaped fields
(`code`, `details`, `hint`) and aren't a fit. Lands as Task 3.1b
ahead of Task 3.2c, which depends on it. (R15)

**Explicit `setSignedIn(user)` entrypoint, distinct from `bootSession`.**
Boot's success branch is guarded to only write from `unknown` so a
user-initiated `signOut()` wins over an in-flight boot. That guard
breaks a different flow: by the time a callback or dev-shortcut
sign-in lands, boot has already resolved (typically to `signed-out`,
since the cookie wasn't set at first paint) and the layout is still
mounted, so re-invoking `bootSession()` from the callback would
no-op against the guard. Adding a third store entrypoint — a synchronous
`setSignedIn(user)` that transitions any non-signed-out state to
`signed-in` — is the cleanest way to keep boot's race-safe guard *and*
let same-tab sign-ins land. The callback and the dev shortcut both
call it before `goto('/')`. (R3, R4, R8)

**Block render on `session.status === 'unknown'`.** The session boot
fetch takes ~5ms in dev. A skeleton flashes for that window and then
re-renders into either content or the login page; the re-render is
the jarring transition for users on a fast connection. Block-render
with a centered `CairnWordmark` makes the boot a single "blank →
resolved" transition. The pattern locks in here so Step 4 inherits
it without having to reason about it. (R7)

**Defer refresh-token rotation; bump `GOTRUE_JWT_EXP` to 7 days.**
GoTrue's default 1-hour JWT is too short for any reasonable "remember
me" UX. Two ways to extend the session: (a) raise the JWT lifetime,
(b) plumb the `refresh_token` returned alongside `access_token`
through the cookie and add a retry path on 401. Option (b) is the
correct long-term answer but requires a careful design (separate
cookie? combined? rotation on every refresh? CSRF on the refresh
endpoint?), so it's out of scope for Step 3. Option (a) is one env-
var change, and 7 days is long enough that dev sessions don't expire
during a day's work. The aspirational "~30-day Max-Age" in
`docs/architecture.md:252` gets edited to reflect the interim value;
the doc commitment to 30 days lands fully with rotation later. (R11,
Non-requirements)

**Dev seed via GoTrue HTTP + `psql` UPDATE, not pure SQL.**
`db/seed/dev_seed.sql` is currently a no-op precisely because GoTrue
has version-dependent NOT NULL columns on `auth.users` that a bare
`INSERT` can't satisfy reliably (`db/seed/dev_seed.sql:9-13`). The
right shape is to make GoTrue's signup endpoint create the auth row
(it knows its own schema), then update the public `display_name` in
SQL. Two-step but each step does what it's good at. Idempotency
comes from GoTrue returning 422 "already registered" on rerun and
`UPDATE` being naturally idempotent. (R9)

**Use unique per-test emails (`alice+${testId}@example.test`) for
Playwright.** With `fullyParallel: true` (`web/playwright.config.ts:15`)
and three browser projects, mailbox messages race. GoTrue treats
`alice+x@…` and `alice+y@…` as distinct users (no plus-tag merging),
so unique emails give each test its own GoTrue identity AND its own
Mailpit message stream. Alternative: `test.describe.configure({ mode:
'serial' })`. Unique emails are cheaper and don't bottleneck the
suite. (R12)

**Pass the pending email between `LoginRequest` and `LoginCheck`
via a module-scoped in-memory store, not the URL.** The obvious
implementation — `goto('/auth/check?email=' + encodeURIComponent(email))`
— widens the email's exposure to every channel the URL touches:
browser history, address bar, Referer header on outbound links,
shoulder-surf, browser-sync to other devices, bookmarks, share
sheets. `docs/logging.md:21` strips query strings server-side, but
the client side is unguarded. Cairn's stance on email privacy is
strict ("user-visible fields must not be derived from
`auth.users.email`", per `feedback_email_privacy.md`); a URL-borne
email widens the channel beyond the user's deliberate typing.
The minimal alternative is a runes module under
`auth/state/pending-login.svelte.ts` — write on submit, read on
the `/auth/check` route file, fall back to a redirect when empty.
This keeps the email in the same process the user just typed it
into, without introducing `sessionStorage` (extension-readable,
inspector-visible) or `history.state` (one more SvelteKit-API
detail to mock in tests). A stale bookmarked `/auth/check` shows
no email and redirects to `/auth/login` — a privacy *feature*,
not a regression. (R1, R2, R14)

**Components in `auth/`, store and HTTP wrapper in `shared/`.**
`docs/frontend-layout.md:41-43` forbids `shared/` from importing
domain folders. The route guard and the PostgREST wrapper both call
into the session store, so the store cannot live in `auth/`. The
screens are auth-specific UI and live in `auth/components/`. The
GoTrue-specific HTTP helpers (`sendMagicLink`, `verifyToken`,
`devPasswordSignIn`, `logout`) live in `auth/model/auth-client.ts`;
they're consumed only by the auth screens and the session-store boot.

## Architecture

### New files

- **`web/src/lib/auth/components/LoginRequest.svelte`** — the
  magic-link request screen (R1). Plus `.test.ts`. No `__mocks__/`
  entry: per `.claude/skills/writing-tests.md` the colocated mock
  earns its keep only when ≥2 tests mock the source, and no test in
  this plan does.
- **`web/src/lib/auth/components/LoginCheck.svelte`** — the "check
  your inbox" screen (R2). Plus `.test.ts`, `__mocks__/`.
- **`web/src/lib/auth/model/auth-client.ts`** — `sendMagicLink`,
  `verifyToken`, `devPasswordSignIn`, `logout`, plus the
  `HttpError` class thrown from every non-2xx branch (R15, Task
  3.1b). Plain `fetch` calls against the proxy-prefixed `/auth/*`
  URLs. Plus `.test.ts`.
- **`web/src/lib/auth/state/pending-login.svelte.ts`** — module-
  scoped runes state holding the in-flight email between
  `LoginRequest` (writes via `setPendingLogin`) and
  `/auth/check/+page.svelte` (reads `pendingLogin.email`). Keeps
  the email out of the URL (R14). Plus `.test.ts`, `__mocks__/`.
- **`web/src/lib/shared/state/session.svelte.ts`** — the session
  runes store with `bootSession`, `signOut`, `setSignedIn`,
  `onUnauthorized`. Plus `.test.ts`, `__mocks__/`.
- **`web/src/lib/shared/http/postgrest.ts`** — the thin PostgREST
  wrapper, with `AuthError` and `ApiError` exports. Plus `.test.ts`.
- **`web/src/routes/auth/login/+page.svelte`** — mounts
  `LoginRequest`.
- **`web/src/routes/auth/check/+page.svelte`** — reads
  `pendingLogin.email` from the auth-state store (R14); if non-
  null, mounts `LoginCheck` passing it as the `email` prop; if
  null, redirects to `/auth/login` with `replaceState: true`. Plus
  `.test.ts`.
- **`web/src/routes/auth/callback/+page.svelte`** — POST to
  `/auth/verify` from `onMount`, navigate on success (R3).
- **`web/e2e/auth.spec.ts`** — the magic-link happy path (R12).
- **`web/e2e/helpers/mailpit.ts`** — polling + href extraction.

### Modified files

- **`web/vite.config.ts`** — replace the single `/auth` proxy entry
  with one that has a `bypass` for page routes (segment-anchored),
  add a **narrowed** cookie → `Authorization: Bearer` `proxyReq`
  handler that fires only on `/auth/user` (so the session-store
  boot's `GET /auth/user` carries the JWT but anonymous endpoints
  like `/auth/otp` don't get a stray bearer attached), and add the
  `configureServer` middleware for `DELETE /auth/session` matched
  on exact path (R5, R10).
- **`web/src/routes/+layout.svelte`** — call `bootSession()` from
  `onMount`, gate render on `session.status !== 'unknown'`, run
  the route-guard `$effect` (R7). Imports `PUBLIC_AUTH_PATHS` and
  `SIGNED_IN_REDIRECT_PATHS` from `auth-paths.ts` (single source
  of truth — no inline path lists). Plus `.test.ts` for the
  guard logic.
- **`web/src/routes/+page.svelte`** — temporary Sign Out button so
  the Playwright spec can click it. Moves to Settings in Step 4.
- **`web/src/lib/test/handlers.ts`** — populate the empty
  `handlers` array with the default MSW handlers (R12) so the
  `onUnhandledRequest: 'error'` setting doesn't break unrelated
  tests when the session store boots.
- **`docker-compose.yml`** — add `GOTRUE_MAILER_URLPATHS_MAGICLINK`
  and bump `GOTRUE_JWT_EXP` (R11).
- **`scripts/seed.sh`** — wait-for-GoTrue + `/signup` loop (R9).
- **`db/seed/dev_seed.sql`** — three idempotent `UPDATE`s of
  `display_name` keyed on email (R9).
- **`web/.env.example`** — append `VITE_DEV_LOGIN_PASSWORD=cairn-dev`
  so the dev shortcut reads the password from an env var rather than
  a hard-coded default in `auth-client.ts` (R8). Keeps the literal out
  of any production bundle.
- *Doc reconciliation (R13) has already landed — see
  `docs/development.md` for the dev shortcut, seed-flow, and
  dev-cookie-`Secure` divergence note, and `docs/architecture.md`
  for the 7-day Max-Age and the tightened login request flow.*

### Data flow (magic-link happy path)

```
LoginRequest                 Vite proxy                 GoTrue
─────────────                ──────────                 ──────
  POST /auth/otp ────────►   forward ─────────────►    /otp
   {email, create_user}                                  ║
                                                         ║ generates token
                                                         ║ POSTs to Mailpit SMTP
                                                         ▼
setPendingLogin(email)                        ┌──────► Mailpit (port 8025)
goto /auth/check  (bare URL — no ?email=)     │
                                              │         catches:
                                              │         href="http://localhost:5173
                                              │              /auth/callback
                                              │              ?token=XXX
                                              │              &type=magiclink"
                                              │
LoginCheck                                    │
─────────                                     │
  user opens Mailpit  ──────────────────────────┘
  taps the link
       │
       ▼
GET /auth/callback?token=XXX&type=magiclink
       │
       │  (bypass returns the URL → SvelteKit serves it)
       ▼
CallbackPage onMount:
  POST /auth/verify ─────►   forward ─────►   /verify
   {token, type:magiclink}    selfHandle       returns 200
                                                {access_token, …}
                                              ◄────────────
                              proxyRes shim sniffs JSON
                              emits Set-Cookie: cairn_session=…
                              ◄────────────
  ◄── 200 + cookie
goto('/', { replaceState: true })
```

## Phase structure

The doc reconciliation that earlier drafts called out as Phase 0
(R13 — edits to `docs/development.md` and `docs/architecture.md`)
has already landed; downstream tasks reference the post-edit
narrative. Phases are numbered from 1.

1. **Phase 1 — Backend wiring (GoTrue + seed + Vite proxy).**
   Update `docker-compose.yml` (mailer URL path, JWT exp), restart
   GoTrue with the new envs, extend `scripts/seed.sh` to drive
   GoTrue signups, rewrite `db/seed/dev_seed.sql` to UPDATE
   `display_name`, and reshape `web/vite.config.ts` (bypass +
   logout middleware). After this phase the user *cannot* log in
   from the UI yet, but `./scripts/seed.sh` is green, and an
   ad-hoc `curl` against `/auth/otp` and `/auth/verify` through
   the dev server proves the proxy + shim still works. RED steps
   are the ad-hoc smoke checks; GREEN is the config + script
   changes. R9, R10, R11.

2. **Phase 2 — Session store + PostgREST wrapper.** Land
   `session.svelte.ts` and `postgrest.ts` together; they're
   coupled (the wrapper calls `session.onUnauthorized` on 401). RED
   tests first per file. The default MSW handlers in
   `test/handlers.ts` also land here because the session store's
   boot fetch makes every other component test need them. R4, R5,
   R6.

3. **Phase 3 — Auth screens and routes.** Build the three auth
   components and three routes. The auth client lands at the head
   of the phase (Task 3.1), then the `HttpError` extension to the
   auth client (Task 3.1b — a follow-on to 3.1, prerequisite for
   the LoginRequest 4xx/5xx classifier), the in-memory
   `pendingLogin` state module (Task 3.2), the dev-shortcut
   predicate (3.2b), and the `LoginRequest` screen (3.2c) — split
   so each one is a single commit. RED tests for each component
   first; then the screens and the route files. The screens are
   "real" Svelte 5 — they consume `Button`, `CairnGlyph`, the
   theme tokens — and follow `data-test`/render-helper testing
   conventions. R1, R2, R3, R8, R15.

4. **Phase 4 — Layout integration: route guard + Sign Out.**
   Modify `+layout.svelte` to boot the session, block-render, and
   redirect. Add the temporary Sign Out button to `+page.svelte`.
   The Vitest `+layout.test.ts` for the guard ships here. R7.

5. **Phase 5 — End-to-end coverage.** Land
   `web/e2e/auth.spec.ts` and `web/e2e/helpers/mailpit.ts`. This
   is the only place where the full backend stack is exercised; a
   green E2E proves the docker-compose env edits in Phase 1
   actually took effect, the GoTrue mailer URL points at the
   SvelteKit route, the proxy shim plants the cookie, the session
   store sees `signed-in`, and Sign Out clears the cookie. R12.

RED-before-GREEN holds throughout phases 2–5. Phase 1 is mostly
config; its RED is "the smoke command fails" and its GREEN is "the
smoke command passes after the env / proxy changes."

## Reference docs and skills

- **`docs/architecture.md`** — auth flow (`:122-150`), request flow
  (`:212-232`), client-side storage table (`:248-258`).
- **`docs/ui.md`** — back-stack and `replaceState` for the
  callback (`:137-153`); navigation rules.
- **`docs/frontend-layout.md`** — three-tier import direction
  (`:41-43`); mock placement; filename conventions.
- **`docs/data-model.md`** — `tg_profile_on_signup` body
  (`:620`); why `display_name` starts as `'New user'`.
- **`docs/development.md`** — magic-link dev flow (`:278-292`);
  the seed flow + step-13 forward-note (`:225-235`); the dev
  shortcut paragraph that returns in this plan (`:257-258`).
- **`docs/testing.md`** — three-layer pyramid; the auth journey
  appears in the Playwright suite (`:179`).
- **`.claude/skills/writing-tests.md`** — `data-test` queries via
  `render.ts`; hybrid `__mocks__/`; Svelte 5 runes idiom in mocks;
  no shared `beforeEach`; MSW at the network layer.
- **`design/cairn-screens.jsx`** — `LoginRequest` (lines 120-174)
  and `LoginCheck` (lines 177-212).

## Resolved questions

- **Optional best-effort `POST /logout` from the DELETE handler —
  skipped.** With refresh-token rotation deferred, server-side
  session invalidation has no real teeth in Step 3 (a JWT remains
  valid until its 7-day expiry regardless). The DELETE middleware
  only clears the cookie; adding the GoTrue notify call later is one
  line. Decision pinned in Task 1.5's Decisions.
