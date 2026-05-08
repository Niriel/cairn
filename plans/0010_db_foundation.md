# Plan 0010 — DB foundation (step 1 of `plans/0000_implementation_order.md`)

## Context

The walking-skeleton DB only has a smoke `public.profiles` table
(`db/migrations/0001_init.sql:49`). Step 1 of the master plan replaces
it with the real Tier 1+2 schema from `docs/data-model.md`: `profiles`,
`lists`, `list_members`, `items`, `votes`; the `is_list_member()`
helper; the `items_ranked` / `items_deleted` / `lists_deleted` views;
all triggers; all RLS policies; and the **tombstone user** + `on
delete set default` FK semantics from `docs/account-deletion.md` (the
master plan calls these out explicitly so we don't ALTER FKs in
step 8). Tier 3 (circles, blocks, invitations) is deferred to step 6.

Why now: every later step depends on this. Auth/HTTP (step 3) needs
real `profiles`; the MVP product surface (step 4) needs lists/items/
votes; soft-delete UX (step 5) needs the trash views; account deletion
(step 8) needs the FK semantics already baked in.

The user wants **TDD with red phases first**. Concretely: write all the
failing pgTAP test files (red), then write the migration to make them
pass (green). Per-table red→green cycles fight Postgres's transactional
DDL and the FK graph (`is_list_member()` references `list_members`,
which is referenced by every policy on every other table). The right
granularity unit for TDD here is the **pgTAP file**, not the migration
file.

## Approach

One migration `db/migrations/0004_domain_schema.sql` — top-to-bottom,
no churn, no half-applied intermediate state. TDD shows up as ~20 small
pgTAP files written *before* the migration.

The hard prerequisite: `auth.users` is owned by GoTrue in production
(`docs/data-model.md:17`) and does not exist in `cairn_test` because
`scripts/test-db.sh` doesn't run GoTrue. Solution: a tiny test
bootstrap (`db/tests/bootstrap.sql`) that creates a *minimal* stub of
`auth.users` (just the columns our FKs and triggers touch), applied by
`test-db.sh` between `CREATE DATABASE` and the migration loop. The
migration itself stays honest about who owns `auth.users`.

A `uid()` helper is *not* shipped by GoTrue itself — Supabase's
hosted helpers ship one in `public.uid()`, but we run vanilla GoTrue
*and* deliberately put our helper in a Cairn-owned schema rather
than GoTrue's `auth` schema, so a future GoTrue release can't
clobber us. Migration `0004` creates `public.uid()` (sibling to
`public.is_list_member()`): a `language sql stable` function that
reads the `sub` claim out of `request.jwt.claims`. PostgREST v10+
sets that GUC per-request as a JSON object containing every claim
(the per-claim `request.jwt.claim.<name>` GUCs were removed in v10;
we run v12.2.3 per `docker-compose.yml:21`). Function body, exactly
as written:

```sql
CREATE FUNCTION public.uid() RETURNS uuid
  LANGUAGE sql STABLE
  SET search_path = public
AS $$
  SELECT (
    (NULLIF(current_setting('request.jwt.claims', true), ''))::jsonb
    ->> 'sub'
  )::uuid;
$$;
```

The parenthesisation is load-bearing: `::` binds tighter than `->>`,
so without the inner parens the cast attaches to `'sub'` instead of
the function result, and Postgres errors at create time. Every
policy, RPC, and trigger function in this migration calls
`public.uid()`; tests `SET LOCAL request.jwt.claims =
'{"sub":"<uuid>"}'` to simulate.

## Files

### New files

- **`db/migrations/0004_domain_schema.sql`** — single migration,
  ordered. **The entire file is wrapped in `BEGIN; … COMMIT;`** —
  same pattern as `0001_init.sql`, `0002_auth_schema.sql`, and
  `0003_postgres_role.sql` (see "Existing patterns to reuse"). The
  ordered steps below are *all statements within that single
  transaction*. Wrapping is non-negotiable here: without it, a
  failure mid-migration (e.g., a typo in step 13's RLS policies
  after step 6's `list_members` table has already been created)
  leaves the DB half-applied and the `_migrations` ledger
  unwritten, so the next run would re-run partial DDL and either
  fail noisily or — worse — succeed against the half-state and
  produce a wedged schema. The BEGIN/COMMIT pair, plus the smoke-
  profiles guard in step 1, plus the `_migrations` ledger together
  give us "all-or-nothing applied, exactly once". Concretely, the
  file shape is:

  ```sql
  BEGIN;
  -- step 1 … step 15 below
  COMMIT;
  ```

  Steps:
  1. Drop the smoke `profiles` table — but only if it's still in
     smoke shape. Wrap in a `DO $$ … END$$` block that checks for
     the smoke columns *and the absence of the new ones* before
     issuing `DROP TABLE … CASCADE`: if `public.profiles` exists
     and has `display_name` but does *not* have `theme`, drop it;
     otherwise no-op. Without that guard, a re-run of `0004` (e.g.
     manual `psql -f`, ledger reset) would nuke the production
     `profiles` table the first statement in. Comment in the
     migration file explaining the trap.
  2. `CREATE FUNCTION public.uid() RETURNS uuid LANGUAGE sql STABLE
     SET search_path = public AS $$ SELECT
     ((NULLIF(current_setting('request.jwt.claims', true), ''))::jsonb
     ->> 'sub')::uuid; $$;` — body verbatim per the Approach
     section. Lives in `public` (Cairn-owned), not `auth`
     (GoTrue-owned), so a GoTrue upgrade can't clobber it. The
     per-claim GUCs were removed in PostgREST v10; we read the
     modern `request.jwt.claims` JSON GUC instead.
  3. Tombstone insert into `auth.users` (id =
     `'00000000-0000-0000-0000-000000000000'`, email = NULL). Idempotent
     via `ON CONFLICT (id) DO NOTHING` so reapplication is safe.
  4. `CREATE TABLE public.profiles` (matching the `profiles` table
     block in `docs/data-model.md`). `id` FK to `auth.users(id) ON
     DELETE CASCADE`. Insert tombstone profile row immediately after,
     literal: `INSERT INTO public.profiles (id, display_name) VALUES
     ('00000000-0000-0000-0000-000000000000', 'Deleted user') ON
     CONFLICT (id) DO NOTHING;`. `'Deleted user'` is the canonical
     literal per `docs/account-deletion.md`'s tombstone snippet — the
     `tg_profile_on_signup` trigger uses an empty-local-part for real
     accounts but skips the tombstone, so this is the only place the
     `'Deleted user'` string appears at insert time.
  5. `CREATE TABLE public.lists` (matching the `lists` table block
     in `docs/data-model.md`) with attribution columns having
     `DEFAULT '00000000-…'` and `REFERENCES auth.users(id) ON
     DELETE SET DEFAULT`. Plus the partial index
     `lists_not_deleted_idx`.
  6. `CREATE TABLE public.list_members` (matching the
     `list_members` table block). `list_id`/`user_id` cascade;
     `added_by`/`deleted_by` `set default`.
  7. `CREATE TABLE public.items` (matching the `items` table
     block). Same attribution pattern as `lists`. Plus
     `items_list_active_idx`.
  8. `CREATE TABLE public.votes` (matching the `votes` table
     block). Both FKs cascade; check `value BETWEEN -3 AND 3 AND
     value <> 0`. No soft-delete.
  9. `CREATE FUNCTION public.is_list_member(target_list uuid)`
     exactly per the `is_list_member` function definition in
     `docs/data-model.md` (`stable security definer set
     search_path = public`).
  10. Trigger functions and bindings (in `public`). The migration
      runs exactly once via the `_migrations` ledger — re-applying
      after a manual psql edit is unsupported (rebuild the DB via
      `docker compose down -v && up -d && migrate && seed`,
      per `docs/development.md`). The smoke-profiles guard in
      step 1 stays as defence-in-depth against an accidental
      ledger reset (irreversible-DROP protection), not because
      the rest of the migration is re-runnable. Trigger
      *bindings* use a numeric prefix (`t10_*`, `t20_*`, `t30_*`)
      so future additions don't silently shift firing order:
      `BEFORE INSERT/UPDATE` triggers fire alphabetically by name
      on each row. Function names stay un-prefixed (`tg_*`).
      Only one trigger is `SECURITY DEFINER` —
      `tg_profile_on_signup` — and only because the
      `auth.users` INSERT happens under the `gotrue` role, not
      `authenticated`, so the cross-table write into `profiles`
      genuinely needs to escalate. List-creation goes through the
      `create_list()` RPC instead (see step 11), which keeps every
      cross-table privileged write in this schema as an explicit
      RPC rather than a hidden trigger. The two `BEFORE` triggers
      that only mutate `NEW` are `SECURITY INVOKER` (the default).
      - `tg_profile_on_signup()` (`LANGUAGE plpgsql SECURITY
        DEFINER SET search_path = public`) — `AFTER INSERT
        ON auth.users`, inserts a `profiles` row with `display_name
        = split_part(coalesce(new.email, ''), '@', 1)`, but skipped
        when `new.id = tombstone` so the manual tombstone-profile
        insert in step 4 isn't double-handled. Uses `ON CONFLICT
        (id) DO NOTHING` for safety. `plpgsql`, not `sql`, because
        the body branches on `new.id`. `search_path = public` (not
        `public, auth`): the body only references `public.profiles`
        and trigger-NEW; NEW is a built-in trigger record not
        subject to search_path resolution, so no `auth` entry is
        needed. Tighter search_path matches the SECURITY-DEFINER
        hardening pattern called out in Risk #5.
      - `tg_set_modified_at()` (`LANGUAGE plpgsql`, invoker) —
        `BEFORE UPDATE`, sets `new.modified_at = now()`. Bound to
        `lists` and `items`. `plpgsql` because trigger functions
        that mutate `NEW` can't be `sql`.
      - `tg_set_attribution_lists()`,
        `tg_set_attribution_items()`,
        `tg_set_attribution_list_members()` (all invoker, all
        `LANGUAGE plpgsql`) — three per-table functions rather
        than one branching on `TG_TABLE_NAME`. Each is `BEFORE
        INSERT OR UPDATE` on its own table. Behaviour:
        - **lists, items**: on INSERT set
          `created_by = modified_by = public.uid()` AND
          `deleted_by = NULL` (overriding any client value);
          on UPDATE set `modified_by = public.uid()`, and:
          - if `OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT
            NULL` (soft-delete transition), set `deleted_by =
            public.uid()`;
          - if `OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS
            NULL` (restore transition), set `deleted_by = NULL`.
            Without this branch, restored rows leave `deleted_by`
            pointing at whoever previously soft-deleted them,
            forcing every client to remember to send `deleted_by:
            null` alongside `deleted_at: null` (and silently
            corrupting attribution if they don't).
          The INSERT-time `deleted_by := NULL` is load-bearing:
          the column DEFAULT is the tombstone UUID (so `ON
          DELETE SET DEFAULT` on the FK has somewhere to land
          when an account is deleted), and Postgres applies that
          DEFAULT on `INSERT`-without-value too. Without the
          trigger override, every freshly inserted *live* row
          would silently read as "deleted by the tombstone
          user" — see Risk #11.
        - **list_members**: on INSERT set
          `added_by = public.uid()` AND `deleted_by = NULL`
          (same DEFAULT-trap reason as above); on UPDATE there
          is no `modified_by` (the table doesn't have one), but
          both `deleted_by` rules above apply.
        Three small functions are easier to read and test than one
        with column-shape branching, and a future
        attribution-bearing table just gets its own function in
        the same shape.
  11. `CREATE FUNCTION public.create_list(p_name text,
      p_description text default null) returns public.lists`
      `language plpgsql security definer set search_path =
      public`. Body: insert into `lists` (created_by/modified_by
      get filled by `tg_set_attribution`), insert the matching
      `list_members(list_id, user_id)` row for the creator,
      return the new `lists` row. This replaces the
      `tg_lists_creator_is_member` AFTER-trigger pattern: the
      privileged cross-table write is now an explicit RPC, not a
      hidden trigger that escalates to superuser. The web app
      calls `POST /rpc/create_list` instead of `POST /lists`.
      Direct `POST /lists` is closed off by construction: there
      is no `lists_insert` RLS policy (step 13 omits it) and
      `INSERT` is not granted to `authenticated` on `public.lists`
      (step 15 omits it) — the RPC is the only create path.
      Without this closure, a direct `POST /lists` would succeed
      under the policy but skip the matching `list_members` row,
      leaving an orphan list invisible to its creator forever.
      Reads use the existing `GET /lists` path against the live
      policy; the RPC is only for the create path.
  12. `ENABLE ROW LEVEL SECURITY` on all five `public` tables.
  13. All RLS policies, exactly per the "Row-level security
      policies" section of `docs/data-model.md`. Two notes: (a) see
      Risk #1 below — `list_members_update` likely needs
      `WITH CHECK (is_list_member(list_id) OR user_id =
      public.uid())` to allow members to soft-remove themselves;
      we'll write the test first and let it dictate the final
      form. (b) The doc has no `lists_insert` policy — direct
      `POST /lists` is denied by RLS (no permissive INSERT policy)
      and by the absence of an INSERT grant; list creation goes
      through `create_list()` (step 11) only.
  14. Three views, with deliberately asymmetric
      `security_invoker` settings so soft-deleted rows are
      **never** readable through base-table queries:
      - `items_ranked` (matching the `items_ranked` view
        definition in `docs/data-model.md`):
        `WITH (security_invoker = true)`. Inherits the caller's
        RLS, so the `items_select` policy's `deleted_at IS NULL`
        clause hides soft-deleted items automatically. The view
        body's `where i.deleted_at is null` is defensive
        redundancy.
      - `items_deleted` and `lists_deleted` (both matching their
        view definitions in `docs/data-model.md`): both
        `WITH (security_invoker = false)`. They run as the view
        owner (`cairn`, table-owner exempt from RLS) so they can
        read soft-deleted rows the policies hide. To compensate
        for the bypassed RLS, each view body adds `and
        public.is_list_member(<list-id>)` to its WHERE — this
        becomes the *only* authorization gate for the trash, and
        is therefore covered by a load-bearing negative pgTAP
        test on each view (non-member sees zero rows).
      The asymmetry is the whole point: the base tables and live
      view never expose soft-deleted content; the trash views
      explicitly elevate to read it, with their own membership
      check as the gate.
  15. Grants. Two parts.
      (a) Table grants: `GRANT SELECT, UPDATE ON public.profiles
      TO authenticated; GRANT SELECT, INSERT, UPDATE ON
      public.{list_members, items} TO authenticated; GRANT SELECT,
      UPDATE ON public.lists TO authenticated; GRANT SELECT,
      INSERT, UPDATE, DELETE ON public.votes TO authenticated;
      GRANT SELECT ON public.{items_ranked, items_deleted,
      lists_deleted} TO authenticated;`. Two deliberate omissions:
      `public.profiles` does **not** get `INSERT` — profile rows
      are created exclusively by the `tg_profile_on_signup`
      `SECURITY DEFINER` trigger when GoTrue inserts into
      `auth.users`, and there is no `profiles_insert` policy, so
      a grant would be dead weight at best and misleading
      surface at worst. `public.lists` does **not** get `INSERT`
      either — list creation is RPC-only (step 11).
      **Critical**: RLS without `GRANT` leaves PostgREST silently
      empty.
      (b) Function grants — for every function in this migration
      (`public.uid()`, `public.is_list_member(uuid)`,
      `public.create_list(text, text)`), first
      `REVOKE EXECUTE … FROM PUBLIC` and *then*
      `GRANT EXECUTE … TO authenticated`. Postgres grants
      `EXECUTE` to `PUBLIC` on every new function by default; the
      revoke-first-then-grant pattern means that if a future
      `security definer` function added to this schema has a
      sensitive body, it doesn't inherit an unsafe default. Same
      shape Supabase uses on every `security definer` helper.

- **`db/tests/bootstrap.sql`** — applied by `test-db.sh` *before*
  any migration runs, against a fresh `cairn_test`. **Fully
  self-contained**: at the point it runs neither the
  `authenticated` role nor the `auth` schema exists yet (those are
  created by `0001_init.sql` and `0002_auth_schema.sql`
  respectively), so bootstrap creates them itself, idempotently,
  before stubbing `auth.users`. Concretely:
  1. `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE
     rolname = 'authenticated') THEN CREATE ROLE authenticated
     NOLOGIN; END IF; END$$;` — duplicates `0001_init.sql`'s role
     creation under the same `IF NOT EXISTS` guard so that a
     subsequent `0001` re-run is a no-op. **Repeat the same
     `DO $$ … END$$` block for `anon`** so tests can also
     `SET LOCAL ROLE anon` to exercise unauthenticated negative
     paths at runtime (e.g., `rls_profiles.sql`'s `throws_ok`
     anon assertion). Both roles need to *exist* before any test
     can switch into them; the `cairn` superuser can `SET LOCAL
     ROLE` to either without explicit role-membership grants
     (superusers bypass the membership check), so no `GRANT … TO
     cairn` is needed — see Risk #2 for the misconception this
     resolves.
  2. `CREATE SCHEMA IF NOT EXISTS auth;` — same shape as
     `0002_auth_schema.sql`, minus the `AUTHORIZATION gotrue`
     clause (the `gotrue` role doesn't exist in tests and would
     itself be created by `0001`; ownership doesn't matter in the
     test path because GoTrue never runs there).
  3. `CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, role
     text DEFAULT 'authenticated', created_at timestamptz DEFAULT
     now());` — the minimal stub.
  Top-of-file comment links to the "auth.users is owned by GoTrue"
  paragraph in `docs/data-model.md` and notes that GoTrue's real
  schema has many more columns we deliberately don't stub. The
  comment also includes a **rule + checklist** spelling out exactly
  which columns of `auth.users` the migration touches (FKs to `id`;
  trigger reads of `email`); the rule is "if a future migration
  references a new `auth.users` column in any FK or trigger, it must
  be added to this stub at the same time, or the test suite silently
  masks a divergence from the real GoTrue schema." End-to-end
  verification against the real schema lands in step 3 when GoTrue
  is wired and Mailpit-driven signup runs through the full path
  (`plans/0000_implementation_order.md` step 3); bootstrap.sql is the
  unit-level stub, not the integration check.

- **`db/tests/fixtures/users_alice_bob_carol.sql`** — three
  `auth.users` rows with stable UUIDs (`aaaa…`, `bbbb…`, `cccc…`) and
  emails `alice@test`, `bob@test`, `carol@test`. The
  `tg_profile_on_signup` trigger creates the `profiles` rows
  automatically (once migration 0004 is in place; in Phase A it just
  populates `auth.users`). No attributed inserts here, so no
  `request.jwt.claims` setup needed. Loaded with `\i
  /db/tests/fixtures/users_alice_bob_carol.sql` (absolute path — see
  the fixture-path convention below).

- **`db/tests/fixtures/list_shared_alice_bob.sql`** — extends the users
  fixture with one list created by Alice with Bob as a second member;
  Carol is non-member. Used by most RLS tests. Because `lists` and
  `list_members` are attribution-bearing tables (see the fixture
  convention below), this fixture opens with `SET LOCAL
  request.jwt.claims = '{"sub":"aaaa..."}';` so the BEFORE-INSERT
  trigger has a `public.uid()` to read; creates the list via
  `public.create_list('Shared list')` (which inserts the matching
  `list_members` row for Alice in the same RPC); then `INSERT INTO
  public.list_members (list_id, user_id) VALUES (..., '<bob-uuid>')`
  — the `tg_set_attribution_list_members` trigger fills `added_by`
  with Alice's uid from the GUC.

- **`db/tests/fixtures/list_solo_alice.sql`** — list with Alice as the
  only member. Used for "delete list when user is the only member" and
  for tests that need a private list. Same `SET LOCAL
  request.jwt.claims` opener as `list_shared_alice_bob.sql`; creates
  the list via `public.create_list(...)` and stops there.

**Fixture-path convention.** Every `\i fixtures/...` include in this
plan and in `docs/testing.md`'s worked example uses an *absolute*
path: `\i /db/tests/fixtures/<name>.sql`. `pg_prove` is invoked as
`docker compose exec -T postgres pg_prove --ext .sql ... /db/tests`,
which inherits the container's WORKDIR (`/`), so a relative `\i
fixtures/...` resolves to `/fixtures/...` and fails. Absolute paths
match the read-only volume mount in `docker-compose.yml` (`./db:/db`)
and are robust to invocation cwd.

**Fixture attribution-context convention.** Any fixture that INSERTs
into an attribution-bearing table (`lists`, `items`, `list_members`)
must set `request.jwt.claims` *before* the INSERT, because the
`tg_set_attribution_*` BEFORE-INSERT triggers read `public.uid()` and
write `created_by` / `added_by`; with no claims, `public.uid()`
returns NULL, the trigger sets the column to NULL, and the INSERT
fails the `NOT NULL` constraint. The pattern, used at the top of
every attributed fixture and at the top of any test step that
INSERTs directly:

```sql
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
```

`SET LOCAL` scopes the GUC to the current transaction, so the
surrounding `BEGIN ... ROLLBACK` in every test file resets it
automatically. Subsequent `SET LOCAL request.jwt.claims = ...` calls
in the same transaction overwrite it (e.g., when a test switches from
"act as Alice" to "act as Bob" mid-file). Tests that go through
`public.create_list()` for the lists row don't escape the rule —
`create_list` reads `public.uid()` for `created_by` and the matching
`list_members.user_id`, so the GUC must be set before the call.

- **pgTAP test files** (~20, listed below). Every RLS file has at
  least one positive and one negative case per `CLAUDE.md` "every
  policy, positive AND negative". Every file wraps in `BEGIN ... ROLLBACK`
  per `docs/testing.md:103`.

  | File | plan(N) | What it proves |
  |---|---|---|
  | `infra_auth_stub.sql` | 4 | bootstrap created `auth.users`; `has_function('public','uid')` and — when present — `public.uid()` returns the JWT-claim UUID; tombstone row exists; fixture include works — `\i /db/tests/fixtures/users_alice_bob_carol.sql` then assert Alice's row exists in `auth.users`. The include uses an absolute path per the fixture-path convention (see "Files → New files"); no empirical probe needed — pg_prove's WORKDIR inside the postgres container is `/`, not `/db/tests`, so relative `\i fixtures/...` would fail, but absolute paths are robust regardless of invocation cwd. The `has_function` check is the gate for the `public.uid()` assertion: pgTAP's `skip_unless(has_function('public','uid'), 1, 'public.uid() not yet created')` runs the assertion only when migration `0004` has shipped; in Phase A the function is absent, the assertion is skipped (not failed), and the file completes cleanly. The other three assertions (`auth.users` table presence, tombstone row, fixture include) run unconditionally — together they prove the test infra is wired before the bulk-red phase invests in 20 more files. |
  | `schema_shape.sql` | 40 | 5 × `has_table` + 35 × `has_column` covering every column of profiles (6), lists (9), list_members (6), items (10), votes (4) — cheap regression net. The exact plan(40) catches accidental column drops or adds; updating the schema means updating both the doc and this number together. |
  | `fk_set_default.sql` | 8 | For each of the 8 attribution FKs (lists.{created_by,modified_by,deleted_by}, items.{created_by,modified_by,deleted_by}, list_members.{added_by,deleted_by}): delete the user from `auth.users` directly under the test session (the `cairn` superuser owns the bootstrap-stub `auth.users`, so direct DELETE works without `delete_account()`), assert the column equals the tombstone UUID. `delete_account()` itself is out of scope for step 1 — it lands in step 8. Loadbearing for account-deletion. |
  | `fk_cascade.sql` | 6 | Six CASCADE legs declared in `docs/data-model.md`'s table blocks, one assertion each so a regression in any single one surfaces independently: (a) `profiles.id` cascades on `auth.users` delete; (b) `list_members.user_id` cascades on `auth.users` delete; (c) `votes.user_id` cascades on `auth.users` delete; (d) `items.list_id` cascades on `lists` delete; (e) `list_members.list_id` cascades on `lists` delete; (f) `votes.item_id` cascades on `items` delete. (a)–(c) are tested by deleting the target row from `auth.users` directly under the test session (cairn owns the bootstrap-stub `auth.users`). (d)/(e) are tested by `DELETE FROM public.lists` (bypassing the no-DELETE-policy via cairn-superuser); (f) by `DELETE FROM public.items`. The two extra legs over the original four close the gap that an `items.list_id` cascade test alone leaves: a future ALTER that changed `list_members.list_id` from `ON DELETE CASCADE` to `RESTRICT` would silently leave dangling membership rows, which RLS would then need to handle as edge cases. |
  | `constraints_profiles.sql` | 3 | theme/font_size/invite_policy enum checks reject bad values. |
  | `constraints_lists.sql` | 3 | name length 1..200; description ≤2000; reject empty name. |
  | `constraints_items.sql` | 2 | name length 1..500; reject empty name. |
  | `constraints_votes.sql` | 4 | value in [-3,3]; value <> 0; PK uniqueness; "no vote" = no row. |
  | `triggers_profile_on_signup.sql` | 6 | INSERT into auth.users (as cairn) → profiles row with `display_name` = email local-part; the function is `SECURITY DEFINER` — assert `prosecdef = true` for `tg_profile_on_signup` in `pg_proc` directly, since reproducing the gotrue role's INSERT path in tests would require granting `gotrue` INSERT on the stub `auth.users` and switching session role just for one assertion; null email → empty string (the locked-in fallback); tombstone insert is idempotent; tombstone profile row exists with `display_name = 'Deleted user'` (load-bearing for the `account-deletion.md` contract — every consumer of `created_by` renders the tombstone profile by display name); **direct skip-branch assertion** — DELETE the tombstone profile row, INSERT into auth.users with `id = '00000000-…'`, assert the profiles table still has zero rows for that id afterwards. This proves the trigger took the `new.id = tombstone` skip branch and didn't insert a `display_name = ''` row that the `ON CONFLICT (id) DO NOTHING` then suppressed only because the tombstone row happened to already exist. Without this assertion, a regression that drops the skip branch would still pass every other assertion in this file. |
  | `rpc_create_list.sql` | 4 | Calling `create_list('My list')` under `SET LOCAL ROLE authenticated`: returns a `lists` row; the `lists` row has `created_by = public.uid()`; exactly one matching `list_members` row exists with `user_id = creator` and `added_by = creator`; under `SET LOCAL ROLE anon`, the call raises `permission denied for function create_list` (verified via `throws_ok`) — the function GRANT excludes anon, so the call is rejected before the body runs. |
  | `triggers_modified_at.sql` | 4 | UPDATE lists/items bumps modified_at; INSERT does not bump it past the default. |
  | `triggers_set_attribution.sql` | 17 | Three tables × six behaviours minus the one that doesn't apply: 3 × INSERT-override (client `created_by`/`added_by` replaced by `public.uid()` for lists, items, list_members); **3 × INSERT-time `deleted_by := NULL` override** — for each of lists, items, list_members, INSERT a row with `deleted_by = '11111111-…'` (any non-tombstone, non-null UUID) and assert the stored row has `deleted_by IS NULL`. This is the load-bearing test for Risk #11: the column DEFAULT is the tombstone UUID (so `ON DELETE SET DEFAULT` repoints attribution on account deletion), and without the trigger override every freshly inserted live row would silently read as "deleted by Deleted user." 2 × modified_by-on-UPDATE (lists, items only — list_members has no `modified_by` column per its table block in `docs/data-model.md`); 3 × deleted_by set on `deleted_at` null→non-null (all three tables); 3 × deleted_by NOT set when `deleted_at` unchanged (all three tables); 3 × deleted_by *cleared* on `deleted_at` non-null→null restore (all three tables). **Role context**: this file tests *trigger* behaviour, not *policy* — the lists-leg INSERTs run as the `cairn` superuser (which bypasses the no-INSERT-grant on `public.lists` from step 15.a; without this bypass the test would hit the GRANT denial and never reach the trigger), with `SET LOCAL request.jwt.claims` set to whichever user's uid the assertion expects to see in `created_by`. The items and list_members legs can run either as `cairn` or as `authenticated` (both have INSERT grants there) — pick `cairn` uniformly so all three legs share one role-setup block at the top of the file. The grant denial itself is covered separately by `grants.sql` and by `rls_lists.sql`'s "INSERT denied" assertion. |
  | `rls_profiles.sql` | 6 | SELECT positive (Alice sees Bob), SELECT positive (Bob sees Alice); **two load-bearing unauthenticated negatives, one per defence layer**: (a) `throws_ok` under `SET LOCAL ROLE anon` that `SELECT FROM profiles` raises SQLSTATE `42501` (`permission denied for table profiles`) — this is the GRANT-layer denial, the *first* line of defence, since anon has no SELECT grant in step 15.a; (b) `is(count, 0)` under `SET LOCAL ROLE authenticated` with `request.jwt.claims` deliberately *not set* — this exercises the `profiles_select` policy itself, which reduces to `public.uid() IS NOT NULL` (NULL for an authenticated session with no JWT claims) and returns zero rows. The two assertions together prove that an unauthenticated read is denied at *both* layers — RLS without GRANT silently returns empty, and GRANT without RLS would expose every profile, so testing each in isolation is the only way to catch a regression that drops one. UPDATE own succeeds; UPDATE other fails. |
  | `rls_lists.sql` | 6 | SELECT positive (member sees), SELECT negative (non-member doesn't), SELECT negative (soft-deleted list hidden even from members through the base table — the only read path is `lists_deleted`), INSERT denied (direct `POST /lists` by `authenticated` raises permission/RLS error — no INSERT policy, no INSERT grant; the create path is exercised in `rpc_create_list.sql`), UPDATE positive (member can rename), UPDATE negative (non-member can't). |
  | `rls_list_members.sql` | 6 | SELECT positive/negative; INSERT positive (member adds, added_by=public.uid()); INSERT negative (non-member can't); UPDATE positive (self soft-removes — see Risk #1); UPDATE negative (outsider can't). |
  | `rls_items.sql` | 6 | SELECT positive/negative; SELECT negative (soft-deleted item hidden even from members through the base table — the only read path is `items_deleted`); INSERT positive; INSERT negative (non-member); UPDATE positive (any member edits); UPDATE negative (outsider). |
  | `rls_votes.sql` | 8 | SELECT positive/negative; INSERT positive; INSERT negative (user_id ≠ public.uid()); INSERT negative (non-member); UPDATE own positive; UPDATE other negative; DELETE own positive; DELETE other negative. |
  | `views_items_ranked.sql` | 5 | score = sum; positive/negative/total voters counts; soft-deleted items excluded; no-votes item has score=0; view inherits RLS (non-member sees nothing). |
  | `views_items_deleted.sql` | 4 | only soft-deleted rows visible to a member; `deleted_at`/`deleted_by` exposed; live items absent; **non-member sees zero rows through the view** — the load-bearing test that the explicit `is_list_member()` filter is the only authorization gate (since the view runs `security_invoker = false` and bypasses RLS). |
  | `views_lists_deleted.sql` | 3 | only soft-deleted lists visible to a current member; live lists absent; **non-member sees zero rows through the view** — same load-bearing assertion as `views_items_deleted.sql`. |
  | `grants.sql` | 23 | `has_table_privilege('authenticated', …)` for the step 15.a matrix — 14 positives (2 verbs on profiles, 3 verbs each on list_members/items, 2 verbs on lists, 4 verbs on votes) plus **2 negatives** (`public.lists` INSERT, `public.profiles` INSERT) — both load-bearing: the `lists` negative closes the orphan-list footgun (a future grant slip would otherwise re-open it), and the `profiles` negative locks in that profile rows are trigger-only and never client-inserted; SELECT on the three views (3 positives); EXECUTE on `public.{uid, is_list_member, create_list}` for `authenticated` (3 positives); plus **1 negative for anon EXECUTE on `create_list`** (load-bearing for the `rpc_create_list.sql` `throws_ok` assertion). Closes Risk #6 — RLS without GRANT silently returns empty, and the smoke check no longer hits `/profiles` so it can't catch a missing grant. |

  Total ~168 assertions across 21 files (4+40+8+6+3+3+2+4+6+4+4+17+6+6+6+6+8+5+4+3+23). Fast — pgTAP at
  this scale runs in well under a second.

### Modified files

- **`scripts/test-db.sh`** — between line 26 (`CREATE DATABASE`) and
  the migration loop at line 30, add a step that runs
  `db/tests/bootstrap.sql` against `cairn_test`. Keep `set -euo
  pipefail` so a bootstrap failure aborts the run.

- **`scripts/migrate.sh`** — wrap the migration loop with a bounded
  `auth.users`-presence poll, fired *only* when about to apply a
  migration whose number is `0004` or later. Why gated, not
  unconditional in front of the loop: GoTrue cannot create
  `auth.users` until the `gotrue` role exists, and the `gotrue`
  role is itself created by `0001_init.sql` (with the `postgres`
  stub coming from `0003`). An unconditional poll in front of the
  loop would deadlock on a fresh `docker compose up -d` — the poll
  would wait for `auth.users`, which is waiting for GoTrue, which
  is waiting for the loop the poll itself is gating. Gating on
  filename keeps `0001`–`0003` running unconditionally (so GoTrue
  becomes able to start), and only then waits for GoTrue's first
  successful connection before `0004` (and any future migration
  that references `auth.users`) lands. The poll caps at 60
  iterations (~60 s) so a misconfigured GoTrue doesn't hang the
  script forever — it exits non-zero with a hint to check
  `docker compose logs gotrue`. Inside the existing
  `for f in db/migrations/*.sql; do` loop, immediately after the
  `applied=$(...)` skip-if-already-applied check and before
  `echo "applying $name"`:

  ```bash
  prefix="${name%%_*}"
  if [ "$((10#$prefix))" -ge 4 ]; then
    # Migrations from 0004 onward reference auth.users; wait for
    # GoTrue to have run its own startup migration. Skipped for
    # 0001-0003 (they create the gotrue role itself — without
    # those, GoTrue can't even connect).
    echo "==> waiting for gotrue to create auth.users"
    for i in $(seq 1 60); do
      if "${PSQL[@]}" -tAc \
          "SELECT to_regclass('auth.users') IS NOT NULL" \
          | grep -q '^t$'; then
        break
      fi
      if [ "$i" -eq 60 ]; then
        echo "auth.users still missing after 60s — is GoTrue running?" >&2
        echo "  check: docker compose logs gotrue" >&2
        exit 1
      fi
      sleep 1
    done
  fi
  ```

  Once `auth.users` exists the poll's first check returns true, so
  the per-migration cost after the first wait is one round-trip to
  Postgres — negligible. The `10#$prefix` arithmetic forces base-10
  parsing so a leading zero (`0010`) doesn't get mistaken for octal.
  The test path (`scripts/test-db.sh`) doesn't need this — it stubs
  `auth.users` via `bootstrap.sql` before migrations run.

- **`db/seed/dev_seed.sql`** — gut it. The current "insert two
  smoke profiles" rows can't survive once `profiles.id` is an FK to
  `auth.users(id)`, and we deliberately do *not* insert into
  `auth.users` directly: GoTrue's real schema has version-dependent
  NOT NULL columns (`instance_id`, metadata, etc.) that a bare
  two-column insert won't satisfy, and any row we hand-craft would
  be one GoTrue refuses to authenticate against. So this plan
  reduces `dev_seed.sql` to a top-of-file comment explaining that
  real seed users (Alice/Bob) land in step 3 of
  `plans/0000_implementation_order.md` once GoTrue and the dev
  magic-link shortcut are wired up; until then, the dev DB starts
  empty and developers create their own user via Mailpit. Cross-link
  to `docs/testing.md:65-68` so it's clear this file is not the
  authoritative test fixture.

- **`db/tests/smoke.sql`** — delete (superseded by `infra_auth_stub.sql`).

- **`scripts/smoke.sh`** — drop the `/profiles` block entirely.
  After this migration, anon has no `SELECT` grant on
  `public.profiles` (the new grant matrix is `authenticated`-only),
  so PostgREST returns 401 *before* RLS even runs — the previously
  proposed "accept empty array" relaxation can't help when the
  response isn't an array. Removing the block also keeps the smoke
  honest about anon's surface area: anon should see *nothing* under
  the new model, and the smoke shouldn't pretend otherwise. The
  remaining smoke checks (PostgREST OpenAPI root, GoTrue `/health`,
  Mailpit UI, optional SvelteKit dev server) still prove the
  service mesh is up. Step 3 reintroduces an authenticated probe
  via the magic-link flow.

  **Schema-reachability is deliberately deferred.** Removing the
  `/profiles` block leaves a gap: `curl http://localhost:3000/`
  proves PostgREST is *responding*, but its OpenAPI doc is
  rendered for the requesting role, and an anon request to the
  root produces a doc with no `paths` for our new tables (anon
  has no operations on them). The OpenAPI body therefore can't
  cheaply confirm PostgREST has introspected the post-0004
  schema. We accept this gap until step 3 wires up the magic-
  link flow and lands an authenticated smoke probe (`GET
  /lists` as Alice → 200 with her empty array). Until then, the
  schema-up check is the manual `psql -c "\dt public.*"` step
  in *Verification* below — explicit, one-off, and good enough
  given step 3 is next on the roadmap. Document this in the
  smoke script itself with a comment near the deleted block so
  the next reader doesn't re-add a broken probe.

- **`plans/0000_implementation_order.md`** — once this plan is
  executed and merged, tick the step 1 checkbox.

### Files to leave alone

- `db/migrations/0001_init.sql`, `0002_auth_schema.sql`,
  `0003_postgres_role.sql` — already-applied; new work goes in `0004`.
- `db/Dockerfile` — pgTAP image already wired.
- `scripts/check.sh` — already runs `test-db.sh`.

## Risks & gotchas

1. **`list_members_update` self-removal.** `is_list_member()` returns
   false for a member after they soft-remove themselves
   (`deleted_at` set), so a `WITH CHECK (is_list_member(list_id))`
   would reject the very update that removes them. The fix is
   `WITH CHECK (is_list_member(list_id) OR user_id = public.uid())`.
   `docs/data-model.md:362-366` doesn't address this; the test in
   `rls_list_members.sql` will surface it.

2. **`SET LOCAL ROLE` from a superuser session needs no explicit
   GRANT.** Earlier drafts of this plan added `GRANT authenticated,
   anon TO cairn` in `bootstrap.sql` on the assumption that the
   target role had to be granted to the session user before `SET
   LOCAL ROLE` would succeed. That rule applies only to *non-
   superuser* sessions. `cairn` is the Postgres superuser per
   `docker-compose.yml`'s `POSTGRES_USER: cairn`, and superusers
   bypass the role-membership check on `SET LOCAL ROLE` — the
   target role only has to *exist*. `bootstrap.sql` therefore
   creates the `authenticated` and `anon` roles (idempotent
   `DO $$ … END$$` blocks, mirroring `0001_init.sql`) but does
   not grant them to anyone. If a future test uses a non-
   superuser connection (e.g., `authenticator`-via-PostgREST in
   an integration probe), reintroduce the grant *to that role
   only*, with the rationale spelled out at the call site.

3. **Trigger order matters.** `set_attribution` is `BEFORE INSERT/
   UPDATE` (it modifies NEW); `profile_on_signup` is
   `AFTER INSERT ON auth.users`. Within the BEFORE/AFTER bucket,
   multiple triggers fire alphabetically by trigger *name*, so we
   use the numeric prefix (`t10_set_attribution` before
   `t20_set_modified_at`) to lock ordering. Today the two BEFORE
   triggers don't actually depend on ordering —
   `set_attribution`'s null→non-null check reads `OLD.deleted_at`,
   not `NEW`, so `set_modified_at` mutating `NEW` first wouldn't
   matter. The prefix is defensive against a future third BEFORE
   trigger that *would* care. (List-creation membership is no
   longer a trigger; it's the `create_list()` RPC, so there's no
   AFTER-INSERT-on-lists ordering concern.)

4. **Policy + trigger interaction on `items_insert`.** Trigger sets
   `created_by = public.uid()` *before* policy `WITH CHECK` evaluates
   `public.uid() = created_by`. So a client INSERT with `created_by =
   bob_uuid` while authenticated as Alice ends up with Alice's UUID
   stored — exactly per `docs/data-model.md:482`. Tested in
   `triggers_set_attribution.sql`. (The same interaction would have
   applied to `lists_insert`, but `lists` no longer has an INSERT
   policy — list creation goes through `create_list()` only.)

5. **`security definer` + `search_path`.** `is_list_member()` and
   `public.uid()` must `SET search_path` to defeat schema-shadowing
   attacks (`docs/data-model.md:316`).

6. **GRANTs are mandatory.** RLS without `GRANT` produces a silent
   empty result via PostgREST. Easy to forget; covered explicitly in
   step 14 of the migration ordering and verified end-to-end via the
   smoke check.

7. **`votes` has no soft-delete.** Hard delete only
   (`docs/data-model.md:177`). No `deleted_at` column, no `*_deleted`
   view. Don't accidentally add one for "consistency."

8. **Soft-deleted rows are unreachable except through the trash
   views.** `lists_select` and `items_select` keep their `and
   deleted_at IS NULL` filter, so a direct `GET /lists` or
   `GET /items` (and `items_ranked`, which inherits the caller's
   RLS via `security_invoker = true`) cannot return soft-deleted
   rows — to anyone, member or not. The only read path for
   soft-deleted rows is the trash views, which run
   `security_invoker = false` (so they bypass RLS as the owner)
   and gate access with an explicit `public.is_list_member(<list>)`
   in the view body. This is the principled "no leak of deleted
   content" choice: the base table API surface contains *only* live
   data; the trash is an explicit, separately-authorized read.
   Two consequences worth knowing: (a) the load-bearing test for
   the trash views' authorization is the negative
   `non-member sees zero rows` assertion in
   `views_items_deleted.sql` and `views_lists_deleted.sql` —
   without it, a future refactor that drops the
   `is_list_member()` filter would silently expose every list's
   trash to every authenticated user; (b) restore from trash
   still goes through `PATCH /items` / `PATCH /lists`, gated by
   the live `*_update` policy — and `*_update` checks
   `is_list_member()` against `list_members.deleted_at IS NULL`,
   which means a soft-removed member can no longer restore items
   in a list they've left, even if they had access to the trash
   when their membership was live. That's the desired behaviour.

9. **Tombstone insert idempotency.** `ON CONFLICT (id) DO NOTHING`
   on both the `auth.users` and `profiles` inserts — protects
   against re-running on a non-empty test DB and against the
   `profile_on_signup` trigger racing the manual profile insert.

10. **`null` email in `auth.users` for tombstone** breaks any
    naive `split_part(email, '@', 1)` in the on-signup trigger. Fix
    in the trigger: skip when `new.id = tombstone`, plus
    `coalesce(new.email, '')` defensively.

11. **`deleted_by` DEFAULT-trap on INSERT.** The eight attribution
    FKs all use `ON DELETE SET DEFAULT`, with the column DEFAULT
    set to the tombstone UUID — that's how account deletion
    repoints attribution to "Deleted user" for every column at
    once (per `account-deletion.md`'s "Repeat for: …" list).
    Postgres applies the column DEFAULT on `INSERT`-without-value
    *too*, which is correct for `created_by`/`modified_by`/`added_by`
    (NOT NULL columns where any value is fine and the trigger
    overwrites with `public.uid()` anyway), but is *wrong* for
    the three `deleted_by` columns: a freshly inserted live row
    must have `deleted_by IS NULL`, not the tombstone UUID,
    because the row hasn't been deleted yet. The fix is in the
    `tg_set_attribution_*` BEFORE-INSERT branch, which sets
    `NEW.deleted_by := NULL` unconditionally on INSERT — written
    that way, not as "if the client didn't send a value", because
    we deliberately ignore client-sent attribution everywhere. The
    test in `triggers_set_attribution.sql` has three load-bearing
    assertions (one per attribution-bearing table) that a
    just-inserted row reads `deleted_by IS NULL`. Without the
    override, the column DEFAULT would silently leak into every
    fresh live row and the soft-delete UI would render every brand
    new item as "deleted by Deleted user" the moment it appeared.

## Existing patterns to reuse

There's not much in this repo yet (it's pre-production), but:

- `BEGIN; … COMMIT;` migration wrapping (`db/migrations/0001_init.sql:7,
  68`).
- `DO $$ … END$$;` idempotent guards
  (`db/migrations/0001_init.sql:13-33`).
- `IF NOT EXISTS` on `CREATE TABLE` for re-runnability
  (`db/migrations/0001_init.sql:43, 49`).
- `.sqlfluff` style: postgres dialect, 2-space indent, UPPERCASE
  keywords, lowercase identifiers, max 100 chars
  (`/.sqlfluff:1-5`). Run `sqlfluff lint db/` before claiming green;
  lefthook also enforces on commit.

## Order of execution (TDD)

1. **Phase A — bootstrap + infra check.** Add `db/tests/bootstrap.sql`
   and patch `scripts/test-db.sh`. Add the
   `db/tests/fixtures/users_alice_bob_carol.sql` fixture (the
   simplest of the three new fixtures; the other two land in
   Phase B). Write `infra_auth_stub.sql` (4 assertions). All
   fixture includes are absolute paths (`\i
   /db/tests/fixtures/...`) per the fixture-path convention in
   "Files → New files". The `public.uid()` assertion is gated by
   `skip_unless(has_function('public','uid'), 1, ...)` so it
   short-circuits cleanly in Phase A (where `0004` hasn't shipped
   yet) instead of aborting the file with `function does not
   exist`. Run `./scripts/test-db.sh`. Expect: the `auth.users`
   assertion passes; the `has_function`-gated `public.uid()`
   assertion is *skipped* (not failed); the tombstone assertion
   fails; the fixture-include assertion passes. The skipped
   assertion is the marker that the gate works; the failures are
   the marker that the migration genuinely hasn't run yet.

2. **Phase B — bulk red.** Add the remaining two fixture files
   (`list_shared_alice_bob.sql` and `list_solo_alice.sql`; the
   `users_alice_bob_carol.sql` fixture landed in Phase A as the
   fixture-path probe). They will reference tables that don't
   exist yet — that's fine, fixtures load inside the test
   transaction and fail loudly per file. Write the remaining 20
   test files (Phase A wrote `infra_auth_stub.sql`; the 21-file
   table in **Files → New files** lists the full set). Run
   `./scripts/test-db.sh` — nearly every assertion fails. **This
   is the spec, in executable form.**

3. **Phase C — green.** Write
   `db/migrations/0004_domain_schema.sql` top-to-bottom. Run
   `./scripts/test-db.sh` and iterate. The cycle is fast (under a
   second per run); aim for green in one or two passes.

4. **Phase D — clean up.** Delete `db/tests/smoke.sql`. Update
   `db/seed/dev_seed.sql`. Run `./scripts/check.sh` (full
   gauntlet — sqlfluff, shellcheck, shfmt, vitest, pg_prove, prettier,
   svelte-check). Tick step 1 in `plans/0000_implementation_order.md`.

## Verification

Local:

- `./scripts/test-db.sh` — pgTAP suite. Expect ~168 assertions, all
  passing.
- `./scripts/check.sh` — full gauntlet (sqlfluff lint included).
- `docker compose up -d`, `./scripts/migrate.sh`, `./scripts/seed.sh`
  to rebuild the dev DB. `./scripts/smoke.sh` to confirm the
  service mesh is up (PostgREST OpenAPI root, GoTrue health,
  Mailpit) — anon has no SELECT grant on the new `profiles`, so
  the smoke no longer probes schema reachability via `/profiles`;
  the manual `\dt`/`\dv`/`\df` step below is the schema-up check.
- Manual psql: `psql -U cairn -d cairn -c "\dt public.*"` shows the
  five tables; `\dv public.*` shows the three views; `\df public.*`
  shows `is_list_member` and `uid` (both live in `public`, not
  `auth`).
- Manual API check: `curl -i http://localhost:3000/profiles` (anon)
  → `HTTP/1.1 401` (no SELECT grant for anon; PostgREST short-
  circuits before RLS), not an empty array. With a fake-jwt cookie
  for Alice → her profile visible. (The anon path matters because
  the magic-link flow in step 3 will hit `/rpc/...` as anon — the
  401 here is *not* a regression, it's the new contract.)

What this plan does *not* cover, by design:

- The `delete_account()` RPC and account-deletion UI — step 8.
- Tier 3 tables (`circle_members`, `blocks`, `invitations`,
  `invite_policy` is on `profiles` from the start because it costs
  nothing to include and avoids an ALTER) — step 6.
- Web-side profile/list/item code — steps 2–4.

Accepted trade-offs (considered, intentional, not bugs):

- **Exact `plan(N)` totals on every test file** rather than
  `no_plan()`. The cost is per-edit churn (changing the schema
  means updating the count alongside); the benefit is that an
  off-by-one in the suite surfaces as a count mismatch instead of
  a silent skip. This is the project's testing convention —
  re-evaluate only if it starts driving real toil.

## After this lands

`db/migrations/0004_domain_schema.sql` is **frozen** once merged.
Schema evolution from this point onward ships as additive,
forward-only migrations: `0005_…`, `0006_…`, etc. — never as
edits to `0004`. There is no down-migration; `scripts/migrate.sh`
is forward-only and gated by the `_migrations` ledger. The dev DB
is rebuildable end-to-end via `docker compose down -v && up -d &&
./scripts/migrate.sh && ./scripts/seed.sh`, which is the closest
thing we have to a "reset to a known state" — use that, not edits
to past migrations.
