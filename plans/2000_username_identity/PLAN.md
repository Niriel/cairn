# Plan: Username identity

Step 20 of the master plan — move identity and sign-in from e-mail to a public
username + password, with e-mail demoted to optional recovery, **and** rebuild
the session model the credential rides on (a revocable, rotating session behind
a small auth BFF, replacing the long-lived non-revocable JWT in the cookie
today). This is an **orchestration plan**: rather than implementing directly,
its phases create and execute six sub-plans, each on its own branch cut from
`2000_username_identity`, merged back before the step merges to `main`.

> **This plan was revised after 2001 shipped.** The original decomposition
> leaned on a synthetic-e-mail GoTrue mechanism and an unchanged "dumb shim"
> session model; that has been superseded by the **session-security + auth-BFF**
> design recorded under "Design revision" below. 2001 is revised _forward_, not
> reverted. Read the Design-revision section before the Decisions above it — the
> Decisions section keeps the cross-cutting choices that still hold, and the
> Design-revision section records what changed and why.

## Context

Cairn is a live alpha at `cairn.lynnscape.eu`. Today the entire identity model
hangs off e-mail: GoTrue authenticates by `auth.users.email` via magic links
plus the six-digit OTP that `plans/1700_email_otp` added; the session
`AuthUser` carries `{id, email}`; and "add this person" is keyed by e-mail
(`send_invitation(p_email)`, `add_circle_by_email`), looking the address up in
`auth.users`. `docs/architecture.md` stated the auth model as "**email magic
links only** … No passwords are ever stored or transmitted by us," and listed
passwords-avoided as a _benefit_ under "Considered and rejected".

That model has two problems the user wants gone. First, e-mail is both the
private contact field _and_ the public add-key, which is the source of the
"add by e-mail is confusing" complaint and a privacy smell. Second, it forces
every user to provide an e-mail address Cairn doesn't actually want. The fix is
a public, unique, user-chosen **username** as the identity and add-key, a
**password** for sign-in, and e-mail demoted to an optional recovery address
(never required, never shown — the `docs/invites.md` privacy contract holds).

The data model is favourable: identity, attribution, membership, circles, and
invitations all hang off the immutable `auth.users.id` (uuid), not off e-mail.
`profiles.display_name` already exists (mutable, not unique); `username` is a
sibling field on the same table (shipped by 2001). The route guard, RLS, and
PostgREST cookie→bearer attachment for `/api` are identity-agnostic and survive
unchanged. What does **not** survive unchanged is the session model behind the
cookie: examining it for this step surfaced that `cairn_session` is a
long-lived, non-revocable access JWT, which is the wrong foundation once the
credential is a brute-forceable password — see "Design revision".

## Decisions

These are the cross-cutting choices that hold across the whole step. The
mechanism-level choices that 2001 made and this revision overturned are recorded
under "Design revision" below.

**Orchestration via sub-branches, not one big branch.** Step 20 spans a DB
schema change, a session-model rebuild, the auth HTTP surface, two reworked
sharing screens, a new recovery flow, and a live-data migration that reverses a
published doc decision. Landing it in one PR would make review and bisection
painful. Each sub-step (2001–2006) gets its own branch cut from
`2000_username_identity`, its own `/write-plan`, its own PR merged back with
`--no-ff`, and is verified independently. `plans/0400_mvp_product/` is the
worked example of this pattern.

**Replace e-mail sign-in, don't supplement it (R8).** The user chose to retire
e-mail login outright. Coexistence was considered and rejected: once e-mail is
optional (R4), a magic-link path can only ever serve the subset of users who
supplied an address, so it can't be the universal sign-in — keeping it would
mean maintaining two login surfaces for no universal benefit. This means the
plan deliberately supersedes the runtime surface of
`plans/0302_signin_anti_enumeration` and `plans/1700_email_otp`, and reverses
the architecture-doc decision — handled as Phase 0 doc reconciliation (R12/R19),
not as a silent contradiction.

**Case-insensitive uniqueness, case-preserving storage (R1, R2).** Usernames
are `a-zA-Z0-9` only and unique on `lower(username)`, so `LaraCroft` blocks
`Laracroft`, while the stored value keeps the user's casing for display. A
unique index on `lower(username)` is the enforcement point — it lives at the DB
so no RPC or client can bypass it (shipped by 2001). The character restriction
keeps usernames unambiguous in `@handle` rendering and in any future URL use,
and sidesteps confusable-Unicode impersonation without a normalization regime.

**Migrate by deriving usernames from display names (R11).** Existing alpha
accounts get an initial username folded from their current `display_name` to
`a-zA-Z0-9` and collision-suffixed to satisfy R1/R2, are moved onto the stable
GoTrue identity (R16), and get an initial password set via the recovery flow
(R9) since every existing account has an e-mail. This avoids a hard "everyone
re-registers" reset and loses no data. It runs last (2006), after the new
surface and session model exist, and is the only prod-facing migration sub-step.

**Recovery e-mail is verified on set/change (R13).** A recovery address only
becomes usable after the user proves ownership via a confirmation sent to it, so
a typo or a hostile redirect can't silently capture someone's password-reset
channel. The recovery address lives outside GoTrue's identity
(`user_settings.recovery_email`, shipped by 2001), so this is a custom verify
step in 2004 (send link/code → confirm → activate). Addresses already confirmed
by the historical magic-link flow are grandfathered as proven at migration (R11);
verification gates only set/change under the new model.

**The 2000 plan is deliberately thin.** Per-sub-step requirements, architecture,
and file inventories live in their own plan directories (`plans/2001_*/` …
`plans/2006_*/`), authored just-in-time by `/write-plan` when each sub-step runs
(as 2001 was). This plan documents the decomposition, the cross-cutting
decisions, the design revision, and the merge/verification checklist.

## Design revision — session security + auth BFF

After 2001 merged, examining "what's actually in the cookie" reframed the
security priority of step 20. The change of credential (e-mail → password) is
the _visible_ part; the larger security issue is the **session model the
credential rides on**, which predates this step and is wrong for a password.

**The gap (verified in code).** `cairn_session` **is** the GoTrue access JWT,
with a ~7-day `Max-Age` (`auth-proxy/src/index.ts:145-150`), and the refresh
token is **discarded** — the shim does `delete json.refresh_token` and stores it
nowhere (`auth-proxy/src/index.ts:154-157`). So the cookie is a bearer valid for
its full lifetime to anyone who captures it, and there is **no server-side
session record** — "sign out everywhere", killing sessions on compromise, and
forcing re-auth after a password change are all impossible. The existing
HttpOnly + token-stripping stance is a _good_ XSS defence and is kept; the gap is
narrowly the long-lived, non-revocable cookie value.

**The decision (approved by the user).** Go **full** rather than patch:

- **Revocable, rotating session (R14).** The cookie carries a rotating
  refresh/session token, not a long-lived access JWT; access tokens become
  short-lived and server-held, minted on demand; refresh uses rotation with
  reuse detection. _This single change is the largest security delta in the
  step._
- **The `auth-proxy` becomes a Cairn-shaped BFF (R15).** It exposes
  `/auth/register|signin|signout|refresh` in Cairn's own shapes and owns all
  GoTrue translation; the browser never sees a token, a `grant_type`, or a
  synthetic e-mail. The SvelteKit app is `adapter-static` with **no server at
  runtime**, so the `auth-proxy` is the only place this logic can live — there
  is no SvelteKit-server option to weigh.
- **Stable GoTrue identity, resolved at the BFF (R16).** Each account gets a
  stable, immutable, uid-derived GoTrue identity (e.g. `<uid>@cairn.internal`);
  the BFF resolves a typed username → user id via the `lower(username)` unique
  index. `set_username` then touches **only** `profiles.username`.
- **Cookie hardening + CSRF + rate-limiting (R17, R18).** `__Host-` cookie
  prefix, an explicit CSRF check on state-changing requests (not `SameSite`
  alone), and per-account / per-IP sign-in throttling.

**Why full, not the middle path.** The `auth-proxy` has to grow regardless: doing
revocable refresh server-side (R14) — store the refresh token, detect access
expiry, call GoTrue's refresh endpoint, rotate, re-plant — _cannot_ live in a
static SPA, so the "keep it a dumb shim" stance is no longer on the table. Once
the BFF exists, the stable-identity + resolver design (R16) is _cheaper_ than
keeping 2001's synthetic e-mail: the BFF already has to map the typed username to
something to authenticate, so the resolver **is** the work, not extra work — and
in exchange we delete fragility (the `auth.users.email` rewrite in
`set_username`, the synthetic-e-mail invariant, and the SQL↔client domain drift
guard). Keeping the synthetic e-mail would carry that fragility for no benefit
once the BFF is doing the lookup anyway.

**What this supersedes.** Two 2001-era choices are reversed (revised _forward_,
not reverted — 2001's column, uniqueness, `recovery_email`, and `set_username`
signature/guards all survive):

- the **synthetic-e-mail mechanism** (`lower(username)@users.cairn.invalid` in
  `auth.users.email`, rewritten by `set_username`) → replaced by R16's stable
  identity + BFF resolver;
- the **"keep the proxy a dumb, identity-agnostic shim / don't widen its trust
  surface"** stance → replaced by the BFF (R15), because the proxy must grow for
  R14 regardless.

No production account is on the synthetic e-mail yet (the live alpha is still
magic-link / real-email; the synthetic scheme exists only in dev seeds), so
establishing the stable identity for real accounts folds naturally into 2006's
migration, which already has to give those accounts passwords.

**Calibration — why this much and not more.** Cairn is a small private alpha, and
`docs/architecture.md` defers heavier hardening "if Cairn ever enters a
data-sensitivity tier (payments, healthcare)." The realistic threats are exactly
three: XSS token theft (already mitigated by HttpOnly, improved by
short-lived + revocable), no session revocation (the real gap), and brute-force
on the new password surface. The design addresses those and removes fragility —
no MFA, no WebAuthn/passkeys, no device fingerprinting, no step-up auth (all
explicit non-requirements).

**Sequencing — security foundation first.** The revocable-session gap exists in
prod today, independent of usernames, and passwords make it newly urgent (a
brute-forceable credential with no "log out everywhere" is the bad combination).
So the session-security + BFF foundation (2002) lands **before** any username
sign-in UI; it can even ship on its own, keeping the current credential working
through the BFF. The username register/sign-in screens (2003) then build on a
BFF that is already secure.

## Architecture

This plan creates no source files directly. Each sub-plan creates its own files
and ships its own tests across the three layers (`db/tests/` pgTAP for
schema/RLS/RPC work; `web/src/**/*.test.ts` Vitest and `web/e2e/` Playwright for
UI; `auth-proxy/` has its own unit tests, e.g. `auth-paths.test.ts`). The
cross-cutting touch-points each sub-plan will work against:

- **`auth-proxy/`** — grows from a transparent shim into the BFF (R15): refresh
  storage + rotation + reuse detection (R14), the `__Host-` cookie and CSRF
  check (R17), sign-in rate-limiting (R18), the username→id resolver and stable
  identity (R16). The dev analogue (`web/vite.config.ts` Vite proxy) and the
  shared `web/src/lib/shared/model/auth-paths.ts` lists move in lockstep.
- **`db/migrations/`** — 2001 added `profiles.username`, the unique index, the
  CHECK, `set_username`, and `user_settings.recovery_email`. Later migrations
  simplify `set_username` to profiles-only (R16), replace `add_circle_by_email`
  / the e-mail branch of `send_invitation` with username-keyed forms, and add
  the live-alpha backfill + stable-identity migration.
- **`web/src/lib/auth/`** — `auth-client.ts` (Cairn-shaped calls to the BFF, no
  GoTrue protocol), new register/sign-in/recovery screens, `session.svelte.ts`
  (`AuthUser` gains `username`, loses the e-mail-as-identity assumption — note
  `assertAuthUser` currently _requires_ `email`).
- **`web/src/lib/invite/` and `web/src/lib/privacy/`** — `InvitePickerSheet`
  and `CircleScreen` swap e-mail fields for username fields; profile sheet,
  members screen, and vote attribution render `@username`.
- **`docs/`** — Phase-0 reconciliation of `architecture.md`, `data-model.md`,
  `invites.md`, `circles.md`, `open-questions.md` (R12 done in 2001; R19's
  session-model / identity-mechanism corrections land with 2002/2003).

### New plan directories (created by each sub-step's `/write-plan`)

- **`plans/2001_username_identity_db/`** ✓ merged — Phase-0 doc reconciliation,
  the synthetic-e-mail spike (now superseded by R16), `profiles.username` +
  case-fold uniqueness + `set_username` + recovery-e-mail home, pgTAP.
- **`plans/2002_session_security/`** — the session-security + BFF foundation:
  revocable rotating session, short-lived server-held access tokens, refresh
  rotation + reuse detection, `__Host-` cookie, CSRF check, sign-in
  rate-limiting, the Cairn-shaped BFF surface. Lands first; prod-facing.
- **`plans/2003_username_auth/`** — DB revise-forward (`set_username`
  profiles-only, stable GoTrue identity), the username→id resolver in the BFF,
  `/auth/register` + `/auth/signin`, the register + sign-in screens, `session`
  carrying username.
- **`plans/2004_password_recovery/`** — recovery-e-mail capture + verify
  (R13), "forgot password" request + reset, via the BFF.
- **`plans/2005_add_by_username/`** — username-keyed invite/circle RPCs and UI,
  `@username` disambiguation across profile/members/votes/attribution.
- **`plans/2006_alpha_migration/`** — backfill usernames from display names,
  stable-identity + initial-password path for existing users, remove the e-mail
  sign-in surface, close the step.

### Branches

```
main
 └─ 2000_username_identity            ← this plan's branch (base for sub-steps)
     ├─ 2001_username_identity_db     ← merged back into 2000_username_identity ✓
     ├─ 2002_session_security         ← merges back (prod-facing; lands first)
     ├─ 2003_username_auth            ← merges back
     ├─ 2004_password_recovery        ← merges back
     ├─ 2005_add_by_username          ← merges back
     └─ 2006_alpha_migration          ← merges back (prod-facing; last)
```

## Phase structure

Sub-step order is load-bearing — each later sub-step builds on the surface the
earlier ones establish. The security foundation is sequenced first (see
"Sequencing" under Design revision).

1. **Phase 1 — 2001: identity model + doc reconciliation.** ✓ Merged. Landed
   the `username` column, case-fold uniqueness, `set_username`, the
   recovery-e-mail home, and the Phase-0 doc reconciliation. Its synthetic-e-mail
   mechanism is superseded by 2003 (R16), revised forward.
2. **Phase 2 — 2002: session-security foundation + auth BFF.** Lands first of
   the remaining sub-steps and is prod-facing. Grows `auth-proxy` into the BFF,
   makes the session revocable (rotating refresh + reuse detection, short-lived
   server-held access tokens), adds the `__Host-` cookie + CSRF check + sign-in
   rate-limiting, and defines the Cairn-shaped auth surface. Keeps the current
   credential working through the BFF so it can ship independently (R14, R15,
   R17, R18). Closes the pre-existing prod session gap regardless of the username
   work.
3. **Phase 3 — 2003: username + password sign-in.** Builds on 2002's BFF.
   Revises 2001 forward — `set_username` becomes profiles-only and a stable
   uid-derived GoTrue identity replaces the synthetic e-mail (R16) — adds the
   username→id resolver and `/auth/register` + `/auth/signin` to the BFF, and
   ships the register + sign-in screens with `session` carrying username (R3,
   R5, R7, R16). Its Phase 0 lands R19's session-model / identity-mechanism doc
   corrections.
4. **Phase 4 — 2004: password recovery.** Builds on 2002 (BFF) and 2003 (sign-in
   to return to). Recovery-e-mail capture + verify-before-effect (R13), the
   "forgot password" request (non-enumerating per R9), and the reset path. Can
   proceed in parallel with 2005 once 2003 is in.
5. **Phase 5 — 2005: add-by-username + disambiguation.** Builds on 2001's
   username column; independent of the session work. Swaps the invite/circle
   RPCs and screens to username-keyed, adds `@username` rendering. pgTAP for the
   new RPCs (positive + negative, preserving the block / invite-policy /
   self-invite checks).
6. **Phase 6 — 2006: migrate the alpha + retire e-mail login, then close.** Last,
   and prod-facing: backfill usernames, move existing accounts onto the stable
   identity (R16) with an initial-password path, then remove the e-mail sign-in
   surface (R8). After it merges, tick the step-20 box in
   `plans/0000_implementation_order.md` and merge `2000_username_identity` to
   `main` with `--no-ff`.

Each sub-plan puts its RED (failing tests) before GREEN (implementation) per
`docs/testing.md`; the orchestration tasks below only sequence the sub-branches.

## Reference docs and skills

- **`.claude/commands/write-plan.md`** — how to create each sub-plan directory
  (branch, number, slug, three files); the orchestration numbering convention.
- **`plans/0400_mvp_product/`** — the worked orchestration-plan example this
  one mirrors (sub-branches cut from the orchestration branch, merged
  `--no-ff`).
- **`docs/architecture.md`** — the "Authentication" / "JWT storage" sections
  the design revision rebuilds (R14–R19); the cookie-shim contract that the BFF
  grows out of.
- **`docs/data-model.md`** — `profiles` / `user_settings`; `set_username` (to be
  simplified to profiles-only); the synthetic-domain note to be replaced.
- **`docs/invites.md`** — the block / invite-policy / self-invite checks that
  must survive the e-mail→username swap; the e-mail privacy contract.
- **`docs/deployment.md`** — prod vs dev compose, the `auth-proxy` service,
  ACME/TLS, SMTP, dev-login gating; the BFF and migration changes are
  prod-facing.
- **`docs/testing.md`** — the three test layers each sub-plan ships against.

## Open questions

- **Where the revocable session is stored server-side.** R14 needs a
  server-side session/refresh record. Default: rely on GoTrue's own
  refresh-token rotation + reuse detection where it suffices, and add a thin
  session table in `auth-proxy`/Postgres only if "sign out everywhere" /
  compromise-kill needs more than GoTrue exposes. Settled in 2002 against the
  installed GoTrue version's capabilities.
- **Exact stable-identity scheme.** `<uid>@cairn.internal` is the leaning shape
  (uid-derived, never delivered, `.internal` is non-resolvable). Confirm the
  local-part/domain and whether GoTrue accepts it through the password grant in
  2003 (the same end-to-end check 2001 deferred for the synthetic e-mail).
- **Does registration stay invite-only, and how is the first account created?**
  Cairn is invite-only per `docs/invites.md`. Default: preserve the current join
  model, swapping only the credential; settled in 2003.
- **Accounts with no recovery e-mail that forget their password.** No self-serve
  path exists by design (R9). Default: operator reset via an admin RPC
  (`docs/admin.md`); confirm whether step 20 adds one or defers it (recorded in
  `open-questions.md` by 2001).
- **Migrating live sessions.** Existing magic-link cookies are long-lived access
  JWTs; 2002/2006 decide whether they are force-expired (everyone re-auths once)
  or allowed to age out. Default: force a single re-auth when the revocable model
  lands, since the old cookies are exactly the non-revocable artefact being
  retired.
