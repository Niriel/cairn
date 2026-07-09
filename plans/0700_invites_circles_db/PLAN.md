# Plan: Invites + circles + blocks: DB layer

Step 7 of the master plan — the Tier 3 data model for circles, blocks, and
invitations. Steps 1–6 are merged; `invite_policy` already ships on
`user_settings` from step 1. This plan adds the `relationships` and
`invitations` tables, all RLS policies, and the five security-definer RPCs that
power the circles and invite flows. No frontend changes; step 8 builds the UI
on top of what step 7 establishes.

## Context

After step 6 the stack has:

- **DB:** `lists`, `list_members`, `items`, `votes`, `profiles`, `user_settings`
  (with `invite_policy`), soft-delete views, full RLS, all triggers. The `public`
  schema is missing the Tier 3 tables only.
- **`invite_policy`:** already on `user_settings` (`'everybody' | 'circle' |
'nobody'`, default `'everybody'`). No `relationships` or `invitations` table
  exists yet.
- **Web app:** has no invite or circle UI. Step 8 builds those screens.
- **pgTAP:** `schema_shape.sql` and `grants.sql` know nothing yet about the
  Tier 3 tables or RPCs. Existing tests remain green.

Two gaps must land before step 8 can start: (1) the `relationships` table,
its four RLS policies, and the two circle/block RPCs; (2) the `invitations`
table, its `invitations_select` policy, and the three invite RPCs. Each gap
maps to a sub-plan.

## Decisions

**Orchestration via sub-branches, not a single large branch.** The two layers
have distinct test surfaces — `relationships` can be fully tested in isolation
before the invite RPCs that _read_ it are written — and splitting keeps each PR
focused. `0700_invites_circles_db` itself contains no implementation, only the
plan files and the merge commits. Same pattern as `0500_avatars` and
`0600_soft_delete_ux`.

**0701 (`relationships`) before 0702 (`invitations`) is enforced by dependency.**
`send_invitation` (0702) reads `relationships` rows for its block and circle
checks. The `relationships` table must therefore exist — and its RLS policies
must be verified — before `send_invitation` can be written or tested. Cutting
0702 from the post-0701 state of `0700_invites_circles_db` enforces this order
naturally.

**`add_circle_by_id` is a security-definer RPC, not a direct table write.**
`circles.md` says "direct insert, no stored procedure needed" for the one-sided
tap-add, because Alice is only writing her own row and RLS permits it. However,
the doc predates the master plan's explicit listing of `add_circle_by_id` as one
of the five RPCs, and `data-model.md`'s "What the app sees" endpoint list also
treats it as an RPC. The `ON CONFLICT DO UPDATE WHERE status <> 'blocked'`
shape — the "block always wins" enforcement at write time — is identical to the
logic in `add_circle_by_email`. Putting this shape in a named RPC is better for:
(a) testability (one pgTAP function call exercises the conflict path); (b) the
step-8 UI (the client calls a single endpoint rather than knowing the conflict
clause); (c) doc clarity (`circles.md` will be updated in Phase 0 to remove the
contradiction). The RPC is thin — ten lines — but it is the correct boundary.

**Single migration file per sub-plan.** `relationships` and `invitations` are
independent at the schema level (no FK from invitations to relationships); the
RPCs in 0702 query `relationships` rows but do not FK-reference the table. A
single `0008_relationships.sql` (0701) and a single `0009_invitations.sql` (0702)
keep the migration history readable. Migration numbering follows the existing
sequence: the last migration is `0007_avatars.sql`.

**`tg_set_timestamps` bound to both new tables; `tg_set_modified_at` bound to
`relationships (status)` only.** Both tables carry `created_at` and
`modified_at`, so `tg_set_timestamps` binds to both (matching every other table
in the schema). `relationships.status` is the one user-mutable column (a user
can flip a circle row to blocked), so `tg_set_modified_at` fires `BEFORE UPDATE
OF status ON relationships`. `invitations` has no mutable payload columns in
v1 — it is created and then hard-deleted (accepted or declined) — so
`tg_set_modified_at` is not bound to it. Both decisions follow the per-table
`OF (cols)` pattern documented in `data-model.md` → "Triggers".

**No attribution trigger for `relationships` or `invitations`.** Neither table
has a `modified_by` column; `invitations.created_by` uses `on delete cascade`
(not `on delete set default`) so the tombstone-gate pattern is not needed.
All writes to both tables go through `security definer` RPCs, which enforce
attribution server-side. The one exception — the direct `PATCH /relationships`
a step-8 client uses to flip `status` (circle → blocked) — is a standard RLS
table write on the caller's own row, already gated by `relationships_update`.

**`accept_invitation` creates the `list_members` row and hard-deletes the
invitation in one transaction.** A soft-delete of the invitation was considered
and rejected: a pending invite has no audit value after the invitee accepts or
declines; hard-deleting keeps the table small and the "does an invite exist?"
query simple.

**`decline_invitation` is a hard delete.** Same reasoning as accept — pending
state, no value once resolved. The inviter is not notified (see `invites.md` →
"What blocked invites look like to the sender").

**No policy-change cascade trigger in step 7.** `invites.md` documents that
changing `invite_policy` from `everybody` to `circle` or `nobody` should
auto-decline existing non-matching pending invites. This logic touches
`user_settings` and `invitations` together. It is not in the master plan's step
7 scope ("five RPCs, RLS + pgTAP"), and deferring it to the step-8 UI layer or
a step-8 addendum keeps step 7 focused. The TASKS.md marks this as a known
deferral.

## Architecture

### New plan directories (created by this plan's tasks)

- **`plans/0701_relationships/`** — `relationships` table, four RLS policies,
  `add_circle_by_email` and `add_circle_by_id` RPCs, pgTAP.
- **`plans/0702_invitations/`** — `invitations` table, `invitations_select` RLS
  policy, `send_invitation`, `accept_invitation`, `decline_invitation` RPCs,
  pgTAP.

### Branches

```
main
 └─ 0700_invites_circles_db          ← this plan's branch
     ├─ 0701_relationships            ← merges back into 0700_invites_circles_db
     └─ 0702_invitations              ← merges back into 0700_invites_circles_db
```

### New files — DB migrations

- **`db/migrations/0008_relationships.sql`** — `relationships` table, four RLS
  policies, `add_circle_by_email()`, `add_circle_by_id()`, `tg_set_timestamps`
  and `tg_set_modified_at` bindings, `GRANT SELECT, INSERT, UPDATE, DELETE ON
public.relationships TO authenticated`.
- **`db/migrations/0009_invitations.sql`** — `invitations` table, two unique
  indexes, `invitations_select` RLS policy, `send_invitation()`,
  `accept_invitation()`, `decline_invitation()`, `tg_set_timestamps` binding,
  `tg_block_declines_invitations` trigger function + `AFTER INSERT OR UPDATE OF
status ON relationships` binding (R10 — block auto-decline; lives here, not in
  0008, because `invitations` does not exist until this migration runs),
  `GRANT SELECT ON public.invitations TO authenticated`.

### New files — DB tests

- **`db/tests/relationships.sql`** — pgTAP: table shape, RLS positive/negative
  for all four policies, `add_circle_by_email` (mutual, block-skips-mutual,
  self-add-rejected, nonexistent-email-rejected, idempotent), `add_circle_by_id`
  (one-sided, block-stands, idempotent).
- **`db/tests/invitations.sql`** — pgTAP: table shape, `invitations_select`
  positive/negative, `send_invitation` (seven check-sequence scenarios),
  `accept_invitation`, `decline_invitation`.

### Modified files — DB tests

- **`db/tests/schema_shape.sql`** — add `has_table`, `has_column`,
  `has_function` for the two new tables and all five RPCs (split: 0701 adds
  relationships + circle RPCs; 0702 adds invitations + invite RPCs).
- **`db/tests/grants.sql`** — add `EXECUTE` grant coverage for all five RPCs
  (split across sub-plans).

### Modified files — docs

- **`docs/circles.md`** — Phase 0: correct the "direct insert, no stored
  procedure needed" paragraph; point to `add_circle_by_id` RPC instead.
- **`docs/invites.md`** — Phase 0: add function sketches for `accept_invitation`,
  `decline_invitation`, and `add_circle_by_id`; add a note on the
  policy-change cascade deferral.

## Phase structure

**Phase 0 — Reconcile docs.** Two doc edits committed directly to
`0700_invites_circles_db` before any sub-branch is cut: (0.1) update
`docs/circles.md` to remove the "direct insert" paragraph and point to the
`add_circle_by_id` RPC; (0.2) extend `docs/invites.md` with function sketches
for `accept_invitation`, `decline_invitation`, and `add_circle_by_id`, and note
that the policy-change cascade is deferred to step 8.

**Phase 1 — 0701: Relationships layer.** Create branch `0701_relationships`
from `0700_invites_circles_db`. Write its detailed plan with `/write-plan`.
Implement the `relationships` table, four RLS policies, trigger bindings,
`add_circle_by_email` and `add_circle_by_id` RPCs, and full pgTAP coverage.
Verify with `./scripts/check.sh`. Merge back.

**Phase 2 — 0702: Invitations layer.** Create branch `0702_invitations` from
the updated `0700_invites_circles_db`. Write its detailed plan with
`/write-plan`. Implement the `invitations` table, `invitations_select` RLS
policy, trigger binding, the three invite RPCs, and full pgTAP coverage.
Verify with `./scripts/check.sh`. Merge back.

**Phase 3 — Wrap up.** Run `./scripts/check.sh` on `0700_invites_circles_db`.
Tick step 7's checkbox in `plans/0000_implementation_order.md`. Merge
`0700_invites_circles_db` into `main` with `--no-ff`.

## Reference docs and skills

- **`docs/invites.md`** — canonical spec: invite flow, policy/block checks,
  function sketches for `add_circle_by_email` and `send_invitation`.
- **`docs/circles.md`** — circle model: one-directional, invisible, email-add
  mutual path, block semantics.
- **`docs/data-model.md`** — schema conventions (trigger patterns, RPC shape,
  `on delete cascade` vs `on delete set default` rationale), RLS catalogue,
  "What the app sees" endpoint listing.
- **`docs/testing.md`** — pgTAP conventions; positive and negative policy tests.
- **`.claude/skills/write-plan.md`** — sub-branch plan format.
- **`.claude/skills/writing-tasks.md`** — task format each sub-plan must follow.
