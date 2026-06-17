# Tasks

Sub-step 2003 of `2000_username_identity`. Builds username + password sign-in on
2002's auth BFF and revises 2001's identity mechanism forward to a stable,
uid-derived GoTrue identity. Each task is a self-contained, commit-sized unit;
RED steps precede GREEN within a task.

## Reference skills and docs

- **`.claude/skills/writing-tasks.md`** — task format; route-test filenames drop
  the `+`; watch cross-task toolchain coupling (a route guard's `resolve('/x')`
  needs route `/x` to already exist).
- **`docs/testing.md`** — pgTAP positive **and** negative for every RPC; Vitest
  for `lib/` + components (user-visible behaviour); Playwright for new flows.
- **`docs/architecture.md`** — "Authentication" / "JWT storage" / "Considered and
  rejected"; the BFF + dual-cookie session contract.
- **`docs/data-model.md`** — `set_username`, the synthetic-domain note, the
  `profiles` / `user_settings` shape; the RPC list.
- **`docs/deployment.md`** — prod vs dev compose, the `auth-proxy` service, the
  Caddy `@gotrue` allow-list, the pre-deploy auth checklist.
- **`docs/ui.md`** — TopBar, button-pair order (right = forward/committal),
  form-primitive conventions, "layout local, visual global".
- **`docs/development.md`** — the signup-then-UPDATE pattern; the dev
  password-grant curl example.

## Phase 0 — reconcile docs (R9)

### [x] 0.1 Correct `docs/architecture.md` to the stable-identity mechanism

**Created:** 2026-06-17T08:42:42Z
**Completed:** 2026-06-17T10:47:43Z

**Why:** 2001's docs describe a synthetic e-mail (`lower(username)@users.cairn.invalid`)
as the GoTrue identity, rewritten by `set_username`. The revised design (parent
R16) makes the identity a stable, uid-derived `<uid>@cairn.internal` resolved at
the BFF. Per the parent plan's R19, this narrative is corrected **before** the
code so downstream sub-plans reference the right spec. Narrative only — the
`set_username` DDL/behaviour wording in `data-model.md` rides with its migration
in Phase 2.

**Prerequisites:** None (doc-only). 2002 already reconciled the session-model /
BFF parts of `architecture.md`; this finishes the identity-mechanism half.

**Decisions:**
- The stable identity is `<uid>@cairn.internal` (uid = `auth.users.id` =
  `profiles.id`), set **once at account creation**, never rewritten on rename. The
  `.internal` TLD is non-resolvable — never deliverable, never an add-key.
- The BFF resolves a typed username → user id via the `lower(username)` unique
  index on every sign-in, then authenticates the GoTrue password grant against
  `<uid>@cairn.internal`. `set_username` touches only `profiles.username`.
- The synthetic-e-mail mechanism is **superseded, not reverted**: the
  `username` column, case-fold uniqueness, `recovery_email`, and `set_username`'s
  signature/guards all survive; only the e-mail-rewrite body and the
  synthetic-e-mail invariant go. Record *why* the stable identity is cheaper
  (the BFF must map username→something to authenticate regardless, so the
  resolver **is** the work) and what it removes (the atomic-rewrite hazard and
  the SQL↔client domain-drift guard).

**Reference:** `docs/architecture.md` "Authentication" section (the synthetic
e-mail is asserted there, ≈ line 124, as **client/RPC-computed** — not "rewritten
by `set_username`", which is `data-model.md`'s framing) and the
"Considered and rejected" synthetic-e-mail discussion, which is the
*"Magic-link-only authentication"* entry at ≈ line 332 (not ≈ 327, which is the
"Multiple subdomains" entry). Both mentions must be corrected.

**Files:**
- `docs/architecture.md` (modify)

**Steps:**
1. Update the identity-mechanism narrative in the "Authentication" section
   (≈ line 124): stop describing the synthetic e-mail as the GoTrue identity;
   describe `<uid>@cairn.internal` set once at creation + the BFF username→id
   resolver + the password grant against the stable identity.
2. Correct the "Considered and rejected" synthetic-e-mail entry to record the
   stable-identity + BFF-resolver design and why it superseded the synthetic
   e-mail (per Decisions).
3. Re-read for internal consistency: no remaining claim that a rename rewrites
   `auth.users.email`, or that any client computes a synthetic e-mail.

**Verify:** `cd web && pnpm exec prettier --check ../docs/architecture.md` (doc-only; no functional tests apply — say so in the report).

### [x] 0.2 Reconcile the registration-posture docs to the open-alpha (R5, R9)

**Created:** 2026-06-17T11:40:00Z
**Completed:** 2026-06-17T10:51:44Z

**Notes:** The `docs/development.md` paragraph corrected was a stale "forward-note
for step 13" that asserted prod MUST set both `GOTRUE_DISABLE_SIGNUP=true` **and**
`GOTRUE_MAILER_AUTOCONFIRM=false`. Both are now false against the live config
(`docker-compose.prod.yml` sets `GOTRUE_MAILER_AUTOCONFIRM: "true"` and
`GOTRUE_DISABLE_SIGNUP: "${DISABLE_SIGNUP:-true}"` with the prod `.env` overriding
to `false`). Since the autoconfirm claim sat in the same sentence as the
signup-disabled claim and is now equally wrong (the `/auth/register` flow needs the
autoconfirmed token set), I corrected it alongside rather than leave a contradiction
I'd just walked past — it's the same alpha-posture reconciliation, not new scope.

Left untouched (flagged, not fixed): the magic-link enumeration-oracle paragraph
(`docs/development.md` ≈ line 257) describes behaviour *conditional* on
`GOTRUE_DISABLE_SIGNUP=true`; it does not assert that prod's default is disabled, so
it isn't a registration-posture contradiction. It's legacy magic-link territory
retiring in 2006 — out of scope here.

**Why:** R5 makes `/auth/register` an **open**, primary surface, and the live box
already runs `DISABLE_SIGNUP=false` (confirmed) so it works in prod today — but the
docs and the prod compose *default* still say the opposite:
`docker-compose.prod.yml` defaults `GOTRUE_DISABLE_SIGNUP: "${DISABLE_SIGNUP:-true}"`
(the prod `.env` overrides it) and `docs/development.md` (≈ line 253) states prod
is signup-disabled / invite-only ("Cairn is invite-only per `docs/invites.md`, so
signup-disabled in prod is already the right default"). Left unreconciled, the docs
contradict both the code this plan ships and the running box's actual config. Per
R9 the narrative is corrected in Phase 0, before the code. **Prod-facing** per
CLAUDE.md "We are going live".

**Prerequisites:** None (doc-only). The open-signup posture is the user's standing
intent for the alpha (`DISABLE_SIGNUP=false`); this task records it in the docs.

**Decisions:**
- The open-alpha posture is authoritative: prod runs the auth-proxy's open
  `/auth/register`, with GoTrue's `GOTRUE_DISABLE_SIGNUP` as the operator's hard
  switch and the per-IP register throttle (Task 3.3) as the mass-signup bound.
- `docs/development.md` (≈ line 253): correct the "prod is `GOTRUE_DISABLE_SIGNUP=true`
  / invite-only / signup-disabled is the right default" claim to the open-alpha
  posture — prod sets `DISABLE_SIGNUP=false`, registration is open, and
  `docs/invites.md` governs invite *acceptance*, not signup-openness (so it is
  not the citation for an invite-only signup gate).
- `docs/deployment.md` pre-deploy auth checklist: ensure the checklist reflects
  that prod intends open signup (`DISABLE_SIGNUP=false` in the prod `.env`) and
  that the password grant is reached only via the rate-limited BFF (the R6 reframe
  in Task 3.2 covers the grant item; this task covers the signup-openness note).
  Do **not** restate the password-grant item here — keep the two edits in their
  respective tasks to avoid a merge clash.
- This is narrative/operational reconciliation only; no compose default is changed
  in this task (the `DISABLE_SIGNUP=false` value is an operator `.env` setting,
  flagged for the deploy step), so the doc and the live posture agree.

**Reference:** `docs/development.md` (≈ line 253, the prod signup posture);
`docs/deployment.md` (the pre-deploy auth checklist); `docker-compose.prod.yml`
(≈ line 35, the `DISABLE_SIGNUP:-true` default); `docs/invites.md` (invite
*acceptance* policy — confirm it does not speak to signup-openness).

**Files:**
- `docs/development.md` (modify)
- `docs/deployment.md` (modify)

**Steps:**
1. Correct the `docs/development.md` prod signup-posture note (≈ line 253) to the
   open-alpha posture per Decisions; drop the implication that `docs/invites.md`
   makes signup invite-only.
2. Update the `docs/deployment.md` pre-deploy auth checklist to record prod open
   signup (`DISABLE_SIGNUP=false` in the prod `.env`), without restating the
   password-grant item (Task 3.2 owns that).
3. Re-read both for internal consistency: no remaining claim that prod signup is
   disabled / invite-only by default.

**Verify:** `cd web && pnpm exec prettier --check ../docs/development.md ../docs/deployment.md` (doc-only; no functional tests apply — say so in the report).

## Phase 1 — confirm the stable-identity mechanism (spike, R1)

### [x] 1.1 Confirm signup-then-rewrite + password grant against the real stack

**Created:** 2026-06-17T08:42:42Z
**Completed:** 2026-06-17T11:06:40Z

**Notes:** Mechanism confirmed end-to-end against the running dev stack.

- **GoTrue version:** `supabase/gotrue:v2.158.1` (the `/health` endpoint reports
  `version: vunspecified`; the real tag is the container image).
- **Confirmed sequence** (account cleaned up afterwards):
  1. `POST /signup` with `{email: <random-uuid>@cairn.internal, password}` →
     **200**, token set returned, and `email_confirmed_at` was **already set** in
     the response (autoconfirm via `GOTRUE_MAILER_AUTOCONFIRM=true`). No
     confirmation-token round-trip needed — the account is immediately usable.
  2. `UPDATE auth.users SET email = id || '@cairn.internal' WHERE id = <user.id>`
     → `UPDATE 1`; `email_confirmed_at` stayed set (the direct SQL UPDATE does not
     reset confirmation state).
  3. `POST /token?grant_type=password` with `{email: <uid>@cairn.internal,
     password}` → **200 with an `access_token`** (the load-bearing check). The
     returned `user.email` is the rewritten `<uid>@cairn.internal`.
  4. Complement check: the grant against the **old** transient address now returns
     **400 `invalid_grant` / "Invalid login credentials"** — confirming GoTrue
     authenticates the password grant against `auth.users.email`, so the SQL
     rewrite genuinely moves the login handle.
- **Post-signup state:** none needed attention — autoconfirm means
  `email_confirmed_at` is set at signup and survives the rewrite.
- **One observation for Phases 2–4 (no adjustment required):** a direct
  `UPDATE auth.users SET email` does **not** rewrite the matching `auth.identities`
  row, whose `identity_data.email` / `email` keeps the transient value. The
  password grant succeeded anyway (it reads `auth.users.email`), so this does not
  block `adopt_stable_identity` (Phase 2) or register (Phase 3). It's internal,
  non-deliverable data and harmless for the alpha; flagging it only so a future
  reader doesn't mistake the stale identity-row e-mail for a bug. `set_username`
  in 2001 took the same direct-`auth.users`-UPDATE shape, so this is the
  established behaviour, not a regression.

**Why:** The whole sub-step rests on a GoTrue behaviour 2001 deferred verifying:
that GoTrue authenticates the **password grant** against an `auth.users.email`
value **rewritten directly in SQL** after signup. If it does not, the
`adopt_stable_identity` RPC (Phase 2) and the register handler (Phase 3) need a
different shape. Confirm it end-to-end before building on it. This is a spike —
its output is a recorded, confirmed sequence, not shippable code; the RPCs and
handlers get their own tests in later phases.

**Prerequisites:** A running dev stack (`docker compose up` per
`docs/development.md`); GoTrue reachable at `http://localhost:9999`, Postgres
reachable for `psql`.

**Decisions:**
- The proven account-creation path is the public `POST /signup` (see
  `scripts/seed.sh:39`); `GOTRUE_MAILER_AUTOCONFIRM=true` is set in every compose
  env, so the account is confirmed and the password grant is immediately usable
  with no inbox round-trip.
- The transient signup address is random (`<random-uuid>@cairn.internal`), not
  username-derived — so two concurrent registrations of the same username never
  collide at GoTrue's email-unique index.
- The rewrite to `<uid>@cairn.internal` is a direct `UPDATE auth.users SET email`
  — the same shape `set_username` used in 2001 and that `docs/development.md`
  blesses ("signup-then-UPDATE lets each side do what it's good at"). The spike
  does the raw `UPDATE` to prove GoTrue's behaviour; Phase 2 wraps it in a
  `SECURITY DEFINER` RPC.

**Reference:** `docs/development.md` (password-grant curl example; the
signup-then-UPDATE rationale); `scripts/seed.sh` (the signup shape);
`docker-compose.*.yml` (`GOTRUE_*` config).

**Steps:**
1. `POST http://localhost:9999/signup` with `{"email":"<random-uuid>@cairn.internal","password":"<≥8 chars>"}`; capture `user.id` and confirm a token set is returned (autoconfirm).
2. Rewrite the e-mail in SQL: `UPDATE auth.users SET email = id || '@cairn.internal' WHERE id = '<user.id>';` (simulating `adopt_stable_identity`).
3. `POST http://localhost:9999/token?grant_type=password` with `{"email":"<user.id>@cairn.internal","password":"<same>"}`; **confirm a 200 with an `access_token`** — this is the load-bearing check.
4. Record in this task's **Notes**: the GoTrue version, the exact confirmed sequence, whether any post-signup state (confirmation token, `email_confirmed_at`) needed attention, and any adjustment Phases 2–4 must make. If the password grant fails against the rewritten e-mail, **stop and report** — the mechanism needs rethinking before Phase 2.

**Verify:** Step 3 returns HTTP 200 with an `access_token` against the running dev stack. (Manual / stack-dependent — if the stack can't be brought up in this environment, say so explicitly and do not claim confirmation.)

## Phase 2 — DB revise-forward + new RPCs (R1, R2, R3)

### [x] 2.1 Simplify `set_username` to profiles-only (migration + pgTAP + doc)

**Created:** 2026-06-17T08:42:42Z
**Completed:** 2026-06-17T11:15:27Z

**Notes:** Went as planned. The flipped assertion (b) gave the expected red
(`have: newname@users.cairn.invalid` / `want: alice-known@example.test`) before
the migration, then passed once `0020`'s profiles-only `set_username` landed;
assertion (c) removed and `plan()` dropped 10 → 9.

- **Doc divergence (pre-existing, not introduced here):** `docs/data-model.md`
  was already not Prettier-clean at HEAD — a markdown table further down the file
  was unaligned. Editing the file means `prettier --check` (the task's verifier)
  covers the whole file, so running `prettier --write` re-aligned that table too.
  The diff therefore carries ~48 lines of table-alignment churn unrelated to the
  three synthetic-e-mail corrections. This is the formatter doing its job on a
  file the pre-commit hook had never reformatted (it only runs on staged files,
  and this doc hadn't been touched recently); flagging it so the churn isn't read
  as scope creep.

**Why:** Under the stable identity (R1), the GoTrue login handle no longer encodes
the username, so `set_username` must stop rewriting `auth.users.email`. Dropping
that body removes the synthetic-e-mail invariant and the atomic-rewrite hazard,
and makes the `profiles` unique index the sole uniqueness guarantee — a rename can
never break the credential.

**Prerequisites:** Task 1.1 confirmed the stable-identity mechanism. 2001's
`set_username` lives in `db/migrations/0019_username_identity.sql:97-147`; its
pgTAP is `db/tests/set_username.sql`.

**Decisions:**
- New migration `db/migrations/0020_username_auth.sql` (this sub-step's single
  migration, built up across Tasks 2.1–2.3). `CREATE OR REPLACE FUNCTION
  public.set_username` keeping the signature, `SECURITY DEFINER`, `search_path`,
  the `authenticated`-only grant, and **all** guards/checks: auth + tombstone
  (errcode `28000`), format `^[A-Za-z0-9]{3,30}$` (errcode `23514`), case-fold
  availability excluding self (errcode `23505`), and the `lower(username)`
  unique-index backstop (errcode `23505`).
- **Remove**: the `UPDATE auth.users SET email = lower(p_username) || '@users.cairn.invalid'`
  block (0019 lines 136-138) and the TOCTOU branch that mapped the GoTrue
  email-unique collision onto "username taken". The body becomes a single
  `UPDATE public.profiles SET username = p_username WHERE id = uid;` (still
  inside an exception handler mapping `unique_violation` → `23505` for the
  profiles index race).
- `search_path` can drop `auth` (no longer touches `auth.users`) — keep it
  `public` only.
- pgTAP edit: in `db/tests/set_username.sql`, assertion **(b)** (lines ≈52-59)
  currently asserts `auth.users.email` **is rewritten** — flip it to assert the
  e-mail is **unchanged** after `set_username` (set a known e-mail on the caller's
  `auth.users` row first, run `set_username`, assert the e-mail still equals the
  known value). **Assertion (c) cannot stay as written**: it looks the row up *by*
  the synthetic e-mail (`db/tests/set_username.sql:63-70`,
  `WHERE email = 'newname@users.cairn.invalid'`), which no longer exists once the
  rewrite is gone, so the subquery returns NULL and (c) fails. (b) already proves
  the e-mail is untouched, so **remove (c)** and drop the `plan()` from 10 to 9
  (or repurpose it to look up `id` by `id`, but that is trivially true and adds
  nothing). The remaining assertions (mutability, case-fold taken, invalid
  format, case-only self-change, unauthenticated, tombstone) stay. Also update the
  test's header comment (lines 1-15), which still describes the synthetic e-mail
  as "the GoTrue identity". `db/tests/username_constraints.sql` is unaffected.
- Doc edit (rides with this migration per R9/R19): in `docs/data-model.md`,
  correct **all three** synthetic-e-mail mentions to profiles-only + the stable
  identity: (i) the `profiles`-section sentence (≈ line 89) that says the
  synthetic e-mail is "rewritten atomically by `set_username`" and pins the
  `@users.cairn.invalid` drift constant; (ii) the `recovery_email`-section
  parenthetical (≈ line 114) "the sign-in identifier is the synthetic
  `lower(username) || '@users.cairn.invalid'`"; (iii) the RPC-list bullet
  (≈ line 708) "rewrites `profiles.username` *and* the synthetic GoTrue e-mail".
  Note the sign-in identity is the stable `<uid>@cairn.internal` set at creation,
  not rewritten on rename.

**Reference:** `docs/testing.md` (pgTAP positive + negative); 2001's
`db/migrations/0019_username_identity.sql:97-147` for the body to descope.

**Files:**
- `db/migrations/0020_username_auth.sql` (create)
- `db/tests/set_username.sql` (modify)
- `docs/data-model.md` (modify)

**Steps:**
1. RED — In `db/tests/set_username.sql`, flip assertion (b) to assert
   `auth.users.email` is **unchanged** after `set_username` (set a known e-mail,
   run `set_username`, assert the e-mail equals the known value), **remove the now
   broken assertion (c)** (it queries the row by the synthetic e-mail that no
   longer exists), drop `plan(10)` → `plan(9)`, and refresh the header comment.
   Run `./scripts/test-db.sh` and confirm it reports red (0019's `set_username`
   still rewrites the e-mail, so the flipped (b) fails).
2. GREEN — Create `db/migrations/0020_username_auth.sql` with the profiles-only
   `CREATE OR REPLACE FUNCTION public.set_username` per Decisions. Re-run
   `./scripts/test-db.sh`; assertion (b) and all retained assertions pass.
3. Update `docs/data-model.md` per Decisions (profiles-only; stable identity).

**Verify:** `./scripts/test-db.sh` · `cd web && pnpm exec prettier --check ../docs/data-model.md`

### [x] 2.2 Add `adopt_stable_identity()` RPC (migration + pgTAP + doc)

**Created:** 2026-06-17T08:42:42Z
**Completed:** 2026-06-17T11:24:40Z

**Why:** Registration (Phase 3) signs up with a transient address, then must set
the account's permanent GoTrue identity to `<uid>@cairn.internal`. The BFF holds
no GoTrue admin credential, so this is done with a `SECURITY DEFINER` RPC that the
just-signed-up user calls — deriving the value from `public.uid()` so it cannot be
pointed at an arbitrary address.

**Prerequisites:** Task 2.1 (migration `0020_username_auth.sql` exists). The
pattern mirrors 2001's `set_username` `SECURITY DEFINER` write to `auth.users`.

**Decisions:**
- `CREATE FUNCTION public.adopt_stable_identity() RETURNS void LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = public, auth`. Body: read `uid := public.uid()`;
  reject `NULL` uid and the tombstone uuid with errcode `28000` (same guards as
  `set_username`); then `UPDATE auth.users SET email = uid || '@cairn.internal'
  WHERE id = uid AND (email IS NULL OR email LIKE '%@cairn.internal');`.
- **Guard the overwrite (security).** The `email IS NULL OR email LIKE
  '%@cairn.internal'` predicate is load-bearing, not cosmetic. The function is
  granted to `authenticated`, so it is reachable by **any** logged-in user via
  the public PostgREST surface (`POST /api/rpc/adopt_stable_identity`), not just
  the register handler. Without the predicate it would unconditionally overwrite
  the caller's `auth.users.email` — and a legacy magic-link account (still
  holding a real, deliverable e-mail until the 2006 migration, parent R11) would
  have its only recovery path destroyed. The predicate lets the RPC act only on
  the transient `<random>@cairn.internal` (register) and the already-stable
  `<uid>@cairn.internal` (idempotent re-call) shapes, and refuse to touch a real
  address. Damage is self-only (value derives from `public.uid()`), but
  "calling twice is a no-op" is only true *because* of this guard. Idempotent —
  a second call re-writes the same value (still matching the predicate).
- `REVOKE EXECUTE ON FUNCTION public.adopt_stable_identity() FROM public;` then
  `GRANT EXECUTE … TO authenticated;` — the explicit `REVOKE` is **load-bearing**:
  Postgres default-grants `EXECUTE` on a new function to `PUBLIC` (which includes
  `anon`), so without it the "`authenticated` only" intent does not hold. This
  mirrors 2001's `set_username` grant (`0019:149-150`). (The `public.uid()`
  NULL-guard is the functional boundary, but an `anon`-reachable
  `UPDATE auth.users` function is exactly the kind of over-grant the project
  treats as an unverified claim — revoke it explicitly and test it.)
- The value is derived from `public.uid()`, never from a parameter — a caller
  can only ever set **their own** identity to the deterministic `<uid>@cairn.internal`.
- Doc: add `adopt_stable_identity` to the `docs/data-model.md` RPC list with a
  one-line description (sets the stable GoTrue identity from the caller's uid;
  idempotent; used by registration).

**Reference:** 2001's `set_username` (`0019:97-147`) for the `SECURITY DEFINER` +
`public.uid()` guard idiom; `docs/data-model.md` RPC list for the doc shape.

**Files:**
- `db/migrations/0020_username_auth.sql` (modify — append)
- `db/tests/adopt_stable_identity.sql` (create)
- `docs/data-model.md` (modify)

**Steps:**
1. RED — Create `db/tests/adopt_stable_identity.sql` with `plan(N)`: (a) after a
   signed-in caller (whose `auth.users.email` is a transient
   `<random>@cairn.internal`) runs `adopt_stable_identity()`, their
   `auth.users.email` equals `<their-uid>@cairn.internal`; (b) calling it twice
   leaves the same value (idempotent); (c) an unauthenticated caller (no
   `request.jwt.claims`) raises `28000`; (d) the tombstone uuid raises `28000`;
   (e) the `anon` role **cannot execute** the function —
   `SET ROLE anon; SELECT adopt_stable_identity();` raises a permission-denied
   error (`42501`), proving the `REVOKE … FROM public` landed (without it, `anon`
   would reach the `UPDATE auth.users`); (f) the overwrite guard holds — a caller
   whose `auth.users.email` is a real address (e.g. `'legacy@example.test'`,
   not `@cairn.internal`) is **unchanged** after `adopt_stable_identity()`
   (proving a legacy magic-link account's recovery e-mail can't be clobbered).
   Run `./scripts/test-db.sh`; confirm red (function doesn't exist).
2. GREEN — Append the `CREATE FUNCTION public.adopt_stable_identity()` + `GRANT`
   to `0020_username_auth.sql` per Decisions. Re-run `./scripts/test-db.sh`; green.
3. Add the RPC to the `docs/data-model.md` RPC list.

**Verify:** `./scripts/test-db.sh` · `cd web && pnpm exec prettier --check ../docs/data-model.md`

### [ ] 2.3 Add `resolve_username()` RPC (migration + pgTAP + doc)

**Created:** 2026-06-17T08:42:42Z
**Completed:**

**Why:** Sign-in (Phase 3) and registration's availability pre-check turn a typed
username into the account's user id. Sign-in happens before any session exists,
so the resolver must work for an unauthenticated caller — hence `SECURITY DEFINER`
granted to `anon`.

**Prerequisites:** Task 2.1 (migration `0020_username_auth.sql` exists). The
`lower(username)` unique index `profiles_username_lower_uniq` exists from 2001.

**Decisions:**
- `CREATE FUNCTION public.resolve_username(p_username text) RETURNS TABLE(id uuid,
  username text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`.
  Body: `SELECT id, username FROM public.profiles WHERE lower(username) =
  lower(p_username);`. Returns one row for a match, zero rows otherwise.
  Returns both the stable user id (for the password grant) and the
  case-preserving stored handle (so the signed-in `AuthUser` shows canonical
  casing, not the typed casing).
- No `deleted_at` filter is needed for R2's "live account" wording: `profiles`
  has no soft-delete column and `delete_account` hard-deletes the row via cascade
  (`db/migrations/0014_delete_account.sql`), so every stored handle is live and a
  freed handle is genuinely gone. The only non-account row is the tombstone, whose
  provisional handle is unguessable and whose password grant cannot succeed — so
  resolving it is harmless and the bare `SELECT` is correct as written.
- `REVOKE EXECUTE … FROM public;` then `GRANT EXECUTE … TO anon, authenticated;`
  — follow the same explicit revoke-then-grant idiom as `set_username`
  (`0019:149-150`) and `adopt_stable_identity` (Task 2.2) so the function's grant
  surface is stated, not inherited from the `PUBLIC` default. (Here `anon` is
  granted anyway, so the revoke is consistency rather than a boundary — but
  keeping every new function on the same idiom avoids the next one silently
  over-granting.) Exposing the uuid to an
  unauthenticated caller is acceptable: usernames are public (parent R1), the uuid
  is already in attribution everywhere, and the password grant it would otherwise
  unlock is locked to the BFF (R6, Task 3.2). A "no such username" (empty result)
  is a permitted truthful answer (parent R10).
- Doc: add `resolve_username` to the `docs/data-model.md` RPC list (resolves a
  typed username to `(id, username)` via the case-fold index; `anon`-callable;
  used by the BFF for sign-in and the register pre-check).

**Reference:** `docs/testing.md` (positive + negative + the `anon`-callable case);
2001's `profiles_username_lower_uniq` index in `0019`.

**Files:**
- `db/migrations/0020_username_auth.sql` (modify — append)
- `db/tests/resolve_username.sql` (create)
- `docs/data-model.md` (modify)

**Steps:**
1. RED — Create `db/tests/resolve_username.sql` with `plan(N)`: (a) returns the
   correct `(id, username)` for an exact handle; (b) resolves case-insensitively
   (`laracroft` finds stored `LaraCroft`) and returns the **stored** casing;
   (c) returns zero rows for an unknown handle; (d) is executable by the `anon`
   role (`SET ROLE anon; SELECT ... resolve_username(...)`). Run
   `./scripts/test-db.sh`; confirm red.
2. GREEN — Append the `CREATE FUNCTION public.resolve_username` + `GRANT EXECUTE
   … TO anon, authenticated` to `0020_username_auth.sql`. Re-run; green.
3. Add the RPC to the `docs/data-model.md` RPC list.

**Verify:** `./scripts/test-db.sh` · `cd web && pnpm exec prettier --check ../docs/data-model.md`

### [ ] 2.4 Switch `export_my_data()` to the username identity (migration + pgTAP)

**Created:** 2026-06-17T10:54:00Z
**Completed:**

**Why:** R7 says the GoTrue identity must never surface "in the UI **or an
export**". The data export's user object is built by `export_my_data()`
(`db/migrations/0018_data_export.sql:60-71`, which emits `'email', u.email` from
`auth.users`), and the whole document is written verbatim to the canonical
`data.json` (`web/src/lib/export/model/archive.ts:37`). After the stable-identity
change `auth.users.email` becomes the meaningless `<uid>@cairn.internal`, so
unless the RPC switches to the username, the internal handle leaks into every
downloaded archive. Fixing only the HTML renderer (Task 4.1) would leave the JSON
— the *canonical* record — leaking. This is the DB half of R7; the TS half
(`ExportUser` type + the HTML renderer + their tests) is Task 4.1.

**Prerequisites:** Task 2.1 (migration `0020_username_auth.sql` exists). The
export allowlist + its pgTAP are `db/migrations/0018_data_export.sql` and
`db/tests/export_my_data.sql`.

**Decisions:**
- Append a `CREATE OR REPLACE FUNCTION public.export_my_data()` to
  `0020_username_auth.sql` that is byte-for-byte the 0018 body **except** the user
  block: replace `'email', u.email` with `'username', p.username` (the public
  identity already joined from `public.profiles AS p`). Everything else — the
  allowlist of profile fields, the lists/circle/invitations assembly, the
  `SECURITY DEFINER` + `search_path` + `authenticated`-only grant — is unchanged.
  Recovery-e-mail is **not** added to the export here (that is 2004); 2003 only
  removes the meaningless identity and substitutes the username.
- pgTAP: in `db/tests/export_my_data.sql`, flip the assertion that the user
  object carries the GoTrue e-mail to assert it carries `username` (the stored
  handle) and **no** `email` key. All other export assertions stay.

**Reference:** `db/migrations/0018_data_export.sql` (the function body to
revise-forward); `docs/testing.md` (pgTAP); `web/src/lib/export/model/archive.ts`
(confirms the document is serialised whole into `data.json`).

**Files:**
- `db/migrations/0020_username_auth.sql` (modify — append the export RPC replace)
- `db/tests/export_my_data.sql` (modify)

**Steps:**
1. RED — In `db/tests/export_my_data.sql`, change the user-object assertion to
   expect `username` (the stored handle) and the absence of an `email` key. Run
   `./scripts/test-db.sh`; confirm red (0018 still emits `email`).
2. GREEN — Append the `CREATE OR REPLACE FUNCTION public.export_my_data()` with
   `'username', p.username` to `0020_username_auth.sql`. Re-run; green.

**Verify:** `./scripts/test-db.sh`

## Phase 3 — BFF endpoints + resolver wiring (R2, R4, R5, R6, R7)

### [ ] 3.1 Wire the BFF to PostgREST: `resolveUsername` + `usernameForUid` helpers

**Created:** 2026-06-17T08:42:42Z
**Completed:**

**Why:** The BFF only talks to GoTrue today. Sign-in needs to resolve a username →
user id (Task 2.3), and every user-returning response needs the username looked up
by uid for enrichment (R7). Both are PostgREST calls — give the BFF a PostgREST
base URL and two small helpers, tested directly before their consumers land.

**Prerequisites:** Tasks 2.3 (`resolve_username` RPC) and 2.2 (the profiles
`username` readable by an authenticated bearer via `profiles_select`). 2002's
unit-test pattern (`auth-proxy/test/*.test.ts`: an ephemeral `http.Server` stub
injected via env) is the model — extend it with a stub PostgREST.

**Decisions:**
- Add `POSTGREST_URL` env to the BFF (`auth-proxy/src/lib/`), defaulting to the
  internal `http://postgrest:3000` in prod compose; mirror in dev
  (`web/vite.config.ts` already proxies `/api` to PostgREST — reuse that base for
  the dev handlers).
- `resolveUsername(username): Promise<{ id: string; username: string } | null>` —
  `POST ${POSTGREST_URL}/rpc/resolve_username` with `{ p_username }`, **no auth
  header** (runs as `anon`). Returns the single row, or `null` when the RPC
  returns an empty array. Never logs the username (per `docs/logging.md`).
- `usernameForUid(uid, accessToken): Promise<string | null>` — `GET
  ${POSTGREST_URL}/profiles?id=eq.<uid>&select=username` with `Authorization:
  Bearer <accessToken>` (authenticated; `profiles_select` permits reading any
  profile). Returns the `username`, or `null` if absent.
- Add both to `auth-proxy/src/lib/session.ts` (or a sibling `lib/profiles.ts` if
  cleaner) alongside the existing `refresh`/`logout`.
- Compose: the `auth-proxy` service is defined **only** in
  `docker-compose.prod.yml` (`:57-70`), **not** in the prod-safe base
  `docker-compose.yml` — the base defines `postgres`/`postgrest`/`gotrue`/the
  avatar `sidecar` (which carries `POSTGREST_URL`, easily mistaken for
  auth-proxy)/`caddy`, and dev runs the BFF via `web/vite.config.ts`, not a
  container. So add `POSTGREST_URL: http://postgrest:3000` (and a
  `depends_on: postgrest`) to the `auth-proxy` service in
  **`docker-compose.prod.yml`**. Do **not** add a partial `auth-proxy` entry to
  the base: dev (`base + override`, no prod overlay) would then have an
  `auth-proxy` service with no `image`/`build` and `docker compose up` would
  fail. Dev reachability is handled by the `vite.config.ts` base below, not by
  compose.

**Reference:** `auth-proxy/test/refresh.test.ts` (the stub-GoTrue + env-injected
pattern to mirror for a stub PostgREST); `docs/logging.md` (no usernames/tokens
in logs).

**Files:**
- `auth-proxy/src/lib/session.ts` (modify) or `auth-proxy/src/lib/profiles.ts` (create)
- `auth-proxy/test/profiles.test.ts` (create)
- `docker-compose.prod.yml` (modify — `auth-proxy` service lives here, not the base)
- `web/vite.config.ts` (modify — make the PostgREST base available to dev handlers)

**Steps:**
1. RED — Create `auth-proxy/test/profiles.test.ts` with a stub PostgREST server
   (ephemeral `http.Server`, `POSTGREST_URL` injected): (a) `resolveUsername`
   POSTs `/rpc/resolve_username` with `{p_username}` and returns the row;
   (b) returns `null` for an empty `[]`; (c) sends **no** Authorization header;
   (d) `usernameForUid` GETs `/profiles?id=eq.<uid>&select=username` with the
   bearer and returns the username; (e) returns `null` when absent. Run
   `cd auth-proxy && pnpm test`; confirm red.
2. GREEN — Implement both helpers per Decisions; add `POSTGREST_URL` plumbing.
   Re-run; green.
3. Add `POSTGREST_URL` to the `auth-proxy` service in `docker-compose.prod.yml`
   (with `depends_on: postgrest`) — **not** the base `docker-compose.yml` (see
   Decisions) — and the dev base in `web/vite.config.ts`.

**Verify:** `cd auth-proxy && pnpm lint && pnpm test` · `cd web && pnpm lint && pnpm check`

### [ ] 3.2 Implement `/auth/signin` + lock the public password grant (R4, R6)

**Created:** 2026-06-17T08:42:42Z
**Completed:**

**Why:** Replace the `501` sign-in skeleton with the real credential check, and
close the bypass it would otherwise leave open: with `resolve_username` public,
anyone can compute `<uid>@cairn.internal`, so the GoTrue password grant must be
reachable **only** through the rate-limited BFF.

**Prerequisites:** Task 3.1 (`resolveUsername` helper, PostgREST wiring). The
signin skeleton is at `auth-proxy/src/index.ts:138-143` — already behind the CSRF
gate (`X-Cairn-Auth`, `auth-proxy/src/index.ts:101-108`) and the
`signinGuard` rate-limiter, but it records no attempts. `plantSession`
(`auth-proxy/src/lib/cookies.ts`) plants the dual `__Host-cairn_session` +
`__Host-cairn_access` cookies. `constantShapeFailure()` exists in
`auth-proxy/src/lib/rate-limit.ts`.

**Decisions:**
- **Body is a raw `Buffer`, not parsed JSON.** The auth-proxy mounts
  `express.raw({ type: () => true })` (`index.ts:300`), so `req.body` is a
  `Buffer` — the handler must `JSON.parse(req.body.toString('utf8'))` itself to
  read `{ username, password }` (mirror `readSigninUsername`'s
  `Buffer.isBuffer(body)` guard, `rate-limit.ts:154-163`), and return `400` on a
  malformed/empty body. (Same applies to the register handler, Task 3.3.)
- `POST /auth/signin` body `{ username, password }`. Handler: `resolveUsername` →
  if `null`, `recordFailure` (keyed on the typed username + IP) and return the
  **constant-shape** failure (same status + body as a wrong password — a 401
  `{ error: 'invalid credentials' }`); else GoTrue password grant against
  `<id>@cairn.internal` with the password. On grant success: `recordSuccess`,
  `plantSession(refresh+access)`, return `200 { user: { id, username } }`
  (tokenless; username from the resolver's canonical value — no extra lookup).
  On grant failure: `recordFailure`, return the same constant-shape 401.
- Add a GoTrue password-grant helper to `session.ts` (`POST
  ${gotrueUrl()}/token?grant_type=password`), distinct from the existing
  refresh-grant `refresh()`. Never log the username, e-mail, or token.
- **R6 lockdown:** on the `/auth/token` pass-through (still needed for the legacy
  magic-link refresh-token grant until 2006), reject any request whose
  `grant_type` is `password` — return `403 { error: 'use /auth/signin' }` (or
  `400`) and do **not** forward to GoTrue. **`grant_type` is read from the query
  string** (`/auth/token?grant_type=password`), not the body, since GoTrue and
  the existing callers carry it as a query param. Parse the query of
  `req.originalUrl` explicitly (e.g. `new URL(req.originalUrl, 'http://x').searchParams.get('grant_type')`,
  or split on `?` and read the param). Note `isSegmentMatch` does **not** help
  here: it splits on `?` only to *discard* the query and compare the path — it
  never reads `grant_type`. The BFF's own `/auth/signin` is the only
  password-grant path. Mirror the rejection in `web/vite.config.ts`.
- **Doc reframe:** `docs/deployment.md`'s pre-deploy auth checklist item (≈ line
  319, "GoTrue password grant must be unreachable for real accounts") is reframed,
  not dropped (R6): the public `grant_type=password` is now rejected at the BFF,
  and the *intended* sign-in path is `/auth/signin`, which is the only
  rate-limited password-grant path. (The dev-login note at ≈ line 315 is
  reconciled in Task 4.5, where the shortcut moves off the grant.)
- Constant-shape: the unknown-username and wrong-password branches must return
  byte-identical status + body, so a caller can't tell which factor failed
  (parent R18; hygiene since usernames are public). Scope note: this is
  **body + status only**, not timing — the unknown-username branch skips the
  GoTrue grant and so answers faster than the wrong-password branch, a residual
  timing oracle. That is acceptable and intentional: R1/R10 make usernames public
  and a truthful "no such username" is permitted, so constant-shape here is
  hygiene, not an enumeration boundary. Don't add a throwaway grant to equalise
  timing unless a later requirement asks for it.

**Reference:** `auth-proxy/src/index.ts` (the signin skeleton, the CSRF gate, the
`signinGuard`); `auth-proxy/src/lib/cookies.ts` (`plantSession`);
`auth-proxy/src/lib/rate-limit.ts` (`RateLimiter`, `constantShapeFailure`);
`docs/deployment.md` pre-deploy auth checklist (the password-grant item this
reframes); `docs/logging.md`.

**Files:**
- `auth-proxy/src/index.ts` (modify)
- `auth-proxy/src/lib/session.ts` (modify — add password grant)
- `auth-proxy/test/signin.test.ts` (create)
- `auth-proxy/test/password-grant-lockdown.test.ts` (create)
- `web/vite.config.ts` (modify — dev parity: real signin + password-grant rejection)
- `docs/deployment.md` (modify — reframe the pre-deploy password-grant item)

**Steps:**
1. RED — `auth-proxy/test/signin.test.ts` (stub GoTrue + stub PostgREST):
   (a) valid `{username,password}` → resolver hit → password grant → both cookies
   planted → `200 { user:{id,username} }`, no token in body; (b) unknown username
   → constant-shape 401, GoTrue password grant **not** called, `recordFailure`
   invoked; (c) wrong password → **identical** 401 body/status as (b); (d) missing
   `X-Cairn-Auth` → 403 (existing gate, no resolver/grant call); (e) successful
   sign-in calls `recordSuccess`. `auth-proxy/test/password-grant-lockdown.test.ts`:
   `POST /auth/token?grant_type=password` is rejected without forwarding to
   GoTrue; `grant_type=refresh_token` still forwards. Run `cd auth-proxy && pnpm
   test`; confirm red.
2. GREEN — Implement the `/auth/signin` handler + the password-grant helper +
   the `/auth/token` `grant_type=password` rejection per Decisions. Re-run; green.
3. Mirror the dev behaviour in `web/vite.config.ts` (real signin handler;
   password-grant rejection on the dev `/auth/token`).
4. Reframe the `docs/deployment.md` pre-deploy password-grant checklist item per
   Decisions (public grant rejected at the BFF; `/auth/signin` the only
   rate-limited path).

**Verify:** `cd auth-proxy && pnpm lint && pnpm test` · `cd web && pnpm lint && pnpm check` · `cd web && pnpm exec prettier --check ../docs/deployment.md`

### [ ] 3.3 Implement `/auth/register` (R5)

**Created:** 2026-06-17T08:42:42Z
**Completed:**

**Why:** Replace the `501` register skeleton with account creation: signup →
adopt the stable identity → set the chosen username → plant the session.
Registration is open (alpha posture); GoTrue's `GOTRUE_DISABLE_SIGNUP` stays the
operator switch.

**Prerequisites:** Tasks 3.1 (resolver), 2.2 (`adopt_stable_identity`), 2.1
(`set_username` profiles-only), 1.1 (confirmed mechanism). Register skeleton at
`auth-proxy/src/index.ts:144-147` (behind the CSRF gate). GoTrue signup pattern:
`scripts/seed.sh:39`; `GOTRUE_MAILER_AUTOCONFIRM=true` everywhere.

**Decisions:**
- **Body is a raw `Buffer`** (`express.raw`, `index.ts:300`) — `JSON.parse`
  `req.body.toString('utf8')` to read `{ username, password }` and `400` on a
  malformed/empty body, exactly as Task 3.2's signin handler does.
- `POST /auth/register` body `{ username, password }`. Handler: validate format
  (`^[A-Za-z0-9]{3,30}$`) and min password length (8) — reject `400` with a
  distinguishable code; pre-check availability via `resolveUsername` (if a row
  exists, return `409 { error: 'username taken' }` **without** creating a GoTrue
  user); `POST ${gotrueUrl()}/signup` with `{ email: <random-uuid>@cairn.internal,
  password }` (autoconfirmed → tokens returned); from the signup response take the
  `user.id` + `access_token`; call `adopt_stable_identity` and `set_username`
  (PostgREST `/rpc/...` with `Authorization: Bearer <access_token>`); then
  `plantSession` from the signup tokens and return `200 { user:{ id, username } }`
  (username = the chosen value). 
- **Race backstop:** if `set_username` returns the `23505` "username taken" error
  (two callers raced past the pre-check), surface `409 { error: 'username taken' }`.
  Because `set_username` runs **before** `plantSession`, the 23505 returns the
  `409` with **no** cookies planted — the register screen (Task 4.2) shows "taken"
  and stays put, which is what we want (planting a session here would let the
  route guard bounce the now-signed-in user off `/auth/register` before they could
  retry). The loser's GoTrue account exists (with the stable identity and a
  provisional username) but is sessionless and unreachable — its provisional
  handle is unguessable — and server-side cleanup of half-registered accounts is
  out of scope for the alpha (see PLAN Open questions).
- **Per-IP throttle (R5):** registration is open but not unthrottled. The
  handler runs behind a **per-IP** check so an open endpoint that creates a
  GoTrue user + cascades two table inserts + two RPC writes per call cannot be
  hammered into mass signup from one source. **Pitfall — do not call `signinGuard`
  / `signinRateLimit` (the middleware) directly:** it calls `readSigninUsername(req.body)`
  (`rate-limit.ts:154-206`), which reads the `username` field — and a *register*
  body has one — so it would impose a per-account escalating *delay* keyed
  on the desired handle, which is not the intent. **Reuse the existing
  `signinLimiter` instance's per-IP leg** (R5 pins this: "the per-IP leg of the
  sign-in rate-limiter"): call `signinLimiter.check(ip)` and
  `signinLimiter.recordFailure(ip)` with **no** username, so register and sign-in
  share **one** per-IP brute-force/mass-signup bound from a given IP. (A *separate*
  `RateLimiter` instance would hand that IP two independent budgets — ≈2×`ipMax`
  across register + sign-in — which is **not** what R5 specifies; rejected.) Count
  **every** register attempt toward the per-IP window (call `recordFailure(ip)`
  with no username on every attempt; do *not* `recordSuccess`, or a successful
  mass-signup run wouldn't be bounded); a blocked IP gets the same
  `429 { error: 'too many requests' }` as signin. `GOTRUE_DISABLE_SIGNUP` stays
  the operator's hard switch.
- **Post-signup step failures (not just the race):** the `set_username` `23505`
  race above is one way the flow can fail *after* `POST /signup` has already
  created the GoTrue account; `adopt_stable_identity` or either PostgREST call
  failing (e.g. a transient PostgREST blip) is another. Treat them the same: on
  **any** post-signup step error, return `500` (or the upstream-shaped error)
  with **no** cookies planted. The half-registered account is an orphan — the
  same sessionless, unreachable orphan class the PLAN Open questions accept for
  the race (its transient `<random>@cairn.internal` identity and provisional/empty
  username make it unguessable), and server-side cleanup stays out of scope for
  the alpha. Do **not** plant a session on a partial register.
- **Signup-disabled:** if GoTrue returns its signup-disabled error, surface a
  clear `403`/`503`-shaped result; do not crash.
- The transient address is a fresh random uuid local-part (`crypto.randomUUID()`),
  never username-derived, so concurrent same-username signups don't collide at
  GoTrue's email index.

**Reference:** `scripts/seed.sh` (signup shape); `auth-proxy/src/lib/cookies.ts`
(`plantSession`); Tasks 2.1/2.2 RPC contracts (the error codes to map);
`docs/invites.md` (open-signup posture); `docs/logging.md`.

**Files:**
- `auth-proxy/src/index.ts` (modify)
- `auth-proxy/src/lib/session.ts` (modify — add signup)
- `auth-proxy/test/register.test.ts` (create)
- `web/vite.config.ts` (modify — dev parity: real register handler)

**Steps:**
1. RED — `auth-proxy/test/register.test.ts` (stub GoTrue + stub PostgREST):
   (a) valid `{username,password}` → signup with a `@cairn.internal` random
   address → `adopt_stable_identity` + `set_username` called with the bearer →
   both cookies planted → `200 { user:{id,username} }`; (b) taken username
   (pre-check resolver returns a row) → `409`, signup **not** called; (c) invalid
   format → `400`, nothing created; (d) password < 8 → `400`; (e) `set_username`
   `23505` race → `409` with **no** Set-Cookie (session not planted); (f) missing
   `X-Cairn-Auth` → 403; (g) once the per-IP window is exhausted, a further
   register attempt → `429` without calling signup; (h) a post-signup step
   failure (`adopt_stable_identity` or the PostgREST call errors after signup
   succeeded) → `500` with **no** Set-Cookie (orphan accepted, session not
   planted). Run `cd auth-proxy && pnpm test`; confirm red.
2. GREEN — Implement the `/auth/register` handler + the signup helper per
   Decisions. Re-run; green.
3. Mirror in `web/vite.config.ts` (real register handler). **Dev scope:**
   replicate the functional flow (validate → availability pre-check → signup →
   `adopt_stable_identity` + `set_username` → plant → tokenless `{user}`; the
   `409`/`400` shapes) but **omit** the per-IP throttle — it is prod-only and
   covered by the auth-proxy unit test, not by dev/e2e (see PLAN Architecture →
   `vite.config.ts`).

**Verify:** `cd auth-proxy && pnpm lint && pnpm test` · `cd web && pnpm lint && pnpm check`

### [ ] 3.4 Enrich `/auth/refresh` + cookie-plant responses with username (R7)

**Created:** 2026-06-17T08:42:42Z
**Completed:**

**Why:** The client's `AuthUser` carries `username` (Task 4.1), but GoTrue's user
object does not. `/auth/signin` and `/auth/register` already return the username;
the **boot/restore** path (`/auth/refresh`) and the legacy magic-link cookie-plant
pass-throughs return the bare GoTrue user. Enrich them so the client adopts an
identically-shaped `AuthUser` no matter which path restored the session.

**Prerequisites:** Task 3.1 (`usernameForUid`). 2002's `refreshHandler`
(`auth-proxy/src/index.ts:262-288`) returns `{ user: result.user }` (the GoTrue
user). The cookie-plant pass-throughs for `/auth/token` + `/auth/verify`
(`auth-proxy/src/index.ts:228-239`) forward the GoTrue body with `user`.

**Decisions:**
- After a successful `/auth/refresh`, look up `usernameForUid(result.user.id,
  result.accessToken)` and return `{ user: { id, username } }` instead of the raw
  GoTrue user. If the lookup returns a **definitive** empty result (200 with no
  matching profile row), return `{ user: { id } }`. Be accurate about what that
  does on the client: Task 4.1's `isAuthUser` requires `username`, so a payload
  without one is rejected as a malformed body — `refresh()` returns `transient`
  and boot leaves the session `unknown` (the boot screen stays up), it does **not**
  resolve to signed-in or signed-out. This is acceptable only because the path is
  effectively unreachable: `tg_profile_on_signup` creates a profile (with a
  provisional username) for every account at signup, so a valid session always has
  a username. Do **not** treat a PostgREST *error/timeout* (as opposed to an empty
  result) as an empty profile — that would spuriously degrade a live session; on a
  lookup error, fall back to returning the bare `{ user: { id } }` (same unreachable
  degraded path) rather than 401-ing the session out.
- **New availability coupling (call this out, don't discover it):** enriching
  refresh means session *restore* now depends on PostgREST, which `/auth/refresh`
  (GoTrue-only) did not before. While PostgREST is down, every boot of an
  otherwise-valid session resolves `transient` → boot stays `unknown` → the boot
  screen hangs until PostgREST recovers (it does **not** sign the user out — the
  `transient` choice is deliberate). This is an accepted trade (a hung boot screen
  beats spuriously signing everyone out on a blip), but it widens the boot-path
  dependency surface to PostgREST; note it so a future reader doesn't read the
  hang as a bug. If the hang proves worse than a forced re-auth, revisit whether
  the lookup-error path should degrade to signed-out instead.
- For the `/auth/token` + `/auth/verify` cookie-plant pass-throughs (legacy
  magic-link, retiring in 2006): when the forwarded 200 body carries a `user.id`,
  replace `body.user` with `{ id, username }` (enriched via `usernameForUid` with
  the freshly planted access token) before forwarding to the browser.
- Mirror both in `web/vite.config.ts`.

**Reference:** `auth-proxy/src/index.ts:262-288` (refresh handler) and `:228-239`
(cookie-plant); `auth-proxy/test/refresh.test.ts` (the existing assertions to
extend).

**Files:**
- `auth-proxy/src/index.ts` (modify)
- `auth-proxy/test/refresh.test.ts` (modify — assert enrichment)
- `auth-proxy/test/enrich.test.ts` (create — pass-through enrichment) *or extend existing*
- `web/vite.config.ts` (modify — dev parity)

**Steps:**
1. RED — Extend `auth-proxy/test/refresh.test.ts`: a successful refresh returns
   `{ user: { id, username } }` (stub PostgREST returns the username); when the
   profile lookup is empty, returns `{ user: { id } }`. Add a cookie-plant
   enrichment test: a 200 from `/auth/token` carrying `user.id` is forwarded with
   `user` replaced by `{ id, username }`. Run `cd auth-proxy && pnpm test`; red.
2. GREEN — Add the enrichment in the refresh handler and the cookie-plant path
   per Decisions. Re-run; green.
3. Mirror in `web/vite.config.ts`.

**Verify:** `cd auth-proxy && pnpm lint && pnpm test` · `cd web && pnpm lint && pnpm check`

## Phase 4 — client + screens (R7, R8)

### [ ] 4.1 `auth-client` register/signIn + `AuthUser` carries username

**Created:** 2026-06-17T08:42:42Z
**Completed:**

**Why:** The client needs Cairn-shaped `register`/`signIn` calls and a session
identity built on the username, not the (now-meaningless) GoTrue e-mail.

**Prerequisites:** Phase 3 (the BFF endpoints return `{ user:{id,username} }`).
`auth-client.ts` already sends the CSRF header (`[CSRF_HEADER]: '1'`,
`auth-client.ts:30`); `assertAuthUser` requires `email`
(`auth-client.ts:62-71`). `session.svelte.ts`: `AuthUser = { id; email }`
(line 11), the local `isAuthUser` guard checks `email` (lines 41-48). The
data-export HTML renders `u.email` (`web/src/lib/export/model/render-html.ts:97`).
Task 2.4 has already switched the `export_my_data()` RPC to emit `username`, so the
export payload carries the handle this task renders.

**Decisions:**
- Add `signIn(username, password): Promise<{ user: AuthUser }>` → `POST /auth/signin`
  `{ username, password }`; `register(username, password): Promise<{ user: AuthUser }>`
  → `POST /auth/register` `{ username, password }`. Both with the CSRF header and
  `credentials: 'same-origin'`; both throw `HttpError` on non-2xx so the screens
  can map a 401 (invalid credentials) / 409 (taken) / 400 (invalid) to copy.
  Keep the existing magic-link functions (`sendMagicLink`, `verifyOtp`,
  `exchangeRefreshToken`, `signOut`, `signOutEverywhere`) — the legacy surface
  stays until 2006.
- **Keep the manual mock in sync (cross-task).** Adding `signIn`/`register` to
  the real module means the manual mock `web/src/lib/auth/model/__mocks__/auth-client.ts`
  must gain matching `vi.fn()` exports in *this* task. Cairn's auth component
  tests mock the client with a bare `vi.mock('$lib/auth/model/auth-client')`
  (no factory), which resolves to that manual mock (see `LoginRequest.test.ts:13`,
  `DevShortcuts.test.ts:11`). Task 4.2's `SignIn.test.ts`/`Register.test.ts`
  follow the same idiom, so if the mock lacks `signIn`/`register` the component
  calls `undefined` and those tests fail. Land the mock exports here, beside the
  real functions; Task 4.5 later removes `devPasswordSignIn` from the same file.
- `AuthUser = { id: string; username: string }` (drop `email`). Update
  `assertAuthUser` (auth-client) and the local `isAuthUser` (session) to require
  `username: string`. A user object lacking a `username` (e.g. an un-enriched
  legacy path) is treated as **not** a valid `AuthUser` — boot leaves the session
  unresolved rather than crashing.
- The data export's user identity switches from e-mail to username (R7). The
  source RPC is changed in Task 2.4; here, change the TS side so it type-checks and
  the JSON/HTML carry the handle: `ExportUser` in
  `web/src/lib/export/model/types.ts` drops `email: string` and gains
  `username: string`, and `web/src/lib/export/model/render-html.ts:97` renders
  the handle instead of `u.email`. **Change the label too, not just the value:**
  line 97 is `E-mail: ${u.email}` — replace the whole line with a username label
  (e.g. `Username: @${escapeHtml(u.username)}` or just `@${escapeHtml(u.username)}`),
  so the output isn't the nonsensical "E-mail: @alice". The synthetic identity must
  never surface; the username is the public identity. The `data.json` content
  follows from the type + RPC change.
- **Doc — `docs/data-export.md`:** the canonical `data.json` shape doc carries
  `"email"` in the user object (≈ line 56) and describes e-mail as the user field
  in the "What's included" table (≈ line 11) and a privacy note (≈ line 23). Update
  all three to `username` / `@username`, or the canonical-record spec contradicts
  the migration (Task 2.4), its pgTAP, the `ExportUser` type, and the renderer.

**Reference:** `docs/frontend-layout.md` (lib tier split — the session guard lives
in `shared/state` and cannot import from `auth/model`, so the two guards stay
separate); `auth-client.ts` + `session.svelte.ts` as cited above.

**Files:**
- `web/src/lib/auth/model/auth-client.ts` (modify)
- `web/src/lib/auth/model/auth-client.test.ts` (modify)
- `web/src/lib/auth/model/__mocks__/auth-client.ts` (modify — add `signIn`/`register`
  as `vi.fn()` exports alongside the real functions, so Task 4.2's component tests,
  which use the bare `vi.mock('$lib/auth/model/auth-client')` manual-mock idiom, can
  mock them; `devPasswordSignIn` stays here until Task 4.5 removes it. **Also switch
  the `SEED_USER: AuthUser` literal (lines 15-18) from `email` to `username`** — it
  is typed `AuthUser`, so the type change breaks it, and because this is a `.ts`
  (not `.test.ts`) file the Step 3 grep below must reach it)
- `web/src/lib/shared/state/session.svelte.ts` (modify)
- `web/src/lib/shared/state/session.test.ts` (modify — `AuthUser` fixture, see the
  fixtures list below; note the file is `session.test.ts`, **not**
  `session.svelte.test.ts`)
- `web/src/lib/export/model/types.ts` (modify — `ExportUser`: `email` → `username`)
- `web/src/lib/export/model/render-html.ts` (modify — label + value)
- `web/src/lib/export/model/render-html.test.ts` (modify, if present)
- `web/src/lib/export/model/archive.test.ts` (modify, if it asserts the user shape)
- `docs/data-export.md` (modify — `data.json` user object: `email` → `username`)
- **Test fixtures that construct an `AuthUser` / seed user with `email`** (the
  type change breaks all of them — they must switch to `username`):
  `web/src/lib/auth/model/__mocks__/auth-client.ts` (the `SEED_USER` literal —
  a `.ts` file the `*.test.ts` grep would otherwise miss),
  `web/src/lib/shared/state/session.test.ts` (the real session test — there is no
  `session.svelte.test.ts`), `web/src/lib/shared/http/postgrest.test.ts`,
  `web/src/lib/shared/http/bearer-write.test.ts`,
  `web/src/lib/item/state/items.test.ts`, `web/src/lib/list/state/lists.test.ts`,
  `web/src/lib/shared/state/profile.test.ts`, `web/src/routes/layout.test.ts`,
  `web/src/routes/auth/callback/page.test.ts`,
  `web/src/lib/auth/components/LoginCheck.test.ts`,
  `web/src/lib/auth/components/LoginRequest.test.ts`,
  `web/src/lib/auth/components/DevShortcuts.test.ts` (also touched by Task 4.5),
  `web/src/lib/auth/state/pending-login.test.ts` (the `setSignedIn({id,email})`
  call, not its own `pendingLogin.email` which is unrelated).

**Steps:**
1. RED — In `auth-client.test.ts`, assert `signIn`/`register` POST the right paths
   with `{username,password}` + the CSRF header and return `{ user }`; assert a
   non-2xx throws `HttpError`. In the session test, assert `isAuthUser` accepts
   `{id,username}` and rejects `{id,email}` / missing username. In the export
   test, assert the rendered HTML shows `@handle`, not an e-mail. Run `cd web &&
   pnpm test`; confirm red.
2. GREEN — Add `signIn`/`register`; change `AuthUser` to `{id,username}`; update
   both guards and the export renderer. Re-run `pnpm test`; green.
3. Sweep every test fixture that builds an `AuthUser` / seed user with `email`
   (the enumerated files above — `grep -rn "email:" web/src --include=*.ts`,
   **not** `--include=*.test.ts`, so the sweep also reaches mocks/helpers like
   `__mocks__/auth-client.ts`) and switch each to `username`. Then run `pnpm check`
   as the backstop for any remaining `.email` read on `AuthUser` across the app
   (svelte-check flags the type errors) and `pnpm test` for the runtime fixtures
   that `check` can't catch. Both must be green before the task is done.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

### [ ] 4.2 Register + sign-in screens and routes; serve them in dev and prod

**Created:** 2026-06-17T08:42:42Z
**Completed:**

**Why:** The user-facing surface for the new credential, and the
routing that lets `/auth/signin` + `/auth/register` serve the SPA pages rather
than being swallowed by the BFF.

**Prerequisites:** Task 4.1 (`signIn`/`register` client calls). The existing
auth-screen idiom is `web/src/lib/auth/components/LoginRequest.svelte`; form
primitives are `web/src/lib/basic/components/` (`Label`, `TextInput`, `Button`).
**Prod routing trap:** `caddy/Caddyfile.prod`'s `@gotrue` matcher globs
`/auth/signin*` and `/auth/register*` to the proxy for **all** methods — so a GET
page route there is swallowed in prod (the "subtlest prod-only failure" the
Caddyfile comments warn about).

**Decisions (layout spec — no dedicated register/sign-in JSX exists in
`design/cairn-screens.jsx`; mirror the `LoginRequest` structure):**
- Top-to-bottom: brand glyph (centred) → "Cairn" wordmark → italic tagline →
  short blurb → form (labelled fields) → primary action button → imprint footer.
  Layout (padding, flex, gaps) is **local** scoped CSS; all colour/type is global
  tokens/typography per `docs/ui.md` "layout local, visual global" — use the
  `<Label>`, `<TextInput>`, `<Button tone="primary">` primitives, never hand-rolled
  visual rules or hex.
- **Sign-in** (`SignIn.svelte`): fields `Username` (text, `autocomplete="username"`)
  and `Password` (`type="password"`, `autocomplete="current-password"`). Primary
  button "Sign in". Constant-shape failure → inline error "That username or
  password is incorrect." (British copy; don't reveal which factor). Cross-link
  "Create an account" → `/auth/register`. A non-functional "Forgot password?"
  placeholder may be present or omitted (recovery is 2004) — if present, it must
  not imply a working flow.
- **Register** (`Register.svelte`): fields `Username` (with the `a-zA-Z0-9`, 3–30
  rule surfaced as helper/validation copy) and `Password`
  (`autocomplete="new-password"`, min 8 surfaced). Primary button "Create account".
  Map `409` → "That username is taken.", `400` invalid → a format message.
  Cross-link "Sign in" → `/auth/signin`. **No** recovery-e-mail field (2004).
- Routes: `web/src/routes/auth/signin/+page.svelte` renders `<SignIn />`;
  `web/src/routes/auth/register/+page.svelte` renders `<Register />`. Colocated
  tests drop the `+` (`signin/page.test.ts`).
- **Serving (dev):** the dev `web/vite.config.ts` auth middleware already
  POST-gates signin/register (`req.method !== 'POST'` at `vite.config.ts:221`), so
  no method change is needed there. But a GET to `/auth/signin` only reaches the
  SvelteKit page if the path is in `PUBLIC_AUTH_PATHS` — the Vite proxy `bypass`
  short-circuits to SvelteKit only for those paths (`vite.config.ts:272`), and that
  list is **not** edited until Task 4.3. So in this task's state a GET `/auth/signin`
  is still proxied to GoTrue and 404s; the dev "GET serves the page" verification
  therefore belongs to Task 4.3 (after the `PUBLIC_AUTH_PATHS` edit), not here.
- **Serving (prod):** in `caddy/Caddyfile.prod`, split the `@gotrue` matcher so
  `/auth/signin*` + `/auth/register*` route to the proxy **only for `method POST`**
  (the precedent is the existing `@avatar_writes` `method POST DELETE` matcher);
  GET falls through to `web` (the SPA). Prod GET-serving depends on this Caddy gate,
  *not* on `PUBLIC_AUTH_PATHS`, so it stays in this task. Flag it as **prod-facing**
  per CLAUDE.md "We are going live" — it can't be exercised in dev/e2e, verify by
  inspection.

**Reference:** `web/src/lib/auth/components/LoginRequest.svelte` (the structural
idiom + scoped-CSS style); `docs/ui.md` (TopBar, button-pair order, form
primitives, layout-local/visual-global); `web/src/lib/basic/components/` (`Label`,
`TextInput`, `Button` signatures); `caddy/Caddyfile.prod` (the `@gotrue` matcher
to method-gate).

**Files:**
- `web/src/lib/auth/components/SignIn.svelte` (create) + `SignIn.test.ts` (create)
- `web/src/lib/auth/components/Register.svelte` (create) + `Register.test.ts` (create)
- `web/src/routes/auth/signin/+page.svelte` (create)
- `web/src/routes/auth/register/+page.svelte` (create)
- `web/vite.config.ts` (modify — POST-only intercept for signin/register)
- `caddy/Caddyfile.prod` (modify — method-gate signin/register; prod-facing)

**Steps:**
1. RED — `SignIn.test.ts`: renders username + password fields; submit calls
   `signIn(username,password)`; a thrown `HttpError` 401 renders the constant-shape
   inline error; submit disabled until both fields non-empty. `Register.test.ts`:
   renders username + password; submit calls `register`; `409` → taken message;
   `400` → invalid message. Run `cd web && pnpm test`; confirm red.
2. GREEN — Implement `SignIn.svelte` + `Register.svelte` per the layout spec
   (reusing the primitives), and the two `+page.svelte` routes. Re-run; green.
3. Confirm the dev `vite.config.ts` auth middleware already POST-gates
   signin/register (`vite.config.ts:221`) — no change needed there. (The dev
   "GET serves the page" check happens in Task 4.3, after `PUBLIC_AUTH_PATHS` is
   edited.) Method-gate the `caddy/Caddyfile.prod` `@gotrue` matcher for
   signin/register so GET falls through to `web` (prod-facing — note in the report
   it can't be exercised in dev/e2e; verify by inspection).
4. Run `pnpm check` (svelte-check validates the new route IDs exist for Task 4.3's
   `resolve()` calls).

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

### [ ] 4.3 Re-point the route guard; make the new routes public (R8)

**Created:** 2026-06-17T08:42:42Z
**Completed:**

**Why:** Make sign-in/register the primary surface: a signed-out user lands on
`/auth/signin`, both routes are signed-out-viewable, and a signed-in user is
bounced away from them.

**Prerequisites:** Task 4.2 (the `/auth/signin` + `/auth/register` routes exist —
`resolve()` requires them). Route guard: `web/src/routes/+layout.svelte:31-71`
redirects signed-out users to `/auth/login` (line 63). Path lists live in
`web/src/lib/shared/model/auth-paths.ts` with a **byte-identical copy** at
`auth-proxy/src/lib/auth-paths.ts`, guarded by the deep-equal drift test
`auth-proxy/test/auth-paths-drift.test.ts` — **both copies must change together**.

**Decisions:**
- Add `/auth/signin` and `/auth/register` to `PUBLIC_AUTH_PATHS` (signed-out may
  view) and `SIGNED_IN_REDIRECT_PATHS` (signed-in bounced to `/`). Keep the legacy
  `/auth/login`, `/auth/check`, `/auth/callback` in `PUBLIC_AUTH_PATHS` (still
  reachable until 2006). Edit **both** `auth-paths.ts` copies identically (the
  proxy copy is functionally unused for these lists but the drift test requires
  parity).
- In `+layout.svelte`, change the signed-out redirect target from
  `resolve('/auth/login')` to `resolve('/auth/signin')`.
- **Adding `/auth/signin` to `PUBLIC_AUTH_PATHS` is also what makes the dev page
  reachable:** the Vite proxy `bypass` short-circuits a request to the SvelteKit
  page only for `PUBLIC_AUTH_PATHS` (`vite.config.ts:272`). So this is the task
  where a GET `/auth/signin` first serves the page in dev — the verification Task
  4.2 deferred to here (Task 4.2 created the route but couldn't serve it under
  GET until this edit lands).

**Reference:** `.claude/skills/writing-tasks.md` (route-test filenames + the
toolchain-coupling note — the routes must exist before `resolve()`);
`auth-proxy/test/auth-paths-drift.test.ts` (the parity it enforces);
`web/vite.config.ts:272` (the `PUBLIC_AUTH_PATHS` bypass that serves the dev page).

**Files:**
- `web/src/lib/shared/model/auth-paths.ts` (modify)
- `auth-proxy/src/lib/auth-paths.ts` (modify — identical edit)
- `web/src/routes/+layout.svelte` (modify)
- `web/src/routes/+layout.svelte.test.ts` / route guard test (modify, if present)

**Steps:**
1. RED — In the route-guard / layout test, assert a signed-out user on a private
   path is redirected to `/auth/signin` (not `/auth/login`), and that a signed-out
   user may view `/auth/signin` + `/auth/register` without redirect, and a
   signed-in user on those paths is bounced to `/`. Run `cd web && pnpm test`;
   confirm red.
2. GREEN — Add the two paths to both `auth-paths.ts` copies; re-point the redirect
   target in `+layout.svelte`. Re-run `pnpm test`; green. The drift test
   (`cd auth-proxy && pnpm test`) stays green because both copies changed.
3. Confirm the dev page now serves under GET: with the stack up, a browser GET to
   `/auth/signin` (and `/auth/register`) renders the SvelteKit page rather than
   404-ing through to GoTrue — the bypass over the updated `PUBLIC_AUTH_PATHS`
   (`vite.config.ts:272`) is what enables this. (If the stack can't be brought up
   here, say so and verify by inspection of the path lists + bypass.)

**Verify:** `./scripts/check.sh` (covers the web tests **and** the auth-proxy drift test)

### [ ] 4.4 Playwright e2e: register → sign-in → rename-then-sign-in

**Created:** 2026-06-17T08:42:42Z
**Completed:**

**Why:** Prove the new credential end-to-end against the real stack, including the
property that makes the stable identity matter — a username change does not break
sign-in (parent R5/R16).

**Prerequisites:** Phases 2–3 merged behaviour available against the dev stack;
Tasks 4.1–4.3 (client + screens + routing). Existing auth e2e is
`web/e2e/auth.spec.ts` (the magic-link flows + the 2002 revocable-session tests).
Per project convention, pin single-project runs to **firefox** (WebKit can't
launch on this box; chromium also available).

**Decisions:**
- Add specs to `web/e2e/auth.spec.ts` (or a sibling `auth-password.spec.ts`):
  (a) **register happy path** — visit `/auth/register`, submit a fresh
  `username` + password, land signed-in (redirected to `/lists`), both
  `__Host-cairn_session` + `__Host-cairn_access`-equivalent dev cookies planted
  (dev names `cairn_session` / `cairn_access`); (b) **sign-in happy path** — sign
  out, visit `/auth/signin`, sign in with the same credentials, land signed-in;
  (c) **rename-then-sign-in** — while signed in, change the username (via the
  existing settings `set_username` path), sign out, and sign in with the **new**
  username + the same password → succeeds (the credential survives the rename);
  (d) **constant-shape failure** — a wrong password and an unknown username both
  show the same inline error and do not sign in.
- Use unique usernames per run (timestamp/random suffix) to avoid collisions
  across repeated runs against a shared dev DB.

**Reference:** `web/e2e/auth.spec.ts` (helpers + the dual-cookie assertions to
mirror); `docs/testing.md` (Playwright layer); the firefox-default convention.

**Files:**
- `web/e2e/auth.spec.ts` (modify) or `web/e2e/auth-password.spec.ts` (create)

**Steps:**
1. RED — Write the four specs per Decisions. Run
   `cd web && pnpm exec playwright test e2e/auth.spec.ts --project=firefox` (stack
   up); confirm the new specs fail (screens/endpoints not yet wired in this branch
   state) or, if Phases 2–4 are already merged, that they exercise the real flow.
2. GREEN — With Phases 2–4 in place, re-run; the four specs pass on firefox (and
   chromium). If the stack can't be brought up in this environment, say so
   explicitly — do not claim green.

**Verify:** `cd web && pnpm exec playwright test e2e/auth.spec.ts --project=firefox` (or `./scripts/check.sh --e2e`)

### [ ] 4.5 Migrate the dev-login shortcut + seed to the username credential

**Created:** 2026-06-17T10:54:00Z
**Completed:**

**Why:** The R6 lockdown (Task 3.2) rejects `grant_type=password` on the
`/auth/token` pass-through — including the dev mirror in `web/vite.config.ts`. But
the dev-login shortcut (`DevShortcuts.svelte:29` → `devPasswordSignIn` →
`/token?grant_type=password`, `auth-client.ts:91`) and the seed users depend on
exactly that grant. Separately, the seed (`scripts/seed.sh:64`) signs up as
`alice@example.test` etc. and never adopts `<uid>@cairn.internal`, so the new
`/auth/signin` (which grants against `<uid>@cairn.internal`) cannot authenticate
them. Left unaddressed, dev login silently breaks and several existing tests fail.
Migrate the dev shortcut onto `/auth/signin` and make the seed users sign-in-able
under the stable identity.

**Prerequisites:** Task 4.1 (`signIn(username,password)` exists), Task 2.2
(`adopt_stable_identity`), Task 2.1 (`set_username` profiles-only). The shortcut
lives in `web/src/lib/auth/components/DevShortcuts.svelte`; its tests are
`DevShortcuts.test.ts`, and `devPasswordSignIn` is also referenced by
`auth-client.test.ts`, `LoginRequest.test.ts`, and the mock
`web/src/lib/auth/model/__mocks__/auth-client.ts`. The dev password is
`VITE_DEV_LOGIN_PASSWORD`; the seed password is `DEV_PASSWORD` (`scripts/seed.sh`).
The dev-shortcut gating (`import.meta.env.DEV` dynamic import, `0301_gate_dev_login`)
is unchanged — only the call it makes changes.

**Decisions:**
- `DevShortcuts.svelte` calls `signIn(username, VITE_DEV_LOGIN_PASSWORD)` with the
  seed users' **usernames** (`alice` / `bob` / `carol`), not `devPasswordSignIn`
  with their e-mails. `DEV_USERS` carries `{ name, username }` (drop `email`).
- `devPasswordSignIn` is **retired** from `auth-client.ts` (the only caller was the
  shortcut, and the grant it used is now locked). Remove it, its block in
  `auth-client.test.ts`, the `__mocks__/auth-client.ts` entry, and update
  `DevShortcuts.test.ts` + `LoginRequest.test.ts` to mock `signIn` instead. (Keep
  `exchangeRefreshToken` / `verifyOtp` / `sendMagicLink` — the magic-link surface
  stays until 2006.)
- `scripts/seed.sh`: after `POST /signup` for each seed user, give the account a
  known, fixed username (`alice` / `bob` / `carol`) and the stable identity, so it
  resolves and password-grants under the new flow. Mechanically this is either a
  direct `psql` write (`UPDATE auth.users SET email = id || '@cairn.internal'`;
  `UPDATE public.profiles SET username = …`) — the seed already has DB access — or
  the GoTrue password grant against `<email>` (still reachable **directly** on
  `localhost:9999`, the lockdown is only on the BFF/proxy path) to obtain a bearer,
  then `adopt_stable_identity` + `set_username` via PostgREST. The direct `psql`
  write is simpler and matches the seed's existing shape. Idempotent: a re-run on
  an already-seeded user is a no-op.
- Doc reconciliation: `docs/development.md` (≈ line 281, the dev-shortcut
  description) — the shortcut now calls `/auth/signin` with the seed username, not
  GoTrue's `/token?grant_type=password`; and the "hit the API directly" curl
  example (≈ line 379) notes the seed identity is now `<uid>@cairn.internal` (grab
  the uid first), since `alice@example.test` no longer exists at GoTrue after the
  seed adopts the stable identity. `docs/deployment.md` (≈ line 315) — the
  dev-login pre-deploy note reflects the shortcut's new path.

**Reference:** `web/src/lib/auth/components/DevShortcuts.svelte` +
`DevShortcuts.test.ts`; `auth-client.ts` (`devPasswordSignIn` to remove,
`signIn` to use); `scripts/seed.sh` (the signup loop); `docs/development.md`
"Gating dev-only UI" + the dev-login section; `docs/deployment.md` auth
pre-deploy checklist.

**Files:**
- `web/src/lib/auth/components/DevShortcuts.svelte` (modify)
- `web/src/lib/auth/components/DevShortcuts.test.ts` (modify)
- `web/src/lib/auth/components/LoginRequest.test.ts` (modify — `devPasswordSignIn` refs)
- `web/src/lib/auth/model/auth-client.ts` (modify — remove `devPasswordSignIn`)
- `web/src/lib/auth/model/auth-client.test.ts` (modify — drop the `devPasswordSignIn` block)
- `web/src/lib/auth/model/__mocks__/auth-client.ts` (modify)
- `scripts/seed.sh` (modify — known usernames + stable identity)
- `docs/development.md` (modify)
- `docs/deployment.md` (modify)

**Steps:**
1. RED — Update `DevShortcuts.test.ts` to expect `signIn('alice', <devpass>)` (not
   `devPasswordSignIn('alice@example.test', …)`), and drop the `devPasswordSignIn`
   block from `auth-client.test.ts` / fix `LoginRequest.test.ts`. Run
   `cd web && pnpm test`; confirm red.
2. GREEN — Point `DevShortcuts.svelte` at `signIn(username, …)`, remove
   `devPasswordSignIn` (+ mock), update `scripts/seed.sh` to set the fixed
   usernames + stable identity. Re-run `pnpm test` + `pnpm check`; green.
3. Reconcile `docs/development.md` + `docs/deployment.md` per Decisions.
4. Re-seed and smoke-test dev login (`./scripts/seed.sh`, then click "Sign in as
   alice") against the running stack. If the stack can't be brought up here, say so
   explicitly and verify by inspection.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test` · `shellcheck scripts/seed.sh` · `cd web && pnpm exec prettier --check ../docs/development.md ../docs/deployment.md`
