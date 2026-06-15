# Requirements: Username identity — DB model + doc reconciliation

The database foundation and specification reconciliation for step 20
(`plans/2000_username_identity`). This sub-step lands the `username`
column with case-insensitive uniqueness, the `set_username` RPC, and the
recovery-e-mail storage location; settles how username + password rides
GoTrue (the mechanism spike); and reconciles the specification docs that
the e-mail-as-identity reversal makes stale, *before* any of the later
sub-steps (2002–2005) reference them. No web code and no live-data
migration ship here — those are 2002–2005. Requirement numbers below are
local to this sub-plan; the parenthetical traces back to the step-20
contract in `plans/2000_username_identity/REQUIREMENTS.md`.

## R1. `profiles.username` is the public identity column (→ step-20 R1)

`public.profiles` gains a `username text NOT NULL` column. The value is
constrained at the database to `^[A-Za-z0-9]{3,30}$` — ASCII letters and
digits only (no spaces, punctuation, or non-ASCII), length 3–30
inclusive — enforced by a `CHECK` constraint so no RPC or client can
write an invalid handle. The stored value preserves the casing the user
typed (`LaraCroft` is stored as `LaraCroft`); only comparison folds case
(R2). The column is world-readable to exactly the extent the existing
`profiles_select` policy already grants — any authenticated caller can
read any profile row, so any authenticated caller can read any
`username`. No new policy is added and `profiles_select` is not widened
or narrowed.

## R2. Username uniqueness is case-insensitive, enforced at the DB (→ step-20 R2)

A unique index on `lower(username)` over `public.profiles` makes
`LaraCroft` and `Laracroft` mutually exclusive: whichever is written
first blocks the other, regardless of which RPC or client attempts the
second write. The guarantee is structural (a database index), not
RPC-local. The index is non-partial because `username` is `NOT NULL`.

## R3. Every account has a username from the moment it is created (→ step-20 R1, R11)

Because `username` is `NOT NULL`, every row in `public.profiles` must
carry a valid value at all times — including rows created before the
chosen-username surface exists (2002) and the live-alpha backfill (2005).
Two paths satisfy this:

- **On signup:** `tg_profile_on_signup` seeds a **provisional**,
  deterministically uid-derived username that is guaranteed valid under
  R1 and collides under R2 only with negligible probability (the seed is
  `substr('u' || uid-hex, 1, 30)` — `u` + the first 29 of 32 hex digits;
  see PLAN/TASKS — so it is *not* provably collision-free, just
  overwhelmingly unlikely to collide; a collision would fail that one
  signup at the unique index). This keeps every signup path — the legacy
  magic-link flow and the dev shortcut, both still live until 2005 —
  working without a chosen username.
- **On migration:** the `0019` migration backfills the provisional value
  into every pre-existing `profiles` row (the dev-seed accounts and the
  `Deleted user` tombstone row at `id = 00000000-…`) before it sets the
  column `NOT NULL`, so the constraint is satisfiable the instant it is
  added.

The provisional value is a placeholder, not a chosen identity. The
chosen-username registration path is 2002; the display-name-derived
backfill for live alpha accounts is 2005 (which overwrites the
provisional). 2001 only guarantees the column is always populated and
valid.

## R4. `set_username` changes the username atomically with distinguishable errors (→ step-20 R5)

A `public.set_username(p_username text)` `SECURITY DEFINER` RPC lets the
authenticated caller change their own username. It:

- validates `p_username` against R1's character + length rule, rejecting
  an invalid value with a **distinguishable** error the UI can map to
  "that handle isn't allowed";
- rejects a value already taken under R2's case-insensitive rule
  (excluding the caller's own current value) with a **distinguishable**
  error the UI can map to "that handle is taken" — distinct from the
  invalid-format error;
- on success, updates `public.profiles.username` to the case-preserving
  value **and** rewrites the caller's synthetic GoTrue identity e-mail
  (R5) in `auth.users` in the same transaction, so the two never drift;
- raises an authentication error (SQLSTATE `28000`) when the caller is
  not signed in, and refuses to operate on the tombstone user, matching
  the guards on the existing `public.delete_account` RPC.

Changing a username never breaks sign-in, session, attribution, or
membership: those hang off the immutable `auth.users.id`, which
`set_username` never touches.

## R5. Username + password rides GoTrue via a client-derived synthetic e-mail (→ step-20 R3, R4; resolves the 2000 mechanism spike)

GoTrue authenticates by `auth.users.email` and has no username concept.
The bridge is a **synthetic, deterministic e-mail derived from the
username**: `lower(username) || '@users.cairn.invalid'`. This is the
chosen mechanism (the alternative — a server-side username→identity
resolver inside `auth-proxy` — is rejected; see PLAN Decisions).
Consequences this sub-step must satisfy:

- The synthetic domain (`@users.cairn.invalid`) is pinned as a single
  canonical constant. The `set_username` RPC writes
  `lower(p_username) || '@users.cairn.invalid'` into `auth.users.email`;
  any later client that computes the synthetic e-mail (2002 sign-in/
  register) must reuse the identical domain, or sign-in breaks. The
  pinned value and the drift risk are documented in `data-model.md`.
- The synthetic e-mail is never deliverable and never shown; it is an
  internal identity token, not contact information. `.invalid` is the
  RFC 6761 reserved TLD, so it can never collide with a real address.
- The cookie/JWT shim (`auth-proxy` in prod, the Vite proxy in dev) is
  **unchanged**: the password grant (`POST /auth/token?grant_type=
  password`) and its cookie-plant path are already wired and identity-
  agnostic. No `auth-proxy`, Caddyfile, or `auth-paths.ts` change is
  required by the mechanism.

This sub-step does **not** wire registration or sign-in (2002); it only
fixes the mechanism, pins the constant, and makes `set_username` honour
the synthetic-e-mail invariant.

## R6. The recovery e-mail lives in `user_settings`, private and optional (→ step-20 R4)

`public.user_settings` gains a `recovery_email text` column, nullable,
defaulting `NULL`. It inherits the table's existing owner-only RLS
(`using (id = public.uid())`), so it is structurally private — never
returned to any other user, never rendered, never an add-key, honouring
the `docs/invites.md` e-mail privacy contract. 2001 establishes the home
only: capturing a recovery e-mail, **verifying ownership before it takes
effect**, and the reset flow are 2003. A `recovery_email` written before
2003 ships carries no verification state and must not be treated as a
usable reset target until 2003 adds that machinery.

## R7. The specification docs are reconciled before downstream sub-plans read them (→ step-20 R12)

The e-mail-as-identity reversal is reconciled across the docs as this
sub-plan's Phase 0 (narrative claims) and folded into the schema tasks
(descriptive DDL), so 2002–2005 reference a correct spec:

- **`docs/architecture.md`** — the "Authentication: GoTrue + email magic
  links" section is retitled and rewritten to username + password as the
  primary credential with e-mail demoted to optional recovery; the
  "magic links chosen because… avoid storing a password hash" rationale
  is reframed honestly (GoTrue now stores a hash); the OTP paragraph is
  marked superseded as a sign-in surface; the "Considered and rejected"
  OAuth entry's "we can do ourselves with magic links" rationale is
  corrected, and a new entry records *why* the project moved off
  magic-link-only and chose the synthetic-e-mail mechanism over a
  resolver.
- **`docs/data-model.md`** — the `profiles` and `user_settings` DDL gains
  `username` (+ index, CHECK) and `recovery_email`; the prose stops
  claiming "the email address stays in `auth.users` and is never shown"
  is the identity story; the `tg_profile_on_signup` description notes the
  provisional-username seed; the RPC list gains `set_username`. These
  edits land **with** the migration (same commits) so doc and schema
  agree.
- **`docs/invites.md` / `docs/circles.md`** — only the load-bearing
  identity claim is corrected: e-mail is no longer "the auth identifier"
  and no longer the public add-key for registered users; username is the
  public identity. The detailed add-by-username RPC/flow rewrite and the
  fate of unregistered-by-e-mail invites are **deferred to 2004** and
  flagged as forthcoming, not resolved here.
- **`docs/open-questions.md`** — no stale identity entry exists to clear;
  add a bullet for the one genuinely-open thread (accounts with no
  recovery e-mail that forget their password → operator-reset, defer vs
  add) pointing at the reconciled `architecture.md` section.

The retirement *mechanics* (the magic-link callback/hash flow, the shim
narrowing prose) are **not** edited here — they are reconciled in 2005
when their code is removed, to avoid the doc racing ahead of the code in
a surface another sub-plan owns.

## Non-requirements (explicitly excluded)

- **Registration and sign-in screens / the `AuthUser` username field.**
  The chosen-username surface, password register/sign-in, and the
  session carrying `username` are 2002. 2001 ships no web code.
- **Recovery-e-mail capture, ownership verification, and password
  reset.** 2001 only adds the `recovery_email` column. The set/change/
  verify-before-effect flow and the reset path are 2003.
- **Add-by-username RPCs and `@username` rendering.** Swapping
  `send_invitation` / `add_circle_by_email` for username-keyed forms and
  showing `@username` across screens is 2004. 2001 corrects only the
  doc's identity claim, not the RPCs.
- **Backfilling usernames from display names and removing the e-mail
  sign-in surface.** The live-alpha migration and the retirement of the
  magic-link request/check/callback path are 2005 (the only prod-facing
  sub-step). 2001's backfill is the throwaway provisional, not the
  display-name derivation.
- **Replacing GoTrue or widening the `auth-proxy` trust surface.** The
  synthetic-e-mail mechanism is deliberately client/RPC-derived so the
  proxy stays a dumb cookie shim; a server-side resolver is rejected.
- **Username history, reserved-name registry, password-strength policy.**
  Out of scope for all of step 20 per the orchestration contract.
- **Hiding `recovery_email` from `admin.inspect_user`.** `admin.inspect_user`
  returns the whole `user_settings` row via `to_jsonb(s)`, so the new
  `recovery_email` becomes visible to `cairn_admin` / `cairn_readonly`
  operators. This is intentional and consistent with the function already
  exposing `auth.users.email`: `inspect_user` is the operator's
  break-glass inspection tool, structurally unreachable via PostgREST, and
  not part of the user-facing/PostgREST e-mail-privacy contract in
  `docs/invites.md`. No allowlist split is added for `user_settings`.
