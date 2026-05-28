# Requirements: Invites + circles + blocks: DB layer

Step 7 of the master plan. `invite_policy` already ships on `user_settings`
from step 1; the `relationships` and `invitations` tables that power the full
invite and circle model are the only missing pieces. This step adds those two
tables, their RLS policies, the five security-definer RPCs, and pgTAP coverage
for all of it. No frontend changes — step 8 builds the UI on top.

## R1. `relationships` table

Create `public.relationships` with columns `user_id` (uuid, not null, FK to
`auth.users(id)` on delete cascade), `other_user_id` (uuid, not null, FK to
`auth.users(id)` on delete cascade), `status` (text, not null, CHECK in
`('circle', 'blocked')`), `created_at` (timestamptz, not null, default now()),
`modified_at` (timestamptz, not null, default now()); primary key
`(user_id, other_user_id)`; additional CHECK `user_id <> other_user_id`. Enable
RLS. The schema is directional: *"user_id's view of other_user_id."*

Bind `tg_set_timestamps` (`BEFORE INSERT OR UPDATE`) and `tg_set_modified_at`
(`BEFORE UPDATE OF status`) to this table, following the per-table trigger
pattern in `data-model.md` → "Triggers". The trigger functions already exist
from `0004_domain_schema.sql`; only the bindings need to be created.

Four RLS policies (see `invites.md` → "RLS and stored procedures"):
- `relationships_select`: `for select using (user_id = public.uid())`
- `relationships_insert`: `for insert with check (user_id = public.uid())`
- `relationships_update`: `for update using (user_id = public.uid()) with check (user_id = public.uid())`
- `relationships_delete`: `for delete using (user_id = public.uid())`

Only the owner of the row can read, write, flip status, or remove it. The
`other_user_id` user gets no visibility into whether they are in someone's circle
or on someone's blocklist.

## R2. `add_circle_by_email` RPC

A `security definer` function `public.add_circle_by_email(p_email text) returns void`.
Implementation follows the sketch in `invites.md` → "The `add_circle_by_email`
function":

1. Resolve `p_email` to a uuid via `auth.users`; raise if not found; raise if
   `target = me`.
2. Upsert Alice → Bob: `INSERT … ON CONFLICT (user_id, other_user_id) DO UPDATE
   SET status = 'circle' WHERE relationships.status <> 'blocked'`. If Alice has
   Bob blocked, the existing `blocked` row is preserved.
3. Upsert Bob → Alice (symmetric): same shape. If Bob has Alice blocked, his
   side is left unchanged.

GRANT EXECUTE to `authenticated`. Set `search_path = public, auth`.

## R3. `add_circle_by_id` RPC

A `security definer` function `public.add_circle_by_id(p_user_id uuid) returns void`.
One-sided tap-add — adds `p_user_id` to the caller's circle, skipping if the
caller already has `p_user_id` blocked:

```sql
INSERT INTO relationships (user_id, other_user_id, status)
VALUES (me, p_user_id, 'circle')
ON CONFLICT (user_id, other_user_id) DO UPDATE
  SET status = 'circle'
  WHERE relationships.status <> 'blocked';
```

Raise if `p_user_id = me` ("cannot add yourself"). Raise if `p_user_id` does
not exist in `auth.users` — add an explicit `SELECT … INTO target FROM
auth.users WHERE id = p_user_id` existence check before the upsert, matching
`add_circle_by_email`'s pattern; a raw FK `23503` would be cryptic to callers.
GRANT EXECUTE to `authenticated`. Set `search_path = public, auth`.

## R4. `invitations` table

Create `public.invitations` with columns `id` (uuid, primary key, default
`gen_random_uuid()`), `list_id` (uuid, not null, FK to `public.lists(id)` on
delete cascade), `created_by` (uuid, not null, FK to `auth.users(id)` on delete
cascade), `target_user_id` (uuid, FK to `auth.users(id)` on delete cascade),
`target_email` (text), `created_at` (timestamptz, not null, default now()),
`modified_at` (timestamptz, not null, default now()); CHECK `(target_user_id is
not null or target_email is not null)`. Enable RLS.

Column ordering follows the canonical SQL in `invites.md` and `data-model.md`:
`id, list_id, created_by, target_user_id, target_email, created_at, modified_at`.
(`created_by` at position 3 is a table-specific exception to the general
"attribution after payload" convention — the canonical SQL is the spec.)

Two unique indexes:
- `invitations_target_user_uniq` on `(list_id, target_user_id)` WHERE
  `target_user_id is not null`.
- `invitations_target_email_uniq` on `(list_id, lower(target_email))` WHERE
  `target_email is not null and target_user_id is null`.

Bind `tg_set_timestamps` (`BEFORE INSERT OR UPDATE`). No `tg_set_modified_at`
binding — invitations have no mutable payload columns in v1.

One RLS policy:
- `invitations_select`: `for select using (created_by = public.uid() or target_user_id = public.uid())`

No `invitations_insert` or `invitations_delete` policy — all inserts and deletes
go through `security definer` RPCs; direct table writes from the client are
structurally closed off.

## R5. `send_invitation` RPC

A `security definer` function
`public.send_invitation(p_list_id uuid, p_email text default null, p_user_id uuid default null) returns uuid`
(returns the invitation id, or `null` on silent fail). Exactly one of `p_email`
or `p_user_id` must be supplied; raise if neither is provided. If both are
non-null, `p_user_id` takes precedence (the email is ignored).

Check sequence (in order):

1. **Inviter-membership check.** If `is_list_member(p_list_id)` is false for
   the caller: raise — cannot invite to a list you're not on. (`send_invitation`
   is `SECURITY DEFINER` and bypasses RLS, so this must be an explicit guard.)
2. **Resolve target.** From `p_user_id` directly, or look up `p_email` in
   `auth.users`. If email-keyed and no match: skip checks 3–6, jump to step 7
   (email-path for unregistered users).
3. **Self-check.** If `target = inviter`: raise with a clear error.
4. **Existing-membership check.** If `target` already has a *live*
   `list_members` row for this list: raise. A soft-deleted membership row is
   treated as non-membership — the invite proceeds, and the row is restored by
   `accept_invitation` on acceptance.
5. **Existing-invite check.** If a pending `invitations` row already exists for
   `(p_list_id, target_user_id)` or `(p_list_id, lower(p_email))`: return the
   existing id (idempotent no-op; the caller sees "sent").
6. **Block check.** If `relationships` has `user_id = target, other_user_id =
   inviter, status = 'blocked'`: return null (silent fail).
7. **Policy check.** Read `user_settings.invite_policy` for target. `'nobody'`
   → return null. `'circle'` → check whether inviter is in target's circle
   (`relationships` row with `user_id = target, other_user_id = inviter, status
   = 'circle'`); absent → return null. `'everybody'` → pass.
8. **Insert.** `INSERT INTO invitations (list_id, created_by, target_user_id,
   target_email)` with `target_user_id = target` if resolved, else `target_email
   = p_email`. Return the new `id`. The INSERT must handle a concurrent-duplicate
   unique constraint violation (`23505`) gracefully: catch it and return the
   existing invitation id (via a fallback SELECT or `ON CONFLICT … DO NOTHING
   RETURNING id`) rather than raising.

GRANT EXECUTE to `authenticated`. Set `search_path = public, auth`.

## R6. `accept_invitation` RPC

A `security definer` function `public.accept_invitation(p_invitation_id uuid) returns void`.

1. Fetch the `invitations` row; raise if not found or if `target_user_id is distinct from
   public.uid()`. Using `IS DISTINCT FROM` (not `<>`) is required here: `NULL <> value`
   evaluates to NULL in PL/pgSQL (not raised), so `<>` would silently pass for email-keyed
   invitations where `target_user_id IS NULL`. `IS DISTINCT FROM` treats NULL correctly.
2. `INSERT INTO list_members (list_id, user_id) VALUES (inv.list_id, public.uid())
   ON CONFLICT (list_id, user_id) DO UPDATE SET deleted_at = null, deleted_by = null`.
   `created_by` is set to `public.uid()` (the acceptor) by `tg_set_attribution_list_members`
   on INSERT — the trigger unconditionally overwrites any supplied value, so the
   inviter cannot be preserved here. The `ON CONFLICT DO UPDATE` handles both the
   previously-removed-member case (soft-deleted PK collision) and a true
   concurrent-accept race; `DO NOTHING` would incorrectly leave a previously-removed
   member un-restored.
3. Hard-delete the `invitations` row.

All three steps in one transaction. GRANT EXECUTE to `authenticated`. Set
`search_path = public`.

## R7. `decline_invitation` RPC

A `security definer` function `public.decline_invitation(p_invitation_id uuid) returns void`.

1. Fetch the `invitations` row; raise if not found or if `target_user_id is distinct from
   public.uid()`. Same `IS DISTINCT FROM` requirement as R6 — `<>` silently passes when
   `target_user_id IS NULL` (email-keyed invitation).
2. Hard-delete the `invitations` row.

GRANT EXECUTE to `authenticated`. Set `search_path = public`.

## R8. pgTAP — relationships layer

New test file `db/tests/relationships.sql`. Tests must cover:

- **Schema shape** (updates to `schema_shape.sql`): `has_table('relationships')`,
  `has_column` for all six columns, `has_function` for `add_circle_by_email`
  and `add_circle_by_id`.
- **Grants** (updates to `grants.sql`): `SELECT, INSERT, UPDATE, DELETE` on
  `public.relationships` granted to `authenticated` (positive assertions; also
  lock in the absence of INSERT and DELETE for `anon`); `EXECUTE` granted to
  `authenticated` for both circle RPCs.
- **RLS positive** — Alice can insert her own circle/block row; can select her
  own rows; can update (flip status); can delete her own row.
- **RLS negative** — Bob cannot select rows where `user_id = Alice`, even when
  `other_user_id = Bob`; cannot insert a row with `user_id = Alice`; cannot
  update or delete Alice's rows.
- **`add_circle_by_email`** — mutual outcome (Alice → Bob and Bob → Alice both
  created); block-skips-mutual (Bob has Alice blocked → only Alice → Bob
  created, Bob → Alice left unchanged); self-add raises; nonexistent email
  raises; idempotent re-add leaves `status = 'circle'`.
- **`add_circle_by_id`** — one-sided outcome (only Alice → Bob created); block
  stands (if Alice has Bob blocked, the `blocked` row is not overwritten);
  self-add raises; non-existent `p_user_id` raises; idempotent re-add is a no-op.
- **`add_circle_by_email` — caller-has-target-blocked** — if Alice (the caller)
  has Bob blocked and calls `add_circle_by_email(bob@…)`: Alice's own `blocked`
  row stands (not overwritten to `circle`); Bob → Alice row is created unless
  Bob also blocks Alice.
- **`add_circle_by_email` — both sides blocked** — if both Alice and Bob have
  each other blocked: both `blocked` rows stand unchanged; no `circle` row is
  created on either side.

## R9. pgTAP — invitations layer

New test file `db/tests/invitations.sql`. Tests must cover:

- **Schema shape** (updates to `schema_shape.sql`): `has_table('invitations')`,
  `has_column` for all seven columns, `has_function` for all three invite RPCs.
- **Grants** (updates to `grants.sql`): `SELECT` on `public.invitations`
  granted to `authenticated` (positive assertion; no INSERT/DELETE — those go
  through RPCs); `EXECUTE` granted to `authenticated` for all three invite RPCs.
- **RLS positive** (`invitations_select`) — inviter sees their own sent
  invitations; invitee (`target_user_id`) sees invitations addressed to them.
- **RLS negative** — an outsider (neither inviter nor invitee) sees nothing.
- **`send_invitation`** — raises if caller is not a member of the list;
  succeeds when `invite_policy = 'everybody'`; succeeds when `policy = 'circle'`
  and inviter is in target's circle; returns null when `policy = 'circle'` and
  inviter is not in circle; returns null when `policy = 'nobody'`; returns null
  when blocked; raises on self-invite; raises when neither `p_email` nor
  `p_user_id` is provided; raises (or propagates `23503`) when `p_user_id` is a
  non-existent UUID; succeeds with `target_user_id = null` for an unregistered
  email (no policy check runs); returns existing id on duplicate attempt; returns
  existing id (not raise) when a concurrent duplicate triggers the
  unique-constraint handler; when both `p_email` and `p_user_id` are non-null,
  `p_user_id` wins and the email is disregarded.
- **`accept_invitation`** — creates a `list_members` row with `created_by =
  acceptor`; restores a previously soft-deleted membership row via `ON CONFLICT
  DO UPDATE`; hard-deletes the invitation row; raises if caller is not the
  invitee; raises if invitation id doesn't exist; raises if the invitation is
  email-keyed (`target_user_id IS NULL`) — no registered user can be the invitee
  of an email-keyed invitation (verifies the `IS DISTINCT FROM` guard).
- **`decline_invitation`** — hard-deletes the invitation row; raises if caller
  is not the invitee; raises if caller is the inviter (not the invitee); raises
  if invitation id doesn't exist; raises if the invitation is email-keyed
  (`target_user_id IS NULL`).
- **Block auto-decline** — Alice blocks Bob (PATCH sets `status = 'blocked'` on
  her relationships row); any pending `invitations` row where `created_by = Bob`
  and `target_user_id = Alice` is hard-deleted by the trigger. Test both INSERT
  (new block row) and UPDATE (circle → blocked) paths.

## R10. Block auto-decline trigger (0702 scope)

In `0009_invitations.sql`, after the `invitations` table exists, add a
`SECURITY DEFINER` trigger function `tg_block_declines_invitations` and bind it
as `AFTER INSERT OR UPDATE OF status ON relationships FOR EACH ROW`. When
`NEW.status = 'blocked'`, hard-delete all `invitations` rows where
`created_by = NEW.other_user_id AND target_user_id = NEW.user_id`. This enforces
`docs/invites.md` "Adding someone to your blocklist: auto-declines any pending
invite from them currently in your inbox." The trigger lives in `0009_invitations.sql`
(not `0008_relationships.sql`) because `invitations` does not exist until 0702.

## Non-requirements (explicitly excluded)

- **Any frontend/UI** — step 8 scope.
- **`PATCH /relationships` direction reversal (`blocked → circle`) DB guard** —
  the DB has no invariant preventing a direct `PATCH` from flipping a `blocked`
  row to `circle`. The "unblock = delete the row, then re-add deliberately" rule
  is a UI-layer convention only (step 8 scope). Direct API callers can flip
  either direction; the DB permits both, and `data-model.md` acknowledges both
  directions in the endpoint description. The step-8 implementer must enforce
  "unblock = delete" in the UI, not via an additional DB constraint.
- **Guard on accepting an invitation to a soft-deleted list** — `accept_invitation`
  does not check `lists.deleted_at`. If a list is soft-deleted after an
  invitation was sent but before it is accepted, the `list_members` row is still
  inserted successfully; the new member becomes fully active once the list is
  restored. This is intentional — a restored list should have all expected
  members, and rejecting an accept mid-soft-delete would silently discard an
  action the user expected to complete.
- **Cancel invitation by the inviter** — no `cancel_invitation` RPC is in step 7
  scope. Step 8 will add it (either a dedicated RPC or a `for delete using
  (created_by = public.uid())` policy + DELETE grant on `invitations`).
- **Policy-change cascade** — auto-declining existing invites when `invite_policy`
  changes is documented in `invites.md` but not in the master plan's step 7
  scope; deferred to step 8 or a step-8 addendum.
- **Invite expiry / server-side cleanup** — `invites.md` open questions; not v1.
- **Push notifications on invite arrival** — not v1.
- **"Add Alice to your circle?" prompt on accept** — step 8 UI scope; the DB
  infrastructure (circle rows) is in place but the prompt logic is frontend.
- **Pending-invite cap enforcement** — `invites.md` describes a soft cap of 20;
  not a v1 DB enforcement.
- **Email delivery for unregistered invitees** — triggering a magic-link email
  is an infra concern beyond the DB layer; deferred.
