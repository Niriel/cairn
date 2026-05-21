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
The submit affordance is **also disabled while a previous submit is
in flight** (between the click and the resolution of
`sendMagicLink(email)`): an itchy user with a slow connection
otherwise spawns multiple `POST /auth/magiclink` calls, generating duplicate
magic-link emails that race GoTrue's per-address rate limit and that
race each other (the user may click an already-invalidated link from
an earlier email and land on the callback's error state with no
obvious cause). The same in-flight gate covers the dev-shortcut
buttons.
Submitting calls GoTrue's magic-link endpoint and, on a 2xx response,
writes the email to the in-memory `pendingLogin` store (R14) and
navigates to a **bare** `/auth/check` — the email is **never**
placed in the URL, in `localStorage`, or in `sessionStorage`,
because URL exposure (browser history, address bar, Referer on
outbound links, shoulder-surf, browser-sync) widens the privacy
surface beyond what the user consented to by typing it (the
broader privacy contract — email is never shown anywhere a user
is rendered — is pinned in `docs/invites.md:64`). A 4xx response renders an inline
error message under the field without navigating and without
writing to `pendingLogin`; a network or 5xx error surfaces via the
snackbar primitive. The screen exists outside the route guard (R7)
so a signed-out user can reach it.

The POST goes to `/auth/magiclink` with body `{email}` and
`redirect_to` carried in the **query string** as
`?redirect_to=${encodeURIComponent(window.location.origin + '/auth/callback')}`.
The query-string carrier is load-bearing: in
`supabase/gotrue:v2.158.1`, `MagicLinkParams`
(`internal/api/magic_link.go`) has no `RedirectTo` field, so a
body-shaped `redirect_to` is silently dropped by Go's
`encoding/json`. GoTrue's `getRedirectTo`
(`internal/utilities/request.go`) reads from (a) the `redirect_to`
HTTP header, (b) `r.Form.Get("redirect_to")` (URL query string or
`application/x-www-form-urlencoded` body) — never from JSON.
We pick the query string for cleanness (no header plumbing, no
content-type change). Same-host `redirect_to` values short-circuit
GoTrue's `IsRedirectURLValid` to `true` without consulting
`GOTRUE_URI_ALLOW_LIST`, so no dev-side allow-list widen is
needed; prod will need an entry once `SITE_URL` and `redirect_to`
diverge in host (see R11). The email GoTrue sends carries an
`<a href>` pointing at GoTrue's own `/verify` endpoint with
`token`, `type`, and `redirect_to` in the query string. When the user clicks the
link, GoTrue validates the token and 302-redirects to
`${origin}/auth/callback#access_token=…&refresh_token=…&type=magiclink`
— the tokens travel in the URL hash fragment, and the callback
page (R3) reads them from there. The cookie-plant shim's narrow
already covers the `/auth/token?grant_type=refresh_token` exchange
the callback issues to plant the HttpOnly cookie; the hash-fragment
exposure window is documented as an explicit trade-off in
`docs/architecture.md`'s JWT-storage Security-trade-off subsection.
In Step 3's dev configuration (`GOTRUE_DISABLE_SIGNUP="false"`,
`GOTRUE_MAILER_AUTOCONFIRM="true"`), GoTrue auto-creates the
auth row on first sight of an unknown email and proceeds with
the magic-link flow as usual. In production (once R9's
forward-note lands in step 13: `GOTRUE_DISABLE_SIGNUP=true`)
GoTrue rejects unknown emails and the 4xx response surfaces
through R1's existing inline-error branch; registration enters
through the invite-redemption flow (owned by a later plan, not
Step 3), per `docs/invites.md`'s invite-only stance. The Step 3
client deliberately doesn't branch on "registered vs not"; the
production gating is server-side. `/auth/otp` is a GoTrue alias
for the same handler; R16 records why we standardise on
`/auth/magiclink`.

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

A SvelteKit route at `/auth/callback` reads `access_token`,
`refresh_token`, `type`, and any `error` / `error_description` from
`window.location.hash` (the URL fragment GoTrue's `/verify` 302
redirected with — see R1 and the flow in
`docs/architecture.md`'s Request-flow section). **As the very
first action in `onMount`**, the page captures the raw hash into a
local constant and calls `history.replaceState({}, '',
window.location.pathname + window.location.search)` to strip the
hash from the visible URL. The strip happens before any `await` so
the JS-visible exposure window is bounded by parse-and-replace, not
by network latency. After stripping, the page POSTs to GoTrue's
`/auth/token?grant_type=refresh_token` endpoint with
`{refresh_token}` — the Vite proxy's cookie-plant shim (R10) plants
the `cairn_session` HttpOnly cookie from the response's
`access_token` and strips `access_token`/`refresh_token` from the
JSON body. On success the page navigates to `/` using SvelteKit's
`goto(target, { replaceState: true })` so browser-back from the
first post-login screen does not return the user to the single-use
callback URL (per `docs/ui.md:148`). On error (token expired,
`error` present in hash, network failure, missing or wrong-typed
fields, or a non-magic-link `type`), the route surfaces a
recoverable error with a "Back to sign in" button rather than
crashing.

Before `goto`, the route calls `session.setSignedIn(user)` (R4)
with the user payload parsed from the refresh-token response, so
the route guard sees `signed-in` immediately and does not bounce
the user back to `/auth/login` on the redirect. (Boot's success
branch is guarded to only write from `unknown`, so a same-tab
sign-in after the initial boot has resolved to `signed-out` needs
an explicit entrypoint — see R4.)

The route is structurally allowed by R7's public-path list. The
web app's JavaScript reads the refresh token from the URL hash
during the callback page's mount, posts it through the Vite proxy
once, and then the HttpOnly cookie is the only source of truth.
The Vite proxy's existing shim (R10) plants the cookie **and
strips `access_token` / `refresh_token` from the JSON body**
before forwarding the response to the page, so the JS layer never
holds an access token after the exchange completes. The `user`
payload is a separate top-level field that the proxy leaves intact,
which is what `setSignedIn` consumes. The transient hash exposure
is the trade-off documented in `docs/architecture.md`'s JWT-storage
Security-trade-off subsection; see R16 for the rationale behind
adopting the standard Supabase flow.

A signed-in user revisiting `/auth/callback` (clicking an old
magic-link from email while already authenticated in the same
browser) is **redirected to `/` without re-exchanging**. The route
short-circuits after `replaceState` but before any HTTP call: it
**`await`s `bootSession()`** (or, equivalently, awaits the
resolution of the boot already in flight) and then, if
`session.current.status === 'signed-in'`, calls `goto('/', {
replaceState: true })` and skips the refresh-token POST entirely.
The await is load-bearing: `+layout.svelte`'s `onMount`
(R7 / Task 4.1) fires `bootSession()` asynchronously, and the
callback page's own `onMount` typically runs while
`session.current.status` is still `unknown`. Reading the status
without first awaiting boot would miss the signed-in case, fall
through to the refresh-token POST with a stale token, GoTrue 4xx
the request, and the user — who is already authenticated — would
land on the error state with a "Back to sign in" button, a
confusing UX. The route guard (R7) deliberately _doesn't_ redirect
signed-in users away from `/auth/callback` (so first-visit
verification can complete), which is why this short-circuit lives
in the route itself, not in the guard. The `replaceState` runs
**before** the boot await, regardless of which branch wins: if the
user was already signed-in, stripping the hash from the URL is
still the right move — the tokens in the URL are stale anyway.

## R4. Session store with three states

A reactive `session` store exposes a single discriminated union
through a `current` boxed property:

```ts
type AuthUser = { id: string; email: string };
type Session =
	| { status: "unknown" }
	| { status: "signed-out" }
	| { status: "signed-in"; user: AuthUser };

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
if (session.current.status === "signed-in") {
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
_opportunistic_ resolvers, not authoritative transitions. Any
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

**Trade-off acknowledged: a 5xx or network error on the boot fetch
collapses to `signed-out`**, not to a retry surface. The
consequence is that a transient blip at first paint can bounce an
authenticated user (cookie still valid) to `/auth/login`, where
their only path back is to re-request a magic link. The
alternative — distinguishing transient (5xx / network) from
authoritative (401) and rendering a "couldn't reach the server,
retry?" surface — is the right long-term shape, but the state
machine and its UX surface are deferred. A future refinement
should branch the non-401 case into an error-with-retry rather
than a silent collapse. Step 3 ships the simpler default so the
boot can't get wedged in `unknown` and so the route guard's
block-render gate has a determinate signal to act on.

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
three cases — `unknown`, `signed-out`-on-a-private-path, **and**
`signed-in`-on-a-`SIGNED_IN_REDIRECT_PATHS`-path. Without the
widening to all three, `$effect` schedules the redirect _after_
the next paint, so the user momentarily sees content that
shouldn't be mounted: a private route's children (an empty
skeleton at this stage, real content in Step 4) when signed-out
on private, or the `LoginRequest` / `LoginCheck` screen when
signed-in on a stale `/auth/login` or `/auth/check` bookmark or
when a same-tab sign-in flips the session while still mounted on
those routes. Symmetric gating — block-render in every state
where children must not mount — eliminates the flash in every
direction without needing the `$effect` to "win" against render
scheduling. (`/auth/callback` is in `PUBLIC_AUTH_PATHS` but _not_
in `SIGNED_IN_REDIRECT_PATHS`, so the third case does not block
signed-in callback first-visits — the callback page is allowed
to render and own its own `goto('/')` per R3.)

The guard runs in `+layout.svelte` (not `+layout.ts`) because the
SvelteKit static adapter does not execute server-side loads at
request time — `redirect()` from a `load` function has no effect.

## R8. Dev login shortcut

When **both** `import.meta.env.DEV` is true **and**
`import.meta.env.VITE_DEV_LOGIN_SHORTCUT === 'true'` (the value
already present in `web/.env.example`), the `LoginRequest` screen
renders three small secondary buttons under the email field labelled
_Alice_, _Bob_, _Carol_. Each calls GoTrue's
`POST /token?grant_type=password` with the corresponding seeded email
and the dev password read from
`import.meta.env.VITE_DEV_LOGIN_PASSWORD` (default value populated in
`web/.env.example`; R9 sets the seed side to the same string). The
password is **not** a default parameter of the auth-client helper —
the caller passes it explicitly — so a production bundle (where
`isDevLoginShortcutEnabled()` is `false` and the call site is dead
code) doesn't ship a hard-coded credential literal even if Rollup
chooses not to tree-shake the function.

**Production builds must run with `VITE_DEV_LOGIN_PASSWORD` unset.**
Vite statically replaces `import.meta.env.VITE_*` at build time, _before_
Rollup's tree-shaker runs; the safety argument above also requires the
prod build env to not have the variable set, otherwise the literal
string is inlined into the JS source even when the call site is dead
code. The step-13 prod-rollout audit (`docs/development.md` forward-
note next to the existing GoTrue hardening paragraph) carries this as
a load-bearing item alongside `GOTRUE_DISABLE_SIGNUP=true` and
`GOTRUE_MAILER_AUTOCONFIRM=false`. The Vite proxy's existing JSON
sniffer (R10) plants the cookie identically to the magic-link path;
the screen then calls `session.setSignedIn(user)` (R4) with the user
payload parsed from the response. The handler does **not** call
`goto` itself — the route guard's signed-in-on-public-path redirect
(R7) sees `/auth/login` in `SIGNED_IN_REDIRECT_PATHS` and navigates
to `/` with `replaceState: true`. The `setSignedIn` call is the
load-bearing transition that lets the layout redirect fire: without
it, the route guard sees `signed-out` and the user stays on the
login screen. (The callback page in R3 owns its own `goto('/')`
because `/auth/callback` is deliberately _excluded_ from
`SIGNED_IN_REDIRECT_PATHS`; the dev shortcut is on `/auth/login`,
which is included, so the guard carries the redirect.)

The shortcut is dev-only by a belt-and-braces gate: in a production
build `import.meta.env.DEV` is `false` regardless of which env
variables happen to be set, and Vite tree-shakes the dead branch out
of the bundle. The env-var check is the runtime opt-in for
developers who want to disable the shortcut locally without losing
the dev build mode. The shortcut does not require Mailpit
interaction.

A dev-shortcut rejection (`devPasswordSignIn` returns non-2xx — empty
`VITE_DEV_LOGIN_PASSWORD`, GoTrue down, network failure) surfaces
through the same Snackbar `LoginRequest` renders for the magic-link
5xx branch — one error surface per screen, one `data-test`. Without
this, a stale `web/.env` that omits `VITE_DEV_LOGIN_PASSWORD` makes
the dev buttons appear to do nothing (rejected promise, no UI
change), which is a discoverability trap for whichever contributor
hits it first.

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
  endpoints (`/auth/magiclink`, `/auth/verify`, `/auth/token`) — those
  endpoints accept anonymous callers and there is no reason to
  hand them a signed-in user's JWT. The Caddy production analogue
  does the same on `/auth` per `docs/architecture.md:146` ("Caddy
  reads the cookie on the way in, attaches it as
  `Authorization: Bearer <jwt>`"); this requirement makes the dev
  proxy match while keeping the contract narrow.
- The existing JSON-sniffing response handler that extracts
  `access_token` from a 200 response body and emits the
  `cairn_session` cookie (`web/vite.config.ts:39-67`) stays, but is
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
  The set's two elements have asymmetric roles in Step 3's flow:
  `/auth/token` is the **active** cookie-plant path — the callback
  page POSTs `/auth/token?grant_type=refresh_token` after reading
  the refresh token from `window.location.hash`, and that response
  is what plants `cairn_session` (see R3 for the callback wiring,
  R16 for the endpoint rationale). `/auth/verify` stays in the
  narrow as **defence-in-depth**: no Step-3 caller hits it, but
  keeping it allowed means a future flow that needs server-side
  token verification (e.g. an `OAuth` callback that doesn't 302
  with hash tokens) can use it without re-widening the gate. Both
  paths are equally constrained by the same JSON-content-type ∧
  status-200 outer guard the shim already enforces.
- **The same JSON-sniffing response handler strips `access_token`
  and `refresh_token` from the body before forwarding it to the
  page**, unconditionally on every `/auth/*` 200 JSON response that
  carries either field (no path narrowing — the strip is wider than
  the cookie-plant gate, but still inherits the JSON-content-type
  ∧ status-200 outer guard the existing shim already enforces;
  there is nothing to strip on non-JSON or non-200 responses). The
  `200`-only gate matches the implementation in Task 1.4 — a future
  GoTrue (or fork) that returns 201/202 with `access_token` would
  not be stripped under the current guard, and widening the gate
  to 2xx is a deliberate edit, not an implicit consequence of the
  prose above. The JS layer has no legitimate use for
  either token in Step 3: the cookie is the source of truth, and
  refresh-token rotation is explicitly deferred (Non-requirements).
  The strip is what makes `docs/architecture.md:145`'s "forwarding
  the (now-token-stripped) body" and `:233`'s "the web app's
  JavaScript never sees the token" literally true rather than
  aspirational — without it, every successful login round-trip
  parks the JWT and the refresh token in JS memory for the lifetime
  of the `await response.json()` parse. The handler must also drop
  the upstream `content-length` header when rewriting the body so
  Node recomputes it from the modified buffer — otherwise a
  Content-Length-respecting client truncates the JSON.
- A small `configureServer` middleware short-circuits
  `DELETE /auth/session`: emits the cookie-clearing
  `Set-Cookie` header and returns 204. It MAY also fire a
  best-effort `POST /logout` to GoTrue with the bearer attached;
  failure is ignored.

This shim approximates what Caddy will do in production; the divergence
(localhost cookies have no `Secure` flag) is documented in
`docs/development.md`.

## R11. GoTrue config aligns with the SvelteKit callback URL and a longer session

`docker-compose.yml`'s `gotrue` service env is pinned by the
following constraints:

- `GOTRUE_URI_ALLOW_LIST` stays at `http://localhost:5173` (the
  dev `SITE_URL`). Empirically (v2.158.1 source dive,
  2026-05-21), the allow-list is **not consulted** when
  `redirect_to`'s host matches `SITE_URL`'s host:
  `IsRedirectURLValid` short-circuits to `true` on a same-host
  match before reaching the glob-list check. The earlier
  symptom — the email's `<a href>` carrying
  `redirect_to=http://localhost:5173` (path stripped) — was the
  consequence of the JSON body shape, not the allow-list: GoTrue's
  `MagicLinkParams` has no `RedirectTo` field, so the body field
  was silently dropped by `encoding/json` and `redirect_to`
  defaulted to `SITE_URL`. R1 now carries `redirect_to` in the
  query string, which is one of the accepted carriers, and the
  path survives end-to-end. Prod will need an entry under the
  glob form once `SITE_URL` and `redirect_to` diverge in host (a
  different DNS name for the callback than for the bare origin);
  that lands with the prod-deploy plan, not Step 3.
- `GOTRUE_MAILER_URLPATHS_MAGICLINK` is **not set**. Earlier
  iterations of this plan added it as defence-in-depth, but in
  `supabase/gotrue:v2.158.1` the variable has no observable
  effect on `POST /magiclink`'s email emission: the email's link
  routes through GoTrue's own `/verify` endpoint regardless, with
  the redirect target taken from `redirect_to` (gated by
  `URI_ALLOW_LIST` above). Keeping a no-op env var in
  `docker-compose.yml` invites a future contributor to assume
  it's load-bearing; the var is therefore omitted. If a future
  GoTrue version starts honouring it, re-add with a comment
  explaining the version dependency. R16 records the endpoint
  choice rationale; the relaxed JS-token contract is documented
  in `docs/architecture.md`'s JWT-storage Security-trade-off
  subsection.
- `GOTRUE_JWT_EXP: "604800"` (7 days) — increases the JWT lifetime
  so the cookie's `Max-Age`, which tracks `expires_in`, lasts a
  meaningful session. `docs/architecture.md:252` already records
  the interim "~7-day Max-Age (raised to ~30-day when refresh-token
  rotation lands)" phrasing (landed via Phase 0 doc reconciliation,
  see R13); reaching the full 30-day commitment requires refresh-
  token rotation, which is out of scope (see Non-requirements).

## R12. Test coverage

**Vitest (`pnpm test`)** ships colocated `*.test.ts` files for every
new component and module. Concretely:

- `LoginRequest.test.ts` — disabled-until-valid-email submit; submit
  writes `pendingLogin.email` and then navigates to a bare
  `/auth/check` (assert call order: store write happens before
  `goto`; assert the goto target is `/auth/check` with no query
  string); **submit is disabled while a previous submit is in flight**
  (override the auth-client mock to return a manually-controlled
  promise; click submit; attempt a second click before resolving;
  assert `sendMagicLink` was called exactly once and the button has
  `disabled`; resolve the promise and assert the button re-enables);
  a 4xx response renders the inline error and does **not** write to
  `pendingLogin`; **5xx renders the shared Snackbar with the pinned
  message `"Couldn't reach the server. Try again."`**; **the
  rendered DOM contains no `<header>` element** (structural no-
  TopBar regression guard); dev shortcut buttons appear when the env
  var is `'true'` and each of the three `data-test` ids
  (`dev-login-alice`, `…-bob`, `…-carol`) is present individually;
  dev shortcut buttons absent when the env var is absent; **dev
  shortcut click passes the explicit dev password as the second
  argument** (`expect(devPasswordSignIn).toHaveBeenCalledWith(email,
'cairn-dev')` — pins that the literal isn't a default in the
  helper); dev shortcut click passes the resolved user to
  `session.setSignedIn` and does **not** call `goto` (the layout's
  signed-in-on-public-path redirect carries the navigation — see
  R7); **dev shortcut click is also disabled while in flight** (same
  shape as the magic-link submit's in-flight test, but on
  `dev-login-alice`); **dev shortcut rejection renders the same
  Snackbar surface** as the magic-link 5xx branch (override
  `devPasswordSignIn` to reject; assert
  `getByDataTest('login-snackbar')` with the pinned message; assert
  `setSignedIn` was not called).
- `LoginCheck.test.ts` — renders the email passed via the
  component's `email: string` prop; "Send again" re-issues the
  magic-link request with that email; **"Send again" is disabled
  while the previous request is in flight** (manually-controlled
  promise; click; second click; assert call-count-once and the
  button has `disabled`; resolve; assert the button re-enables);
  **the "Sent again." inline confirmation renders after a
  successful resend and auto-clears after 3 seconds** (wrap in
  `vi.useFakeTimers()`; advance the clock); **the rendered DOM
  contains no `<header>` element** (structural no-TopBar regression
  guard, paired with the same check on `LoginRequest`). The route ↔
  store wiring is exercised separately (see
  `auth/check/+page.test.ts` below).
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

## R13. ~~Documentation reconciliation~~ — landed

The doc reconciliation that this section earlier specified
(edits to `docs/development.md` and `docs/architecture.md` —
seed flow, dev-shortcut paragraph, JWT 7-day Max-Age,
`/auth/otp` rename, request-flow tightening) has already landed.
Downstream requirements reference the post-edit docs directly.
The slot is kept (rather than renumbering R14) so any external
references to the requirement number stay stable.

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
_feature_, because a stale bookmarked `/auth/check` doesn't
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

## R15. Auth client throws typed `HttpError` carrying the HTTP status

The auth client (`web/src/lib/auth/model/auth-client.ts`, owned by
R5 + Task 3.1) throws a typed `HttpError extends Error` on any
non-2xx response. The class is exported alongside the four
function APIs:

```ts
export class HttpError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.name = "HttpError";
		this.status = status;
	}
}
```

`message` carries the GoTrue error message (R5's existing message
contract — `payload.msg ?? payload.error_description ?? res.statusText`),
unchanged. `status` is the raw integer HTTP status from the
response. Real `fetch` failures (no response received — typically
`TypeError`) propagate **unchanged**: they are _not_ `HttpError`,
which lets callers distinguish "GoTrue replied with a status" from
"the network ate the request entirely." The malformed-200 guard
(Task 3.1 Decisions) still throws a plain `Error` — there is no
HTTP status to attach when the response was 200.

R1's `LoginRequest` screen depends on this split. Its classifier
is:

- `err instanceof HttpError && err.status >= 400 && err.status < 500`
  → render the inline error under the field
  (`data-test="login-error"`), do **not** navigate, do **not** call
  `setPendingLogin`.
- Anything else — `HttpError` with `status >= 500`, or any
  exception that isn't an `HttpError` at all (network failure,
  malformed-200 guard, etc.) — → flip the Snackbar
  (`data-test="login-snackbar"`) with the pinned generic message
  `Couldn't reach the server. Try again.`, do **not** call
  `setPendingLogin`.

The R8 dev-shortcut handler reuses the same Snackbar surface for
`devPasswordSignIn` rejections (R1 final paragraph), and applies
the same classification rule: 4xx inline (in practice the dev
shortcut has nowhere to render an inline error, so 4xx and 5xx
both fall through to the Snackbar — the classification rule is
the same, only the rendering differs by surface).

The PostgREST wrapper (R6) carries its own typed errors
(`AuthError`, `ApiError`) at
`web/src/lib/shared/http/postgrest.ts:5-27`; R15 brings the same
discipline to the auth client. The class stays in
`auth/model/auth-client.ts` rather than `shared/http/` because it
is specific to the GoTrue surface — PostgREST's typed errors carry
PostgREST-shaped fields (`code`, `details`, `hint`) and aren't a
fit here.

Test coverage extension: `auth-client.test.ts`'s existing "throws
on non-2xx" cases for all four functions (`sendMagicLink`,
`verifyToken`, `devPasswordSignIn`, `logout`) tighten to assert
the thrown value is `instanceof HttpError` with the correct
`status` field, in addition to the existing `instanceof Error`
check. `LoginRequest.test.ts` mocks `sendMagicLink` to reject with
`new HttpError(400, …)` for the inline-error case, `new
HttpError(503, …)` for the Snackbar case, and a plain `new Error(…)`
(or `TypeError`) for the network-failure case — pinning all three
branches of the classifier.

## R16. `/auth/magiclink` is the magic-link send endpoint

`sendMagicLink` (`web/src/lib/auth/model/auth-client.ts`) POSTs to
`/auth/magiclink`. GoTrue exposes both `/auth/otp` and
`/auth/magiclink` as anonymous magic-link send endpoints; in
`supabase/gotrue:v2.158.1` they are functionally equivalent for
Cairn's purposes. Both route the email's `<a href>` through
GoTrue's own `/verify` endpoint regardless of
`MAILER_URLPATHS_MAGICLINK`; both then 302 to
`${redirect_to}#access_token=…&refresh_token=…&type=magiclink`
with the tokens in the URL hash; both emit an OTP code alongside
the link in the email body. The link shape, the redirect
behaviour, and the email body content are identical. The OTP
code in the email body is ignorable dead content (Step 3 has no
UI to enter it, and the security model is unchanged); it is not a
differentiator between the two endpoints.

The endpoint choice is therefore not load-bearing on behaviour.
We standardise on `/auth/magiclink` because:

- `@supabase/supabase-js`'s `signInWithOtp({ email })` calls
  `/auth/v1/magiclink` under the hood (modulo their `/v1` path
  prefix). Cairn doesn't use the JS SDK, but a future contributor
  reading the auth client should see an endpoint name that maps
  cleanly onto the public Supabase documentation they will reach
  for during debugging.
- Every public Supabase tutorial, starter kit, and Stack Overflow
  answer for "Supabase magic link" reaches for `/magiclink`. The
  endpoint name is the de facto standard.
- `/auth/otp` carries the connotation of OTP-code-first flows
  (the SMS / one-time-passcode product surface) which Cairn does
  not implement; `/auth/magiclink` describes Cairn's flow more
  precisely even when both endpoints would have worked.

The relaxed JS-token contract — tokens transit `window.location.hash`
for the few hundred milliseconds the callback page is mounted —
is the substantive cost of adopting the standard flow this
endpoint pairs with. It is documented in `docs/architecture.md`'s
JWT-storage Security-trade-off subsection (the canonical home);
R3 records how the callback page bounds the exposure window via
`history.replaceState` before any HTTP call. The alternative —
keeping tokens out of JS via a custom mailer template
(`MAILER_TEMPLATES_MAGICLINK`) — is recorded in the
Considered-and-rejected section of `docs/architecture.md`. It
trades a few hundred milliseconds of JS exposure for template
plumbing that breaks on every GoTrue mailer-variable rename,
exceeding the security delta's value for Cairn's
data-sensitivity tier.

The `redirect_to` value on `POST /auth/magiclink` is set
explicitly to `${window.location.origin}/auth/callback` rather
than relying on GoTrue's default (which is `GOTRUE_SITE_URL`,
set to `http://localhost:5173` in `docker-compose.yml:44`). The
explicit per-call value (a) lands the post-`/verify` 302 on
`/auth/callback` rather than `/` (which would be the
`SITE_URL`-default behaviour, dropping the user at the route
guard's redirect target without the hash-fragment exchange
running), and (b) keeps dev and prod call sites structurally
identical without env-var threading through the auth client.

`redirect_to` travels in the **query string**, not the JSON
body — `MagicLinkParams` in v2.158.1 has no `RedirectTo` field,
so the body field would be silently dropped. R1 records the
call shape; the query-string carrier and its empirical
justification live in R1 and the `internal/api/magic_link.go`
and `internal/utilities/request.go` references there. R11
records why no `URI_ALLOW_LIST` widen is needed in dev
(same-host short-circuit). The `create_user` flag does not
exist on `/magiclink`: autosignup in dev is implicit
(autoconfirm), and the production gate is server-side via
`GOTRUE_DISABLE_SIGNUP` exactly as R1 already describes.

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
- **CSRF token on `POST /auth/magiclink`** — the request carries no
  cookie (user is signed-out) so there's nothing to forge.
  `SameSite=Lax` plus same-origin makes a token redundant.
- **Account-existence oracle hardening on `/auth/magiclink`** — in
  production (once Step 13 lands `GOTRUE_DISABLE_SIGNUP=true`),
  `POST /auth/magiclink` returns 4xx for unknown emails and 200 for
  known ones, and R1's inline-error branch surfaces the 4xx
  directly in the UI — an enumeration oracle that contradicts
  `docs/invites.md`'s "email is never social information"
  stance. The dev configuration (`GOTRUE_DISABLE_SIGNUP="false"`)
  doesn't expose this in Step 3, so the live mitigation is
  deferred. The fix lands in Step 13's auth-screen hardening:
  collapse known/unknown OTP responses into a single
  "check your inbox" UX (always navigate to `/auth/check`
  regardless of the response status, or mask 4xx into the same
  client-side flow as 2xx). Carried as a load-bearing forward-
  note in `docs/development.md:233` alongside the
  `GOTRUE_DISABLE_SIGNUP=true` / `GOTRUE_MAILER_AUTOCONFIRM=false`
  hardening list.
- **Vitest coverage of `vite.config.ts` proxy wiring** — the
  segment-anchoring contract that gates the cookie-plant narrow, the
  bearer-attach narrow, and the public-path bypass is pinned at the
  predicate layer (`auth-paths.test.ts`, Task 1.4 Step 1). The proxy
  wiring that _consumes_ the predicate inside `proxyReq` / `proxyRes`
  handlers is verified by the smoke `curl` invocations in Task 1.4
  Steps 8–10 and end-to-end by the Playwright auth spec (Task 5.2).
  A unit-layer test of `vite.config.ts` would need to import the
  config and exercise a fake `proxy` event emitter, which has no
  precedent in the codebase and would chase Vite's internal API more
  than the contract; the predicate-plus-smoke split is the
  intentional trade-off.
- **Return-to-original-destination after route-guard redirect** —
  R7's guard unconditionally redirects signed-out hits on private
  paths to `/auth/login`, discarding the original pathname. In Step 3
  the only private path is the placeholder `/`, so the redirect is
  harmless. Once Step 4 lands deep-linkable list URLs
  (`/lists/<uuid>`), a JWT expiry mid-session (or a fresh browser
  tab opened on a bookmarked list URL) will silently land the user
  at `/` after re-auth, not back where they aimed. The minimum
  fix later is a `?next=<pathname>` query on the guard's
  `goto('/auth/login', …)` plus a callback-side read that overrides
  the post-verify `goto('/')` target. Pinning this here so Step 4's
  owner sees the gap during their plan-write, rather than discovering
  it as a bug report after Step 4 ships.
