# Plan: DB foundation (Tier 1+2 schema, RLS, triggers)

Replaces the walking-skeleton smoke `profiles` table with the real
Tier 1+2 schema, helpers, views, triggers, RLS, and the tombstone-
friendly FK semantics that step 8 (account deletion) will rely on.
This is step 1 of `plans/0000_implementation_order.md`.

## Context

The walking-skeleton DB only has a smoke `public.profiles` table
(`db/migrations/0001_init.sql:49`). Step 1 of the master plan
replaces it with the real Tier 1+2 schema from
`docs/data-model.md`. Tier 3 (`relationships`, `invitations`) is
deferred to step 6.

Why now: every later step depends on this. Auth/HTTP (step 3) needs
real `profiles`; the MVP product surface (step 4) needs lists/items/
votes; soft-delete UX (step 5) needs the trash views; account
deletion (step 8) needs the FK semantics already baked in.

The user wants **TDD with red phases first** — write all the
failing pgTAP tests (red), then write the migration to make them
pass (green). Per-table red→green cycles fight Postgres's
transactional DDL and the FK graph (`is_list_member()` references
`list_members`, which is referenced by every policy on every other
table). The right granularity for TDD here is the **pgTAP file**,
not the migration file.

## Decisions

**One migration, top-to-bottom.** `db/migrations/0004_domain_schema.sql`
ships the entire Tier 1+2 schema as a single `BEGIN; … COMMIT;`
block. No churn, no half-applied intermediate state. Together with
the smoke-profiles guard in step 1 of the migration body and the
`_migrations` ledger, this gives "all-or-nothing applied, exactly
once" — a mid-migration failure rolls back cleanly.

**Test bootstrap stubs `auth.users`.** `auth.users` is owned by
GoTrue in production (`docs/data-model.md:17`) and does not exist in
`cairn_test` because `scripts/test-db.sh` doesn't run GoTrue.
Solution: `db/test-bootstrap.sql` creates the `auth` schema, the
`authenticated`/`anon` roles, and a minimal `auth.users` stub
(just the columns FKs and triggers touch). Lives in `db/`, **not**
`db/tests/`, because `pg_prove --ext .sql` enumerates everything
`.sql` at the top of `db/tests/` as a test file — a bootstrap with
no `plan(N)` would either fail with "no plan declared" or trip a
parse error and red the whole suite. Keeping it one level up
keeps it out of pg_prove's scan while leaving it inside the
`./db:/db` volume mount.

**`uid()` lives in `public`, not `auth`.** A `uid()` helper is
*not* shipped by GoTrue itself — Supabase's hosted helpers ship
one in `public.uid()`, but we run vanilla GoTrue *and*
deliberately put our helper in a Cairn-owned schema rather than
GoTrue's `auth` schema, so a future GoTrue release can't clobber
us. `public.uid()` is `language sql stable`, reading
`request.jwt.claims` (the modern PostgREST v10+ JSON GUC; the
per-claim `request.jwt.claim.<name>` GUCs were removed in v10 and
we run v12.2.3 per `docker-compose.yml:21`). Body and rationale
in REQUIREMENTS.md → R2.

**Privacy split for `profiles` ↔ `user_settings`.** `profiles_select`
is world-readable to `authenticated`, so anything in `profiles` is
visible to every authenticated user. `user_settings` ships with a
single owner-only policy (`using (id = public.uid())`), so every
column there is private by virtue of the table it lives in. Today
`invite_policy` is the only such field; tomorrow's
private-and-follow-the-user fields go here too. Structural privacy
beats policy-driven privacy. The tombstone deliberately gets a
`profiles` row but **no `user_settings` row**: nobody is ever the
owner of the tombstone, so a settings row would have no reader.

**RPC-only list creation.** Direct `POST /lists` and direct `POST
/list_members` are both closed off by construction. Without that
closure, a direct `POST /lists` would succeed under a permissive
policy but skip the matching `list_members` row, leaving an orphan
list invisible to its creator; and a direct `POST /list_members`
would let any member silently add any authenticated user to a list
without consent. Closed structurally rather than by policy because
Tier 3's `accept_invitation` is the consent-respecting path that
lands in step 6, and we don't want a permissive direct-INSERT
shape sitting in production in the meantime.

**Explicit `invite_policy` value in `tg_profile_on_signup`, not the
column DEFAULT.** The trigger writes `INSERT INTO public.user_settings
(id, invite_policy) VALUES (NEW.id, 'everybody')` — explicit, not
a bare `INSERT … (id) VALUES (NEW.id)` that would lean on the
column DEFAULT. The bare form silently couples trigger correctness
to the table default in a non-obvious way: a future migration that
drops the default (because some new policy makes the explicit value
mandatory) would surface as "every new user's first request 500s on
NOT NULL" rather than as a migration-time error. Writing the value
at the call site keeps the coupling local.

**Trigger ordering via numeric prefixes.** Postgres fires triggers
in the same BEFORE/AFTER bucket alphabetically by *binding* name,
so the migration uses four numeric prefixes — `t01_*`, `t05_*`,
`t10_*`, `t20_*` — to lock the order. Three of those orderings
are load-bearing (Risks & gotchas → #3). Function names stay
un-prefixed (`tg_*`); only bindings carry the prefix.

**Three small per-table attribution functions, not one branching
on `TG_TABLE_NAME`.** `tg_set_attribution_lists`,
`tg_set_attribution_items`, `tg_set_attribution_list_members` —
three small functions are easier to read and test than one with
column-shape branching, and a future attribution-bearing table
just gets its own function in the same shape.

**Asymmetric `security_invoker` on the views.** `items_ranked`
inherits caller RLS (`security_invoker = true`); `items_deleted`
and `lists_deleted` bypass RLS (`security_invoker = false`) and
gate via an explicit `is_list_member()` clause in the view body.
The asymmetry is the whole point of having both — base tables and
the live view never expose soft-deleted content; the trash views
explicitly elevate to read it, with their own membership check as
the gate.

**`scripts/migrate.sh` waits for `auth.users`, gated on filename.**
Migrations from `0004` onward reference `auth.users`, which only
exists once GoTrue has run its own startup migration. An
unconditional poll in front of the loop would deadlock on a fresh
`docker compose up -d` — the poll would wait for `auth.users`,
which is waiting for GoTrue, which is waiting for `0001`–`0003` to
create the `gotrue` role. Filename-gated polling (skip for
`0001`–`0003`, wait for `0004+`) keeps `0001`–`0003` running
unconditionally, then waits for GoTrue's first successful
connection before `0004` lands.

## Architecture

### New files

- **`db/migrations/0004_domain_schema.sql`** — single migration,
  ordered. The whole file is wrapped in `BEGIN; … COMMIT;` (same
  pattern as `0001_init.sql` etc.; see "Existing patterns to
  reuse" below). Body order:
  1. Drop the smoke `profiles` table (gated `DO $$ … END$$` block
     keying on `to_regclass('public.user_settings') IS NULL`).
  2. `CREATE FUNCTION public.uid()` (per R2).
  3. Tombstone `INSERT INTO auth.users` (id `'00000000-…'`, email
     NULL, `ON CONFLICT (id) DO NOTHING`).
  4. `CREATE TABLE public.profiles` + tombstone profile insert
     (`'Deleted user'`, `ON CONFLICT DO NOTHING`).
  4b. `CREATE TABLE public.user_settings`. No tombstone settings
     row.
  5. `CREATE TABLE public.lists` + `lists_not_deleted_idx`.
  6. `CREATE TABLE public.list_members`.
  7. `CREATE TABLE public.items` + `items_list_active_idx`.
  8. `CREATE TABLE public.votes`.
  9. `CREATE FUNCTION public.is_list_member(target_list uuid)`
     (per `docs/data-model.md`, `stable security definer set
     search_path = public`).
  10. Trigger functions and bindings (per R7–R13). Function names
      un-prefixed (`tg_*`), bindings prefixed (`t01_*`, `t05_*`,
      `t10_*`, `t20_*`).
  11. `CREATE FUNCTION public.create_list(p_name text, p_description
      text default null) returns public.lists` (per R12).
  12. (no-op step — `ALTER TABLE … ENABLE ROW LEVEL SECURITY` is
      issued immediately after each `CREATE TABLE`, not in a
      separate pass; the step number is preserved for stable
      cross-references.)
  13. All RLS policies (per R14, exactly per the doc).
  14. Three views (per R6).
  15. Grants — table grants then function grants (per R15;
      `REVOKE EXECUTE FROM PUBLIC` then `GRANT EXECUTE TO
      authenticated` for every function).

  Each `CREATE TABLE` is **immediately** followed by `ALTER TABLE
  … ENABLE ROW LEVEL SECURITY`. If the migration aborts mid-file
  there's no half-enabled window where a created table sits with
  RLS off.

- **`db/test-bootstrap.sql`** — applied by `test-db.sh` before any
  migration runs, against a fresh `cairn_test`. Self-contained:
  creates the `authenticated` and `anon` roles via idempotent `DO $$
  … END$$` blocks (mirroring `0001_init.sql` so a subsequent
  `0001` re-run is a no-op), creates the `auth` schema (no
  `AUTHORIZATION gotrue` clause — the `gotrue` role doesn't exist
  in tests), and creates the `auth.users` stub (`id`, `email`,
  `role`, `created_at`). Top-of-file comment links to
  `docs/data-model.md`'s "auth.users is owned by GoTrue" paragraph
  and includes a checklist + maintenance rule (any future
  migration referencing a new `auth.users` column must extend the
  stub at the same time, or the test suite silently masks a
  divergence from the real GoTrue schema).

- **`db/tests/fixtures/users_alice_bob_carol.sql`** — three
  `auth.users` rows with stable UUIDs (`aaaa…`, `bbbb…`, `cccc…`)
  and emails `alice@test`, `bob@test`, `carol@test`. The
  `tg_profile_on_signup` trigger creates the `profiles` rows
  automatically (once 0004 is in place; in Phase A it just
  populates `auth.users`). No attributed inserts here, so no
  `request.jwt.claims` setup needed. Loaded with `\i
  /db/tests/fixtures/users_alice_bob_carol.sql`.

- **`db/tests/fixtures/list_shared_alice_bob.sql`** — extends the
  users fixture with one list created by Alice, with Bob as a
  second member; Carol is non-member. Self-includes the users
  fixture as its first non-comment statement. After the include,
  sets `request.jwt.claims` to Alice; creates the list via
  `public.create_list('Shared list')`; then `INSERT INTO
  public.list_members (list_id, user_id) VALUES (..., '<bob>')`.
  The fixture loads before any `SET LOCAL ROLE`, so the direct
  INSERT runs as the test session's `cairn` superuser — that
  bypass is what lets the row land despite the no-INSERT-grant on
  `list_members`. In production, a multi-member list shape comes
  from `accept_invitation` (step 6); the fixture stands in until
  the RPC lands.

- **`db/tests/fixtures/list_solo_alice.sql`** — list with Alice as
  the only member. Same self-include pattern as
  `list_shared_alice_bob.sql`; creates the list via
  `public.create_list(...)` and stops there.

#### Fixture conventions

- **Absolute paths for `\i`** — every include uses
  `\i /db/tests/fixtures/<name>.sql`. `pg_prove` runs as `docker
  compose exec -T postgres pg_prove --ext .sql ... /db/tests`,
  which inherits the container's WORKDIR (`/`); a relative `\i
  fixtures/...` resolves to `/fixtures/...` and fails. Absolute
  paths match the `./db:/db` volume mount and are robust to
  invocation cwd.
- **Self-include dependencies** — list fixtures `\i` the users
  fixture as their first non-comment statement, so a test that
  needs a list only has to `\i` the most specific fixture. Re-
  including is safe (every users INSERT uses `ON CONFLICT (id) DO
  NOTHING`).
- **No `BEGIN;`/`COMMIT;` inside fixtures** — each test file owns
  its own `BEGIN ... ROLLBACK` (per `docs/testing.md:103`); `\i`
  runs the included file inline in that transaction. A fixture
  that opens its own transaction either commits independently
  (persisting rows across tests) or issues a `COMMIT` that
  silently ends the test's transaction mid-file.
- **Name-as-stable-handle** — list fixtures expose lists by
  unique name (`'Shared list'`, `'Solo list'`); UUIDs are
  `gen_random_uuid()` and not deterministic across runs. Tests
  look the id up via `(SELECT id FROM public.lists WHERE name =
  'Shared list')`.
- **Attribution context** — any fixture that INSERTs into an
  attribution-bearing table (`lists`, `items`, `list_members`)
  sets `SET LOCAL request.jwt.claims = '{"sub":"<uuid>"}'`
  *before* the INSERT, because the `tg_set_attribution_*`
  BEFORE-INSERT triggers read `public.uid()` and write
  `created_by`. Without claims, `public.uid()` returns NULL, the
  trigger sets `created_by = NULL`, and the INSERT fails the NOT
  NULL constraint. `SET LOCAL` scopes the GUC to the surrounding
  `BEGIN ... ROLLBACK`, so test isolation is automatic.

#### Test files

22 pgTAP files under `db/tests/`. Every RLS file has at least one
positive and one negative case per `CLAUDE.md`'s "every policy,
positive AND negative". Every file wraps in `BEGIN ... ROLLBACK`
per `docs/testing.md:103`. The whole suite runs in well under a
second.

| File | What it proves |
|---|---|
| `infra_auth_stub.sql` | (1) bootstrap created `auth.users` (`has_table('auth','users')`); (2) gated `public.uid()` returns the JWT-claim UUID; (3) tombstone row exists in `auth.users` (id = `'00000000-…'`); (4) the fixture include works (`\i /db/tests/fixtures/users_alice_bob_carol.sql`, assert Alice's row). Assertion (2) is gated so the file parses cleanly in Phase A (where `public.uid()` doesn't exist yet) and is *skipped* rather than failed. The canonical gate body is a `pg_temp.uid_or_zero()` plpgsql shim defined at the top of the file (returning `NULL` on `undefined_function`), wrapped in a `SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_proc … WHERE proname = 'uid' …) THEN is(pg_temp.uid_or_zero(), …) ELSE skip(…) END;` statement-level pgTAP form — both branches statement-level so the counter advances cleanly in either Phase. The plan deliberately does **not** ship the `DO $$ … PERFORM skip(why, n); … END$$` variant (unclear pg_prove counter behaviour). In Phase A, (1) and (4) pass, (3) fails, (2) is skipped; in Phase C, all four pass. |
| `schema_shape.sql` | `has_table` for each new table + `has_column` for every column of profiles (`id`, `display_name`, `created_at`, `modified_at`), user_settings (`id`, `invite_policy`, `created_at`, `modified_at`), lists (no `modified_by`), list_members (`created_by` not `added_by`, plus `created_at`/`modified_at`), items, votes (`created_at` not `voted_at`, plus `modified_at`). **Plus `has_view` for the three views** (`items_ranked`, `items_deleted`, `lists_deleted`) and **`has_function` for the three functions** (`public.uid()` with `'{}'` argtypes, `public.is_list_member(uuid)` with `'{uuid}'`, `public.create_list(text, text)` with `'{text,text}'`) — so a migration that silently drops a view or function reds at the schema-shape layer rather than only through downstream tests. **Plus one load-bearing absence assertion**: `hasnt_column('public', 'list_members', 'added_by')` — locks in the rename to `created_by`. |
| `fk_set_default.sql` | For each of the 7 attribution FKs (lists.{created_by,deleted_by}, items.{created_by,modified_by,deleted_by}, list_members.{created_by,deleted_by}): delete the user from `auth.users` directly under the test session (`cairn` superuser owns the bootstrap-stub `auth.users`, so direct DELETE works without `delete_account()`), assert the column equals the tombstone UUID. **Seed shape for the two `list_members` legs**: the row under test must have `user_id <> deleted_user` (cross-actor seed) — e.g. Bob's membership row added by Alice, with the test then deleting Alice. The `user_id` CASCADE from `auth.users` runs *before* `SET DEFAULT` on `created_by`/`deleted_by`, so the obvious first attempt (Alice creates her own membership via `create_list()`, delete Alice) silently wipes the row before the assertion can read it. **Seed shape for the three `deleted_by` legs**: the row under test must have `deleted_by = alice_uid` *before* the test deletes Alice — soft-delete the row first under Alice's claims (the `tg_set_attribution_*` deleted_at-transition rule fills `deleted_by` automatically). **Seed shape for `items.modified_by` leg**: row must have `modified_by = alice_uid`, *not* a different user. The cascade for `items.modified_by` is computed against rows where `modified_by = alice` at cascade-start; cross-user seed leaves the modified_by cascade with no candidate row. (That cross-user shape is the load-bearing "cascade-for-other-column doesn't spuriously rewrite modified_by" property in `triggers_set_attribution.sql`, not this one.) Load-bearing for account-deletion. |
| `fk_cascade.sql` | Seven CASCADE legs from `docs/data-model.md`'s table blocks, one assertion each so a regression in any single one surfaces independently: (a) `profiles.id` cascades on `auth.users` delete; (b) `user_settings.id` cascades on `auth.users` delete; (c) `list_members.user_id` cascades on `auth.users` delete; (d) `votes.user_id` cascades on `auth.users` delete; (e) `items.list_id` cascades on `lists` delete; (f) `list_members.list_id` cascades on `lists` delete; (g) `votes.item_id` cascades on `items` delete. (a)–(d) tested by deleting from `auth.users` directly under the test session (cairn-superuser bypass). (e)/(f) by `DELETE FROM public.lists`; (g) by `DELETE FROM public.items`. The user_settings leg is load-bearing for `delete_account()`: without the cascade, deleting an account leaves an orphan settings row in a table whose RLS would never let anyone read it again — invisible cruft accumulating forever. |
| `constraints_user_settings.sql` | `invite_policy` enum CHECK constraint rejects bad values (`'everybody'`, `'circle'`, `'nobody'` accepted; anything else raises). `profiles` has no CHECK constraints to test (no `constraints_profiles.sql` file). |
| `constraints_lists.sql` | name length 1..200; description ≤2000; reject empty name; **NULL `description` accepted** — locks in the `description IS NULL OR length(description) <= 2000` two-clause CHECK; without the explicit NULL assertion, a regression that drops the `IS NULL OR` half would silently make `description` NOT NULL by CHECK and pass the rest of this row green. |
| `constraints_items.sql` | name length 1..500; reject empty name. |
| `constraints_votes.sql` | value in [-3,3]; value <> 0; PK uniqueness; "no vote" = no row; **`created_at` unchanged by re-vote** — INSERT a vote with value = +1, capture its `created_at`, then `INSERT … ON CONFLICT (item_id, user_id) DO UPDATE SET value = -2`, assert `created_at` matches the original. Load-bearing for the doc's "first vote" semantic. **Plus `modified_at` *is* bumped by re-vote** — same merge-duplicates dance, assert post-update `modified_at` is within seconds of `now()` and strictly greater than the captured original. The generic timestamp-trigger behaviour is covered uniformly by `triggers_set_timestamps.sql`, not duplicated here. |
| `triggers_profile_on_signup.sql` | INSERT a *fresh* (non-fixture) `auth.users` row with `id = 'dddddddd-…'` and assert: (1) `public.profiles` has that id with `display_name = 'New user'`; (2) `public.user_settings` has that id with the default `invite_policy = 'everybody'`; (3) `prosecdef = true` for `tg_profile_on_signup` (catalog probe; reproducing the gotrue-role INSERT path in tests would require role-granting overhead for one assertion); (4) Tombstone insert is idempotent; (5) Tombstone profile row exists with `display_name = 'Deleted user'`; (6) **Skip-branch for `profiles`** — `DELETE FROM auth.users WHERE id = '00000000-…'` (cascades both rows), re-INSERT, assert zero `public.profiles` rows for the tombstone id (proves the trigger took the `new.id = tombstone` branch and didn't insert a `'New user'` row that `ON CONFLICT DO NOTHING` then masked); (7) **Skip-branch for `user_settings`** — same dance, assert zero `public.user_settings` rows for the tombstone id (without (7), a regression that drops only the user_settings tombstone-skip would silently start creating tombstone settings rows). Whole dance runs inside the test's `BEGIN ... ROLLBACK`. |
| `rpc_create_list.sql` | Calling `create_list('My list')` under `SET LOCAL ROLE authenticated`: returns a `lists` row; `created_by = public.uid()`; exactly one matching `list_members` row exists with `user_id = creator` and `created_by = creator`; under `SET LOCAL ROLE anon`, `throws_ok` `permission denied for function create_list` (the function GRANT excludes anon — rejected before the body runs); **plus 1 load-bearing assertion for the body's `public.uid() IS NULL` guard** — under `SET LOCAL ROLE authenticated` with `request.jwt.claims` deliberately *not set*, `throws_ok` SQLSTATE `28000` errmsg `'not authenticated'`. Exercises the in-body guard separately from the GRANT-layer denial. **Plus 1 load-bearing assertion for the body's tombstone-UID guard** — under `SET LOCAL ROLE authenticated` with `request.jwt.claims = '{"sub":"00000000-…"}'`, `throws_ok` SQLSTATE `28000` errmsg `'cannot act as the tombstone user'`. Same defence-in-depth shape on the second guard line. |
| `triggers_modified_at.sql` | One bump-on-real-content-change assertion per table: (1) UPDATE `lists.name` bumps; (2) UPDATE `items.name` bumps; (3) UPDATE `profiles.display_name` bumps; (4) UPDATE `user_settings.invite_policy` bumps; (5) UPDATE `list_members.deleted_at` bumps; (6) UPDATE `votes.value` bumps. **Three load-bearing cascade-skip assertions, one per attribution-bearing table** — `ON DELETE SET DEFAULT` cascade leaves `modified_at` unchanged on (7) `lists`, (8) `items`, (9) `list_members`. For each: capture the table's `modified_at` for an Alice-attributed row, `DELETE FROM auth.users WHERE id = '<alice>'`, assert post-cascade `modified_at` exactly equals captured. Load-bearing for Risk #12.b. **Plus 1 load-bearing positive non-`OF` assertion** — capture `lists.modified_at` for an Alice-attributed row; under `cairn` (which bypasses RLS and the attribution-freeze, so a direct `UPDATE lists SET created_by = '<carol>'` actually lands), assert post-update `modified_at` exactly equals captured. Locks in the OF-clause restriction as a positive property and catches a future migration that accidentally adds an attribution column to the OF list. |
| `triggers_set_timestamps.sql` | Covers the universal `tg_set_timestamps` BEFORE INSERT OR UPDATE trigger across every table that has `created_at` and `modified_at` (profiles, user_settings, lists, list_members, items, votes). For every such table, three assertions: (a) **INSERT-override** — INSERT with both timestamps backdated to `'2020-01-01'`, assert both stored values are within `interval '5 seconds'` of `now()`; (b) **UPDATE-freeze `created_at`** — seed, capture, then PATCH-style UPDATE with `created_at = '2020-01-01'`, assert stored value matches capture; (c) **UPDATE-freeze `modified_at`** — same shape with *only* `modified_at = '2030-01-01'` in the SET list (deliberately not in any per-table `tg_set_modified_at` `OF` list, so `t20` doesn't fire and `t05`'s freeze is the only thing standing). Without (c), a member could `PATCH /lists?id=eq.<x>` with `{"modified_at": "2030-01-01"}` and silently distort every "last modified" surface. Lists-leg and items-leg INSERTs run as `cairn` (bypasses no-INSERT-grant), with `request.jwt.claims` set to Alice; the other four legs can run as `cairn` or `authenticated`. |
| `triggers_set_attribution.sql` | The attribution-bearing tables (lists, items, list_members) × the rules that apply per column. Underlying rationale lives in **Risk #11** (DEFAULT-traps) and **Risk #12** (cascade-aware gating, content-detection branch); this file triangulates every rule. Per-table-applicable: (i) **INSERT client-override** — `created_by` from a client-supplied UUID is overwritten with `public.uid()` on all three tables. (ii) **INSERT `deleted_by := NULL`** — INSERT with `deleted_by = bob_uid` (real, non-tombstone, FK-valid), assert `deleted_by IS NULL`. (iii) **UPDATE-time `created_by` attribution-lock** — under Bob's claims, attempt to PATCH `created_by = bob`; assert it stays Alice. (iii.b) **UPDATE-time `deleted_by` anti-spoof freeze on the ELSE branch** — three sub-assertions: (1) **deleted_at unchanged on a soft-deleted row** — Alice soft-deletes; Bob PATCHes `deleted_by = bob` with `deleted_at` unchanged; assert stays Alice; (2) **deleted_at unchanged on a live row** — Alice inserts (deleted_by NULL); Bob PATCHes `deleted_by = bob`; assert stays NULL; (3) **deleted_at re-stamped to a different non-null** — Alice soft-deletes at `t1`; Bob PATCHes `{"deleted_at":"t2","deleted_by":"<bob>"}` (both old and new non-null and distinct); assert stays Alice. (iv) **deleted_by set on `deleted_at` null→non-null**. (v) **deleted_by frozen against client spoof when `deleted_at` unchanged** — narrower restatement of (iii.b)(1) kept here for symmetry; (iii.b) is load-bearing. (vi) **deleted_by cleared on `deleted_at` non-null→null restore**. Items-only: (vii) **INSERT `modified_by := public.uid()`**. (viii) **UPDATE-time content-edit stamps `modified_by`** — under Bob's claims, edit Alice's item's `name`, assert `modified_by = Bob`. (ix) **UPDATE-time `modified_by` anti-spoof freeze** — under Bob's claims, PATCH `modified_by = bob` with no content change, assert stays Alice. (x) **cascade for `items.created_by` leaves `items.modified_by` unchanged when `modified_by` points at a non-deleted user** — load-bearing for Risk #12: seed `(created_by=Alice, modified_by=Bob)`, `DELETE FROM auth.users WHERE id = '<alice>'`, assert post-cascade `modified_by = Bob` *and* `created_by = '00000000-…'`. (xi) **cascade-ordering coverage with two FK legs to the same deleted user** — seed `(created_by=Alice, modified_by=Alice)`, delete Alice, assert post-cascade `created_by = '00000000-…'` AND `modified_by = '00000000-…'` AND `modified_at` exactly equals its captured pre-cascade value. Postgres fires *two* sequential cascade UPDATEs (one per FK), this assertion locks in cascade-order independence. **Role context**: lists-leg and list_members-leg INSERTs run as `cairn` superuser (both tables omit the INSERT grant); items can run as `cairn` or `authenticated` — pick `cairn` uniformly. Grant-layer denials are covered separately in `grants.sql`, `rls_lists.sql`, `rls_list_members.sql`. |
| `rls_profiles.sql` | SELECT positive (Alice sees Bob), SELECT positive (Bob sees Alice); **load-bearing unauthenticated negatives, one per defence layer**: (a) `throws_ok` under `SET LOCAL ROLE anon` that `SELECT FROM profiles` raises SQLSTATE `42501` (GRANT-layer denial); (b) `is(count, 0)` under `SET LOCAL ROLE authenticated` with `request.jwt.claims` *not set* — exercises the `profiles_select` policy itself. Together the pair proves an unauthenticated read is denied at *both* layers. UPDATE own succeeds; UPDATE other fails. |
| `rls_user_settings.sql` | Every assertion exercises the `id = public.uid()` rule from a different angle. SELECT positive (Alice's claims → Alice sees her own row); **SELECT negative (Alice's claims → Alice cannot see Bob's row)** — load-bearing assertion that distinguishes `user_settings` from `profiles`. Two unauthenticated negatives per defence layer (same shape as `rls_profiles.sql`). UPDATE own positive (Alice patches own `invite_policy`); UPDATE other negative (Alice attempts Bob's). |
| `rls_lists.sql` | SELECT positive (member sees), SELECT negative (non-member doesn't), SELECT negative (soft-deleted list hidden through the base table); **load-bearing INSERT-denied assertions, one per defence layer**: (a) `throws_ok` under `SET LOCAL ROLE authenticated` SQLSTATE `42501` (GRANT-layer denial); (b) inside the same `BEGIN ... ROLLBACK`, `GRANT INSERT ON public.lists TO authenticated` (rolled back), then under `SET LOCAL ROLE authenticated` with Alice's claims, `throws_ok` row-level-security policy violation — the policy-layer denial. **Don't run leg (b) as `cairn`**: cairn is both superuser and table owner, exempt from RLS unless `FORCE ROW LEVEL SECURITY` is set (it isn't), so the INSERT would silently succeed. **Plus 2 load-bearing DELETE-denied assertions per defence layer** — symmetric closure of "no hard-delete via API". UPDATE positive (member can rename), UPDATE negative (non-member can't). |
| `rls_list_members.sql` | SELECT positive/negative. **Load-bearing INSERT-denied assertions per defence layer** (same shape as `rls_lists.sql` — direct `POST /list_members` would let any member silently add any user without consent). UPDATE positive (self soft-removes — see Risk #1); UPDATE positive (member kicks another member); UPDATE positive (member restores another member's soft-removed row); UPDATE negative (outsider can't update). **Plus 1 load-bearing UPDATE-negative for the kicked-user self-restore footgun**: under Bob's claims after Alice has kicked Bob, assert `UPDATE … SET deleted_at = NULL WHERE list_id = '<list>' AND user_id = '<bob>'` returns zero affected rows. **Plus 2 load-bearing UPDATE-negatives for the `tg_freeze_list_members_pk` trigger** (consent-closure guard from Risk #13): (a) under Alice's claims, `throws_ok` SQLSTATE `P0001` errmsg `'list_members PK columns are immutable'` for `SET list_id = '<list_solo_alice's id>'`; (b) symmetric under Alice for `SET user_id = '<carol>'`. Running these as `cairn` would still fire the freeze (triggers aren't RLS-bypassed) but skip the policy layer; the assertion we want is "policy lets it through, only freeze catches it" — exercised only under `authenticated`. |
| `rls_items.sql` | SELECT positive (member sees), SELECT negative (non-member), SELECT negative (soft-deleted item hidden); INSERT positive; INSERT negative (non-member); UPDATE positive (member edits); UPDATE negative (outsider); **plus 2 load-bearing DELETE-denied assertions per defence layer** (symmetric to `rls_lists.sql`'s DELETE legs — items also has no hard-delete via API). |
| `rls_votes.sql` | SELECT positive (member sees vote on a live item), SELECT negative (non-member); **SELECT positive (member sees vote on a *soft-deleted* item)** — load-bearing companion locking in the doc's deliberate decision to leave `votes_select` unfiltered on `items.deleted_at`. INSERT positive; INSERT negative (user_id ≠ public.uid()); INSERT negative (non-member); **INSERT negative (member, but item is soft-deleted)** — the `votes_insert` policy filters on `i.deleted_at IS NULL`. UPDATE own positive; UPDATE other negative; **UPDATE negative (member, item soft-deleted)** — `votes_update`'s mirrored filter. DELETE own positive; DELETE other negative. |
| `views_items_ranked.sql` | score = sum; positive/negative/total voters counts; soft-deleted items excluded; no-votes item has score=0; view inherits RLS (non-member sees nothing). |
| `views_items_deleted.sql` | only soft-deleted rows visible to a member; `deleted_at`/`deleted_by` exposed; live items absent; **non-member sees zero rows through the view** — load-bearing test that the explicit `is_list_member()` filter is the only authorization gate (the view runs `security_invoker = false` and bypasses RLS); **soft-removed (former) member sees zero rows** — load-bearing companion locking in `is_list_member()`'s `deleted_at IS NULL` clause (a member who has soft-removed themselves can no longer restore items in a list they've left). **Plus column-shape pinning**: `has_column('public', 'items_deleted', <col>)` for `id`, `list_id`, `name`, `notes`, `created_by`, `modified_by`, `deleted_by`, `created_at`, `modified_at`, `deleted_at`. |
| `views_lists_deleted.sql` | only soft-deleted lists visible to a current member; live lists absent; **non-member sees zero rows**; **soft-removed (former) member sees zero rows**. **Plus column-shape pinning**: `has_column` for `id`, `name`, `description`, `created_by`, `deleted_by`, `created_at`, `modified_at`, `deleted_at`. |
| `grants.sql` | `has_table_privilege('authenticated', …)` for the granted matrix — every (table, verb) granted to authenticated asserted positive, plus **load-bearing INSERT negatives** for `lists`, `list_members`, `profiles`, `user_settings` (closes the orphan-list, consent-bypass, and trigger-only footguns). `has_table_privilege` SELECT positives on the three views; `has_function_privilege` EXECUTE positives on `public.{uid, is_list_member, create_list}` for authenticated; **load-bearing EXECUTE negative for anon on `create_list`**. **Anon-coverage negatives** that lock in the doc's "Anonymous users have no access to any table" rule — `has_table_privilege('anon', …, …)` returns `false` for every (new-table, verb) and `has_function_privilege('anon', …, 'EXECUTE')` is `false` for `public.is_list_member(uuid)` and `public.uid()`. Closes Risk #6 — RLS without GRANT silently returns empty, and the smoke check no longer hits `/profiles` so it can't catch a missing grant. |

### Modified files

- **`scripts/test-db.sh`** — Phase A. Two edits: (1) between line 26
  (`CREATE DATABASE`) and the migration loop at line 30, run
  `db/test-bootstrap.sql` against `cairn_test`; (2) immediately
  before the `pg_prove` invocation, add a guard that fails fast if
  any top-level `db/tests/*.sql` lacks a `SELECT plan(N)` call. The
  script already has `shopt -s nullglob`, so a literal `grep -L
  'plan(' db/tests/*.sql` would expand to `grep -L 'plan('` (no
  files) and read from stdin forever — capture into an array first
  and bail loudly if empty. Match `^[[:space:]]*SELECT[[:space:]]+plan[[:space:]]*\(`,
  not the bare substring `plan(` (a stray mention in an SQL comment
  would otherwise satisfy the substring match).

- **`scripts/migrate.sh`** — **Phase C**, in the same commit as the
  `0004` migration that motivates it (and the `.env.example`
  entry). Don't land in Phase A: a Phase A `migrate.sh` would block
  on the new poll forever because no migration creates `auth.users`
  until `0004` itself ships in Phase C. Inside the existing `for f
  in db/migrations/*.sql; do` loop, immediately after the
  skip-if-already-applied check and before the `applying $name`
  echo, gate on filename: extract the numeric prefix; if `≥ 0004`,
  poll until `to_regclass('auth.users') IS NOT NULL`, capped at
  `MIGRATE_AUTH_USERS_TIMEOUT` (default 60s). The `10#$prefix`
  arithmetic forces base-10 parsing so a leading zero (`0010`)
  doesn't get mistaken for octal. The test path
  (`scripts/test-db.sh`) doesn't need this — it stubs `auth.users`
  via `bootstrap.sql` before migrations run.

  After the loop ends and before the final `migrations up to date`
  echo, append `"${PSQL[@]}" -c "NOTIFY pgrst, 'reload schema'"
  >/dev/null`. PostgREST caches the schema at startup; without the
  notify, a fresh `0004` lands but the API returns 404 until the
  container is bounced. PostgREST v10+ listens for the `pgrst`
  channel and reloads on receipt — one statement, near-zero cost.
  The doc bullet at `docs/development.md:204` already promises
  this; this change brings code into line with the doc, no further
  doc edit needed.

- **`db/seed/dev_seed.sql`** — gut to a top-of-file comment. The
  current "insert two smoke profiles" rows can't survive once
  `profiles.id` is an FK to `auth.users(id)`, and we deliberately
  do *not* insert into `auth.users` directly: GoTrue's real schema
  has version-dependent NOT NULL columns we can't satisfy with a
  bare two-column insert, and any row we hand-craft would be one
  GoTrue refuses to authenticate against. Comment cross-links to
  `docs/testing.md:65-68` and notes that real seed users (Alice/Bob)
  land in step 3 once GoTrue + the magic-link shortcut are wired up.

- **`docs/development.md`** — three edits, all Phase A, in the same
  commit as the `dev_seed.sql` gut so doc and code never disagree
  on disk. (1) Rewrite the "Seed data" section (lines 221–225) to
  match the gutted seed: dev DB starts empty until step 3,
  developers create their own account via Mailpit, the
  `VITE_DEV_LOGIN_SHORTCUT` paragraph returns alongside step 3.
  (2) Replace the "Hit the API directly" snippet (lines 295–306,
  the GoTrue token-fetch example) — depends on the same seed users
  Phase A removes. (3) No edit — the `MIGRATE_AUTH_USERS_TIMEOUT`
  paragraph already lives at line 210, added by an earlier
  reconciliation pass.

- **`.env.example`** — add a commented entry for
  `MIGRATE_AUTH_USERS_TIMEOUT` (default 60s, override only for slow
  CI / cold VPS). **Phase C**, same commit as the `migrate.sh`
  changes — env knob and consumer ship together.

- **`db/tests/smoke.sql`** — delete in Phase D (superseded by
  `infra_auth_stub.sql`).

- **`scripts/smoke.sh`** — drop the `/profiles` block entirely.
  After this migration, anon has no SELECT grant on
  `public.profiles`, so PostgREST returns 401 *before* RLS even
  runs — the previously proposed "accept empty array" relaxation
  can't help when the response isn't an array. Removing the block
  also keeps the smoke honest: anon should see *nothing* under the
  new model. Add a comment near the deleted block recording the
  schema-reachability gap (an anon `curl http://localhost:3000/`
  produces an OpenAPI doc with no `paths` for our new tables, so
  the body can't cheaply confirm PostgREST has introspected the
  post-0004 schema). The schema-up check until step 3 is the
  manual `psql -c "\dt public.*"` step in the Verification section.

- **`plans/0000_implementation_order.md`** — once this plan is
  executed and merged, tick the step 1 checkbox.

### Files to leave alone

- `db/migrations/0001_init.sql`, `0002_auth_schema.sql`,
  `0003_postgres_role.sql` — already-applied; new work goes in
  `0004`.
- `db/Dockerfile` — pgTAP image already wired.
- `scripts/check.sh` — already runs `test-db.sh`.

## Phase structure

Each phase is a self-contained chunk of work mirrored as tasks in
`TASKS.md`.

1. **Phase A — bootstrap + infra check.** Add `db/test-bootstrap.sql`
   and patch `scripts/test-db.sh`. Add the
   `users_alice_bob_carol.sql` fixture and write
   `infra_auth_stub.sql` (one gated assertion + three ungated). Gut
   `db/seed/dev_seed.sql` and update `docs/development.md`. Drop
   the `/profiles` block from `scripts/smoke.sh`. Run
   `./scripts/test-db.sh`: the gated `public.uid()` assertion is
   *skipped*; the tombstone assertion fails; the rest pass —
   `1..4` with one skipped, one failed, two passed.

2. **Phase B — bulk red.** Add the remaining two fixtures
   (`list_shared_alice_bob.sql`, `list_solo_alice.sql`) and write
   the remaining ~21 test files (table inventory above). Most
   assertions fail red; this is the spec, in executable form. A
   small handful of "absence-of-post-0004-structure" assertions
   pass vacuously against the 0001 schema (e.g. the tombstone-
   skip test reads zero rows because the smoke `profiles` table
   has no FK cascade and never had a tombstone row) — that's
   expected; the load-bearing red signal is the *positive*
   assertions failing.

3. **Phase C — green.** Write `db/migrations/0004_domain_schema.sql`
   top-to-bottom. Update `scripts/migrate.sh` (the gated
   `auth.users` poll + the schema-cache reload). Add the
   `MIGRATE_AUTH_USERS_TIMEOUT` entry to `.env.example`. Run
   `./scripts/test-db.sh` and iterate. The cycle is fast (under
   a second per run); aim for green in one or two passes.

4. **Phase D — clean up.** Delete `db/tests/smoke.sql`. Run
   `./scripts/check.sh` (full gauntlet — sqlfluff, shellcheck,
   shfmt, vitest, pg_prove, prettier, svelte-check). Tick step 1
   in `plans/0000_implementation_order.md`.

## Risks & gotchas

The cascade and DEFAULT-trap risks (#11, #12) are the most
load-bearing — they're why several trigger bodies have unusual
shapes. Each test row in the inventory above traces back to a
specific risk; this section is the *why*, the test rows are the
*what*.

1. **`list_members_update` self-removal.** `is_list_member()`
   returns false for a member after they soft-remove themselves
   (`deleted_at` set), so a `WITH CHECK (is_list_member(list_id))`
   would reject the very update that removes them. The form the
   doc has settled on — `WITH CHECK (public.is_list_member(list_id)
   OR user_id = public.uid())` — handles this; see
   `docs/data-model.md:436` for the policy and line 445 for the
   rationale. The self-removal assertion in `rls_list_members.sql`
   is the regression guard, not the discovery mechanism.

2. **`SET LOCAL ROLE` from a superuser session needs no explicit
   GRANT.** Earlier drafts added `GRANT authenticated, anon TO
   cairn` in `bootstrap.sql` on the assumption that the target
   role had to be granted to the session user before `SET LOCAL
   ROLE` would succeed. That rule applies only to *non-superuser*
   sessions. `cairn` is the cluster superuser per
   `docker-compose.yml`'s `POSTGRES_USER: cairn`, and superusers
   bypass the role-membership check on `SET LOCAL ROLE` — the
   target role only has to *exist*. `bootstrap.sql` therefore
   creates the `authenticated` and `anon` roles (idempotent `DO $$
   … END$$` blocks) but does not grant them to anyone. If a
   future test uses a non-superuser connection (e.g.,
   `authenticator`-via-PostgREST in an integration probe),
   reintroduce the grant *to that role only*, with the rationale
   spelled out at the call site.

3. **Trigger order matters, and the plan now relies on it.**
   Postgres fires triggers in the same BEFORE/AFTER bucket
   alphabetically by *binding* name, so the migration uses four
   numeric prefixes — `t01_*`, `t05_*`, `t10_*`, `t20_*` — to
   lock the order. Three orderings are load-bearing, not just
   defensive:
   - `t01_freeze_list_members_pk` short-circuits before
     `t05_set_timestamps` / `t10_set_attribution_list_members`
     / `t20_set_modified_at_list_members`, so a PK-mutation
     UPDATE rejects without burning per-row freeze/derive work
     and without fattening the `RAISE EXCEPTION` stack trace
     with downstream NOTICEs (see Risk #13).
   - `t05_set_timestamps` runs before `t20_set_modified_at_*` so
     its UPDATE-side `NEW.modified_at := OLD.modified_at`
     freeze is in place before `t20`'s `now()` overwrite — and
     `t20`'s `OF (cols)` clause is what decides whether `t05`'s
     freeze stays or gets overwritten on this particular
     UPDATE. The `t05` → `t20` ordering is the mechanism by
     which "client PATCH of `modified_at` only is frozen" and
     "real content edit bumps `modified_at`" coexist in the
     same trigger pair (see the cascade-skip half of Risk
     #12.b).
   - `t10_set_attribution_*` runs after `t05` and before `t20`,
     so it sees the frozen timestamps and runs ahead of the
     `modified_at` decision. Today this doesn't change
     attribution behaviour, but it keeps the
     "freeze → derive → bump" reading order consistent in `\d
     <table>` output and is robust against a future attribution
     rule that would care about timestamp state.

   `tg_profile_on_signup` is `AFTER INSERT ON auth.users` and has
   no co-firing trigger in that bucket, so it stays un-prefixed
   (the prefix convention applies only to BEFORE bindings on
   `public.*` tables where multiple triggers may share the
   bucket). List-creation membership is no longer a trigger;
   it's the `create_list()` RPC, so there's no AFTER-INSERT-on-
   `lists` ordering concern.

4. **Policy + trigger interaction on `items_insert`.** Trigger
   sets `created_by = public.uid()` *before* policy `WITH CHECK`
   evaluates `public.uid() = created_by`. So a client INSERT with
   `created_by = bob_uuid` while authenticated as Alice ends up
   with Alice's UUID stored — exactly per
   `docs/data-model.md:482`. Tested in
   `triggers_set_attribution.sql`. The same interaction would
   have applied to `lists_insert` and `list_members_insert`, but
   neither table has an INSERT policy any more — list creation
   goes through `create_list()` only, and membership writes go
   through `create_list()` + step 6's `accept_invitation`.

5. **`security definer` + `search_path`.** `is_list_member()` is
   `SECURITY DEFINER` — `SET search_path = public` defeats
   schema-shadowing privilege escalation, and the defense is
   genuinely load-bearing there (the function runs as its
   `cairn`-superuser owner, so a shadowed `public.list_members`
   lookup would let a caller exfiltrate membership rows they
   shouldn't see). `public.uid()` is `SECURITY INVOKER` (default),
   so a schema-shadowing attack against it can't elevate
   privilege — the `SET search_path = public` clause on it is
   hygiene rather than a security boundary, kept for symmetry
   with `is_list_member()` and to keep both helper definitions
   structurally identical. `tg_profile_on_signup()` is the third
   `SECURITY DEFINER` body in the migration and gets the same
   treatment for the same load-bearing reason. See
   `docs/data-model.md:316`.

6. **GRANTs are mandatory.** RLS without `GRANT` produces a silent
   empty result via PostgREST. Easy to forget; covered in step 15
   of the migration ordering. The canonical verification is
   `grants.sql` (positive matrix plus load-bearing negatives for
   the omissions). The smoke script previously hit `/profiles` to
   exercise the matrix end-to-end, but this plan removes that
   probe (anon has no SELECT grant on `profiles` after `0004`),
   so until step 3 wires the magic-link flow and an authenticated
   `/lists` probe, `grants.sql` is the only mechanical check that
   the matrix is correct.

7. **`votes` has no soft-delete.** Hard delete only
   (`docs/data-model.md:177`). No `deleted_at` column, no
   `*_deleted` view. Don't accidentally add one for "consistency."

8. **Soft-deleted rows are unreachable except through the trash
   views.** `lists_select` and `items_select` keep their `and
   deleted_at IS NULL` filter, so a direct `GET /lists` or `GET
   /items` (and `items_ranked`, which inherits the caller's RLS
   via `security_invoker = true`) cannot return soft-deleted rows
   — to anyone, member or not. The only read path is the trash
   views, which run `security_invoker = false` (so they bypass
   RLS as the owner) and gate access with an explicit
   `public.is_list_member(<list>)` in the view body. Two
   consequences worth knowing: (a) the load-bearing test for the
   trash views' authorization is the negative `non-member sees
   zero rows` assertion in `views_items_deleted.sql` and
   `views_lists_deleted.sql` — without it, a future refactor that
   drops the `is_list_member()` filter would silently expose every
   list's trash to every authenticated user; (b) restore from
   trash still goes through `PATCH /items` / `PATCH /lists`,
   gated by the live `*_update` policy — and `*_update` checks
   `is_list_member()` against `list_members.deleted_at IS NULL`,
   which means a soft-removed member can no longer restore items
   in a list they've left, even if they had access to the trash
   when their membership was live. That's the desired behaviour.

9. **Tombstone insert idempotency.** `ON CONFLICT (id) DO NOTHING`
   on both the `auth.users` and `profiles` inserts — protects
   against re-running on a non-empty test DB and against the
   `profile_on_signup` trigger racing the manual profile insert.
   The two-column `(id, email)` form is the minimum viable insert
   against the pinned `supabase/gotrue:v2.158.1` schema; the
   columns it relies on, the test-stub parity, and the GoTrue-
   upgrade caveat live in `docs/account-deletion.md` →
   "auth.users columns the tombstone insert depends on" — a
   future GoTrue image bump must re-validate the insert against
   the new schema, or both this migration and the step-8
   `delete_account()` RPC will silently break.

10. **`display_name` placeholder must not be derived from email.**
    Cairn's privacy contract is that email is private and never
    shown in the UI; the email's local part is often the user's
    real name. The on-signup trigger therefore sets `display_name
    = 'New user'` rather than reading `new.email` — rendering an
    email-derived value as `display_name` would leak email
    content through every UI surface that shows the placeholder
    during the brief window before the user sets their own name on
    first launch. The first-launch screen detects the placeholder
    and forces a "What should we call you?" prompt before any
    other action.

11. **`deleted_by` DEFAULT-trap on INSERT.** The seven attribution
    FKs all use `ON DELETE SET DEFAULT` with the column DEFAULT
    set to the tombstone UUID — that's how account deletion
    repoints attribution at once (per `account-deletion.md`'s
    "Schema changes" list). Postgres applies the column DEFAULT
    on `INSERT`-without-value *too*, which is fine for
    `created_by`/`modified_by` (the trigger overwrites with
    `public.uid()` anyway), but is *wrong* for `deleted_by`: a
    freshly inserted live row must have `deleted_by IS NULL`,
    not the tombstone, because the row hasn't been deleted yet.
    The `tg_set_attribution_*` BEFORE-INSERT branch sets
    `NEW.deleted_by := NULL` unconditionally — written that way,
    not "if the client didn't send a value," because we
    deliberately ignore client-sent attribution everywhere.
    Without the override every fresh live row would silently
    render as "deleted by Deleted user." Test coverage in
    `triggers_set_attribution.sql` (load-bearing INSERT
    assertions, one per attribution-bearing table).

12. **`ON DELETE SET DEFAULT` cascade fires user-defined BEFORE
    UPDATE triggers — and the attribution-freeze must let it
    pass.** Postgres implements `ON DELETE SET DEFAULT` as an
    internal `UPDATE <referencing-table> SET <fk-col> = DEFAULT
    WHERE <fk-col> = <deleted-id>`, executed via SPI through the
    standard executor — which fires user-defined BEFORE UPDATE
    triggers normally. Without a gate, the
    `tg_set_attribution_*` UPDATE branch's `NEW.<col> :=
    OLD.<col>` reverts the cascade's transition (NEW = tombstone
    → reverted to OLD = the about-to-be-deleted UUID), the
    cascade UPDATE becomes a no-op, `RI_FKey_check_upd` skips its
    FK re-check because the columns didn't change, and the
    referenced `auth.users` row is then deleted — leaving every
    `created_by` / `modified_by` previously attributed to the
    deleted user as a dangling FK reference instead of repointed
    to the tombstone. `delete_account()` (step 8) would *appear*
    to succeed and silently leak corruption into the schema.
    Two-part fix:

    a. **Attribution trigger — gate the `created_by` freeze on
       tombstone transition; gate the items `modified_by` rules
       on content-change detection.** For `created_by` on all
       three attribution-bearing tables, the freeze is wrapped
       in `IF NEW.created_by IS DISTINCT FROM
       '00000000-0000-0000-0000-000000000000' THEN
       NEW.created_by := OLD.created_by; END IF`. The cascade
       always sets NEW to the tombstone, so the gate lets the
       transition through; client UPDATEs that send a non-
       tombstone value still get reverted. For items
       `modified_by` the per-column tombstone gate is
       insufficient on its own — the Bob-edited-Alice's-item
       cascade case rewrites `modified_by` to the deletion
       subject and leaves a dangling FK after the parent
       DELETE. Fix: a content-aware gate (the modified_by
       rules fire only when an actual content column changed)
       plus a separate tombstone-gated freeze for direct PATCH
       spoofs of `modified_by` itself. Two design choices: (i)
       the simpler `created_by` gate admits a client PATCH of
       `created_by = '00000000-…'` (vandalism, not privilege
       escalation — the user can already self-tombstone via
       account deletion); (ii) the `BEFORE UPDATE OF (cols)`
       trick used for `tg_set_modified_at` (b) doesn't work here
       because the attribution freeze needs to fire on
       attribution-only UPDATEs.

    b. **Modified-at trigger (use `BEFORE UPDATE OF
       <non-attribution-cols>`).** The simpler half. Cascade SET
       DEFAULT only touches attribution columns, so a
       column-restricted `OF` clause means the trigger never
       fires during cascade — `modified_at` stays at its real
       "last content change" value instead of getting bumped on
       every list/item the deleted user ever touched. Without
       this, an active user's account deletion silently rewrites
       `modified_at` on every row they ever created/modified,
       breaking any UI surface that reads it as "when did the
       content last change."

    Test coverage: `fk_set_default.sql` (positive proof for gate
    (a)), `triggers_set_attribution.sql` (UPDATE-time
    attribution-lock + items `modified_by` content-aware gate,
    both branches), `triggers_modified_at.sql` (cascade-skip for
    gate (b)). Per-assertion rationale lives in each row of the
    test inventory.

13. **`list_members` PK is mutable-by-policy and must be frozen
    by trigger.** The `list_members_update` policy uses `WITH
    CHECK (public.is_list_member(list_id) OR user_id =
    public.uid())`. The `or user_id = public.uid()` clause is
    load-bearing for self-removal (Risk #1) — a member's own
    soft-deleted row no longer satisfies `is_list_member()`, so
    the alternate self-row gate is what lets the soft-removal
    update commit. The same clause has a less-obvious second
    effect: it lets a member PATCH *any* column of their own row
    — including the PK columns. A live member of list A can
    `PATCH /list_members?list_id=eq.<A>&user_id=eq.<self>` with
    body `{"list_id": "<B>"}` and Postgres will accept the
    UPDATE: the `using` clause checks `is_list_member(list_id)`
    against the OLD row (member of A → true), the `with check`
    is satisfied via the self-row branch, and the FK on
    `list_id` only requires list B to exist. Net: self-add to
    any list whose UUID the caller can obtain (shared
    screenshots, leaked URLs, accidental copy-paste), bypassing
    the structural consent closure that step 11's `create_list`
    and step 6's `accept_invitation` are supposed to make the
    only sanctioned membership-write paths. The symmetric vector
    via `user_id` mutation lets a member rewrite a row to point
    at a third party. Closure: a tiny
    `tg_freeze_list_members_pk` trigger, bound as `t01_*` so it
    short-circuits before timestamps, attribution, and
    `modified_at` work runs. Asymmetry with the `votes` PK
    accepted trade-off is deliberate: the `votes` shape is a
    vote-move between lists the caller is *already* a member of
    (the policy itself pins the new list to one with
    membership), so the worst impact is a vote moving without a
    `modified_at` bump — bounded enough to defer. The
    `list_members` shape is a membership self-add to a list the
    caller is *not* a member of, which is privilege escalation
    and has to land here. Test coverage: the two `throws_ok`
    assertions in `rls_list_members.sql` (one per PK column).

## Existing patterns to reuse

There's not much in this repo yet (it's pre-production), but:

- `BEGIN; … COMMIT;` migration wrapping
  (`db/migrations/0001_init.sql:7, 68`).
- `DO $$ … END$$;` idempotent guards
  (`db/migrations/0001_init.sql:13-33`).
- `IF NOT EXISTS` on `CREATE TABLE` for re-runnability
  (`db/migrations/0001_init.sql:43, 49`).
- `.sqlfluff` style: postgres dialect, 2-space indent, UPPERCASE
  keywords, lowercase identifiers, max 100 chars
  (`/.sqlfluff:1-5`). Run `sqlfluff lint db/` before claiming
  green; lefthook also enforces on commit.

## Reference docs and skills

- **`docs/data-model.md`** — canonical table/policy/trigger/view
  shapes and rationale. Every CREATE statement and policy in
  `0004` mirrors this doc.
- **`docs/account-deletion.md`** — tombstone seeding, FK
  semantics, GoTrue-version caveat. The FK `ON DELETE SET
  DEFAULT` semantics this plan ships are pre-baked here so step
  8 doesn't have to ALTER FKs.
- **`docs/testing.md`** — the three test layers and pgTAP
  conventions (every test file wraps in `BEGIN ... ROLLBACK`,
  per-policy positive AND negative coverage).
- **`docs/development.md`** — start-over recovery
  (`docker compose down -v && up -d && migrate && seed`),
  schema-cache reload bullet, `MIGRATE_AUTH_USERS_TIMEOUT`
  paragraph.
- **`.claude/skills/writing-tasks.md`** — TASKS.md format and
  TDD step ordering (RED before GREEN).
- **`docker-compose.yml:21`** — pinned PostgREST v12.2.3 (the
  reason `public.uid()` reads the modern JSON-GUC shape).

## Verification

Local:

- `./scripts/test-db.sh` — pgTAP suite, all green.
- `./scripts/check.sh` — full gauntlet (sqlfluff lint included).
- `docker compose up -d`, `./scripts/migrate.sh`,
  `./scripts/seed.sh` to rebuild the dev DB. `./scripts/smoke.sh`
  to confirm the service mesh is up (PostgREST OpenAPI root,
  GoTrue health, Mailpit) — anon has no SELECT grant on the new
  `profiles`, so the smoke no longer probes schema reachability
  via `/profiles`; the manual `\dt`/`\dv`/`\df` step below is the
  schema-up check.
- Manual psql: `psql -U cairn -d cairn -c "\dt public.*"` shows
  the six tables (profiles, user_settings, lists, list_members,
  items, votes); `\dv public.*` shows the three views; `\df
  public.*` shows `is_list_member` and `uid` (both live in
  `public`, not `auth`).
- Manual API check: `curl -i http://localhost:3000/profiles`
  (anon) → `HTTP/1.1 401` (no SELECT grant for anon; PostgREST
  short-circuits before RLS), not an empty array. With a
  fake-jwt cookie for Alice → her profile visible. (The anon
  path matters because the magic-link flow in step 3 will hit
  `/rpc/...` as anon — the 401 here is *not* a regression, it's
  the new contract.)

## After this lands

`db/migrations/0004_domain_schema.sql` is **frozen** once merged.
Schema evolution from this point onward ships as additive,
forward-only migrations: `0005_…`, `0006_…`, etc. — never as
edits to `0004`. There is no down-migration; `scripts/migrate.sh`
is forward-only and gated by the `_migrations` ledger. The dev
DB is rebuildable end-to-end via `docker compose down -v && up
-d && ./scripts/migrate.sh && ./scripts/seed.sh`, which is the
closest thing to a "reset to a known state" — use that, not edits
to `0004`.
