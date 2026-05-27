# Tasks

## Reference skills and docs

- **`.claude/skills/write-plan.md`** — how to create a sub-plan directory (branch, number, slug, three files).
- **`plans/0600_soft_delete_ux/REQUIREMENTS.md`** — full step-6 requirements (R1–R11); each sub-plan refines a subset.
- **`docs/ui.md`** → "Trash & undo" — canonical snackbar and trash-screen behaviour.
- **`docs/data-model.md`** → `items_deleted`, `lists_deleted` views, RLS, tombstone UUID pattern.
- **`design/cairn-screens.jsx`** — screen 11 (list overflow), 14 (trash), 15 (undo snackbar), 17 (tombstone).
- **`docs/quality.md`** — "Navigating to a not-yet-created SvelteKit route" for the stub pattern used in Phase 1.

---

## Phase 0 — Reconcile docs

### [x] 0.1 Resolve the "Editing and deleting lists" open question in `docs/ui.md`

**Created:** 2026-05-26T00:00:00Z
**Completed:** 2026-05-26T17:20:46Z

**Why:** `docs/ui.md` "Not decided" still lists editing and deleting lists as
pending. Step 6 settles it: a per-row `⋮` overflow button on each list row (and
the existing `⋮` in the Items screen TopBar) opens a `ListOverflowSheet` bottom
sheet. Downstream sub-plans reference the doc; the edit must land first.

**Prerequisites:** `0600_soft_delete_ux` branch exists and is checked out.

**Decisions:**
- Remove the "Editing and deleting lists" bullet entirely from the "Not
  decided" section.
- In the "Trash & undo" section, add one sentence after the first paragraph of
  "Trash screen" clarifying the overflow affordance: the sheet is opened by the
  `⋮` icon on each list row in the Lists screen and by the `⋮` button already
  present in the Items screen TopBar.
- No other doc changes in this phase — each sub-plan's tasks carry the detail.

**Files:**
- `docs/ui.md` (modify)

**Steps:**
1. Edit `docs/ui.md` "Not decided" section: delete the bullet
   *"Editing and deleting lists…"* (the whole bullet, not just part of it).
2. Edit `docs/ui.md` "Trash & undo" → "Trash screen" subsection: after the
   sentence *"Each list has a **Trash** entry in its overflow menu (the
   long-press / `⋮` sheet)."*, replace the parenthetical `(the long-press /
   ⋮ sheet)` with `(the `⋮` sheet reachable from each list row on the Lists
   screen and from the Items screen TopBar)` — or equivalent natural phrasing.
3. Commit: `docs(ui): resolve list-editing affordance — ⋮ overflow sheet`.

**Verify:** `grep -n "Editing and deleting lists" docs/ui.md` returns no match.

---

### [x] 0.2 Fix stale "long-press" reference in `docs/ui.md` Settings section

**Created:** 2026-05-26T00:00:00Z
**Completed:** 2026-05-26T18:20:53Z

**Why:** Task 0.1 updated the Trash & undo and Not-decided sections, but missed a
parenthetical in the Settings section (line 159) that still says "that's still the
per-list long-press menu." Now that step 6 settles the affordance as a per-row ⋮
overflow button, that text contradicts the updated Trash section and will confuse
executors and future readers.

**Prerequisites:** Task 0.1 merged — `0600_soft_delete_ux` branch contains the
task-0.1 doc update.

**Decisions:**
- Replace the stale parenthetical entirely, not just the word "long-press" — the
  parenthetical structure ("The kebab on individual list rows is unchanged — that's
  still the per-list long-press menu.") implies the affordance was already decided
  before this plan, which is the opposite of the truth.
- New text should briefly describe what the ⋮ button does and point to "Trash &
  undo" for the full spec — matching the style of the surrounding paragraph.

**Files:**
- `docs/ui.md` (modify)

**Steps:**
1. In `docs/ui.md` "Settings" section, replace the parenthetical sentence
   "(The kebab on individual list rows is unchanged — that's still the per-list
   long-press menu.)" with: "Each list row also has a ⋮ button that opens a
   per-list overflow sheet (see 'Trash & undo' below)."
2. Commit: `docs(ui): remove stale long-press mention in Settings section`.

**Verify:** `grep -n "long-press" docs/ui.md` returns only the one remaining
instance in the Invites & circles subsection (line 217: "long-press menu on
members"), which refers to a future members screen and is not yet resolved.

---

## Phase 1 — 0601: List overflow menu

### [x] 1.1 Plan and implement sub-step 0601 (list overflow, rename, delete + undo)

**Created:** 2026-05-26T00:00:00Z
**Completed:** 2026-05-27T07:38:15Z

**Why:** The list-level management surface (rename, edit description, delete,
view trash) is the foundation of step 6. It must land before the trash screens
(0602) are built, because 0601 creates the route stub that the "View trash"
action navigates to and that the type-checker requires before the `goto` call
can pass `svelte-check`.

**Prerequisites:** Phase 0 merged — `0600_soft_delete_ux` contains the doc
update. `0601_list_overflow` is cut from `0600_soft_delete_ux`.

**Decisions:**
- Sub-branch is cut from `0600_soft_delete_ux`, not from `main`.
- Scope: `ListOverflowSheet.svelte` (rename, edit description, view trash,
  delete list); per-row `⋮` button in `ListsScreen.svelte`; wiring of the
  existing no-op `⋮` in `ItemsScreen.svelte`; list delete + undo snackbar on
  the Lists screen; minimal stub `+page.svelte` at
  `/(app)/lists/[list_id]/trash/` so the `goto` call passes type-check. No
  actual trash content in the stub.
- **`UndoSnackbar.svelte` wraps `Snackbar.svelte`.** `Snackbar.svelte` is a
  generic notification component used by `profile/+page.svelte` and
  `LoginRequest.svelte`; keep it. The inline `.undo-snackbar` block in
  `ItemsScreen.svelte` is the item-delete snackbar and is **not** using
  `Snackbar.svelte`. To unify them without duplication:
  1. Enhance `Snackbar.svelte` with an optional `leading?: Snippet` prop that
     renders before the message text — this is what allows `UndoSnackbar` to
     inject the leading `trash-2` icon. Existing callers that don't pass
     `leading` are unaffected.
  2. Fix `Snackbar.svelte`'s `left: 16px; right: 16px` CSS to the correct
     fixed-position formula from `docs/ui.md` (it currently uses the bare
     form, which the doc prohibits). Update `Snackbar.test.ts` if the
     computed positions are asserted.
  3. Create `UndoSnackbar.svelte` (props: `message: string`, `onUndo: () =>
     void`; owns the 6-second timer, emits `dismiss` event) as a wrapper
     around `Snackbar.svelte` that passes `actionLabel="UNDO"` and the
     leading trash icon snippet. Svelte compiles nesting away — there is no
     runtime overhead for the wrapper.
  4. Replace the inline `.undo-snackbar` block in `ItemsScreen.svelte` with
     `<UndoSnackbar>`.
  5. Write `UndoSnackbar.test.ts` as a **new** file (not a rename of
     `Snackbar.test.ts`) covering the timer, the undo callback, and the
     dismiss event.
- **Fixed-position formula.** `UndoSnackbar.svelte` (and the corrected
  `Snackbar.svelte`) must use:
  `left: max(12px, calc(50% - var(--app-max-w) / 2 + 12px))` and matching
  `right` (the 12 px inset from design screen 15). Never bare `left: 16px`.
- **Spec corrections vs. existing inline code.** The inline `.undo-snackbar`
  block in `ItemsScreen.svelte` has several deviations from R4. When writing
  `UndoSnackbar.svelte`, use the R4 values — do **not** copy the existing
  values:

  | Property | Existing code | R4 spec (use this) |
  |---|---|---|
  | snackbar `padding` | `14px 16px` | `12px 14px` |
  | item name `font-weight` | `500` | `600` |
  | UNDO label `font-size` | `13px` | `12px` |
  | UNDO label `padding` | `0 4px` | `4px 8px` |
- **`⋮` button replaces `chevron-right` on list rows.** `design/cairn-screens.jsx`
  `ListsScreen` renders a trailing `chevron-right` on each row. Because tapping
  the row name is the navigate-into-list action (per `docs/ui.md`), the `chevron-right`
  is purely decorative. Replace it with the `⋮` (`more-vertical`) icon button.
  Remove the `chevron-right` from `ListsScreen.svelte` rows in this task.
- **Navigation after list delete — caller-supplied `onDelete` callback.**
  `ListOverflowSheet` must accept an `onDelete: () => void` prop. After the
  sheet closes itself (one `history.back()` via `pushHistoryGuard`), it calls
  `props.onDelete()`. The callers supply different implementations:
  - `ListsScreen` passes `onDelete={() => {}}` — no extra navigation; the
    user is already on the Lists screen and the deleted row has been removed
    from local state.
  - `ItemsScreen` passes `onDelete={() => history.back()}` — one additional
    `history.back()` to pop the now-stale Items route and return to Lists.
    Do **not** use `goto('/(app)/lists')` — that would leave the Items route
    in the back stack.

  **Add code comments at both call sites** explaining the asymmetry, because
  the double-back pattern is not obvious to a reader. Something like:
  ```ts
  // ItemsScreen — delete closes the sheet (one back) then leaves this
  // route (second back), because the list this screen belongs to no
  // longer exists.
  onDelete={() => history.back()}

  // ListsScreen — delete closes the sheet only; the user is already
  // on the right screen and the row has been removed from local state.
  onDelete={() => {}}
  ```
- The 0601 sub-plan's TASKS.md must note the toolchain ordering constraint: the
  trash stub route must be created in the same task (or an earlier task) that
  adds `goto('/lists/<id>/trash')` to the overflow sheet. See
  `docs/quality.md` → "Navigating to a not-yet-created SvelteKit route".
- List delete state lives in `web/src/lib/list/state/lists.svelte.ts` under a
  `pendingDelete` field, mirroring `items.svelte.ts`'s pattern from step 4.
- **`loadLists()` must filter out deleted lists.** The `lists_select` RLS
  policy includes `or deleted_by = public.uid()` to allow the soft-delete
  PATCH to pass Postgres's WITH-CHECK gate. Side-effect: `GET /lists` returns
  the deleter's own soft-deleted rows. Add `&deleted_at=is.null` to the query
  string in `lists.svelte.ts` so that deleted lists are never shown on the
  Lists screen regardless of who deleted them. (`items_ranked` avoids the
  parallel problem via its `WHERE i.deleted_at IS NULL` clause; there is no
  equivalent view for lists, so the filter must be applied by the client.)
- Before writing 0601 tasks, read `design/cairn-screens.jsx` screens 11 and 15
  and `docs/ui.md` → "Trash & undo" for the visual spec and snackbar behaviour.
  Record font sizes, colours, and layout in the task Decisions.
- **Overflow sheet row icons** (from design screen 11, confirmed in R1):
  `pencil` → Rename list; `feather` → Edit description; `trash-2` → View
  trash; `trash` (ember) → Delete list. Note `trash` and `trash-2` are
  different Lucide icons — do not swap them.
- **Design vs scope note:** screen 11 (`ListMenuScreen`) shows the step-8
  complete sheet — 7 rows (Rename, Edit description, Invite a friend, Manage
  members, View trash, Leave this list, Delete list). Step 6 implements only the
  4 rows listed in R1. Omit "Invite a friend", "Manage members", and "Leave this
  list" entirely — no placeholders, no disabled rows. Those three land in step 8
  (`plans/0000_implementation_order.md` step 8: "list overflow menu
  (rename/edit/leave/delete/view-trash)").

**Steps:**
1. `git checkout -b 0601_list_overflow 0600_soft_delete_ux`
2. Invoke `/write-plan` to create `plans/0601_list_overflow/` with its
   REQUIREMENTS.md, PLAN.md, and TASKS.md.
3. Implement the sub-plan task by task.
4. Run `./scripts/check.sh` — must be green.
5. `git checkout 0600_soft_delete_ux && git merge --no-ff 0601_list_overflow`

**Verify:** `./scripts/check.sh` green on `0600_soft_delete_ux` after merge.
Opening `⋮` on a list row shows the sheet; rename and delete + undo work in
the browser.

---

## Phase 2 — 0602: Trash screens

### [x] 2.1 Plan and implement sub-step 0602 (item trash + deleted-lists screens)

**Created:** 2026-05-26T00:00:00Z
**Completed:** 2026-05-27T10:32:06Z

**Why:** The item trash screen and the account-level deleted-lists screen are
the recovery surfaces that make soft-delete useful. 0602 fills in the trash
route stub created by 0601, and creates the deleted-lists screen that the
Settings Recovery section (0603) will link to.

**Prerequisites:** Task 1.1 merged — `0600_soft_delete_ux` contains the
`ListOverflowSheet`, the per-row `⋮` button, the list delete + undo flow, and
the minimal trash route stub.

**Decisions:**
- Sub-branch cut from the updated `0600_soft_delete_ux` (post-0601 merge).
- Scope: fill in `/(app)/lists/[list_id]/trash/+page.svelte` (item trash,
  `items_deleted` view, restore via PATCH); create
  `/(app)/settings/deleted-lists/+page.svelte` (account trash, `lists_deleted`
  view, restore via PATCH); empty states for both; Vitest tests for both.
- Attribution `deleted_by` display name: use a client-side batch
  `GET /profiles?id=in.(<uuid-list>)` to resolve display names for
  `deleted_by` on both `items_deleted` and `lists_deleted`. PostgREST
  embedding via `profiles!deleted_by` is **not available**: `items.deleted_by`
  and `lists.deleted_by` both FK to `auth.users(id)` (the `auth` schema,
  `db/migrations/0004_domain_schema.sql:123,126,180`), not to
  `public.profiles(id)`. PostgREST only auto-embeds via FKs within the
  exposed (`public`) schema; attempting the embedding returns empty data
  silently. Fetch `profiles` IDs once per page load, deduplicate, batch.
- No snackbar on restore — the action is deliberate and its success is
  self-evident (the row disappears).
- The deleted-lists screen route already needs to exist before the Settings nav
  row (0603) links to it. Creating the route in 0602 satisfies this; 0603's
  `goto` call will type-check because the route exists.
- Before writing 0602 tasks, read `design/cairn-screens.jsx` screen 14
  (TrashScreen) for the visual spec. Record font sizes, colours, and layout in
  the task Decisions.

**Steps:**
1. `git checkout -b 0602_trash_screens 0600_soft_delete_ux`
2. Invoke `/write-plan` to create `plans/0602_trash_screens/` with its three files.
3. Implement the sub-plan task by task.
4. Run `./scripts/check.sh` — must be green.
5. `git checkout 0600_soft_delete_ux && git merge --no-ff 0602_trash_screens`

**Verify:** `./scripts/check.sh` green on `0600_soft_delete_ux` after merge.
Delete an item → open trash → Restore → item back in live list. Navigate to
`/settings/deleted-lists/` directly — page renders (may be empty if no lists
are deleted yet).

---

## Phase 3 — 0603: Settings Recovery + tombstone

### [ ] 3.1 Plan and implement sub-step 0603 (Settings Recovery section + tombstone visual)

**Created:** 2026-05-26T00:00:00Z
**Completed:**

**Why:** The Recovery section in Settings makes the deleted-lists screen
discoverable. The tombstone Avatar and attribution styling close the step-6
contract: any item attributed to a deleted user renders correctly. Both are
small but cross-cutting — they touch `Avatar.svelte`, `ItemsScreen.svelte`,
and `SettingsScreen.svelte` — which is why they land together in one sub-plan
rather than being split across 0601/0602.

**Prerequisites:** Tasks 1.1 and 2.1 merged — `0600_soft_delete_ux` contains
the overflow sheet, the trash screens, and the
`/(app)/settings/deleted-lists/` route that the Settings nav row will target.

**Decisions:**
- Sub-branch cut from the updated `0600_soft_delete_ux` (post-0602 merge).
- Scope: add Recovery section to `SettingsScreen.svelte` (R9); create
  `web/src/lib/shared/model/constants.ts` and export `TOMBSTONE_UID` (R10);
  add tombstone branch to `Avatar.svelte` (R10); add tombstone attribution
  styling to `ItemsScreen.svelte` (R11).
- `TOMBSTONE_UID = '00000000-0000-0000-0000-000000000000'` — the same sentinel
  UUID used by `on delete set default` FK defaults throughout the schema.
  Centralising it in `constants.ts` prevents magic strings proliferating; see
  `docs/data-model.md` for the tombstone design.
- Tombstone Avatar: `background: oklch(78% 0.01 80)` (near-gray, matching the
  design's `SEED_USERS.ghost.tone`), zero inner text. Branch order in the
  template: tombstone check first, then photo branch, then initials branch.
- Attribution styling: detect `created_by === TOMBSTONE_UID` (and
  `modified_by === TOMBSTONE_UID`) in the Svelte template; apply
  `font-style: italic; color: var(--stone-lt); font-family: var(--serif)` to
  the name span. See `design/cairn-screens.jsx` screen 17 for the exact visual.
- Playwright tombstone e2e: deferred to Phase 4 verification. The
  practical reason is the Playwright memory (Playwright cannot run on
  this machine). The `tg_set_attribution_items` trigger does *not*
  block tombstone PATCHes — its freeze gate is `if new.created_by is
  distinct from '00000000-…'`, so a client can deliberately PATCH
  `created_by` to the tombstone UID and have it stick (see
  `docs/data-model.md:632, 636`, where the doc calls this "vandalism,
  not privilege escalation"). A future Playwright spec could seed
  via that path.
- The 0603 sub-plan must read `design/cairn-screens.jsx` screen 13
  (SettingsScreen V2) before writing tasks, and record the Recovery section's
  visual spec (icon, title, subtitle, chevron, section header style) in the
  relevant task's Decisions.
- **Toolchain ordering:** the task that creates `constants.ts` and exports
  `TOMBSTONE_UID` must precede every task that imports `TOMBSTONE_UID` from
  it (`Avatar.svelte`, `ItemsScreen.svelte`). `svelte-check` fails if an import
  resolves to a file that doesn't exist yet. Same constraint as the 0601 trash
  route stub (task 1.1 Decisions) — handle it the same way: create the file in
  the same task as, or an earlier task than, its first importer.

**Steps:**
1. `git checkout -b 0603_settings_tombstone 0600_soft_delete_ux`
2. Invoke `/write-plan` to create `plans/0603_settings_tombstone/` with its
   three files.
3. Implement the sub-plan task by task.
4. Run `./scripts/check.sh --e2e` — must be green (e2e tests write-but-skip
   per the Playwright-unrunnable memory if the tombstone case cannot be seeded).
5. `git checkout 0600_soft_delete_ux && git merge --no-ff 0603_settings_tombstone`

**Verify:** `./scripts/check.sh --e2e` green on `0600_soft_delete_ux` after
merge. Settings screen shows Recovery section with Deleted lists row.
`<Avatar uid="00000000-0000-0000-0000-000000000000" displayName="Deleted user">`
renders a gray disc with no initials in the browser.

---

## Phase 4 — Wrap up

### [ ] 4.1 Final verification and merge to main

**Created:** 2026-05-26T00:00:00Z
**Completed:**

**Why:** Confirms the full step-6 feature works end-to-end on the integration
branch before it lands on `main`.

**Prerequisites:** Tasks 1.1, 2.1, 3.1 all merged into `0600_soft_delete_ux`.

**Decisions:**
- Run the full E2E suite before merging — the soft-delete flows (delete item,
  undo, view trash, restore; delete list, undo) must pass alongside the step-4
  and step-5 flows (lists, items, vote, avatar).
- Tick step 6's checkbox in `plans/0000_implementation_order.md` as part of
  the merge commit.

**Steps:**
1. On `0600_soft_delete_ux`, run `./scripts/check.sh --e2e` — must be green.
2. Edit `plans/0000_implementation_order.md`: change `6. [ ]` to `6. [x]`.
3. Commit: `chore(plan): tick step 6 in implementation order`.
4. `git checkout main && git merge --no-ff 0600_soft_delete_ux`

**Verify:** `./scripts/check.sh --e2e` green on `main`. Delete + undo for items
and lists works in the browser. Settings Recovery section navigates to the
deleted-lists screen.
