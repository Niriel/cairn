# Requirements: Session security + auth BFF

Rebuild the session model the credential rides on, _before_ the username
sign-in surface lands on top of it. Today `cairn_session` **is** the GoTrue
access JWT, with a ~7-day lifetime, and the refresh token is discarded by the
shim (`auth-proxy/src/index.ts:145-157`) — a cookie that is a bearer valid for
its full lifetime to anyone who captures it, with no server-side session record,
so "sign out everywhere", killing sessions on compromise, and forcing re-auth
after a password change are all impossible. That is the wrong foundation once
the credential becomes a brute-forceable password. This sub-plan makes the
session revocable and rotating, grows the `auth-proxy` shim into a small
Cairn-shaped backend-for-frontend, hardens the cookie, and adds CSRF and
sign-in rate-limiting — while keeping the current magic-link credential working
through the BFF so it ships independently. It is the prod-facing security
foundation of step 20 and refines the parent plan's R14, R15, R17, R18, R19.

## R1. The durable session cookie carries a rotating, revocable refresh token

The durable session cookie no longer holds an access JWT. It holds the GoTrue
**refresh token** — an opaque, server-revocable credential, not a self-validating
bearer PostgREST accepts. The BFF stops discarding the refresh token (it does
today) and plants it in the durable cookie. Because the refresh token is
revocable server-side, capturing the cookie no longer grants an attacker a
full-lifetime bearer: the session can be killed, and a refresh can be denied,
independently of the cookie's own expiry. The durable cookie's `Max-Age` is an
idle horizon (~30 days), not the access-token lifetime. (Parent R14.)

## R2. Access tokens are short-lived, minted by the BFF, in a separate cookie

The access JWT PostgREST validates is **short-lived** (single-digit minutes,
via a lowered `GOTRUE_JWT_EXP`) and **minted server-side by the BFF on demand**
from the durable refresh token — never the durable cookie value. It is
delivered in a _separate_ short-lived `HttpOnly` cookie (`cairn_access`), which
Caddy (prod) and the Vite dev proxy attach as `Authorization: Bearer …` to
`/api` and avatar-write requests, exactly as the single cookie does today. Page
JavaScript never reads it (HttpOnly), and it is never the durable credential.

This keeps `/api` a **direct Caddy→PostgREST proxy** with no per-request
session-store lookup at the edge — the constraint that rules out holding the
access token purely server-side behind an opaque session id (that would force
all `/api` traffic through the BFF, turning the small auth component into a
hot-path data proxy; see PLAN.md "Decisions"). "Minted server-side,
short-lived, not the durable credential" is satisfied; "never touches the
client even in an HttpOnly cookie" is the rejected stricter reading.

## R3. Refresh uses rotation with reuse detection

Each successful refresh issues a **new** refresh token and invalidates the old
one (rotation); the BFF re-plants the rotated token in the durable cookie.
Replay of an already-rotated refresh token (beyond GoTrue's reuse-interval
grace) is treated as a theft signal and **revokes the whole token family**, not
just the replayed token. This rides GoTrue v2.158.1's native rotation +
reuse-detection (`GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED`,
`GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL`); the BFF surfaces a revoked
family as a cleared cookie + a signed-out result, never a silent re-grant.
(Parent R14.)

## R4. Sign-out is revocable, and "sign out everywhere" revokes all sessions

Sign-out is no longer a local cookie-clear that leaves the token valid. The BFF
**revokes the refresh token server-side** via GoTrue's logout endpoint and
clears both cookies. A "sign out everywhere" variant revokes **all** of the
user's sessions (GoTrue `scope=global`), so a compromise can be killed and a
future password change can force global re-auth. After global revocation, no
held refresh token can mint a new access token; existing short-lived access
cookies age out within minutes. (Parent R14.)

## R5. The browser talks to a Cairn-shaped auth BFF

The `auth-proxy` grows from a transparent cookie/JWT shim into a small
**backend-for-frontend** exposing Cairn's own shapes, owning all GoTrue
translation behind it. This sub-plan delivers `POST /auth/refresh` and
`POST /auth/signout` (taking nothing but the cookie + CSRF header, returning a
cookie + a tokenless result), and **defines the route skeletons** for
`POST /auth/register` and `POST /auth/signin` behind the shared middleware
(CSRF, rate-limit) — their credential logic is filled in by 2003. The browser
never selects a `grant_type`, never sees a token, and never sees GoTrue's wire
protocol. The BFF stays the **only** server-side component in the auth path:
the SvelteKit app is `adapter-static` with no runtime server. (Parent R15.)

## R6. The durable session cookie is `__Host-` hardened (prod)

In production the durable session cookie uses the **`__Host-` prefix**
(`__Host-cairn_session`), which the browser enforces as `Secure` + `Path=/` +
**no** `Domain` — closing subdomain cookie-injection. `SameSite` stays `Lax`
(not `Strict`, so following a link into Cairn keeps the user signed in). The
short-lived access cookie is likewise `__Host-`-prefixed in prod. The prefix is
**prod-only**: it mandates `Secure`, which a browser will not send back over
dev's plain-HTTP localhost, so dev keeps the unprefixed names; both the BFF and
the dev proxy derive the cookie name from the same `COOKIE_SECURE` env signal so
the two environments stay in lockstep. (Parent R17.)

## R7. State-changing auth requests carry an explicit CSRF defence

On top of `SameSite=Lax`, every **state-changing** `/auth/*` BFF request
(`/auth/refresh`, `/auth/signout`, and the 2003 `/auth/register`/`/auth/signin`)
must carry an explicit CSRF defence the BFF validates: a **required custom
header** a cross-origin attacker cannot set without a CORS preflight the BFF
does not grant. A request to a state-changing endpoint that lacks the header is
rejected (403) before any side effect. The design does not lean on `SameSite`
alone. (Parent R17.)

## R8. Sign-in is rate-limited per-IP and per-account, with constant-shape failures

The BFF throttles repeated sign-in **failures** with backoff/temporary lockout,
keyed **both** per source IP **and** per account identifier. Sign-in failures
keep a **constant shape** — the response does not reveal which factor failed.
This sub-plan builds and fully unit-tests the rate-limiting middleware and the
constant-shape-failure contract against a stubbed sign-in handler, and mounts
them on the `/auth/signin` skeleton; 2003 plugs the real username+password
credential check in behind the already-proven middleware. (Parent R18; the
full per-username keying completes in 2003 when the username sign-in exists.)

## R9. The current magic-link credential keeps working through the BFF

This sub-plan changes the _session model_, not the _credential_. The existing
magic-link flow (request → e-mailed link/code → callback) keeps working end to
end through the grown BFF: the callback establishes a session by handing the
BFF the refresh token, and the BFF plants the dual cookies. No user loses the
ability to sign in when 2002 ships; username+password is added later (2003).
This is what lets 2002 land and deploy on its own, ahead of the username work.
(Parent R14/R15 "ships independently".)

## R10. Existing live sessions are forced once onto the revocable model

When 2002 deploys to prod, existing long-lived magic-link cookies — the exact
non-revocable artefact being retired — are invalidated, forcing a single
re-authentication onto the revocable dual-cookie model. This is achieved
**structurally**, not by an explicit purge: the prod durable cookie is renamed
to `__Host-cairn_session` and the `/api` bearer is re-pointed at the new
`cairn_access` cookie, so an old `cairn_session`-holding client presents no
`cairn_access` (its `/api` calls fall back to `anon` — its own data disappears)
and, decisively, no valid refresh cookie under the new `__Host-cairn_session`
name, so the boot `/auth/refresh` returns 401 → signed-out → the route guard
bounces it to sign-in. (The boot-refresh, not an `/api` status, is the driver:
an absent bearer yields `anon`/`200 []` on a select, not a 401.) The
non-revocable gap is closed immediately for everyone on deploy. (Parent R14; the "force re-auth" default in
the parent's Open questions, confirmed by the user for 2002.)

## R11. Dev/prod parity: the Vite dev proxy mirrors the BFF

The dev-side cookie shim (`web/vite.config.ts`) and the shared path lists
(`web/src/lib/shared/model/auth-paths.ts` ↔ its copy in
`auth-proxy/src/lib/auth-paths.ts`) move in lockstep with the prod BFF, so the
SvelteKit app sees identical paths and cookie behaviour in both environments.
The existing deep-equal drift test (`auth-proxy/test/auth-paths-drift.test.ts`)
must stay green across every path-list edit. Dual-cookie plant, the
access-cookie re-point, `/auth/refresh`, and the `/auth/signout` reshape all
land in the dev proxy too. (Existing parity contract;
`docs/architecture.md` "Local development parity".)

## R12. The session-model docs are reconciled before code lands

Because this reverses claims the docs (and this step's own 2001 sub-step)
recorded, the affected specs are corrected as the plan's **Phase 0**, before
implementation. `docs/architecture.md` "JWT storage" must stop describing
`cairn_session` as the ~7-day access JWT with the refresh token discarded, and
instead describe the dual-cookie revocable rotating session, the short-lived
BFF-minted access token, the Cairn-shaped BFF surface, and the `__Host-` + CSRF
posture; the `cairn_session` row in the client-side-storage table and the
Request-flow steps are corrected to match. `docs/deployment.md`'s auth-proxy
description and pre-deploy auth checklist are updated to the BFF. Narrative
claims land in Phase 0; the concrete Caddyfile/compose/`.env.prod` mechanics
ride with the implementation tasks that change those files (per parent R19,
"DDL/behaviour doc edits ride with their migration"). The synthetic-e-mail
"Considered and rejected" entry and the `data-model.md` `set_username` notes are
the **identity-mechanism** half of R19 and are corrected by 2003, not here —
deferred deliberately, not missed. (Parent R19, session-model half.)

## Non-requirements (explicitly excluded)

- **Username + password sign-in.** 2002 defines the `/auth/signin` +
  `/auth/register` route skeletons and the middleware they sit behind, but the
  username→id resolver, the stable GoTrue identity, and the credential check are
  2003's (parent R3, R7, R16). 2002 ships with magic-link still the only live
  credential (R9).
- **Password recovery / recovery-e-mail verify.** 2004 (parent R4, R9, R13).
- **The synthetic-e-mail → stable-identity correction.** The identity-mechanism
  half of R19 (architecture.md "Considered and rejected", data-model.md
  `set_username` notes) lands with 2003's stable-identity work, not here (R12).
- **A custom server-side session table in the BFF.** Revocation,
  rotation/reuse-detection, and "sign out everywhere" ride GoTrue v2.158.1's
  native `auth.refresh_tokens` / `auth.sessions` + `/logout?scope=`. A bespoke
  session table is added only if a capability gap is found against the installed
  GoTrue (confirmed by a spike in this plan); the default is GoTrue-native.
- **MFA / second factor, passkeys / WebAuthn, step-up auth.** Parent
  non-requirements; a single factor is the credential for step 20.
- **Device fingerprinting, anomaly detection, per-device session naming.** The
  revocable model gives "sign out everywhere" + compromise-kill; richer
  per-device management is out of scope (parent non-requirement).
- **Elaborate password-strength / breach-list policy.** Out of scope for the
  whole step; only brute-force _rate-limiting_ is required (R8).
- **Replacing GoTrue or moving auth into a SvelteKit server.** The app stays
  `adapter-static`; the BFF is the only server-side auth component (R5).
- **CSRF on the retained GoTrue magic-link plant endpoints.** R7's explicit CSRF
  header is scoped to the **Cairn-shaped** state-changing endpoints
  (`/auth/refresh`, `/auth/signout`, and 2003's `/auth/signin`/`/auth/register`).
  The retained GoTrue pass-throughs (`/auth/token`, `/auth/verify`) establish a
  session from the body's `refresh_token`, not the cookie, so they sit outside the
  check and carry a residual **login-CSRF** vector. This is accepted for 2002: the
  path is the magic-link surface R9 keeps alive, it is removed in 2003, and the
  alpha is small. Not a gap in R7 — a deliberately-bounded exception.
