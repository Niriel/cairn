# Requirements: Relationships table + circle RPCs

Sub-step 7.1 of the master plan. Adds the `relationships` table, its
four RLS policies, the two circle RPCs (`add_circle_by_email` and
`add_circle_by_id`), and full pgTAP coverage. No invitations work here
— that is 0702.

## R1. `relationships` table

Create `public.relationships` with:
- `user_id` uuid NOT NULL FK to `auth.users(id)` ON DELETE CASCADE
- `other_user_id` uuid NOT NULL FK to `auth.users(id)` ON DELETE CASCADE
- `status` text NOT NULL CHECK in `('circle', 'blocked')`
- `created_at` timestamptz NOT NULL DEFAULT now()
- `modified_at` timestamptz NOT NULL DEFAULT now()
- PRIMARY KEY `(user_id, other_user_id)`
- CHECK `user_id <> other_user_id`

Enable RLS. The table is directional: *"user_id's view of other_user_id."*

Bind `tg_set_timestamps` (`BEFORE INSERT OR UPDATE`) with trigger name
`t05_set_timestamps`. Bind `tg_set_modified_at`
(`BEFORE UPDATE OF status`) with trigger name `t20_set_modified_at`.
The trigger functions already exist from `0004_domain_schema.sql`;
only the bindings are new. The unsuffixed names match the
project-wide pattern in `0004_domain_schema.sql:510–576` — Postgres
scopes trigger names per-table, so the same binding name is reused
across every timestamped table.

## R2. Four RLS policies

Exactly per `docs/invites.md` → "RLS and stored procedures":

- `relationships_select`: `for select using (user_id = public.uid())`
- `relationships_insert`: `for insert with check (user_id = public.uid())`
- `relationships_update`: `for update using (user_id = public.uid()) with check (user_id = public.uid())`
- `relationships_delete`: `for delete using (user_id = public.uid())`

## R3. `add_circle_by_email` RPC

`security definer` function `public.add_circle_by_email(p_email text) returns void`.
Set `search_path = public, auth`.

1. Resolve `p_email` → uuid via `auth.users`; raise if not found; raise if target = me.
2. Upsert Alice → Bob: `INSERT … ON CONFLICT (user_id, other_user_id) DO UPDATE SET status = 'circle' WHERE relationships.status <> 'blocked'`.
3. Upsert Bob → Alice (symmetric, same shape, Bob's block check).

GRANT EXECUTE to `authenticated`.

## R4. `add_circle_by_id` RPC

`security definer` function `public.add_circle_by_id(p_user_id uuid) returns void`.
Set `search_path = public, auth`.

One-sided tap-add. Self-add guard. Explicit existence check against
`auth.users` (not relying on FK 23503). Then:

```sql
INSERT INTO relationships (user_id, other_user_id, status)
VALUES (me, p_user_id, 'circle')
ON CONFLICT (user_id, other_user_id) DO UPDATE
  SET status = 'circle'
  WHERE relationships.status <> 'blocked';
```

GRANT EXECUTE to `authenticated`.

## R5. Grants

`GRANT SELECT, INSERT, UPDATE, DELETE ON public.relationships TO authenticated`.

## R7. Freeze the composite PK against `UPDATE`

`relationships_update`'s `using/with check (user_id = public.uid())` lets
an authenticated client `PATCH /relationships?…` to change
`other_user_id` on their own row — RLS only gates `user_id`. The
`t20_set_modified_at` binding's `OF status` clause means such a swap
silently leaves `modified_at` at its old value, and `t05_set_timestamps`
freezes `created_at`, so the row retains the original creation timestamp
while pointing at a different person. This is the same shape as
`list_members`' PK-mutation trap (`docs/data-model.md` → Triggers; the
`tg_freeze_list_members_pk` rationale at `0004_domain_schema.sql:492–503`).

Add a trigger function `public.tg_freeze_relationships_pk` that raises
when `new.user_id IS DISTINCT FROM old.user_id` or `new.other_user_id IS
DISTINCT FROM old.other_user_id`. Bind it as
`t01_freeze_relationships_pk BEFORE UPDATE ON public.relationships FOR
EACH ROW` so it short-circuits before `t05` / `t20`. The `t01_` prefix
matches the list_members pattern. PK mutation is then a hard error, and
the only sanctioned way to change which user a row points at is
delete-then-insert.

## R6. pgTAP coverage

New test file `db/tests/relationships.sql`. Must cover:

- RLS positive: Alice can insert her own row; select her own rows; update (flip status); delete her own row.
- RLS negative: Bob cannot select Alice's rows (even when `other_user_id = Bob`); cannot insert with `user_id = Alice`; cannot update or delete Alice's rows.
- `add_circle_by_email`: mutual outcome; block-skips-mutual (Bob has Alice blocked → only Alice→Bob created); self-add raises; nonexistent email raises; idempotent re-add stays circle.
- `add_circle_by_email` — caller-has-target-blocked: Alice has Bob blocked; Alice's blocked row stands; Bob → Alice row is created unless Bob also blocks Alice.
- `add_circle_by_email` — both sides blocked: both blocked rows stand; no circle row created either side.
- `add_circle_by_id`: one-sided outcome only; blocked row preserved; self-add raises; non-existent UUID raises; idempotent re-add is a no-op.
- `t05_set_timestamps` freeze: status flip on an existing row leaves `created_at` unchanged (insert row, capture `created_at`, flip status, assert `created_at` is unchanged).
- `t01_freeze_relationships_pk` (R7): a PATCH that changes `other_user_id` raises; a PATCH that changes `user_id` raises (both via `throws_ok` with SQLSTATE `P0001`).

Updates to `db/tests/schema_shape.sql`: `has_table('relationships')`,
`has_column` for all five columns (`user_id`, `other_user_id`,
`status`, `created_at`, `modified_at` — PK is composite, no `id`),
`has_function` for both RPCs.

Updates to `db/tests/grants.sql`: SELECT/INSERT/UPDATE/DELETE on
`relationships` for `authenticated`; EXECUTE on both RPCs for
`authenticated`; anon negatives for the table and both RPCs.
