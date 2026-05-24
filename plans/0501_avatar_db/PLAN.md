# Plan: Avatar DB foundation

A single migration adds the `avatar_version` column, three security-definer
RPCs, and a trigger rebind to `public.profiles`, giving the upload sidecar
(0502) and the frontend (0503) a stable DB contract to build against.

## Context

`profiles` currently has four columns: `id`, `display_name`, `created_at`,
`modified_at`. The `t20_set_modified_at` trigger fires only on `display_name`
changes. The RLS policies on `profiles` allow the owning user to SELECT and
UPDATE their own row, but direct column writes are unrestricted for the
`authenticated` role.

The avatar feature introduces three new write paths (upload, remove, rename)
that must each be narrowly scoped to the caller's own row and must update
`modified_at`. Using `SECURITY DEFINER` RPCs instead of direct PATCH achieves
this without tightening the general UPDATE policy (which would need a full
column-list audit to avoid breaking existing callers) and makes each operation
an atomic, named unit the sidecar and frontend can call.

The migration is numbered `0007` — migrations `0001`–`0006` already occupy the
prior slots.

## Decisions

**Single migration, not additive migrations.** All five schema changes (column,
three RPCs, trigger) land in `0007_avatars.sql`. They form a logical unit: the
trigger rebind depends on the column existing, the RPCs depend on the column
existing, and they all belong to the same feature. Splitting them across
multiple migration files would add deploy ordering complexity for no benefit.

**`SECURITY DEFINER` RPCs over direct PATCH.** Three alternatives were
considered: (a) direct `PATCH /profiles` — allows the frontend to write any
column, including ones that shouldn't be user-writable; (b) tightened UPDATE
RLS policy with a column list — possible but requires a careful audit of every
existing `PATCH` caller; (c) `SECURITY DEFINER` RPCs — each function is a
named, narrowly-scoped operation, self-documenting, callable by PostgREST at
`POST /rpc/<name>`, and the authorization boundary is `WHERE id =
public.uid()` inside the function body. Option (c) wins on safety and clarity.
It matches the pattern already used by `public.create_list()`.

**`plpgsql` for `set_display_name`, `sql` for the others.** `bump_avatar_version`
and `clear_avatar` are pure UPDATE-and-return; `language sql` is fine.
`set_display_name` needs to trim, validate length, and raise an error — that
requires `plpgsql`. Using a DECLARE block for the trimmed value avoids calling
`trim()` twice.

**Trigger rebind via DROP + CREATE.** Postgres `ALTER TRIGGER` can only rename a
trigger, not change its `OF` column list. The migration therefore does
`DROP TRIGGER t20_set_modified_at ON public.profiles` followed by
`CREATE TRIGGER` with the extended `OF display_name, avatar_version` clause.
This is idempotent within a migration (applied once) and avoids schema-diff
confusion if the migration is ever re-run against a fresh DB.

**`ERRCODE = 'check_violation'` (SQLSTATE `23514`) for `set_display_name`
validation.** Callers (the sidecar and the frontend) can detect the specific
error class. PostgREST surfaces the SQLSTATE verbatim in its 400 response body,
so the frontend can distinguish a validation error from, say, a network error.

**Column physical position.** `ALTER TABLE ADD COLUMN` appends the column after
`modified_at` in physical storage. The Cairn convention ("payload columns before
timestamps") governs new `CREATE TABLE` statements and `\d` canonical form, not
the physical order after ALTER. The position is immaterial to correctness.

## Architecture

### New files

- **`db/migrations/0007_avatars.sql`** — column, three RPCs + grants, trigger
  rebind.
- **`db/tests/avatars.sql`** — pgTAP test file covering R6: column default,
  RPC behaviours, trigger fires, CHECK constraint, cross-user isolation.

### Modified files

- **`db/tests/schema_shape.sql`** — add `has_column` assertion for
  `profiles.avatar_version`.
- **`db/tests/grants.sql`** — add EXECUTE grant/denial assertions for the
  three new RPCs.
- **`db/tests/triggers_modified_at.sql`** — add test that `t20_set_modified_at`
  fires on `avatar_version` UPDATE.

## Phase structure

0. **Phase 0 — Doc reconciliation.** Two doc gaps must close before the
   migration is written: `docs/avatars.md` misstates column physical position
   (says "before `created_at`" — `ALTER TABLE ADD COLUMN` always appends);
   and `set_display_name` is absent from both `docs/avatars.md` and
   `docs/data-model.md`'s "What the app sees" section, which would cause an
   executor building screen 0503 to default to the unvalidated direct PATCH
   path. See Task 0.1.

1. **Phase 1 — DB migration + pgTAP.** A single task writes all test assertions
   first (RED), then the migration (GREEN), following TDD order.
   Tests span the new `db/tests/avatars.sql` file and three additions to
   existing test files. See Tasks 1.1.

## Reference docs and skills

- **`docs/avatars.md`** — authoritative spec: column shape, RPC contracts,
  cache-busting strategy.
- **`docs/data-model.md`** — schema conventions, RPC shape, trigger patterns.
- **`docs/testing.md`** — pgTAP test structure; positive + negative cases
  required for any new policy or security boundary.
- **`plans/0500_avatars/REQUIREMENTS.md`** — parent requirements R1–R4, R12.
