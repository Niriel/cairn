# Plan: Username identity — DB model + doc reconciliation

Sub-step 2001 of step 20 (`plans/2000_username_identity`). Lands the
`username` column, case-fold uniqueness, the `set_username` RPC, and the
recovery-e-mail home; settles the GoTrue mechanism spike; and reconciles
the specification docs that the e-mail→username reversal makes stale —
all _before_ 2002–2005 build on them. This is the DB + docs foundation;
no web code and no live-data migration ship here.

## Context

Cairn's identity hangs off e-mail today. GoTrue authenticates by
`auth.users.email` (magic link + six-digit OTP from
`plans/1700_email_otp`); the session `AuthUser` is `{id, email}`; "add
this person" is keyed by e-mail (`send_invitation(p_email)`,
`add_circle_by_email`), resolved against `auth.users`. `docs/architecture.md`
states the model as "**email magic links only** … No passwords are ever
stored or transmitted by us" and lists passwords-avoided as a _benefit_
under "Considered and rejected". Step 20 reverses that: a public, unique,
user-chosen **username** is the identity and add-key, a **password** is
the credential, and e-mail is demoted to optional recovery.

The data model is favourable. Identity, attribution, membership, circles,
and invitations all hang off the immutable `auth.users.id` (uuid), never
off e-mail (`docs/data-model.md` "secondary-FK-to-profiles" pattern), so
changing the credential and the add-key touches almost nothing
structural. `public.profiles` already holds a mutable, non-unique
`display_name` (`db/migrations/0004_domain_schema.sql:74`); `username` is
a sibling column on the same world-readable table. `public.user_settings`
(same migration, `:96`) is the owner-only home for private per-user
fields and already holds `invite_policy` — the natural home for a
recovery e-mail.

Two findings de-risk the central decision. First, GoTrue's **password
grant already works**: the dev-login shortcut posts
`{email, password}` to `POST /auth/token?grant_type=password` today
(`web/src/lib/auth/model/auth-client.ts` `devPasswordSignIn`), and
`/auth/token` is already in the shim's `COOKIE_PLANT_PATHS`
(`web/src/lib/shared/model/auth-paths.ts`). Second, the cookie/JWT shim
is **identity-agnostic** — it only reads `access_token`/`refresh_token`
from a 2xx body and plants/strips them; whether the JWT's `sub` came from
a synthetic or a real e-mail is invisible to it. So a synthetic-e-mail
mechanism rides the existing rails with no proxy, Caddyfile, or
`auth-paths.ts` change.

The harder problems — the registration/sign-in surface, the verify-
before-effect recovery flow, the add-by-username RPCs, and the live-alpha
migration — are deliberately deferred to 2002–2005. 2001's job is the
column, the change RPC, the recovery-e-mail home, the mechanism decision,
and the doc reconciliation that lets the rest reference a correct spec.

## Decisions

**Synthetic deterministic e-mail, client/RPC-derived — not a proxy
resolver (R5).** GoTrue has no username concept, so something must bridge
username → GoTrue identity. We derive a synthetic e-mail
`lower(username) || '@users.cairn.invalid'` and let the _caller_ compute
it: sign-in (2002) posts the synthetic e-mail to the existing password
grant; `set_username` rewrites `auth.users.email` to the new synthetic
value inside the definer RPC. No server-side lookup, no privacy leak, and
crucially **no widening of the `auth-proxy` trust surface** — the proxy
stays a dumb cookie shim. The rejected alternative keeps a stable
uid-derived GoTrue identity plus a username→identity resolver in
`auth-proxy`; it buys GoTrue's _native_ e-mail-based recovery but couples
the proxy to the username schema and grows the most security-sensitive
component in the stack. Since recovery is a custom flow regardless (the
real recovery e-mail lives outside GoTrue's identity, in `user_settings`
— 2003), the resolver's one advantage doesn't apply. `.invalid` is the
RFC 6761 reserved TLD: a synthetic address can never collide with a
deliverable one and the intent is self-documenting. The dev shortcut
already proves GoTrue accepts `*.test` addresses through the password
grant, so `*.invalid` will work the same way.

**Pin the synthetic domain as one canonical constant.** The SQL function
and any future client must agree on `@users.cairn.invalid` byte-for-byte
or sign-in silently breaks (the user signs in with a synthetic e-mail the
RPC never wrote). 2001 pins it in the migration and documents it in
`data-model.md`; 2002 must reuse the identical value. This is the same
drift hazard the `auth-paths.ts` deep-equal test already guards for the
shim's path lists; a matching guard for the domain constant is worth
considering when 2002 introduces the client-side copy (flagged for 2002,
not built here).

**Case-insensitive uniqueness, case-preserving storage (R1, R2).**
`username` is `^[A-Za-z0-9]{3,30}$` and unique on `lower(username)` via a
non-partial unique index, mirroring the existing
`invitations_target_email_uniq` `lower()`-index pattern
(`db/migrations/0009_invitations.sql`). `citext` is not enabled anywhere
in the schema and we don't introduce it for one column — a `lower()`
expression index is the established Cairn idiom. The 3–30 ASCII-alnum
bound keeps handles unambiguous in `@handle` rendering, fits comfortably
in a synthetic-e-mail local part, and sidesteps confusable-Unicode
impersonation without a normalization regime.

**`NOT NULL` forces a provisional-username seed (R3).** Adding a
`NOT NULL` column to a table the live magic-link and dev-shortcut signup
paths still write means every signup must produce a valid username, even
before the chosen-username surface (2002) exists. So `tg_profile_on_signup`
seeds a deterministic uid-derived provisional —
`substr('u' || replace(new.id::text, '-', ''), 1, 30)` — which is always
valid (`u` + hex) and collision-resistant (uid-derived; the `substr` to
30 truncates the 32-hex uid to `u` + the first 29 hex digits, so it is
overwhelmingly-but-not-provably unique — a collision would fail one
signup at the `lower(username)` index, an accepted negligible risk for a
throwaway value). The `0019` migration
backfills the same expression into every pre-existing row (dev seeds and
the `Deleted user` tombstone at `id = 00000000-…`,
`db/migrations/0004_domain_schema.sql:83`) _before_ `SET NOT NULL`, so the
constraint is satisfiable the moment it lands. The provisional is a
throwaway placeholder: 2002 sets a chosen username on registration, and
2005 overwrites the live-alpha provisionals with display-name-derived
handles. 2001 deliberately does **not** teach the trigger to read a
chosen username from `raw_user_meta_data` — that is the registration
plumbing 2002 owns; baking it in now would speculatively build 2002's
surface against an untested registration flow.

**`set_username` rewrites `auth.users.email` directly, like the admin
RPCs (R4).** Because the synthetic e-mail _is_ the GoTrue identity,
changing the username must rewrite `auth.users.email` atomically with
`profiles.username`, or the next sign-in (computed from the new username)
fails. `set_username` is `SECURITY DEFINER` and writes `auth.users`
directly — the same pattern `admin.ban_user` (`UPDATE auth.users SET
banned_until`) and `public.delete_account` (`DELETE FROM auth.users`)
already establish — rather than going through GoTrue's e-mail-change
confirmation API, which would demand a deliverable address and a
round-trip. It checks `lower(username)` availability in `profiles` first
and raises a distinguishable "taken" error; a `unique_violation` bubbling
up from the `auth.users.email` unique constraint is mapped to the same
error as defence-in-depth. Format/length failures raise a distinct
"invalid" error. The function guards against the unauthenticated and
tombstone callers exactly as `public.delete_account` does.

**Recovery e-mail home only; verification is 2003 (R6).** `user_settings`
gains `recovery_email text` (nullable). The table's existing owner-only
RLS makes it structurally private with no new policy. 2001 stops at the
column: R13's verify-before-effect machinery (a pending/confirmed split,
the confirmation send, the reset path) is 2003's, and pre-deciding its
column shape here would likely be reshaped there.

**Phase 0 reconciles narrative claims; schema-DDL doc edits ride with
the migration (R7).** Two kinds of doc edit. The _narrative_ identity
claims that 2002–2005 read for rationale — `architecture.md`'s
Authentication section and OAuth-rejection entry, the `invites.md`/
`circles.md` "e-mail is the auth identifier / add-key" claim,
`open-questions.md` — are pure prose with no code behind them, so they
land first as Phase 0. The _descriptive_ schema DDL in `data-model.md`
(the `profiles`/`user_settings` blocks, the trigger note, the RPC list)
describes the migration, so each edit is folded into the matching schema
task and lands in the same commit — keeping doc and code in lockstep
rather than letting an up-front doc edit drift from the final migration.
The retirement _mechanics_ (the magic-link callback/hash flow, the shim-
narrowing prose) are left untouched: they describe code that 2005
removes, and editing them now would put the doc ahead of the code in a
surface 2005 owns. Likewise the `invites.md`/`circles.md` edits correct
only the identity claim, not the add-by-username mechanics 2004 owns.

## Architecture

This sub-plan creates one migration, three pgTAP test files, and edits
four docs. No web code.

### New files

- **`db/migrations/0019_username_identity.sql`** — adds
  `profiles.username` (+ CHECK, + `lower()` unique index), backfills
  pre-existing rows with the provisional, sets `NOT NULL`, updates
  `tg_profile_on_signup` to seed the provisional, adds `set_username`,
  and adds `user_settings.recovery_email`. One migration, built up across
  Tasks 1.1–1.3.
- **`db/tests/username_constraints.sql`** — pgTAP for the column: char
  CHECK (positive + negative), length bound (positive + negative),
  case-fold uniqueness (`LaraCroft` vs `Laracroft`), `NOT NULL`,
  world-readable to authenticated callers, the trigger-seeded provisional
  is valid + unique, the tombstone row carries a valid username.
- **`db/tests/set_username.sql`** — pgTAP for the RPC: changes the value
  (mutability), rejects taken (case-insensitively) distinguishably,
  rejects invalid format/length distinguishably, rewrites
  `auth.users.email` to the synthetic value, leaves `auth.users.id`
  unchanged, raises `28000` unauthenticated, refuses the tombstone.
- **`db/tests/recovery_email.sql`** — pgTAP for the column: owner can
  set + read own `recovery_email`; a different authenticated user cannot
  read it (privacy negative case); defaults `NULL`.

### Modified files

- **`docs/architecture.md`** — Authentication section + "Considered and
  rejected" (Phase 0).
- **`docs/data-model.md`** — `profiles` / `user_settings` DDL + prose,
  trigger note, RPC list (folded into Phase 1 schema tasks).
- **`docs/invites.md`**, **`docs/circles.md`** — the identity-claim
  correction only (Phase 0).
- **`docs/open-questions.md`** — one new bullet for the no-recovery-
  e-mail-forgot-password thread (Phase 0).

### The synthetic-e-mail invariant

```
register/sign-in (2002)        set_username (2001, this plan)
        │                              │
        ▼                              ▼
  POST /auth/token          UPDATE profiles.username = 'LaraCroft'
  grant_type=password       UPDATE auth.users.email  = 'laracroft@users.cairn.invalid'
  { email: lower(u)+domain,        (one transaction, definer)
    password }                      │
        │                           ▼
        └────────► auth.users.email ◄──── single source the password grant matches
                   (synthetic, lowercased, never delivered, never shown)

  profiles.username  → public, case-preserving display ('LaraCroft')
  user_settings.recovery_email → private, optional, owner-only (verify in 2003)
```

## Phase structure

TDD ordering: every schema task writes its pgTAP (RED) before the
migration section that turns it green (GREEN). Phase 0 is doc-only (no
tests).

0. **Phase 0 — reconcile narrative docs.** Edit `architecture.md`
   (Authentication + Considered-and-rejected), `invites.md`/`circles.md`
   (identity claim only), and `open-questions.md`. No code; lands first
   so the implementation tasks — and 2002–2005 — reference a correct
   spec. See Task 0.1.
1. **Phase 1 — schema, RPC, recovery-e-mail home.** Task 1.1 lands the
   `username` column, CHECK, `lower()` unique index, the provisional
   backfill + `SET NOT NULL`, and the trigger seed, with its `data-model.md`
   `profiles` edit. Task 1.2 lands `set_username` with the synthetic-
   e-mail rewrite and its `data-model.md` RPC-list edit. Task 1.3 lands
   `user_settings.recovery_email` with its `data-model.md` edit. Each
   task is RED-before-GREEN against `db/tests/`.

## Reference docs and skills

- **`.claude/skills/writing-tasks.md`** — task block format; Phase-0
  doc-reconciliation convention; doc-edit-rides-with-code rule.
- **`docs/testing.md`** — pgTAP is load-bearing; new constraints/RPCs
  get positive _and_ negative cases; the fixture + `request.jwt.claims`
  harness.
- **`docs/data-model.md`** — the `profiles`/`user_settings` split, the
  `lower()`-index idiom, the `tg_profile_on_signup` shape, the RPC list.
- **`docs/architecture.md`** — the Authentication section being reversed;
  the identity-agnostic cookie shim that survives unchanged.
- **`docs/invites.md`** — the e-mail privacy contract and the identity
  claim being corrected; the block/policy/self-invite checks 2004 must
  later preserve.
- **`plans/2000_username_identity/`** — the orchestration plan; the
  step-20 requirements (R1–R13) and the cross-cutting decisions this
  sub-plan refines.

## Open questions

- **Accounts with no recovery e-mail that forget their password.** No
  self-serve path exists by design (step-20 R9). Default: operator reset
  via an admin RPC (`docs/admin.md`). 2001 records the thread in
  `open-questions.md`; whether step 20 adds the operator RPC or defers it
  is settled in 2003/2005, not here.
- **A drift guard for the synthetic-domain constant.** 2001 pins
  `@users.cairn.invalid` in SQL; 2002 adds the client-side copy. Default:
  add a deep-equal/drift test when the second copy appears (2002),
  mirroring `auth-paths-drift.test.ts`. Flagged, not built here.
- **Does `set_username` also need to clear GoTrue's `email_change*`
  staging columns?** Writing `auth.users.email` directly (not via
  GoTrue's change API) leaves `email_confirmed_at` intact — a plain
  `UPDATE … SET email` touches no other column — so an already-confirmed
  user stays signable-in after a username change. The executor must
  confirm the pgTAP harness's `auth.users` carries the columns the RPC
  writes and that a direct e-mail rewrite doesn't trip a harness
  invariant. Verified in Task 1.2's RED step against the test harness; if
  the real `auth.users` shape differs, note it and adjust.
- **The mechanism's _runtime_ behaviour is not verifiable in 2001.** The
  pgTAP suite runs against a stubbed `auth.users` with no GoTrue
  connected (`db/test-bootstrap.sql`), so no test in this sub-plan proves
  GoTrue actually authenticates a directly-SQL-written synthetic
  `@users.cairn.invalid` address through the password grant. The
  dev-shortcut precedent cited in Decisions uses GoTrue-_confirmed_
  `*.test` users, not directly-written synthetic addresses. 2001 pins the
  constant and makes `set_username` honour the invariant; the end-to-end
  "GoTrue accepts the synthetic e-mail + password" check is deferred to
  2002 (manual / Playwright against the real stack). The unconfirmed-
  synthetic-on-_fresh-registration_ risk (a brand-new synthetic-e-mail
  user with no `email_confirmed_at`) lives in 2002, not here — every user
  `set_username` touches in 2001 is already confirmed.
