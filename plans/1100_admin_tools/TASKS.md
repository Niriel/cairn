# Tasks

## Reference skills and docs

- **`docs/admin.md`** — canonical design: verbatim RPC bodies, role rationale,
  audit-table shape, CLI shape, "what admin must not do".
- **`docs/account-deletion.md`** — the `delete_account()` semantics Task 3.1 mirrors.
- **`docs/data-model.md`** — schema, the `items_deleted`/`lists_deleted` views,
  `is_list_member`.
- **`docs/testing.md`** — pgTAP is the security-boundary test layer; positive
  *and* negative cases for every grant/policy.
- **`docs/quality.md`** — SQLFluff (uppercase keywords, lowercase identifiers,
  2-space) for SQL; ShellCheck + shfmt (`-i 2 -ci -bn`) for the CLI.
- **`db/migrations/0014_delete_account.sql`** — verbatim source for `delete_account_as`.
- **`db/tests/rpc_delete_account.sql`, `db/tests/grants.sql`** — the role-switch,
  `throws_ok`, and grant-matrix patterns to copy.
- **`scripts/list-users.sh`** — the bash psql-wrapper pattern for Task 4.1.

**Migration is one file built across tasks:** Tasks 1.1, 2.1, 2.2, 3.1, 3.2 all
append to the single `db/migrations/0017_admin.sql` inside its `BEGIN; … COMMIT;`.
All SQL is written in the repo's **uppercase-keyword SQLFluff style** — the
lowercase snippets in `docs/admin.md` must be reformatted, since `sqlfluff lint
db/` gates the file. Each pgTAP file follows the standard skeleton
(`BEGIN; SELECT plan(N); \i /db/tests/fixtures/…; …; SELECT finish(); ROLLBACK;`)
and reuses `db/tests/fixtures/users_alice_bob_carol.sql`,
`list_shared_alice_bob.sql`, `list_solo_alice.sql`.

## Phase 0 — reconcile docs

### [x] 0.1 Apply the seven doc fixes to `docs/admin.md` and the master-plan line

**Created:** 2026-06-12T07:47:25Z
**Completed:** 2026-06-12T08:47:29Z

**Why:** Cairn's docs are canonical for downstream steps. Seven statements in
`docs/admin.md` are wrong or under-specified for what we're about to implement;
fixing them first (before code) keeps the spec and the implementation in step.

**Prerequisites:** None.

**Already applied:** Four of the seven edits are already present in the
working tree (uncommitted — confirm with `git diff docs/admin.md`): the
`inspect_user` allowlist, the `delete_account_as` `NOT EXISTS` list-deletion
form, **and** (added by the `/concerns` pass) the `admin.actions` no-RLS fix
and the `moderate_*` claim-to-tombstone fix. The three that remain are CLI→bash,
the `effective` value, and the `cairn_admin_owner` BYPASSRLS + public-table
grants. Verify the four match the Decisions below; apply the remaining three.

**Decisions:**
- **CLI → bash.** The VPS has no Python; a Python CLI would force a runtime onto
  the production box for one script. Bash matches every other operator script
  and rides the existing ShellCheck/shfmt gauntlet.
- **`effective` value.** Inside a `security definer` function `current_user` is
  the function owner, so `effective` records `cairn_admin_owner`, never
  `cairn_admin`. The sanity check ("writes always run as the admin owner")
  still holds.
- **`cairn_admin_owner` grants.** The owner role is `BYPASSRLS` and holds
  `SELECT/UPDATE/DELETE` on `public.items`/`public.lists` and `SELECT` on
  `public.list_members/profiles/user_settings/votes` — the doc only listed the
  `auth.users` grants, but the RPCs run with no JWT so RLS would otherwise deny
  their public-table access.
- **`inspect_user` allowlist.** The doc built the `auth` sub-document as
  `to_jsonb(u)` minus four named secrets. That denylist misses other GoTrue
  credential/recovery tokens (`email_change_token_current`,
  `reauthentication_token`, `phone_change_token`, …) and re-leaks every column a
  future image adds — to `cairn_readonly`, the one role with no other path to
  `auth.users`. The body instead builds `auth` from an explicit safe set, so new
  columns are excluded by default (R7).
- **`delete_account_as` list-deletion form.** The doc's body scoped the
  sole-member delete with `EXISTS (target is a member) AND NOT EXISTS (other
  live member)`, which diverges from `public.delete_account()`'s bare
  `NOT EXISTS (other live member)` on orphaned (zero-live-member) lists. For the
  "identical end-state" guarantee (R5) the body uses `delete_account()`'s exact
  `NOT EXISTS` form with `p_target` substituted.
- **`admin.actions` has no RLS.** The doc's body enabled `row level security`
  with no policies while its own prose bullet says "No RLS". Enabling it is a
  bug: with no policy it default-denies, so `cairn_readonly`'s `SELECT` returns
  zero rows and `cairn-admin log` comes back empty in production. Remove the
  `enable row level security` line and align the comment; the `SELECT`-only
  grant restricts reads and the absence of `UPDATE`/`DELETE` grants keeps it
  append-only (R3).
- **`moderate_*` claim-to-tombstone.** The doc's `moderate_item`/`moderate_list`
  set `deleted_by = '0000…'` in the `UPDATE`, but the `BEFORE UPDATE`
  attribution trigger overwrites it with `public.uid()` (NULL in an admin RPC).
  The body instead does `perform set_config('request.jwt.claims',
  jsonb_build_object('sub','0000…')::text, true)` before the `UPDATE` and drops
  the `deleted_by =` clause, so the trigger stamps the tombstone (R5).

**Files:**
- `docs/admin.md` (modify)
- `plans/0000_implementation_order.md` (modify)

**Steps:**
1. In `docs/admin.md` § "The `cairn-admin` CLI", change "A small Python script"
   to "A small bash script" and drop/adjust Python-specific phrasing (argparse
   → arg parsing); add one sentence noting the no-Python-on-the-VPS rationale so
   it isn't re-litigated.
2. In `docs/admin.md` § "The `admin.actions` audit table", correct the `effective`
   bullet: `effective` records `current_user`, which under `security definer`
   execution is the function owner `cairn_admin_owner` (not `cairn_admin`); the
   sanity check is "writes always run as the admin owner".
3. In `docs/admin.md` § "The `admin` schema and Postgres roles" (near the
   `auth.users` grants), add a sentence: `cairn_admin_owner` is `BYPASSRLS` and
   also holds `SELECT/UPDATE/DELETE` on `public.items`/`public.lists` and
   `SELECT` on `public.list_members/profiles/user_settings/votes`, because the
   RPCs run with no JWT and would otherwise be denied by RLS.
4. In `docs/admin.md` § `admin.inspect_user`, replace the `to_jsonb(u) - '…'`
   denylist in the `auth` sub-document with an allowlist `jsonb_build_object`
   over the safe columns (`id`, `email`, `email_confirmed_at`,
   `last_sign_in_at`, `banned_until`, `created_at`); update the explanatory
   paragraph below the code block to give the denylist-re-leak rationale.
5. In `docs/admin.md` § `admin.delete_account_as`, change the sole-member list
   delete to `delete_account()`'s bare `NOT EXISTS (live member <> p_target)`
   form (drop the `EXISTS (target is a member)` clause); note in a comment why
   the identical form is what makes the end-states match.
6. In `docs/admin.md` § "The `admin.actions` audit table" (already applied —
   verify), remove the `alter table admin.actions enable row level security;`
   line and its "No policies" comment; the comment now states RLS is *not*
   enabled (it would default-deny `cairn_readonly`'s `SELECT` to zero rows) and
   that the `SELECT`-only grant + no `UPDATE`/`DELETE` is the boundary.
7. In `docs/admin.md` § `admin.moderate_item` (already applied — verify), the
   body sets `request.jwt.claims` to the tombstone `sub` via `set_config(…,
   true)` before the `UPDATE` and drops the `deleted_by = '0000…'` clause; add
   the matching note to the `moderate_list`/`purge_list` prose.
8. In `plans/0000_implementation_order.md` step 11: change `0006_admin.sql` to
   `0017_admin.sql` and "(Python; SET ROLE discipline; …)" to "(bash; SET ROLE
   discipline; …)". Leave the `[ ]` box unticked (ticked at merge).

**Verify:** `git diff docs/admin.md plans/0000_implementation_order.md` — the
seven substantive changes are present (four already staged) and nothing else
churned.

## Phase 1 — schema, roles, audit table

### [ ] 1.1 Create the `admin` schema, roles, grants, and `admin.actions` table

**Created:** 2026-06-12T07:47:25Z
**Completed:**

**Why:** Everything else hangs off the schema, the three least-privilege roles,
and the audit table. This is the foundation and the secondary defence (R2) the
master plan calls out.

**Prerequisites:** Task 0.1 (doc reconciled).

**Decisions:**
- Highest existing migration is `0016`; this is **`0017_admin.sql`**, one
  `BEGIN; … COMMIT;`, header comment in the `0014_delete_account.sql:1-32` style.
- Roles created idempotently with `DO $$ … pg_roles …$$` blocks (per
  `0001_init.sql`): `cairn_admin_owner NOLOGIN BYPASSRLS`, `cairn_admin NOLOGIN`,
  `cairn_readonly NOLOGIN`; `GRANT cairn_readonly TO cairn_admin`.
- `CREATE SCHEMA IF NOT EXISTS admin AUTHORIZATION cairn_admin_owner;` then
  `REVOKE ALL ON SCHEMA admin FROM public, authenticated, anon;`
  `GRANT USAGE ON SCHEMA admin TO cairn_admin;`
  **`GRANT USAGE ON SCHEMA admin TO cairn_readonly;`** — load-bearing: without
  it a standalone `cairn_readonly` operator cannot reach `inspect_user` or
  `admin.actions` (schema `USAGE` gates every object privilege inside). R2.
- Owner grants: `GRANT SELECT, UPDATE (banned_until), DELETE ON auth.users TO
  cairn_admin_owner;` `GRANT SELECT, UPDATE, DELETE ON public.items, public.lists
  TO cairn_admin_owner;` `GRANT SELECT ON public.list_members, public.profiles,
  public.user_settings, public.votes TO cairn_admin_owner;`
- `admin.actions` columns exactly per `docs/admin.md` § audit table (`reason
  text NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000)`, `created_at … DEFAULT
  clock_timestamp()`). After `CREATE TABLE`, `ALTER TABLE admin.actions OWNER TO
  cairn_admin_owner;` (so the definer RPCs can INSERT), `GRANT SELECT ON
  admin.actions TO cairn_readonly;` `REVOKE ALL ON admin.actions FROM
  authenticated, anon, public;` **Do NOT `ENABLE ROW LEVEL SECURITY`:** with no
  policy it default-denies, so `cairn_readonly`'s `SELECT` would return zero
  rows (breaking `cairn-admin log` in prod, where the operator is a non-superuser
  role — dev/test masks it via the `cairn` superuser). Reads are restricted by
  the `SELECT`-only grant; append-only by withholding `UPDATE`/`DELETE`. (R3.)
- **Bootstrap coupling:** `db/test-bootstrap.sql` stubs `auth.users` without
  `banned_until`; the `UPDATE (banned_until)` grant won't apply without it. The
  same stub also needs the columns `inspect_user` reads (`email_confirmed_at`,
  `last_sign_in_at`) and the credential/token columns the secret-stripping test
  (Task 2.2) seeds (`encrypted_password`, `recovery_token`, `confirmation_token`,
  `email_change_token_new`, `email_change_token_current`,
  `reauthentication_token`, `phone_change_token`) — add them all here so 2.2's
  assertion isn't vacuous.

**Reference:** `docs/admin.md` § "The `admin` schema and Postgres roles" + "The
`admin.actions` audit table" for the canonical SQL (reformat to uppercase).

**Files:**
- `db/test-bootstrap.sql` (modify)
- `db/migrations/0017_admin.sql` (create)
- `db/tests/admin_grants.sql` (create)
- `db/tests/admin_actions_audit.sql` (create)

**Steps:**
1. GREEN — In `db/test-bootstrap.sql`, add `banned_until timestamptz`,
   `email_confirmed_at timestamptz`, `last_sign_in_at timestamptz`, and the
   credential/token columns `encrypted_password`, `recovery_token`,
   `confirmation_token`, `email_change_token_new`, `email_change_token_current`,
   `reauthentication_token`, `phone_change_token` (all `text`) to the stub
   `auth.users`, and add them to the column-checklist comment (`:21-25`).
2. RED — Create `db/tests/admin_grants.sql` with `plan(N)`: `authenticated` and
   `anon` have **no** `USAGE` on schema `admin` (`has_schema_privilege` false),
   no `SELECT` on `admin.actions` (`has_table_privilege` false); `cairn_admin`
   has `USAGE` on `admin`; **`cairn_readonly` has `USAGE` on `admin`**
   (`has_schema_privilege` true — without the grant this fails, catching the
   readonly-unusable bug); `cairn_readonly` has `SELECT` on `admin.actions` but
   **not** `UPDATE`/`DELETE` (append-only); `cairn_admin` inherits
   `cairn_readonly` (`pg_has_role('cairn_admin','cairn_readonly','USAGE')`).
3. RED — Create `db/tests/admin_actions_audit.sql` with `plan(N)`: a direct
   `INSERT INTO admin.actions (…, reason)` with `reason = ''` throws `23514`;
   `reason` of length 2001 throws `23514`; a 1-char and a 2000-char reason are
   accepted (`lives_ok`); `admin.actions` is owned by `cairn_admin_owner`
   (`pg_tables`/`to_regclass` owner check). **Read-visibility (R3):** after
   inserting at least one row (as the test superuser), `SET LOCAL ROLE
   cairn_readonly` and assert `SELECT count(*) FROM admin.actions` is `>= 1` —
   this is the assertion that fails if RLS is ever enabled (it would
   default-deny `cairn_readonly` to zero rows); `RESET ROLE` afterwards. Also
   assert `cairn_readonly` has **no** `UPDATE`/`DELETE` on `admin.actions`
   (`NOT has_table_privilege`), the append-only guarantee.
4. RED — `./scripts/test-db.sh` reports both new files red (objects absent).
5. GREEN — Create `db/migrations/0017_admin.sql` with the roles, schema, owner
   grants, and `admin.actions` table per Decisions.
6. GREEN — `./scripts/test-db.sh` green.

**Verify:** `./scripts/test-db.sh` · `sqlfluff lint db/migrations/0017_admin.sql db/tests/admin_grants.sql db/tests/admin_actions_audit.sql`

## Phase 2 — ban / unban / inspect

### [ ] 2.1 Add `admin.ban_user` and `admin.unban_user`

**Created:** 2026-06-12T07:47:25Z
**Completed:**

**Why:** The operator's banhammer — set/clear `auth.users.banned_until` with an
audited reason. The simplest write RPCs, so they pin the audit-and-guard pattern
every later RPC reuses.

**Prerequisites:** Task 1.1 (`admin.actions`, roles, `auth.users.banned_until`
stub).

**Decisions:**
- Both `language plpgsql security definer set search_path = admin, public, auth`.
  Bodies per `docs/admin.md` § `ban_user`/`unban_user` (reformat to uppercase).
- Guard order (load-bearing for R4/R6): reject tombstone target ('cannot ban the
  tombstone user'); `SELECT banned_until … IF NOT FOUND` → 'no such user';
  **then** `INSERT INTO admin.actions (…, payload =
  jsonb_build_object('banned_until', prev))`; **then** the `UPDATE`. So a
  rejected target writes no audit row.
- `ban_user` sets `banned_until = 'infinity'`; `unban_user` sets `NULL`.
- For each: `ALTER FUNCTION admin.<fn>(uuid, text) OWNER TO cairn_admin_owner;
  REVOKE ALL … FROM public; GRANT EXECUTE … TO cairn_admin;`
- In tests, act with `SET LOCAL ROLE cairn_admin`; read true state with `RESET
  ROLE`. `actor` records the connection role (`cairn` in test), `effective`
  records `cairn_admin_owner`.

**Files:**
- `db/migrations/0017_admin.sql` (modify — append both functions + grants)
- `db/tests/admin_ban.sql` (create)

**Steps:**
1. RED — Create `db/tests/admin_ban.sql` with `plan(N)`, `\i` the users fixture.
   As `cairn_admin`: `ban_user(bob, 'reason ≥8')` sets Bob's `banned_until` to
   `'infinity'`; exactly one `admin.actions` row with `action='ban_user'`,
   `target=bob`, `actor=session_user`, `effective='cairn_admin_owner'`,
   `payload->>'banned_until'` = the prior value. `unban_user` clears it and logs.
   Negatives: tombstone target throws; non-existent uuid throws 'no such user'
   **and** leaves zero new audit rows; as `authenticated`, `ban_user` throws
   `42501` and writes no audit row. **Grant matrix (R2):** assert
   `has_function_privilege` EXECUTE is **true** for `cairn_admin` and **false**
   for `authenticated`, `anon`, **and `cairn_readonly`** on
   `admin.ban_user(uuid, text)` *and* `admin.unban_user(uuid, text)` — the
   negatives must cover `unban_user`, not just `ban_user`. The `cairn_readonly`
   negative is load-bearing: it proves the read-only role cannot escalate to a
   write RPC (its only EXECUTE grant is `inspect_user`).
2. RED — `./scripts/test-db.sh` red.
3. GREEN — Append `ban_user`/`unban_user` + grants to `0017_admin.sql`.
4. GREEN — `./scripts/test-db.sh` green.

**Verify:** `./scripts/test-db.sh` · `sqlfluff lint db/migrations/0017_admin.sql db/tests/admin_ban.sql`

### [ ] 2.2 Add `admin.inspect_user`

**Created:** 2026-06-12T07:47:25Z
**Completed:**

**Why:** Read-only inspection for "user says X is broken" — the only RPC with no
reason and no audit row, granted to `cairn_readonly`. The asymmetry (reads are
unlogged, writes always logged) is the protection.

**Prerequisites:** Task 1.1.

**Decisions:**
- `language plpgsql security definer stable set search_path = admin, public,
  auth`. Body per `docs/admin.md` § `inspect_user` (now corrected by Task 0.1):
  one `jsonb_build_object` whose `auth` key is built from an **allowlist**
  `jsonb_build_object` over the safe columns (`id`, `email`,
  `email_confirmed_at`, `last_sign_in_at`, `banned_until`, `created_at`) — **not**
  a `to_jsonb(u)` minus named secrets — plus `profile`, `user_settings`,
  `memberships` (live), `item_count` (live, `created_by`), `vote_count`.
- `ALTER FUNCTION admin.inspect_user(uuid) OWNER TO cairn_admin_owner; REVOKE ALL
  … FROM public; GRANT EXECUTE … TO cairn_readonly;` (readonly, not admin —
  `cairn_admin` reaches it via inheritance).
- **Non-vacuous secret test.** Task 1.1 widens the bootstrap stub to include the
  credential/token columns. Seed Alice's `auth.users` row with sentinel values
  in those columns (e.g. `encrypted_password = 'SENTINEL'`), then assert each is
  **absent** from `inspect_user(alice)->'auth'` *and* that an allowed column
  (`auth->>'email'`) **is present and correct** — so the test fails if the
  allowlist ever regresses (a denylist-style body would let an unlisted secret
  through).

**Files:**
- `db/migrations/0017_admin.sql` (modify — append function + grants)
- `db/tests/admin_inspect.sql` (create)

**Steps:**
1. RED — Create `db/tests/admin_inspect.sql` with `plan(N)`, `\i` users +
   `list_shared_alice_bob` fixtures. Seed Alice's `auth.users` row with sentinel
   values in the credential/token columns. As `cairn_admin` (inherits readonly):
   `inspect_user(alice)` returns a jsonb whose `profile->>'display_name'`
   matches, `memberships` has the expected count, `item_count`/`vote_count` are
   ints; the `auth` object **omits all** credential/token keys
   (`encrypted_password`, `recovery_token`, `confirmation_token`,
   `email_change_token_new`, `email_change_token_current`,
   `reauthentication_token`, `phone_change_token`) **and** carries the expected
   `email`; calling it writes **zero** `admin.actions` rows. Negatives: as
   `authenticated`, throws `42501`; grant matrix — `has_function_privilege`
   EXECUTE on `admin.inspect_user(uuid)` is **true** for `cairn_readonly`,
   **false** for `authenticated` and `anon`.
2. RED — `./scripts/test-db.sh` red.
3. GREEN — Append `inspect_user` + grants to `0017_admin.sql`.
4. GREEN — `./scripts/test-db.sh` green.

**Verify:** `./scripts/test-db.sh` · `sqlfluff lint db/migrations/0017_admin.sql db/tests/admin_inspect.sql`

## Phase 3 — delete / moderate / purge

### [ ] 3.1 Add `admin.delete_account_as`

**Created:** 2026-06-12T07:47:25Z
**Completed:**

**Why:** The operator's GDPR-erasure pathway. It must produce the **exact same
end-state** as the user-initiated `public.delete_account()` from step 10, so the
two paths can't diverge.

**Prerequisites:** Task 1.1; mirrors `db/migrations/0014_delete_account.sql:36-72`.

**Decisions:**
- Body copies `delete_account()` verbatim except: target is `p_target` (not
  `public.uid()`); guards raise 'cannot delete the tombstone user' and 'no such
  user' (the latter via `SELECT email INTO email_at_time … IF NOT FOUND`); the
  audit insert (`payload = jsonb_build_object('email_at_time', email_at_time)`)
  goes **before** the deletes.
- **Order is load-bearing:** compute the sole-member list hard-delete *before*
  `DELETE FROM auth.users` — the auth delete cascades the `list_members` rows the
  query reads. Use `delete_account()`'s **exact** `NOT EXISTS (live member <>
  p_target)` form (`0014_delete_account.sql:55-62`), **not** the doc's original
  `EXISTS (member = p_target) AND NOT EXISTS (other)` variant: the two diverge on
  orphaned (zero-live-member) lists, and only the verbatim form makes the
  "identical end-state" claim (R5) literally true. (Task 0.1 has already
  corrected the doc's body to match.)
- `language plpgsql security definer set search_path = admin, public, auth`;
  `ALTER … OWNER TO cairn_admin_owner; REVOKE … FROM public; GRANT EXECUTE … TO
  cairn_admin;`
- `payload` deliberately records only `email_at_time` — the audit log is not a
  recovery channel for just-erased personal data.

**Files:**
- `db/migrations/0017_admin.sql` (modify — append function + grants)
- `db/tests/admin_delete_account_as.sql` (create)

**Steps:**
1. RED — Create `db/tests/admin_delete_account_as.sql` with `plan(N)`. Build two
   parallel worlds in the same test. **World A (admin path):** give Bob a solo
   list and a shared (Alice+Bob) list, each with an item + a vote (reuse/adapt
   the list fixtures). Delete via `admin.delete_account_as(bob, 'reason ≥8')`.
   Assert: Bob's `auth.users`/`profiles` rows gone; Bob's solo list gone
   (cascaded items/votes); the shared list **kept** with Bob's attribution
   repointed to the tombstone (`created_by`/`deleted_by` = `0000…`); Bob's votes
   gone. **World B (user path):** give **Carol** the mirror shape — her own solo
   list and a shared (Alice+Carol) list with an item + vote — then, as Carol
   (`SET LOCAL ROLE authenticated` + her JWT claim), `public.delete_account()`,
   and assert the same shape. The two end-states match.
   **Orphaned-list case (load-bearing for the verbatim `NOT EXISTS` form):** add
   a list that is *orphaned* for the target — its only member soft-deleted their
   `list_members` row (zero live members) — in both worlds, and assert **both**
   paths hard-delete it. This is the one scenario the doc's old
   `EXISTS … AND NOT EXISTS …` variant would have diverged on; without it the
   reason for choosing the verbatim form goes untested. Plus: one audit row with
   `action='delete_account_as'`, `payload->>'email_at_time'` set; tombstone +
   'no such user' guards throw and write no audit row. **Grant matrix (R2):**
   `has_function_privilege` EXECUTE on `admin.delete_account_as(uuid, text)` is
   **true** for `cairn_admin`, **false** for `authenticated`, `anon`, **and
   `cairn_readonly`** (and as `authenticated`, a call throws `42501`).
2. RED — `./scripts/test-db.sh` red.
3. GREEN — Append `delete_account_as` + grants to `0017_admin.sql`.
4. GREEN — `./scripts/test-db.sh` green.

**Verify:** `./scripts/test-db.sh` · `sqlfluff lint db/migrations/0017_admin.sql db/tests/admin_delete_account_as.sql`

### [ ] 3.2 Add `admin.moderate_item`, `purge_item`, `moderate_list`, `purge_list`

**Created:** 2026-06-12T07:47:25Z
**Completed:**

**Why:** The takedown levers — soft (recoverable, attributed to tombstone) and
hard (irrecoverable, cascading) for both items and lists, each audited with a
pre-state snapshot.

**Prerequisites:** Task 1.1; uses the `items_deleted`/`lists_deleted` views and
the tombstone semantics from `docs/data-model.md`.

**Decisions:**
- Four `language plpgsql security definer set search_path = admin, public`
  functions; bodies per `docs/admin.md` § moderate/purge (reformat uppercase).
- `moderate_*`: snapshot `to_jsonb(row) INTO snap`; `IF snap IS NULL THEN RAISE
  'no such item'/'no such list'`; insert audit with `payload = snap`; **then set
  the request claim to the tombstone** (`PERFORM set_config('request.jwt.claims',
  jsonb_build_object('sub','00000000-0000-0000-0000-000000000000')::text,
  TRUE)`) **and** `UPDATE … SET deleted_at = clock_timestamp() WHERE id =
  p_target AND deleted_at IS NULL`. **Do NOT set `deleted_by` in the UPDATE:**
  the `BEFORE UPDATE` attribution trigger (`tg_set_attribution_items`/`_lists`,
  `0004_domain_schema.sql:369-370`) derives `deleted_by` from `public.uid()` on
  the live→deleted transition and would overwrite a directly-set value with NULL
  (no JWT in an admin RPC). Setting the claim first makes `uid()` return the
  tombstone, so the trigger stamps `deleted_by = tombstone` (R5). `purge_*` does
  a plain `DELETE` and needs no claim step.
- `purge_*`: same snapshot + audit, then `DELETE FROM public.items/lists WHERE id
  = p_target` (votes/items/list_members/invitations cascade per the FKs).
- Each: `ALTER … OWNER TO cairn_admin_owner; REVOKE … FROM public; GRANT EXECUTE
  … TO cairn_admin;`
- The `reason` CHECK is enforced by `admin.actions` (R3); each function inserts
  before mutating, so an empty reason aborts the whole action.

**Files:**
- `db/migrations/0017_admin.sql` (modify — append four functions + grants)
- `db/tests/admin_moderate_purge.sql` (create)

**Steps:**
1. RED — Create `db/tests/admin_moderate_purge.sql` with `plan(N)`, `\i` users +
   `list_shared_alice_bob`. **Note: that fixture seeds only the list and two
   memberships — no items.** Seed the item(s) and a vote directly in the test
   (the way `rpc_delete_account.sql:51-80` does): at least one item on the shared
   list, with a vote, so the purge-cascade assertion has something to cascade.
   As `cairn_admin`: `moderate_item(item, 'reason ≥8')` sets `deleted_at`
   non-null and `deleted_by = tombstone`; a member (Alice, via `SET LOCAL ROLE
   authenticated` + her JWT) still sees it through `public.items_deleted`; audit
   `payload` holds the pre-state row. `purge_item` hard-deletes the row and its
   votes (count 0). `moderate_list` soft-deletes the list (visible via
   `lists_deleted` to a member); `purge_list` hard-deletes it and cascades
   (items/votes/list_members/invitations gone). One assertion that an empty
   `reason` to any of the four throws `23514` and leaves the target unchanged.
   **Grant matrix (R2):** for each of `moderate_item`, `purge_item`,
   `moderate_list`, `purge_list` (`(uuid, text)`), `has_function_privilege`
   EXECUTE is **true** for `cairn_admin` and **false** for `authenticated`,
   `anon`, **and `cairn_readonly`** (the read-only role gets only
   `inspect_user`).
2. RED — `./scripts/test-db.sh` red.
3. GREEN — Append the four functions + grants to `0017_admin.sql`.
4. GREEN — `./scripts/test-db.sh` green.

**Verify:** `./scripts/test-db.sh` · `sqlfluff lint db/migrations/0017_admin.sql db/tests/admin_moderate_purge.sql`

## Phase 4 — the `cairn-admin` bash CLI

### [ ] 4.1 Write `scripts/cairn-admin` and wire it into the lint gauntlet

**Created:** 2026-06-12T07:47:25Z
**Completed:**

**Why:** The operator-facing ergonomics layer over the RPCs — resolves emails,
enforces `--reason`, requires self-target confirmation, and shows pre/post state
+ the audit id. It adds no security on its own (the DB grants + CHECK do); it
stops 2-AM typos.

**Prerequisites:** Phases 1–3 (all RPCs + `admin.actions` exist).

**Decisions:**
- Bash, `#!/usr/bin/env bash`, `set -euo pipefail`, header block like
  `scripts/list-users.sh`. No `.sh` extension (installed/run as `cairn-admin`).
- Sources `~/.cairn-admin.env` for libpq `PG*` connection vars + `CAIRN_ADMIN_EMAIL`.
  `case`-based dispatch: `inspect|ban|unban|delete|item|list|log`; `item`/`list`
  take a `moderate|purge` sub-verb + UUID; `log` takes `--actor/--since/--target`.
- Email→UUID: `psql -tA -v email="$E" -c "SELECT id FROM auth.users WHERE
  lower(email) = lower(:'email')"`. Validate UUID-shaped args for item/list.
- Destructive subcommands: require `--reason`; refuse a reason `< 8` chars (fast
  pre-check; the DB CHECK is the wall). Pass `reason`/`target` as `psql -v` vars
  and reference `:'reason'`/`:'target'` in SQL (libpq quoting — no injection).
- Self-target (R9): the verbatim-string guard applies to `delete` and `ban`
  only — if the resolved target email == `CAIRN_ADMIN_EMAIL`, require the literal
  `DELETE MY OWN ACCOUNT` / `BAN MY OWN ACCOUNT`; all other destructive targets
  get `[y/N]`. `unban` is non-destructive, so self-targeting it just uses the
  `[y/N]` path (no verbatim string). `item`/`list` take UUID targets that can
  never equal an email, so they have no self-target path — don't wire one up.
- Execution: one psql heredoc per action — `SET ROLE cairn_admin;` →
  `SELECT admin.<rpc>(:'target', :'reason');` → print the new `admin.actions`
  row (`id`, `payload` as pre-state) + the deterministic post-condition.
  `inspect` pretty-prints the `inspect_user` jsonb; `log` selects
  `admin.actions` with the supplied filters.
- **Lint coverage (R10), per tool:**
  - `scripts/check.sh` **shellcheck** (`shellcheck scripts/*.sh`) is a literal
    glob that misses `cairn-admin` — add the path: `shellcheck scripts/*.sh
    scripts/cairn-admin`.
  - `scripts/check.sh` **shfmt** (`shfmt -d -i 2 -ci -bn scripts/`) is a
    *directory* walk that shfmt already resolves by shebang, so it **already
    covers** the extension-less `cairn-admin` — no change strictly required
    (verified); leave it or add the path redundantly, your call.
  - `lefthook.yml` **shellcheck** and **shfmt** both use
    `glob: 'scripts/**/*.sh'`, which misses `cairn-admin`. Add two dedicated
    pre-commit commands (`shellcheck-cairn-admin`, `shfmt-cairn-admin`) with
    `glob: 'scripts/cairn-admin'` running the same checks.
- No bash test harness exists in the repo; guards are verified manually (below).

**Reference:** `docs/admin.md` § "The `cairn-admin` CLI" + "Operator workflow"
for the exact command surface and printed-output shape.

**Files:**
- `scripts/cairn-admin` (create)
- `scripts/check.sh` (modify — lint `scripts/cairn-admin`)
- `lefthook.yml` (modify — pre-commit shellcheck/shfmt for `scripts/cairn-admin`)

**Steps:**
1. GREEN — Write `scripts/cairn-admin` per Decisions; `chmod +x`.
2. GREEN — Wire lint coverage of `scripts/cairn-admin`: add the path to
   `scripts/check.sh`'s `shellcheck scripts/*.sh` line (the `shfmt … scripts/`
   directory walk already covers it), and add dedicated `shellcheck-cairn-admin`
   / `shfmt-cairn-admin` pre-commit commands to `lefthook.yml` with
   `glob: 'scripts/cairn-admin'`.
3. VERIFY (manual, dev stack up; connect as the `cairn` superuser, which can
   `SET ROLE cairn_admin`): `cairn-admin inspect alice@example.test` prints the
   JSON; `cairn-admin ban bob@example.test --reason "test ban #1"` writes an
   `admin.actions` row (confirm via `cairn-admin log --since '1 day'`);
   `cairn-admin ban … --reason "x"` is refused (reason < 8); pointing a delete at
   `CAIRN_ADMIN_EMAIL` triggers the verbatim-string confirmation; `unban` clears
   the ban. Confirm PostgREST still 404s on `…/rpc/ban_user`.

**Verify:** `shellcheck scripts/cairn-admin` · `shfmt -d -i 2 -ci -bn scripts/cairn-admin` · `./scripts/check.sh`
