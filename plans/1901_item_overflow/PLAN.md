# Plan: Item extra-panel overflow menu

Replace the inline Delete/Edit buttons in the item extra panel with a top-right
More (⋮) button that opens a bottom-sheet overflow menu — the same pattern the
Lists screen already uses — so the imminent copy/move-between-lists feature has
somewhere to land without two-buttons-don't-fit pressure.

## Context

On the Items screen (`web/src/lib/item/components/ItemsScreen.svelte`), tapping
an item row unfolds an **extra panel** (an `AccordionRow` body) showing the
item's notes, per-member votes + a vote control, attribution, and — at the
bottom — two inline pill buttons: **Delete** (left, destructive) and **Edit**
(right). This is documented in `docs/ui.md` → "Items screen".

A future feature will let users copy and move items between lists. That adds at
least two more per-item actions, and the inline two-button row won't
accommodate them. The Lists screen already solved the equivalent problem for
per-list actions: each list row's extra block has a **More (⋮) button pinned
top-right** (`ListsScreen.svelte`) that opens a **bottom-sheet overflow menu**
(`ListOverflowSheet.svelte`) listing Rename, Edit description, Manage members,
View bin, toggle public, Leave, Delete. We adopt that exact pattern for items.

This is a UI-only change: no schema, RLS, trigger, view, or migration work. The
edit and delete _flows_ already exist (`AddEditItemSheet`, `DeleteItemSheet`,
and the undo snackbar in `items.svelte` state) and are unchanged — only their
entry point moves from inline buttons into the overflow sheet.

The reusable pieces already exist: `MoreButton`
(`web/src/lib/shared/components/MoreButton.svelte`, already imported by
`ItemsScreen.svelte`) and `Sheet` (`web/src/lib/basic/components/Sheet.svelte`).

## Decisions

**Mirror `ListOverflowSheet`, don't generalise it.** A new
`ItemOverflowSheet.svelte` is created rather than trying to share one component
between lists and items. The two sheets differ in their action sets, their
props, and (for lists) their nested sub-sheets; a shared abstraction would be
mostly conditionals. The cost of a second small component is lower than the cost
of a forked-by-flags shared one. The new sheet copies `ListOverflowSheet`'s
structure (Sheet + header + `ul.menu` of `Button variant="text"` rows) and its
`<style>` (header border, full-bleed `.menu` band) so the two stay visually
identical.

**The Items screen keeps owning the edit/delete sheets and undo state (R3).**
`AddEditItemSheet`, `DeleteItemSheet`, and the undo snackbar are driven by
`ItemsScreen`'s `editSheetItem` / `deleteSheetItem` state and `items.svelte`'s
`pendingDelete`. Rather than move that wiring into the overflow sheet,
`ItemOverflowSheet` is a thin menu that emits `onedit` / `ondelete`; the parent
handles them exactly as the old inline buttons did (set the target sheet item,
clear `overflowItem`, clear `openId`). This keeps the delete→undo path untouched
and the new component free of business logic.

**Menu carries only Edit and Delete, no Copy/Move stubs.** The future feature
isn't built; placeholder entries would be dead UI. The menu is ordered
non-destructive-first / destructive-last (matching `ListOverflowSheet`), so
Copy/Move slot in between Edit and Delete later (R2).

**Reuse the Lists More-button placement verbatim.** The list `.extra` block is
`position: relative` with a wide right inset; the `.more` span is
`position: absolute; top: 0.375rem; right: 0.55rem`. The item `.extra` adopts
the same. One difference needs visual judgement: the item panel's first content
line is notes (optional) and the `votes-row` whose `VoteControl` is already
right-aligned, so the panel needs enough top / right inset that the More button
doesn't collide with either (see Open questions).

**Back-button choreography: leave the open row in place when opening the target
sheet (R4).** `Sheet` pushes a history guard on mount and `history.back()`s on
unmount, and the open item row pushes its own guard via `ItemsScreen`'s `openId`
`$effect`. So while the overflow sheet is open the guard stack is
`[rowGuard, overflowGuard]`. If `onedit`/`ondelete` nulled both `overflowItem`
_and_ `openId` in one tick, two `pushHistoryGuard` cleanups would fire two
`history.back()` calls — but `back-stack.svelte`'s `suppressNextPopState` is a
single boolean and absorbs only one, so the second pop is mistaken for a user
back-press and immediately closes the just-mounted edit/delete sheet. We avoid
this by leaving `openId` set: the handlers null only `overflowItem` and set the
target sheet item, so exactly one guard tears down (the overflow sheet) and one
pushes (the target sheet) — the proven one-back-one-push shape the old inline
buttons used. The row stays expanded under the sheet's backdrop; backing out of
the edit/delete sheet returns to the open row on the Items screen, never to a
ghost overflow sheet. (The `await tick()` + await-`popstate` pattern in
`onviewtrash` is for one teardown before a `goto`, not this swap.)

## Architecture

### New files

- **`web/src/lib/item/components/ItemOverflowSheet.svelte`** — bottom-sheet
  overflow menu for a single item; header shows the item name, menu has Edit and
  Delete rows; emits `onedit` / `ondelete` / `onclose`. Modelled on
  `ListOverflowSheet.svelte`.
- **`web/src/lib/item/components/ItemOverflowSheet.test.ts`** — Vitest:
  renders the two menu rows, header shows the name, clicking each fires the
  matching callback.
- **`web/src/lib/item/components/__mocks__/ItemOverflowSheet.svelte`** — test
  stub for `ItemsScreen.test.ts`. Unlike the static `ListOverflowSheet` mock,
  it forwards callbacks: renders an `item-overflow-sheet-stub` wrapper plus
  `item-overflow-edit` (`onclick={onedit}`) and `item-overflow-delete`
  (`onclick={ondelete}`) buttons, so the screen's edit/delete wiring is testable.

### Modified files

- **`web/src/lib/item/components/ItemsScreen.svelte`** — remove the
  `.extra-actions` block (the inline Delete/Edit buttons), its CSS, and the
  now-unused `import Button`; add a `.more` span with `MoreButton` pinned
  top-right of `.extra` (and the matching `position: relative` / inset CSS); add
  `overflowItem` state; render `ItemOverflowSheet` when set, wiring
  `onedit`/`ondelete` to the existing `editSheetItem` / `deleteSheetItem` flows
  (leaving `openId` set — see the back-button decision).
- **`web/src/lib/item/components/ItemsScreen.test.ts`** — add assertions
  (the file has no `extra-delete`/`extra-edit` assertions today; those live only
  in the e2e spec): mock `ItemOverflowSheet`, then opening a row and clicking
  `item-overflow-{id}` renders the stub, and clicking its `item-overflow-edit` /
  `item-overflow-delete` buttons opens the corresponding sheet stub.
- **`web/e2e/items.spec.ts`** — re-point the `extra-edit`/`extra-delete`
  references in tests `(c)`, `(e)`, and `(f)` through More → menu instead of the
  old inline buttons (`(g)` only taps undo, so it is unchanged); assert the back
  button closes the overflow sheet without leaving the screen, and that the back
  button from the edit/delete sheet returns to the open screen (R4).
- **`docs/ui.md`** — Items screen section: describe the top-right More button +
  overflow sheet (Edit, Delete, future Copy/Move) instead of inline buttons (R5).

### Flow sketch

```
item row (AccordionRow) ── tap ──▶ openId set, extra panel unfolds
  extra panel ── More (⋮) ──▶ overflowItem = item ──▶ ItemOverflowSheet
    ├─ Edit   ▶ editSheetItem = item; overflowItem = null (row left open) ▶ AddEditItemSheet (existing)
    └─ Delete ▶ deleteSheetItem = item; overflowItem = null (row left open) ▶ DeleteItemSheet (existing) ▶ undo snackbar
```

## Phase structure

TDD ordering: each task writes its Vitest/Playwright RED steps before the
implementation that greens them, within the same task (commit).

1. **Phase 1 — overflow sheet + screen wiring.**
   - Task 1.1 creates `ItemOverflowSheet.svelte` with its Vitest test (RED →
     GREEN): header + Edit/Delete rows emitting callbacks.
   - Task 1.2 rewires `ItemsScreen.svelte` — remove inline buttons, add the
     top-right More button and `overflowItem` state, render the sheet wired to
     the existing edit/delete flows — updating `ItemsScreen.test.ts` (RED →
     GREEN) and the `items.spec.ts` e2e flows, and updating `docs/ui.md`.

No Phase 0: the only doc touched is `docs/ui.md`, and that edit lands together
with the code in Task 1.2 (the doc is descriptive here, not consumed by tests).

## Reference docs and skills

- **`docs/ui.md`** — Items-screen extra-panel spec (the doc this plan updates);
  overflow-menu / bottom-sheet, button-order, and destructive-action conventions.
- **`docs/frontend-layout.md`** — `web/src/lib/` tier split and filename rules
  (the new sheet lives in the `item/` domain alongside its siblings).
- **`docs/testing.md`** — Vitest (component behaviour) + Playwright (user flow)
  layers this change touches.

## Open questions

- **Exact More-button insets in the item panel.** The Lists values
  (`top: 0.375rem; right: 0.55rem`, wide right padding) are the starting point,
  but the item panel's notes line and right-aligned vote control may need a
  slightly larger top/right inset to clear the button. Default: tune in the
  running app (light + dark, with and without notes) during Task 1.2 and record
  the final values as a CSS comment, as `ListsScreen` does.
