# Tasks

## Reference skills and docs

- **`.claude/skills/write-plan.md`** — how to create a sub-plan directory (branch, number, slug, three files).
- **`plans/0700_invites_circles_db/REQUIREMENTS.md`** — full step-7 requirements (R1–R9).
- **`docs/invites.md`** — canonical spec: invite flow, policy/block checks, function sketches.
- **`docs/circles.md`** — circle model: one-directional, invisible, email-add mutual path.
- **`docs/data-model.md`** — schema conventions, trigger pattern, RLS catalogue, "What the app sees".
- **`docs/testing.md`** — pgTAP conventions; positive and negative policy tests.

---

## Phase 0 — Reconcile docs

### [x] 0.1 Update `docs/circles.md` to reflect `add_circle_by_id` RPC

**Created:** 2026-05-27T00:00:00Z
**Completed:** 2026-05-28T06:00:01Z

**Why:** `circles.md` says "direct insert, no stored procedure needed" for the
one-sided tap-add. The master plan and `data-model.md`'s endpoint list both
treat `add_circle_by_id` as a `security definer` RPC. The contradiction will
confuse the 0701 executor and any future reader. Fixing it here prevents the
ambiguity from entering the sub-plan.

**Prerequisites:** `0700_invites_circles_db` branch exists and is checked out.

**Decisions:**
- `circles.md` does **not** contain the "direct insert" sentence (it was in
  `invites.md`; removal is handled in task 0.2). The gap in `circles.md` is
  different: the "In the data model" section mentions `add_circle_by_email` but
  says nothing about the one-sided tap-add path. Add a sentence after the
  `add_circle_by_email` reference that names `add_circle_by_id` explicitly, so
  both circle-write paths are documented in the same section.
- No other changes to `circles.md` in this task.

**Files:**
- `docs/circles.md` (modify)

**Steps:**
1. In `docs/circles.md` "In the data model" section, after the sentence "The
   email-add path writes a row in the *other* direction via a `security definer`
   function (`add_circle_by_email`), bypassing RLS as needed but performing the
   block-check first.", add a new sentence: "The one-sided tap-add path goes
   through the `add_circle_by_id` RPC — a thin `security definer` function that
   performs the same `ON CONFLICT DO UPDATE WHERE status <> 'blocked'` upsert,
   so trying to circle-add a user you have blocked leaves the blocked row
   unchanged."
2. Commit: `docs(circles): document add_circle_by_id tap-add path in data model section`.

**Verify:** `grep -n "add_circle_by_id" docs/circles.md` returns at least one match.

---

### [x] 0.2 Add missing function sketches to `docs/invites.md`

**Created:** 2026-05-27T00:00:00Z
**Completed:** 2026-05-28T06:04:17Z

**Why:** `invites.md` provides full sketches for `add_circle_by_email` and
`send_invitation` but mentions `accept_invitation`, `decline_invitation`, and
`add_circle_by_id` without showing their bodies. The 0701 and 0702 sub-plan
executors need these sketches to implement correctly, and the doc should be
authoritative before the code.

**Prerequisites:** Task 0.1 merged — `0700_invites_circles_db` contains the
`circles.md` update. **Before executing steps: check the current state of
`docs/invites.md`** — the working tree may already contain partial edits
(specifically `invitation_id uuid;` in the `send_invitation` declare block and
an updated step-2 paragraph in the check sequence); apply only the steps that
haven't already been applied.

**Decisions:**
- Add a brief `add_circle_by_id` sketch directly after the `add_circle_by_email`
  block, showing the one-sided upsert and the self-add guard.
- Remove the "tap_add is a direct insert" paragraph at the bottom of the
  `add_circle_by_email` sketch section — that text contradicts the plan's
  decision that `add_circle_by_id` is the RPC.
- Add `accept_invitation` and `decline_invitation` sketches after the
  `send_invitation` block (fetch + validate caller = invitee + perform action).
- Add a short paragraph after "Pending-invite cap" noting that the policy-change
  cascade is deferred to step 8.
- Fix the check sequence and "Block always wins" prose (see steps 3 and 4).
- Keep sketches at the same level of detail as the existing ones — illustrative
  SQL, not final production code. The canonical SQL lives in the migration files.

**Files:**
- `docs/invites.md` (modify)

**Steps:**
1. In the existing `send_invitation` sketch `declare` block, add
   `invitation_id uuid;` — the variable is used in `returning id into
   invitation_id` but is not declared. (Skip if already present.)
2. Replace the entire "What invite_policy and blocks check, in order" numbered
   list with the following eight-step target state (verify against the current
   doc — step 1 and the Resolve target position are the additions; the rest is
   renumbered):
   1. **Inviter-membership check.** If the caller is not a live member of the
      list: raise — cannot invite to a list you're not on. (`send_invitation` is
      `SECURITY DEFINER` and bypasses RLS, so this must be an explicit guard.)
   2. **Resolve target.** Look up `p_email` in `auth.users` (or use `p_user_id`
      directly). If email-keyed and no Cairn account matches, proceed directly to
      the insert step — all policy, block, and membership checks are skipped for
      unregistered addresses.
   3. **Self-check.** If the invitee resolves to Alice herself: clear error,
      "You're already on this list" or "You can't invite yourself." (No privacy
      concern; honesty wins.)
   4. **Existing membership.** If Bob is already a *live* member of this list:
      no-op; Alice sees "Bob is already on this list." A previously-removed
      (soft-deleted) membership row is treated as non-membership.
   5. **Existing pending invitation.** If Bob already has a pending invite to
      this list from anyone: no-op; Alice sees a generic success message.
   6. **Block check.** If Bob has Alice on his blocklist: invite fails with the
      generic error.
   7. **Policy check.** If Bob's `invite_policy` is `nobody`: invite fails. If
      `circle`: check whether Alice is in Bob's circle; if not, fail. If
      `everybody`: pass.
   8. **Success.** Insert an `invitations` row.
3. In the § "Block always wins" subsection, replace the paragraph beginning "The
   blocklist is checked *after* the policy" with a corrected paragraph reflecting
   the single-table design: "With the combined `relationships` table (`status` is
   either `'circle'` or `'blocked'`, never both), 'block always wins' manifests
   in two places: (1) in `send_invitation`, the block check (step 6 above) tests
   for a row with `status = 'blocked'` *before* the policy check; (2) in
   `add_circle_by_id` and `add_circle_by_email`, the `ON CONFLICT DO UPDATE WHERE
   status <> 'blocked'` clause silently skips the circle-add if a blocked row
   already exists, leaving the blocked row unchanged. Either path preserves the
   block." Remove the two sub-bullets that follow (they describe an impossible
   state — you cannot simultaneously have circle and blocked status in one row).
4. At the bottom of the `add_circle_by_email` sketch section (after the closing
   `$$;`), remove the sentence beginning "The `tap_add` (one-sided) path is a
   direct insert from the client — no stored procedure needed, since Alice is
   only writing her own row…" and the rest of that paragraph. The paragraph was
   accurate under a two-table design but is now misleading — tap-add goes through
   `add_circle_by_id`.
5. After the `add_circle_by_email` sketch block, insert an `add_circle_by_id`
   sketch section showing: self-add guard, then the one-sided `INSERT … ON
   CONFLICT DO UPDATE WHERE status <> 'blocked'` upsert.
6. After the `send_invitation` sketch block, insert `accept_invitation` (fetch
   row + validate `target_user_id = uid()` using `IS DISTINCT FROM` +
   `INSERT … ON CONFLICT (list_id, user_id) DO UPDATE SET deleted_at = null,
   deleted_by = null` + hard-delete invitation, all in one transaction) and
   `decline_invitation` (fetch + validate with `IS DISTINCT FROM` + hard-delete)
   sketch sections. Add a code comment in each sketch at the validate step noting
   the `IS DISTINCT FROM` requirement, e.g., `-- IS DISTINCT FROM, not <>,
   -- so NULL target_user_id (email-keyed) correctly raises`.
7. At the top of the `send_invitation` sketch's `begin` block, add the comment:
   `-- Step 1: raise if caller is not a live member of p_list_id`
   `--   (inviter-membership check — see check sequence above; elided here).`
   This anchors the eight-step check sequence to the sketch so future readers
   know the sketch is deliberately incomplete.
8. After the "Pending-invite cap" section, add: "**Policy-change cascade
   (deferred).** When a user changes `invite_policy` from `everybody` to `circle`
   or `nobody`, existing non-matching pending invites should be auto-declined.
   This behaviour is documented above but its DB-level enforcement is deferred to
   step 8; the step-7 DB layer leaves it to the client or a future trigger."
9. Commit: `docs(invites): fix check sequence, block-always-wins prose, add sketches for accept/decline/add_circle_by_id`.

**Verify:** `grep -n "add_circle_by_id\|accept_invitation\|decline_invitation" docs/invites.md`
returns at least one hit for each function name. `grep -n "direct insert" docs/invites.md`
returns no match.

---

## Phase 1 — 0701: Relationships layer

### [ ] 1.1 Plan and implement sub-step 0701 (relationships table + circle RPCs)

**Created:** 2026-05-27T00:00:00Z

**Why:** The `relationships` table and circle RPCs are the foundation for the
entire invite model. `send_invitation` (0702) reads `relationships` rows for its
block and circle checks; the table must therefore be fully in place — and its
RLS verified by pgTAP — before 0702 can be correctly implemented. This is also
the simpler of the two sub-plans (no cross-table transaction).

**Prerequisites:** Phase 0 merged — `0700_invites_circles_db` contains both doc
updates.

**Decisions:**
- Sub-branch is cut from `0700_invites_circles_db`, not from `main`.
- Scope: `db/migrations/0008_relationships.sql` (table + trigger bindings + 4
  RLS policies + 2 RPCs + `GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.relationships TO authenticated`); `db/tests/relationships.sql` (full
  pgTAP); updates to `db/tests/schema_shape.sql` and `db/tests/grants.sql`
  (add table-level grant assertions for `relationships` in addition to the EXECUTE
  grants for both RPCs; update the `plan(N)` count to match).
- Migration must bind the existing `tg_set_timestamps` and `tg_set_modified_at`
  trigger functions (defined in `0004_domain_schema.sql`) to the new table —
  do not redefine them, just add the `CREATE TRIGGER` bindings.
- The `tg_set_modified_at` binding uses `BEFORE UPDATE OF status ON
  relationships` matching the `OF (cols)` pattern from every other table.
- Name the bindings `t05_set_timestamps` and `t20_set_modified_at`
  (unsuffixed — Postgres scopes trigger names per-table, and every other
  timestamped table in `0004_domain_schema.sql:514–576` and
  `0007_avatars.sql:70` reuses the same binding name; following the
  `t05_` / `t20_` prefix convention from `data-model.md` → "Triggers").
- pgTAP positive and negative cases for all four RLS policies; all edge cases
  for both RPCs listed in R8. Before writing 0701 tasks, read `docs/invites.md`
  → "The `add_circle_by_email` function" and the updated `add_circle_by_id`
  sketch; record the `ON CONFLICT` shape and block-check logic in the task
  Decisions.
- `schema_shape.sql` plan count at branch-cut: `plan(56)`. `grants.sql` plan
  count at branch-cut: `plan(60)`. Increment each by the number of assertions
  added; run `./scripts/test-db.sh` to confirm the updated count before marking
  this task done.

**Steps:**
1. `git checkout -b 0701_relationships 0700_invites_circles_db`
2. Invoke `/write-plan` to create `plans/0701_relationships/` with its three files.
3. Implement the sub-plan task by task.
4. Run `./scripts/check.sh` — must be green.
5. `git checkout 0700_invites_circles_db && git merge --no-ff 0701_relationships`

**Verify:** `./scripts/check.sh` green on `0700_invites_circles_db` after merge.
`\dt relationships` in psql returns the table. `\df add_circle_by_email` and
`\df add_circle_by_id` each return one row.

---

## Phase 2 — 0702: Invitations layer

### [ ] 2.1 Plan and implement sub-step 0702 (invitations table + invite RPCs)

**Created:** 2026-05-27T00:00:00Z

**Why:** The `invitations` table and the three invite RPCs complete the Tier 3
data model. `send_invitation` reads `relationships` rows (for block and circle
checks) — 0701 must be merged before 0702 can be correctly implemented and
tested. This is the more complex sub-plan: `send_invitation` has a seven-step
check sequence, and `accept_invitation` writes to `list_members` in a single
transaction.

**Prerequisites:** Task 1.1 merged — `0700_invites_circles_db` contains the
`relationships` table and circle RPCs. The `relationships` rows that
`send_invitation` reads are available in the dev DB.

**Decisions:**
- Sub-branch is cut from the updated `0700_invites_circles_db` (post-0701 merge).
- Scope: `db/migrations/0009_invitations.sql` (table + unique indexes + trigger
  binding + 1 RLS policy + 3 RPCs + `tg_block_declines_invitations` trigger
  function + `AFTER INSERT OR UPDATE OF status ON relationships` binding +
  `GRANT SELECT ON public.invitations TO authenticated`); `db/tests/invitations.sql`
  (full pgTAP); updates to `db/tests/schema_shape.sql` and `db/tests/grants.sql`
  (add SELECT grant assertion for `invitations` in addition to EXECUTE grants for
  the three RPCs; update the `plan(N)` count to match).
- `send_invitation` must implement all seven check steps from R5 in order.
  Read `docs/invites.md` → "What `invite_policy` and blocks check, in order"
  before writing tasks; record each step and its expected return value in the
  task Decisions. Note: `send_invitation` check sequence has **eight** steps in
  R5 (including the inviter-membership guard at step 1, which is not shown in the
  `invites.md` sketch but is required — the sketch is illustrative only).
- Add a pgTAP test for `send_invitation(p_list_id := x, p_email := null,
  p_user_id := null)` — must raise (R5 validation: "raise if neither p_email
  nor p_user_id is provided"). This path is listed in R5 but was absent from
  the R9 test catalogue.
- `accept_invitation` and `decline_invitation` must use `IS DISTINCT FROM` (not
  `<>`) for the invitee guard: `IF target_user_id IS DISTINCT FROM public.uid()
  THEN RAISE …`. Using `<>` silently passes when `target_user_id IS NULL`
  (email-keyed invitation), because `NULL <> value` is NULL (falsy) in PL/pgSQL.
- `accept_invitation` inserts into `list_members` using `ON CONFLICT (list_id,
  user_id) DO UPDATE SET deleted_at = null, deleted_by = null`. This handles
  both previously-removed members (soft-deleted PK collision) and a concurrent-
  accept race; `DO NOTHING` would leave previously-removed members un-restored.
  `created_by` will be `public.uid()` (the acceptor) — `tg_set_attribution_list_members`
  overwrites any supplied value unconditionally on INSERT.
- Block auto-decline (R10): `tg_block_declines_invitations` must be a
  `SECURITY DEFINER` function with `set search_path = public`. It fires `AFTER
  INSERT OR UPDATE OF status ON relationships FOR EACH ROW`. When
  `NEW.status = 'blocked'`, hard-delete all `invitations` rows where
  `created_by = NEW.other_user_id AND target_user_id = NEW.user_id`. Cover both
  the INSERT path (new block row) and the UPDATE path (circle → blocked) in
  pgTAP.
- Deferred: policy-change cascade and inviter-cancellation. Mark both in the
  sub-plan's non-requirements so the step-8 owner picks them up.
- `send_invitation` step 8 (INSERT) must handle the concurrent-duplicate case
  gracefully. The check-then-insert pattern (steps 5 and 8) has a TOCTOU window:
  two concurrent callers can both pass step 5, then one INSERT succeeds and the
  other would raise an unhandled `unique_violation` (23505). Implement using
  either: (a) `EXCEPTION WHEN unique_violation THEN SELECT id INTO invitation_id
  FROM invitations WHERE … ; RETURN invitation_id;`, or (b) `ON CONFLICT … DO
  NOTHING` with a follow-up SELECT. Record which approach in the 0702 task's
  Decisions, and include a pgTAP test that exercises this path.
- `schema_shape.sql` plan count at branch-cut (after 0701 lands): will be
  `plan(56)` + assertions added by 0701. `grants.sql` similarly. Before writing
  0702 tasks, run `./scripts/test-db.sh` to read the current counts, then record
  them in the 0702 task Decisions as the starting N before the 0702 additions.

**Steps:**
1. `git checkout -b 0702_invitations 0700_invites_circles_db`
2. Invoke `/write-plan` to create `plans/0702_invitations/` with its three files.
3. Implement the sub-plan task by task.
4. Run `./scripts/check.sh` — must be green.
5. `git checkout 0700_invites_circles_db && git merge --no-ff 0702_invitations`

**Verify:** `./scripts/check.sh` green on `0700_invites_circles_db` after merge.
`\dt invitations` in psql returns the table. `\df send_invitation`,
`\df accept_invitation`, `\df decline_invitation` each return one row.

---

## Phase 3 — Wrap up

### [ ] 3.1 Final verification and merge to main

**Created:** 2026-05-27T00:00:00Z

**Why:** Confirms the full step-7 DB layer is coherent end-to-end — both tables,
all RLS policies, all five RPCs, and pgTAP coverage — before it lands on `main`.

**Prerequisites:** Tasks 1.1 and 2.1 both merged into `0700_invites_circles_db`.

**Decisions:**
- Run `./scripts/check.sh` without `--e2e` — step 7 is DB-only; there are no
  new Playwright flows to run here (step 8 adds those).
- Tick step 7's checkbox in `plans/0000_implementation_order.md` as part of the
  merge commit.

**Steps:**
1. On `0700_invites_circles_db`, run `./scripts/check.sh` — must be green.
2. Edit `plans/0000_implementation_order.md`: change `7. [ ]` to `7. [x]`.
3. Commit: `chore(plan): tick step 7 in implementation order`.
4. `git checkout main && git merge --no-ff 0700_invites_circles_db`

**Verify:** `./scripts/check.sh` green on `main`. `pg_prove` confirms all pgTAP
tests including the new `relationships.sql` and `invitations.sql` pass. The five
RPCs are callable via PostgREST: `POST /rpc/add_circle_by_email` with a valid
email and a valid bearer token returns 200.
