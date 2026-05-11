---
name: writing-sql
description: Conventions and gotchas for writing SQL in Cairn — sqlfluff workarounds, pgTAP conventions, SQLSTATE cheat sheet, role context, RLS defence-in-depth, trigger time semantics, cascade-test seeds.
paths: db/**/*.sql
---

# Writing SQL

Conventions and gotchas for SQL work in Cairn — migrations, pgTAP
tests, fixtures, seed. Read this before writing the first line of
SQL in a session; rules-of-thumb here are the kind of thing that
isn't catch-able by a single linter run.

Canonical references: `docs/data-model.md` (schema, RLS, triggers,
views), `docs/testing.md` (pgTAP layer), `docs/quality.md`
(lint/format toolchain), `.sqlfluff` at the repo root.

## When to use this skill

- Writing or modifying anything under `db/` — migrations, tests,
  fixtures, seed.
- Adding a pgTAP test for a new table, policy, trigger, view, or RPC.
- Investigating a sqlfluff failure or an opaque pgTAP red.

## Lint surface — sqlfluff

Style is owned by sqlfluff (postgres dialect, 2-space indent,
keywords UPPER, identifiers lower, literals UPPER). Don't hand-
format against it — run the formatter and accept the diff.

Per-line `--noqa: <rule>` justified by an inline comment is fine
when the rule genuinely doesn't apply; global disables (in
`.sqlfluff` or whole-file `--disable_rules`) are not.

### Gotchas the postgres parser can't handle cleanly

These are valid SQL that sqlfluff trips on. Pick the alternative
form rather than `--noqa`-ing the rule, since the workaround is
load-bearing for the parser rather than for the dialect.

- **`SET LOCAL` with a dotted GUC name.** `SET LOCAL
  request.jwt.claims = '…'` fails with a PRS error. Use the
  function form: `SELECT set_config('request.jwt.claims', '…',
  TRUE);` — third arg `TRUE` is the `is_local` flag, equivalent
  to `SET LOCAL`.
- **Multi-role `GRANT … TO …`.** `GRANT anon, authenticated TO
  authenticator;` trips the parser. Split into two single-role
  GRANT statements. Semantics unchanged.
- **Reserved words as unquoted identifiers.** `role` is the most
  common offender (a column named `role` fails to parse). Rename
  the column, or quote it (`"role"`) — renaming is usually the
  cheaper fix.
- **Multi-row `INSERT … VALUES (a), (b)` with stacked literals.**
  sqlfluff's layout rules demand a specific indent for multi-row
  VALUES that doesn't compose well with stable UUID fixtures.
  Either accept the verbose layout the linter writes, or split
  into one single-row INSERT per row (the shape
  `users_alice_bob_carol.sql` and `list_shared_alice_bob.sql`
  use).
- **Comments containing the linter's own name.** sqlfluff parses
  any comment containing the literal token *sqlfluff* as an
  attempted inline config statement and emits a WARNING. Reword
  to "the SQL linter" or similar in code comments.

### Rules that catch real issues (fix the code, not the rule)

- **AM04 on `SELECT * FROM finish();`.** pgTAP's `finish()` is
  callable as a scalar — `SELECT finish();` is shorter and
  doesn't trip the rule. Same applies to other pgTAP functions
  used in `SELECT *` form.
- **References-keywords (`aliases` policy).** Table aliases are
  required when joining; bare table names in JOINed queries get
  flagged.

## pgTAP — test-file conventions

Every `db/tests/*.sql` file:

1. Opens with `BEGIN;`.
2. Declares its plan early: `SELECT plan(N);` — anchored to start
   of line, since `scripts/test-db.sh`'s plan-declaration guard
   matches `^[[:space:]]*SELECT[[:space:]]+plan[[:space:]]*\(`.
3. Runs assertions.
4. Closes with `SELECT finish();` then `ROLLBACK;`.

Each file owns its own transaction. Nothing persists between
tests; fixtures load fresh inside each transaction's `BEGIN …
ROLLBACK`.

### Fixtures

- Live in `db/tests/fixtures/`. Skipped by pg_prove (which scans
  only top-level `db/tests/*.sql` by default), so they don't
  need `SELECT plan(N)`.
- No `BEGIN;` / `COMMIT;` inside a fixture — the including
  test's transaction wraps it.
- Use **absolute paths**: `\i /db/tests/fixtures/<name>.sql`.
  pg_prove runs inside the postgres container with WORKDIR `/`;
  the host `./db` is mounted at `/db`, so a relative path
  resolves to `/fixtures/...` and the include fails silently.
- Stable UUID literals only — never `gen_random_uuid()`. Convention
  by table: users `aaaa…`/`bbbb…`/`cccc…`, lists
  `1111…`/`2222…`, items `3333…`/`4444…`.
- `INSERT … ON CONFLICT (id) DO NOTHING` so re-inclusion is a
  no-op within the same transaction.

### JWT claims and attribution-bearing inserts

Any INSERT into `lists`, `items`, or `list_members` runs the
`tg_set_attribution_*` BEFORE-INSERT triggers, which read
`public.uid()` from `request.jwt.claims` and write `created_by`.
A NULL claim fails the row's NOT NULL — so claims must be set
*before* the INSERT.

```sql
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
```

`SET LOCAL` semantics: scoped to the surrounding transaction, so
test isolation is automatic. Subsequent calls in the same
transaction overwrite (e.g., switching from "act as Alice" to
"act as Carol" mid-file).

### Role context

- **`cairn`** — the cluster superuser. Owns every table; bypasses
  RLS unless `FORCE ROW LEVEL SECURITY` is set (it isn't on any
  Cairn table). Use for fixture INSERTs and for any setup that
  shouldn't be re-implemented per role.
- **`authenticated`** — the role real users land in. Exercises
  RLS policies. Switch via `SET LOCAL ROLE authenticated;`.
- **`anon`** — the unauthenticated role. Switch via `SET LOCAL
  ROLE anon;`. Hits the GRANT layer (PostgREST denies anon on
  every new-table verb) before RLS gets a chance.

**Critical: don't run policy-layer negatives as `cairn`.** A
test that wants to verify "RLS denies an authenticated INSERT"
must switch to `authenticated` first — under `cairn` the insert
silently succeeds (superuser bypass), and the assertion is a
false-green.

### Gated assertions for forward compatibility

When a test file must work both before and after a migration
lands (e.g., `infra_auth_stub.sql` across Phase A and Phase C),
gate the migration-dependent assertions:

```sql
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM pg_proc
  WHERE proname = 'uid' AND pronamespace = 'public'::regnamespace
) THEN is(
  pg_temp.uid_or_zero(),
  'aaaaaaaa-…'::uuid,
  'public.uid() returns the JWT sub claim'
) ELSE skip('public.uid() not defined yet (pre-0004)', 1) END;
```

Both branches are statement-level pgTAP so the plan counter
advances cleanly in either phase. Avoid `DO $$ … PERFORM
skip(…); … END$$` — counter behaviour inside DO blocks is
unreliable in pg_prove.

For function references that would fail at parse time when the
function doesn't exist (e.g., `public.uid()` in Phase A), wrap
the call in a `pg_temp.<shim>()` plpgsql function with
`EXCEPTION WHEN undefined_function THEN RETURN NULL;`. Plpgsql
defers symbol resolution to call time.

### `lives_ok` / `throws_ok` are savepoint-safe

Both wrap their query in an internal SAVEPOINT. A failed query
inside is contained — the transaction stays usable. Plain
INSERT *outside* one of these wrappers can abort the transaction
on error (Phase B / pre-migration runs commonly hit this when a
table doesn't yet exist), turning every subsequent assertion
into "current transaction is aborted." Diagnostic noise but
still red, just opaque.

## SQLSTATE cheat sheet for `throws_ok`

`throws_ok(query, sqlstate, errmsg_or_null, name)` — pin the
sqlstate; pass `NULL` for `errmsg` unless the exact text is
load-bearing (it usually isn't — exact wording varies across
postgres versions).

| SQLSTATE | Name | Typical use |
|---|---|---|
| 23502 | not_null_violation | NOT NULL column got NULL |
| 23503 | foreign_key_violation | FK target row missing |
| 23505 | unique_violation | PK/unique-index duplicate |
| 23514 | check_violation | CHECK constraint failed |
| 42501 | insufficient_privilege | GRANT-layer denial |
| 42P01 | undefined_table | table doesn't exist (Phase B reds) |
| 28000 | invalid_authorization_specification | RPC body's `not authenticated` / `tombstone-user` guards |
| P0001 | raise_exception | PL/pgSQL `RAISE` without an explicit SQLSTATE (the freeze triggers, custom error helpers) |

## RLS testing — defence in depth

Per `CLAUDE.md`'s "Tests and quality (non-negotiable)" rule, every
policy ships with positive AND negative coverage.

**Per-defence-layer unauthenticated negatives** — one for each
layer that should deny the call, in the same test file:

- GRANT layer: under `SET LOCAL ROLE anon`, `throws_ok …
  SQLSTATE 42501`.
- Policy layer: under `SET LOCAL ROLE authenticated` with
  `request.jwt.claims` *not set*, `is(count, 0)` — exercises the
  policy body itself.

Without splitting, a future change that adds an INSERT grant *or*
adds a permissive policy can silently re-open a footgun while the
combined check still passes. Splitting is the whole point.

For INSERT/DELETE policy-layer negatives that need a privilege
the test session doesn't have, `GRANT … TO authenticated;` inside
the test's `BEGIN … ROLLBACK` — the GRANT rolls back at file end.

## Triggers and time

- `now()` (and its aliases `current_timestamp`,
  `transaction_timestamp()`) returns the **transaction start**.
  Within a single pgTAP `BEGIN … ROLLBACK`, every call returns
  the same value. Two trigger fires within one transaction read
  the same `now()`.
- `statement_timestamp()` returns the start of the **current
  statement** — advances between statements within a transaction.
- `clock_timestamp()` returns the actual wall-clock time —
  advances within a statement.

**Implication for `tg_set_modified_at`.** If a test asserts
"modified_at strictly greater than its captured original after a
re-INSERT-ON-CONFLICT" (e.g., `constraints_votes.sql`'s re-vote
assertion), the trigger must use `clock_timestamp()` or
`statement_timestamp()` — `now()` will make the two values equal
and the assertion will fail. `created_at` is fine with `now()`
because it's set once on INSERT and frozen on UPDATE.

`docs/data-model.md`'s trigger paragraphs use `now()` informally;
that wording will need to drift toward `clock_timestamp()` as the
test surface lands.

## Trigger / cascade testing

- **`ON DELETE SET DEFAULT` on `created_by` / `deleted_by`** — the
  account-deletion mechanism. Test seeds must use a *cross-actor*
  shape: if Alice-creates-Alice's-own-membership-row, deleting
  Alice fires the `list_members.user_id` CASCADE *first* and the
  row vanishes before the `SET DEFAULT` on `created_by` runs.
  Make the row's `user_id` someone other than the user under
  test.
- **`deleted_by` seeds for cascade tests** — soft-delete the row
  first under the would-be-deleted user's claims, so the BEFORE-
  UPDATE trigger fills `deleted_by` automatically. Then delete
  the user and assert `deleted_by = tombstone`.
- **Trigger binding prefix locks firing order.** `t01_*` < `t05_*`
  < `t10_*` < `t20_*`. Tests that depend on ordering should refer
  to the prefix, not the function name (function names are
  unprefixed; bindings are prefixed).

## Don't bend the rules to get green

- A lint rule, type check, or RLS policy is right or your code is
  wrong; figure out which. Per-line `--noqa: <rule>` justified by
  inline comment is fine. Global disables are not.
- Never weaken an RLS policy or drop a constraint to push a change
  through. RLS is the security boundary; weakening it is a
  regression even if every test passes.
- Never `GRANT … TO PUBLIC` casually — Postgres grants EXECUTE to
  PUBLIC by default on new functions, so the canonical pattern
  for SECURITY DEFINER helpers is `REVOKE EXECUTE … FROM PUBLIC;`
  *then* `GRANT EXECUTE … TO authenticated;`.

## Cross-references

- `docs/data-model.md` — canonical schema, RLS, triggers, views.
  Every `CREATE` statement in a migration mirrors this doc.
- `docs/testing.md` → "Database tests (pgTAP)" — fixture rules,
  worked test example, the three pgTAP conventions.
- `docs/quality.md` — toolchain (sqlfluff, lefthook, etc.) and
  the "no global disables" rule.
- `db/test-bootstrap.sql` — the auth.users stub the test DB needs;
  any new `auth.users` column referenced by a migration must
  extend the stub at the same time.
