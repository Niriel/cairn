# Plan: Username + password sign-in (2003)

Sub-step 2003 of step 20 (`2000_username_identity`). It makes the username a
usable credential: register and sign in by username + password on top of 2002's
secure auth BFF, and revise 2001's identity mechanism forward to a stable,
uid-derived GoTrue identity the BFF resolves a typed username to. After this
merges, e-mail's only remaining job is recovery (2004) and the magic-link surface
is retired (2006).

## Context

2001 landed `profiles.username` (case-fold-unique, `a-zA-Z0-9`, 3–30 chars), the
`set_username` RPC, and `user_settings.recovery_email`, and chose a **synthetic
e-mail** mechanism: GoTrue authenticates against
`lower(username)@users.cairn.invalid`, and `set_username` atomically rewrites
`auth.users.email` on every rename (`db/migrations/0019_username_identity.sql:97`).
The parent plan's "Design revision" superseded that: once the credential is a
password, the session model had to be rebuilt, which 2002 did — growing
`auth-proxy/` into a Cairn-shaped BFF with a revocable rotating dual-cookie
session (`__Host-cairn_session` refresh + `__Host-cairn_access` short-lived JWT),
CSRF (`X-Cairn-Auth`), and per-account / per-IP sign-in rate-limiting. 2002 left
`/auth/signin` and `/auth/register` as `501` skeletons — the signin skeleton
already sits behind the rate-limiter and CSRF gate but records no attempts — for
2003 to fill in (`auth-proxy/src/index.ts:138`).

The revised identity mechanism (parent R16): each account gets a **stable,
immutable, uid-derived GoTrue identity** (`<uid>@cairn.internal`) that does not
encode the username, and the BFF **resolves a typed username to its user id** via
the `lower(username)` unique index on every sign-in. `set_username` then touches
only `profiles.username`. This deletes 2001's fragility (the `auth.users.email`
rewrite, the synthetic-e-mail invariant, the SQL↔client domain-drift guard) — the
BFF has to map the typed username to *something* to authenticate, so the resolver
**is** the work, not extra work.

Two facts from the as-built stack shape the mechanism. First, the BFF holds **no
GoTrue admin credential** and GoTrue assigns the account uuid during signup — so
`<uid>@cairn.internal` cannot be set in one shot at signup; it is established by a
**signup-then-rewrite** sequence. The proven account-creation path is the public
`POST /signup` (`scripts/seed.sh:39`) with `GOTRUE_MAILER_AUTOCONFIRM=true`
everywhere (so the password grant works immediately, no inbox round-trip), and a
direct `auth.users.email` write via a `SECURITY DEFINER` RPC is the same shape
2001's `set_username` already used and `docs/development.md` blesses
("signup-then-UPDATE lets each side do what it's good at"). Second, the resolver
needs DB access the BFF does not have today (it only calls GoTrue), so 2003 wires
the BFF to PostgREST for the resolver and the username enrichment (R7).

## Decisions

**Stable identity is `<uid>@cairn.internal`, set by signup-then-rewrite.** The
local-part is the GoTrue uuid (= `profiles.id`), so the BFF computes the login
identity from the resolved user id with **zero extra storage or lookup** — that
is the whole reason to derive it from the uid rather than a random token (a random
token would force a stored username→token map). Since the uuid is unknown until
GoTrue assigns it and the BFF has no admin API, registration: (1) `POST /signup`
with a transient unique `<random>@cairn.internal`; (2) calls a new
`adopt_stable_identity()` `SECURITY DEFINER` RPC that sets
`auth.users.email = public.uid() || '@cairn.internal'` for the caller (derived
from the JWT, so unspoofable, and idempotent); (3) `set_username` for the chosen
handle. Because the RPC is `authenticated`-granted it is reachable by any
logged-in user via the public `/api/rpc/` surface, so its `UPDATE` is **guarded**
to fire only when the current e-mail is `NULL` or already `@cairn.internal` — it
adopts the transient/stable shapes but refuses to overwrite a legacy account's
real recovery e-mail (which survives until the 2006 migration). See Task 2.2. The transient address is random (not username-derived) so two
simultaneous "alice" registrations don't collide at GoTrue's email-unique index —
username uniqueness is enforced separately and later by `set_username`. **The
GoTrue-authenticates-against-a-rewritten-email check is the end-to-end check 2001
deferred** (parent Open questions); Phase 1 confirms it against the real stack
before Phases 3–4 build on it.

**`resolve_username` returns `(id, username)` and is `anon`-callable.** Sign-in
happens before any session exists, so the resolver must work for an
unauthenticated caller — hence `SECURITY DEFINER` granted to `anon`. It returns
the stable user id (for the password grant) and the case-preserving stored handle
(so the signed-in `AuthUser` shows the canonical casing, not whatever the user
typed). Exposing the uuid to anon is acceptable: usernames are public (parent R1),
the uuid is already all over attribution, and R6 locks the only thing it would
otherwise unlock (the password grant). The alternative — giving the BFF a
privileged DB role so the resolver stays internal — adds infra for a uuid that
isn't a secret; rejected for the alpha, noted in Open questions.

**Lock the public password grant to the BFF (R6).** This is the security keystone
the username work introduces. With `resolve_username` public, anyone can compute
`<uid>@cairn.internal`; if GoTrue's `grant_type=password` were publicly reachable,
the per-account / per-IP rate-limiting 2002 built (parent R18) would be trivially
bypassable by hitting GoTrue directly. So the BFF is the **only** password-grant
path: `/auth/signin` performs it server-side, and the `/auth/token` pass-through
(still needed for the legacy magic-link refresh-token grant until 2006) rejects
`grant_type=password`. This reframes the existing `docs/deployment.md` pre-deploy
checklist item rather than dropping it.

**`AuthUser` becomes `{ id, username }`; the BFF enriches every user response.**
The e-mail-as-identity assumption dies: `<uid>@cairn.internal` is meaningless and
must never reach the UI or the data export. The username lives in `profiles`, not
in GoTrue's user object, so the BFF looks it up by uid and injects it into every
response that returns a user — `/auth/signin`, `/auth/register`, `/auth/refresh`
(2002's handler returns the bare GoTrue user today), and the cookie-plant
pass-throughs — so the client adopts an identically-shaped `AuthUser` regardless
of which path restored the session. The data export switches from e-mail to
`@username` at both ends: the `export_my_data()` RPC
(`db/migrations/0018_data_export.sql`) emits `username` instead of
`auth.users.email`, and the HTML renderer
(`web/src/lib/export/model/render-html.ts`) renders `@username` — otherwise the
meaningless `<uid>@cairn.internal` leaks into the canonical `data.json`.

**Registration is open; no invite gate.** The parent Open question ("does
registration stay invite-only?") resolves to *open*, matching the live-alpha
posture (`DISABLE_SIGNUP=false`, intentional) — the BFF just performs the signup
and GoTrue's `GOTRUE_DISABLE_SIGNUP` stays the operator's switch. No
invite-acceptance-creates-account flow is built; that contract is unchanged.
**This is already live but the docs lag**, which is the catch: the live box runs
`DISABLE_SIGNUP=false` (confirmed), so open registration works in prod today — but
the parent *leaned* invite-only, `docker-compose.prod.yml` still defaults
`DISABLE_SIGNUP` to `true` (the prod `.env` overrides it), and
`docs/development.md` still states prod is signup-disabled / invite-only. So
"open" is a real posture that Phase 0 must teach the docs (Task 0.2) so the spec
matches the running box. `docs/invites.md` does **not** speak to signup-openness
(it governs invite *acceptance*), so it is not the citation for this — that
earlier reference is corrected.

**New screens are additive, not a removal.** 2003 adds `/auth/register` and
`/auth/signin` as the primary surface and re-points the route guard to them, but
leaves the magic-link screens (`/auth/login`, `/auth/check`, `/auth/callback`)
reachable. Removing them — and the GoTrue magic-link endpoints — is 2006 (parent
R8), after the live alpha is migrated. This keeps 2003 shippable without a flag
day. No dedicated register/sign-in mockup exists in `design/cairn-screens.jsx`
(only the magic-link `LoginRequest`/`LoginCheck`), so the screens re-use the
`LoginRequest.svelte` structure as the layout reference — recorded in the Phase 4
task — and add a password field and the cross-link.

**Doc reconciliation is Phase 0 (parent R19).** The architecture- and
data-model-doc claims about the synthetic e-mail are corrected before code, so
downstream sub-plans reference the stable-identity spec. Phase 0 also reconciles
the registration-posture docs (`docs/development.md`'s prod signup-disabled note
and the `docs/deployment.md` pre-deploy checklist) to the open-alpha posture, so
the docs stop contradicting the open `/auth/register` this plan ships. Narrative
first; the exact `set_username` RPC-list wording rides with its migration
(Phase 2).

## Architecture

DB work ships pgTAP in `db/tests/`; BFF work ships unit tests in `auth-proxy/test/`
(the stub-GoTrue + ephemeral-server pattern, now also a stub PostgREST); web work
ships Vitest (`web/src/**/*.test.ts`) and Playwright (`web/e2e/auth.spec.ts`)
against the real stack.

### New files

- **`db/migrations/0020_username_auth.sql`** — simplify `set_username` to
  profiles-only (R3); add `public.adopt_stable_identity()` (R1) and
  `public.resolve_username(p_username text)` (R2), both `SECURITY DEFINER` with
  the right grants.
- **`db/tests/adopt_stable_identity.sql`** — pgTAP: sets
  `auth.users.email = <uid>@cairn.internal`; idempotent; rejects unauth/tombstone.
- **`db/tests/resolve_username.sql`** — pgTAP: returns `(id, username)` for a
  case-insensitive match, no row for unknown, callable by `anon`.
- **`web/src/routes/auth/register/+page.svelte`** + **`auth/signin/+page.svelte`**
  — the new screens (R8).
- **`web/src/lib/auth/components/Register.svelte`** + **`SignIn.svelte`** — the
  form components (mirrors the existing `LoginRequest`/`LoginCheck` placement
  under `lib/auth/components/`), plus colocated `*.test.ts`.

### Modified files

- **`auth-proxy/src/index.ts`** — replace the `/auth/signin` and `/auth/register`
  `501` skeletons with real handlers (R4, R5); record rate-limit outcomes; enrich
  `/auth/refresh` + cookie-plant responses with username (R7); reject
  `grant_type=password` on the `/auth/token` pass-through (R6).
- **`auth-proxy/src/lib/session.ts`** — add the password grant, signup, the
  PostgREST-backed resolver + username enrichment helpers.
- **`auth-proxy/src/lib/auth-paths.ts`** + **`web/src/lib/shared/model/auth-paths.ts`**
  — keep the two copies in lockstep (the deep-equal drift test guards them); add
  `/auth/register` + `/auth/signin` to `PUBLIC_AUTH_PATHS` and
  `SIGNED_IN_REDIRECT_PATHS`.
- **`web/vite.config.ts`** — the dev auth middleware mirrors the new BFF handlers
  (signin/register real behaviour, password-grant rejection, username
  enrichment) so dev parity holds; add a PostgREST base for the dev resolver.
  This re-implements a large slice of the BFF in a second place with no shared
  code and no unit test on the dev copy, so it carries a real **drift risk** —
  keep the dev mirror to the *functional contract* the screens/e2e exercise
  (resolve → grant → plant → tokenless `{user}`; the `409`/`401`/`400` shapes;
  enrichment) and deliberately **skip** the security throttles that only matter
  in prod (the per-account/per-IP rate-limiter is auth-proxy-tested, not
  e2e-exercised, so the dev mirror omits it). Each Phase 3 task names what its
  dev mirror includes vs omits.
- **`web/src/lib/auth/model/auth-client.ts`** — add `register(username, password)`
  and `signIn(username, password)`; `assertAuthUser` requires `username`.
- **`web/src/lib/shared/state/session.svelte.ts`** — `AuthUser = { id, username }`;
  the local `isAuthUser` guard checks `username`.
- **`db/migrations/0020_username_auth.sql`** (export RPC) + **`db/tests/export_my_data.sql`**
  — `export_my_data()` emits `p.username` instead of `auth.users.email`, so the
  meaningless identity never reaches `data.json` (R7).
- **`web/src/lib/export/model/render-html.ts`** + **`web/src/lib/export/model/types.ts`**
  — render `@username`, not e-mail; `ExportUser` carries `username`, not `email`.
- **`web/src/lib/auth/components/DevShortcuts.svelte`** + **`auth-client.ts`**
  (`devPasswordSignIn` retired) + **`scripts/seed.sh`** — migrate the dev-login
  shortcut to `signIn(username,password)` and seed known usernames + the stable
  identity, since the R6 lockdown closes the `grant_type=password` path the dev
  shortcut and seed users relied on.
- **`docs/deployment.md`** — reframe the pre-deploy password-grant checklist item
  (now: rejected at the BFF, `/auth/signin` is the only rate-limited path) and the
  dev-login note.
- **`web/src/routes/+layout.svelte`** — route guard redirects signed-out users to
  `/auth/signin`.
- **`docker-compose.prod.yml`** — give `auth-proxy` a `POSTGREST_URL` (and a
  `depends_on: postgrest`) for the resolver. The `auth-proxy` service is defined
  **only** in the prod overlay (`:57-70`), not the prod-safe base
  `docker-compose.yml` (the base's `sidecar` is the avatar service, which also
  carries `POSTGREST_URL` — not auth-proxy); dev runs the BFF via
  `web/vite.config.ts`, not a container, so a base-level `auth-proxy` entry would
  break `docker compose up` in dev. The edit lands in `.prod.yml` (Task 3.1);
  dev gets its PostgREST base from `vite.config.ts`.
- **`db/tests/set_username.sql`** — flip assertion (b): after `set_username`,
  `auth.users.email` is **unchanged** (it no longer rewrites it).
- **`docs/architecture.md`**, **`docs/data-model.md`** — R9 reconciliation.

### Identity flow (sign-in)

```
browser → POST /auth/signin {username,password}  (X-Cairn-Auth, rate-limited)
  BFF: resolve_username(username) → (uid, canonical)         [PostgREST, anon]
       password grant @ gotrue: <uid>@cairn.internal + password   [internal]
       on ok → plantSession(refresh+access cookies)
              → return { user: { id: uid, username: canonical } }   [tokenless]
       on fail/unknown → recordFailure; constant-shape 401
```

### Identity flow (register)

```
browser → POST /auth/register {username,password}  (X-Cairn-Auth)
  BFF: validate format + min length; resolve_username → must be free
       POST /signup {email:<random>@cairn.internal, password}  → {uid, tokens}
       adopt_stable_identity()    → auth.users.email = <uid>@cairn.internal
       set_username(username)     → profiles.username  (23505 ⇒ taken)
       plantSession; return { user: { id: uid, username } }
```

## Phase structure

TDD throughout: pgTAP / Vitest / unit tests are written red before the code that
greens them, within each task (a task is a commit unit).

0. **Phase 0 — reconcile docs (R9).** (0.1) Correct `docs/architecture.md`
   (identity-mechanism narrative + the "Considered and rejected" synthetic-e-mail
   entry) and `docs/data-model.md` (`set_username` → profiles-only, the stable
   `<uid>@cairn.internal` identity, the new `resolve_username` helper) to the
   revised design, before code. Narrative claims only; the `set_username`
   RPC-list wording lands with Phase 2's migration. (0.2) Reconcile the
   registration-posture docs — `docs/development.md`'s prod signup-disabled /
   invite-only note and the `docs/deployment.md` pre-deploy auth checklist — to
   the open-alpha posture (prod `.env` carries `DISABLE_SIGNUP=false`), so the
   docs stop contradicting the open `/auth/register` this plan ships.

1. **Phase 1 — confirm the stable-identity mechanism (spike, R1).** Against the
   running dev stack, prove the end-to-end the parent deferred: `POST /signup`
   with a transient `<random>@cairn.internal` → rewrite `auth.users.email` to
   `<uid>@cairn.internal` via a direct SQL write → GoTrue `grant_type=password`
   succeeds against the rewritten address. Record the confirmed sequence (and any
   adjustment) so Phases 2–4 build on fact, not assumption. De-risks the whole
   sub-step.

2. **Phase 2 — DB revise-forward + new RPCs (R1, R2, R3).** Migration
   `0020_username_auth.sql`: `set_username` profiles-only; `adopt_stable_identity()`;
   `resolve_username()`. pgTAP for each (positive + negative), and flip the
   `set_username` e-mail-rewrite assertion. The `set_username` RPC-list doc edit
   rides here.

3. **Phase 3 — BFF endpoints + resolver wiring (R2, R4, R5, R6, R7).** Wire the
   BFF to PostgREST; implement `/auth/signin` and `/auth/register`; record
   rate-limit outcomes; enrich user responses with username; lock the password
   grant. Mirror the dev middleware and keep `auth-paths` in lockstep.

4. **Phase 4 — client + screens (R7, R8).** `auth-client` gains `register`/`signIn`;
   `AuthUser` carries `username`; the export renders `@username`; new register +
   sign-in screens and routes; route guard re-pointed. Vitest for client +
   screens, Playwright for register → signed-in, sign-in happy path,
   rename-then-sign-in, and constant-shape failure.

## Reference docs and skills

- **`plans/2000_username_identity/PLAN.md`** ("Design revision") and
  **`REQUIREMENTS.md`** (R3, R5, R7, R15, R16, R19) — the parent contract this
  sub-step refines.
- **`plans/2002_session_security/`** — the BFF, dual-cookie session, CSRF, and
  rate-limiter this builds on; `auth-proxy/test/` is the unit-test pattern to extend.
- **`docs/architecture.md`** — the "Authentication" / "JWT storage" /
  "Considered and rejected" sections corrected in Phase 0.
- **`docs/data-model.md`** — `set_username`, the synthetic-domain note, the
  `profiles`/`user_settings` shape; corrected in Phase 0 + Phase 2.
- **`docs/deployment.md`** — the auth pre-deploy checklist (the password-grant
  item reframed by R6); prod vs dev compose and the `auth-proxy` service.
- **`docs/invites.md`** — the invite-*acceptance* policy (`invite_policy`). Note
  it does **not** speak to signup-openness; the open-signup posture (R5) is set by
  this plan's Phase 0 against `docs/development.md` / `docs/deployment.md`, not
  confirmed by `invites.md`.
- **`docs/ui.md`** — TopBar, button-pair order, form-primitive and
  layout-local/visual-global conventions for the Phase 4 screens.
- **`docs/development.md`** — the signup-then-UPDATE pattern and the dev
  password-grant example the spike builds on.
- **`scripts/seed.sh`** — the proven `POST /signup` account-creation shape.

## Open questions

- **Resolver exposure.** Default: `resolve_username` is `anon`-callable and
  returns the uuid, with R6's password-grant lockdown as the paired control.
  Alternative if the lockdown proves insufficient or the uuid exposure is
  unwanted: give the BFF a privileged DB role and keep the resolver internal.
  Settled in Phase 1/3 against what the spike shows.
- **Transient signup address shape.** Default: `<random-uuid>@cairn.internal`,
  rewritten immediately. Phase 1 confirms GoTrue accepts it and the rewrite, and
  whether any GoTrue post-signup state (confirmation tokens) cares about the
  transient value (it should not, with autoconfirm).
- **Register-race orphans.** If two callers race for one handle, the loser's
  signup + `adopt_stable_identity` have already run when `set_username` raises
  23505, so a GoTrue account exists with the stable identity and a *provisional*
  username. Default: the handler raises **before** `plantSession`, so it returns
  `409` with **no** cookies planted and the register screen shows "username
  taken" and stays put (consistent with the screen's `409` handling — planting a
  session here would let the route guard bounce the now-signed-in user off
  `/auth/register` before they could retry). The orphan account is sessionless
  and unreachable (its provisional handle is unguessable), and a server-side
  cleanup of half-registered accounts is out of scope for the alpha. Revisit if
  the race proves common.
- **Min password length.** Default 8, enforced client + BFF; GoTrue's own
  `GOTRUE_PASSWORD_MIN_LENGTH` is the backstop. **Resolved:**
  `GOTRUE_PASSWORD_MIN_LENGTH` is unset across all compose files, so GoTrue's
  default (6) applies; since 8 > 6 the client/BFF minimum is the effective gate
  and an 8-char password is never rejected by GoTrue at signup. No compose change
  needed, and the Phase 1 spike need not re-investigate this.
