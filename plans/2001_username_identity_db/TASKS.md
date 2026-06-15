# Tasks

This sub-plan lands the DB foundation for username identity — the
`profiles.username` column, case-fold uniqueness, the `set_username` RPC,
and the `user_settings.recovery_email` home — and reconciles the
specification docs the e-mail→username reversal makes stale. No web code
and no live-data migration ship here (those are 2002–2005).

## Reference skills and docs

- **`.claude/skills/writing-tasks.md`** — Phase-0 doc-reconciliation
  convention; doc-edit-rides-with-code; RED-before-GREEN in one commit.
- **`docs/testing.md`** — pgTAP is the security boundary; every new
  constraint/RPC ships positive *and* negative cases; the fixture +
  `request.jwt.claims` harness.
- **`docs/data-model.md`** — the `profiles`/`user_settings` split, the
  `lower()`-expression unique-index idiom, the `tg_profile_on_signup`
  shape, the "What the app sees" RPC list.
- **`docs/architecture.md`** — the Authentication section being reversed;
  the identity-agnostic cookie shim that survives unchanged.

## Phase 0 — reconcile narrative docs

### [x] 0.1 Reconcile the identity-model claims in architecture, invites, circles, open-questions

**Created:** 2026-06-15T12:42:20Z
**Completed:** 2026-06-15T13:20:31Z

**Why:** Step 20 reverses a published architecture decision ("email magic
links only … No passwords are ever stored or transmitted"). Sub-plans
2002–2005 will read these docs for rationale; if the stale identity
claims stand, every downstream plan references a wrong spec and the
divergence compounds. The narrative claims carry no code, so they land
first.

**Prerequisites:** None.

**Decisions:**
- Reconcile only the **narrative identity claims** here. The
  `data-model.md` schema DDL rides with the migration (Tasks 1.1–1.3),
  not this task. The retirement *mechanics* (the magic-link callback/hash
  flow in `architecture.md`'s "JWT storage" / "Security trade-off"
  sections; the shim-narrowing prose) are **left untouched** — they
  describe code that 2005 removes, and editing them now puts the doc
  ahead of the code in a surface 2005 owns.
- For `invites.md`/`circles.md`, correct **only** the load-bearing
  identity claim (e-mail is the auth identifier / the public add-key).
  The detailed add-by-username RPC/flow rewrite and the fate of
  unregistered-by-e-mail invites are **2004's** — flag them as
  forthcoming, do not resolve them.
- Chosen mechanism to record (resolves the 2000 spike): a synthetic
  deterministic GoTrue e-mail `lower(username) || '@users.cairn.invalid'`,
  client/RPC-derived, password grant unchanged, recovery e-mail stored
  separately in `user_settings`; the rejected alternative is a
  server-side username→identity resolver in `auth-proxy`.
- British English in any user-facing prose; "e-mail" hyphenated in prose,
  `email` in code identifiers.

**Reference:** `docs/architecture.md` §"Authentication: GoTrue + email
magic links" (≈ lines 122–137) and §"Considered and rejected" (the OAuth
entry, ≈ line 321). `docs/invites.md` §"The profile screen" (the
"Email addresses are **never** shown … Email is the auth identifier" para,
≈ lines 64–65) and §"two ways into someone's circle" (≈ lines 26–32).
`docs/circles.md` §"The email-add path" (≈ lines 47–61). Line numbers are
guides — locate by heading/quote, they may have drifted.

**Files:**
- `docs/architecture.md` (modify)
- `docs/invites.md` (modify)
- `docs/circles.md` (modify)
- `docs/open-questions.md` (modify)

**Steps:**
1. `docs/architecture.md` §Authentication: retitle the section away from
   "email magic links" to username + password (e.g. "Authentication:
   GoTrue + username and password"). Rewrite the body: the user signs in
   with a **username + password**; GoTrue authenticates by a synthetic
   deterministic e-mail `lower(username)@users.cairn.invalid` the client
   computes, via the password grant; e-mail is demoted to an **optional
   recovery** address stored separately (`user_settings.recovery_email`),
   never required, never shown. Reframe the "Magic links were chosen
   because… avoid storing a password hash" bullet list honestly — GoTrue
   now stores a password hash; state the trade accepted (a public
   identity + a credential the user controls, no forced e-mail) rather
   than claiming a benefit that no longer holds. Mark the six-digit-OTP
   paragraph as superseded as a *sign-in* surface (its removal is 2005);
   keep the e-mail-provider paragraph but reframe it as recovery /
   verification mail (2003). Because the magic-link "Authentication flow"
   walkthrough further down (the numbered click-the-link / OTP steps,
   ≈ line 252) is deliberately **left intact** for 2005, add a one-line
   forward-pointer in the rewritten Authentication section noting that
   that walkthrough is the *legacy* magic-link sign-in path pending removal
   in 2005 — so the two sections don't silently contradict each other
   between 2001 and 2005.
2. `docs/architecture.md` §"Considered and rejected": correct the
   "Self-host Sign in with Google / Apple" entry's rationale — it
   currently says "something we can do ourselves with magic links";
   change to "with username + password" (OAuth stays rejected). Add a new
   entry recording the reversal itself: *why* the project moved off
   magic-link-only to username + password (e-mail doubling as private
   contact and public add-key was confusing and forced an unwanted
   address), and *why* the synthetic-e-mail mechanism was chosen over a
   server-side username→identity resolver in `auth-proxy` (keeps the
   proxy a dumb identity-agnostic cookie shim; recovery is a custom flow
   either way).
3. `docs/invites.md`: in the "Email addresses are **never** shown" para,
   correct the claim that "Email is the auth identifier and the lookup
   key for unregistered invites" — e-mail is **no longer the auth
   identifier**; the public identity is the **username**, shown as
   `@username` alongside display name and avatar. Keep "e-mail addresses
   are never shown" (still true). Add a one-line forward note that
   add-by-username for registered users arrives in step 20 (→ 2004) and
   that the fate of unregistered-by-e-mail invites is decided there — do
   not rewrite the email-add mechanics.
4. `docs/circles.md` §"The email-add path": add a forward note that
   registered users are added by **username** (→ 2004) and the public
   identity is the username; leave the detailed mechanics for 2004. Do
   not delete the unregistered/e-mail semantics.
5. `docs/open-questions.md`: no stale identity entry exists to clear. Add
   one bullet under a suitable heading (e.g. a new "## Identity" or under
   "Admin") for the genuinely-open thread: *accounts with no recovery
   e-mail that forget their password have no self-serve path (by design);
   operator reset via an admin RPC is the default — add now or defer?*
   Point it at the reconciled `architecture.md` §Authentication. Follow
   the file's own "Opening a question" convention (context in the
   underlying doc, pointer here).

**Verify:** `./scripts/check.sh` (its Prettier step formats Markdown —
run it, or the repo's standalone markdown-format command if quicker);
then re-read each edited section to confirm no stale "magic links only" /
"no passwords" / "e-mail is the auth identifier" claim remains, and that
no callback/hash-flow or shim-narrowing prose was changed.

## Phase 1 — schema, RPC, recovery-e-mail home

### [x] 1.1 Add `profiles.username` (CHECK + case-fold unique index), provisional seed, backfill, NOT NULL

**Created:** 2026-06-15T12:42:20Z
**Completed:** 2026-06-15T13:34:59Z

**Why:** Every later sub-step depends on the column existing. It must be
`NOT NULL` (a username is the identity), case-insensitively unique
(`LaraCroft` blocks `Laracroft`), and populated for every row the instant
the constraint lands — including the dev-seed rows and the `Deleted user`
tombstone, and every future signup via the still-live magic-link/dev
paths.

**Prerequisites:** None (first schema task). The migration directory's
next free number is `0019` (`db/migrations/` runs `0001`–`0018`). Tests
use the `users_alice_bob_carol.sql` fixture and set
`request.jwt.claims` via `set_config('request.jwt.claims', '{"sub":…}', true)`
then `SET LOCAL ROLE authenticated|anon` (see any file in `db/tests/`).

**Decisions:**
- Column: `username text`, constrained `CHECK (username ~ '^[A-Za-z0-9]{3,30}$')`
  — ASCII letters/digits only, length 3–30. Case-preserving storage.
- Uniqueness: `CREATE UNIQUE INDEX profiles_username_lower_uniq ON
  public.profiles (lower(username));` — non-partial (`username` is
  `NOT NULL`), mirroring the `lower()`-index idiom from
  `invitations_target_email_uniq`. `citext` is **not** introduced.
- Provisional seed (used by both the trigger and the migration backfill):
  `substr('u' || replace(new.id::text, '-', ''), 1, 30)` — always valid
  (`u` + hex, length 30). Note the `substr(…, 1, 30)` truncates the
  32-hex uid to `u` + the first 29 hex digits, dropping 3 characters, so
  the value is **not provably collision-free** — collision is negligible
  (≈110 random bits survive), not impossible. Two uids sharing those 29
  leading digits would make the second signup's trigger raise
  `unique_violation` against the `lower(username)` index and fail that
  signup. Acceptable given the probability and the throwaway nature of the
  value, but do not state or rely on "cannot collide". It is a throwaway
  placeholder; the chosen username is set on registration (2002) and the
  live-alpha display-name backfill is 2005. **Do not** read a chosen
  username from `raw_user_meta_data` here — that is 2002's plumbing.
- A `username` change should bump `profiles.modified_at`, consistent with
  `display_name` and `avatar_version`. The profiles `t20_set_modified_at`
  trigger currently fires only `BEFORE UPDATE OF display_name,
  avatar_version` (`db/migrations/0007_avatars.sql:70`), and
  `t05_set_timestamps` freezes `modified_at` on every UPDATE — so without a
  rebind a `username` UPDATE would leave `modified_at` stale. Rebind it:
  `ALTER TRIGGER` cannot change the OF column list, so DROP + CREATE the
  profiles `t20_set_modified_at` with `BEFORE UPDATE OF display_name,
  avatar_version, username` (exactly the DROP+CREATE pattern 0007 used to
  add `avatar_version`).
- Test-harness interaction (RED step): `tg_profile_on_signup` creates a
  `profiles` row — with a provisional `username` — for **every**
  `auth.users` insert, so the CHECK / length / case-fold cases cannot be a
  fresh `INSERT INTO public.profiles` for a new user (PK collision on the
  trigger-created row). Exercise those cases by `UPDATE`-ing the
  trigger-created row (insert into `auth.users`, then update its
  `profiles.username`), not by a second INSERT.
- Folded shape-lock edit (rides in this commit): add `has_column('public',
  'profiles', 'username', …)` to `db/tests/schema_shape.sql` and bump its
  `plan(N)` by one — the repo keeps `schema_shape.sql` current across
  migrations (it already pins `avatar_version`/`set_display_name` from
  0007, `relationships` from 0008, etc.). `set_username` and
  `recovery_email` are added to `schema_shape.sql` by Tasks 1.2 and 1.3
  respectively, so they stay green per task.
- Migration order is load-bearing: `ADD COLUMN` (nullable) → add the
  CHECK as `NOT VALID` or after backfill → backfill every existing row
  (`WHERE username IS NULL`, covering dev seeds **and** the tombstone at
  `id = 00000000-…`) → `SET NOT NULL` → create the unique index → replace
  `tg_profile_on_signup`. Keep the migration idempotent
  (`ADD COLUMN IF NOT EXISTS`, guarded backfill) and wrapped in
  `BEGIN; … COMMIT;` per the repo convention.
- `tg_profile_on_signup` (`db/migrations/0004_domain_schema.sql:272`)
  currently inserts `profiles (id, display_name) VALUES (new.id, 'New user')`.
  Change it to also set `username` to the provisional. Keep the
  tombstone-skip (`new.id = '00000000-…' → RETURN new`) and the
  `user_settings` insert unchanged.
- Folded doc edit (rides in this commit): update the `profiles` DDL block
  and prose in `docs/data-model.md` (≈ lines 74–89) to show `username`
  (+ CHECK, + the unique index) and to stop framing the e-mail in
  `auth.users` as the identity story — `username` is the public identity;
  note the `tg_profile_on_signup` provisional seed in the §Triggers prose
  (≈ line 648).

**Reference:** `docs/data-model.md` §`profiles` and §Triggers;
`docs/testing.md` for the pgTAP harness and positive+negative rule.

**Files:**
- `db/migrations/0019_username_identity.sql` (create)
- `db/tests/username_constraints.sql` (create)
- `db/tests/triggers_profile_on_signup.sql` (modify — assertion 4 omits
  `username`; see Decisions)
- `db/tests/schema_shape.sql` (modify — add the `profiles.username`
  shape-lock; see Decisions)
- `docs/data-model.md` (modify)

**Steps:**
1. RED — Create `db/tests/username_constraints.sql` with a `plan(N)`
   asserting: (a) a row with a valid `username` inserts; (b) an invalid
   `username` is rejected — test a space (`'la ra'`), punctuation
   (`'a@b'`), and non-ASCII (`'naïve'`); (c) a 2-char value and a 31-char
   value are rejected, a 3-char and a 30-char value accepted (length
   bound); (d) case-fold uniqueness — with `'LaraCroft'` present,
   inserting `'Laracroft'` raises `unique_violation`; (e) `username` is
   `NOT NULL`; (f) an authenticated caller (any `sub`) can `SELECT` another
   profile's `username` (world-readable via existing `profiles_select`);
   (g) after a fresh `INSERT INTO auth.users`, the trigger-seeded
   `profiles.username` matches `^[A-Za-z0-9]{3,30}$`; (h) the
   `Deleted user` tombstone row (`id = 00000000-…`) carries a value
   matching the CHECK after migration; (i) `UPDATE`-ing a row's `username`
   bumps `profiles.modified_at` (the `t20` rebind in Decisions) — capture
   `modified_at`, update `username`, assert it advanced.
2. RED — In `db/tests/triggers_profile_on_signup.sql`: supply a `username`
   in assertion 4's `INSERT INTO public.profiles (… ) ON CONFLICT … DO
   NOTHING` (it currently omits it; once `username` is `NOT NULL` the
   NOT-NULL check fires *before* the conflict skip, so the bare INSERT
   would raise and the `lives_ok` would fail), and add an assertion that
   the freshly-signed-up `Dave` row's `username` matches the CHECK regex
   (bump its `plan(N)`).
3. RED — In `db/tests/schema_shape.sql`: add `has_column('public',
   'profiles', 'username', …)` and bump `plan(N)` by one.
4. RED — Run `./scripts/test-db.sh` and confirm the new/edited assertions
   report `not ok` (column/index/trigger don't exist yet).
5. GREEN — Create `db/migrations/0019_username_identity.sql` performing
   the ordered steps in Decisions: add the column, backfill the
   provisional into existing rows, `SET NOT NULL`, add the CHECK, create
   the `lower()` unique index, `CREATE OR REPLACE FUNCTION
   public.tg_profile_on_signup()` to seed the provisional `username` on
   insert (preserving the tombstone-skip and `user_settings` insert), and
   DROP + CREATE the profiles `t20_set_modified_at` trigger with `username`
   added to its `OF` list (per Decisions).
6. GREEN — Re-run `./scripts/test-db.sh`; confirm `username_constraints.sql`,
   `triggers_profile_on_signup.sql`, and `schema_shape.sql` are green.
7. Update `docs/data-model.md` per the folded doc edit in Decisions.

**Verify:** `./scripts/test-db.sh` · `./scripts/check.sh`

**Notes:**
- **Side work (not in the task's Files list):** `db/tests/triggers_set_timestamps.sql`
  does a direct `INSERT INTO public.profiles (id, display_name, created_at,
  modified_at)` for "Eve" (it deletes the trigger-seeded row first to test
  the timestamp-override path). Once `username` became `NOT NULL` this INSERT
  raised `23502` and red the suite. Fixed by adding `username = 'EveHandle'`
  to that INSERT. The task anticipated the trigger/PK-collision interaction
  for the *new* test but not this pre-existing direct insert.
- **User decision captured mid-task:** e-mail is **not** unique across
  accounts — a user may run two accounts on one e-mail to follow different
  lists. The synthetic-e-mail mechanism already satisfies this (real e-mail
  only lives in `user_settings.recovery_email`, a plain column). Recorded so
  Task 1.3 / 2003 never add a unique constraint on `recovery_email` and the
  2003 reset flow resolves by username + e-mail ownership, not e-mail alone.

### [x] 1.2 Add the `set_username` RPC with the synthetic-e-mail rewrite

**Created:** 2026-06-15T12:42:20Z
**Completed:** 2026-06-15T13:43:17Z

**Why:** A user must be able to change their username at any time (step-20
R5). Because the synthetic e-mail derived from the username *is* the
GoTrue identity, the change must rewrite `auth.users.email` atomically
with `profiles.username`, or the next sign-in (computed from the new
username) fails. The RPC must reject taken/invalid names with errors the
UI can tell apart.

**Prerequisites:** Task 1.1 (the `username` column, CHECK, and unique
index exist; the migration file `0019_username_identity.sql` exists and
this task appends to it).

**Decisions:**
- Signature: `public.set_username(p_username text) RETURNS void`,
  `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth` —
  matching the shape of `public.set_display_name`
  (`db/migrations/0007_avatars.sql:41`) and `public.delete_account`
  (`db/migrations/0014_delete_account.sql:36`).
- Guards (mirror `public.delete_account`): `public.uid() IS NULL` →
  `RAISE EXCEPTION … USING errcode = '28000'`; reject the tombstone
  (`uid = '00000000-…'`) with `errcode = '28000'`.
- Validation: reject `p_username` not matching `^[A-Za-z0-9]{3,30}$` with
  a **distinguishable** error (a dedicated message and/or SQLSTATE the UI
  maps to "invalid handle", e.g. `RAISE EXCEPTION 'invalid username'`).
- Availability: reject when `lower(p_username)` already exists in
  `public.profiles` for a different `id` with a **distinct**, separable
  error (`RAISE EXCEPTION 'username taken'`). The **testable** guarantee
  is the `profiles` `lower(username)` unique index plus this in-RPC
  SELECT. As defence-in-depth, wrap the writes in a `BEGIN … EXCEPTION
  WHEN unique_violation` that maps the `auth.users.email` / `profiles`
  unique collision to the same `'username taken'` error, so a TOCTOU race
  surfaces the same way. **Caveat:** the test-harness `auth.users`
  (`db/test-bootstrap.sql`) has **no** unique index on `email` — only
  prod GoTrue does — so the `auth.users.email` branch of that handler
  cannot fire or be asserted in pgTAP. Do **not** write a `set_username.sql`
  assertion that expects the auth-side `unique_violation` to be the thing
  that rejects a taken name; assert the taken-error via the `profiles`
  path. (Optionally note this prod/dev divergence in a comment, or add a
  unique index on the stub `email` — but the `profiles` index is the
  load-bearing guarantee either way.)
- Synthetic e-mail: `UPDATE auth.users SET email = lower(p_username) ||
  '@users.cairn.invalid' WHERE id = public.uid();` — the pinned canonical
  domain. Write `auth.users.email` directly (precedent:
  `admin.ban_user` writes `auth.users.banned_until`); do **not** route
  through GoTrue's e-mail-change confirmation API. Update
  `public.profiles.username = p_username` (case-preserving) in the same
  transaction. Confirm in the RED step that the pgTAP harness's
  `auth.users` carries an `email` column and that the direct rewrite
  doesn't trip a harness invariant; if the real `auth.users` shape forces
  also touching `email_confirmed_at`/`email_change*`, note it and adjust.
- Never touch `auth.users.id` — sessions, attribution, and membership
  hang off it and must survive the change.
- Folded doc edit (rides in this commit): add `set_username` to the
  `docs/data-model.md` "What the app sees" RPC list (≈ lines 699–700),
  and pin the synthetic domain `@users.cairn.invalid` in prose near the
  `profiles`/`username` section, noting that any client computing the
  synthetic e-mail (2002) must reuse the identical constant or sign-in
  breaks (drift hazard, like `auth-paths.ts`).

**Reference:** `db/migrations/0014_delete_account.sql` (the
unauth/tombstone guard pattern); `db/migrations/0017_admin.sql`
(`admin.ban_user` writing `auth.users` under `SECURITY DEFINER`);
`docs/testing.md`.

**Files:**
- `db/migrations/0019_username_identity.sql` (modify — append the RPC)
- `db/tests/set_username.sql` (create)
- `db/tests/schema_shape.sql` (modify — add the `set_username` shape-lock)
- `docs/data-model.md` (modify)

**Steps:**
1. RED — Create `db/tests/set_username.sql` with a `plan(N)` asserting,
   as an authenticated caller via `request.jwt.claims`: (a) `set_username('NewName')`
   changes `profiles.username` to `'NewName'` (mutability, case
   preserved); (b) after the call, `auth.users.email` for the caller is
   `'newname@users.cairn.invalid'`; (c) `auth.users.id` is unchanged;
   (d) calling `set_username` with a name already held by another user
   under case-fold (`'Laracroft'` when `'LaraCroft'` exists) raises the
   **taken** error, distinguishable from (e) calling with an invalid
   value (`'a@b'`, `'ab'`, a 31-char string) which raises the **invalid**
   error — assert the two are separable (different message or SQLSTATE);
   (f) re-setting to the caller's *own* current value (case-variant of
   it) succeeds (self is excluded from the taken check); (g) an
   unauthenticated caller (no `sub`) raises `28000`; (h) the tombstone
   caller raises `28000`.
2. RED — Run `./scripts/test-db.sh`; confirm `set_username.sql` reports
   `not ok` (function doesn't exist). Also confirm here that the harness
   `auth.users` exposes the `email` column the RPC writes.
3. RED — In `db/tests/schema_shape.sql`: add `has_function('public',
   'set_username', ARRAY['text'], …)` and bump `plan(N)` by one.
4. GREEN — Append `CREATE OR REPLACE FUNCTION public.set_username(...)`
   to `db/migrations/0019_username_identity.sql` per Decisions, plus the
   `GRANT EXECUTE` that the sibling RPCs use (match `set_display_name`'s
   grant).
5. GREEN — Re-run `./scripts/test-db.sh`; confirm `set_username.sql` and
   `schema_shape.sql` are green.
6. Update `docs/data-model.md` per the folded doc edit in Decisions.

**Verify:** `./scripts/test-db.sh` · `./scripts/check.sh`

### [ ] 1.3 Add `user_settings.recovery_email` (private, owner-only)

**Created:** 2026-06-15T12:42:20Z
**Completed:**

**Why:** E-mail's only remaining job is recovering a lost password
(step-20 R4/R9). This task establishes its **home**: a private, optional,
owner-only column. Capturing it, verifying ownership before it takes
effect (R13), and the reset flow are 2003 — not here.

**Prerequisites:** Task 1.1 (the `0019_username_identity.sql` migration
exists and this task appends to it). `public.user_settings`
(`db/migrations/0004_domain_schema.sql:96`) already has owner-only RLS
(`user_settings_select`/`_update USING (id = public.uid())`).

**Decisions:**
- Column: `recovery_email text` on `public.user_settings`, nullable,
  default `NULL`. No new RLS policy — the table's existing owner-only
  policies make it structurally private (never returned to another user,
  never rendered, never an add-key), honouring the `docs/invites.md`
  e-mail privacy contract.
- No format CHECK and no verification state here. R13's pending/confirmed
  split and the confirmation send are 2003's; pre-shaping the column now
  risks 2003 reshaping it. A `recovery_email` written before 2003 carries
  no verification and must not back a reset until 2003 adds that
  machinery.
- Folded doc edit (rides in this commit): add `recovery_email` to the
  `docs/data-model.md` `user_settings` DDL block and prose (≈ lines
  96–107) — optional, owner-only, recovery-only, verified before use in a
  later step; confirm the doc's "any private user-level field that
  follows the user lives here" framing now names `recovery_email`.

**Reference:** `docs/data-model.md` §`user_settings` (the owner-only
structural-privacy rationale); `docs/invites.md` (e-mail is private,
never shown).

**Files:**
- `db/migrations/0019_username_identity.sql` (modify — append the column)
- `db/tests/recovery_email.sql` (create)
- `db/tests/schema_shape.sql` (modify — add the `recovery_email`
  shape-lock)
- `docs/data-model.md` (modify)

**Steps:**
1. RED — Create `db/tests/recovery_email.sql` with a `plan(N)` asserting:
   (a) `recovery_email` defaults `NULL` on a freshly seeded settings row;
   (b) the owner (`request.jwt.claims.sub` = the row's `id`) can
   `UPDATE … SET recovery_email = 'me@example.test'` and read it back;
   (c) a *different* authenticated user cannot read the owner's
   `recovery_email` (the row is not visible under `user_settings_select`
   — assert the select returns no row), the privacy negative case.
2. RED — Run `./scripts/test-db.sh`; confirm `recovery_email.sql` reports
   `not ok` (column doesn't exist).
3. RED — In `db/tests/schema_shape.sql`: add `has_column('public',
   'user_settings', 'recovery_email', …)` and bump `plan(N)` by one.
4. GREEN — Append `ALTER TABLE public.user_settings ADD COLUMN IF NOT
   EXISTS recovery_email text;` to `db/migrations/0019_username_identity.sql`.
5. GREEN — Re-run `./scripts/test-db.sh`; confirm `recovery_email.sql` and
   `schema_shape.sql` are green.
6. Update `docs/data-model.md` per the folded doc edit in Decisions.

**Verify:** `./scripts/test-db.sh` · `./scripts/check.sh`
