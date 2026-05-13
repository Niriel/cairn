# Requirements: Auth + HTTP client

Step 3 of the master roadmap (`plans/0000_implementation_order.md:62-65`).
GoTrue and Mailpit are running; the schema's `tg_profile_on_signup`
trigger is ready to seed `profiles` + `user_settings` on every signup;
the Vite cookie→bearer shim is wired. What's missing is the user-
facing auth surface, a session store that drives the route guard, and
a thin PostgREST wrapper Step 4 can consume. This plan closes that
gap.

## R1. Magic-link request screen

A SvelteKit route at `/auth/login` renders the `LoginRequest` screen
from `design/cairn-screens.jsx:120`: centered `CairnGlyph`, the wordmark
"Cairn", italic tagline, an email input field, and a primary
"Send me a magic link" button. The screen accepts a syntactically
valid email and disables the submit affordance until one is present.
Submitting calls GoTrue's magic-link endpoint and, on a 2xx response,
writes the email to the in-memory `pendingLogin` store (R14) and
navigates to a **bare** `/auth/check` — the email is **never**
placed in the URL, in `localStorage`, or in `sessionStorage`,
because URL exposure (browser history, address bar, Referer on
outbound links, shoulder-surf, browser-sync) widens the privacy
surface beyond what the user consented to by typing it (see also
`feedback_email_privacy.md`). A 4xx response renders an inline
error message under the field without navigating and without
writing to `pendingLogin`; a network or 5xx error surfaces via the
snackbar primitive. The screen exists outside the route guard (R7)
so a signed-out user can reach it.

## R2. "Check your inbox" screen

A SvelteKit route at `/auth/check` renders the `LoginCheck` screen
from `design/cairn-screens.jsx:177`: green check-mail icon disc, the
heading "Check your inbox", and a body line "We sent a link to
**alice@example.net**. Tap it on this device to sign in.", where
`alice@example.net` is read from the in-memory `pendingLogin`
store (R14) that R1's submit handler wrote immediately before the
navigation. A "Send again" affordance re-issues the magic-link
request to the same email (re-reading from the store). A direct
visit to `/auth/check` (bookmark, reload, follow from elsewhere)
finds `pendingLogin.email === null` and the route file redirects
to `/auth/login` with `replaceState: true` rather than rendering
an empty body — the route is structurally a follow-on from R1's
submit, not a standalone entry point. The screen exists outside
the route guard (R7).

## R3. Magic-link callback completes the exchange

A SvelteKit route at `/auth/callback` reads `token` and `type` from
its URL query string, POSTs to GoTrue's `/verify` endpoint to exchange
the token for a JWT, and on success navigates to `/` using SvelteKit's
`goto(target, { replaceState: true })` so browser-back from the first
post-login screen does not return the user to the single-use callback
URL (per `docs/ui.md:148`). On error (token expired, network failure,
or a non-magic-link `type`), the route surfaces a recoverable error
with a "Back to sign in" button rather than crashing.

Before `goto`, the route calls `session.setSignedIn(user)` (R4) with
the user payload parsed from GoTrue's verify response, so the route
guard sees `signed-in` immediately and does not bounce the user back
to `/auth/login` on the redirect. (Boot's success branch is guarded
to only write from `unknown`, so a same-tab sign-in after the initial
boot has resolved to `signed-out` needs an explicit entrypoint —
see R4.)

The route is structurally allowed by R7's public-path list. The web
app's JavaScript never reads the JWT from the response body — the
Vite proxy's existing shim (R10) plants the cookie before the JSON
reaches the page. The `user` payload is a separate top-level field
in the same response, which is what `setSignedIn` consumes.

## R4. Session store with three states

A reactive `session` store exposes a single discriminated union
through a `current` boxed property:

```ts
type AuthUser = { id: string; email: string };
type Session =
  | { status: 'unknown' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: AuthUser };

// Public surface (consumed via $lib/shared/state/session.svelte):
export const session: { current: Session };
```

The `current` wrapper exists for **TypeScript narrowing**: with a
two-getter shape (`session.status`, `session.user`), each `get` is
an independent property access, so TS cannot narrow `session.user`
from `AuthUser | undefined` to `AuthUser` after a
`session.status === 'signed-in'` check. With the boxed form,
`session.current` is typed as the `Session` union, and
discriminated-union narrowing carries across:

```ts
if (session.current.status === 'signed-in') {
  // session.current is narrowed to { status: 'signed-in'; user: AuthUser }
  console.log(session.current.user.id); // no `?.`, no `!`, type-safe.
}
```

Mutators replace `session.current` wholesale rather than mutating
properties in place — a partial in-place update (e.g. flipping
`status` to `'signed-in'` before assigning `user`) would briefly
inhabit an impossible variant.

The store boots in `unknown` and resolves on app load by calling
GoTrue's `GET /user`: a 2xx response transitions to `signed-in` with
the user payload; a 401 transitions to `signed-out`. **Both** boot
branches only write when current status is `unknown` — they're
*opportunistic* resolvers, not authoritative transitions. Any
deliberate-action entrypoint (`signOut`, `setSignedIn`,
`onUnauthorized`) that runs while boot is still in flight wins the
race, regardless of which boot branch eventually resolves. The
asymmetric version of this rule (guard the 2xx branch but let the
401 branch overwrite unconditionally) is wrong: it correctly
protects `signOut` racing boot but breaks `setSignedIn` from the
callback path, since by the time the callback fires its boot has
typically not yet resolved, and a late-arriving 401 from `GET
/user` would clobber the just-written `signed-in` back to
`signed-out` and bounce the user back to `/auth/login`. Symmetric
guards keep all three explicit entrypoints authoritative. The
store also exposes three explicit-action entrypoints:

- `signOut()` (R5) — best-effort DELETE plus an unconditional
  transition to `signed-out`.
- `setSignedIn(user)` — called by R3 (callback) and R8 (dev shortcut)
  after a successful exchange. Transitions from `unknown` or
  `signed-out` to `signed-in` with the supplied user; a call while
  already `signed-in` is a no-op (the live cookie is the source of
  truth, and step 3 has no path that would update the user payload
  on an existing session — refresh-token rotation is explicitly
  deferred). This is a separate entrypoint from boot because by the
  time a same-tab sign-in fires, boot has typically already resolved
  to `signed-out` (no cookie at first paint), and boot's only-from-
  `unknown` guard would otherwise refuse to write `signed-in`.
  Without this, the route guard would bounce the just-signed-in
  user back to `/auth/login` immediately after the callback's
  `goto('/')`.
- `onUnauthorized()` — called by the PostgREST wrapper (R6) on 401
  to flip the state to `signed-out` when a session expires mid-use.
  Collapses from any state that isn't already `signed-out`.

No JWT or refresh token is ever held in JavaScript state — the
HttpOnly cookie is the only source of truth. The `user` field
carried by `signed-in` is the public-id-and-email pair returned by
GoTrue; the JWT itself never enters JavaScript memory.

The store lives at `web/src/lib/shared/state/session.svelte.ts`. It
sits in `shared/`, not `auth/`, because the route guard
(`+layout.svelte`) and the PostgREST wrapper (`shared/http/`) both
read it, and `shared/` cannot import from a per-domain folder
(`docs/frontend-layout.md:41-43`).

## R5. Sign-out clears the cookie

The session store's `signOut()` issues `DELETE /auth/session`. The
Vite dev server intercepts that path (R10) and responds with a
`Set-Cookie: cairn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
header to clear the cookie. The session store transitions to
`signed-out` **unconditionally** (in a `try/finally`) — the DELETE
is best-effort, and the local intent is authoritative. A network
failure must not leave the user stuck in `signed-in` with an
unhandled rejection bubbling up. A second call while already
signed-out is a no-op; a call while still `unknown` (boot has not
yet resolved) issues the DELETE and transitions straight to
`signed-out` — explicit user intent wins over a pending boot.

The URL `DELETE /auth/session` is Cairn's own — it is not a GoTrue
endpoint. `docs/architecture.md:148` already commits to this exact
path. In production Caddy implements the same handler; in dev the
Vite server middleware is the analogue.

## R6. Thin PostgREST wrapper

A module at `web/src/lib/shared/http/postgrest.ts` exports a small
`fetch`-shaped API used by Step 4 onward. It:

- Prefixes `import.meta.env.VITE_API_BASE` (default `/api`).
- Sets `Accept: application/json` and `Content-Type: application/json`.
- Uses `credentials: 'same-origin'` so the cookie travels.
- On `401`, calls `session.onUnauthorized()` and throws a typed
  `AuthError`.
- On other `4xx`/`5xx`, throws a typed `ApiError` carrying the
  PostgREST `{ code, message, details, hint }` payload when present.
- Returns parsed JSON on success.

It does **not** depend on `@supabase/postgrest-js`. The wrapper is
plain TypeScript in `model/`-style — no reactivity. The
`Authorization` header is added by the Vite proxy (R10), not by this
module.

## R7. Route guard blocks unauthenticated access to private routes

`+layout.svelte` reads `session.current.status` (R4) and:

- When `unknown`, blocks render and shows a centered `CairnWordmark`
  boot screen.
- When `signed-out` and the current pathname is not in the public
  set `{/auth/login, /auth/check, /auth/callback}`, blocks render
  the same way (children never mount on a guarded miss — see
  below) **and** calls `goto('/auth/login', { replaceState: true })`.
  Public-path matching is **segment-anchored**: a path is public
  iff it is exactly one of those three or starts with one followed
  by `/` or `?`. A literal `path.startsWith(p)` accidentally
  treats `/auth/logins` (a hypothetical sibling) as public; the
  segment-anchored form does not. The path list and predicate are
  the **same** `PUBLIC_AUTH_PATHS` and `isSegmentMatch` exports
  from `$lib/shared/model/auth-paths` that R10 already pins for
  the Vite proxy bypass — one source of truth across the proxy
  bypass, the bearer-attach narrow, the DELETE matcher, and this
  guard, so the segment-anchoring contract can never drift between
  the four sites.
- When `signed-in` on a **private** path, renders the route
  children normally.
- When `signed-in` on a **public** path (`/auth/login`,
  `/auth/check`), redirects to `/` with `replaceState: true`. The
  callback path is **excluded** from this redirect — `/auth/callback`
  owns its own post-exchange `goto('/', { replaceState: true })`
  (R3) and races with the guard; double-firing the redirect is
  harmless but the guard would be redundant. Without the
  signed-in-on-public redirect, a signed-in user revisiting a
  stale `/auth/login` bookmark, or clicking the dev shortcut while
  already signed in, lands on the email form and either re-fires
  sign-in (a no-op per R4's `setSignedIn` idempotence) or sees a
  surprising screen. The redirect is the minimum to keep "you are
  signed in" coherent across all entrypoints.

The block-render gate is wider than just `unknown`: it covers
`unknown` **and** `signed-out`-on-a-private-path. Without that
widening, `$effect` schedules the redirect *after* the next paint,
so the user momentarily sees the private route's children (an
empty skeleton at this stage, real content in Step 4) before the
redirect fires. Symmetric gating — block-render in every state
where children must not mount — eliminates the flash without
needing the `$effect` to "win" against render scheduling.

The guard runs in `+layout.svelte` (not `+layout.ts`) because the
SvelteKit static adapter does not execute server-side loads at
request time — `redirect()` from a `load` function has no effect.

## R8. Dev login shortcut

When **both** `import.meta.env.DEV` is true **and**
`import.meta.env.VITE_DEV_LOGIN_SHORTCUT === 'true'` (the value
already present in `web/.env.example`), the `LoginRequest` screen
renders three small secondary buttons under the email field labelled
*Alice*, *Bob*, *Carol*. Each calls GoTrue's
`POST /token?grant_type=password` with the corresponding seeded email
and the well-known dev password (R9). The Vite proxy's existing JSON
sniffer (R10) plants the cookie identically to the magic-link path;
the screen then calls `session.setSignedIn(user)` (R4) with the user
payload parsed from the response and redirects to `/`. The
`setSignedIn` call is the same load-bearing transition R3 requires —
without it, the route guard sees `signed-out` after the redirect and
bounces the user back to `/auth/login`.

The shortcut is dev-only by a belt-and-braces gate: in a production
build `import.meta.env.DEV` is `false` regardless of which env
variables happen to be set, and Vite tree-shakes the dead branch out
of the bundle. The env-var check is the runtime opt-in for
developers who want to disable the shortcut locally without losing
the dev build mode. The shortcut does not require Mailpit
interaction.

## R9. Dev seed signs up Alice/Bob/Carol and renames their profiles

`scripts/seed.sh` is extended so that, after `migrate.sh` completes,
it:

1. Polls GoTrue's HTTP surface until it is reachable
   (`curl -sf http://localhost:9999/health`).
2. For each of Alice, Bob, Carol, issues `POST /signup` to GoTrue
   with the user's email (`alice@example.test`, `bob@example.test`,
   `carol@example.test`) and the dev password `cairn-dev`.
   `tg_profile_on_signup` (already in the migration) creates the
   matching `profiles` + `user_settings` rows synchronously inside
   the signup transaction.
3. Runs `psql -f db/seed/dev_seed.sql`, which `UPDATE`s the three
   profiles' `display_name` from the placeholder `'New user'` to
   `Alice`, `Bob`, `Carol` respectively, keyed on `auth.users.email`.

The seed is **idempotent**: repeated runs treat GoTrue's 422
"User already registered" response as success. `dev_seed.sql`'s
`UPDATE`s are also idempotent by construction.

The dev password `cairn-dev` is committed in `dev_seed.sql` and
`scripts/seed.sh`. The blast radius is contained because
`./scripts/seed.sh` is a developer-only entry point — no production
rollout path runs it. Production hardening (when the step-13 plan
lands the Caddy/prod compose) must set
`GOTRUE_MAILER_AUTOCONFIRM=false` and `GOTRUE_DISABLE_SIGNUP=true`
on the production GoTrue service so the committed password cannot
be used against a prod instance; this forward-note is restated in
`docs/development.md` so the step-13 owner can't miss it.

## R10. Vite proxy and middleware bring GoTrue inline with production

`web/vite.config.ts` is extended so:

- A `bypass` callback on the `/auth` proxy rule returns the request
  URL unchanged (letting SvelteKit serve it) for the page paths
  `/auth/login`, `/auth/check`, `/auth/callback`, and returns
  `undefined` (forwarding to GoTrue) for every other `/auth/*` path
  that GoTrue actually exposes. The match is **segment-anchored**
  (exact, or followed by `/` or `?`) — same shape as the route
  guard's PUBLIC predicate in R7 — so a future GoTrue endpoint
  whose name happens to share a prefix isn't accidentally short-
  circuited to SvelteKit.
- A **`proxyReq` handler** on the `/auth` proxy rule mirrors the
  existing `/api` handler (`web/vite.config.ts:27-32`) but is
  **narrowed to the authenticated GoTrue endpoints** — currently
  just `/auth/user`. On a matching forwarded request, read the
  `cairn_session` cookie and set `Authorization: Bearer <jwt>` when
  the cookie is present and the caller hasn't already supplied an
  `Authorization` header. Without this, `GET /user` (used by the
  session store's boot in R4) would 401 on every page load because
  Vite would forward only the cookie, and GoTrue ignores cookies.
  The handler **must not** attach the bearer on anonymous-callable
  endpoints (`/auth/otp`, `/auth/verify`, `/auth/token`) — those
  endpoints accept anonymous callers and there is no reason to
  hand them a signed-in user's JWT. The Caddy production analogue
  does the same on `/auth` per `docs/architecture.md:146` ("Caddy
  reads the cookie on the way in, attaches it as
  `Authorization: Bearer <jwt>`"); this requirement makes the dev
  proxy match while keeping the contract narrow.
- The existing JSON-sniffing response handler that extracts
  `access_token` from a 200 response body and emits the
  `cairn_session` cookie (`web/vite.config.ts:40-67`) stays, but is
  **narrowed to a closed set of login endpoints** — `/auth/verify`
  and `/auth/token`. Today the shim fires on **any** 2xx `/auth/*`
  response that happens to carry an `access_token` field, which
  includes `POST /auth/signup` (open in dev because
  `GOTRUE_DISABLE_SIGNUP="false"` and `GOTRUE_MAILER_AUTOCONFIRM="true"`).
  The result is that any same-origin request to `/auth/signup`
  through the Vite proxy creates a brand-new `auth.users` row and
  plants a `cairn_session` cookie for it — a full sign-in as an
  arbitrary new account. The blast radius is contained to localhost,
  but the path is wider than the cookie shim's intent. Gating the
  cookie-plant on `isSegmentMatch(req.url, COOKIE_PLANT_PATHS)`
  (using the same `auth-paths.ts` helper module that owns the public
  bypass and bearer-attach narrows) pins the contract: the cookie is
  only ever planted on responses to deliberate-login endpoints. A
  future GoTrue endpoint that also returns `access_token` (refresh
  token rotation, OAuth callbacks) must be added explicitly to
  `COOKIE_PLANT_PATHS` and reasoned about — not absorbed silently.
- A small `configureServer` middleware short-circuits
  `DELETE /auth/session`: emits the cookie-clearing
  `Set-Cookie` header and returns 204. It MAY also fire a
  best-effort `POST /logout` to GoTrue with the bearer attached;
  failure is ignored.

This shim approximates what Caddy will do in production; the divergence
(localhost cookies have no `Secure` flag) is documented in
`docs/development.md`.

## R11. GoTrue config aligns with the SvelteKit callback URL and a longer session

`docker-compose.yml` adds two environment variables to the `gotrue`
service:

- `GOTRUE_MAILER_URLPATHS_MAGICLINK: /auth/callback` — so the magic-
  link email's `<a href>` points at the SvelteKit route this plan
  introduces. Without this override, the default mailer path
  (`/auth/v1/verify`) 404s through the proxy.
- `GOTRUE_JWT_EXP: "604800"` (7 days) — increases the JWT lifetime
  so the cookie's `Max-Age`, which tracks `expires_in`, lasts a
  meaningful session. `docs/architecture.md:252` ("~30-day Max-Age")
  is aspirational and reachable only with refresh-token rotation
  (out of scope, see Non-requirements). The same doc line gets a
  one-line edit to reflect the interim "~7-day" value.

## R12. Test coverage

**Vitest (`pnpm test`)** ships colocated `*.test.ts` files for every
new component and module. Concretely:

- `LoginRequest.test.ts` — disabled-until-valid-email submit; submit
  writes `pendingLogin.email` and then navigates to a bare
  `/auth/check` (assert call order: store write happens before
  `goto`; assert the goto target is `/auth/check` with no query
  string); a 4xx response renders the inline error and does **not**
  write to `pendingLogin`; dev shortcut buttons appear when the env
  var is `'true'` and call the password grant; dev shortcut buttons
  absent when the env var is absent; dev shortcut click passes the
  resolved user to `session.setSignedIn` before navigating to `/`.
- `LoginCheck.test.ts` — renders the email passed via the
  component's `email: string` prop; "Send again" re-issues the
  magic-link request with that email. The route ↔ store wiring is
  exercised separately (see `auth/check/+page.test.ts` below).
- `auth/check/+page.test.ts` — when `pendingLogin.email` is set,
  renders `LoginCheck` with that value as the `email` prop; when
  `pendingLogin.email` is `null`, calls `goto('/auth/login', {
  replaceState: true })` on mount and renders nothing.
- `pending-login.test.ts` — `pendingLogin.email` starts as `null`;
  setting it via `setPendingLogin(email)` persists; `clearPendingLogin()`
  resets to `null`. No HTTP, no storage I/O — purely in-memory
  invariants.
- `auth/callback/+page.test.ts` — POSTs `/auth/verify` with the
  URL's `token` and `type=magiclink`; 2xx calls
  `session.setSignedIn(user)` with the user from the verify
  response, then navigates to `/` with `replaceState: true` (assert
  call order); 4xx renders the error state.
- `session.test.ts` — boot transitions `unknown → signed-in` on 200
  and `unknown → signed-out` on 401; `signOut()` calls
  `DELETE /auth/session` and transitions to `signed-out`;
  `signOut()` transitions to `signed-out` even when the DELETE
  rejects (best-effort contract per R5); `onUnauthorized()`
  transitions a `signed-in` session to `signed-out` and also
  transitions an `unknown` session to `signed-out` (any state
  that isn't already `signed-out` collapses), without an extra
  HTTP call; `setSignedIn(user)` transitions `signed-out →
  signed-in` with that user; `setSignedIn(user)` transitions
  `unknown → signed-in` with that user (no HTTP call in either
  case).
- `postgrest.test.ts` — GET parses JSON; `pgGet('/lists')` issues
  to `/api/lists` so the `VITE_API_BASE` prefix is pinned (assert
  the absolute URL the MSW handler sees); 401 throws `AuthError`
  and triggers `session.onUnauthorized`; 4xx with PostgREST's
  `{code,message,details,hint}` shape throws `ApiError` carrying
  those fields; `Accept: application/vnd.pgrst.object+json`
  returns the object, not the array.
- `+layout.test.ts` — renders the boot screen when status is
  `unknown`; renders children when `signed-in` on a private path;
  redirects to `/auth/login` when `signed-out` on a private path;
  does not redirect when `signed-out` on a public path; **does**
  redirect when `signed-out` on `/auth/loginx` (segment-anchored,
  so a hypothetical sibling-prefix path is not treated as public);
  **redirects to `/` with `replaceState: true` when `signed-in`
  on `/auth/login` or `/auth/check`** (signed-in users should not
  see stale login screens — see R7); does **not** redirect from
  the guard when `signed-in` on `/auth/callback` (the callback
  page owns its own `goto('/')`).

All Vitest tests use the `data-test` query helper from
`web/src/lib/test/render.ts` and follow the conventions in
`.claude/skills/writing-tests.md` (no shared `beforeEach`, hybrid
`__mocks__/`, MSW handlers at the network layer).

**Playwright (`pnpm test:e2e`)** ships one new spec
`web/e2e/auth.spec.ts`:

- Visit `/`, redirected to `/auth/login`.
- Enter a unique-per-test email (`alice+<testId>@example.test`),
  submit.
- Poll Mailpit's `GET /api/v1/messages` + `GET /api/v1/message/{ID}`
  for the magic-link email; extract the href via regex; HTML-decode
  `&amp;`.
- `page.goto` the extracted link, land on `/`, assert the
  `cairn_session` cookie is present via `context.cookies()`.
- Click the Sign Out affordance, assert the cookie is gone and the
  app is back on `/auth/login`.

The supporting helper lives at `web/e2e/helpers/mailpit.ts`.

## R13. Documentation reconciliation

The following doc edits ship in **Phase 0** of this plan, before any
code lands, so downstream tasks reference the right surface:

- `docs/development.md:225-227` — replace the "intentionally empty"
  seed paragraph with the new flow (signups via GoTrue, `dev_seed.sql`
  UPDATEs `display_name`). Restore the `VITE_DEV_LOGIN_SHORTCUT`
  paragraph (line 249) and the dev-token shortcut explanation
  (lines 295-297). Document the committed dev password `cairn-dev`.
- `docs/development.md` — add a one-line note that the dev cookie
  has no `Secure` attribute (HTTP localhost) while production's
  Caddy-set cookie does.
- `docs/architecture.md:226-231` — verify the request-flow narrative
  matches: callback at `/auth/callback`, JSON response shim, cookie
  set. If `/auth/magiclink` is preferred over `/otp` for readability,
  state that the dev shim and prod Caddy both accept that path and
  GoTrue treats them as aliases.
- `docs/architecture.md:252` — change "~30-day Max-Age" to
  "~7-day Max-Age (raised to ~30-day when refresh-token rotation
  lands)" or similar, so the doc and code agree.

## R14. In-memory `pendingLogin` store carries the email between R1 and R2

A module-scoped runes state at
`web/src/lib/auth/state/pending-login.svelte.ts` exports:

```ts
export const pendingLogin: { email: string | null };
export function setPendingLogin(email: string): void;
export function clearPendingLogin(): void;
```

R1 (`LoginRequest`'s submit handler) calls `setPendingLogin(email)`
immediately before `goto('/auth/check')`. R2 (`/auth/check` route
file) reads `pendingLogin.email`: if non-null, it passes the value
as the `email` prop to `LoginCheck`; if null, it `goto`s
`/auth/login` with `replaceState: true` and renders nothing.

Lifetime is the JS heap — no `localStorage`, no `sessionStorage`,
no URL query string, no `history.state`. The email never enters
any channel the user didn't already type into themselves. A reload
of `/auth/check` finds `pendingLogin.email === null` (fresh page
load → fresh module instance) and falls back per R2; this is a
*feature*, because a stale bookmarked `/auth/check` doesn't
resurrect an old email from a prior session.

The store also **auto-clears on transition into `signed-in`**:
`pending-login.svelte.ts` runs a module-scoped `$effect.root` that
watches `session.current.status` and assigns `pendingLogin.email
= null` when the status becomes `signed-in`. This is the moment
the flow has succeeded and the email's purpose is served, so any
later same-tab direct-visit to `/auth/check` (typed URL, history
navigation) sees `null` and redirects to `/auth/login` per R2.
The store deliberately does **not** auto-clear on transitions to
`signed-out` — a boot-driven 401 happens during the magic-link
flow itself (the user typed an email and is on `/auth/check`
waiting for the email), and clearing then would wipe a
flow-in-progress.

The store lives in `auth/state/` (not `shared/`) because only the
auth domain consumes it; `docs/frontend-layout.md:41-43`'s import
direction allows this. The "Send again" affordance in R2 reads
the email from the same store; there is no second authoritative
copy.

## Non-requirements (explicitly excluded)

- **Name-prompt screen ("What should we call you?")** — `docs/ui.md:7-9`
  describes a forced first-launch screen when `display_name = 'New user'`.
  This belongs to Step 4 (MVP product surface) because it requires
  the lists screen to navigate to and a PostgREST `PATCH /profiles`
  call. Step 3 stops at "logged in, see placeholder `/`".
- **Refresh-token rotation** — GoTrue returns a `refresh_token` in
  the `/verify` response; Step 3 drops it on the floor and relies on
  the 7-day JWT (R11). Refresh-token plumbing — extending the cookie
  shim to store the refresh token, adding a `POST /token?grant_type=
  refresh_token` retry path on 401 — is a later refinement so the
  30-day Max-Age committed in `docs/architecture.md:252` can land
  fully.
- **`<Avatar>` initials disc** — every screen that renders a user
  needs the avatar primitive eventually, but Step 3 has no user-
  identity surface (no Settings, no member lists, no item attribution).
  The avatar primitive lands in Step 4 (initials-only) and gets the
  photo branch in Step 5.
- **Lists screen content** — `+page.svelte` stays a placeholder in
  Step 3, holding only a temporary Sign Out affordance for the
  Playwright spec to click. Step 4 replaces it with the lists overview.
- **Caddy production cookie shim** — `caddy/Caddyfile.prod` and the
  production cookie-shim block land in Step 13 (production rollout).
  Step 3 establishes the contract; the Caddy implementation
  approximates it via the existing Vite proxy.
- **Email-client link pre-fetch hardening** — production email
  clients (Outlook, iMessage) pre-fetch URLs in messages, which would
  burn one-shot GoTrue magic-link tokens. Mitigation is a "confirm
  to sign in" intermediary page; not a problem in dev with Mailpit.
  Documented for whichever later plan turns on production email.
- **CSRF token on `POST /auth/otp`** — the request carries no
  cookie (user is signed-out) so there's nothing to forge.
  `SameSite=Lax` plus same-origin makes a token redundant.
