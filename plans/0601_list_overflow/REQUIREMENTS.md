# Requirements: List overflow menu

Sub-plan of step 6 (soft-delete UX). The DB already has soft-delete support for
items and lists; step 4 wired item soft-delete with an undo snackbar. This
sub-plan adds the list-management surface: a `⋮` overflow button on each list
row (and the existing no-op `⋮` on the Items screen) that opens a bottom sheet
with four actions — Rename, Edit description, View trash, Delete list — plus the
shared `UndoSnackbar` component that unifies item and list undo behaviour.

## R1. List overflow sheet

Each list row on the Lists screen gains a trailing `⋮` (`more-vertical`) icon
button that replaces the existing decorative `chevron-right`. Tapping it opens
`ListOverflowSheet` — a `Sheet.svelte`-based bottom sheet parameterised by the
list's `id`, `name`, `itemCount`, and `memberCount`. The same sheet is reachable
from the Items screen's existing (currently no-op) TopBar `⋮` button.

The sheet has a **header section** above the menu rows: the list name in
Newsreader serif, 18 px, weight 500, `var(--ink)`; below it a metadata line
in 12 px `var(--stone)` with `marginTop: 2px`: `"<N> items · <M> members"`.
The header is separated from the menu rows by a `1 px solid var(--rule)` border.
(`design/cairn-screens.jsx` `ListMenuScreen` lines 963–1018.)

Below the header the sheet has four rows (padding `14px 22px`, gap 14, icon
size 18, strokeWidth 1.75, label 15 px weight 500; a `1 px solid var(--rule)`
border between each row except the last):

- **Rename list** — `pencil` icon, `var(--ink)`
- **Edit description** — `feather` icon, `var(--ink)`
- **View trash** — `trash-2` icon, `var(--ink)`
- **Delete list** — `trash` icon, `var(--ember)`

The sheet follows the `pushHistoryGuard` / `popstate` back-stack pattern (open
pushes a history entry; Android back / tap-outside closes it). It accepts an
`onDelete: () => void` prop called after the sheet self-closes following a
confirmed delete (see R4 for the asymmetric callback detail).

## R2. Rename list

Tapping **Rename list** in the overflow sheet opens a `RenameListSheet` bottom
sheet with a single-line text input pre-filled with the current list name. The
TopBar right action is **Save**; the TopBar left is **×** (cancel). **Save**
sends `PATCH /lists?id=eq.<uuid>` with `{name: <new>}` and updates the row in
the Lists screen state via `refreshLists()`. The name field validates
client-side: non-empty and ≤ 200 characters (matching the DB CHECK constraint);
an inline error message appears below the input if the user tries to save an
empty name. Cancel dismisses without saving.

## R3. Edit description

Tapping **Edit description** in the overflow sheet opens an
`EditDescriptionSheet` bottom sheet with a multi-line `<textarea>` pre-filled
with the current description (empty string if `null`). **Save** sends
`PATCH /lists?id=eq.<uuid>` with `{description: trimmedValue}` — if
`value.trim() === ''`, send `null` (not `""`); otherwise send the trimmed
value. **Cancel** dismisses without saving. No client-side length validation
(the server's 2 000-character CHECK is the gate). On success calls
`refreshLists()`.

## R4. Delete list (soft-delete + undo snackbar)

Tapping **Delete list** in the overflow sheet immediately soft-deletes the list
via `PATCH /lists?id=eq.<uuid>` with `{deleted_at: <now_iso>}`, removes the row
from local Lists state, closes the sheet (one `history.back()`), and calls
`onDelete()`. On the Lists screen `onDelete` is a no-op; on the Items screen
`onDelete` calls `history.back()` a second time to pop the now-stale Items
route.

A `<UndoSnackbar>` appears at the bottom of the Lists screen for **6 seconds**.
Snackbar visual spec (from `design/cairn-screens.jsx` screen 15):
`background: var(--ink); color: var(--paper); border-radius: 12px; padding:
12px 14px; font-size: 13.5px`. Leading `trash-2` icon (16 px, `var(--paper)`).
Message text (flex: 1): _"Deleted '<list name>'"_ with the name in weight 600.
Trailing **UNDO** label: uppercase, weight 700, 12 px, `color: var(--sage)`,
`padding: 4px 8px`. The FAB is hidden while the snackbar is visible.

Tapping **UNDO** sends `PATCH /lists?id=eq.<uuid>` with `{deleted_at: null}`
and re-inserts the list row. After the snackbar auto-dismisses without undo,
the list stays soft-deleted (recoverable from trash). No confirmation dialog —
undo is the safety net.

## R5. UndoSnackbar shared component

A new `UndoSnackbar.svelte` (in `web/src/lib/shared/components/`) wraps the
existing `Snackbar.svelte` and owns the specific undo-snackbar visual: it passes
`actionLabel="UNDO"` to `Snackbar` and injects the leading `trash-2` icon via
the `leading` snippet prop added to `Snackbar` in this plan. Props: `message:
string`, `onUndo: () => void`. Owns the 6-second auto-dismiss timer. The inline
`.undo-snackbar` block currently in `ItemsScreen.svelte` is replaced by
`<UndoSnackbar>`.

`Snackbar.svelte` gains an optional `leading?: Snippet` prop rendered before the
message text. Existing callers that omit it are unaffected. The existing
`left: 16px; right: 16px` CSS in `Snackbar.svelte` is corrected to the canonical
fixed-position formula from `docs/ui.md`:
`left: max(12px, calc(50% - var(--app-max-w) / 2 + 12px))` and a matching
`right`, with `bottom: calc(env(safe-area-inset-bottom) + 18px)`.

## R6. `loadLists()` filters deleted lists

The `GET /lists` query in `lists.svelte.ts` must include `&deleted_at=is.null`.
The `lists_select` RLS policy includes `OR deleted_by = public.uid()` (needed
for the soft-delete PATCH to pass Postgres's WITH-CHECK gate), which means
`GET /lists` returns the deleter's own soft-deleted rows without this filter.
Adding the filter client-side ensures deleted lists are never shown on the Lists
screen regardless of who deleted them.

## Non-requirements (explicitly excluded)

- **Leave list** — a membership operation (`PATCH /list_members`); lands in
  steps 7–8 when the Members screen is built. The overflow sheet has no "Leave"
  row in step 6.
- **Invite a friend / Manage members** — land in steps 7–8. The sheet's four
  rows are the complete step-6 set. No placeholders or disabled rows.
- **Per-list item trash screen content** — the trash route stub created here is
  intentionally empty; 0602 fills it in.
- **Undo stacking** — the snackbar tracks only the most-recent delete. Multiple
  undo operations is a post-v1 product decision.
- **Error snackbar on restore failure** — deferred to 0602, which owns the full
  trash restore flow.
