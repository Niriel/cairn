# Tasks

## Reference skills and docs

- **`.claude/skills/writing-sql.md`** — pgTAP conventions, fixture include pattern, `throws_ok`/`is`/`ok`/`results_eq` shapes, SQLSTATE cheat sheet, role-context pattern; SQLFluff conventions for migration files.
- **`docs/invites.md`** — canonical 8-step check sequence prose, function sketches for `send_invitation` / `accept_invitation` / `decline_invitation`, "Block always wins" prose.
- **`docs/data-model.md`** — schema conventions, RLS catalogue, trigger naming (`t05_`, `t20_`, `t40_`).
- **`docs/testing.md`** — pgTAP positive *and* negative cases for every new policy; fixture include path.
- **`plans/0701_relationships/TASKS.md`** — precedent for fixture path (`/db/tests/fixtures/…`), cross-scenario cleanup, role-context block, `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …)` pattern.

---

## Phase 0 — Reconcile docs

### [ ] 0.1 Reconcile trigger chart and `accept_invitation` sketch in `docs/`

**Created:** 2026-05-28T00:00:00Z
**Completed:**

**Why:** Two related doc gaps that Phase 1 will otherwise diverge
from. (a) `docs/data-model.md`'s "Triggers" paragraph (around line
618) names `t10_*, t20_*, t30_*` as the binding-prefix convention,
but the codebase already uses `t01_*` (freezes) and `t05_*`
(timestamps) — and Task 1.1 introduces `t40_block_declines_invitations`
as the first `t40_*` AFTER trigger. Documenting only `t10/t20/t30`
leaves the chart out of step with reality. (b) `docs/invites.md`'s
`accept_invitation` sketch INSERTs `(list_id, user_id, created_by)`
into `list_members` and passes `public.uid()` for `created_by`, but
`tg_set_attribution_list_members`'s INSERT branch unconditionally
overrides any supplied `created_by` — so the column is a no-op in
the column list, and the executor will (correctly) write the
two-column form in 0009. Aligning the sketch keeps the doc honest
and matches what the migration actually ships.

**Prerequisites:** None.

**Decisions:**
- Single commit covers both doc edits; both are pre-Phase-1
  reconciliation, both target `docs/`, and shipping them together
  keeps the doc commit-history coherent.
- Trigger-chart edit: rewrite the "Naming convention" paragraph to
  list the full set in use — `t01_*` (BEFORE freezes, fire first),
  `t05_*` (universal timestamp guard), `t10_*`/`t20_*` (per-table
  BEFORE attribution and modified_at work), `t40_*` (AFTER triggers
  whose row work depends on the post-change durable state, concrete
  example `t40_block_declines_invitations` on `relationships` from
  migration 0009). Note `t30_*` is currently unused and reserved
  for a future BEFORE slot. State that AFTER triggers follow the
  same alphabetical-firing-order rule as BEFORE triggers.
- `accept_invitation` sketch edit: drop `created_by` from the
  INSERT column list (and the matching `public.uid()` value), so
  the sketch reads
  `INSERT INTO public.list_members (list_id, user_id) VALUES
  (inv.list_id, public.uid()) ON CONFLICT (list_id, user_id) DO
  UPDATE SET deleted_at = null, deleted_by = null;`. Add a one-line
  comment immediately above noting that
  `tg_set_attribution_list_members` fills `created_by` on the
  fresh-INSERT path and preserves it on the restore path.
- No code changes in this task. The migration that *uses* the
  `t40_*` prefix and the two-column INSERT lands in Phase 1.

**Files:**
- `docs/data-model.md` (modify)
- `docs/invites.md` (modify)

**Steps:**
1. In `docs/data-model.md` "Triggers" → "Naming convention"
   paragraph, rewrite the sentence that lists `t10_*, t20_*, t30_*`
   so it covers the full set in use: `t01_*` (BEFORE freezes,
   fire first), `t05_*` (universal timestamp guard), `t10_*` and
   `t20_*` (per-table BEFORE work), and `t40_*` (AFTER triggers,
   concrete example `t40_block_declines_invitations` on
   `relationships` from migration 0009). Note `t30_*` is reserved
   for a future BEFORE slot. Add that AFTER triggers follow the
   same alphabetical-firing-order rule.
2. In `docs/invites.md` "The `accept_invitation` function (sketch)"
   block, change the INSERT from three columns
   (`list_id, user_id, created_by`) to two (`list_id, user_id`),
   drop the matching `public.uid()` value, and prepend a one-line
   comment: `-- created_by is stamped by tg_set_attribution_list_members:`
   `-- public.uid() on fresh INSERT, preserved on restore via tombstone-`
   `-- gated freeze.`
3. Commit: `docs(triggers): document full t01/t05/t10/t20/t40 chart and align accept_invitation sketch`.

**Verify:** `grep -n "t40_block_declines_invitations" docs/data-model.md`
returns a match. `grep -n "created_by" docs/invites.md` shows the
`accept_invitation` sketch INSERT no longer names the column in its
column list (the surrounding prose may still mention `created_by`,
which is fine).

---

## Phase 1 — Migration, RPCs, trigger, tests

### [ ] 1.1 Write pgTAP and implement migration 0009_invitations.sql

**Created:** 2026-05-28T09:11:38Z
**Completed:**

**Why:** TDD in a single commit. Per `.claude/skills/writing-tasks.md`,
RED and GREEN for the same logic live in the same task — a commit at the
end of a RED-only task is broken code. This task writes the pgTAP
assertions first (they fail because the table, RPCs, and trigger don't
exist yet), then implements the migration to make them green, all in
one commit. Same shape as `0701_relationships/TASKS.md` 1.1.

**Prerequisites:** Branch `0702_invitations` checked out (cut from
`0700_invites_circles_db` after 0701 merged — `relationships` table and
the two circle RPCs are present). Fixtures
`db/tests/fixtures/users_alice_bob_carol.sql`,
`db/tests/fixtures/list_solo_alice.sql`, and
`db/tests/fixtures/list_shared_alice_bob.sql` exist (they do).

**Decisions:**

*Migration shape:*
- File: `db/migrations/0009_invitations.sql`. Single `BEGIN; … COMMIT;`
  transaction (matches `0004_domain_schema.sql` and
  `0008_relationships.sql`).
- Body order:
  1. `CREATE TABLE public.invitations` — columns in canonical order
     per R1 (`id, list_id, created_by, target_user_id, target_email,
     created_at, modified_at`) with the FKs and the CHECK
     `(target_user_id is not null or target_email is not null)`.
  2. `CREATE UNIQUE INDEX invitations_target_user_uniq ON
     public.invitations (list_id, target_user_id) WHERE target_user_id
     IS NOT NULL;`
  3. `CREATE UNIQUE INDEX invitations_target_email_uniq ON
     public.invitations (list_id, lower(target_email)) WHERE
     target_email IS NOT NULL AND target_user_id IS NULL;`
  4. `ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;`
  5. `GRANT SELECT ON public.invitations TO authenticated;` (no
     INSERT/UPDATE/DELETE grants — RPCs only).
  6. Trigger binding: `CREATE TRIGGER t05_set_timestamps BEFORE INSERT
     OR UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION
     public.tg_set_timestamps();`. No `tg_set_modified_at` binding —
     `invitations` has no mutable payload columns in v1.
  7. RLS policy `invitations_select` per R3.
  8. `CREATE OR REPLACE FUNCTION public.send_invitation(p_list_id
     uuid, p_email text DEFAULT NULL, p_user_id uuid DEFAULT NULL)
     RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path
     = public, auth AS $$ … $$;` Then `REVOKE ALL ON FUNCTION
     public.send_invitation(uuid, text, uuid) FROM public; GRANT
     EXECUTE ON FUNCTION public.send_invitation(uuid, text, uuid) TO
     authenticated;`.
  9. `accept_invitation` — same `REVOKE/GRANT` pair. `search_path = public`.
  10. `decline_invitation` — same `REVOKE/GRANT` pair. `search_path = public`.
  11. `CREATE OR REPLACE FUNCTION public.tg_block_declines_invitations()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path
      = public AS $$ BEGIN IF NEW.status = 'blocked' THEN DELETE FROM
      public.invitations WHERE created_by = NEW.other_user_id AND
      target_user_id = NEW.user_id; END IF; RETURN NEW; END; $$;`
  12. `CREATE TRIGGER t40_block_declines_invitations AFTER INSERT OR
      UPDATE OF status ON public.relationships FOR EACH ROW EXECUTE
      FUNCTION public.tg_block_declines_invitations();`

*RPC bodies — locked-in details:*
- `send_invitation` step 1 uses `public.is_list_member(p_list_id)`
  (the helper from `0004_domain_schema.sql`). If false → `RAISE
  EXCEPTION 'not a list member'`. The helper already runs as the
  invoker's identity via `public.uid()`, but `send_invitation` is
  `SECURITY DEFINER` — must verify the helper reads `public.uid()`
  inside, not the function-owner's identity. (It does; see
  `0004_domain_schema.sql`.)
- Step 4 (existing-membership): `EXISTS (SELECT 1 FROM
  public.list_members WHERE list_id = p_list_id AND user_id = target
  AND deleted_at IS NULL)`. The `deleted_at IS NULL` clause is what
  makes a soft-deleted member treated as non-member; without it the
  test for "soft-deleted member can be re-invited" would fail.
- Step 5 (existing-invite) returns the *existing* invitation id, not
  null. Pattern:
  ```sql
  if target is not null then
    select id into invitation_id from public.invitations
    where list_id = p_list_id and target_user_id = target;
  else
    select id into invitation_id from public.invitations
    where list_id = p_list_id and target_user_id IS NULL
      and lower(target_email) = lower(p_email);
  end if;
  if invitation_id is not null then
    return invitation_id;
  end if;
  ```
- Step 8 INSERT uses the EXCEPTION-with-SELECT pattern for the TOCTOU:
  ```sql
  begin
    insert into public.invitations (list_id, created_by, target_user_id, target_email)
    values (p_list_id, inviter, target,
            case when target is null then p_email else null end)
    returning id into invitation_id;
  exception when unique_violation then
    if target is not null then
      select id into invitation_id from public.invitations
      where list_id = p_list_id and target_user_id = target;
    else
      select id into invitation_id from public.invitations
      where list_id = p_list_id and target_user_id IS NULL
        and lower(target_email) = lower(p_email);
    end if;
  end;
  return invitation_id;
  ```
- `accept_invitation` body:
  ```sql
  select * into inv from public.invitations where id = p_invitation_id;
  if not found then raise exception 'invitation not found'; end if;
  if inv.target_user_id is distinct from public.uid() then
    raise exception 'not your invitation';
  end if;
  insert into public.list_members (list_id, user_id)
  values (inv.list_id, public.uid())
  on conflict (list_id, user_id) do update
    set deleted_at = null, deleted_by = null;
  delete from public.invitations where id = p_invitation_id;
  ```
  `tg_set_attribution_list_members` (BEFORE INSERT trigger from
  `0004_domain_schema.sql`) unconditionally overwrites `created_by`
  to `public.uid()` on INSERT, so passing only `(list_id, user_id)`
  is correct — the trigger fills in the acceptor as `created_by`.
- `decline_invitation` body: fetch + `IS DISTINCT FROM` guard +
  hard-delete. Same `IS DISTINCT FROM` rule as accept; raises on
  email-keyed invitations because `NULL IS DISTINCT FROM uid()` is
  true.

*Test counts — explicitly not pre-pinned:*
- New test file `db/tests/invitations.sql` uses `SELECT * FROM
  no_plan();` at the top instead of `SELECT plan(N)`. We don't track
  the assertion count in the plan; what matters is that every
  assertion below passes. Adding or removing an assertion later is a
  one-line edit instead of a count-then-bump dance.
- For the two existing files (`schema_shape.sql`, `grants.sql`), bump
  each existing `plan(N)` to whatever `./scripts/test-db.sh` reports
  after the new assertions are added. We do not pre-compute the new
  N here. New assertion content:
  - `schema_shape.sql` — `has_table('public', 'invitations', …)`;
    `has_column` for `id, list_id, created_by, target_user_id,
    target_email, created_at, modified_at`; `has_function` for
    `send_invitation(uuid, text, uuid)`, `accept_invitation(uuid)`,
    `decline_invitation(uuid)`.
  - `grants.sql` — positives: SELECT on invitations for
    authenticated, EXECUTE on each of the three RPCs for
    authenticated. Negatives for anon: no SELECT on invitations, no
    EXECUTE on any of the three RPCs.

*Test fixtures and context:*
- Use Alice UUID `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`, Bob UUID
  `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`, Carol UUID
  `cccccccc-cccc-cccc-cccc-cccccccccccc` from the canonical fixture.
  For the non-existent-UUID assertion (scenario F below), use
  `ffffffff-ffff-ffff-ffff-ffffffffffff` — **never** the tombstone
  `00000000-0000-0000-0000-000000000000` (the tombstone is a valid
  `auth.users` row seeded by `0004_domain_schema.sql:63–65`, so the
  FK would not fire and the test would fail silently for the wrong
  reason).
- `RAISE EXCEPTION '…'` without an explicit `USING ERRCODE` lands as
  SQLSTATE `P0001` (`raise_exception`). All RPC `raise`-from-text
  assertions in `throws_ok` should pin `P0001`. The `auth.users` FK
  on `target_user_id` raises SQLSTATE `23503` (foreign_key_violation)
  when `p_user_id` is a non-existent UUID — the RPC does not pre-check
  this case (R4 step 2 says "From `p_user_id` directly"), so the FK
  raises naturally. Pin `23503` for that assertion.
- `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims',
  json_build_object('sub', '<uid>')::text, true)` for RLS / RPC
  invocation context. `RESET ROLE` between scenarios that need
  superuser reads to check post-effect state.
- **Cross-scenario cleanup convention.** Between scenarios, as
  superuser:
  1. `DELETE FROM public.invitations;` — full wipe; nothing in any
     fixture seeds this table.
  2. `DELETE FROM public.relationships;` — full wipe; same.
  3. `DELETE FROM public.list_members WHERE NOT (list_id =
     '22222222-2222-2222-2222-222222222222' AND user_id =
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');` — preserves Alice's
     solo-list membership from the `list_solo_alice.sql` fixture so
     subsequent scenarios' inviter-membership guard still passes.
     Equivalent alternative: do a full `DELETE` and then re-include
     `\i /db/tests/fixtures/list_solo_alice.sql` (the fixture's
     `ON CONFLICT DO NOTHING` makes re-inclusion idempotent). Pick
     one and stick with it.
  4. `UPDATE public.user_settings SET invite_policy = 'everybody'
     WHERE id IN ('aaaaaaaa-…', 'bbbbbbbb-…', 'cccccccc-…');` —
     resets policy back to the default so scenarios after J / K / L
     (which mutate Bob's policy) don't read stale state.

  State this convention once at the top of the file as a comment,
  and place the four cleanup statements at the start of every
  scenario's setup. RLS would otherwise scope a non-superuser DELETE
  (which is why we `RESET ROLE` first).

  **`RESET ROLE` does not clear GUCs.** `request.jwt.claims` is a
  session GUC; the `set_config(…, TRUE)` calls in fixtures and prior
  scenarios persist across `RESET ROLE`. Every scenario's setup must
  re-issue `SELECT set_config('request.jwt.claims', '{"sub":"<uid>"}',
  TRUE);` for the acting identity *before* `SET LOCAL ROLE
  authenticated` — relying on a fixture's claim or a prior scenario's
  claim is how scenarios after J/K/L (which switch to Bob) silently
  end up acting as Bob in subsequent setups. Either re-include
  `list_solo_alice.sql` (which re-sets claims to Alice) or call
  `set_config` directly with the right uid; either is fine, but the
  step must be explicit per scenario.

**Reference:** `docs/invites.md` → "The `send_invitation` function
(sketch)", "The `accept_invitation` function (sketch)", "The
`decline_invitation` function (sketch)" for the canonical SQL.
`0008_relationships.sql` for the migration shape, REVOKE/GRANT
pattern, and trigger-binding conventions. `0004_domain_schema.sql`
for `is_list_member`, `tg_set_attribution_list_members`,
`tg_set_timestamps` (the existing helpers and trigger functions this
migration relies on).

**Files:**
- `db/tests/invitations.sql` (create — uses `SELECT * FROM no_plan();`)
- `db/tests/schema_shape.sql` (modify — add the `has_table`,
  `has_column`, `has_function` assertions listed in step 2; bump the
  file's existing `SELECT plan(N)` to match the new total reported by
  `./scripts/test-db.sh`)
- `db/tests/grants.sql` (modify — add the positive/negative grant
  assertions listed in step 3; same "bump `plan(N)` to whatever
  pgTAP reports" rule)
- `db/migrations/0009_invitations.sql` (create)

**Steps:**

1. RED — Create `db/tests/invitations.sql`. Structure:
   ```sql
   BEGIN;
   SELECT no_plan();
   \i /db/tests/fixtures/users_alice_bob_carol.sql
   \i /db/tests/fixtures/list_solo_alice.sql      -- list owned by Alice
   … assertions …
   SELECT finish();
   ROLLBACK;
   ```
   `no_plan()` (rather than `plan(N)`) lets us add or remove
   assertions without re-counting; what matters is that every
   assertion below passes, not that we hit a specific count.
   **Scalar call form** (`SELECT no_plan();` / `SELECT finish();`,
   not `SELECT * FROM no_plan();` / `SELECT * FROM finish();`) —
   `.claude/skills/writing-sql.md` "Rules that catch real issues"
   pins this: AM04 trips on the table-form, and every existing
   test file (`relationships.sql`, `schema_shape.sql`, `grants.sql`)
   uses the scalar form.
   Write the following assertion groups (numbered for traceability;
   any sub-list `N.a`/`N.b` denotes a positive/negative pair within
   one logical case):

   **A. `invitations_select` RLS (3 assertions)**
   - Setup: as superuser, insert one invite `(list_alice, Alice, Bob,
     null)` (inviter=Alice, invitee=Bob) into `public.invitations`.
   - A1: Alice (inviter) selects her sent invitations — count = 1.
   - A2: Bob (invitee) selects invitations addressed to him — count = 1.
   - A3: Carol (outsider) sees nothing — count = 0.

   **B. `send_invitation` — happy path (3 assertions)**
   - Setup (clean): Alice owns `list_alice` (from fixture); Bob has
     `invite_policy = 'everybody'` (default from `user_settings`).
   - B1: as Alice, `send_invitation(list_alice, p_user_id := Bob)`
     returns a non-null uuid.
   - B2: a row exists in `invitations` with `created_by = Alice,
     target_user_id = Bob, target_email IS NULL, list_id = list_alice`.
   - B3: re-calling `send_invitation(list_alice, p_user_id := Bob)`
     returns the *same* uuid (idempotency / step-5 existing-invite check).

   **C. `send_invitation` — inviter-membership check (1 assertion)**
   - Setup: a list owned by Carol (Alice is not a member). Use an ad-hoc
     INSERT as superuser for this scenario rather than relying on a
     fixture.
   - C1: as Alice, `send_invitation(carol_list, p_user_id := Bob)` →
     `throws_ok` SQLSTATE `P0001`.

   **D. `send_invitation` — self-invite (1 assertion)**
   - D1: as Alice, `send_invitation(list_alice, p_user_id := Alice)`
     → `throws_ok` `P0001`.

   **E. `send_invitation` — missing args (1 assertion)**
   - E1: as Alice, `send_invitation(list_alice, p_email := null,
     p_user_id := null)` → `throws_ok` `P0001`.

   **F. `send_invitation` — non-existent UUID (1 assertion)**
   - F1: as Alice, `send_invitation(list_alice, p_user_id :=
     'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)` → `throws_ok`
     SQLSTATE `23503` (foreign_key_violation from `target_user_id` FK
     to `auth.users`). **Do not use the tombstone UUID
     `00000000-…` here** — the tombstone is a valid `auth.users` row
     and would not trigger the FK.

   **G. `send_invitation` — existing live membership (1 assertion)**
   - Setup: insert `(list_alice, Bob, …)` into `public.list_members`
     as a live (non-soft-deleted) member.
   - G1: as Alice, `send_invitation(list_alice, p_user_id := Bob)` →
     `throws_ok` `P0001`.

   **H. `send_invitation` — soft-deleted membership treated as non-member (2 assertions)**
   - Setup: insert `(list_alice, Bob, …)` into `public.list_members`
     with `deleted_at = now()`.
   - H1: as Alice, `send_invitation(list_alice, p_user_id := Bob)`
     returns a non-null uuid (invite proceeds).
   - H2: an `invitations` row exists for `(list_alice, Bob)`.

   **I. `send_invitation` — block (1 assertion)**
   - Setup: insert `(Bob, Alice, 'blocked')` into `public.relationships`
     as superuser (Bob has Alice blocked).
   - I1: as Alice, `send_invitation(list_alice, p_user_id := Bob)`
     returns NULL.

   **J. `send_invitation` — policy = 'nobody' (1 assertion)**
   - Setup: update Bob's `user_settings.invite_policy` to `'nobody'`.
   - J1: as Alice, `send_invitation(list_alice, p_user_id := Bob)`
     returns NULL.

   **K. `send_invitation` — policy = 'circle', not in circle (1 assertion)**
   - Setup: Bob's `invite_policy = 'circle'`. No `relationships` row
     `(Bob, Alice, 'circle')` exists.
   - K1: as Alice, `send_invitation(list_alice, p_user_id := Bob)`
     returns NULL.

   **L. `send_invitation` — policy = 'circle', in circle (1 assertion)**
   - Setup: Bob's `invite_policy = 'circle'`; insert `(Bob, Alice,
     'circle')` into `relationships`.
   - L1: as Alice, `send_invitation(list_alice, p_user_id := Bob)`
     returns a non-null uuid (invite proceeds).

   **M. `send_invitation` — email-keyed, unregistered email (3 assertions)**
   - M1: as Alice, `send_invitation(list_alice, p_email :=
     'nobody@example.com')` returns a non-null uuid (policy/block
     checks skipped for unregistered).
   - M2: an `invitations` row exists with `target_user_id IS NULL,
     target_email = 'nobody@example.com'`.
   - M3: re-calling `send_invitation(list_alice, p_email :=
     'nobody@example.com')` returns the *same* uuid (step-5
     idempotency on the `target_user_id IS NULL AND
     lower(target_email) = lower(p_email)` branch — parallel to O1
     for the user-keyed path).

   **N. `send_invitation` — both p_email and p_user_id non-null, p_user_id wins (1 assertion)**
   - N1: as Alice, `send_invitation(list_alice, p_email :=
     'irrelevant@example.com', p_user_id := Bob)` returns a uuid; the
     resulting row has `target_user_id = Bob` and `target_email IS NULL`.

   **O. `send_invitation` — step-5 idempotency under pre-existing invitation (2 assertions)**
   - Setup: as superuser, directly INSERT a row `(list_alice, Alice,
     Bob, null)` into `public.invitations`, bypassing the RPC. This
     exercises the step-5 short-circuit, **not** the
     EXCEPTION-with-SELECT branch — the latter is unreachable from a
     single-session pgTAP test because the RPC's step-5 SELECT sees
     the pre-inserted row and returns before step 8 ever runs. Don't
     pretend a unit test covers the EXCEPTION arm; its correctness
     rests on code review against the step-5 retrieval predicate.
   - O1: as Alice, `send_invitation(list_alice, p_user_id := Bob)`
     returns the same uuid as the pre-inserted row (step-5
     idempotency).
   - O2: only one `invitations` row exists for `(list_alice, Bob)` —
     count = 1.

   **P. `accept_invitation` — happy path (3 assertions)**
   - Setup: as superuser, insert `(list_alice, Alice, Bob, null)`
     into `invitations`. Capture the invitation id.
   - P1: as Bob, `accept_invitation(inv_id)` returns without error.
   - P2: a `list_members` row exists with `list_id = list_alice,
     user_id = Bob, created_by = Bob, deleted_at IS NULL`.
   - P3: the `invitations` row is gone (count = 0).

   **Q. `accept_invitation` — restores soft-deleted membership (3 assertions)**
   - Setup: insert a soft-deleted `(list_alice, Bob, …, deleted_at =
     now())` into `list_members`. Insert `(list_alice, Alice, Bob,
     null)` into `invitations`.
   - Q1: as Bob, `accept_invitation(inv_id)` returns without error.
   - Q2: the `list_members` row now has `deleted_at IS NULL` and
     `deleted_by IS NULL`.
   - Q3: the `invitations` row is gone.

   **R. `accept_invitation` — wrong caller (1 assertion)**
   - Setup: insert `(list_alice, Alice, Bob, null)`. As Carol,
     `accept_invitation(inv_id)` → `throws_ok` `P0001`.

   **S. `accept_invitation` — not found (1 assertion)**
   - S1: as Bob, `accept_invitation('00000000-…'::uuid)` → `throws_ok`
     `P0001`.

   **T. `accept_invitation` — email-keyed invitation raises (1 assertion)**
   - Setup: insert `(list_alice, Alice, NULL, 'bob@test.cairn')`.
   - T1: as Bob (with the same email), `accept_invitation(inv_id)` →
     `throws_ok` `P0001`. Verifies `IS DISTINCT FROM` guard catches
     the NULL `target_user_id` case.

   **U. `decline_invitation` — happy path (1 assertion)**
   - Setup: insert `(list_alice, Alice, Bob, null)`. As Bob,
     `decline_invitation(inv_id)`. Assert the `invitations` row is
     gone.

   **V. `decline_invitation` — error cases (4 assertions)**
   - V1: wrong caller (Carol) → `throws_ok` `P0001`.
   - V2: inviter trying to decline (Alice) → `throws_ok` `P0001`.
   - V3: not found → `throws_ok` `P0001`.
   - V4: email-keyed invitation → `throws_ok` `P0001` (verifies
     `IS DISTINCT FROM` guard).

   **W. Block auto-decline — INSERT path (2 assertions)**
   - Setup: as superuser, insert `(list_alice, Bob, Alice, null)`
     into `invitations` (Bob invited Alice) *and* a separate row
     `(list_alice, Bob, Carol, null)` for the negative scope check.
     Then as Alice (`SET LOCAL ROLE authenticated` + JWT), INSERT
     `(Alice, Bob, 'blocked')` into `public.relationships` (Alice
     has no prior relationships row for Bob).
   - **`RESET ROLE` before W1 and W2** so the count SELECTs run as
     superuser (`invitations_select` is `created_by = uid() OR
     target_user_id = uid()`; under Alice's role she cannot see the
     Carol-addressed row at all, which would falsely-green W2 even
     if the trigger over-deleted).
   - W1: the pending invitation from Bob to Alice is gone (count = 0).
   - W2: a pending invitation to a *different* user
     (`(list_alice, Bob, Carol, null)`) is *not* deleted — locks
     the scope of the trigger (only `created_by = NEW.other_user_id
     AND target_user_id = NEW.user_id` rows are affected).

   **X. Block auto-decline — UPDATE path (1 assertion)**
   - Setup: as Alice, insert `(Alice, Bob, 'circle')` into
     `relationships`. Then insert `(list_alice, Bob, Alice, null)`
     into `invitations` as superuser. Then as Alice, UPDATE
     `relationships SET status = 'blocked' WHERE user_id = Alice AND
     other_user_id = Bob`.
   - `RESET ROLE` before X1's count SELECT (same reasoning as W —
     keeps the assertion honest even on rows Alice happens to be
     able to see; uniform with W's pattern so the convention is
     applied consistently).
   - X1: the pending invitation from Bob to Alice is gone (count = 0).

   **Y. Block auto-decline — `status = 'circle'` is a no-op (2 assertions)**
   - Y1: as Alice, insert `(Alice, Bob, 'circle')` (no prior block-side
     setup). Then insert `(list_alice, Bob, Alice, null)` into
     `invitations` as superuser. Order is immaterial: the trigger
     fires on every INSERT into `relationships` but its
     `NEW.status = 'blocked'` guard makes it a no-op for `circle`-status
     rows. `RESET ROLE` before the SELECT (Alice can see Bob-to-Alice
     invites by RLS, but uniform with W/X for consistency). Assert
     the invitation row still exists.
   - Y2: as Alice, UPDATE `(Alice, Bob)` from `circle` to `circle`
     (a no-op UPDATE that still fires the AFTER UPDATE OF status
     trigger because `OF status` includes assignments even when value
     unchanged; verify the invitation row still exists — `NEW.status
     = 'blocked'` guard short-circuits).

   The file uses `SELECT * FROM no_plan();` at the top; we don't
   pre-count assertions or pin a `plan(N)` here. Adding or splitting
   a scenario later is a one-line change.

2. RED — Update `db/tests/schema_shape.sql`:
   - After the existing functions block, add:
     ```sql
     SELECT has_table('public', 'invitations', 'invitations table exists');
     SELECT has_column('public', 'invitations', 'id', …);
     SELECT has_column('public', 'invitations', 'list_id', …);
     SELECT has_column('public', 'invitations', 'created_by', …);
     SELECT has_column('public', 'invitations', 'target_user_id', …);
     SELECT has_column('public', 'invitations', 'target_email', …);
     SELECT has_column('public', 'invitations', 'created_at', …);
     SELECT has_column('public', 'invitations', 'modified_at', …);
     SELECT has_function('public', 'send_invitation', ARRAY['uuid','text','uuid'], …);
     SELECT has_function('public', 'accept_invitation', ARRAY['uuid'], …);
     SELECT has_function('public', 'decline_invitation', ARRAY['uuid'], …);
     ```
   - Bump the file's existing `SELECT plan(N)` to whatever pgTAP
     reports as the new total after these assertions are added. Run
     `./scripts/test-db.sh` to read the actual count; do not
     pre-compute it. (Switching the file to `no_plan()` is also fine
     if simpler.)

3. RED — Update `db/tests/grants.sql`:
   - In the authenticated-positives section, add:
     - `SELECT` on `public.invitations` for `authenticated`
     - `EXECUTE` on `send_invitation(uuid, text, uuid)` for
       `authenticated`
     - `EXECUTE` on `accept_invitation(uuid)` for `authenticated`
     - `EXECUTE` on `decline_invitation(uuid)` for `authenticated`
   - In the anon-negatives section, add:
     - No `SELECT` on `public.invitations` for `anon`
     - No `EXECUTE` on each of the three RPCs for `anon`
   - Bump the file's existing `SELECT plan(N)` to whatever pgTAP
     reports as the new total. Same "don't pre-count, let
     `./scripts/test-db.sh` tell you" rule as step 2.

4. RED — Run `./scripts/test-db.sh` and confirm the new assertions
   fail (`invitations` table doesn't exist; the three RPCs don't
   exist; the new grants assertions fail; the block-decline trigger
   isn't bound). **Do not commit yet** — the migration goes in
   alongside the tests.

5. GREEN — Create `db/migrations/0009_invitations.sql` with the full
   migration body per the Decisions block above. Single `BEGIN; …
   COMMIT;` transaction. Sections in the order listed (1–12).
   Function bodies follow the exact shapes in the Decisions block.

6. GREEN — Run `./scripts/test-db.sh` and confirm all new assertions
   pass — `invitations.sql`, `schema_shape.sql`, and `grants.sql`
   all green; the existing 0700-area tests stay green.

7. GREEN — Run `./scripts/check.sh` — full gauntlet. Resolve any
   sqlfluff or formatter complaints on the new migration file. Do
   not weaken any rule; per-line `-- noqa:` is fine when justified
   with a comment.

8. Commit a single commit:
   ```
   feat(db): add invitations table, invite RPCs, and block auto-decline trigger
   ```

**Verify:** `./scripts/test-db.sh` all green · `./scripts/check.sh` all green.
