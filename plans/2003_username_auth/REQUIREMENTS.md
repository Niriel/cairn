# Requirements: Username + password sign-in (2003)

Turn the username identity that 2001 landed into a usable credential on top of
2002's secure auth BFF: register and sign in by **username + password**, backed
by a **stable, uid-derived GoTrue identity** that the BFF resolves a typed
username to — replacing 2001's synthetic-e-mail-from-username mechanism and the
fragility it carried. This is sub-step 2003 of step 20 (`2000_username_identity`);
it refines that plan's R3, R5, R7, R15, R16, and R19. It does **not** add
password recovery (2004), add-by-username (2005), or remove the legacy
magic-link surface (2006) — those are later sub-steps.

## R1. Each account has a stable, uid-derived GoTrue identity

Every account authenticates against GoTrue using a **stable, immutable identity
that does not encode the username**: `<uid>@cairn.internal`, where `<uid>` is the
account's `auth.users.id` (the same uuid as `profiles.id`). It is set **once, at
account creation**, and never changes again — renaming the username (R3) does not
touch it, so the login credential can never break on a rename. The `.internal`
TLD is non-resolvable, so the address is never deliverable and never an
add-key; it is purely the GoTrue login handle. This replaces 2001's
synthetic-e-mail mechanism (`lower(username)@users.cairn.invalid` rewritten by
`set_username`); the synthetic-e-mail invariant, the atomic-rewrite hazard, and
the SQL↔client domain-drift guard all disappear.

Because GoTrue assigns the uuid during signup and the BFF holds no GoTrue admin
credential, the identity is established by a **signup-then-rewrite** sequence: a
transient unique address is used for the GoTrue `POST /signup`, and the email is
then rewritten to `<uid>@cairn.internal` via a `SECURITY DEFINER` RPC that derives
the value from `public.uid()` (so a caller cannot set it to an arbitrary value).
Because that RPC is `authenticated`-granted, it is reachable by any logged-in
caller through PostgREST, so its write is **guarded** to act only when the current
`auth.users.email` is absent or already a `@cairn.internal` value — it can adopt
the transient/stable identity but can never overwrite a legacy magic-link
account's real recovery address (which persists until the 2006 migration).
GoTrue must authenticate the password grant against the rewritten address — this
is the end-to-end check 2001 deferred and must be confirmed against the real
stack before the register/sign-in endpoints are built on it.

## R2. The BFF resolves a typed username to a user id

Sign-in (R4) and registration's availability pre-check (R5) need to turn a typed
username into the account's user id. A `public.resolve_username(p_username text)`
function returns the matching account's `(id uuid, username text)` — the stable
user id and the case-preserving stored handle — resolved via the
`lower(username)` unique index, or no row when no account holds the handle.
("Live" needs no `deleted_at` filter: `delete_account` hard-deletes the profile
row via cascade, so every stored handle belongs to a live account; the tombstone
user's provisional handle is unguessable and its password grant cannot succeed,
so resolving it is harmless.)
It is `SECURITY DEFINER` (the lookup must work for an as-yet-unauthenticated
caller, before any session exists) and granted to `anon` and `authenticated`.
Returning the user id to an unauthenticated caller is acceptable: usernames are
public (parent R1), the uuid already appears throughout attribution, and the
GoTrue password grant it would otherwise unlock is locked to the BFF (R6).

## R3. `set_username` becomes profiles-only (revise-forward)

A new migration simplifies `set_username` to update **only** `profiles.username`.
The `UPDATE auth.users SET email = …` block, the synthetic-e-mail value, and the
TOCTOU branch that mapped the GoTrue email-unique collision onto "username taken"
are removed. Everything else from 2001 survives unchanged: the signature
`set_username(p_username text) RETURNS void`, the `SECURITY DEFINER` /
`authenticated`-only grant, the auth/tombstone guards (errcode `28000`), the
format check (errcode `23514`), the case-fold availability check excluding self,
and the `lower(username)` unique-index backstop (errcode `23505`). The unique
index on `profiles` is now the sole uniqueness guarantee. Renaming touches no
GoTrue state, so a rename can never break the credential (this is what makes R1's
stable identity load-bearing for R5 of the parent plan).

## R4. Sign-in is username + password through the BFF

`POST /auth/signin` accepts a Cairn-shaped body `{ username, password }` and
establishes a session. The browser never sees a token, a `grant_type`, or the
`<uid>@cairn.internal` identity. The BFF: resolves the username to a user id
(R2); if no account matches, fails; otherwise performs the GoTrue password grant
against `<uid>@cairn.internal` with the supplied password; on success plants the
revocable dual-cookie session (the `__Host-cairn_session` rotating refresh token
+ the short-lived `__Host-cairn_access` JWT, exactly as 2002's
`plantSession` does) and returns a tokenless `{ user }` (R7); on failure clears
nothing and returns a **constant-shape** error — a wrong password and an unknown
username return the same status and body, so the response never reveals which
factor failed (parent R18; hygiene, since usernames are public). The endpoint
runs behind 2002's CSRF gate (`X-Cairn-Auth` required) and per-account /
per-IP rate-limiter; the handler **records** each attempt's outcome
(`recordFailure` on a failed grant or unknown username, `recordSuccess` on a
successful grant) — 2002's skeleton did neither.

## R5. Registration creates an account from username + password

`POST /auth/register` accepts `{ username, password }` and creates a fully usable
account. Registration is **open** (no invite gate) — Cairn's alpha posture keeps
GoTrue signup enabled; the BFF performs the signup and GoTrue's
`GOTRUE_DISABLE_SIGNUP` remains the operator's on/off switch. Note a doc-vs-reality drift: the live box already runs `DISABLE_SIGNUP=false`
(confirmed), so the open register surface works in prod — but
`docker-compose.prod.yml` *defaults* the switch the other way
(`GOTRUE_DISABLE_SIGNUP: "${DISABLE_SIGNUP:-true}"`, overridden by the prod `.env`)
and `docs/development.md` still documents prod as signup-disabled / invite-only.
Those stale doc/compose-default claims are reconciled to the open-alpha posture in
Phase 0 (R9) so the spec matches the live box. The BFF validates
the username format and pre-checks availability (R2) before creating anything;
performs the GoTrue `POST /signup` with a transient unique
`<token>@cairn.internal` address and the supplied password (auto-confirmed, so
the credential is immediately usable); rewrites the identity to
`<uid>@cairn.internal` (R1); sets the chosen `username` via `set_username`
(R3); then plants the session and returns a tokenless `{ user }` (R7). A password
shorter than a sane minimum (8 characters) is rejected. The `lower(username)`
unique index is the final backstop for a register-time race: if two callers claim
one handle concurrently, one wins and the other's `set_username` raises "username
taken" (errcode `23505`), surfaced to the user as a taken-name error. Bodies
carry the CSRF header and ride the same gate as sign-in. Registration is open
but not unthrottled: it passes the **per-IP** leg of the sign-in rate-limiter
(no per-account key — there is no account yet) so an open endpoint that creates a
GoTrue user + cascades `profiles`/`user_settings` + two RPC writes per call
cannot be hammered into mass signup from one source. `GOTRUE_DISABLE_SIGNUP`
remains the operator's hard on/off switch.

## R6. The GoTrue password grant is reachable only through the BFF

The password grant (`/auth/token?grant_type=password`) must not be reachable from
the public internet: if it were, an attacker who computed `<uid>@cairn.internal`
for a username (trivial, given R2) could brute-force a password directly at
GoTrue, bypassing the per-account / per-IP rate-limiting (parent R18) that only
the BFF applies. The BFF is the sole password-grant path: its `/auth/signin`
performs the grant server-side, and its `/auth/token` pass-through (kept alive
for the legacy magic-link refresh-token grant until 2006) **rejects**
`grant_type=password`. This reframes — rather than drops — the
`docs/deployment.md` pre-deploy item that today reads "the password grant must be
unreachable for real accounts": the grant becomes the intended sign-in path, but
only via the rate-limited BFF.

## R7. `AuthUser` carries the username, not the e-mail-as-identity

The client session's `AuthUser` carries `{ id, username }` and drops the
`email` field that was the identity assumption. Wherever the app rendered or
exported the account's e-mail as identity, it carries the `@username` instead —
the GoTrue identity is now the meaningless `<uid>@cairn.internal` and must never
surface in the UI **or an export**. This is more than a presentation swap: the
data export's user object is built by the `export_my_data()` RPC
(`db/migrations/0018_data_export.sql`, which emits `auth.users.email`) and
written verbatim into the canonical `data.json`, so the RPC, its pgTAP, the
`ExportUser` type, and the HTML renderer all switch from `email` to `username`,
or the meaningless identity leaks into the downloaded archive. Because GoTrue's user object does not
carry the username (it lives in `profiles`), the BFF **enriches** every
user-returning response — `/auth/signin`, `/auth/register`, `/auth/refresh`, and
the cookie-plant pass-throughs — with the username looked up by uid, so the
client's `AuthUser` is populated identically no matter which path established or
restored the session. `assertAuthUser` and the session-state guard require
`username: string`, not `email`.

## R8. Register and sign-in screens are the primary auth surface

New `web/src/routes/auth/register/` and `web/src/routes/auth/signin/` screens
collect username + password and call the BFF (R4, R5) through a Cairn-shaped
`auth-client` — no GoTrue protocol, no `grant_type`, no synthetic e-mail computed
client-side. They become the **primary** path: the route guard sends a signed-out
user to `/auth/signin` (not the magic-link `/auth/login`), and both routes are
public (signed-out-viewable) and bounce a signed-in user away. The two screens
cross-link ("Create an account" ↔ "Sign in"). They follow the existing auth-screen
idiom (the `LoginRequest.svelte` structure: brand glyph → wordmark → tagline →
blurb → labelled fields → primary action → imprint footer), reuse the
`basic/` form primitives (`Label`, `TextInput`, `Button`), and keep all visual
styling in global tokens/typography per `docs/ui.md`. The legacy magic-link
screens (`/auth/login`, `/auth/check`, `/auth/callback`) remain reachable but
secondary; their removal is 2006's (parent R8), not this sub-step's.

## R9. The identity-mechanism docs are reconciled before the code lands

Per the parent plan's R19, the affected specs are corrected as this sub-step's
Phase 0, before implementation. `docs/architecture.md`'s identity-mechanism
narrative and its "Considered and rejected" synthetic-e-mail entry are corrected
to describe the stable `<uid>@cairn.internal` identity plus the BFF username→id
resolver and why they superseded the synthetic e-mail. `docs/data-model.md`'s
`set_username` description and its synthetic-domain note are corrected to the
profiles-only change and the stable identity, and the new `resolve_username`
helper is documented. Additionally, the registration-posture claims that this
sub-step contradicts — `docs/development.md`'s "prod is `GOTRUE_DISABLE_SIGNUP=true`
/ invite-only" note and the `docs/deployment.md` pre-deploy auth checklist — are
corrected to the open-alpha posture (R5), and the wrong "`docs/invites.md` confirms
open signup" citation is dropped (`invites.md` covers the invite-*acceptance*
policy, not signup-openness). Narrative claims land first (Phase 0); the precise
`set_username` RPC-list / DDL-behaviour wording rides with the migration that
implements it (R3), so reviewers see the spec change beside the code.

## Non-requirements (explicitly excluded)

- **Password recovery / forgot-password.** Capturing and verifying the recovery
  e-mail (parent R13) and the reset flow (parent R9) are 2004's. 2003's register
  screen collects username + password only; recovery-e-mail capture lives in
  Settings later. A "forgot password?" link may be a non-functional placeholder
  or omitted until 2004. **Accepted alpha risk:** this means 2003 ships open
  registration as the primary surface with *no* recovery path of any kind —
  neither self-serve nor operator reset (the parent's operator-reset admin RPC is
  an Open question, not built here) — so a user who forgets their password loses
  the account until 2004 lands. This is a conscious trade-off for the alpha, not
  an oversight.
- **Removing the magic-link sign-in surface.** The legacy `/auth/login`,
  `/auth/check`, `/auth/callback` screens and the GoTrue magic-link endpoints stay
  reachable through 2003; retiring them is 2006 (parent R8). 2003 adds the new
  primary path beside them.
- **Add-by-username / `@username` disambiguation.** Swapping the invite/circle
  RPCs and rendering `@username` across screens is 2005 (parent R6, R10).
- **Invite-gated registration.** Registration stays open per the alpha posture
  (`DISABLE_SIGNUP=false`); no invite-acceptance-creates-account flow is built or
  changed here.
- **Elaborate password policy.** A sane minimum length is enforced; composition
  rules, breach-list checks, and strength meters are a later hardening track
  (parent non-requirement, unchanged).
- **A custom server-side session table.** 2002 settled the session store as
  GoTrue's own rotation (detection-only reuse); 2003 builds on it unchanged and
  adds no new session state.
- **Giving the BFF a GoTrue admin credential.** The mechanism is built on the
  public `POST /signup` + password grant + a `SECURITY DEFINER` rewrite RPC, not
  GoTrue's admin API — no admin key is introduced into the BFF.
