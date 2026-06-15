# Requirements: Item extra-panel overflow menu

The item extra panel (the accordion body that unfolds under an item row on the
Items screen) currently ends with two inline buttons — **Delete** and **Edit**.
A forthcoming feature will let users **copy and move items between lists**, so
two inline buttons no longer scale. This work replaces them with a **More (⋮)
button** that opens a **bottom-sheet overflow menu**, matching the affordance
the Lists screen already uses for per-list actions, leaving room for the future
Copy/Move actions without further changing the panel layout.

## R1. The item extra panel exposes a More button, not inline Edit/Delete buttons

When an item row is unfolded, its extra panel must no longer render the inline
**Delete** and **Edit** pill buttons. Instead it renders a single **More (⋮)
button** pinned to the **top-right** of the panel, visually consistent with the
per-list More button on the Lists screen (a muted `more-vertical` icon button).
The button carries an accessible label ("Item options") and a per-item test
hook (`data-test="item-overflow-{id}"`).

## R2. The More button opens an item overflow bottom sheet

Activating the More button opens a bottom-sheet overflow menu scoped to that
item. The sheet has a header showing the item's name and a vertical menu of
actions. For now the menu contains exactly two actions, ordered non-destructive
first, destructive last:

- **Edit** (pencil icon) — opens the existing edit flow for the item.
- **Delete** (trash icon, destructive styling) — opens the existing delete
  confirmation flow for the item.

The sheet is dismissible by backdrop tap, the Escape key, and the device/browser
back button, consistent with every other bottom sheet in the app.

## R3. Edit and Delete continue to drive the existing flows

Selecting **Edit** opens the existing add/edit item sheet pre-populated for the
item; selecting **Delete** opens the existing delete-confirmation sheet, which
on confirmation soft-deletes the item and surfaces the existing undo snackbar.
No change to the edit, delete, soft-delete, or undo behaviour itself — only the
entry point moves from inline buttons to the overflow menu. Ownership of those
sheets and the undo state remains with the Items screen.

## R4. Back-button and history behaviour stays correct

Opening the overflow sheet pushes one history entry; the back button closes the
sheet without leaving the Items screen. Selecting Edit or Delete (closing the
overflow sheet and opening the target sheet) must not strand the user or stack
extra history entries — the back button from the target sheet returns to the
screen, not to a ghost overflow sheet.

## R5. Docs reflect the new affordance

`docs/ui.md` (Items screen section) must describe the extra panel as ending in a
top-right More button that opens an overflow sheet with Edit and Delete (and,
in future, Copy/Move between lists), rather than inline Edit/Delete buttons.

## Non-requirements (explicitly excluded)

- **Copy/Move between lists** — this plan only creates the overflow container
  and relocates Edit/Delete into it; the copy/move actions are a separate future
  feature with their own data-model work.
- **Placeholder Copy/Move menu entries** — the menu ships with only Edit and
  Delete; no disabled or "coming soon" stubs, which would be dead UI.
- **Changes to the list-level overflow** — the Items screen's existing TopBar
  More button (list-level `ListOverflowSheet`) is unrelated and untouched.
- **Schema / RLS / migration changes** — this is a UI-only change.
