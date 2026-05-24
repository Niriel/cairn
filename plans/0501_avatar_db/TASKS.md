# Tasks

## Reference skills and docs

- **`docs/avatars.md`** — column shape, RPC contracts, cache-busting strategy.
- **`docs/data-model.md`** — schema conventions (column ordering, security-definer
  RPC pattern, trigger extension).
- **`docs/testing.md`** — pgTAP three-layer test structure; positive + negative
  cases required for every security boundary.

---

## Phase 0 — Doc reconciliation

### [x] 0.1 Update docs before migration lands

**Created:** 2026-05-24T17:47:28Z
**Completed:** 2026-05-24T18:23:37Z

**Why:** One remaining doc gap must close before the migration is written:
the **Build order** section of `docs/avatars.md` still references `0005_avatars.sql`
and omits `set_display_name`. (Steps that corrected the physical-position wording,
added the `set_display_name` paragraph, and updated `docs/data-model.md`'s
"What the app sees" list were applied while writing the plan and are already
on disk.)

**Files:**
- `docs/avatars.md` (modify)

**Steps:**
1. In `docs/avatars.md`'s **Build order** section (near line 168), update
   bullet 1 from:
   > `0005_avatars.sql` migration: the column + the two RPCs + pgTAP coverage
   > on the column default, the `bump_avatar_version` increment, and the
   > `clear_avatar` reset.

   to:
   > `0007_avatars.sql` migration: the column + three RPCs
   > (`bump_avatar_version`, `clear_avatar`, `set_display_name`) + pgTAP
   > coverage on the column default, the increment, the reset, display-name
   > validation, and cross-user isolation.

**Verify:** `./scripts/check.sh` green (docs-only change; no schema or code).

---

## Phase 1 — DB migration + pgTAP

### [x] 1.1 Add `avatar_version` column, three RPCs, trigger rebind, and pgTAP tests

**Created:** 2026-05-24T17:47:28Z
**Completed:** 2026-05-24T18:40:18Z

**Why:** The `profiles` table needs an `avatar_version` column and three RPCs
(`bump_avatar_version`, `clear_avatar`, `set_display_name`) before the upload
sidecar (0502) or frontend (0503) can be built. The trigger must be rebound to
fire on `avatar_version` changes so `modified_at` stays accurate.

**Prerequisites:** `0501_avatar_db` branch is checked out (cut from
`0500_avatars`). Migrations `0001`–`0006` are the existing baseline.

**Decisions:**
- Migration file is `db/migrations/0007_avatars.sql` — single file for all five
  changes (column, three RPCs, trigger rebind). They form one logical unit;
  splitting them adds deploy complexity for no benefit.
- `bump_avatar_version()` and `clear_avatar()` use `language sql`. They are
  pure UPDATEs with no conditional logic.
- `set_display_name(new_name text)` uses `language plpgsql` with a `DECLARE`
  block for the trimmed value. It raises with `ERRCODE = 'check_violation'`
  (SQLSTATE `23514`) when the trimmed name is empty or longer than 100
  characters. Silent failure (no rows updated) was rejected because the
  frontend can't distinguish "nothing updated" from a network failure.
- All three functions: `SECURITY DEFINER`, `SET search_path = public`,
  `WHERE id = public.uid()`, `REVOKE ALL … FROM public`, `GRANT EXECUTE … TO
  authenticated`.
- Trigger rebind: `DROP TRIGGER t20_set_modified_at ON public.profiles` then
  `CREATE TRIGGER t20_set_modified_at BEFORE UPDATE OF display_name,
  avatar_version ON public.profiles FOR EACH ROW EXECUTE FUNCTION
  public.tg_set_modified_at()`. `ALTER TRIGGER` cannot change the `OF` column
  list so DROP + CREATE is required.
- pgTAP cross-user tests use the `users_alice_bob_carol` fixture; set JWT claims
  to Alice's UID, call the RPC, then verify Bob's row is unchanged.
- The trigger test in `triggers_modified_at.sql` follows the capture-before /
  update / assert-bump pattern already in that file: use `clock_timestamp()`
  awareness (the trigger calls `clock_timestamp()`, so a tiny `pg_sleep(0.001)`
  before the update ensures the timestamp advances within the same transaction).

**Reference:** `db/tests/rpc_create_list.sql` for the pgTAP RPC test pattern
(fixture load → set JWT claims → call RPC → assert results → defence layer).

**Files:**
- `db/migrations/0007_avatars.sql` (create)
- `db/tests/avatars.sql` (create)
- `db/tests/schema_shape.sql` (modify)
- `db/tests/grants.sql` (modify)
- `db/tests/triggers_modified_at.sql` (modify)

**Steps:**
1. RED — Create `db/tests/avatars.sql`. Load the `users_alice_bob_carol`
   fixture. Write a `plan(17)` test plan covering all cases listed below. Do not
   run yet — the migration doesn't exist so the column and functions are absent.

   Role setup (parallels `rpc_create_list.sql`): after loading the fixture,
   set JWT claims to Alice's UUID and then `SET LOCAL ROLE authenticated`
   so that GRANT EXECUTE is actually exercised rather than bypassed by the
   postgres superuser. Tests b–j run in this authenticated context.
   Step k temporarily switches to postgres (`SET LOCAL ROLE postgres`) for
   the superuser-only CHECK constraint test; step l resets and re-applies
   authenticated for the cross-user tests.

   Test cases (in order):
   a. Column default: INSERT a profile row without specifying `avatar_version`
      → `is((SELECT avatar_version FROM public.profiles WHERE id = alice_id), 0, ...)`
   b. `bump_avatar_version()` first call: set claims to Alice, call the RPC,
      assert return value `= 1`; assert Alice's row has `avatar_version = 1`.
   c. `bump_avatar_version()` idempotency: call it a second time, assert return
      value `= 2`; assert row has `avatar_version = 2`.
   d. `clear_avatar()`: call it, assert Alice's row has `avatar_version = 0`.
   e. `modified_at` advances on bump: capture `modified_at`, `pg_sleep(0.001)`,
      call `bump_avatar_version()`, assert new `modified_at > captured`.
   f. `modified_at` advances on clear: capture `modified_at`, `pg_sleep(0.001)`,
      call `clear_avatar()` (Alice's version is 1 from the bump in step e;
      no additional bump needed), assert new `modified_at > captured`.
   g. `set_display_name()` updates and trims: call with `'  Alice New  '`,
      assert `display_name = 'Alice New'`.
   h. `set_display_name()` rejects empty: `throws_ok` with `'23514'` for `''`.
   i. `set_display_name()` rejects whitespace-only: `throws_ok` with `'23514'`
      for `'   '`.
   j. `set_display_name()` rejects > 100 chars: `throws_ok` with `'23514'`.
   k. CHECK constraint: `throws_ok` when attempting `UPDATE profiles SET
      avatar_version = -1 WHERE id = alice_id` (as superuser or bypassing RLS
      — use `SET LOCAL ROLE postgres` for this assertion).
   l. Cross-user bump: `RESET ROLE; SET LOCAL ROLE authenticated;` then set
      claims to Alice, call `bump_avatar_version()`, assert Bob's
      `avatar_version` is still `0`.
   m. Cross-user clear: set claims to Alice (after bumping), call
      `clear_avatar()`, assert Bob's `avatar_version` unchanged.
   n. Cross-user set_display_name: set claims to Alice, call
      `set_display_name('Hacker')`, assert Bob's `display_name` is unchanged.
   o. `set_display_name()` uid-null guard: `SELECT set_config('request.jwt.claims', '', TRUE)`,
      call `set_display_name('x')` as authenticated, expect `throws_ok` with
      `'28000'` and message `'not authenticated'`.

2. RED — In `db/tests/schema_shape.sql`, add after the existing
   `profiles` column assertions:
   ```sql
   SELECT has_column('public', 'profiles', 'avatar_version',
     'profiles has avatar_version column');
   ```
   Also add three `has_function` assertions alongside the existing four-function
   block (near line 190) — parallel to how uid/is_list_member/etc. are asserted:
   ```sql
   SELECT has_function(
     'public', 'bump_avatar_version', ARRAY[]::text[],
     'public.bump_avatar_version() exists with no args'
   );
   SELECT has_function(
     'public', 'clear_avatar', ARRAY[]::text[],
     'public.clear_avatar() exists with no args'
   );
   SELECT has_function(
     'public', 'set_display_name', ARRAY['text'],
     'public.set_display_name(text) exists'
   );
   ```
   Update `SELECT plan(52)` to `SELECT plan(56)` (1 column + 3 functions added).

3. RED — In `db/tests/grants.sql`, add to Section A (positive authenticated
   grants):
   ```sql
   SELECT ok(
     has_function_privilege('authenticated',
       'public.bump_avatar_version()', 'EXECUTE'),
     'authenticated has EXECUTE on public.bump_avatar_version()');
   SELECT ok(
     has_function_privilege('authenticated',
       'public.clear_avatar()', 'EXECUTE'),
     'authenticated has EXECUTE on public.clear_avatar()');
   SELECT ok(
     has_function_privilege('authenticated',
       'public.set_display_name(text)', 'EXECUTE'),
     'authenticated has EXECUTE on public.set_display_name(text)');
   ```
   Add to Section D (negative anon denials):
   ```sql
   SELECT ok(
     NOT has_function_privilege('anon',
       'public.bump_avatar_version()', 'EXECUTE'),
     'anon has no EXECUTE on public.bump_avatar_version()');
   SELECT ok(
     NOT has_function_privilege('anon',
       'public.clear_avatar()', 'EXECUTE'),
     'anon has no EXECUTE on public.clear_avatar()');
   SELECT ok(
     NOT has_function_privilege('anon',
       'public.set_display_name(text)', 'EXECUTE'),
     'anon has no EXECUTE on public.set_display_name(text)');
   ```
   Update `SELECT plan(54)` to `SELECT plan(60)` (6 assertions added). Also
   update the header comment: section B becomes `(3+7)` (four existing + three
   new authenticated EXECUTE), section D becomes `(31)` (28 existing + three
   new anon denials), total becomes `60`.

4. RED — In `db/tests/triggers_modified_at.sql`, insert a new assertion
   immediately after assertion 6 (the `votes.value` test, ending at the
   `cmp_ok` call), *before* the `-- 7–9: cascade-skip` comment block.
   The cascade block deletes Alice from `auth.users`, which cascades to
   `profiles`; any assertion placed after it will find no profile row and
   `bump_avatar_version()` will no-op, causing the `cmp_ok` to fail. The
   fixture is already loaded at the top of the file — no need to re-load.
   Set JWT claims to Alice before calling the RPC (the file has no prior
   claim setup; without claims `uid()` returns NULL and the function no-ops):

   ```sql
   SELECT set_config(
     'request.jwt.claims',
     '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
     TRUE
   );
   CREATE TEMPORARY TABLE _b_profiles_av AS
   SELECT modified_at FROM public.profiles
   WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

   SELECT pg_sleep(0.001);
   SELECT public.bump_avatar_version();

   SELECT cmp_ok(
     (SELECT modified_at FROM public.profiles
      WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
     '>',
     (SELECT b.modified_at FROM _b_profiles_av AS b),
     'profiles: UPDATE avatar_version via bump_avatar_version() bumps modified_at'
   );
   ```
   Update `SELECT plan(10)` to `SELECT plan(11)` (1 assertion added).
   Also update the file's opening comment block: change "10 assertions"
   to "11 assertions" and the range descriptions from "1–6: bump ...,
   7–9: cascade-skip ..., 10: non-OF" to "1–7: bump ...,
   8–10: cascade-skip ..., 11: non-OF" to match the new assertion
   numbering after insertion.

5. RED — Run `./scripts/test-db.sh`. Confirm the new assertions in
   `avatars.sql`, `schema_shape.sql`, `grants.sql`, and
   `triggers_modified_at.sql` all report failures (the column and functions
   don't exist yet). Do not proceed until you see the red signal.

6. GREEN — Create `db/migrations/0007_avatars.sql` with:

   ```sql
   -- R1: avatar_version column
   ALTER TABLE public.profiles
     ADD COLUMN avatar_version int NOT NULL DEFAULT 0
       CHECK (avatar_version >= 0);

   -- R2: bump_avatar_version
   CREATE OR REPLACE FUNCTION public.bump_avatar_version()
   RETURNS int
   LANGUAGE sql SECURITY DEFINER
   SET search_path = public
   AS $$
     UPDATE public.profiles
        SET avatar_version = avatar_version + 1
      WHERE id = public.uid()
     RETURNING avatar_version;
   $$;
   REVOKE ALL ON FUNCTION public.bump_avatar_version() FROM public;
   GRANT  EXECUTE ON FUNCTION public.bump_avatar_version() TO authenticated;

   -- R3: clear_avatar
   CREATE OR REPLACE FUNCTION public.clear_avatar()
   RETURNS void
   LANGUAGE sql SECURITY DEFINER
   SET search_path = public
   AS $$
     UPDATE public.profiles
        SET avatar_version = 0
      WHERE id = public.uid();
   $$;
   REVOKE ALL ON FUNCTION public.clear_avatar() FROM public;
   GRANT  EXECUTE ON FUNCTION public.clear_avatar() TO authenticated;

   -- R4: set_display_name
   CREATE OR REPLACE FUNCTION public.set_display_name(new_name text)
   RETURNS void
   LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public
   AS $$
   DECLARE
     trimmed text := trim(new_name);
   BEGIN
     IF public.uid() IS NULL THEN
       RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
     END IF;
     IF trimmed = '' OR length(trimmed) > 100 THEN
       RAISE EXCEPTION 'display name must be 1–100 characters'
         USING ERRCODE = 'check_violation';
     END IF;
     UPDATE public.profiles
        SET display_name = trimmed
      WHERE id = public.uid();
   END;
   $$;
   REVOKE ALL ON FUNCTION public.set_display_name(text) FROM public;
   GRANT  EXECUTE ON FUNCTION public.set_display_name(text) TO authenticated;

   -- R5: trigger rebind (add avatar_version to OF clause)
   DROP TRIGGER t20_set_modified_at ON public.profiles;
   CREATE TRIGGER t20_set_modified_at
   BEFORE UPDATE OF display_name, avatar_version ON public.profiles
   FOR EACH ROW EXECUTE FUNCTION public.tg_set_modified_at();
   ```

7. GREEN — Run `./scripts/test-db.sh`. All new assertions must pass.

8. Run `./scripts/check.sh` — full gauntlet (SQLFluff, pgTAP, ShellCheck, etc.).
   Fix any SQLFluff violations before marking the task done.

**Verify:** `./scripts/test-db.sh` green · `./scripts/check.sh` green
