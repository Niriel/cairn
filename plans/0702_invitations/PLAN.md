# Plan: Invitations table + invite RPCs + block auto-decline

Sub-step 7.2 of the master plan. Ships `db/migrations/0009_invitations.sql`
— the `invitations` table, one RLS policy, three invite RPCs, and the
`tg_block_declines_invitations` trigger that fires on `relationships` —
with comprehensive pgTAP coverage. Completes the Tier 3 invite/circle
data model and unblocks step 8 (frontend).

## Context

0701 shipped `relationships` and the two circle RPCs. The remaining
Tier 3 work is the invitation side. `send_invitation` is the most
complex function in the data model: an 8-step check sequence that
reads `list_members`, `relationships`, `user_settings`, and existing
`invitations` rows before deciding whether to insert. `accept_invitation`
mutates `list_members` in the same transaction as the invitation
delete. `tg_block_declines_invitations` is a cross-table trigger that
fires on `relationships` but writes to `invitations` — which is why
its binding lives in this migration rather than 0008.

The relevant docs are `docs/invites.md` (canonical sketches and the
8-step check sequence prose) and `docs/data-model.md` (schema
conventions, RLS catalogue, the "What the app sees" view of which
endpoints are RPC-mediated). The sketches in `docs/invites.md` are
illustrative — step 1 of the `send_invitation` check sequence (the
inviter-membership guard) is elided in the sketch but is required;
`REQUIREMENTS.md` R4 is the authoritative spec.

## Decisions

**Single migration file.** All of R1–R7 land in
`db/migrations/0009_invitations.sql` as one `BEGIN; … COMMIT;`
transaction. Splitting into 0009 (table) + 0010 (RPCs) + 0011 (trigger)
would create three commits' worth of churn for what's one cohesive
unit; the migration is small enough (one table, three functions, one
trigger function, one binding) to fit comfortably in a single file.
This matches 0008's shape (table + 2 RPCs + freeze trigger all in one
migration).

**EXCEPTION-with-SELECT over ON CONFLICT DO NOTHING for the step-8
TOCTOU.** Two ways to make step 8's INSERT idempotent under concurrent
duplicate writes:

- (a) Wrap the INSERT in `BEGIN … EXCEPTION WHEN unique_violation THEN
SELECT id INTO invitation_id FROM invitations WHERE …; END;`. The
  fallback SELECT reuses the same predicate as the unique indexes.
- (b) `INSERT … ON CONFLICT DO NOTHING RETURNING id`, then a follow-up
  SELECT when nothing was returned.

We pick (a). Rationale: the recovery branch executes only on the rare
losing-race case; in the steady state the `BEGIN … EXCEPTION` block
is a no-op (`plpgsql`'s exception block is a savepoint-per-block, but
the per-statement cost is negligible relative to the network round
trip). (b)'s `ON CONFLICT DO NOTHING RETURNING` has to deal with two
distinct partial unique indexes (`target_user_uniq` and
`target_email_uniq`); naming both in `ON CONFLICT` would awkwardly
list two index specs. (a) lets the database decide which index fired
and the SELECT predicate match either case naturally. Locked in
`REQUIREMENTS.md` R4.

**Trigger binding lives in 0009, not 0008.** `tg_block_declines_invitations`
reads/writes `public.invitations`, which doesn't exist in 0008. Binding
the trigger to `public.relationships` from 0009 is fine — Postgres
attaches the trigger to the table at binding time; the trigger
function's body only resolves `invitations` at fire time. No
backfill needed: at 0009-migration time there can't be any pre-existing
`(blocked, pending-invite)` pairs (invitations didn't exist a moment
ago).

**`SET search_path` differs per RPC.** `send_invitation` reads
`auth.users` (email resolution), so `search_path = public, auth`.
`accept_invitation` and `decline_invitation` only touch `public.*` so
`search_path = public`. `tg_block_declines_invitations` only touches
`public.invitations` so `search_path = public`. Each function pins
its own narrowest path, matching `0004_domain_schema.sql`'s and
`0008_relationships.sql`'s patterns.

**`IS DISTINCT FROM` is non-negotiable in `accept_invitation` and
`decline_invitation`.** R5 and R6 spell this out. The trap: `<>` against
NULL returns NULL, which PL/pgSQL `IF` treats as false, so the
invitee guard silently passes for an email-keyed invitation
(`target_user_id IS NULL`). `IS DISTINCT FROM` returns true in that
case and the guard raises. Both RPCs include pgTAP coverage of the
email-keyed-invitation-raises case so the trap can't sneak back in
under a refactor.

**`accept_invitation` uses `ON CONFLICT DO UPDATE`, not `DO NOTHING`.**
A previously-soft-deleted `list_members` row collides with the
`(list_id, user_id)` PK. `DO NOTHING` leaves `deleted_at` set, which
leaves the new member invisible to RLS (the `lists_members`
visibility predicate excludes soft-deleted rows). `DO UPDATE SET
deleted_at = null, deleted_by = null` restores the row and also
covers a concurrent-accept race.

**Trigger name `t40_block_declines_invitations`.** The relationships
table already has `t01_freeze_relationships_pk`, `t05_set_timestamps`,
and `t20_set_modified_at` from 0008. `t40_*` keeps the new trigger
sortable after the existing three. `AFTER` (not `BEFORE`) because the
trigger only needs the row state post-change; an `AFTER` trigger also
guarantees the `relationships` row is durable before any cascading
invitation delete happens, which matches the audit story ("the block
landed first; the invite-cleanup is a consequence"). `docs/data-model.md`'s
"Triggers" naming chart only lists `t10/t20/t30` examples — Phase 0
of this plan extends that paragraph so `t40_*` and AFTER triggers are
documented (concerns audit found this gap).

**`SELECT no_plan();` in `db/tests/invitations.sql`.** The plan
deliberately does not pre-compute the assertion count. pgTAP's
`no_plan()` lets the file declare assertions inline without us pinning
a `plan(N)` at the top — so adding, splitting, or trimming a test
later is a one-line edit instead of a count-then-bump dance. Scalar
call form (`SELECT no_plan();`, `SELECT finish();` — not
`SELECT * FROM …`): `.claude/skills/writing-sql.md` pins this under
AM04, and every existing `db/tests/*.sql` file (`relationships.sql`,
`schema_shape.sql`, `grants.sql`) follows it. The two existing files
this plan touches (`schema_shape.sql`, `grants.sql`) already use
`plan(N)` and that's fine — bump each `N` mechanically to whatever
`./scripts/test-db.sh` reports after the new assertions land; we do
not write the exact target count into this plan.

**Cross-scenario cleanup must preserve fixture-seeded rows.** Naïve
`DELETE FROM public.list_members` would wipe Alice's solo-list
membership row from `list_solo_alice.sql:40–42`, which most
scenarios then rely on for the inviter-membership guard (step 1 of
`send_invitation`). The cleanup pattern is therefore: between
scenarios, delete invitations and relationships in full, but scope
list*members and user_settings to \_test-inserted* rows only.
Equivalently — and the executor should prefer this — re-include the
fixture at the start of each scenario; the fixture's `ON CONFLICT DO
NOTHING` guards make re-inclusion idempotent. `user_settings` resets
for Alice/Bob/Carol back to `invite_policy = 'everybody'` are part of
the cleanup so scenarios after J/K/L don't read stale policy.

## Architecture

### New files

- **`db/migrations/0009_invitations.sql`** — the migration. Single
  `BEGIN; … COMMIT;` transaction containing the table, the unique
  indexes, the trigger binding for `t05_set_timestamps`, the
  `invitations_select` RLS policy, `GRANT SELECT … TO authenticated`,
  the three RPCs (with `REVOKE/GRANT EXECUTE`), and the
  `tg_block_declines_invitations` function plus its binding on
  `public.relationships`.

- **`db/tests/invitations.sql`** — the full pgTAP coverage from R8.
  Uses `users_alice_bob_carol.sql` and `list_solo_alice.sql`
  fixtures (the shared list isn't needed — every list-scoped
  scenario uses `list_alice` or an ad-hoc Carol-owned list inserted
  inline). Uses `SELECT no_plan();` rather than a pre-pinned
  `plan(N)`.

### Modified files

- **`db/tests/schema_shape.sql`** — add 10 assertions (R9). Bump
  `plan(64)` → `plan(74)`.
- **`db/tests/grants.sql`** — add 8 assertions (R9). Bump `plan(72)`
  → `plan(80)`.

### Migration file order

```sql
BEGIN;

-- 1. CREATE TABLE public.invitations …
-- 2. CREATE UNIQUE INDEX invitations_target_user_uniq …
-- 3. CREATE UNIQUE INDEX invitations_target_email_uniq …
-- 4. ALTER TABLE … ENABLE ROW LEVEL SECURITY
-- 5. GRANT SELECT ON public.invitations TO authenticated
-- 6. Trigger binding: t05_set_timestamps on invitations
-- 7. RLS policy: invitations_select
-- 8. send_invitation function (+ REVOKE/GRANT EXECUTE)
-- 9. accept_invitation function (+ REVOKE/GRANT EXECUTE)
-- 10. decline_invitation function (+ REVOKE/GRANT EXECUTE)
-- 11. tg_block_declines_invitations function
-- 12. Trigger binding: t40_block_declines_invitations on relationships

COMMIT;
```

### Test layer

DB-only change. No web, no Playwright. `./scripts/test-db.sh` is the
canonical verifier; `./scripts/check.sh` will also pass everything
else through (sqlfluff, shellcheck, shfmt, prettier, svelte-check) so
the migration file's formatting and the test file's SQL both lint
cleanly.

## Phase structure

Two phases. Phase 0 reconciles two doc gaps: `docs/data-model.md`'s
trigger-naming paragraph (which currently lists only `t10/t20/t30`
even though `t01_*` and `t05_*` are in active use, and Task 1.1
will introduce the first `t40_*` AFTER trigger on `relationships`)
and `docs/invites.md`'s `accept_invitation` sketch (which passes
`created_by` into the `list_members` INSERT even though
`tg_set_attribution_list_members` always overrides it on INSERT —
the migration writes the two-column form). Phase 1 is the same
shape as 0701: one task with RED-then-GREEN inside one commit. Per
`.claude/skills/writing-tasks.md`, RED and GREEN for the same logic
must live in the same task — a commit at the end of a RED-only task
would be broken code.

0. **Phase 0 — Reconcile docs (Task 0.1).** Rewrite the
   `docs/data-model.md` "Triggers → Naming convention" paragraph to
   list the full `t01/t05/t10/t20/t40` chart actually in use, and
   align the `docs/invites.md` `accept_invitation` sketch to the
   two-column INSERT the migration ships. One doc commit before
   Phase 1 so the migration matches both docs rather than
   contradicting them.
1. **Phase 1 — Migration, RPCs, trigger, tests (Task 1.1).**
   Write `db/tests/invitations.sql` plus the `schema_shape.sql` and
   `grants.sql` assertion additions, confirm red, then implement
   `db/migrations/0009_invitations.sql` and confirm green. One
   commit.

## Reference docs and skills

- **`docs/invites.md`** — canonical 8-step check sequence, function
  sketches for all three RPCs, "Block always wins" prose, RLS catalogue.
- **`docs/data-model.md`** — schema conventions (column ordering,
  trigger naming `t05_`/`t20_`/`t40_`), RLS catalogue, "What the app
  sees" endpoint list.
- **`docs/testing.md`** — pgTAP conventions, fixture pattern,
  positive/negative RLS rule.
- **`.claude/skills/writing-sql.md`** — pgTAP conventions, fixture
  include, `throws_ok`/`is`/`ok` shapes, SQLSTATE cheat sheet for
  PL/pgSQL `RAISE EXCEPTION` (lands as `P0001`), role-context pattern
  for RLS tests; SQLFluff conventions for migration files.
- **`plans/0701_relationships/TASKS.md`** — precedent for one-task
  shape, fixture include path (`/db/tests/fixtures/…`),
  cross-scenario cleanup pattern, role-context block.

## Non-requirements

(See `REQUIREMENTS.md` "Non-requirements" — same list.)
