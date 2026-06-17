# Tasks

## Reference skills and docs

- **`.claude/skills/writing-sql.md`** — pgTAP conventions, fixture pattern, `throws_ok`/`is`/`ok` shapes, SQLSTATE cheat sheet, role context; SQLFluff conventions for migration files.
- **`docs/invites.md`** — canonical RLS policies, both RPC sketches (add_circle_by_email, add_circle_by_id), and "Block always wins" prose.
- **`docs/data-model.md`** — trigger naming convention (t01*/t05*/t20\_), grant pattern, pgTAP test structure, `tg_freeze_list_members_pk` rationale (mirror for relationships).
- **`docs/testing.md`** — pgTAP file conventions, fixture include pattern.

---

## Phase 1 — Schema, policies, RPCs, tests

### [x] 1.1 Write pgTAP and implement migration 0008_relationships.sql

**Created:** 2026-05-28T06:30:43Z
**Completed:** 2026-05-28T09:00:51Z

**Why:** TDD in a single commit. Per `.claude/skills/writing-tasks.md`,
RED and GREEN for the same logic live in the same task — a commit at the
end of a RED-only task is broken code. This task writes the pgTAP
assertions first (they will fail because the table doesn't exist), then
implements the migration to make them green, all in one commit.

**Prerequisites:** Branch `0701_relationships` checked out.
`users_alice_bob_carol.sql` fixture exists (it does).

**Decisions:**

_Migration shape:_

- File: `db/migrations/0008_relationships.sql`. Must be a single
  `BEGIN; … COMMIT;` transaction (matches `0004_domain_schema.sql`).
- Trigger names: `t01_freeze_relationships_pk` (BEFORE UPDATE, calls
  `tg_freeze_relationships_pk` — closes the PK-mutation gap on R7),
  `t05_set_timestamps` (BEFORE INSERT OR UPDATE, calls
  `tg_set_timestamps`), and `t20_set_modified_at` (BEFORE UPDATE OF
  status, calls `tg_set_modified_at`). The `t05` / `t20` binding
  names are unsuffixed — Postgres scopes trigger names per-table, so
  reuse matches `0004_domain_schema.sql:514–576`. The `t01_` prefix
  on the freeze mirrors `t01_freeze_list_members_pk`.
- `tg_freeze_relationships_pk` is a new `language plpgsql` function
  (not SECURITY DEFINER — runs as invoker; the freeze is unconditional).
  Body raises when `new.user_id IS DISTINCT FROM old.user_id` OR
  `new.other_user_id IS DISTINCT FROM old.other_user_id`. Mirrors
  `tg_freeze_list_members_pk` at `0004_domain_schema.sql:492–503`.
- `add_circle_by_email`: `search_path = public, auth` (needs auth.users).
  Body exactly per the sketch in `docs/invites.md`. Raise if target is
  null (email not found) or target = me.
- `add_circle_by_id`: `search_path = public, auth` (needs auth.users for
  explicit existence check). Raise if p_user_id = me or p_user_id not
  found. Then the one-sided `ON CONFLICT DO UPDATE WHERE status <> 'blocked'`
  upsert.
- Both functions: `REVOKE ALL ON FUNCTION … FROM public` then
  `GRANT EXECUTE ON FUNCTION … TO authenticated`, matching the
  pattern in `0007_avatars.sql:22, 37, 63` and
  `0004_domain_schema.sql:869–879`.
- GRANT `SELECT, INSERT, UPDATE, DELETE ON public.relationships TO
authenticated` goes right after `ALTER TABLE … ENABLE ROW LEVEL SECURITY`.

_Test counts:_

- New test file `db/tests/relationships.sql`. Plan count: 28 (sections
  A–J = 25 base assertions + K = 1 created_at-freeze + L = 2 PK-freeze
  raises). See Steps for the full list.
- `schema_shape.sql` current plan count: `plan(56)`. New assertions:
  - `has_table('public', 'relationships', …)` — 1
  - `has_column` for `user_id`, `other_user_id`, `status`,
    `created_at`, `modified_at` — 5 (no `id` on this table; PK is
    composite)
  - `has_function` for `add_circle_by_email(text)` and
    `add_circle_by_id(uuid)` — 2
    Total additions: 8. New plan count: 56 + 8 = **64** → `plan(64)`.
- `grants.sql` current plan count: `plan(60)`. New assertions needed:
  - SELECT on relationships for authenticated — 1
  - INSERT on relationships for authenticated — 1
  - UPDATE on relationships for authenticated — 1
  - DELETE on relationships for authenticated — 1
  - EXECUTE on add_circle_by_email for authenticated — 1
  - EXECUTE on add_circle_by_id for authenticated — 1
  - anon has no SELECT on relationships — 1
  - anon has no INSERT on relationships — 1
  - anon has no UPDATE on relationships — 1
  - anon has no DELETE on relationships — 1
  - anon has no EXECUTE on add_circle_by_email — 1
  - anon has no EXECUTE on add_circle_by_id — 1
    Total additions: 12. New plan count: 60 + 12 = **72** → `plan(72)`.
- `triggers_modified_at.sql` current plan count: `plan(11)`. Add one
  assertion for `relationships.status` bump. New count: **12**.

_Test fixtures and context:_

- Use Alice UUID `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`, Bob UUID
  `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`, Carol UUID
  `cccccccc-cccc-cccc-cccc-cccccccccccc` from the canonical fixtures.
- RPC raise assertions (G1, G2, J1, J2) and PK-freeze raises (L1, L2)
  pin SQLSTATE `P0001` — PL/pgSQL `RAISE EXCEPTION '…'` without an
  explicit `USING ERRCODE` lands as `raise_exception` / `P0001`. See
  `.claude/skills/writing-sql.md` "SQLSTATE cheat sheet for `throws_ok`".
- `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …)` for RLS tests.
- `RESET ROLE` before checking results that need superuser reads.
- **Cross-scenario cleanup is explicit, not implicit.** Sections C, D,
  E, F, H, I, J, and L each mutate `public.relationships`; the file-end
  `ROLLBACK` only buys cross-file isolation. Between every numbered
  scenario, `RESET ROLE` and run `DELETE FROM public.relationships;`
  _as superuser_ (RLS would otherwise scope the delete to the current
  claims' uid and leave the symmetric row behind). Without this,
  section D's `insert (Bob, Alice, 'blocked')` setup hits `23505`
  because section C's `add_circle_by_email` already wrote
  `(Bob, Alice, 'circle')`. State the convention once at the top of
  the file as a comment, and place the cleanup line at the start of
  every scenario's setup so the executor cannot miss it.

**Reference:** `docs/invites.md` → "The `add_circle_by_email` function"
and "The `add_circle_by_id` function" for the exact SQL sketches.
`0004_domain_schema.sql:492–503` for the `tg_freeze_list_members_pk`
shape to mirror.

**Files:**

- `db/tests/relationships.sql` (create)
- `db/tests/schema_shape.sql` (modify — add 8 assertions, update plan count)
- `db/tests/grants.sql` (modify — add 12 assertions, update plan count)
- `db/tests/triggers_modified_at.sql` (modify — add 1 bump assertion
  for `relationships.status`, update plan count `11 → 12`)
- `db/migrations/0008_relationships.sql` (create)

**Steps:**

1. RED — Create `db/tests/relationships.sql`. Structure:

   ```
   BEGIN;
   SELECT plan(N);  -- fill in N at the end
   \i /db/tests/fixtures/users_alice_bob_carol.sql
   … assertions …
   SELECT finish();
   ROLLBACK;
   ```

   Write the following assertion groups:

   **A. RLS positive (4 assertions)**
   - A1: Alice can insert a `circle` row `(Alice, Bob)` — INSERT succeeds.
   - A2: Alice can select her own rows — count = 1 after insert.
   - A3: Alice can update the row (flip to `blocked`) — UPDATE succeeds and
     status is now `blocked`.
   - A4: Alice can delete her own row — DELETE succeeds, count = 0.

   **B. RLS negative (4 assertions)**
   - B1: Bob cannot select rows where `user_id = Alice` (even with
     `other_user_id = Bob`) — count = 0 for Bob.
   - B2: Bob cannot insert a row with `user_id = Alice` — `throws_ok`
     `42501`.
   - B3: Bob cannot update Alice's rows — UPDATE matches 0 rows for Bob.
   - B4: Bob cannot delete Alice's rows — DELETE matches 0 rows for Bob.

   **C. `add_circle_by_email` — mutual outcome (3 assertions)**
   - C1: After Alice calls `add_circle_by_email('bob@test')`, there is
     a `circle` row `(Alice, Bob)` — count = 1 reading as superuser.
   - C2: There is also a `circle` row `(Bob, Alice)` — count = 1.
   - C3: Idempotent re-call leaves both rows with `status = 'circle'`
     (re-call doesn't error; statuses unchanged).

   **D. `add_circle_by_email` — block-skips-mutual (2 assertions)**
   - Setup: insert `(Bob, Alice, 'blocked')` as superuser. Then Alice
     calls `add_circle_by_email('bob@test')`.
   - D1: Alice→Bob row exists with `status = 'circle'`.
   - D2: Bob→Alice row still has `status = 'blocked'` (unchanged).

   **E. `add_circle_by_email` — caller-has-target-blocked (2 assertions)**
   - Setup: clean state, then insert `(Alice, Bob, 'blocked')` as
     superuser (Bob has no prior row — so there's no block on Bob's
     side to defeat the mutual-add half). Then Alice calls
     `add_circle_by_email('bob@test')`.
   - E1: Alice→Bob row still has `status = 'blocked'` (not overwritten —
     caller's block stands).
   - E2: Bob→Alice row was created with `status = 'circle'` (Bob has no
     block of Alice, so the mutual half lands). The both-sides-blocked
     case where Bob _does_ have Alice blocked is covered separately in
     section F.

   **F. `add_circle_by_email` — both sides blocked (2 assertions)**
   - Setup: insert both `(Alice, Bob, 'blocked')` and `(Bob, Alice, 'blocked')`
     as superuser. Then Alice calls `add_circle_by_email('bob@test')`.
   - F1: Alice→Bob row still `blocked`.
   - F2: Bob→Alice row still `blocked`.

   **G. `add_circle_by_email` — error cases (2 assertions)**
   - G1: self-add raises (`add_circle_by_email('alice@test')` as Alice).
   - G2: nonexistent email raises.

   **H. `add_circle_by_id` — one-sided (2 assertions)**
   - Setup: clean state. Alice calls `add_circle_by_id(Bob_uuid)`.
   - H1: Alice→Bob row exists with `status = 'circle'`.
   - H2: No Bob→Alice row exists (count = 0 as superuser).

   **I. `add_circle_by_id` — blocked row preserved (1 assertion)**
   - Setup: insert `(Alice, Bob, 'blocked')` as superuser. Alice calls
     `add_circle_by_id(Bob_uuid)`.
   - I1: Alice→Bob row still has `status = 'blocked'`.

   **J. `add_circle_by_id` — error cases (3 assertions)**
   - J1: self-add raises.
   - J2: non-existent UUID raises.
   - J3: idempotent re-call doesn't error and `status` stays `circle`.
     (Not a true no-op: the `ON CONFLICT DO UPDATE … WHERE status <>
'blocked'` clause matches and runs the UPDATE, so
     `tg_set_modified_at` fires and `modified_at` advances. The assertion
     only locks `status`, not `modified_at`.)

   **K. `t05_set_timestamps` freezes `created_at` on status flip (1 assertion)**
   - Setup: clean state. As superuser, insert `(Alice, Bob, 'circle')`
     and capture `created_at` into a `pg_temp` table. As authenticated
     Alice, `UPDATE public.relationships SET status = 'blocked'` for that
     row.
   - K1: `is(new.created_at, original.created_at, …)` — `t05`'s
     `new.created_at := old.created_at` clause on UPDATE keeps the
     creation timestamp pinned. Locks the freeze for this table; the
     existing per-table bump assertions in `triggers_modified_at.sql`
     don't cover the `created_at` freeze invariant.

   **L. `t01_freeze_relationships_pk` rejects PK mutation (2 assertions)**
   - Setup: clean state. As superuser, insert `(Alice, Bob, 'circle')`.
     Switch to authenticated Alice with her JWT claims.
   - L1: `throws_ok` `UPDATE public.relationships SET other_user_id =
'<Carol uuid>' WHERE user_id = Alice AND other_user_id = Bob` —
     SQLSTATE `P0001` (`raise_exception`). The freeze trigger fires
     first and raises before `t05`/`t20` do any work.
   - L2: `throws_ok` `UPDATE public.relationships SET user_id =
'<Bob uuid>' WHERE user_id = Alice AND other_user_id = Bob` —
     SQLSTATE `P0001`. (The RLS `with check` would also reject this
     post-trigger, but the trigger short-circuits earlier; this
     assertion locks the trigger as the gate, not RLS.)

   Total in relationships.sql: 4+4+3+2+2+2+2+2+1+3+1+2 = **28** assertions.

2. RED — Update `db/tests/schema_shape.sql`:
   - Change `SELECT plan(56)` → `SELECT plan(64)`.
   - After the existing functions block, add:
     ```sql
     -- relationships table (1)
     SELECT has_table('public', 'relationships', 'relationships table exists');
     -- relationships columns (5)
     SELECT has_column('public', 'relationships', 'user_id', …);
     SELECT has_column('public', 'relationships', 'other_user_id', …);
     SELECT has_column('public', 'relationships', 'status', …);
     SELECT has_column('public', 'relationships', 'created_at', …);
     SELECT has_column('public', 'relationships', 'modified_at', …);
     -- circle RPCs (2)
     SELECT has_function('public', 'add_circle_by_email', ARRAY['text'], …);
     SELECT has_function('public', 'add_circle_by_id', ARRAY['uuid'], …);
     ```

3. RED — Update `db/tests/grants.sql`:
   - Change `SELECT plan(60)` → `SELECT plan(72)`.
   - In section A, add four rows for `relationships`
     (SELECT/INSERT/UPDATE/DELETE for authenticated).
   - In section B, add two EXECUTE rows for both RPCs for authenticated.
   - In section D (anon negatives), add four rows for `relationships`
     (×4 verbs) and two EXECUTE negatives for both RPCs for anon.

4. RED — Update `db/tests/triggers_modified_at.sql`: add a 12th
   assertion that locks `tg_set_modified_at` firing on
   `relationships.status` change. Change `SELECT plan(11)` →
   `SELECT plan(12)`. As superuser, insert `(Alice, Bob, 'circle')`,
   capture `modified_at` into a `pg_temp` variable, `UPDATE … SET
status = 'blocked' WHERE user_id = Alice AND other_user_id = Bob`,
   then `cmp_ok(new_modified_at, '>', original_modified_at, …)`.
   Follow the existing per-table bump pattern in that file.

5. RED — Run `./scripts/test-db.sh` and confirm the new assertions fail
   (table doesn't exist yet, RPCs don't exist yet, grants not set,
   freeze trigger not bound, the new `triggers_modified_at` bump
   assertion fails because the table isn't there). **Do not commit
   yet** — the migration goes in alongside the tests.

6. GREEN — Create `db/migrations/0008_relationships.sql` with the full
   migration body. Structure (single `BEGIN; … COMMIT;` transaction):

   ```sql
   BEGIN;
   -- 1. CREATE TABLE public.relationships …
   -- 2. ALTER TABLE … ENABLE ROW LEVEL SECURITY
   -- 3. GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated
   -- 4. tg_freeze_relationships_pk function (raises on PK change)
   -- 5. Trigger bindings (t01 freeze, t05 timestamps, t20 modified_at)
   -- 6. RLS policies (select, insert, update, delete)
   -- 7. add_circle_by_email function + REVOKE/GRANT EXECUTE
   -- 8. add_circle_by_id function + REVOKE/GRANT EXECUTE
   COMMIT;
   ```

7. GREEN — Run `./scripts/test-db.sh` and confirm all new assertions
   pass (schema_shape, grants, relationships tests, triggers_modified_at
   all green). Commit the test files and the migration in a single
   commit: `feat(db): add relationships table, four RLS policies, and
circle RPCs`.

**Verify:** `./scripts/test-db.sh` all green · `./scripts/check.sh` all green.
