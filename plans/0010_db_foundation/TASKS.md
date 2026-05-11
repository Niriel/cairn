# Tasks

## Reference skills and docs

- **`PLAN.md`** (sibling) — full design context, the test-file
  inventory with per-file assertion specs (`Architecture` →
  `Test files`), and the Risks & gotchas section that explains
  *why* several trigger and view shapes are unusual. Phase B
  tasks reference specific rows of the test inventory by
  filename rather than re-inlining each per-file spec.
- **`docs/data-model.md`** — canonical table / policy / trigger
  / view shapes. Every `CREATE` statement in the `0004`
  migration mirrors this doc.
- **`docs/account-deletion.md`** — tombstone seeding, FK `ON
  DELETE SET DEFAULT` semantics, GoTrue-version caveat.
- **`docs/testing.md`** — pgTAP conventions: every test file
  wraps in `BEGIN ... ROLLBACK`; every policy gets positive AND
  negative coverage.
- **`docs/development.md`** — start-over recovery, schema-cache
  reload bullet, `MIGRATE_AUTH_USERS_TIMEOUT` paragraph.
- **`.claude/skills/writing-tasks.md`** — TDD ordering (RED
  before GREEN), self-contained-task convention, per-task
  Verify lines.

## Phase A — bootstrap + infra check

### [x] A.1 Add `db/test-bootstrap.sql` and patch `scripts/test-db.sh`

**Created:** 2026-05-09T00:00:00Z
**Completed:** 2026-05-11T08:51:42Z

**Why:** The pgTAP test path runs against `cairn_test`, which has
no GoTrue and therefore no `auth.users`. Every later test file in
this plan references `auth.users` (FKs, fixtures, attribution
triggers), so `auth.users` must be stubbed before any test
migration runs. The bootstrap also creates `authenticated` and
`anon` roles so test files can `SET LOCAL ROLE` to exercise both
authenticated and anonymous paths.

**Prerequisites:** None. Phase A first task.

**Decisions:**
- Bootstrap lives in `db/`, not `db/tests/`, because `pg_prove
  --ext .sql ... /db/tests` enumerates everything `.sql` at the
  top of `db/tests/` as a test file. A bootstrap with no
  `plan(N)` would fail with "no plan declared" or trip a parse
  error and red the whole suite. Outside `db/tests/` keeps it
  off pg_prove's scan list while staying inside the `./db:/db`
  volume mount.
- Idempotent role creation via `DO $$ … END$$` blocks mirroring
  `0001_init.sql`'s `IF NOT EXISTS` shape — so a subsequent
  `0001` re-run is a no-op.
- No `GRANT authenticated TO cairn` etc. — `cairn` is the cluster
  superuser and bypasses role-membership checks on `SET LOCAL
  ROLE` (see PLAN.md Risk #2).
- `auth` schema created without `AUTHORIZATION gotrue` (the
  `gotrue` role doesn't exist in the test DB, and ownership
  doesn't matter when GoTrue never runs).
- Stub `auth.users` columns: `id uuid PK`, `email text`, `role
  text DEFAULT 'authenticated'`, `created_at timestamptz DEFAULT
  now()`. Top-of-file comment links to `docs/data-model.md`'s
  "auth.users is owned by GoTrue" paragraph and includes a
  rule-and-checklist: any future migration referencing a new
  `auth.users` column must extend the stub at the same time, or
  the test suite silently masks a divergence from the real GoTrue
  schema.
- `scripts/test-db.sh` runs the bootstrap between `CREATE
  DATABASE` and the migration loop. Same script also gains a
  fail-fast guard before `pg_prove` that rejects any
  `db/tests/*.sql` lacking a `SELECT plan(N)` declaration —
  matched as `^[[:space:]]*SELECT[[:space:]]+plan[[:space:]]*\(`,
  not the bare substring `plan(` (a stray mention in an SQL
  comment would otherwise satisfy a substring match).
- Capture into an array first because `shopt -s nullglob` is in
  effect — a literal `grep -L 'plan(' db/tests/*.sql` would
  expand to `grep -L 'plan('` (no files) and read from stdin
  forever.

**Files:**
- `db/test-bootstrap.sql` (create)
- `scripts/test-db.sh` (modify)

**Steps:**
1. Create `db/test-bootstrap.sql` with the top-of-file comment
   (rule + auth.users column checklist + cross-link to
   `docs/data-model.md`), the two role-creation `DO $$ … END$$`
   blocks (one for `authenticated`, one for `anon`), the
   `CREATE SCHEMA IF NOT EXISTS auth;`, and the `CREATE TABLE
   auth.users (id uuid PRIMARY KEY, email text, role text
   DEFAULT 'authenticated', created_at timestamptz DEFAULT
   now());`.
2. In `scripts/test-db.sh`, between the `CREATE DATABASE` line
   and the migration loop, add a `psql` invocation that applies
   `db/test-bootstrap.sql` to `cairn_test`. Keep `set -euo
   pipefail` so a bootstrap failure aborts the run.
3. Immediately before the `pg_prove` invocation in
   `scripts/test-db.sh`, add the plan-declaration guard:
   capture `db/tests/*.sql` into a `files` array, bail with a
   scoped message if empty, then `grep -LE
   '^[[:space:]]*SELECT[[:space:]]+plan[[:space:]]*\(' "${files[@]}"`
   and bail with the missing-files list if non-empty.
4. Run `./scripts/test-db.sh` to confirm the bootstrap applies
   cleanly and the plan-guard accepts existing test files.

**Verify:** `./scripts/test-db.sh` (bootstrap applies cleanly;
existing `db/tests/smoke.sql` still passes for now)

### [x] A.2 Add users fixture + `infra_auth_stub.sql` infra-check test

**Created:** 2026-05-09T00:00:00Z
**Completed:** 2026-05-11T08:56:21Z

**Why:** Establishes the test infrastructure that Phase B will
build on: the canonical fixture for the three test users
(Alice/Bob/Carol), the absolute-path `\i` convention, and the
gated-assertion pattern that lets a single test file cover both
the pre-`0004` and post-`0004` schemas without re-editing.

**Prerequisites:** A.1 (bootstrap creates `auth.users`).

**Decisions:**
- Fixture file: `db/tests/fixtures/users_alice_bob_carol.sql`,
  three `auth.users` rows with stable UUIDs (`aaaa…`, `bbbb…`,
  `cccc…`) and emails `alice@test`, `bob@test`, `carol@test`.
  Each `INSERT` uses `ON CONFLICT (id) DO NOTHING` so re-includes
  are no-ops.
- The fixture has no `BEGIN;`/`COMMIT;` of its own — each test
  file owns its own transaction (per `docs/testing.md:103`).
- Includes use **absolute** paths: `\i
  /db/tests/fixtures/users_alice_bob_carol.sql`. `pg_prove` runs
  with the container WORKDIR `/`, so a relative `\i fixtures/…`
  resolves to `/fixtures/…` and fails. Absolute paths match the
  `./db:/db` volume mount and are robust to invocation cwd.
- `infra_auth_stub.sql` declares `SELECT plan(4);` and asserts:
  (1) `has_table('auth','users')`; (2) gated `public.uid()`
  returns the JWT-claim UUID; (3) tombstone row exists in
  `auth.users` (`id = '00000000-…'`); (4) the fixture include
  works (Alice's row is present after `\i
  /db/tests/fixtures/users_alice_bob_carol.sql`).
- The gate for assertion (2) is a `pg_temp.uid_or_zero()`
  plpgsql shim defined at the top of the test file, returning
  `NULL` on `EXCEPTION WHEN undefined_function`. Wrapped in a
  `SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_proc … WHERE
  proname = 'uid' AND pronamespace = 'public'::regnamespace)
  THEN is(pg_temp.uid_or_zero(), …) ELSE skip(…) END;` —
  statement-level pgTAP, both branches are statement-level so
  the counter advances cleanly in either Phase. Deliberately not
  using the `DO $$ … PERFORM skip(why, n); … END$$` variant
  (unclear pg_prove counter behaviour; would force a Phase A →
  Phase B re-edit pass).
- Phase A run shape: `1..4` with one passed (1), one passed (4),
  one skipped (2), one failed (3 — tombstone doesn't exist
  yet). Phase C all-pass.

**Files:**
- `db/tests/fixtures/users_alice_bob_carol.sql` (create)
- `db/tests/infra_auth_stub.sql` (create)

**Steps:**
1. Create `db/tests/fixtures/users_alice_bob_carol.sql` with the
   three `INSERT INTO auth.users (id, email) VALUES …` rows,
   each with `ON CONFLICT (id) DO NOTHING`. No transaction
   wrapping. Top comment notes the absolute-path include
   convention and that the file is safe to re-include.
2. Create `db/tests/infra_auth_stub.sql`. Open with `BEGIN;`,
   `SELECT plan(4);`, the `pg_temp.uid_or_zero()` plpgsql shim,
   the four assertions, `SELECT * FROM finish();`, `ROLLBACK;`.
   Use `\i /db/tests/fixtures/users_alice_bob_carol.sql` to
   load the fixture (this exercises the include for assertion
   4).
3. Run `./scripts/test-db.sh`. Expect `1..4` with one skip
   (assertion 2), one fail (assertion 3), two passes (1 and 4).
   This is the load-bearing red signal that the test
   infrastructure works and the migration genuinely hasn't
   landed yet.

**Verify:** `./scripts/test-db.sh` reports `1..4` with the
expected skip/fail/pass shape

**Notes:**
- `SELECT * FROM finish();` trips sqlfluff's `AM04` (ambiguous
  column count). Suppressed inline with `--noqa: AM04` on that
  line; pgTAP's `finish()` has a fixed column shape so the rule
  doesn't apply. `db/tests/smoke.sql` has the same line and is
  currently unlinted by lefthook (only staged files are checked);
  it will need the same `--noqa` once it's touched again, or it
  can be dropped under D.1 anyway.

### [x] A.3 Phase A non-test cleanup: gut `dev_seed.sql`, update `docs/development.md`, drop `/profiles` from `smoke.sh`

**Created:** 2026-05-09T00:00:00Z
**Completed:** 2026-05-11T09:09:52Z

**Why:** Once `0004` lands and `profiles.id` becomes an FK to
`auth.users(id)`, the existing `db/seed/dev_seed.sql` rows can't
survive — they violate the FK with no `auth.users` parent.
Doing this in Phase A (rather than waiting for Phase C) keeps
`./scripts/seed.sh` from breaking for the duration of Phases B
and C, and keeps `./scripts/check.sh` from reding for *unrelated*
reasons across the whole TDD run. The intentional pgTAP reds in
Phases A–B remain; everything else stays green.

**Prerequisites:** None (independent of A.1/A.2 — no test files
involved).

**Decisions:**
- `db/seed/dev_seed.sql` becomes a top-of-file comment only
  (no SQL statements). Comment cross-links to
  `docs/testing.md:65-68` and notes that real seed users
  (Alice/Bob) land in step 3 of
  `plans/0000_implementation_order.md` once GoTrue and the
  magic-link shortcut are wired up. We deliberately do *not*
  insert into `auth.users` directly: GoTrue's real schema has
  version-dependent NOT NULL columns we can't satisfy with a
  bare two-column insert, and any row we hand-craft would be
  one GoTrue refuses to authenticate against.
- `docs/development.md` gets two edits in the same commit so
  doc and code never disagree on disk:
  - **Seed data section** (lines 221–225): rewrite to a short
    paragraph saying the dev DB starts empty until step 3,
    that developers create their own account via Mailpit, and
    that the `VITE_DEV_LOGIN_SHORTCUT` paragraph will return
    alongside step 3's plan.
  - **"Hit the API directly" snippet** (lines 295–306, the
    `curl … alice@example.test … password` GoTrue
    token-fetch example): replace with a one-line note that
    the dev-token shortcut returns alongside step 3's GoTrue
    + magic-link wiring; until then the API is reachable via
    the manual `psql` path above and via PostgREST's anon
    OpenAPI root.
  - **No edit** for the `MIGRATE_AUTH_USERS_TIMEOUT`
    paragraph (already at line 210 from a prior reconciliation
    pass).
- `scripts/smoke.sh`: drop the `/profiles` block. After `0004`,
  anon has no SELECT grant on `profiles`, so PostgREST returns
  401 *before* RLS even runs — the previously proposed "accept
  empty array" relaxation can't help when the response isn't
  an array. Add a comment near the deleted block recording
  the schema-reachability gap (until step 3 lands an
  authenticated probe, the schema-up check is the manual
  `\dt`/`\dv`/`\df` step in PLAN.md → Verification).
- **Heads-up note** for the next reader: gutting
  `dev_seed.sql` prevents *new* smoke-profile inserts but
  doesn't touch rows already inserted by a prior `seed.sh`
  run; those persist in `public.profiles` until either `0004`
  drops the smoke table in Phase C or the dev DB is rebuilt
  (`docker compose down -v && up -d && ./scripts/migrate.sh`).
  Either is fine; the rows are harmless during the gap, but a
  developer poking the dev DB with `psql` will see them and
  shouldn't be surprised.

**Files:**
- `db/seed/dev_seed.sql` (modify — gut)
- `docs/development.md` (modify — two sections)
- `scripts/smoke.sh` (modify — drop `/profiles` block + comment)

**Steps:**
1. Replace the body of `db/seed/dev_seed.sql` with the
   top-of-file comment described in Decisions.
2. Rewrite the "Seed data" section of `docs/development.md` per
   Decisions.
3. Replace the "Hit the API directly" snippet in
   `docs/development.md` per Decisions.
4. In `scripts/smoke.sh`, remove the `/profiles` curl block
   entirely. Add a comment near where it used to live recording
   the gap and pointing at the manual schema-up check in
   PLAN.md.
5. Run `./scripts/check.sh`: it will **exit non-zero** because of
   the intentional pgTAP reds from A.2. pg_prove exits non-zero
   on any failed assertion; `test-db.sh` runs under `set -euo
   pipefail`, and `check.sh:52` is `./scripts/test-db.sh
   >/dev/null && ok "pg_prove"` — the failure propagates straight
   through. That's expected through Phase A and Phase B. The
   check at this point is qualitative: confirm everything *before*
   `==> database tests (pgTAP)` printed `ok` (svelte-check,
   eslint, prettier, sqlfluff, shellcheck, shfmt), so the red is
   contained to the pgTAP layer and not a stray lint/type/format
   regression we introduced in this task. `./scripts/smoke.sh`
   should still pass against the running stack.

**Verify:** every `check.sh` step before `==> database tests
(pgTAP)` prints `ok` (svelte-check, eslint, prettier, sqlfluff,
shellcheck, shfmt); pgTAP exits non-zero with the expected reds
from A.2 — that's the intended Phase A/B state, not a regression
· `./scripts/smoke.sh` green

**Notes:**
- **Side work — three pre-existing sqlfluff failures fixed properly
  (not suppressed).** The first run of `check.sh` after this task's
  three edits surfaced three sqlfluff fails that pre-dated A.3 but
  blocked the verify line:
  - `db/migrations/0001_init.sql:35` — `GRANT anon, authenticated
    TO authenticator;` (granting role membership to a comma list)
    trips sqlfluff's postgres dialect parser. Split into two
    single-role `GRANT` statements; both parse cleanly, semantics
    unchanged.
  - `db/test-bootstrap.sql:57` — `role text DEFAULT 'authenticated'`
    used the reserved word `role` as an identifier. On audit,
    **nothing in our schema, RLS, triggers, or tests actually
    reads `auth.users.role`** — R19 explicitly says to stub "just
    the columns FKs and triggers touch," and `role` doesn't
    qualify. Dropped the column from the stub and from R19's
    checklist (`REQUIREMENTS.md:288`). This is a real tightening,
    not a workaround.
  - `db/tests/smoke.sql:11` and `db/tests/infra_auth_stub.sql:69`
    — `SELECT * FROM finish();` trips AM04 (unknown column count
    from `*`). pgTAP's `finish()` is callable as a scalar:
    rewrote both as `SELECT finish();`. Removed the `--noqa: AM04`
    I'd added in A.2 — the cleaner form makes the rule
    inapplicable rather than silencing it.
- **`check.sh` does not halt on shellcheck / shfmt / pg_prove
  failures.** Lines 46, 49, and 52 use `cmd && ok "label"` with
  no `|| fail`, so a non-zero exit from those tools just skips
  the `ok` print and the script keeps going — it still prints
  "all checks passed" at the end. Currently visible as info-level
  shellcheck nags (`SC2015`, `SC2016`, `SC2001`) on lines I didn't
  touch in `check.sh`, `smoke.sh`, and `test-db.sh`, plus shfmt
  diffs against the existing `ok()`/`fail()` function definitions.
  These are pre-existing and outside A.3's scope, but flagging for
  the user: the check script's silent-pass behaviour is at odds
  with the way the verify line in this plan reads it, and is worth
  a small follow-up (likely a `/concerns` item or a tiny chore).

## Phase B — bulk red

Phase B writes the spec, in executable form. Most assertions
fail red against the pre-`0004` schema; a small handful of
"absence-of-post-0004-structure" assertions pass vacuously
(e.g. the tombstone-skip step in `triggers_profile_on_signup.sql`
reads zero rows because the smoke `profiles` table never had a
tombstone row) — that's expected. The load-bearing red signal is
the *positive* assertions failing.

Per-file assertion specs and rationale live in **PLAN.md →
Architecture → Test files** (rows by filename). Each Phase B
task below lists the files it covers and inlines a one-line
per-file summary; for the load-bearing assertion details and
"why each assertion exists," follow the matching row of the
PLAN.md inventory.

### [x] B.1 Add list fixtures + `schema_shape.sql` + `constraints_*.sql`

**Created:** 2026-05-09T00:00:00Z
**Completed:** 2026-05-11T09:30:34Z

**Why:** The list fixtures are needed by every later RLS / view
/ trigger test that operates on a multi-member shape. Schema-
shape and constraint tests are the cheapest regression net:
they catch column drops, view/function drops, and CHECK-
constraint regressions at the schema-shape layer rather than
through downstream test failures.

**Prerequisites:** A.1, A.2 (bootstrap, users fixture).

**Decisions:**
- `list_shared_alice_bob.sql` self-includes
  `users_alice_bob_carol.sql` as its first non-comment statement,
  sets `SET LOCAL request.jwt.claims = '{"sub":"<alice-uuid>"}';`
  (attribution-context convention), then issues two direct
  INSERTs:
  ```sql
  INSERT INTO public.lists (id, name)
  VALUES ('11111111-1111-1111-1111-111111111111', 'Shared list')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.list_members (list_id, user_id) VALUES
    ('11111111-1111-1111-1111-111111111111', '<alice>'),
    ('11111111-1111-1111-1111-111111111111', '<bob>')
  ON CONFLICT (list_id, user_id) DO NOTHING;
  ```
  The fixture loads before any `SET LOCAL ROLE`, so both INSERTs
  run as the test session's `cairn` superuser — that bypass is
  what lets the rows land despite the no-INSERT-grant on either
  table. The `tg_set_attribution_*` BEFORE-INSERT triggers still
  fire under cairn and stamp `created_by` from the JWT claim
  (Alice).
- `list_solo_alice.sql` follows the same pattern with literal id
  `'22222222-2222-2222-2222-222222222222'` and only Alice's row in
  `list_members`. Same direct-INSERT shape.
- **Direct INSERT, not RPC.** Fixtures don't call
  `public.create_list()` — that RPC is covered by
  `rpc_create_list.sql` separately. Fixtures should be minimal,
  deterministic, and stupid; one extra `INSERT INTO list_members`
  line beats a `(SELECT id FROM lists WHERE name = …)` lookup
  threaded through every downstream test.
- **Stable UUID literals everywhere** — never `gen_random_uuid()`
  in fixtures (matches `docs/testing.md:262`). Convention by
  table: users `aaaa…`/`bbbb…`/`cccc…`, lists `1111…`/`2222…`,
  items `3333…`/`4444…`/… as needed in per-test setup. Tests
  refer to the list directly by its literal id — `WHERE id =
  '11111111-1111-1111-1111-111111111111'` — without any subquery
  lookup.
- `schema_shape.sql` covers `has_table` for the six new tables,
  `has_column` for every column of each, `has_view` for the
  three views, `has_function` for the **four** functions
  (`public.uid()` `'{}'`, `public.is_list_member(uuid)` `'{uuid}'`,
  `public.is_items_list_member(uuid)` `'{uuid}'` per R25,
  `public.create_list(text, text)` `'{text,text}'`), plus
  `hasnt_column('public', 'list_members', 'added_by')` to lock
  in the rename to `created_by`.
- `constraints_user_settings.sql` covers the `invite_policy`
  CHECK enum (accept `'everybody'`, `'circle'`, `'nobody'`;
  reject anything else). No `constraints_profiles.sql` —
  `profiles` has no CHECK constraints to test in v1.
- `constraints_lists.sql` covers name length 1..200, description
  ≤2000, reject empty name, **NULL `description` accepted** (locks
  in the `description IS NULL OR length(description) <= 2000`
  two-clause CHECK).
- `constraints_items.sql` covers name length 1..500, reject
  empty name.
- `constraints_votes.sql` covers value in [-3,3], value <> 0,
  PK uniqueness, "no vote" = no row, **`created_at` unchanged
  by re-vote** (INSERT, capture, `ON CONFLICT DO UPDATE SET
  value = …`, assert match), **`modified_at` *is* bumped by
  re-vote** (assert post-update modified_at within seconds of
  `now()` and strictly greater than the captured original).

**Files:**
- `db/tests/fixtures/list_shared_alice_bob.sql` (create)
- `db/tests/fixtures/list_solo_alice.sql` (create)
- `db/tests/schema_shape.sql` (create)
- `db/tests/constraints_user_settings.sql` (create)
- `db/tests/constraints_lists.sql` (create)
- `db/tests/constraints_items.sql` (create)
- `db/tests/constraints_votes.sql` (create)

**Reference:** PLAN.md → Architecture → Test files, rows
`schema_shape.sql`, `constraints_user_settings.sql`,
`constraints_lists.sql`, `constraints_items.sql`,
`constraints_votes.sql` for the full per-file assertion specs
including which assertions are load-bearing and why.

**Steps:**
1. RED — Create the two list fixtures per Decisions. Each opens
   with `\i /db/tests/fixtures/users_alice_bob_carol.sql`, then
   `SET LOCAL request.jwt.claims = '{"sub":"<alice-uuid>"}';`,
   then the direct `INSERT INTO public.lists (id, name) VALUES
   …` and `INSERT INTO public.list_members (list_id, user_id)
   VALUES …` block (with the literal UUIDs from Decisions). Both
   INSERTs use `ON CONFLICT … DO NOTHING` for re-include safety.
2. RED — Create the five test files. Each opens with `BEGIN;`,
   `SELECT plan(N);`, the assertions, `SELECT finish();`,
   `ROLLBACK;`. Set `request.jwt.claims` before any
   INSERT into attribution-bearing tables. Tests that need a
   list-shaped fixture `\i` only the most specific list fixture
   they need (the users fixture is auto-included). Refer to the
   list directly by literal id — `WHERE id =
   '11111111-1111-1111-1111-111111111111'` — never via a
   `SELECT id FROM lists WHERE name = …` subquery.
3. RED — Run `./scripts/test-db.sh`. Expect most assertions red
   (tables/views/functions don't exist yet), a small handful
   green (whatever's already true under the pre-0004 schema).

**Verify:** `./scripts/test-db.sh` exits non-zero (expected — the
positive assertions on the post-0004 schema are red because 0004
hasn't landed yet) and the pg_prove output shows the expected red
signal across the new files; `./scripts/check.sh` is correspondingly
red on the pgTAP step but green on every step before it

**Notes:**
- **Deviation — `SET LOCAL request.jwt.claims = '…'` switched to
  `SELECT set_config('request.jwt.claims', '…', TRUE);`.** The
  Decisions section spelled the claim-setting line as the SET-
  statement form, but sqlfluff's postgres parser refuses to parse
  `SET LOCAL` with a dotted parameter name (`request.jwt.claims`),
  failing with a PRS error. The function form is the equivalent
  per-transaction setter and mirrors what `infra_auth_stub.sql`
  already uses. Applied in both list fixtures and
  `constraints_lists.sql`.
- **Deviation — multi-row VALUES split into single-row INSERTs in
  `list_shared_alice_bob.sql`.** The Decisions section showed the
  list_members seed as one `INSERT … VALUES (alice), (bob)` block.
  sqlfluff (postgres dialect) demands a specific stacked-row indent
  for multi-row VALUES that doesn't compose well with stable UUID
  literals; the simplest fix was two single-row INSERTs, mirroring
  `users_alice_bob_carol.sql`'s shape. Same semantics.
- **Phase B red shape worth flagging** — `constraints_items.sql`
  and `constraints_votes.sql` show `Bad plan. You planned N tests
  but ran 0` because the fixture's plain `INSERT INTO public.lists`
  aborts the transaction before any assertion fires. That's still a
  red signal (exit non-zero, test count short) but the diagnostic
  is "transaction aborted" rather than per-assertion "not ok." Both
  files will report individual assertion results once 0004 lands.
- **Phase C heads-up — `modified_at` strict-greater assertion in
  `constraints_votes.sql` requires `clock_timestamp()` (or
  `statement_timestamp()`), not `now()`, in `tg_set_modified_at`.**
  `now()` is transaction-constant, so within a single pgTAP
  `BEGIN … ROLLBACK` the modified_at written by the initial INSERT
  trigger equals the modified_at written by the re-vote UPDATE
  trigger, and `assert post-update > captured original` cannot
  hold. PLAN.md's per-file row in the inventory says "strictly
  greater," so the implementer must pick a wall-clock function for
  the bump trigger. `docs/data-model.md` currently says `now()`
  in the `tg_set_modified_at` paragraph — that doc line will need
  to change in lockstep with the C.1 migration, or it'll diverge
  from the test it must satisfy. Flagging here rather than
  silently relaxing the assertion to `>=`.
- **User correction during this task.** A comment in
  `list_shared_alice_bob.sql` justified the single-row-INSERT split
  by appealing to "human preference for stacked literals" — the
  user pointed out they never expressed that preference, and the
  appeal was fabricated. Comment removed; the file simply mirrors
  `users_alice_bob_carol.sql`'s shape with no further commentary.

### [x] B.2 FK + trigger tests

**Created:** 2026-05-09T00:00:00Z
**Completed:** 2026-05-11T10:03:00Z

**Why:** FK behaviour is load-bearing for `delete_account()`
(step 8): without `SET DEFAULT` repointing attribution to the
tombstone, deleting a user would leave dangling attribution
references. The `tg_set_attribution_*` trigger logic is the
hardest part of `0004` (cascade-aware gating, content-aware
modified_by) — these tests are the regression net for the
risks documented in PLAN.md → Risks #11 and #12.

**Prerequisites:** B.1 (`schema_shape.sql` exists; list
fixtures exist).

**Decisions:**
- `fk_set_default.sql` covers all 7 attribution FKs. Cross-
  actor seed shape is mandatory for the `list_members` legs
  (the `user_id` CASCADE runs *before* `SET DEFAULT` on
  `created_by`/`deleted_by`, so Alice-creates-her-own-membership
  + delete-Alice silently wipes the row before the assertion
  reads it). Seed shape for the three `deleted_by` legs:
  soft-delete the row first under Alice's claims so
  `deleted_by = alice_uid` *before* the cascade test fires.
  Seed shape for `items.modified_by`: `modified_by = alice_uid`
  (not Bob's) so the cascade has a candidate row.
- `fk_cascade.sql` covers the seven CASCADE legs from the doc
  (one assertion each so a regression in any single one
  surfaces independently). The `user_settings` leg is
  load-bearing for `delete_account()`.
- `triggers_profile_on_signup.sql` exercises the trigger via a
  fresh non-fixture `auth.users` INSERT (`id = 'dddddddd-…'`)
  to keep assertions about the *test's* trigger invocation
  rather than the fixture's earlier one. Asserts both inserts
  happen, both skip on tombstone (separately for `profiles` and
  `user_settings` — without separate skip-branch coverage, a
  regression dropping only the user_settings tombstone-skip
  would silently start creating tombstone settings rows, and
  no migration-inserted row would exist for `ON CONFLICT` to
  suppress against).
- `triggers_modified_at.sql` covers all six per-table bindings
  (one bump assertion each), all three cascade-skip legs
  (load-bearing for Risk #12.b), and one positive non-`OF`
  assertion (locks in the `OF`-clause restriction by catching
  a future regression that adds an attribution column to the
  `OF` list).
- `triggers_set_timestamps.sql` covers the universal
  `tg_set_timestamps` trigger across all six tables. Three
  per-table assertions: INSERT-override, UPDATE-freeze
  `created_at`, UPDATE-freeze `modified_at` (the last with
  *only* `modified_at` in the SET list, deliberately not in
  any per-table `tg_set_modified_at` `OF` list, so `t05`'s
  freeze is the only thing standing).
- `triggers_set_attribution.sql` is the largest test file (~22
  assertions). Triangulates every rule across the three
  attribution-bearing tables. Crucially includes the cascade-
  ordering coverage (assertion xi: seed `(created_by=Alice,
  modified_by=Alice)`, delete Alice, assert cascade-order
  independence) — Risk #12's per-rule keying rationale hangs
  on this and assertion (x) only exercises one cascade leg.
- **Role context** for fixture-bearing INSERTs: lists-leg and
  list_members-leg INSERTs run as `cairn` superuser (both
  tables omit the INSERT grant; without the cairn bypass the
  test would hit the GRANT denial and never reach the
  trigger). Items-leg INSERTs can run as `cairn` or
  `authenticated` — pick `cairn` uniformly. Grant-layer
  denials are covered separately in `grants.sql`,
  `rls_lists.sql`, `rls_list_members.sql`.

**Files:**
- `db/tests/fk_set_default.sql` (create)
- `db/tests/fk_cascade.sql` (create)
- `db/tests/triggers_profile_on_signup.sql` (create)
- `db/tests/triggers_modified_at.sql` (create)
- `db/tests/triggers_set_timestamps.sql` (create)
- `db/tests/triggers_set_attribution.sql` (create)

**Reference:** PLAN.md → Architecture → Test files, rows for
each of the six files above. PLAN.md → Risks #11 and #12 for
the rationale behind the cascade-aware gating in
`triggers_set_attribution.sql` and the `OF`-clause
restriction in `triggers_modified_at.sql`.

**Steps:**
1. RED — Create the six test files per Decisions and the
   PLAN.md inventory rows. Use the `list_shared_alice_bob.sql`
   fixture for tests that need a multi-member shape; use
   `list_solo_alice.sql` for tests that need a single-member
   list; use only the users fixture for tests that don't need
   a list.
2. RED — Run `./scripts/test-db.sh`. Expect heavy red across
   these files (tables/triggers don't exist; cascades don't
   cascade).

**Verify:** `./scripts/test-db.sh` exits non-zero (expected) and
the pg_prove output shows the expected red signal across the six
new files; `./scripts/check.sh` red on pgTAP, green before it

**Notes:**
- **Side fix — `.sqlfluff` `large_file_skip_byte_limit` bumped
  from default 20000 to 50000.** `triggers_set_attribution.sql`
  is ~22 KB once written, and sqlfluff silently skips parsing
  any file over the byte limit. The skip is the worst of both
  worlds (no error, no checking), so the file was passing
  vacuously. Bumping the threshold means the linter actually
  parses larger test files; bigger threshold is strictly more
  linting, not less. Future B.3 / C.1 files may also brush this
  limit, so the bump is preventative rather than one-off.
- **`sqlfluff fix` auto-reformatted all six test files' multi-row
  VALUES.** Each `INSERT INTO X (cols) VALUES (a, b, c);` with a
  row body too wide for one line was rewritten by sqlfluff's
  postgres layout rules into the stacked form (opening `(` on
  its own line, each literal indented 2 spaces, closing `)` on
  its own line). The single-row-INSERT shape used in B.1 fixtures
  doesn't apply here because the tests need many columns
  (timestamps add two). Applied uniformly across the six files
  via `sqlfluff fix --force`. Same semantics; just layout.
- **`EPOCH` keyword casing.** `extract(epoch FROM …)` tripped
  CP01 because `epoch` is a keyword inside the EXTRACT syntax;
  `extract` itself stays lowercase (functions policy) but
  `EPOCH` upper. Fixed by sqlfluff fix as well.
- **`(x)` and `(xi)` assertion count.** The PLAN inventory says
  "~22 assertions" for triggers_set_attribution.sql, but
  enumerating the rules-applies-per-table matrix lands at 26 once
  (x) is split into its two-column observation (created_by
  repointed + modified_by preserved) so a regression in either
  half surfaces independently. `plan(26)` and the docstring updated
  to match.
- **Phase B noise pattern continues from B.1.** `fk_set_default`,
  `fk_cascade`, `triggers_modified_at`, `triggers_set_timestamps`,
  `triggers_set_attribution` all show "Bad plan. You planned N
  tests but ran 0" because the included list fixture's `INSERT
  INTO public.lists` aborts the transaction before any assertion
  fires. `triggers_profile_on_signup` doesn't include the list
  fixture (it uses only auth.users), so it gets through assertion
  1 before erroring on the missing `public.user_settings` table.
  All of this is the expected bulk-red — once 0004 lands, the
  fixtures load and individual assertions run.
- **Phase C heads-up reinforced.** B.1's Notes already flagged
  the `now()` vs `clock_timestamp()` issue for `tg_set_modified_at`.
  This task adds three more uses of strict-greater assertions
  that depend on the same resolution: `triggers_modified_at.sql`'s
  six bump-on-content-change assertions (1–6). If the migration
  uses bare `now()`, all six bump assertions stay equal-not-
  greater and fail; the cascade-skip and non-OF assertions are
  unaffected.

### [x] B.3 RPC + grants + RLS tests

**Created:** 2026-05-09T00:00:00Z
**Completed:** 2026-05-11T10:21:31Z

**Why:** RLS is the security boundary; `grants.sql` is the only
mechanical check that the GRANT matrix is correct (the smoke
script's `/profiles` probe is gone, and the magic-link
authenticated probe doesn't land until step 3). Each RLS file
covers both positive and negative cases per the
`CLAUDE.md` rule.

**Prerequisites:** B.1 (fixtures and schema-shape).

**Decisions:**
- `rpc_create_list.sql` covers the happy path (returns a
  `lists` row, `created_by` is Alice, exactly one matching
  `list_members` row), plus the two defence-in-depth body
  guards (`uid() IS NULL` → SQLSTATE `28000` `'not
  authenticated'`; `uid() = tombstone` → SQLSTATE `28000`
  `'cannot act as the tombstone user'`), plus the GRANT-layer
  denial for anon (`throws_ok` `permission denied for function
  create_list` under `SET LOCAL ROLE anon`).
- `grants.sql` covers the full positive matrix, plus
  load-bearing INSERT negatives on the four trigger-only /
  RPC-only tables (lists, list_members, profiles,
  user_settings), plus the EXECUTE negative for anon on
  `create_list`, plus the anon-coverage negatives for every
  (table, verb) and helper function (locks in "anon has no
  access"). The function set is **four**: `public.uid`,
  `public.is_list_member(uuid)`,
  `public.is_items_list_member(uuid)` (R25), and
  `public.create_list(text, text)` — EXECUTE positive for
  authenticated and EXECUTE negative for anon on each.
- `rls_profiles.sql`, `rls_user_settings.sql`, `rls_lists.sql`,
  `rls_list_members.sql`, `rls_items.sql`, `rls_votes.sql` —
  one file per table. Every file ships **per-defence-layer**
  unauthenticated negatives (one for the GRANT layer, one for
  the policy layer) per the convention in `docs/testing.md`'s
  "Database tests" section. Without splitting, a future change
  that adds an INSERT/DELETE grant *or* a permissive policy
  would silently re-open a footgun while still passing a
  single combined check.
- **Critical role-context rule for the policy-layer negative
  legs**: don't run the leg as `cairn`. Cairn is both the
  cluster superuser and the table owner, exempt from RLS unless
  `FORCE ROW LEVEL SECURITY` is set (it isn't). Run under
  `SET LOCAL ROLE authenticated` with claims set, after
  granting the missing privilege inside the test's
  `BEGIN ... ROLLBACK` (the GRANT is rolled back at file
  end). Otherwise the INSERT/DELETE would silently succeed and
  the policy-layer leg wouldn't actually exercise the policy.
- `rls_list_members.sql` ships two extra `throws_ok`
  assertions for the `tg_freeze_list_members_pk` trigger
  (Risk #13). Run them under Alice's claims (a live member),
  not as `cairn`. The freeze fires for both, but only the
  `authenticated` role exercises the policy layer that we
  want to lock in as "policy lets it through, only the freeze
  catches it."
- `rls_votes.sql` ships a load-bearing positive assertion that
  members can SELECT votes on a *soft-deleted* item (locks in
  the doc's deliberate "historical votes remain visible" rule,
  which only works because `votes_select` calls
  `public.is_items_list_member(uuid)` — a SECURITY DEFINER
  helper that bypasses `items_select`'s recursive
  `deleted_at IS NULL` filter; an inline `EXISTS … FROM
  items …` would silently fail this assertion, see PLAN.md
  Risk #14). Plus mirrored INSERT/UPDATE negatives for
  soft-deleted items.

**Files:**
- `db/tests/rpc_create_list.sql` (create)
- `db/tests/grants.sql` (create)
- `db/tests/rls_profiles.sql` (create)
- `db/tests/rls_user_settings.sql` (create)
- `db/tests/rls_lists.sql` (create)
- `db/tests/rls_list_members.sql` (create)
- `db/tests/rls_items.sql` (create)
- `db/tests/rls_votes.sql` (create)

**Reference:** PLAN.md → Architecture → Test files, rows for
each of the eight files above. PLAN.md → Risk #13 for the
PK-freeze rationale in `rls_list_members.sql`.

**Steps:**
1. RED — Create the eight test files per Decisions and the
   PLAN.md inventory rows. Apply the role-context rule
   carefully: per-defence-layer negatives must run under
   `authenticated`, not `cairn`. The same rule applies to the
   `tg_freeze_list_members_pk` assertions.
2. RED — Run `./scripts/test-db.sh`. Expect heavy red.

**Verify:** `./scripts/test-db.sh` exits non-zero (expected) and
the pg_prove output shows the expected red signal across the
eight new files; `./scripts/check.sh` red on pgTAP, green before
it

**Notes:**
- **Deviation — `has_table_privilege` / `has_function_privilege`
  wrapped in `ok()`.** PLAN inventory implied pgTAP-native
  wrappers like `has_table_privilege(role, table, privilege,
  description)`, but pgTAP doesn't ship a 4-arg description
  wrapper for these — only the Postgres built-in (3-arg,
  boolean-returning) exists. Rewrote `grants.sql` as `SELECT
  ok(has_table_privilege(role, table, priv), 'description')` /
  `SELECT ok(NOT has_table_privilege(...), '…')` throughout. Same
  semantics; idiomatic pgTAP shape for boolean predicates.
  Surfaced after a Phase B run errored with `function
  has_table_privilege(unknown, unknown, unknown, unknown) does
  not exist` — Postgres couldn't resolve from string literals
  alone.
- **Deviation — `rpc_create_list.sql` temp-table SELECT names
  columns explicitly.** `SELECT *` from `create_list()` returns
  a `lists` row whose column list sqlfluff can't statically
  resolve (the function doesn't yet exist in Phase B and
  references it as a string), tripping AM04 (ambiguous column
  count). Narrowed to `SELECT id, created_by FROM
  public.create_list(…)` — the two columns the assertions
  actually read. Cleaner anyway.
- **DELETE policy-layer denial is silent, not throwing.** PLAN
  phrased "DELETE-denied assertions per defence layer" but RLS
  with no DELETE policy doesn't throw on DELETE — it filters
  the row via USING (defaulting to false) and the DELETE
  returns 0 rows. Implemented the policy-layer leg as
  "post-attempt count of the targeted row = 1" (the row
  survives) rather than `throws_ok`. The GRANT-layer leg still
  uses `throws_ok 42501` because the GRANT check is decision-
  time and does raise. Same shape applies to `rls_lists.sql`
  and `rls_items.sql`.
- **Kicked-user self-restore footgun**: `list_members_update`
  USING is `is_list_member(list_id)` only; the `OR user_id =
  public.uid()` is only in WITH CHECK. So a kicked Bob can't
  even *see* his own row through USING — the self-restore
  UPDATE matches 0 rows. Tested explicitly so a future
  regression that adds the OR clause to USING (and re-opens
  self-restore) reds here.
- **`tg_freeze_list_members_pk` assertions run under Alice
  (live member), not `cairn`.** As PLAN warned: running these
  as cairn would still fire the freeze (triggers aren't RLS-
  bypassed) but skip the policy layer. The assertion we want is
  "policy lets the self-row PATCH through, only the freeze
  catches it" — only `authenticated` exercises that path. Both
  freeze assertions need a second list for the `SET list_id`
  target, so the file includes both the shared and solo
  fixtures.
- **Phase B noise pattern continues.** Most of the eight new
  files show "Bad plan. You planned N tests but ran 0" because
  the shared fixture's `INSERT INTO public.lists` aborts before
  any assertion fires. `grants.sql` and `rls_profiles.sql` run
  partway because they don't include the list fixture — they
  red on whatever pre-0004 schema gap they hit first (smoke
  `profiles` still exists, but `user_settings` does not, etc.).

### [x] B.4 View tests

**Created:** 2026-05-09T00:00:00Z
**Completed:** 2026-05-11T10:29:10Z

**Why:** The trash views (`items_deleted`, `lists_deleted`)
run `security_invoker = false`, bypassing RLS — their only
authorization gate is the explicit `is_list_member()` filter
in the view body. The "non-member sees zero rows" and
"soft-removed (former) member sees zero rows" assertions are
load-bearing because they are the only thing standing between
a future refactor and re-exposure of every list's trash to
every authenticated user.

**Prerequisites:** B.1 (fixtures and schema-shape).

**Decisions:**
- `views_items_ranked.sql` exercises the live, RLS-inheriting
  view: score = sum, positive/negative/total voters counts,
  soft-deleted items excluded, no-votes item has score = 0,
  non-member sees nothing.
- `views_items_deleted.sql` and `views_lists_deleted.sql` are
  the trash views. Each ships:
  - "only soft-deleted rows visible to a current member"
  - **"non-member sees zero rows"** — load-bearing
  - **"soft-removed (former) member sees zero rows"** — load-
    bearing companion locking in `is_list_member()`'s
    `deleted_at IS NULL` clause (per `docs/data-model.md:307`).
    Without this, a regression dropping the membership-
    deleted-at filter would silently re-expose every list's
    trash to every ex-member.
  - column-shape pinning via `has_column` for each column the
    trash UI reads. Without this, a future refactor dropping
    a column from the view body wouldn't red here, and
    `schema_shape.sql`'s view-presence assertions only check
    the view exists, not its shape.

**Files:**
- `db/tests/views_items_ranked.sql` (create)
- `db/tests/views_items_deleted.sql` (create)
- `db/tests/views_lists_deleted.sql` (create)

**Reference:** PLAN.md → Architecture → Test files, rows for
each of the three files. PLAN.md → Risk #8 for the
soft-delete-unreachability rationale.

**Steps:**
1. RED — Create the three view test files per Decisions and the
   PLAN.md inventory rows.
2. RED — Run `./scripts/test-db.sh`. Expect red across these
   files (views don't exist yet). End of Phase B —
   `./scripts/test-db.sh` should report a large set of failing
   assertions; this is the spec, in executable form.

**Verify:** `./scripts/test-db.sh` exits non-zero (expected — end
of Phase B's bulk-red state) and the pg_prove output shows the
expected red signal across the three new view test files;
`./scripts/check.sh` red on pgTAP, green before it

## Phase C — green

### [ ] C.1 Write `db/migrations/0004_domain_schema.sql` and update `migrate.sh` + `.env.example`

**Created:** 2026-05-09T00:00:00Z
**Completed:**

**Why:** The migration is the single artifact that takes the
suite from red to green. Every test in Phase B describes a
property `0004` must satisfy. `migrate.sh` and `.env.example`
update in the same commit so the dev path stays runnable.

**Prerequisites:** All of Phase A and Phase B (the suite is in
its bulk-red state; everything `0004` ships is exercised by an
existing test).

**Decisions:**
- One file, top-to-bottom, wrapped in `BEGIN; … COMMIT;`. No
  churn, no half-applied intermediate state. Body order
  follows PLAN.md → Architecture → New files →
  `0004_domain_schema.sql` (steps 1–15).
- Each `CREATE TABLE` is **immediately** followed by `ALTER
  TABLE … ENABLE ROW LEVEL SECURITY`, in the same logical
  step. Issuing the ALTER right after CREATE means tables are
  RLS-on the moment they exist; if the migration aborts mid-
  file there's no half-enabled window.
- The smoke-`profiles` DROP is gated on `to_regclass(
  'public.user_settings') IS NULL` — the cheapest unambiguous
  "post-0004 schema not yet in place" sentinel. Don't gate on
  a column-shape predicate against `profiles`: under the
  privacy split, the new `profiles` table is shape-compatible
  with the smoke `profiles` for any straightforward column
  predicate, and a wrong predicate would irreversibly drop
  real data. The guard's only job is to prevent the
  irreversible DROP; it is *not* a back door to making `0004`
  re-runnable (the `CREATE TABLE` statements below it will
  fail on a second run regardless). Inline migration comment
  spells this out for the next reader.
- `tg_profile_on_signup` writes `INSERT INTO
  public.user_settings (id, invite_policy) VALUES (NEW.id,
  'everybody')` — explicit value, not bare `INSERT … (id)`
  leaning on the column DEFAULT (see PLAN.md Decisions).
- Trigger function names un-prefixed (`tg_*`); bindings
  prefixed (`t01_*`, `t05_*`, `t10_*`, `t20_*`) to lock the
  alphabetical firing order. Three orderings are load-bearing
  per Risk #3.
- Three small per-table attribution functions, not one
  branching on `TG_TABLE_NAME`. The `items` function carries
  the content-aware `modified_by` gate (Risk #12.a); each
  attribution function carries the deleted_by transition
  IF/ELSIF/ELSE chain.
- `public.is_items_list_member(target_item uuid)` (R25) lands
  immediately after `public.is_list_member(target_list uuid)`
  in the migration body — same shape (`language sql stable
  security definer set search_path = public`), body wraps an
  `is_list_member(i.list_id)` call so the items reference
  inside it bypasses `items_select`'s recursive RLS. The
  `security definer` is what makes the helper exist (PLAN.md
  Risk #14): `votes_select` calls it instead of an inline
  `EXISTS (SELECT 1 FROM public.items …)` so historical votes
  on soft-deleted items remain visible. `votes_insert` /
  `votes_update` deliberately *don't* call the helper — they
  keep the inline subquery so items_select's `deleted_at`
  filter applies recursively, which is the desired closure for
  cast/change.
- `tg_set_attribution_items` content-detection uses **row-wise
  `IS DISTINCT FROM`**: the gate is `(NEW.list_id, NEW.name,
  NEW.notes, NEW.deleted_at) IS DISTINCT FROM (OLD.list_id,
  OLD.name, OLD.notes, OLD.deleted_at)`, not a boolean-OR of
  per-column `IS DISTINCT FROM` (both forms are null-safe; the
  row form is shorter and keeps the maintenance contract as a
  single tuple).
- `CREATE TRIGGER tg_profile_on_signup ON auth.users` ships
  with an inline comment cross-linking
  `docs/account-deletion.md:53`'s post-image-bump checklist
  (PLAN.md Risk #15). The risk: a future `supabase/gotrue` image
  bump that handles a schema change by `DROP TABLE auth.users;
  CREATE TABLE auth.users …` silently takes our trigger with it,
  and new signups land without `profiles` / `user_settings`
  rows. The comment is two lines on the binding; it's a diff
  signpost for the next image-bump PR, not a runtime check.
- `tg_set_attribution_items` carries an inline comment
  spelling out the **maintenance contract** for the content-
  detection tuple (`NEW.list_id, NEW.name, NEW.notes,
  NEW.deleted_at`): a future migration adding a payload column
  must extend the tuple in lockstep, or edits to the new
  column will silently no-op `modified_by`. Mirror the
  contract in `docs/data-model.md`'s Triggers section.
- `create_list()` body in order: `uid() IS NULL` guard →
  tombstone-UID guard → INSERT into `lists` → INSERT matching
  `list_members` row → RETURN. The `security definer`
  attribute is what lets the underlying writes succeed despite
  the missing GRANTs.
- Function grants: `REVOKE EXECUTE … FROM PUBLIC` *first*,
  then `GRANT EXECUTE … TO authenticated`. Postgres grants
  EXECUTE to PUBLIC by default; the revoke-first-then-grant
  pattern means a future SECURITY DEFINER helper added to
  this schema with a sensitive body doesn't inherit an
  unsafe default.
- `scripts/migrate.sh` updates: filename-gated `auth.users`
  poll for migrations numbered ≥ 0004 (skip for 0001–0003 so
  the gotrue-role creation chain doesn't deadlock); cap via
  `MIGRATE_AUTH_USERS_TIMEOUT` env var (default 60s); after
  the loop, `NOTIFY pgrst, 'reload schema'`. Use
  `10#$prefix` to force base-10 parsing so a leading zero
  doesn't get mistaken for octal.
- `.env.example`: add a single commented line for
  `MIGRATE_AUTH_USERS_TIMEOUT`, e.g. `# MIGRATE_AUTH_USERS_TIMEOUT=60
  # bump if your machine is slow to start GoTrue`. Same commit
  as the `migrate.sh` change.

**Files:**
- `db/migrations/0004_domain_schema.sql` (create)
- `scripts/migrate.sh` (modify — gated poll + schema reload)
- `.env.example` (modify — add `MIGRATE_AUTH_USERS_TIMEOUT`
  comment)
- `docs/data-model.md` (modify — mirror the
  `tg_set_attribution_items` maintenance contract in the
  Triggers section)

**Reference:** PLAN.md → Architecture → New files →
`0004_domain_schema.sql` for the full body order. PLAN.md →
Decisions for the rationale behind several non-obvious shapes
(explicit `invite_policy`, asymmetric `security_invoker`,
RPC-only list creation). PLAN.md → Risks #3, #11, #12, #13 for
load-bearing trigger / view / freeze rationale.

**Steps:**
1. GREEN — Write `db/migrations/0004_domain_schema.sql`
   top-to-bottom per the body order in PLAN.md → Architecture.
   Wrap in `BEGIN; … COMMIT;`. After each `CREATE TABLE`,
   issue `ALTER TABLE … ENABLE ROW LEVEL SECURITY` in the same
   step.
2. GREEN — Update `scripts/migrate.sh`: inside the `for f in
   db/migrations/*.sql; do` loop, immediately after the
   skip-if-already-applied check and before the `applying $name`
   echo, insert the prefix-gated `auth.users` poll. The
   load-bearing details: `10#$prefix` forces base-10 parsing so
   a leading-zero filename (`0010_foo.sql`) doesn't get parsed
   as octal; the `while !` form keeps `set -e` happy because the
   condition's exit status is "checked" rather than the script's
   exit status; the `grep -q '^t$'` matches the literal `t` that
   `psql -tAc` prints for a true `to_regclass(...) IS NOT NULL`
   (any non-empty / non-`t` output, including the `f` for false,
   re-enters the loop). Worked shape:
   ```bash
   prefix="${name%%_*}"
   if [ "$((10#$prefix))" -ge 4 ]; then
     start=$SECONDS
     timeout="${MIGRATE_AUTH_USERS_TIMEOUT:-60}"
     while ! "${PSQL[@]}" -tAc \
       "SELECT to_regclass('auth.users') IS NOT NULL" \
       2>/dev/null | grep -q '^t$'; do
       if [ $((SECONDS - start)) -ge "$timeout" ]; then
         echo "timed out after ${timeout}s waiting for auth.users." >&2
         echo "hint: check 'docker compose logs gotrue'." >&2
         exit 1
       fi
       sleep 1
     done
   fi
   ```
   After the migration loop ends and before the final
   `migrations up to date` echo: `"${PSQL[@]}" -c "NOTIFY pgrst,
   'reload schema'" >/dev/null`.
3. GREEN — Add the commented `MIGRATE_AUTH_USERS_TIMEOUT` line
   to `.env.example`.
4. GREEN — Mirror the `tg_set_attribution_items` maintenance
   contract in `docs/data-model.md`'s Triggers section (one
   short paragraph; the comment in the migration is canonical,
   the doc is the cross-reference).
5. GREEN — Run `./scripts/test-db.sh`. Iterate until green.
   The cycle is fast (under a second per run); aim for green
   in one or two passes.
6. GREEN — Run `./scripts/migrate.sh` against the dev stack
   (`docker compose up -d` first if needed) and confirm the
   schema-cache reload makes the new tables visible without a
   container bounce. Run `./scripts/smoke.sh` (without the
   `/profiles` probe) to confirm the service mesh is up.

**Verify:** `./scripts/test-db.sh` all green ·
`./scripts/migrate.sh` applies cleanly against a fresh dev DB
· `./scripts/smoke.sh` green · manual `psql -U cairn -d cairn
-c "\dt public.*"` shows the six tables, `\dv public.*` shows
three views, `\df public.*` shows `is_list_member` and `uid`
in `public`

## Phase D — clean up

### [ ] D.1 Delete `db/tests/smoke.sql`, run the full check, tick step 1 in the master plan

**Created:** 2026-05-09T00:00:00Z
**Completed:**

**Why:** `db/tests/smoke.sql` is superseded by
`infra_auth_stub.sql` (which proves the same things plus the
gated `public.uid()` and the tombstone). Removing it is the
final cleanup — the suite, the dev path, and the docs are now
consistent with the post-0004 contract. Ticking the step 1
checkbox in the master plan signals the work merged.

**Prerequisites:** C.1 (suite is fully green; migration applies
to dev DB).

**Decisions:**
- The full gauntlet must pass: sqlfluff (run `sqlfluff lint
  db/` before claiming green; lefthook also enforces on
  commit), shellcheck, shfmt, vitest, pg_prove, prettier,
  svelte-check.
- `dev_seed.sql` was already gutted in A.3; there's no
  additional dev_seed cleanup here.

**Files:**
- `db/tests/smoke.sql` (delete)
- `plans/0000_implementation_order.md` (modify — tick step 1)

**Steps:**
1. Delete `db/tests/smoke.sql`.
2. Run `./scripts/check.sh`. Confirm full-gauntlet green.
3. In `plans/0000_implementation_order.md`, change step 1's
   `[ ]` to `[x]`.

**Verify:** `./scripts/check.sh` all green
