# Plan: Soft-delete UX

Step 6 of the master plan — exposing the soft-delete surface that the DB has
supported since step 1. Steps 1–5 are merged; avatars and the tombstone
`avatar_version = 0` convention are in place. This plan builds the list
overflow menu, the per-list item trash, the account-level deleted-lists screen,
and the tombstone Avatar visual.

## Context

After step 5 the stack has:

- **DB:** `lists`, `items`, `votes`, full RLS, `items_deleted` view,
  `lists_deleted` view. All soft-delete machinery is in place.
- **Item soft-delete (step 4):** Items can be soft-deleted from the accordion's
  Delete button with a 6-second undo snackbar. The pattern is proven.
- **Lists screen:** each list row has no `⋮` button; list rename, delete, and
  view-trash are unimplemented.
- **Items screen:** TopBar has a `⋮` button wired to `onclick={() => {}}` — it
  does nothing.
- **Settings:** only Appearance + Sign Out sections. No Recovery section.
- **Avatar:** photo branch and initials branch exist; no tombstone branch.

Three gaps remain before step 6 is complete: (1) list-level management
(overflow menu, rename, delete + undo); (2) trash screens (item trash, account
trash); (3) Settings Recovery section and tombstone visual. Each gap maps to a
sub-plan.

## Decisions

**Orchestration via sub-branches, not a single large branch.** The three layers
have different test surfaces (component Vitest for the overflow sheet, screen
Vitest for the trash and settings screens, Playwright for end-to-end flows) and
different reviewers' mental models. Splitting keeps each PR focused.
`0600_soft_delete_ux` itself contains no implementation — only the plan files
and the merge commits. Same pattern as `0400_mvp_product` and `0500_avatars`.

**Per-row `⋮` overflow button on list rows, not long-press or swipe.** The
design (screen 11, `ListMenuScreen`) shows the same bottom-sheet pattern used
by the delete-item confirmation and the avatar source sheet. A per-row `⋮`
icon button is the most discoverable affordance on mobile and maps directly to
the design's `<IconBtn icon="more-vertical">` in the TopBar — the same button
already sits in the Items screen TopBar doing nothing. Step 6 resolves the open
question in `docs/ui.md` "Not decided": the chosen affordance is a per-row
`⋮` button on the Lists screen plus the already-placed `⋮` in the Items screen
TopBar, both opening the same `ListOverflowSheet`.

**No confirmation sheet for list delete.** The step-4 item-delete pattern
already establishes that soft-delete is safe without confirmation — undo is the
recovery path. Adding a confirmation sheet doubles the taps for a reversible
operation. The overhead is not worth the safety, especially since the account
trash (R7) is the long-stop.

**Delete list navigates back to Lists (if on Items screen).** After a list is
deleted its route is semantically gone. Staying on `/(app)/lists/<uuid>/` would
show a broken or empty screen. Navigating back with `history.back()` lands on
the Lists screen, which already reflects the deletion (the row is gone from the
live `GET /lists` response). The undo snackbar appears there.

**Tombstone detection by UID, not `displayName`.** The tombstone user's
`profiles.display_name = 'Deleted user'` is a mutable DB field. A future
operator `SET ROLE` update could change it. The UID
`'00000000-0000-0000-0000-000000000000'` is the structural sentinel baked into
the FK defaults — it cannot change without a schema migration. Detecting by UID
is the correct gate.

**`TOMBSTONE_UID` exported from `constants.ts`.** The same sentinel appears in
`Avatar.svelte`, item attribution logic, and eventually the account-deletion
plan (step 9). A shared constant prevents magic strings and makes grep easy.

**Shared `<UndoSnackbar>` component extracted in 0601.** The undo snackbar
visual (`background: var(--ink); color: var(--paper)` — contrasting/inverted
relative to the app surface, dark in light mode and light in dark mode; leading
trash icon, message text, trailing uppercase UNDO label in `var(--sage)`) is
the same for both item delete and list delete.
Duplicating the fixed-position CSS, FAB-hide signal, and 6-second timer in both
`ItemsScreen.svelte` and `ListsScreen.svelte` would create two maintenance
targets. In 0601, the existing step-4 item snackbar code is extracted into
`web/src/lib/shared/components/UndoSnackbar.svelte`; `ItemsScreen.svelte` is
updated to use it; `ListsScreen.svelte` uses it for list delete. Props:
`message: string`, `onUndo: () => void`; the component owns the timer and emits
a `dismiss` event when it expires. The `UndoSnackbar.test.ts` covers timer
behaviour and the undo callback.

**Trash route stub in 0601.** The `goto('/lists/<id>/trash')` call in the
overflow sheet's "View trash" action must pass `svelte-check` at the time 0601
lands. Creating a minimal stub `+page.svelte` in 0601 satisfies the router's
`resolve()` check; 0602 fills it in. Same escape documented in
`docs/quality.md` → "Navigating to a not-yet-created SvelteKit route", applied
here at the orchestration level rather than within a single task.

**Attribution `deleted_by` display name via PostgREST embedding.** The
`items_deleted` view exposes `deleted_by` as a UUID. Fetching the display name
can be done either via a separate `GET /profiles?id=eq.<uuid>` call per row, or
via PostgREST's embedding (`?select=*,profiles!deleted_by(display_name)`). The
embedding form is preferred (one round-trip); the 0602 sub-plan must confirm
whether the FK relationship is visible to the PostgREST embedding engine and
fall back to a client-side batch lookup if not.

## Architecture

### New plan directories (created by this plan's tasks)

- **`plans/0601_list_overflow/`** — list overflow sheet, rename, edit
  description, delete + undo, trash route stub.
- **`plans/0602_trash_screens/`** — item trash screen, deleted-lists screen,
  restore flows.
- **`plans/0603_settings_tombstone/`** — Settings Recovery section, tombstone
  Avatar branch, tombstone attribution styling.

### Branches

```
main
 └─ 0600_soft_delete_ux               ← this plan's branch
     ├─ 0601_list_overflow             ← merges back into 0600_soft_delete_ux
     ├─ 0602_trash_screens             ← merges back into 0600_soft_delete_ux
     └─ 0603_settings_tombstone        ← merges back into 0600_soft_delete_ux
```

### Files touched across the step (sub-plan level)

**New — components:**

- `web/src/lib/list/components/ListOverflowSheet.svelte`
- `web/src/lib/shared/components/UndoSnackbar.svelte` (extracted/refactored from
  the step-4 item snackbar; props: `message: string`, `onUndo: () => void`;
  handles the 6-second timer and FAB-hide signal internally; reused by both
  `ItemsScreen.svelte` and `ListsScreen.svelte`)

**New — routes:**

- `web/src/routes/(app)/lists/[list_id]/trash/+page.svelte`
- `web/src/routes/(app)/settings/deleted-lists/+page.svelte`

**New — model:**

- `web/src/lib/shared/model/constants.ts`

**Modified — components and state:**

- `web/src/lib/list/components/ListsScreen.svelte` (add `⋮` per row)
- `web/src/lib/list/state/lists.svelte.ts` (add delete/undo state)
- `web/src/lib/item/components/ItemsScreen.svelte` (wire `⋮`, tombstone style)
- `web/src/lib/shared/components/Avatar.svelte` (tombstone branch)
- `web/src/lib/settings/components/SettingsScreen.svelte` (Recovery section)

**Modified — docs:**

- `docs/ui.md` (resolve "Not decided" bullet for list editing affordance)

**New — tests:**

- `web/src/lib/shared/components/UndoSnackbar.test.ts`
- `web/src/lib/list/components/ListOverflowSheet.test.ts`
- `web/src/routes/(app)/lists/[list_id]/trash/page.test.ts`
- `web/src/routes/(app)/settings/deleted-lists/page.test.ts`
- `web/e2e/soft-delete.spec.ts`

## Phase structure

**Phase 0 — reconcile docs.** Two doc edits committed directly to
`0600_soft_delete_ux` before any sub-branch is cut: (0.1) remove the "Editing
and deleting lists" bullet from `docs/ui.md`'s "Not decided" section and add a
cross-reference in "Trash & undo" to the `⋮` overflow button; (0.2) fix the
stale "long-press menu" parenthetical in the Settings section.

**Phase 1 — 0601: List overflow menu.** Create branch `0601_list_overflow` from
`0600_soft_delete_ux`. Write its detailed plan with `/write-plan`. Implement
the `⋮` button on list rows, `ListOverflowSheet`, rename and edit-description
sheets, list delete + undo, and the trash route stub. Verify with
`./scripts/check.sh`. Merge back.

**Phase 2 — 0602: Trash screens.** Create branch `0602_trash_screens` from the
updated `0600_soft_delete_ux`. Write its detailed plan with `/write-plan`.
Implement the item trash screen (filling in the 0601 stub), the deleted-lists
screen, and all restore flows. Verify with `./scripts/check.sh`. Merge back.

**Phase 3 — 0603: Settings Recovery + tombstone.** Create branch
`0603_settings_tombstone` from the updated `0600_soft_delete_ux`. Write its
detailed plan with `/write-plan`. Implement the Settings Recovery section,
`TOMBSTONE_UID` constant, `<Avatar>` tombstone branch, and item attribution
styling. Verify with `./scripts/check.sh --e2e`. Merge back.

**Phase 4 — Wrap up.** Run `./scripts/check.sh --e2e` on `0600_soft_delete_ux`.
Tick step 6's checkbox in `plans/0000_implementation_order.md`. Merge
`0600_soft_delete_ux` into `main` with `--no-ff`.

## Reference docs and skills

- **`docs/ui.md`** → "Trash & undo" — canonical snackbar and trash-screen spec.
- **`docs/data-model.md`** → `items_deleted` and `lists_deleted` views, RLS
  policies, tombstone UUID pattern, `on delete set default` rationale.
- **`docs/frontend-layout.md`** — lib tier split and filename conventions.
- **`docs/testing.md`** — three test layers; Vitest for components and screens,
  Playwright for flows.
- **`docs/quality.md`** — "Navigating to a not-yet-created SvelteKit route"
  explains the stub pattern used for the trash route in 0601.
- **`design/cairn-screens.jsx`** — screen 11 (`ListMenuScreen`), screen 14
  (`TrashScreen`), screen 15 (`ItemsScreenWithUndo`), screen 17
  (`ItemsScreenTombstone`).
- **`.claude/skills/write-plan.md`** — sub-branch plan format.
- **`.claude/skills/writing-tasks.md`** — task format each sub-plan must follow.
