# Tasks

## Reference skills and docs

- **`docs/frontend-layout.md`** — tier split rules; test filename convention (no `+` prefix).
- **`docs/testing.md`** — Vitest component test conventions.
- **`docs/ui.md`** — TopBar button ordering and `IconButton` sizing conventions.

## Phase 1 — Lists screen Refresh button

### [x] 1.1 Add Refresh button to ListsScreen and test it

**Created:** 2026-05-27T17:13:14Z
**Completed:** 2026-05-27T17:47:57Z

**Why:** Alice won't see Bob's new lists until she navigates away and back. A Refresh button lets her re-fetch explicitly (R1, R4).

**Prerequisites:** None.

**Decisions:**
- The `IconButton` mock at `web/src/lib/basic/components/__mocks__/IconButton.svelte` currently renders `<button data-test={...}>` but drops `onclick`, `disabled`, and `aria-label`. The Lists screen tests mock `IconButton`, so the mock must be updated to forward these props before click and disabled-state tests can pass. Note: the `Fab` and `MoreButton` mocks do **not** forward `disabled`; the IconButton mock needs to add it explicitly. Use this updated mock:
  ```svelte
  <script lang="ts">
    import type { Snippet } from 'svelte';
    type Props = { onclick?: () => void; 'aria-label'?: string; 'data-test'?: string; disabled?: boolean; children?: Snippet; };
    let { children, onclick, disabled, ...rest }: Props = $props();
  </script>
  <button type="button" data-test={rest['data-test']} aria-label={rest['aria-label']} {onclick} {disabled}>{@render children?.()}</button>
  ```
- The Refresh button sits before the Settings button in the `right` snippet of `AppTopBar` (TopBar is mocked in ListsScreen tests, so the `right` snippet renders through the mock's `{@render right()}`).
- `refreshLists` is already a `vi.fn()` in the lists state mock — no mock changes needed there.
- `data-test="lists-refresh"` on the button; icon `rotate-ccw` at size 20 (slightly smaller than the 22 px Settings button — intentional, keeps Refresh visually secondary); `aria-label="Refresh"`.
- Button is `disabled={lists.loading}`.

**Files:**
- `web/src/lib/basic/components/__mocks__/IconButton.svelte` (modify)
- `web/src/lib/list/components/ListsScreen.svelte` (modify)
- `web/src/lib/list/components/ListsScreen.test.ts` (modify)

**Steps:**
1. RED — In `ListsScreen.test.ts`, append a new `describe('Refresh button')` block with three tests:
   - `(refresh-a)` renders with `data-test="lists-refresh"` and `aria-label="Refresh"`.
   - `(refresh-b)` clicking it calls `refreshLists`.
   - `(refresh-c)` is disabled when `lists.loading` is true.
   Import `refreshLists` from `$lib/list/state/lists.svelte` at the top of the file (it is already exported from the mock as `vi.fn()`).
2. RED — Run `pnpm test -- ListsScreen` and confirm the three new tests fail (button not found / `onclick` not forwarded).
3. GREEN — Update `web/src/lib/basic/components/__mocks__/IconButton.svelte` to forward `onclick`, `disabled`, and `aria-label` alongside `data-test`, matching the pattern used in the `Fab` mock.
4. GREEN — In `ListsScreen.svelte`, add an `IconButton` with `aria-label="Refresh"`, `data-test="lists-refresh"`, `disabled={lists.loading}`, and `onclick={() => refreshLists()}` before the existing Settings `IconButton` inside the `{#snippet right()}` block. Icon: `<Icon name="rotate-ccw" size={20} />`.
5. GREEN — Run `pnpm test -- ListsScreen` and confirm all tests pass.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

## Phase 2 — Items screen Refresh button

### [ ] 2.1 Add Refresh button to ItemsScreen and test it

**Created:** 2026-05-27T17:13:14Z
**Completed:**

**Why:** Alice won't see Bob's new items or membership changes until she leaves and re-enters the list. A Refresh button re-fetches items and list metadata (R2, R4).

**Prerequisites:** Task 1.1 (`IconButton` mock updated, `lists-refresh` pattern established).

**Decisions:**
- `ItemsScreen` fetches two things on mount: `loadItems(listId)` (goes into the `items` store) and a `pgGet` call for list metadata (name, description, member count), stored in local `listMeta` state. Extract the `pgGet` call into a named async function `reloadMeta()` so both the `$effect` and the Refresh handler can call it.
- The Refresh handler `refreshItems()` calls `void loadItems(listId)` and `void reloadMeta()` in parallel (fire-and-forget, same pattern as mutation handlers elsewhere in the codebase).
- `IconButton` is NOT currently mocked in `ItemsScreen.test.ts` (the test uses the real `TopBar` and real `IconButton`). The real `IconButton` spreads all attributes via `{...rest}` so `onclick`, `disabled`, and `aria-label` work without any mock changes.
- `loadItems` is a `vi.fn()` in the items state mock — checking it was called verifies the refresh fired. `reloadMeta` uses `pgGet` which is intercepted by the existing `msw` handler (`http.get('*/api/lists', ...)` already set up in `beforeEach`).
- `data-test="items-refresh"` on the button; icon `rotate-ccw` at size 20 (slightly smaller than the 22 px MoreButton — intentional, keeps Refresh visually secondary); `aria-label="Refresh"`.
- Button sits before the existing `MoreButton` in the `right` snippet.
- Button is `disabled={items.loading}`.
- Import `IconButton` from `$lib/basic/components/IconButton.svelte` (not currently imported in `ItemsScreen.svelte`).

**Files:**
- `web/src/lib/item/components/ItemsScreen.svelte` (modify)
- `web/src/lib/item/components/ItemsScreen.test.ts` (modify)

**Steps:**
1. RED — In `ItemsScreen.test.ts`, append a new `describe('Refresh button')` block with three tests:
   Also add `loadItems` to the existing import on line 6: change `import { items, undoDelete } from '$lib/item/state/items.svelte'` to `import { items, loadItems, undoDelete } from '$lib/item/state/items.svelte'`.
   - `(refresh-a)` renders with `data-test="items-refresh"` and `aria-label="Refresh"`.
   - `(refresh-b)` clicking it calls `loadItems` with the `listId` prop. **Write this test as:**
     render the component, `await tick()` to let the mount `$effect` fire, then call
     `vi.mocked(loadItems).mockClear()` to reset the call history before the click. After
     clicking, assert `toHaveBeenCalledTimes(1)` and `toHaveBeenCalledWith('test-list-id')`.
     Without the `mockClear()`, the on-mount call from `$effect` satisfies
     `toHaveBeenCalledWith` trivially and the test becomes a false positive.
   - `(refresh-c)` is disabled when `items.loading` is true.
   The test renders `<ItemsScreen listId="test-list-id" />`. `loadItems` is already a `vi.fn()` from the mock.
2. RED — Run `pnpm test -- ItemsScreen` and confirm the three new tests fail (button not found).
3. GREEN — In `ItemsScreen.svelte`:
   a. Add `import IconButton from '$lib/basic/components/IconButton.svelte';` alongside the existing imports.
   b. Extract the inline `pgGet` call from `$effect` into a named async function `reloadMeta()`. Keep the `$effect` calling `reloadMeta()` so mount behaviour is unchanged. Preserve the silent-fail behaviour of the original `.catch(() => {})` — write the body as `try { const rows = await pgGet<ListMeta[]>(...); if (rows.length > 0) listMeta = rows[0]; } catch { }` so that a failed metadata fetch remains a no-op.
   c. Add `function refreshItems() { void loadItems(listId); void reloadMeta(); }`.
   d. In the `{#snippet right()}` block, add `<IconButton aria-label="Refresh" data-test="items-refresh" disabled={items.loading} onclick={refreshItems}><Icon name="rotate-ccw" size={20} /></IconButton>` before the existing `<MoreButton>`.
4. GREEN — Run `pnpm test -- ItemsScreen` and confirm all tests pass.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

## Phase 3 — Trash screen Refresh buttons

### [ ] 3.1 Add Refresh button to TrashScreen and DeletedListsScreen and test them

**Created:** 2026-05-27T17:52:00Z
**Completed:**

**Why:** Users won't see items/lists restored by others until they leave and re-enter the screen. Refresh buttons let them re-fetch explicitly.

**Prerequisites:** Task 1.1 (`IconButton` mock updated).

**Decisions:**
- `TrashScreen` uses `TopBar` directly (not `AppTopBar`); `DeletedListsScreen` uses `AppTopBar`. Both forward the `right` snippet through to the real `TopBar`, and both tests use the real `IconButton` (no mock), so `onclick`/`disabled`/`aria-label` work without any changes.
- `TrashScreen`: call `loadTrash(listId)` directly in the handler — no wrapper function needed. Button is `disabled={itemTrash.loading}`, `data-test="trash-refresh"`, `aria-label="Refresh"`, icon `rotate-ccw` size 22.
- `DeletedListsScreen`: call `loadDeletedLists()` directly. Button is `disabled={listTrash.loading}`, `data-test="deleted-lists-refresh"`, `aria-label="Refresh"`, icon `rotate-ccw` size 22.
- Both need `import IconButton from '$lib/basic/components/IconButton.svelte'` added.
- `loadTrash` and `loadDeletedLists` are already `vi.fn()` in their respective mocks — no mock changes needed.
- In `TrashScreen.test.ts`, add `loadTrash` to the existing import from `'$lib/item/state/item-trash.svelte'`. In `DeletedListsScreen.test.ts`, add `loadDeletedLists` to the existing import.
- For the `(refresh-b)` click test in each file, call `vi.mocked(loadTrash/loadDeletedLists).mockClear()` after the initial `await tick()` to discard the on-mount call before asserting the click fires it.

**Files:**
- `web/src/lib/item/components/TrashScreen.svelte` (modify)
- `web/src/lib/item/components/TrashScreen.test.ts` (modify)
- `web/src/lib/list/components/DeletedListsScreen.svelte` (modify)
- `web/src/lib/list/components/DeletedListsScreen.test.ts` (modify)

**Steps:**
1. RED — In `TrashScreen.test.ts`, add `loadTrash` to the state import and append a `describe('Refresh button')` block with three tests: `(refresh-a)` renders with `data-test="trash-refresh"` and `aria-label="Refresh"`; `(refresh-b)` clicking calls `loadTrash` with the `listId` prop (use `mockClear()` after mount tick); `(refresh-c)` is disabled when `itemTrash.loading` is true.
2. RED — In `DeletedListsScreen.test.ts`, add `loadDeletedLists` to the state import and append a `describe('Refresh button')` block with three tests: `(refresh-a)` renders with `data-test="deleted-lists-refresh"` and `aria-label="Refresh"`; `(refresh-b)` clicking calls `loadDeletedLists` (use `mockClear()` after mount tick); `(refresh-c)` is disabled when `listTrash.loading` is true.
3. RED — Run `pnpm test -- TrashScreen` and `pnpm test -- DeletedListsScreen` and confirm the new tests fail.
4. GREEN — In `TrashScreen.svelte`, add `import IconButton from '$lib/basic/components/IconButton.svelte'` and add `<IconButton aria-label="Refresh" data-test="trash-refresh" disabled={itemTrash.loading} onclick={() => void loadTrash(listId)}><Icon name="rotate-ccw" size={22} /></IconButton>` in a `{#snippet right()}` block on `<TopBar>`.
5. GREEN — In `DeletedListsScreen.svelte`, add `import IconButton from '$lib/basic/components/IconButton.svelte'` and add `<IconButton aria-label="Refresh" data-test="deleted-lists-refresh" disabled={listTrash.loading} onclick={() => void loadDeletedLists()}><Icon name="rotate-ccw" size={22} /></IconButton>` in a `{#snippet right()}` block on `<AppTopBar>`.
6. GREEN — Run `pnpm test -- TrashScreen` and `pnpm test -- DeletedListsScreen` and confirm all tests pass.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`
