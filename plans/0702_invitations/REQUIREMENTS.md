# Requirements: Invitations table + invite RPCs + block auto-decline

Sub-step 7.2 of the master plan. Adds the `invitations` table, its
single RLS policy, the three invite RPCs (`send_invitation`,
`accept_invitation`, `decline_invitation`), the `tg_block_declines_invitations`
trigger that hard-deletes pending invites when a block is recorded, and
full pgTAP coverage. The `relationships` layer already shipped in 0701;
this completes the Tier 3 invite/circle data model and unblocks step 8
(frontend). No frontend changes here.

## R1. `invitations` table

Create `public.invitations` with the following columns, in this exact
order (the column order is part of the canonical SQL in `docs/invites.md`
and `docs/data-model.md`; `created_by` at position 3 is a table-specific
exception to the general "attribution after payload" convention):

- `id` uuid PRIMARY KEY DEFAULT `gen_random_uuid()`
- `list_id` uuid NOT NULL FK to `public.lists(id)` ON DELETE CASCADE
- `created_by` uuid NOT NULL FK to `auth.users(id)` ON DELETE CASCADE
- `target_user_id` uuid FK to `auth.users(id)` ON DELETE CASCADE
- `target_email` text
- `created_at` timestamptz NOT NULL DEFAULT now()
- `modified_at` timestamptz NOT NULL DEFAULT now()
- CHECK `(target_user_id is not null or target_email is not null)`

Enable RLS. Bind `tg_set_timestamps` (`BEFORE INSERT OR UPDATE`) with
binding name `t05_set_timestamps`. No `tg_set_modified_at` binding —
`invitations` has no mutable payload columns in v1.

`GRANT SELECT ON public.invitations TO authenticated`. No INSERT, no
UPDATE, no DELETE grants — all writes go through the security-definer
RPCs.

## R2. Two unique indexes on `invitations`

- `invitations_target_user_uniq` on `(list_id, target_user_id)` WHERE
  `target_user_id is not null`.
- `invitations_target_email_uniq` on `(list_id, lower(target_email))`
  WHERE `target_email is not null and target_user_id is null`.

The two partial-unique indexes prevent both the user-keyed and the
email-keyed duplicate cases independently. They also drive the `23505`
fallback path inside `send_invitation` (R5).

## R3. RLS policy `invitations_select`

```sql
create policy invitations_select on public.invitations
  for select using (
    created_by     = public.uid()
    or target_user_id = public.uid()
  );
```

No `invitations_insert`, `invitations_update`, or `invitations_delete`
policies — direct table writes from the client are structurally closed
off; the three RPCs are the only path. Inviter sees what they sent;
invitee sees what's addressed to them; nobody else sees the row.

## R4. `send_invitation` RPC

A `security definer` function

```sql
public.send_invitation(
  p_list_id uuid,
  p_email   text default null,
  p_user_id uuid default null
) returns uuid     -- invitation id, or null on silent fail
```

Exactly one of `p_email` or `p_user_id` must be supplied; raise if
neither is provided. If both are non-null, `p_user_id` takes precedence
(the email is ignored).

Check sequence — execute in this order:

1. **Inviter-membership check.** If `public.is_list_member(p_list_id)`
   is false for the caller: raise — cannot invite to a list you're
   not on. `send_invitation` is `SECURITY DEFINER` and bypasses RLS,
   so this must be an explicit guard. Not shown in the `docs/invites.md`
   sketch (the sketch elides this step with a comment); R4 is the
   authoritative spec.
2. **Resolve target.** From `p_user_id` directly, or look up `p_email`
   in `auth.users` (case-insensitive: `lower(email) = lower(p_email)`).
   If email-keyed and no match: checks 3, 4, 6, and 7 are skipped
   (the self / existing-membership / block / policy checks are all
   keyed on a resolved `target` uuid and have nothing to compare
   against when `target IS NULL`); step 5 (existing-invite check)
   *still* runs, against the `lower(target_email)` partial-unique
   index, so a repeated send to the same unregistered address is the
   canonical idempotency point rather than relying on the
   EXCEPTION-with-SELECT branch alone.
3. **Self-check.** If `target = inviter`: raise with a clear error.
4. **Existing-membership check.** If `target` has a **live**
   `list_members` row for `p_list_id` (i.e. `deleted_at IS NULL`):
   raise. A soft-deleted membership row is treated as non-membership —
   the invite proceeds, and `accept_invitation` restores it.
5. **Existing-invite check.** If a pending `invitations` row already
   exists for `(p_list_id, target_user_id)` (when resolved) or
   `(p_list_id, lower(target_email))` (when email-keyed): return the
   existing id (idempotent no-op; the caller sees "sent").
6. **Block check.** If `relationships` has a row with `user_id =
   target`, `other_user_id = inviter`, `status = 'blocked'`: return
   null (silent fail).
7. **Policy check.** Read `user_settings.invite_policy` for `target`.
   `'nobody'` → return null. `'circle'` → check whether `inviter` is
   in `target`'s circle (`relationships` row with `user_id = target`,
   `other_user_id = inviter`, `status = 'circle'`); absent → return
   null. `'everybody'` → fall through.
8. **Insert.** `INSERT INTO public.invitations (list_id, created_by,
   target_user_id, target_email)` with `target_user_id = target` when
   resolved, else `target_email = p_email`. Return the new `id`.

The INSERT in step 8 must handle a concurrent-duplicate
`unique_violation` (SQLSTATE `23505`) gracefully: catch it and return
the existing invitation id rather than raising. This covers the TOCTOU
window between step 5 (cap check) and step 8 (INSERT). The chosen
implementation is **EXCEPTION-with-SELECT** — wrap the INSERT in a
`BEGIN … EXCEPTION WHEN unique_violation THEN SELECT id INTO
invitation_id FROM public.invitations WHERE … ; END;` block. Rationale:
the SELECT branch reuses the same key predicate as the unique indexes
in R2 and is grep-aligned with how `docs/invites.md` describes the
behaviour (single retrieval after the conflict).

`REVOKE ALL ON FUNCTION public.send_invitation(uuid, text, uuid) FROM
public; GRANT EXECUTE ON FUNCTION public.send_invitation(uuid, text,
uuid) TO authenticated`. Set `search_path = public, auth`.

## R5. `accept_invitation` RPC

A `security definer` function `public.accept_invitation(p_invitation_id
uuid) returns void`.

1. Fetch the `invitations` row. Raise if not found.
2. Raise if `inv.target_user_id IS DISTINCT FROM public.uid()`.
   Using `IS DISTINCT FROM` (not `<>`) is required: `NULL <> value`
   evaluates to NULL (treated as false in a PL/pgSQL `if`) and would
   silently pass for email-keyed invitations where `target_user_id IS
   NULL`. `IS DISTINCT FROM` treats NULL correctly and raises in that
   case.
3. `INSERT INTO public.list_members (list_id, user_id) VALUES (inv.list_id,
   public.uid()) ON CONFLICT (list_id, user_id) DO UPDATE SET deleted_at
   = null, deleted_by = null`. `ON CONFLICT DO UPDATE` restores a
   previously-removed (soft-deleted) member and also handles a
   concurrent-accept race; `DO NOTHING` would leave the soft-deleted
   row unrestored.

   `created_by` behaviour is path-dependent and **both branches are
   intentional**: on the fresh-INSERT path
   `tg_set_attribution_list_members`'s INSERT-arm unconditionally stamps
   `created_by := public.uid()` (the acceptor); on the restore path the
   trigger's UPDATE-arm tombstone-gated freeze leaves `created_by` at
   its original value (often the original inviter who first added the
   user before they were soft-removed). Audit semantic: "the
   membership's `created_by` is whoever first put the user on the list,
   not whoever most recently re-accepted."
4. `DELETE FROM public.invitations WHERE id = p_invitation_id` (hard
   delete).

All four steps run in one implicit transaction (the function body).
`REVOKE ALL … FROM public; GRANT EXECUTE … TO authenticated`. Set
`search_path = public`.

## R6. `decline_invitation` RPC

A `security definer` function `public.decline_invitation(p_invitation_id
uuid) returns void`.

1. Fetch the `invitations` row; raise if not found.
2. Raise if `inv.target_user_id IS DISTINCT FROM public.uid()` (same
   `IS DISTINCT FROM` requirement as R5).
3. `DELETE FROM public.invitations WHERE id = p_invitation_id`.

`REVOKE ALL … FROM public; GRANT EXECUTE … TO authenticated`. Set
`search_path = public`.

## R7. `tg_block_declines_invitations` trigger

A `SECURITY DEFINER` PL/pgSQL trigger function with `SET search_path =
public`, bound as

```
CREATE TRIGGER t40_block_declines_invitations
  AFTER INSERT OR UPDATE OF status ON public.relationships
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_declines_invitations();
```

When `NEW.status = 'blocked'`, the function executes:

```sql
DELETE FROM public.invitations
WHERE created_by      = NEW.other_user_id
  AND target_user_id  = NEW.user_id;
```

(Hard delete, matches `accept_invitation`'s and `decline_invitation`'s
removal semantics; invitations are pending state with no audit value.)

Trigger fires for both the INSERT path (a new `relationships` row with
`status = 'blocked'`) and the UPDATE path (`circle → blocked` flip).
On `status = 'circle'`, the function is a no-op.

The trigger lives in `0009_invitations.sql` (not `0008_relationships.sql`)
because `public.invitations` does not exist until 0009; the binding can
only be added once both tables are in place.

Trigger name `t40_block_declines_invitations` uses the `t40_*` prefix
(higher than `t05`, `t20` which are already in use on relationships)
so its position in the trigger ordering is unambiguous; it is an
`AFTER` trigger, so it fires after the row change is durable.

## R8. pgTAP — `db/tests/invitations.sql`

Create a new pgTAP test file `db/tests/invitations.sql` covering:

- **RLS positive** (`invitations_select`) — inviter sees their own sent
  invitations; invitee (`target_user_id`) sees invitations addressed to
  them.
- **RLS negative** — an outsider (neither inviter nor invitee) sees
  nothing.
- **`send_invitation`** — covers every R4 case:
  - raises when caller is not a member of the list (step 1)
  - succeeds when `invite_policy = 'everybody'`
  - succeeds when `policy = 'circle'` and inviter is in target's circle
  - returns null when `policy = 'circle'` and inviter is not in circle
  - returns null when `policy = 'nobody'`
  - returns null when target has inviter blocked (step 6)
  - raises on self-invite (step 3)
  - raises when neither `p_email` nor `p_user_id` is provided (step 2
    validation)
  - raises (or propagates `23503`) when `p_user_id` is a UUID that
    does not exist in `auth.users` — use a literal that is **not** the
    tombstone (`00000000-0000-0000-0000-000000000000` is a valid
    `auth.users` row seeded by `0004_domain_schema.sql` and would
    silently pass the FK; pick e.g. `ffffffff-…` instead)
  - succeeds with `target_user_id = null` for an unregistered email
    (steps 3–7 skipped)
  - returns existing id on duplicate attempt (step 5 idempotency).
    Note: the EXCEPTION-with-SELECT branch in step 8 cannot be
    exercised by a single-session pgTAP test (step 5's SELECT
    short-circuits before step 8 ever runs); the branch's correctness
    rests on code review of the `BEGIN … EXCEPTION WHEN
    unique_violation` block, which mirrors the step-5 retrieval
    predicate exactly. Don't pretend a unit test covers this — call
    the scenario "step-5 idempotency under pre-existing invitation"
    and leave the EXCEPTION arm to review.
  - when both `p_email` and `p_user_id` are non-null, `p_user_id` wins
    and the email is disregarded
  - existing-membership check honours `deleted_at`: soft-deleted member
    is treated as non-member and the invite proceeds
- **`accept_invitation`**
  - creates a `list_members` row with `created_by = acceptor`
  - restores a previously soft-deleted membership row via
    `ON CONFLICT DO UPDATE` (positive assertion: row exists with
    `deleted_at IS NULL` and `deleted_by IS NULL` after accept)
  - hard-deletes the invitation row
  - raises if caller is not the invitee
  - raises if invitation id doesn't exist
  - raises if the invitation is email-keyed (`target_user_id IS NULL`)
    — verifies the `IS DISTINCT FROM` guard catches the NULL case
- **`decline_invitation`**
  - hard-deletes the invitation row
  - raises if caller is not the invitee
  - raises if caller is the inviter (not the invitee)
  - raises if invitation id doesn't exist
  - raises if the invitation is email-keyed (verifies `IS DISTINCT FROM`)
- **Block auto-decline** — verifies R7 trigger on both paths:
  - INSERT path: Alice (no prior `relationships` row) directly inserts
    `(Alice, Bob, 'blocked')`; any pending `invitations` row where
    `created_by = Bob AND target_user_id = Alice` is hard-deleted.
  - UPDATE path: Alice's existing `(Alice, Bob, 'circle')` row is
    flipped to `'blocked'` via UPDATE; any pending invite from Bob to
    Alice is hard-deleted.
  - Negative: setting `status = 'circle'` (insert or update) leaves
    pending invites intact.

## R9. pgTAP — schema/grants assertions

Update `db/tests/schema_shape.sql` with:

- `has_table('public', 'invitations', …)`
- `has_column` for every `invitations` column (`id`, `list_id`,
  `created_by`, `target_user_id`, `target_email`, `created_at`,
  `modified_at`)
- `has_function` for the three RPC signatures (`send_invitation(uuid,
  text, uuid)`, `accept_invitation(uuid)`, `decline_invitation(uuid)`)

Update `db/tests/grants.sql` with:

- positive: `SELECT` on `public.invitations` for `authenticated`,
  `EXECUTE` on each of the three RPCs for `authenticated`
- negative: no `SELECT` on `public.invitations` for `anon`, no
  `EXECUTE` on any of the three RPCs for `anon`

We don't pre-compute assertion totals or pre-pin `plan(N)` here. The
new `db/tests/invitations.sql` file uses `SELECT * FROM no_plan();`
so adding or trimming an assertion later is a one-line change. For the
two existing files (`schema_shape.sql`, `grants.sql`), bump the
existing `plan(N)` to whatever `./scripts/test-db.sh` reports after
the new assertions are added — the precise number is mechanical and
isn't worth tracking in this spec.

## Non-requirements (explicitly excluded)

- **Any frontend/UI** — step 8 scope.
- **Cancel invitation by the inviter** — no `cancel_invitation` RPC in
  step-7 scope. Step 8 will add it (either a dedicated RPC or a
  `for delete using (created_by = public.uid())` policy + DELETE grant).
- **Policy-change cascade** — auto-declining existing invites when
  `invite_policy` changes is documented in `docs/invites.md` but not in
  step-7 scope. Deferred to step 8.
- **Pending-invite cap enforcement** — `docs/invites.md` describes a
  soft cap of 20; not a v1 DB enforcement. The concurrent-duplicate
  handling in R4 is about the unique index, not about a numeric cap.
- **Invite expiry / server-side cleanup** — open question in
  `docs/invites.md`; not v1.
- **Push notification on invite arrival** — not v1.
- **"Add Alice to your circle?" prompt on accept** — step 8 UI scope.
- **Email delivery for unregistered invitees** — infra concern beyond
  the DB layer; deferred.
- **Guard on accepting an invitation to a soft-deleted list** —
  `accept_invitation` does not check `lists.deleted_at`. Intentional:
  a restored list should have all expected members.
- **Guard on sending an invitation to a soft-deleted list** —
  `send_invitation` does not check `lists.deleted_at` either;
  `is_list_member` only filters on the membership row's
  `deleted_at`. Symmetric with the accept-side non-requirement: a
  restored list should still surface the invites that were sent while
  it was in the trash.
- **Guard on sending an invitation targeting the tombstone UUID** —
  `send_invitation` permits `p_user_id =
  '00000000-0000-0000-0000-000000000000'`. The resulting row is inert
  (the tombstone has no auth identity and can never accept), and the
  privacy surface is nil (the tombstone UUID is a documented
  constant, not a leakable user identity). Adding a guard would cost
  a branch + a test for zero observable benefit.
- **Inbox-side index on `invitations.target_user_id`** — the two
  partial unique indexes in R2 don't accelerate the inbox query
  (`GET /invitations?target_user_id=eq.<my-uid>`). v1 volume is
  trivially small; we accept the sequential scan and add an index
  once load demands it.
- **DB-side `unblock = delete` invariant** — UI-layer convention only
  (step 8 scope). The DB permits flipping `blocked → circle` directly.
