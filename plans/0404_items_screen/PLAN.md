# Plan: Items screen

The Items screen is the heaviest piece of step 4 — it introduces the `VoteControl` primitive, the one-at-a-time accordion, and the add/edit/delete item flows with undo. Almost all DB pieces (items, votes, items_ranked, RLS) already exist from step 1. Phase 0 adds the one missing piece: FK constraints from `items.created_by` and `items.modified_by` to `public.profiles`, which PostgREST needs to embed display names in the `fetchItems` query (the same gap was closed for `list_members` in migration 0005).

## Context

After 0403 the lists screen is visually complete and navigates to `/lists/{id}` with an `// eslint-disable-next-line` escape (the route doesn't exist yet). This plan creates that route and everything behind it.

The `items_ranked` view (see `docs/data-model.md`) gives sorted item rows with aggregate vote data but not per-user breakdown. Votes are fetched separately via `GET /votes?item_id=in.(...)&select=item_id,user_id,value,profile:profiles!user_id(display_name)` and merged client-side into `Item` objects. The store handles this join so components only see clean `Item[]`.

The `VoteControl` UI — thumbs-down / indicator / thumbs-up — needs to be a standalone primitive usable in both the items screen and (later) anywhere votes appear. The design spec lives in `design/cairn-ui.jsx` (`VoteControl` function) and `docs/ui.md` § "The vote control".

Undo is implemented with a client-side timer: soft-delete is sent to the API immediately, the item is removed from `rows`, and a `pendingDelete` object tracks the item and `window.setTimeout` handle. Tapping Undo calls `PATCH /items` to clear `deleted_at`, re-inserts the item at its original sorted position, and cancels the timer. If the timer fires first, `pendingDelete` clears and the item stays soft-deleted.

## Decisions

**No `my_vote` column in `items_ranked`.** The view aggregates all votes into a score but doesn't expose per-user values (that would be non-deterministic for multi-member groups). My own vote is obtained from the `votes` table query, which returns only rows the authenticated user can see for their own vote, plus all member votes for items in their lists (per `votes_select` RLS). The client merges both payloads: `my_vote = votes.find(v => v.user_id === session.uid)?.value ?? null`.

**Optimistic vote updates.** Voting is the highest-frequency action; a round-trip before the indicator updates would feel sluggish. The store mutates `my_vote` and `score` immediately, fires the API call, and rolls back to the previous state on error. The optimistic update keeps the sorted order stable — re-sorting on every vote tap would cause jarring row shifts while the user is actively voting. Re-sorting only happens on full reload.

**One-at-a-time accordion via a single `openId` reactive variable.** The `ItemsScreen` holds a single `openId: string | null = $state(null)`. Each `ItemRow` receives `isOpen = (item.id === openId)` and fires `ontoggle(item.id)` when tapped. The parent sets `openId = (openId === id ? null : id)`. This is simpler than a shared set and naturally enforces one-at-a-time.

**VoteControl fires `null` for a vote-removal tap.** When the indicator is at ±1 and the user taps the opposite-direction thumb, the vote would reach 0 — which is not a valid stored value — so the component emits `onchange(null)` instead. This is an OPPOSITE-direction tap: thumbs-down at +1, or thumbs-up at −1. The component detects `Math.abs(value) === 1 && direction === -Math.sign(value)` and calls `onchange(null)`. The store dispatches `DELETE /votes?item_id=eq.<uuid>` in that case — RLS (`votes_delete: using (user_id = public.uid())`) scopes the delete to the caller's own vote; no `user_id` filter needed in the query. (Same-direction taps — thumbs-up at +1 → +2, thumbs-down at −1 → −2 — are ordinary nudges per `docs/ui.md`.)

**Item data shape: fetch + merge in store, not route `load`.** Items for a list are fetched in the `items` store (not in a SvelteKit `+page.server.ts` load), following the same pattern as `lists.svelte.ts`. This keeps the authenticated fetch path uniform (session-reactive, no SSR complexity) and makes the store testable with MSW.

**AddEditItemSheet is one component with a mode prop.** Add and Edit share the same form layout with only minor copy differences ("New item" vs "Edit item", "Add" vs "Save", presence of attribution line). A single component with `mode: 'add' | 'edit'` and an optional `item` prop avoids duplicating the form. The Sheet wraps both.

**Route stub created first** (Task 1.1) to unblock `svelte-check`. `ListsScreen.svelte` already has `goto('/lists/' + item.id)` with a disable comment. Once the stub route exists, that comment is replaced with `goto(resolve('/lists/' + item.id))`. See `docs/quality.md` "Navigating to a not-yet-created SvelteKit route" for the escape pattern.

## Architecture

### New files

- **`web/src/routes/(app)/lists/[list_id]/+page.svelte`** — thin wrapper; imports and renders `ItemsScreen`, passing `listId={$page.params.list_id}` as a prop so the component stays testable without mocking `$app/state`.
- **`web/src/routes/(app)/lists/[list_id]/page.test.ts`** — route-level Vitest test (renders page, checks ItemsScreen is mounted).
- **`web/src/lib/item/model/item.ts`** — `Item` type, `ItemRanked` wire type, `Vote` wire type; `fetchItems(listId)`, `addItem(listId, name, notes?)`, `editItem(itemId, name, notes)`, `softDeleteItem(itemId)`, `restoreItem(itemId)`, `upsertVote(itemId, value)`, `deleteVote(itemId)`.
- **`web/src/lib/item/model/item.test.ts`** — unit tests for model functions (MSW-mocked).
- **`web/src/lib/item/state/items.svelte.ts`** — reactive store: `items.rows`, `items.loading`, `items.error`, `items.listId`, `items.pendingDelete`; exported functions per R4.
- **`web/src/lib/item/state/items.test.ts`** — store tests (MSW-mocked).
- **`web/src/lib/item/state/__mocks__/items.svelte.ts`** — vi.mock stub.
- **`web/src/lib/item/components/VoteControl.svelte`** — standalone vote widget per R5.
- **`web/src/lib/item/components/VoteControl.test.ts`** — VoteControl Vitest tests.
- **`web/src/lib/item/components/__mocks__/VoteControl.svelte`** — simple mock for tests that render ItemRow.
- **`web/src/lib/item/components/ItemsScreen.svelte`** — full items screen: TopBar, sorted item rows, empty state, FAB, snackbar.
- **`web/src/lib/item/components/ItemsScreen.test.ts`** — renders screen; asserts empty state, item rows, snackbar appearance.
- **`web/src/lib/item/components/__mocks__/ItemsScreen.svelte`** — vi.mock stub for route test.
- **`web/src/lib/item/components/AddEditItemSheet.svelte`** — Sheet with form for add/edit per R8–R9.
- **`web/src/lib/item/components/AddEditItemSheet.test.ts`** — form submission, cancel, validation.
- **`web/src/lib/item/components/DeleteItemSheet.svelte`** — confirmation sheet per R10.
- **`web/src/lib/item/components/DeleteItemSheet.test.ts`** — cancel stays, confirm calls handler.

### Modified files

- **`web/src/lib/test/handlers.ts`** — add MSW handlers for `GET /items_ranked`, `GET /votes`, `POST /items`, `PATCH /items`, `POST /votes`, `DELETE /votes`.
- **`web/src/lib/list/components/ListsScreen.svelte`** — replace eslint-disable `goto('/lists/' + id)` with `goto(resolve('/lists/' + id))` once the route exists (Task 1.1).

### Module graph

```
+page.svelte
  └── ItemsScreen.svelte
        ├── items store (items.svelte.ts)
        │     └── item model (item.ts)
        │           └── postgrest (shared)
        ├── VoteControl.svelte
        ├── AddEditItemSheet.svelte
        │     └── Sheet (basic)
        └── DeleteItemSheet.svelte
              └── Sheet (basic)
              └── ButtonPair (shared)
```

## Phase structure

0. **Phase 0 — Doc reconciliation + DB migration.** Updates `docs/data-model.md` to correct the `restoreItem` PATCH payload example (remove the redundant `deleted_by: null` — the trigger handles it). Then adds FK constraints from `items.created_by` and `items.modified_by` to `public.profiles(id)`, and from `votes.user_id` to `public.profiles(id)`, mirroring the `list_members → profiles` FK from migration 0005. This unlocks PostgREST embedded profile joins in both `fetchItems` (profile attribution on items) and the votes fetch (per-member vote display in ItemPanel).

1. **Phase 1 — Route stub + model layer.** Creates the `[list_id]` route stub (unblocks `svelte-check`), updates `ListsScreen.svelte` to use `resolve()`, writes the `item.ts` model with types and API functions, MSW handlers, and the items state store (`items.svelte.ts`). No UI yet — just the data shape, HTTP layer, and reactive store.

2. **Phase 2 — VoteControl component.** Standalone primitive: indicator rendering for all 7 states, button disabled states, `onchange(null)` on vote-removal tap. Tested with Vitest.

3. **Phase 3 — ItemsScreen + accordion + sheets.** Full screen with TopBar, item rows, one-at-a-time accordion (ItemPanel), empty state, FAB, AddEditItemSheet, DeleteItemSheet, undo snackbar. All wired to the `items` store.

4. **Phase 4 — Playwright E2E.** Touch covering: sign-in → tap a list → see items → vote → tap to expand → edit → delete → undo. Also empty-state and back-navigation checks.

## Reference docs and skills

- **`docs/data-model.md`** — `items_ranked` view shape, `votes` table, RLS policies.
- **`docs/ui.md`** — vote control spec, accordion one-at-a-time, undo snackbar, button-pair order, empty states.
- **`design/cairn-screens.jsx`** — `ItemsScreen`, `ItemRow`, `ItemPanel`, `AddItemScreen`, `EditItemScreen`, `DeleteItemScreen`, `ItemsScreenWithUndo` functions for pixel-level spec.
- **`design/cairn-ui.jsx`** — `VoteControl`, `VoteIndicator` for the vote widget design.
- **`docs/testing.md`** — Vitest + MSW patterns, Playwright conventions.
- **`docs/quality.md`** — "Navigating to a not-yet-created SvelteKit route" for the route-stub escape pattern.
- **`docs/frontend-layout.md`** — lib tier split, mock placement, route test filename rules.
