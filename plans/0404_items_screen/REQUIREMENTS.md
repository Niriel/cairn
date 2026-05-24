# Requirements: Items screen

The Items screen is the core of Cairn's value — it shows a ranked list of items in one list, lets members vote, unfold details, add new items, edit and soft-delete existing ones. It depends on the polished Lists screen (0403) for its route entry point and uses all DB pieces already in place from step 1.

## R1. Items route and screen

A route at `/(app)/lists/[list_id]/+page.svelte` renders the `ItemsScreen` component, passing `listId={$page.params.list_id}` as a prop. The route is authenticated (the `/(app)` layout guard handles session checks). Navigating to it from the lists screen replaces the eslint-disable comment in `ListsScreen.svelte` with a proper `resolve()`-based `goto`.

## R2. Fetching items

The screen fetches live items from `GET /items_ranked?list_id=eq.<uuid>&order=score.desc,created_at.asc`. Items are sorted: highest aggregate score first, ties broken by oldest `created_at`. The query includes embedded profiles for `created_by` and `modified_by` attribution. The screen also fetches all votes for visible items to show per-member breakdowns and the current user's own vote.

## R3. Item type

A TypeScript `Item` type represents a row from `items_ranked` enriched with client-side vote data:

```typescript
export type Item = {
  id: string;
  list_id: string;
  name: string;
  notes: string | null;
  created_by: string;       // UUID
  modified_by: string;      // UUID
  created_by_name: string;  // display name from joined profile
  modified_by_name: string | null; // null when never edited
  score: number;
  created_at: string;
  modified_at: string;
  my_vote: number | null;   // null = no vote; ±1–±3 when voted
  member_votes: { user_id: string; display_name: string; value: number }[];
};
```

## R4. Items state store

A Svelte 5 `$state`-based store `items` in `item/state/items.svelte.ts` holds:
- `rows: Item[]` — the sorted items
- `loading: boolean`
- `error: string | null`
- `listId: string | null` — which list is currently loaded
- `pendingDelete: { item: Item; timerId: number } | null` — the undo window state

The store exposes: `loadItems(listId)`, `upsertVote(itemId, value)`, `deleteVote(itemId)`, `softDeleteItem(itemId)`, `undoDelete()`, `addItem(name, notes?)`, `editItem(itemId, name, notes?)`.

Optimistic vote updates apply immediately (mutate `my_vote` and `score` in the store) and roll back on API error.

## R5. VoteControl component

A `VoteControl.svelte` component renders three elements in a row: thumbs-down button, vote indicator, thumbs-up button. Each button is 36×36 px, transparent background, `inkSoft` color. The indicator is 44 px wide, uses JetBrains Mono 16 px, and shows:

| value | display |
|-------|---------|
| −3    | `---`   |
| −2    | `--`    |
| −1    | `-`     |
|  0    | `=`     |
| +1    | `+`     |
| +2    | `++`    |
| +3    | `+++`   |

Colors: sage for positive, ember for negative, stone for neutral (`=`). Disabled state (value already at ±3) renders the button at 35% opacity, `cursor: default`. Tapping a thumb fires an `onchange(newValue: number | null)` callback — `null` when the tap would take the value from ±1 to 0 (i.e., a vote deletion).

## R6. ItemRow layout

Each item renders as a flex row with `padding: 14px 18px 14px 20px; min-height: 56px`. Left side: item name (15.5 px, weight 500; 600 when panel is open) truncated with ellipsis; optionally a score badge (small monospace chip) shown only when `score !== 0`. Badge colors: text `var(--sage)` / background `var(--sage-bg)` for positive; text `var(--ember)` / background `var(--ember-bg)` for negative. Positive scores are prefixed with `+` (e.g. `+3`, `+1`); negative values use their natural minus sign (e.g. `-2`). Right side: `VoteControl`. Tapping anywhere on the row except the vote control toggles the panel open/closed. Only one panel is open at a time — opening one closes the previously open one.

## R7. ItemPanel (accordion expand)

When a row is open, the entire row container (name+vote row and panel) gets `background: var(--paper-alt)`. An `ItemPanel` renders below the name+vote row:
- Top border: `1px dashed var(--rule)`; background: `var(--paper-alt)`; padding: `4px 22px 18px`
- **Notes** — Newsreader italic 14 px `inkSoft`, only shown when `item.notes` is non-null
- **Per-member votes** — inline flex, gap 10 px; each entry: `Avatar` (size 18) + display name + vote value (JetBrains Mono, sage/ember/stone). Members with no vote are omitted.
- **Attribution** — 11.5 px stone: "Added by **Name** on 1 May 2026." + "Last edited by **Name** on 3 May 2026." if ever edited.
- **Action buttons** — `[Delete] [Edit]` (flex, gap 8 px, full-width split). Delete: ember text, border, trash icon. Edit: ink text, border, pencil icon. Per `docs/ui.md` button-pair convention: destructive (Delete) left, forward (Edit) right.

## R8. Add-item sheet

A bottom sheet (the `Sheet` primitive) opens from the FAB. Its TopBar shows: X cancel (left), "New item" (title), "in {list name}" (sub), an "Add" text-button (right). Fields: Name (required, `<input>` with focused border) and Notes (optional, `<textarea>` with Newsreader italic placeholder). An info chip below Notes reads "Added items start at = (no vote). Tap thumbs in the list to weigh in." Submitting calls `addItem`, closes the sheet, and the new item appears at its natural sorted position.

## R9. Edit-item sheet

Same sheet structure as Add. The title is "Edit item". Fields are pre-populated. Submitting calls `editItem`. Below the Notes field: "Added by **X** on date. Editing this will record you as the last editor." (11.5 px stone).

## R10. Delete confirmation sheet

A bottom sheet with handle pill. Contains: trash icon in an `emberBg` 40×40 rounded square, title "Delete '{name}'?", body "Other members will no longer see this item. You can restore it from this list's trash." when `memberCount > 1` (or "No other members can see this item. You can restore it from this list's trash." for a solo list). `ButtonPair`: Cancel (left) | Delete (right, ember background). Confirming calls `softDeleteItem`, closes the sheet, and triggers the undo snackbar.

## R11. Undo snackbar

After a soft-delete, a snackbar appears for 6 seconds at the bottom of the screen. It replaces — and hides — the FAB. It is rendered as a bespoke `<div>` (not the shared `Snackbar.svelte` primitive, which has no icon slot) with shell-aware fixed positioning per `docs/ui.md` § "App shell width": `left: max(0px, calc(50% - var(--app-max-w) / 2 + 12px)); right: max(0px, calc(50% - var(--app-max-w) / 2 + 12px)); bottom: calc(env(safe-area-inset-bottom) + 18px)`. Content: trash-2 icon, "Deleted '{name}'" (name span truncated with ellipsis — `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` — so a long item name stays single-line), "UNDO" button (sage, uppercase, weight 700). Tapping Undo calls `undoDelete()`, which clears `deleted_at` via `PATCH /items`, pops the item back into the list, and dismisses the snackbar. After 6 s the snackbar dismisses and the FAB returns. If the `undoDelete` API call fails, the snackbar changes its message to "Couldn't restore — item is in trash." and hides the UNDO button; the 4-second auto-dismiss timer fires, then the FAB returns.

## R12. Empty-list state

When `items.rows` is empty (after loading), the screen shows: an 80×80 dashed circle (80×80 per `design/cairn-screens.jsx` `EmptyListScreen`, smaller than the 96×96 general illustrated-empty-state pattern in `docs/ui.md`; `paperAlt` background, `stoneLt` dashed border) containing a feather icon (32 px, `stone`); "Nothing here yet" in Newsreader 22 px ink; "Drop the first stone — add an item with a name and (optionally) a note." in 13.5 px inkSoft; an "Add the first item" button (ink background, paper text, plus icon, borderRadius 12).

## R13. Back navigation

The TopBar renders with `showBack={true}`; its existing `history.back()` handler is the back affordance (per `docs/ui.md`: "The in-app top-bar ← also calls `history.back()` — never a hard-coded previous route"). The "more" button (right, `more-vertical` icon) is rendered as a placeholder (no sheet in this sub-plan — list management flows are out of scope).

## Non-requirements (explicitly excluded)

- **"Just you" phrasing for solo lists** — when `memberCount === 1` the TopBar sub-text uses "1 member" (the generic numeric format), not the warmer "just you" hinted at in `EmptyListScreen` JSX. Consistent numeric format across all member counts is simpler to implement and avoids a special case; cosmetic polish is deferred.
- **Trash screen** — viewing soft-deleted items (`/lists/[id]/trash`) is out of scope for this sub-plan. The undo snackbar is the only recovery surface in v1 here.
- **List overflow sheet** — the `⋮` (more-vertical) menu for rename/invite/manage-members/delete-list is out of scope.
- **Avatar photos** — Avatar renders initials only (`avatar_version = 0` path); the photo upload flow is a later plan.
- **Drag-to-reorder** — items are always sorted by score, never by drag. Reordering is not a feature.
- **Markdown in notes** — notes are rendered as plain text. No markdown parsing.
- **Real-time updates** — votes and items from other members don't push live. A pull-to-refresh or manual reload is acceptable for v1. Not implemented here.
- **Accessibility labels** — screen-reader `aria-label` strings on vote buttons are noted as a future pass in `docs/ui.md`; they are not part of this sub-plan.
- **Animate accordion / vote transitions** — deferred per `docs/ui.md`.
