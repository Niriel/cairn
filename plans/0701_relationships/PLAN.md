# Plan: Relationships table + circle RPCs

## Goal

Ship `db/migrations/0008_relationships.sql` — the `relationships` table,
four RLS policies, two circle RPCs, and the full grant matrix — with
comprehensive pgTAP coverage. This is a self-contained sub-step of 0700;
the invitations layer (0702) depends on this being fully tested and merged
first.

## Architecture

### Migration file: `0008_relationships.sql`

Structure:
1. `CREATE TABLE public.relationships` with the six columns, PK, and
   two-column check constraint.
2. `ALTER TABLE … ENABLE ROW LEVEL SECURITY`.
3. `GRANT SELECT, INSERT, UPDATE, DELETE ON public.relationships TO authenticated`.
4. `tg_freeze_relationships_pk` function (closes the PK-mutation gap
   `relationships_update`'s `user_id = public.uid()` policy leaves open
   — see R7).
5. Three trigger bindings: `t01_freeze_relationships_pk`,
   `t05_set_timestamps`, and `t20_set_modified_at` (the `t05` / `t20`
   names are unsuffixed; Postgres scopes trigger names per-table — see
   the "Trigger binding names" subsection below).
6. Four RLS policies: select / insert / update / delete.
7. `add_circle_by_email` function.
8. `add_circle_by_id` function.
9. REVOKE/GRANT EXECUTE for both functions.

### Trigger binding names

Follow the `t05_` / `t20_` prefix convention from existing tables:
- `t05_set_timestamps` — BEFORE INSERT OR UPDATE
- `t20_set_modified_at` — BEFORE UPDATE OF status

The unsuffixed names match every other timestamped table — Postgres
scopes trigger names per-table, so reusing the binding name keeps the
matrix grep-friendly (`0004_domain_schema.sql:514–537` and
`0007_avatars.sql:68–72`).

The `tg_set_timestamps` and `tg_set_modified_at` functions already exist
from `0004_domain_schema.sql`; we only add bindings.

### Freeze trigger for the composite PK

`tg_freeze_relationships_pk` mirrors `tg_freeze_list_members_pk`
(`0004_domain_schema.sql:492–503`): a one-shot guard that raises when
`new.user_id` or `new.other_user_id` differs from `OLD`. Bound `t01_*`
so it fires before `t05` / `t20` and short-circuits any work on the
rejected UPDATE. Rationale: `relationships_update`'s
`using/with check (user_id = public.uid())` lets a client PATCH the row
to change `other_user_id`; that swap is functionally a delete-then-insert
but bypasses both `modified_at` (the `OF status` clause doesn't fire on
PK changes) and `created_at` (frozen by `t05`), leaving a row that
silently lies about both its identity and its history. The freeze closes
that gap and matches the precedent established for `list_members`.

### RPC design

Both RPCs are `SECURITY DEFINER` because they need to write into
`relationships` rows owned by another user (the `target/me` rows). The
`ON CONFLICT DO UPDATE WHERE status <> 'blocked'` shape is what enforces
"block always wins" at write time.

`add_circle_by_id` sets `search_path = public, auth` even though it
doesn't need `auth` directly — the existence check reads `auth.users`.
Alternatively `search_path = public` and qualify the auth.users lookup
explicitly; either is fine. Follow the `add_circle_by_email` pattern.

### Test file: `db/tests/relationships.sql`

Uses the canonical fixture set (`users_alice_bob_carol.sql`) and the
shared list fixture where needed. Covers all positive and negative RLS
cases, all RPC edge cases from R6, and the two "both sides blocked" edge
cases.

### schema_shape.sql and grants.sql updates

Add assertions for the new table, columns, functions, and grants.
Increment the `plan(N)` count in each file by the number of new
assertions added.

## Phase structure

Single phase — the table, RPCs, and tests are all part of one migration.
TDD: write the pgTAP assertions first (they will fail because the table
doesn't exist), then implement the migration to make them green.

## Non-requirements

- `invitations` table — 0702 scope.
- Any frontend — 0800 scope.
- Block auto-decline trigger — 0702 scope (needs `invitations` to exist).
- Policy-change cascade — step 8 scope.
