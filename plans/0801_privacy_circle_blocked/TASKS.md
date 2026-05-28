# Tasks

## Reference skills and docs

- **`.claude/skills/writing-tasks.md`** — TDD ordering, self-
  contained task blocks, route-test filenames drop the `+` prefix.
- **`.claude/skills/writing-tests.md`** — pgTAP needs positive *and*
  negative cases; Vitest asserts user-visible behaviour.
- **`.claude/skills/writing-sql.md`** — `SECURITY DEFINER` +
  `SET search_path = public` convention for trigger functions.
- **`plans/0801_privacy_circle_blocked/REQUIREMENTS.md`** — R1–R9
  contracts.
- **`plans/0801_privacy_circle_blocked/PLAN.md`** — design rationale.
- **`plans/0800_invites_circles_ui/PLAN.md`** — parent plan's
  Decisions and Phase structure, including the toolchain-coupling
  sweep that drove this plan's phase order.
- **`docs/invites.md`** — policy-cascade and FIFO-cap deferral notes,
  anti-enumeration posture (relevant to the R2 `'no such user'`
  carve-out), "Block always wins" rule for R3 unblock.
- **`docs/circles.md`** — circle model semantics.
- **`docs/ui.md`** — segmented control, NavRow styling, dashed-card
  add-by-email shape, dates format (`DD MMM` / `DD MMM YYYY`),
  TopBar, sheet, button-pair conventions.
- **`docs/data-model.md`** — trigger slot convention (`t10_*` /
  `t20_*` / `t30_*` / `t40_*`), `invite_policy` column, `relationships`
  RLS policies.
- **`docs/frontend-layout.md`** — tier rules, `components/` /
  `state/` / `model/` / `__mocks__/` shape, filename conventions.
- **`docs/testing.md`** — three test layers; pgTAP positive +
  negative.
- **`docs/quality.md`** — route-not-yet-created escape patterns
  (this plan uses reorder + the non-interactive `<div>` stub).
- **`design/cairn-invite-screens.jsx`** — visual spec for
  `PrivacyScreen`, `CircleScreen`, `BlockedScreen`,
  `CircleExplainerSheet`.
- **`design/cairn-screens.jsx`** lines 1135–1143 — SettingsScreen
  *People* section placement reference.

## Phase 0 — Doc reconciliation (absorbed from parent plan)

### [x] 0.1 Absorb parent plan's Phase 0 doc edits

**Created:** 2026-05-28T13:30:00Z
**Completed:** 2026-05-28T13:44:50Z

**Notes:** All seven paragraph edits were already on the branch when
this task was picked up — they were bundled into the plan-write
commit `dde0887` ("plan(privacy-ui): …") rather than landing as a
separate `docs(invites):` commit. `git diff main -- docs/` matches
the task's Verify expectation exactly: 2 lines added in
`docs/invites.md`, 1 bullet added in `docs/data-model.md`, 4 copy
strings changed in `docs/ui.md`. No further changes required;
ticking the box to record reality.

**Why:** The parent plan (`plans/0800_invites_circles_ui/`) TASKS 0.1
specified five paragraph edits across `docs/invites.md`,
`docs/data-model.md`, and `docs/ui.md` that needed to land *before*
any sub-branch was cut, so each sub-plan would find the docs in
their post-reconciliation state. That commit didn't happen before
`0801_privacy_circle_blocked` was branched off
(`git log main..0800_invites_circles_ui` shows only the plan-write
commit), so this sub-plan's R7/R8 pgTAP and R2/R3 copy assertions
reference prose that doesn't yet exist. Absorb the same five edits
here as Phase 0 so they land before any other 0801 work.

**Prerequisites:** None — operates only on prose.

**Decisions:**
- Seven paragraph edits total — five verbatim from parent TASKS
  0.1 (steps 1–4 below, plus step 7, the Profile-screen sheet copy)
  and two extras the parent's Phase 0 missed: step 5 (Circle screen
  *"What is a circle?"* → *"What's this?"* link copy) and step 6
  (Circle screen success-toast pronoun rewrite from gendered "Bob"
  references to they/them).
- Doc-only commit; no code or migration changes. `./scripts/check.sh`
  unaffected.
- This task is not subsumed by the parent plan's Phase 0 — if the
  parent eventually runs its own TASKS 0.1, the cherry-pick / rebase
  conflict resolution drops the now-duplicate diff. Adding the work
  here keeps 0801 self-sufficient.

**Files:**
- `docs/invites.md` (modify — two paragraphs)
- `docs/data-model.md` (modify — one bullet)
- `docs/ui.md` (modify — three copy strings)

**Steps:**
1. In `docs/invites.md` § "Pending-invite cap", append a paragraph
   after the existing closing-quote sentence:
   > The cap applies to `target_user_id`-keyed pending invitations
   > only; `target_email`-only rows (addressed to not-yet-registered
   > users) are uncapped and convert to user-keyed rows at sign-up.
   > Capping the email-keyed surface would let an attacker who knows
   > an e-mail address evict that address's already-pending sign-up
   > nudges by flooding adjacent typos.
2. In `docs/invites.md` § "RLS and stored procedures", append after
   the paragraph that starts *"Insert and delete on `invitations`,
   …"*:
   > The one exception is the inviter's own *cancel pending invite*
   > action, which is a direct `DELETE /invitations?id=eq.<uuid>`
   > gated by the `invitations_delete` policy
   > (`USING (created_by = public.uid())`); accept and decline by
   > the invitee still go through the `accept_invitation` /
   > `decline_invitation` RPCs.
3. In `docs/data-model.md` § "What the app sees", insert a new
   bullet directly below the `GET /invitations?created_by=eq.<my-uid>`
   line:
   > - `DELETE /invitations?id=eq.<uuid>` — cancel a pending invite
   >   you created (inviter only; the `invitations_delete` RLS
   >   policy scopes the delete to your own rows). Lands alongside
   >   the profile-sheet *Cancel pending invite* action in step 8.
4. In `docs/ui.md` § "Circle screen", drop the
   *"(with confirmation: 'Stop accepting invites from Bob?')"*
   parenthetical so the line reads *"Each row: avatar, display name,
   a small action affordance to remove."*
5. In `docs/ui.md` § "Circle screen", swap the link copy from
   *"What is a circle?"* to *"What's this?"* (matches both the
   design canvas at `design/cairn-invite-screens.jsx:353` and R2).
6. In `docs/ui.md` § "Circle screen" — same paragraph that mentions
   the success toast — rewrite the gendered "Bob doesn't exist" /
   "Bob blocked you" / "preserve Bob's privacy" using they/them and
   "they":
   > The success toast is generic — same on success, on "they don't
   > exist," on "they've blocked you" — to preserve their privacy.
7. In `docs/ui.md` § "Profile screen (sheet)", rewrite the
   gendered confirmation example. Replacement:
   > Block and Unblock prompt for confirmation (*"Block {Name}?
   > They won't be able to invite you to any list."*).
8. Commit:
   `docs(invites): record email-cap carve-out, inviter-self DELETE, and circle/profile UX reconciliation`.

**Verify:** `git diff main -- docs/` shows only the seven paragraph
edits above (two in `docs/invites.md`, one in `docs/data-model.md`,
four in `docs/ui.md`). `./scripts/check.sh` is unaffected.

## Phase 1 — DB triggers

### [x] 1.1 Add policy-change cascade trigger `t40_apply_invite_policy_cascade`

**Created:** 2026-05-28T12:48:43Z
**Completed:** 2026-05-28T13:51:52Z

**Notes:** Added a second list (`33333333-…`) inline at the top of
`db/tests/invite_cascades.sql` so two different inviters could both
have a pending invitation targeting Bob — `invitations_target_user_uniq`
is on `(list_id, target_user_id)`, so the (Alice→Bob, Carol→Bob)
pair from scenarios A and B needs two distinct lists. Not a
deviation from the trigger's behaviour, just a fixture-side detail
the task block didn't pre-specify.

**Why:** R7. The Privacy screen lets the user tighten their
`invite_policy` (e.g. `everybody → circle` or `… → nobody`). Step
7's RPCs check policy at *insert* time, but they don't sweep
already-pending invitations when the policy changes after the
fact. Without this trigger, a user who tightens their policy still
sees stale pending invites in their inbox and can accept them —
defeating the policy change. `docs/invites.md` defers this trigger
to step 8.

**Prerequisites:** None — `0801_privacy_circle_blocked` is cut from
`0800_invites_circles_ui`, step 7 is merged, the `invitations`
table and the `relationships` table exist with their RLS policies
and the `t40_block_declines_invitations` AFTER trigger on
`relationships`. The existing `t20_set_modified_at BEFORE UPDATE
OF invite_policy` trigger
(`db/migrations/0004_domain_schema.sql:558-560`) coexists with the
new AFTER trigger — `t20` fires first (BEFORE), row writes, then
`t40` fires (AFTER).

**Decisions:**
- Function `tg_apply_invite_policy_cascade` is
  `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.
- Trigger fires `AFTER UPDATE OF invite_policy ON public.user_settings
  FOR EACH ROW WHEN (new.invite_policy IS DISTINCT FROM old.invite_policy)`
  so a no-change update doesn't run the body.
- Body branches on `new.invite_policy`:
  - `'nobody'` →
    `DELETE FROM public.invitations WHERE target_user_id = new.id;`
  - `'circle'` →
    `DELETE FROM public.invitations WHERE target_user_id = new.id AND NOT EXISTS (SELECT 1 FROM public.relationships WHERE user_id = new.id AND other_user_id = invitations.created_by AND status = 'circle');`
  - `'everybody'` → no-op (explicit `RETURN NEW;`).
- Bind as `t40_apply_invite_policy_cascade` — matches the
  `t40_*` AFTER-trigger slot from `docs/data-model.md` § "Triggers",
  parallel to `t40_block_declines_invitations` on `relationships`
  (`db/migrations/0009_invitations.sql:322`).
- Hard delete (not soft delete) — pending invitations are not
  soft-deletable per step 7's `invitations` schema; the RPCs
  delete them outright on accept/decline. The cascade follows the
  same shape.
- Wrap the entire `0010_invite_cascades.sql` file in a single
  `BEGIN; … COMMIT;` transaction (header comment first, then
  `BEGIN;`, then function + trigger DDL, then `COMMIT;` — appended
  to in task 1.2 between the function/trigger DDL and the final
  `COMMIT;`). Matches the convention `0009_invitations.sql` opens
  with — *"single transaction so a mid-migration abort leaves no
  half-applied state."*
- **No `has_trigger` assertion in `db/tests/schema_shape.sql`.**
  The file currently asserts table / column / index / function
  shapes but no triggers (the existing `t40_block_declines_invitations`,
  `t10_set_attribution_*`, `t20_set_modified_at`, etc. all lack
  `has_trigger` lines), so adding one for just this new binding
  would create an inconsistent pattern. Trigger existence is
  covered by the functional `db/tests/invite_cascades.sql`
  coverage — if the binding is missing, every positive case fails.
  `plan(N)` at line 17 of `schema_shape.sql` stays at 75.

**Reference:** `docs/data-model.md` § "Triggers" for slot
convention; `db/migrations/0009_invitations.sql:322` for the
parallel `t40_*` binding on `relationships`.

**Files:**
- `db/migrations/0010_invite_cascades.sql` (create)
- `db/tests/invite_cascades.sql` (create)

**Steps:**
1. RED — Create `db/tests/invite_cascades.sql` with `BEGIN;` /
   `plan(5);` covering five positive-and-negative cases for the
   cascade trigger: (a) tighten `'everybody' → 'nobody'`
   hard-deletes all pending invitations targeting the caller;
   (b) tighten `'everybody' → 'circle'` keeps pending invitations
   from in-circle inviters and hard-deletes the rest; (c) tighten
   `'circle' → 'nobody'` (in-circle invites still present from
   (b)) hard-deletes them too; (d) loosen `'nobody' → 'everybody'`
   does NOT resurrect previously-cascaded invitations; (e) updating
   an unrelated `user_settings` column (or updating
   `invite_policy` to the same value it already has) does NOT
   fire the cascade body. Use the existing `infra_auth_stub`
   fixtures and the documented pattern from
   `db/tests/relationships.sql`. Each assertion needs a fresh
   set of pending rows (TRUNCATE between tests or wrap in
   savepoints).
2. RED — Run `./scripts/test-db.sh` and confirm the new file
   reports `not ok` lines for each new assertion (function and
   trigger don't exist yet).
3. GREEN — Create `db/migrations/0010_invite_cascades.sql`. Begin
   with a header comment naming the migration and listing both
   trigger functions (R7 covered here, R8 added in task 1.2), then
   open a single `BEGIN;` block. Add the
   `tg_apply_invite_policy_cascade` function per Decisions. Add
   the `CREATE TRIGGER t40_apply_invite_policy_cascade` binding on
   `user_settings`. Close the file with `COMMIT;` (task 1.2 will
   append between the trigger DDL and the existing `COMMIT;`).
4. GREEN — Re-run `./scripts/test-db.sh` and confirm green on
   `invite_cascades.sql`.

**Verify:** `./scripts/test-db.sh`

### [ ] 1.2 Add 20-invite FIFO cap trigger `t30_enforce_fifo_cap`

**Created:** 2026-05-28T12:48:43Z
**Completed:**

**Why:** R8. Without a cap, an attacker (or a noisy power user)
could flood a target's inbox with hundreds of pending invitations,
making the inbox UI unusable. The cap evicts the oldest pending
row when a 21st arrives, keeping the inbox at a steady-state size
of 20 per target. `target_email`-only rows are deliberately
uncapped (the doc edit recording the carve-out already landed in
the parent plan's Phase 0).

**Prerequisites:** Task 1.1 — `db/migrations/0010_invite_cascades.sql`
exists and contains the cascade function. This task appends to
the same file.

**Decisions:**
- Function `tg_enforce_fifo_cap_invitations` is
  `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.
- Trigger fires `BEFORE INSERT ON public.invitations FOR EACH ROW
  WHEN (new.target_user_id IS NOT NULL)`. The `WHEN` gate exempts
  `target_email`-only rows (the email-keyed carve-out from R8).
- Body:

```sql
IF (SELECT count(*) FROM public.invitations
    WHERE target_user_id = new.target_user_id) >= 20 THEN
  DELETE FROM public.invitations WHERE id = (
    SELECT id FROM public.invitations
    WHERE target_user_id = new.target_user_id
    ORDER BY created_at LIMIT 1
  );
END IF;
RETURN NEW;
```

  The 20th insert is therefore uncapped (count goes 19 → 20, no
  eviction); the 21st insert evicts the oldest. Cap is per-target.
- Bind as `t30_enforce_fifo_cap` — `t30_*` is the reserved
  future-BEFORE slot per `docs/data-model.md:618`; `t10_*` is the
  per-table attribution slot and isn't reused.
- The trigger runs as `SECURITY DEFINER`, so its `DELETE` bypasses
  RLS — necessary because the row being deleted may belong to a
  different inviter than the current `INSERT` caller. This is the
  same posture as `tg_apply_invite_policy_cascade` and
  `tg_block_declines_invitations`.
- Append inside the existing `BEGIN; … COMMIT;` block opened by
  task 1.1 — the function and `CREATE TRIGGER` lines land between
  the cascade trigger's DDL and the closing `COMMIT;`, keeping the
  whole migration a single transaction.
- **No `has_trigger` assertion in `db/tests/schema_shape.sql`** —
  same rationale as task 1.1: the file currently has no trigger
  shape assertions, the functional `invite_cascades.sql` coverage
  fails loudly if the binding is missing, and adding a half-pattern
  would mislead future readers. `plan(N)` stays at 75.

**Reference:** `docs/data-model.md:618` for the `t30_*` slot
reservation.

**Files:**
- `db/migrations/0010_invite_cascades.sql` (modify — append)
- `db/tests/invite_cascades.sql` (modify — extend)

**Steps:**
1. RED — Extend `db/tests/invite_cascades.sql` (bump `plan(N)` to
   include the new cases) with five assertions: (a) inserts 1
   through 20 for a single `target_user_id` all succeed and leave
   the count climbing from 1 to 20 with no eviction — assert by
   counting rows after each insert (or just after inserts 1 and
   20) and by checking the row from insert #1 is still present
   after insert #20; (b) the 21st insert succeeds with a
   steady-state count of 20, and the row whose `created_at` was
   oldest at the time of the 21st insert is gone (assert by
   `created_at` ordering, not by remembered id); (c) an unrelated
   target's pending invites are untouched by the 21st insert; (d)
   a 21st `target_email`-only insert to the same address is NOT
   capped (assert the email-keyed surface goes to 21 rows); (e) a
   `target_user_id`-keyed insert with the same `created_by` /
   `target_user_id` but a different `list_id` is treated as a
   distinct invitation for cap-counting (sanity check on the cap's
   subject — it's per `target_user_id`, not per `(created_by,
   target_user_id)` pair).
2. RED — Run `./scripts/test-db.sh` and confirm the new
   assertions report red (function and trigger don't exist yet).
3. GREEN — Append the `tg_enforce_fifo_cap_invitations` function
   and the `CREATE TRIGGER t30_enforce_fifo_cap` binding to
   `db/migrations/0010_invite_cascades.sql`, between the existing
   trigger DDL and the closing `COMMIT;`.
4. GREEN — Re-run `./scripts/test-db.sh` and confirm green.

**Verify:** `./scripts/test-db.sh`

## Phase 2 — Relationships state module

### [ ] 2.1 Add `relationship.ts` model (types + date-format helpers)

**Created:** 2026-05-28T12:48:43Z
**Completed:**

**Why:** Both `CircleScreen` and `BlockedScreen` need to render
*"added DD MMM"* / *"blocked DD MMM"* sub-lines (R2, R3) with the
current-year carve-out (full year when the row is older than the
current calendar year). Factoring the formatter out keeps the two
screens' tests focused on user-visible behaviour and gives the
formatter its own unit-test coverage.

**Prerequisites:** None — the privacy domain folder doesn't exist
yet; this task creates it.

**Decisions:**
- File `web/src/lib/privacy/model/relationship.ts` exports the
  TypeScript types `RelationshipRow` (raw shape from PostgREST,
  with `other_user_id`, `status`, `created_at`, and the embedded
  `profiles` sub-object), `CircleEntry` (camelCase shape for UI
  consumption), and `BlockedEntry` (same shape, different brand).
- `addedAtLabel(createdAt: string, now: Date = new Date()): string`
  returns `"added 12 Apr"` when `createdAt`'s year matches
  `now`'s year, else `"added 12 Apr 2025"`. Month is the
  three-letter English abbreviation; day has no leading zero.
- `blockedAtLabel(createdAt: string, now: Date = new Date()): string`
  same shape with the `"blocked "` prefix.
- Both helpers accept an injected `now` so tests don't rely on
  the real clock — see existing pattern in `web/src/lib/list/model/list.ts`
  or `web/src/lib/shared/model/time-ago.ts` (if present) for the
  parallel shape.

**Reference:** `docs/ui.md` § "Dates" for the `DD MMM` / `DD MMM
YYYY` format rule.

**Files:**
- `web/src/lib/privacy/model/relationship.ts` (create)
- `web/src/lib/privacy/model/relationship.test.ts` (create)

**Steps:**
1. RED — Create `relationship.test.ts` with Vitest cases for both
   helpers: (a) same-year row → short form `"added 12 Apr"`;
   (b) older row → long form `"added 12 Apr 2025"`; (c) edge case
   on January 1 (boundary day still uses current-year form when
   year matches); (d) same coverage for `blockedAtLabel`. Use
   ISO-formatted `createdAt` strings (`"2026-04-12T10:00:00Z"`)
   and an injected `now`.
2. RED — Run `pnpm test` and confirm the new file reports red
   (module doesn't exist yet).
3. GREEN — Create `relationship.ts` with the type exports and
   both helper functions. Use `Intl.DateTimeFormat('en-GB', {
   day: 'numeric', month: 'short' })` and the `getFullYear()`
   comparison.
4. GREEN — Re-run `pnpm test` and confirm green.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 2.2 Add `relationships.svelte.ts` state module

**Created:** 2026-05-28T12:48:43Z
**Completed:**

**Why:** R6. Every Privacy-domain screen reads or writes
relationships: PrivacyScreen reads `circle.length` and
`blocked.length` for the NavRow count badges; CircleScreen reads
`circle` and calls `removeFromCircle` / `addCircleByEmail`;
BlockedScreen reads `blocked` and calls `unblock`. 0802's
`<ProfileSheet>` and 0803's invite picker also consume this module.
Centralising the state in a reactive `.svelte.ts` module avoids
each screen issuing its own GET and keeps a single source of truth
for the count badges.

**Prerequisites:** Task 2.1 — `relationship.ts` model types exist.

**Decisions:**
- File `web/src/lib/privacy/state/relationships.svelte.ts` uses
  the `.svelte.ts` runes-aware suffix so `$state` reactive
  arrays compile.
- The module reads the caller's uid from
  `$lib/shared/state/profile.svelte`'s `profile.uid` (no JWT
  parsing, no session duplication). Every `pgGet` /
  `pgPost` / `pgDelete` path that needs `<my-uid>` reads it from
  there. RLS already scopes results to the caller, but the
  explicit query filter is what makes PostgREST return a sane
  set — matches the convention in
  `web/src/lib/list/state/lists.svelte.ts`.
- Exports a single reactive store object with fields `circle`,
  `blocked`, `loaded` (boolean — true after the first
  `loadRelationships` completes) and methods
  `loadRelationships`, `addCircleByEmail`, `addCircleById`,
  `removeFromCircle`, `block`, `unblock`. Match the existing
  pattern in `web/src/lib/list/state/lists.svelte.ts` or
  `web/src/lib/shared/state/profile.svelte.ts`.
- `loadRelationships()` issues a single
  `pgGet('/relationships?user_id=eq.<me>&select=other_user_id,status,created_at,profiles!other_user_id(display_name,avatar_version)')`
  and maps the result to two arrays via the row's `status` field.
- `addCircleByEmail(email)` calls `pgPost('/rpc/add_circle_by_email', { p_email: email })`
  and returns one of four shapes. Errors come back as `ApiError`
  (see `web/src/lib/shared/http/postgrest.ts:15` — not
  `PostgrestError`); match on
  `(err.code === 'P0001' && err.message === '<exact>')` so a
  future SQL reword can't silently widen the helpful-error
  surface:
  - `{ ok: true }` when the call succeeds — the method then
    appends the returned row to `circle` (or re-calls
    `loadRelationships()` and lets the reactive fold do its
    work).
  - `{ ok: false, reason: 'no-such-user' }` when the RPC raises
    `'no such user'`.
  - `{ ok: false, reason: 'self' }` when the RPC raises
    `'cannot add yourself'` — honest about a non-private
    failure (the e-mail is the caller's own).
  - `{ ok: false, reason: 'unknown' }` for any other failure.
- `addCircleById(otherUserId)` calls
  `pgPost('/rpc/add_circle_by_id', { p_other_user_id: otherUserId })`
  and appends on success. On failure (the RPC raises `'no such
  user'` or `'cannot add yourself'`) the method **re-throws the
  underlying `ApiError`** without mutating `circle`; callers
  (0802's `<ProfileSheet>`, 0803's post-accept circle prompt) own
  their own error UX. Vitest covers both raises and a generic
  re-throw on any other failure.
- `removeFromCircle(otherUserId)` calls
  `pgDelete('/relationships?user_id=eq.<me>&other_user_id=eq.<them>')`
  and removes the row from `circle`.
- `block(otherUserId)` calls `pgPost('/relationships', { user_id: '<me>', other_user_id: otherUserId, status: 'blocked' }, { headers: { Prefer: 'resolution=merge-duplicates' } })`. On success, removes the user from `circle` if present and appends to `blocked`. If merge-duplicates turns out to not fire `relationships_update` correctly on the flip path (exploration during implementation), fall back to a check-then-act: GET the existing row, then PATCH (status change) or POST (no existing row). Record any deviation in this task's Notes.
- `unblock(otherUserId)` calls
  `pgDelete('/relationships?user_id=eq.<me>&other_user_id=eq.<them>')`
  and removes from `blocked`. Prior `'circle'` state is **not**
  restored (per `docs/invites.md` "Block always wins"; consumers
  who want to put the user back into circle must do so explicitly
  via `addCircleById`).
- Vitest test (`relationships.test.ts`) mocks `postgrest.ts` (use
  the existing `__mocks__/postgrest.ts` pattern from
  `web/src/lib/list/state/__mocks__/` if present, else inline
  `vi.mock`) and asserts each method's HTTP shape and reactive
  update.

**Reference:** `docs/invites.md` § "Block always wins" for the
unblock-doesn't-restore rule; `docs/data-model.md` § "What the app
sees" for the `relationships` endpoint shape and the PostgREST
`select=…,profiles!other_user_id(…)` embedded-select syntax.

**Files:**
- `web/src/lib/privacy/state/relationships.svelte.ts` (create)
- `web/src/lib/privacy/state/relationships.test.ts` (create)

**Steps:**
1. RED — Create `relationships.test.ts` with Vitest cases for
   each method: (a) `loadRelationships` populates `circle` and
   `blocked` from a mock response containing one of each;
   (b) `addCircleByEmail` on success appends to `circle`;
   (c) `addCircleByEmail` on
   `ApiError({code: 'P0001', message: 'no such user'})` returns
   `{ok: false, reason: 'no-such-user'}` and does NOT mutate
   `circle`; (c.i) `addCircleByEmail` on
   `ApiError({code: 'P0001', message: 'cannot add yourself'})`
   returns `{ok: false, reason: 'self'}` and does NOT mutate
   `circle`; (c.ii) `addCircleByEmail` on any other error
   shape returns `{ok: false, reason: 'unknown'}`;
   (d) `addCircleById` on success appends to `circle`;
   (d.i) `addCircleById` on
   `ApiError({code: 'P0001', message: 'no such user'})` re-throws
   and does NOT mutate `circle`;
   (d.ii) `addCircleById` on
   `ApiError({code: 'P0001', message: 'cannot add yourself'})`
   re-throws and does NOT mutate `circle`;
   (e) `removeFromCircle` DELETEs and removes from `circle`;
   (f) `block` on a user currently in `circle` removes them from
   `circle` and appends to `blocked`; (g) `block` on a stranger
   appends to `blocked` (no `circle` mutation); (h) `unblock`
   DELETEs and removes from `blocked` (does NOT add to `circle`).
2. RED — Run `pnpm test relationships.test.ts` and confirm red
   on every assertion.
3. GREEN — Create `relationships.svelte.ts` per Decisions.
4. GREEN — Re-run `pnpm test` and confirm green.
5. GREEN — Create `web/src/lib/privacy/state/__mocks__/relationships.svelte.ts`
   that exports a hand-controllable double for the same shape
   (sibling screens will mock it in their own tests). Vitest's
   automatic resolution picks it up via `vi.mock('$lib/privacy/state/relationships.svelte')`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 2.3 Add `user-settings.svelte.ts` state module

**Created:** 2026-05-28T13:30:00Z
**Completed:**

**Why:** R10 (new). PrivacyScreen (R1) needs a reactive
`invitePolicy` and a single `setInvitePolicy(next)` action that
wraps the count-fetch / PATCH / count-fetch sequence the
cascade-feedback note depends on. The pre-existing
`$lib/shared/state/profile.svelte.ts` holds public identity
(uid / displayName / avatarVersion) and structurally should not
grow private `user_settings` fields, per
`docs/data-model.md` § "Why `profiles` and `user_settings` are
split". A new state module in the privacy domain is the clean
home.

**Prerequisites:** None — this module is independent of
`relationships.svelte.ts` (Task 2.2). The two state modules sit
side-by-side in `web/src/lib/privacy/state/`.

**Decisions:**
- File `web/src/lib/privacy/state/user-settings.svelte.ts` uses
  the `.svelte.ts` suffix so `$state` reactive fields compile.
- The module reads the caller's uid from
  `$lib/shared/state/profile.svelte`'s `profile.uid` — same
  convention as `relationships.svelte.ts` (Task 2.2).
- On any HTTP failure in `setInvitePolicy` (either count fetch, or
  the PATCH itself), the method **re-throws the underlying
  `ApiError`** and leaves `invitePolicy` unchanged. PrivacyScreen
  (Task 6.1) catches the throw, reverts its optimistic selection,
  and renders a *"Couldn't update privacy setting"* snackbar. The
  module is unaware of the snackbar copy; only the throw shape
  lives here.
- Exports a single reactive store object with fields
  `invitePolicy: 'everybody' | 'circle' | 'nobody' | null` and
  `loaded: boolean`, plus methods `loadUserSettings()` and
  `setInvitePolicy(next)`. Match the
  `relationships.svelte.ts` shape.
- `loadUserSettings()` issues
  `pgGet('/user_settings?id=eq.<me>&select=invite_policy')` and
  sets `invitePolicy` from the first row. RLS scopes to the
  caller's row.
- `setInvitePolicy(next)` returns
  `{ prevCount: number, newCount: number, tightened: boolean }`:
  1. `prevCount = (await pgGet('/invitations?target_user_id=eq.<me>&select=id')).length`
  2. `await pgPatch('/user_settings?id=eq.<me>', { invite_policy: next })`
  3. `newCount = (await pgGet(... same as 1 ...)).length`
  4. `tightened = ({ everybody: 0, circle: 1, nobody: 2 })[next] > ({ everybody: 0, circle: 1, nobody: 2 })[prevPolicy]`
     where `prevPolicy = invitePolicy` *before* the PATCH.
  5. On success, set `invitePolicy = next`.
- The module is unaware of the cascade-feedback copy; only the
  call shape lives here. PrivacyScreen renders the singular /
  plural / suppressed string from the returned values.
- Vitest covers each path: `loadUserSettings` populates from a
  mocked response; `setInvitePolicy` issues two GETs and one
  PATCH in order; `tightened` is `true` for `everybody→circle`,
  `everybody→nobody`, `circle→nobody`, `false` for any loosen
  and for `same→same`. Plus: a PATCH rejection re-throws and
  leaves `invitePolicy` at its pre-call value.
- Co-located mock at
  `web/src/lib/privacy/state/__mocks__/user-settings.svelte.ts`
  for sibling consumers (PrivacyScreen).

**Files:**
- `web/src/lib/privacy/state/user-settings.svelte.ts` (create)
- `web/src/lib/privacy/state/user-settings.test.ts` (create)
- `web/src/lib/privacy/state/__mocks__/user-settings.svelte.ts`
  (create)

**Steps:**
1. RED — Create `user-settings.test.ts` with the cases listed in
   Decisions. Mock `postgrest.ts` via `vi.mock`.
2. RED — Run `pnpm test user-settings.test.ts` and confirm red.
3. GREEN — Create `user-settings.svelte.ts` per Decisions.
4. GREEN — Re-run `pnpm test` and confirm green.
5. GREEN — Create the sibling `__mocks__/user-settings.svelte.ts`
   double matching the shape (`invitePolicy`, `loaded`,
   `loadUserSettings`, `setInvitePolicy`).

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

## Phase 3 — Circle explainer sheet

### [ ] 3.1 Add `<CircleExplainerSheet>` component

**Created:** 2026-05-28T12:48:43Z
**Completed:**

**Why:** R4. The explainer is consumed by PrivacyScreen (R1) and
CircleScreen (R2). Building it first means both screens can import
a tested component rather than co-introducing it.

**Prerequisites:** Task 2.2 — the privacy domain folder exists.

**Decisions:**
- File
  `web/src/lib/privacy/components/CircleExplainerSheet.svelte`.
  Uses the existing `Sheet.svelte` primitive
  (`$lib/basic/components/Sheet.svelte`) so system-back closes it
  via the back-stack pattern.
- Title: *"What is a circle?"*. Lead-in paragraph directly
  under the title:
  > Your circle is a private list of people you'll let invite
  > you to lists, when your privacy is set to *Your circle*.
- Body: four explainer points (title + body) verbatim from
  `design/cairn-invite-screens.jsx:857–871`'s `ExplainerPoint`
  calls:
  1. ***It's yours alone.*** Bob doesn't see whether they're in
     your circle. You don't see whose circle you're in. Each
     person manages their own.
  2. ***It only governs invites coming to you.*** It does not
     affect your ability to invite anyone. If Bob's policy is
     also *Your circle*, what matters for inviting Bob is
     whether *you* are in *their* circle — not the other way
     around.
  3. ***Adding by e-mail is two-way.*** If you add Bob's e-mail
     here, you go on their circle too — unless they've blocked
     you, in which case only your side is updated. Either of
     you can remove the other at any time.
  4. ***To stop someone inviting you: block them.*** The block
     always wins — it overrides every circle and policy on
     either side.
- Privacy footer: *"Cairn will never tell anyone whose circle
  they're in. The list above is yours; you're the only one who
  sees it."*
- Single primary **Got it** button at the bottom; tapping closes
  the sheet.
- Props: `{ open: boolean, onclose: () => void }` — matches the
  underlying `Sheet.svelte` signature. The parent screen owns a
  local `$state` boolean (e.g.,
  `let explainerOpen = $state(false)`) and passes
  `open={explainerOpen}` / `onclose={() => (explainerOpen = false)}`.
  No `bind:open` — `Sheet.svelte`'s `open` prop isn't declared
  with `$bindable()`, so one-way + handler is the supported
  pattern.

**Reference:** `design/cairn-invite-screens.jsx` →
`CircleExplainerSheet` for verbatim copy and visual structure;
`docs/ui.md` § "Sheet" for the back-stack pattern.

**Files:**
- `web/src/lib/privacy/components/CircleExplainerSheet.svelte`
  (create)
- `web/src/lib/privacy/components/CircleExplainerSheet.test.ts`
  (create)

**Steps:**
1. RED — Create `CircleExplainerSheet.test.ts`. Assertions:
   (a) when `open={true}`, the title *"What is a circle?"*
   renders; (b) the lead-in paragraph *"Your circle is a private
   list…"* renders; (c) each of the four explainer point
   **titles** renders verbatim; (d) each of the four explainer
   point **bodies** renders verbatim (one assertion per body);
   (e) the privacy footer text renders; (f) the **Got it**
   button exists and clicking it calls the `onclose` prop;
   (g) when `open={false}`, none of the above text renders.
2. RED — Run `pnpm test CircleExplainerSheet.test.ts` and confirm
   red (component doesn't exist yet).
3. GREEN — Create `CircleExplainerSheet.svelte` per Decisions.
   Use the existing `Sheet.svelte` primitive for the bottom-sheet
   modal shell; carry the copy from the design canvas verbatim.
4. GREEN — Re-run `pnpm test` and confirm green.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

## Phase 4 — Blocked screen

### [ ] 4.1 Add `<BlockedScreen>` + `/settings/blocked` route

**Created:** 2026-05-28T12:48:43Z
**Completed:**

**Why:** R3. Lands first among the three Privacy-domain screens
because it has no outgoing NavRows to other Privacy-domain routes —
satisfying the toolchain-coupling sweep documented in PLAN.md
Decisions. The Privacy screen (Phase 6) will resolve to this
route's path, so this route must exist first.

**Prerequisites:** Task 2.2 — `relationships.svelte.ts` exists
(BlockedScreen reads `blocked` and calls `unblock`).

**Decisions:**
- Component file
  `web/src/lib/privacy/components/BlockedScreen.svelte`.
- Renders an `<AppTopBar>` with the title *"Blocked"*.
- Description text: *"People you've blocked. They can't invite you
  to any list, regardless of your other privacy settings."*
- On mount, calls `relationships.loadRelationships()` if
  `relationships.loaded === false` — single-fetch pattern.
- For each row in `relationships.blocked`: render an avatar
  (`Avatar.svelte`, size 36 — matches
  `design/cairn-invite-screens.jsx:457`), the display name, the
  `blockedAtLabel(row.createdAt)` sub-line, and an **Unblock**
  button. Unblock calls `relationships.unblock(row.otherUserId)`
  and does NOT show a confirmation prompt.
- Empty state (when `relationships.blocked.length === 0` and
  `loaded === true`): a dashed-border card with the slash icon
  and the literal copy *"You haven't blocked anyone."* No add
  field anywhere on this screen.
- **Loading gate.** While `relationships.loaded === false`, the
  screen renders only the AppTopBar and the description text —
  no empty-state card, no row list. This avoids a brief flash of
  *"You haven't blocked anyone."* before the fetch resolves.
- Route file `web/src/routes/(app)/settings/blocked/+page.svelte`
  is a one-liner that imports and renders `<BlockedScreen />`.
- Route-colocated test
  `web/src/routes/(app)/settings/blocked/page.test.ts` (no `+`
  prefix per `docs/frontend-layout.md` "Filename conventions"
  and `.claude/skills/writing-tasks.md`) asserts the route file
  renders the `<BlockedScreen>` component (smoke check).

**Reference:** `design/cairn-invite-screens.jsx` `BlockedScreen`
section for visual structure and verbatim copy; `docs/ui.md` §
"Empty states" for the dashed-card pattern.

**Files:**
- `web/src/lib/privacy/components/BlockedScreen.svelte` (create)
- `web/src/lib/privacy/components/BlockedScreen.test.ts` (create)
- `web/src/routes/(app)/settings/blocked/+page.svelte` (create)
- `web/src/routes/(app)/settings/blocked/page.test.ts` (create)

**Steps:**
1. RED — Create `BlockedScreen.test.ts`. Mock the
   `relationships` store via `vi.mock('$lib/privacy/state/relationships.svelte')`.
   Assertions: (a) when `blocked` is empty and `loaded === true`,
   the dashed empty-state card with *"You haven't blocked
   anyone."* renders; (a.i) when `loaded === false`, the
   empty-state card does NOT render even though `blocked` is
   empty (loading gate); (b) when `blocked` has one entry, the row
   renders with avatar, display name, the `blockedAtLabel`
   sub-line, and the Unblock button; (c) tapping Unblock calls
   `relationships.unblock(otherUserId)`; (d) no add field is
   rendered (assert by querying for any `<input>` or "Add"
   button and confirming absent); (e) the *"They can't invite
   you to any list…"* description text renders.
2. RED — Create `page.test.ts` for the route file; assert the
   route file renders the `<BlockedScreen>` component (use
   `@testing-library/svelte` `render` on the `+page.svelte`).
3. RED — Run `pnpm test BlockedScreen.test.ts page.test.ts` and
   confirm red.
4. GREEN — Create `BlockedScreen.svelte` per Decisions.
5. GREEN — Create `web/src/routes/(app)/settings/blocked/+page.svelte`
   as a one-liner: `<script>import BlockedScreen from '$lib/privacy/components/BlockedScreen.svelte';</script><BlockedScreen />`.
6. GREEN — Re-run `pnpm test`; confirm green.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

## Phase 5 — Circle screen

### [ ] 5.1 Add `<CircleScreen>` + `/settings/circles` route

**Created:** 2026-05-28T12:48:43Z
**Completed:**

**Why:** R2. Lands second because it imports `<CircleExplainerSheet>`
(from Phase 3) but has no outgoing route NavRows to other
Privacy-domain routes — the Privacy screen (Phase 6) will resolve
to this route's path.

**Prerequisites:** Tasks 2.2 (state module exists) and 3.1
(`<CircleExplainerSheet>` exists).

**Decisions:**
- Component file
  `web/src/lib/privacy/components/CircleScreen.svelte`.
- Renders an `<AppTopBar>` with the title *"Your circle"*.
- Intro paragraph: *"When your privacy is set to *Your circle*,
  these are the only people who can invite you to a list."*
  followed by a *"What's this?"* link that opens
  `<CircleExplainerSheet>` — local `$state` boolean drives the
  one-way `open` prop, with `onclose={() => (explainerOpen = false)}`
  closing it (no `bind:` — `Sheet.svelte`'s prop isn't bindable;
  see Task 3.1 Decisions).
- Section label: *"People in your circle · {circle.length}"*.
- **Loading gate.** While `relationships.loaded === false`, the
  section label and the row list are not rendered; the intro
  paragraph and the add-by-email card render unconditionally
  (they're invariant to load state).
- For each row in `relationships.circle`: avatar (size 36 —
  matches `design/cairn-invite-screens.jsx:365`), display name,
  the `addedAtLabel(row.createdAt)` sub-line, and a **Remove**
  button. Remove calls
  `relationships.removeFromCircle(row.otherUserId)` quietly — no
  confirmation prompt.
- An **Add by e-mail** form rendered as a dashed-border card:
  mail-icon prefix, e-mail `<input type="email">`, primary
  **Add** button. Below the input, a helper paragraph in stone
  text: *"They'll be added to your circle. If they have you
  blocked, the add still succeeds on your side — but their side
  stays untouched."*
- Form submit calls
  `relationships.addCircleByEmail(email)`. Branch on the result:
  - `{ok: true}` → clear the input.
  - `{ok: false, reason: 'no-such-user'}` → render an inline
    error below the input *"This e-mail isn't on Cairn —
    invite them to a list instead."*
  - `{ok: false, reason: 'self'}` → render an inline error
    below the input *"That's your own e-mail address."* —
    honest carve-out, parallel to `send_invitation`'s
    `'self-invite'`.
  - `{ok: false, reason: 'unknown'}` → surface the generic
    *"Couldn't add to circle"* toast (use the existing
    `Snackbar` primitive).
- Route file `web/src/routes/(app)/settings/circles/+page.svelte`
  is a one-liner that imports and renders `<CircleScreen />`.
- Route-colocated test
  `web/src/routes/(app)/settings/circles/page.test.ts` asserts
  the route renders the `<CircleScreen>` component.

**Reference:** `design/cairn-invite-screens.jsx:384-407` for the
dashed-border add-by-email card shape; `docs/ui.md` § "Circle
screen" for the (now-Phase-0-reconciled) quiet Remove copy.

**Files:**
- `web/src/lib/privacy/components/CircleScreen.svelte` (create)
- `web/src/lib/privacy/components/CircleScreen.test.ts` (create)
- `web/src/routes/(app)/settings/circles/+page.svelte` (create)
- `web/src/routes/(app)/settings/circles/page.test.ts` (create)

**Steps:**
1. RED — Create `CircleScreen.test.ts`. Mock `relationships` via
   `vi.mock`. Assertions: (a) intro paragraph renders;
   (b) tapping *"What's this?"* sets the explainer's
   `open={true}` (assert by checking explainer title is now in
   the DOM); (c) section label includes the count from the mock;
   (d) one populated row renders with avatar, display name,
   `addedAtLabel` sub-line, and a Remove button; (e) tapping
   Remove calls `relationships.removeFromCircle(otherUserId)`
   without a confirmation prompt; (f) submitting the
   add-by-email form with a valid e-mail calls
   `relationships.addCircleByEmail(email)` and clears the input
   on success; (g) the `'no-such-user'` reason surfaces the
   inline error *"This e-mail isn't on Cairn — invite them to a
   list instead."*; (g.i) the `'self'` reason surfaces the
   inline error *"That's your own e-mail address."*;
   (h) the `'unknown'` reason surfaces a snackbar with
   *"Couldn't add to circle"*.
2. RED — Create `page.test.ts` smoke check for the route.
3. RED — Run `pnpm test`; confirm red.
4. GREEN — Create `CircleScreen.svelte` per Decisions.
5. GREEN — Create the route file as a one-liner that renders
   `<CircleScreen />`.
6. GREEN — Re-run `pnpm test`; confirm green.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

## Phase 6 — Privacy screen

### [ ] 6.1 Add `<PrivacyScreen>` + `/settings/privacy` route

**Created:** 2026-05-28T12:48:43Z
**Completed:**

**Why:** R1. Lands after Blocked (Phase 4) and Circle (Phase 5)
because its NavRows resolve to `/settings/circles` and
`/settings/blocked`. Importing `<CircleExplainerSheet>` (Phase 3)
and reading `circle.length` / `blocked.length` from the state
module (Phase 2.2).

**Prerequisites:** Tasks 3.1 (explainer exists), 4.1 (`/settings/blocked`
route exists), 5.1 (`/settings/circles` route exists), 2.2
(`relationships.svelte.ts` exists), 2.3
(`user-settings.svelte.ts` exists — supplies `invitePolicy` and
`setInvitePolicy()`).

**Decisions:**
- Component file
  `web/src/lib/privacy/components/PrivacyScreen.svelte`.
- Renders an `<AppTopBar>` with the title *"Privacy"*.
- **Section 1 — Who can invite you to lists.** A segmented
  control with three options:
  - `everybody` — title *"Everybody"*, sub *"Anyone with a Cairn
    account"*.
  - `circle` — title *"Your circle"*, sub *"Only people in your
    circle"*.
  - `nobody` — title *"Nobody"*, sub *"You can still create lists
    and invite others"*.
  Bound to `userSettings.invitePolicy` from
  `$lib/privacy/state/user-settings.svelte` (created in Task 2.3).
  On mount, call `userSettings.loadUserSettings()` if
  `userSettings.loaded === false`. **Loading gate.** Until
  `userSettings.loaded === true`, the control renders with no
  option visually selected (indeterminate — neither radio dot
  filled) and taps are non-interactive (`disabled`); the
  *"What's a circle?"* link is hidden during load.
  Selecting an option calls
  `await userSettings.setInvitePolicy(newValue)` — which wraps
  the count-fetch / PATCH / count-fetch sequence and returns
  `{ prevCount, newCount, tightened }`. **Failure path.** If
  `setInvitePolicy` rejects, the screen catches the error,
  reverts the segmented-control selection to the pre-tap value
  (`userSettings.invitePolicy` is unchanged on failure by R10's
  contract), clears the cascade-feedback note, and surfaces a
  generic *"Couldn't update privacy setting"* snackbar via the
  existing `Snackbar` primitive.
- While `invite_policy === 'circle'`, render a *"What's a
  circle?"* link below the segmented control. Tapping it sets a
  local `$state` boolean to open `<CircleExplainerSheet>`.
- **Cascade-feedback note.** The
  `userSettings.setInvitePolicy(next)` call returns
  `{ prevCount, newCount, tightened }`. Compute
  `removed = prevCount - newCount`. If `removed > 0 && tightened`,
  set a local `$state` string with the singular/plural form:
    - `removed === 1` → *"1 pending invite has been declined to
      match your new setting."*
    - `removed > 1` → *"{removed} pending invites have been
      declined to match your new setting."*
  If `removed === 0` *or* `!tightened`, set the string to empty —
  the note doesn't render. The note renders inline directly below
  the segmented control, above the *"What's a circle?"* link.
  **Clear the note string on every option click *before* calling
  `setInvitePolicy(...)`** — that way a still-visible note from a
  prior tighten doesn't survive a subsequent loosen and mislead
  the user.
- **Section 2 — People.** Two NavRows:
  - *Your circle* — sub-line *"People you'll let invite you"*,
    badge with `relationships.circle.length`, navigates to
    `goto(resolve('/settings/circles'))`.
  - *Blocked* — sub-line *"People who can never invite you"*,
    badge with `relationships.blocked.length`, navigates to
    `goto(resolve('/settings/blocked'))`.
  - **Loading gate.** Until `relationships.loaded === true`, the
    count badges are hidden (not rendered as `0`). The NavRows
    themselves render unconditionally so the user can navigate
    to Circle / Blocked even mid-load.
- **Section 3 — Privacy note.** Literal copy: *"Your e-mail
  address is never shown to other people on Cairn — only your
  display name and avatar."*
- On mount, call `relationships.loadRelationships()` if
  `loaded === false`.
- Route file `web/src/routes/(app)/settings/privacy/+page.svelte`
  is a one-liner that imports and renders `<PrivacyScreen />`.
- Route-colocated test `…/page.test.ts` asserts the route renders
  the component.

**Reference:** `design/cairn-invite-screens.jsx` `PrivacyScreen`
for verbatim option copy and visual structure; `docs/ui.md` §
"Privacy screen" for the cascade-feedback note shape.

**Files:**
- `web/src/lib/privacy/components/PrivacyScreen.svelte` (create)
- `web/src/lib/privacy/components/PrivacyScreen.test.ts` (create)
- `web/src/routes/(app)/settings/privacy/+page.svelte` (create)
- `web/src/routes/(app)/settings/privacy/page.test.ts` (create)

**Steps:**
1. RED — Create `PrivacyScreen.test.ts`. Mock `relationships`
   and `userSettings` via
   `vi.mock('$lib/privacy/state/relationships.svelte')` and
   `vi.mock('$lib/privacy/state/user-settings.svelte')`.
   Assertions:
   (a) the three segmented control options render with verbatim
   titles and subs; (b) the currently-selected option is
   visually indicated based on the mocked
   `userSettings.invitePolicy`; (c) selecting a different option
   calls `userSettings.setInvitePolicy(newValue)`; (d) *"What's
   a circle?"* link visible only when `invitePolicy === 'circle'`
   and tapping it opens the explainer; (e) the two NavRows
   render with the count badges reading from the mocked
   relationships; (f) the Privacy note text renders verbatim;
   (g) tightening from `everybody` to `circle` (mock
   `setInvitePolicy` to resolve with
   `{prevCount: 2, newCount: 1, tightened: true}`) shows the
   inline note *"1 pending invite has been declined to match
   your new setting."*; (h) `{prevCount: 5, newCount: 0,
   tightened: true}` shows the plural form
   *"5 pending invites have been declined to match your new
   setting."*; (i) `{prevCount: 0, newCount: 0, tightened: true}`
   shows no note; (j) any `tightened: false` resolution shows
   no note even if the counts differ; (k) a previously-visible
   note clears the moment another option is clicked, *before*
   the next `setInvitePolicy(...)` resolves (so a quick
   loosen-after-tighten doesn't carry the stale note);
   (l) when `setInvitePolicy` rejects (mock it to throw an
   `ApiError`), the segmented-control selection reverts to its
   pre-tap value, the cascade-feedback note is cleared, and a
   *"Couldn't update privacy setting"* snackbar appears;
   (m) before `userSettings.loaded === true`, the segmented
   control renders with no option highlighted (indeterminate)
   and taps are non-interactive; (n) before
   `relationships.loaded === true`, the two NavRows' count
   badges are absent.
2. RED — Create `page.test.ts` smoke check.
3. RED — Run `pnpm test`; confirm red.
4. GREEN — Create `PrivacyScreen.svelte` per Decisions. The
   `tightened` boolean is computed inside
   `userSettings.setInvitePolicy(next)`; the screen consumes
   the returned shape and renders / clears the note.
5. GREEN — Create the route file as a one-liner.
6. GREEN — Re-run `pnpm test`; confirm green.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

## Phase 7 — Settings *People* section

### [ ] 7.1 Add *People* section to `SettingsScreen.svelte`

**Created:** 2026-05-28T12:48:43Z
**Completed:**

**Why:** R5. Without the *People* section, Privacy/Circle/Blocked
have no entry point from the Settings hub. The section is also
the home of the Invites NavRow that 0803 wires live; this task
scaffolds it as a non-interactive `<div>` so the Settings hub
ships in its R14 final shape modulo one swap.

**Prerequisites:** Task 6.1 — `/settings/privacy` route exists
(the Privacy NavRow resolves to it).

**Decisions:**
- Edit `web/src/lib/settings/components/SettingsScreen.svelte` to
  insert a new `<section class="preference-group">` block
  **between** the `.profile-chip-section` and the existing
  Appearance section. The section label is *"People"*.
- The section has two rows, in this order:
  1. **Invites** — rendered as a `<div class="nav-row" style="cursor: default;">`.
     No `<button>`, no `<a>`, no `onclick`, no `href`. The visual
     shape mirrors the existing `.nav-row` blocks for the **icon
     and two-line text only — the trailing chevron-right is
     omitted**. A chevron-right would read as *"tap to navigate"*
     and contradict the inert non-interactive shape; the
     placeholder *"No pending invites"* sub-line is the only
     signal the row is currently quiet. 0803's swap to a live
     NavRow will add the chevron back in the same commit that
     ships the `/settings/invites` route. The sub-line is the
     literal placeholder *"No pending invites"*. No count badge.
     Icon: **`inbox`** (per `design/cairn-screens.jsx:1138`).
  2. **Privacy** — rendered as a live `<button class="nav-row"
     onclick={() => goto(resolve('/settings/privacy'))}>`.
     Sub-line: *"Who can invite you · circle · blocked"*. Icon:
     **`shield`** (per `design/cairn-screens.jsx:1141`).
- Update `SettingsScreen.test.ts` in the same task to assert the
  new structure. Existing assertions about the screen's content
  (profile chip, Appearance, Text size, etc.) stay green; new
  assertions cover:
  - The *People* section renders directly between the profile
    chip section and the Appearance section (assert by DOM
    order — `querySelectorAll('section.preference-group')`
    should put People first).
  - The section heading text is *"People"*.
  - The Invites row's literal *"No pending invites"* sub-line
    renders.
  - The Invites row is rendered as a `<div>`, not a `<button>`
    or `<a>` (assert by `tagName`).
  - The Invites row has **no chevron-right glyph** in its
    rendered children (assert by querying for the chevron-right
    SVG and confirming absent within the Invites row).
  - The Privacy row's literal *"Who can invite you · circle ·
    blocked"* sub-line renders.
  - Clicking the Privacy row calls `goto` with
    `resolve('/settings/privacy')` (mock `$app/navigation`).

**Reference:** `design/cairn-screens.jsx:1135-1143` for the
*People* section placement reference (between profile chip and
Appearance); `docs/quality.md` § "Navigating to a not-yet-created
SvelteKit route" for the non-interactive-`<div>` rationale.

**Files:**
- `web/src/lib/settings/components/SettingsScreen.svelte` (modify)
- `web/src/lib/settings/components/SettingsScreen.test.ts` (modify)

**Steps:**
1. RED — Update `SettingsScreen.test.ts` with the new assertions
   (DOM-order check, *"People"* heading, Invites `<div>` shape
   with literal sub-line, Privacy `<button>` with literal
   sub-line, click navigation). Existing assertions stay
   untouched.
2. RED — Run `pnpm test SettingsScreen.test.ts` and confirm red
   on the new cases.
3. GREEN — Edit `SettingsScreen.svelte` to insert the *People*
   `<section class="preference-group">` between profile-chip and
   Appearance. Reuse the existing `.nav-row` CSS for the two
   rows. The Invites row is a `<div class="nav-row"
   style="cursor: default;">`; the Privacy row is a
   `<button class="nav-row" onclick={...}>`.
4. GREEN — Re-run `pnpm test`; confirm green on
   `SettingsScreen.test.ts`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`
