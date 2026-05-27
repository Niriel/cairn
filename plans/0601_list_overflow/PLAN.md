# Plan: List overflow menu

Sub-plan of step 6 (soft-delete UX). Wires the list-management surface: a per-row
`⋮` overflow button on the Lists screen and the wired-up Items screen TopBar
`⋮`, both opening a `ListOverflowSheet` with four actions — Rename, Edit
description, View trash, Delete list.

## Context

The DB has had soft-delete columns on `lists` and `items` since step 1. Step 4
wired item soft-delete (the `DeleteItemSheet` flow and the inline undo snackbar
in `ItemsScreen.svelte`). Lists have had no management UI at all — no rename, no
description edit, no delete. The Items screen's TopBar `⋮` button has existed
since step 4 but has always been a no-op. This sub-plan closes both gaps for
R1–R4 of `plans/0600_soft_delete_ux/REQUIREMENTS.md`.

The snackbar used for item-delete lives as an inline block in
`ItemsScreen.svelte` with several visual deviations from R4 (wrong padding,
font-weight, UNDO label sizing). Unifying item-delete and list-delete under a
shared `UndoSnackbar.svelte` fixes both callsites at once and prevents the
deviations compounding in 0602.

The `loadLists()` query does not filter `deleted_at IS NULL` today, which means
newly soft-deleted lists can reappear on reload (the `lists_select` RLS policy
allows the deleter to see their own deleted rows so the soft-delete PATCH passes
Postgres's WITH-CHECK gate). Adding the filter is a one-line correctness fix
that belongs here with the delete flow (R6).

## Decisions

**`UndoSnackbar` wraps `Snackbar`, not standalone.** `Snackbar.svelte` is
already used by `LoginRequest.svelte` and the profile page for generic
notifications. Replacing it would change callers that aren't involved in undo.
Adding an optional `leading?: Snippet` prop to `Snackbar` lets `UndoSnackbar`
inject the `trash-2` icon without touching non-undo callsites. The wrapper
approach also means the 6-second timer and UNDO action live in one place, not
repeated per-screen.

**Icon buttons are components, not inline elements.** Every `<button>` that renders only an icon — the `⋮` overflow trigger, the Settings gear, the TopBar back arrow, and so on — uses a `basic/` component so the style is defined once and not re-invented per screen. Two components land in Phase 0: `IconButton.svelte` (the generic transparent-background icon button) and `MoreButton.svelte` (pre-loaded with `more-vertical`). `IconButton` uses `color: inherit` so callers control colour via context or a `style` attribute; it accepts and forwards all standard HTML button attributes. Any task in this plan that modifies a file carrying an existing inline `<button class="icon-btn">` element migrates that element to `IconButton` or `MoreButton` before landing.

**Row-top wrapper prevents nested buttons.** The list row currently has a single `<button class="row-nav">` containing the list name and a trailing `<span class="chevron">`. Replacing the chevron span with an overflow `<button>` would nest a button inside a button — invalid HTML. A `<div class="row-top">` flex wrapper holds two siblings instead: `row-nav` (name only, `flex: 1`) and a `MoreButton` (fixed width). No `e.stopPropagation()` needed; sibling buttons do not bubble into each other.

**Fix `Snackbar.svelte` CSS while the file is open.** The existing
`left: 16px; right: 16px` violates the canonical fixed-position formula in
`docs/ui.md` ("fixed-element positioning within `--app-max-w`"). Correcting it
in the same task that adds the `leading` snippet prop keeps the CSS fix from
becoming an orphan follow-up. `Snackbar.test.ts` does not assert computed
positions, so no test changes needed for the CSS fix.

**`onDelete` callback on `ListOverflowSheet`.** After a soft-delete the sheet
closes itself via `history.back()` (one pop). The caller's context determines
whether a second pop is needed: `ListsScreen` is already on the right screen,
so `onDelete={() => {}}` is a no-op; `ItemsScreen` is on the now-stale list
route, so `onDelete={() => history.back()}` pops it. Using a callback instead
of a hard-coded `goto` avoids leaving stale history entries. Both callsites
carry inline code comments explaining the asymmetry.

**Trash route stub lands in Phase 1.** `ListOverflowSheet` contains
`goto(resolve('/lists/<id>/trash'))`. SvelteKit's `resolve()` (and
`svelte-check`) reject navigations to routes that don't exist in
`web/src/routes/`. Creating the stub in Phase 1 — before the sheet is written
in Phase 3 — prevents a `pnpm check` failure mid-implementation.

**Replace `chevron-right` with the `⋮` button on list rows.** The
`chevron-right` is purely decorative (tapping the row name navigates). The
design (`cairn-screens.jsx` `ListsScreen`) shows a `chevron-right` because it
predates the step-6 affordance decision. Replacing it with the `⋮`
(`more-vertical`) button is the settled design (REQUIREMENTS.md R1). The
row-tap action remains navigating into the list.

**List delete state mirrors `items.svelte.ts`.** A `pendingDelete: { list:
ListRow; timerId: ... } | null` field is added to the `lists` state object in
`lists.svelte.ts`. `deleteList()` and `undoDeleteList()` follow the same
optimistic-remove / restore pattern as `softDeleteItem()` / `undoDelete()` in
`items.svelte.ts`. Keeps the mental model consistent.

**Spec corrections applied to `UndoSnackbar`.** The inline `.undo-snackbar`
block in `ItemsScreen.svelte` has several deviations from R4: padding is
`14px 16px` (should be `12px 14px`), item name `font-weight` is `500` (should
be `600`), UNDO label `font-size` is `13px` (should be `12px`), and UNDO label
`padding` is `0 4px` (should be `4px 8px`). `UndoSnackbar.svelte` is written to
R4 spec; the ItemsScreen replacement picks up the corrected values automatically.

## Architecture

### New files

- **`web/src/lib/basic/components/IconButton.svelte`** — generic transparent icon button; `color: inherit`, 4 px padding, flex-centred. Forwards all HTML button attributes (onclick, aria-label, data-test, style, …) via rest-props.
- **`web/src/lib/basic/components/IconButton.test.ts`** — Vitest tests: renders children, forwards data-test, fires onclick.
- **`web/src/lib/basic/components/__mocks__/IconButton.svelte`** — shallow mock.
- **`web/src/lib/basic/components/MoreButton.svelte`** — wraps `IconButton` with a fixed `more-vertical` icon; callers pass only `aria-label`, `onclick`, optional `size` (default 22), and forwarded HTML button attributes.
- **`web/src/lib/basic/components/MoreButton.test.ts`** — Vitest tests: renders more-vertical icon, forwards aria-label, fires onclick.
- **`web/src/lib/basic/components/__mocks__/MoreButton.svelte`** — shallow mock.
- **`web/src/lib/shared/components/UndoSnackbar.svelte`** — shared undo snackbar; wraps `Snackbar.svelte`, owns timer.
- **`web/src/lib/shared/components/UndoSnackbar.test.ts`** — Vitest tests for timer, undo callback, dismiss.
- **`web/src/lib/shared/components/__mocks__/UndoSnackbar.svelte`** — shallow mock for tests that import `UndoSnackbar`.
- **`web/src/lib/list/components/ListOverflowSheet.svelte`** — four-row bottom sheet (Rename, Edit description, View trash, Delete list).
- **`web/src/lib/list/components/ListOverflowSheet.test.ts`** — Vitest tests for sheet rows and callbacks.
- **`web/src/lib/list/components/__mocks__/ListOverflowSheet.svelte`** — shallow mock.
- **`web/src/lib/list/components/RenameListSheet.svelte`** — rename bottom sheet with validation.
- **`web/src/lib/list/components/RenameListSheet.test.ts`** — Vitest tests for save, cancel, validation.
- **`web/src/lib/list/components/__mocks__/RenameListSheet.svelte`** — shallow mock.
- **`web/src/lib/list/components/EditDescriptionSheet.svelte`** — edit-description bottom sheet.
- **`web/src/lib/list/components/EditDescriptionSheet.test.ts`** — Vitest tests for save (incl. null-coerce), cancel.
- **`web/src/lib/list/components/__mocks__/EditDescriptionSheet.svelte`** — shallow mock.
- **`web/src/routes/(app)/lists/[list_id]/trash/+page.svelte`** — stub route (no content); prevents `svelte-check` failures when `goto` references it.

### Modified files

- **`web/src/lib/shared/components/Snackbar.svelte`** — add optional `leading?: Snippet` prop; fix CSS to canonical formula.
- **`web/src/lib/shared/components/Snackbar.test.ts`** — no position assertions exist; no changes needed unless tests are added.
- **`web/src/lib/shared/components/__mocks__/Snackbar.svelte`** — update if mock needs the `leading` slot.
- **`web/src/lib/list/state/lists.svelte.ts`** — add `pendingDelete` field; add `deleteList()` and `undoDeleteList()`; add `&deleted_at=is.null` filter.
- **`web/src/lib/list/state/lists.test.ts`** — add tests for `deleteList` and `undoDeleteList`.
- **`web/src/lib/list/components/ListsScreen.svelte`** — replace `chevron-right` with `MoreButton` inside a `row-top` flex wrapper; migrate Settings `<button class="icon-btn">` to `IconButton`; open `ListOverflowSheet`; add `<UndoSnackbar>` and FAB visibility toggle.
- **`web/src/lib/list/components/ListsScreen.test.ts`** — add tests for `⋮` button and snackbar.
- **`web/src/lib/item/components/ItemsScreen.svelte`** — wire TopBar `⋮` (migrated to `MoreButton`) to `ListOverflowSheet`; replace inline `.undo-snackbar` with `<UndoSnackbar>`.
- **`web/src/lib/item/components/ItemsScreen.test.ts`** — update mock usage; add test for `⋮` → sheet.

## Phase structure

0. **Phase 0 — Basic components.** Create `IconButton.svelte` and `MoreButton.svelte` in `basic/` with tests and mocks. These are pure `basic/` primitives with no Cairn-specific knowledge; they land first so every subsequent phase can import them.

1. **Phase 1 — Foundations.** Create the trash route stub so `goto('/lists/<id>/trash')` will type-check. Fix `Snackbar.svelte` CSS and add the `leading` snippet prop. Build `UndoSnackbar.svelte` and its test. Replace the inline snackbar in `ItemsScreen.svelte` with `<UndoSnackbar>` — this correctness fix can land independently of the overflow sheet. Also adds `&deleted_at=is.null` to `loadLists()`.

2. **Phase 2 — List delete state.** Add `pendingDelete`, `deleteList()`, and `undoDeleteList()` to `lists.svelte.ts` with full Vitest coverage. No UI wiring yet — the state layer is tested in isolation.

3. **Phase 3 — Overflow sheets.** Implement `ListOverflowSheet.svelte`, `RenameListSheet.svelte`, and `EditDescriptionSheet.svelte` with their tests and mocks. These components depend on the trash stub (Phase 1) and the delete-state functions (Phase 2).

4. **Phase 4 — Wiring.** Wire `ListsScreen.svelte` (replace `chevron-right`, open sheet, show undo snackbar, hide FAB). Wire `ItemsScreen.svelte` (open sheet from TopBar `⋮`, pass `onDelete={() => history.back()}`).

## Reference docs and skills

- **`docs/ui.md`** → "Trash & undo", "Fixed-element positioning" — snackbar behaviour and CSS formula.
- **`docs/frontend-layout.md`** — tier split, mock placement, filename conventions (no `+` prefix on test files).
- **`docs/quality.md`** → "Navigating to a not-yet-created SvelteKit route" — why the trash stub must land in Phase 1.
- **`design/cairn-screens.jsx`** screen 11 (`ListMenuScreen`) and screen 15 (`ItemsScreenWithUndo`) — visual spec for the sheet and snackbar.
- **`plans/0600_soft_delete_ux/REQUIREMENTS.md`** — parent-plan R1–R4 that this sub-plan implements.
