# Requirements: Soft-delete UX

Step 6 of the master plan. The DB already has full soft-delete support for
items and lists (step 1); step 4 implemented item soft-delete with a 6-second
undo snackbar. This step exposes the full surface: a list overflow menu with
rename, edit description, delete + undo, and a "View trash" route to each
list's item trash; an account-level deleted-lists screen in Settings; and the
deleted-user tombstone visual in the `<Avatar>` component and item attribution.
Avatars (step 5) are now in place, so the tombstone's gray-disc treatment can
land without retrofitting.

## R1. List overflow sheet

Each list row on the Lists screen gains a trailing `⋮` (`more-vertical`) icon
button that opens a `ListOverflowSheet` — a bottom sheet parameterised by the
list's `id`, `name`, item count, and member count. The same sheet is reachable
from the Items screen's existing (currently no-op) TopBar `⋮` button.

The sheet has a **header section** above the menu rows: the list name in
Newsreader serif, 18 px, weight 500, `var(--ink)`; below it a metadata line
in 12 px `var(--stone)`: `"<item_count> items · <member_count> members"`.
The header is separated from the menu rows by a `1px solid var(--rule)` border.
(Visual reference: `design/cairn-screens.jsx` `ListMenuScreen` lines 984–990.)

Below the header the sheet has four rows:
**Rename list** (`pencil` icon), **Edit description** (`feather` icon),
**View trash** (`trash-2` icon), **Delete list** (ember, `trash` icon). The sheet follows the `pushHistoryGuard` / `popstate` back-stack
pattern (open pushes a history entry; Android back / tap-outside closes it).

## R2. Rename list

Tapping **Rename list** in the overflow sheet opens a second bottom sheet with
a text input pre-filled with the current list name. The TopBar right action is
**Save**; the TopBar left is **×** (cancel). **Save** sends
`PATCH /lists?id=eq.<uuid>` with `{name: <new>}` and updates the row in place.
The name field validates client-side: non-empty and ≤ 200 characters (matching
the DB CHECK constraint); an inline error message appears if the user tries to
save an empty name. Cancel dismisses without saving.

## R3. Edit description

Tapping **Edit description** in the overflow sheet opens a bottom sheet with a
multi-line textarea pre-filled with the current description (empty string if
none). **Save** sends `PATCH /lists?id=eq.<uuid>` with `{description:
<value_or_null>}` — if `value.trim() === ''`, send `null` (not `""`);
otherwise send the trimmed value. **Cancel** dismisses. No client-side length
validation (the server's 2 000-character CHECK is the gate).

## R4. Delete list (soft-delete + undo snackbar)

Tapping **Delete list** in the overflow sheet immediately soft-deletes the list
via `PATCH /lists?id=eq.<uuid>` with `{deleted_at: <now_iso>}`, closes the
sheet, and (if the user was on the Items screen) navigates back to the Lists
screen. A snackbar appears at the bottom of the Lists screen for **6 seconds**. Visual
spec (matching `design/cairn-screens.jsx` `ItemsScreenWithUndo`, screen 15):
`background: var(--ink); color: var(--paper); border-radius: 12px; padding:
12px 14px; font-size: 13.5px`. Leading `trash-2` icon (16 px, `var(--paper)`).
Message text (flex: 1): _"Deleted '<list name>'"_ with the name in weight 600.
Trailing **UNDO** label: uppercase, weight 700, 12 px, `color: var(--sage)`,
`padding: 4px 8px`. The snackbar is a shared `<UndoSnackbar>` component
(see Architecture in `PLAN.md`) reused by both item and list delete; 0601
extracts it from (or refactors) the step-4 item snackbar.

Tapping **UNDO** restores the list via `PATCH /lists?id=eq.<uuid>` with
`{deleted_at: null}`. After the snackbar dismisses without undo, the list stays
soft-deleted. The FAB is hidden while the snackbar is visible. No confirmation
sheet — undo is the safety net.

## R5. Per-list item trash screen

A screen at `/(app)/lists/[list_id]/trash/` shows the soft-deleted items for
one list, fetched from
`GET /items_deleted?list_id=eq.<uuid>&order=deleted_at.desc`. Each row (visual
spec: `design/cairn-screens.jsx` → `TrashScreen`, screen 14):

- Leading `rotate-ccw` icon in `var(--stone-lt)`.
- Item name in `var(--stone)` with `text-decoration: line-through;
text-decoration-color: var(--stone-lt); text-decoration-thickness: 1px`.
- Attribution: `deleted by <display_name> · <date>` in 11.5 px `var(--stone-lt)`.
  `<date>` uses `timeAgo` (relative for < 30 days, absolute `"1 May 2026"` for
  ≥ 30 days) per `docs/ui.md` → "Dates".
- Trailing **Restore** pill button (outlined, `var(--ink)` border and text).

A description line directly below the TopBar: _"Items you delete from this list
land here. Tap Restore to bring one back."_ — `font-size: 12.5px; color:
var(--stone); line-height: 1.5; padding: 14px 18px 6px`.

TopBar: title "Trash", `sub` prop = list name. Back arrow navigates back to the
Items screen. An empty state is shown when the trash is empty.

## R6. Item restore from trash

Tapping **Restore** on a trash row sends `PATCH /items?id=eq.<uuid>` with
`{deleted_at: null}`. On success the row disappears from the trash list; no
snackbar. On failure a generic error snackbar appears ("Couldn't restore — try
again").

## R7. Deleted-lists screen (account trash)

A screen at `/(app)/settings/deleted-lists/` shows all soft-deleted lists the
user is **currently** a member of (the `lists_deleted` view's `is_list_member()`
gate excludes former members who left before the list was deleted — consistent
with `items_deleted`), fetched from `GET /lists_deleted?order=deleted_at.desc`.
Each row: list name (weight 600, `var(--ink)`), attribution (`deleted by <name>
· <date>` in 12 px `var(--stone)` — `<date>` uses `timeAgo` per `docs/ui.md` →
"Dates"), trailing **Restore** pill button. TopBar:
title "Deleted lists", back arrow navigates to Settings. Empty state: "No
deleted lists." in `var(--stone)`.

## R8. List restore from account trash

Tapping **Restore** on a deleted-list row sends `PATCH /lists?id=eq.<uuid>`
with `{deleted_at: null}`. On success the row disappears from the screen; the
list reappears on the Lists screen on next load. No snackbar.

## R9. Settings Recovery section

The Settings screen gains a **Recovery** section between the Appearance section
and the Sign Out section:

- Section header "Recovery" in the same uppercase small-caps style as other
  section headers.
- Nav row: icon `trash-2`, title "Deleted lists", subtitle "Restore lists
  you've deleted", chevron; tapping navigates to `/(app)/settings/deleted-lists/`.

Visual spec: `design/cairn-screens.jsx` → `SettingsScreen` (screen 13), the V2
variant that shows the full section list.

## R10. Tombstone Avatar visual

`<Avatar>` gains a tombstone branch: when `uid ===
'00000000-0000-0000-0000-000000000000'` (the sentinel tombstone UUID), render a
plain gray disc — `background: oklch(78% 0.01 80)`, no initials text — regardless
of `displayName` or `avatarVersion`. This branch takes priority over both the
photo branch (`avatarVersion > 0`) and the initials branch. The tombstone UUID
is exported as `TOMBSTONE_UID` from
`web/src/lib/shared/model/constants.ts` and imported by `Avatar.svelte`.

## R11. Tombstone attribution styling in item panel

In the Items screen accordion, when an item's `created_by` or `modified_by`
equals `TOMBSTONE_UID`, the attributor's name renders in muted italic:
`font-style: italic; color: var(--stone-lt); font-family: var(--serif)`.
The `profiles` row for the tombstone already has `display_name = 'Deleted
user'` — the existing PostgREST join returns the right name. Only the CSS style
branches on the UID. Visual spec: `design/cairn-screens.jsx` → screen 17
(`ItemsScreenTombstone`).

## Non-requirements (explicitly excluded)

- **Leave list** — a membership operation (`PATCH /list_members`); lands in
  steps 7–8 when the Members screen is built. The overflow sheet has no
  "Leave" row in step 6.
- **Invite a friend / Manage members in overflow** — land in steps 7–8. The
  sheet's four rows are the complete step-6 set.
- **Empty trash / hard delete** — not exposed. Hard deletion is not a v1 UI
  action; see `docs/ui.md` → "Trash & undo".
- **Server-side garbage collection** — backend decision deferred post-v1; see
  `docs/architecture.md`.
- **Undo stacking** — the snackbar tracks only the single most-recent delete.
  Multiple undos is a post-v1 product decision.
- **Delete account** — a distinct step-9 scope; the design's Delete account
  screen is not part of this plan.
