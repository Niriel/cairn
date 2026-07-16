# Tasks

## Reference skills and docs

- **`docs/ui.md`** → "Trash & undo" and "Fixed-element positioning" — snackbar behaviour and the canonical CSS formula for fixed elements.
- **`docs/frontend-layout.md`** → "Filename conventions" — route-level test files drop the `+` prefix.
- **`docs/quality.md`** → "Navigating to a not-yet-created SvelteKit route" — why the trash stub must exist before any `goto` references it.
- **`design/cairn-screens.jsx`** screen 11 (`ListMenuScreen`, line 963) and screen 15 (`ItemsScreenWithUndo`, line 1315) — visual spec for the sheet and snackbar.

---

## Phase 0 — Basic components

### [x] 0.1 Create `IconButton` and `MoreButton` basic components

**Created:** 2026-05-26T00:00:00Z
**Completed:** 2026-05-26T20:18:12Z

**Why:** Several files in this plan need small icon buttons (Settings gear, list-row overflow trigger, TopBar more-options). Each file currently inlines its own `<button class="icon-btn">` element with duplicate CSS, causing style drift. `IconButton.svelte` centralises that style once; `MoreButton.svelte` removes the boilerplate of composing an `IconButton` with a `more-vertical` icon everywhere a three-dot trigger appears.

**Prerequisites:** None. Branch `0601_list_overflow` is checked out.

**Decisions:**

- `IconButton.svelte` renders a `<button>` with class `icon-btn`. Style: `background: none; border: none; padding: 4px; color: inherit; cursor: pointer; display: flex; align-items: center; justify-content: center;`. Forwards all HTML button attributes via rest-props (onclick, aria-label, data-test, style, etc.). `color: inherit` means callers control colour via context or a `style` attribute; no per-component colour is baked in.
- `MoreButton.svelte` accepts `size?: number` (default 22) plus any HTML button attributes via rest-props. Renders `<IconButton {...rest}><Icon name="more-vertical" {size} /></IconButton>`. Lives in `basic/` alongside `IconButton` — no Cairn-specific knowledge.
- `__mocks__/IconButton.svelte`: `let { children, ...rest } = $props();` → `<button data-test={rest['data-test']}>{@render children?.()}</button>`.
- `__mocks__/MoreButton.svelte`: `let { 'aria-label': ariaLabel, ...rest } = $props();` → `<button data-test={rest['data-test']} aria-label={ariaLabel}>MoreButton</button>`.

**Files:**

- `web/src/lib/basic/components/IconButton.svelte` (create)
- `web/src/lib/basic/components/IconButton.test.ts` (create)
- `web/src/lib/basic/components/__mocks__/IconButton.svelte` (create)
- `web/src/lib/basic/components/MoreButton.svelte` (create)
- `web/src/lib/basic/components/MoreButton.test.ts` (create)
- `web/src/lib/basic/components/__mocks__/MoreButton.svelte` (create)

**Steps:**

1. RED — Create `IconButton.test.ts` with tests:
   (a) renders children inside a `<button>` element;
   (b) forwards `data-test` attribute to the button;
   (c) calls `onclick` callback when clicked.
   Create `MoreButton.test.ts` with tests:
   (a) renders a `more-vertical` icon (the Icon mock renders its `name` prop as `data-test` — assert `queryByDataTest('more-vertical')` is present);
   (b) forwards `aria-label` to the button;
   (c) fires `onclick` when clicked.
   Run `cd web && pnpm test -- --reporter=verbose IconButton MoreButton` — must fail (files don't exist).
2. GREEN — Create `IconButton.svelte`, `MoreButton.svelte`, and their mocks per Decisions.
3. Run `cd web && pnpm lint && pnpm check && pnpm test` — must be green.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

**Notes:** `MoreButton` moved to `web/src/lib/shared/components/` (not `basic/`) per user direction — it uses Cairn-specific icon names (`more-vertical`) and belongs in `shared/`. Its test mocks `$lib/basic/components/Icon.svelte` so the `data-test="more-vertical"` assertion works via the Icon mock. All later tasks that reference `MoreButton` should import from `$lib/shared/components/MoreButton.svelte`.

---

## Phase 1 — Foundations

### [x] 1.1 Create trash route stub and fix `Snackbar.svelte`

**Created:** 2026-05-26T18:28:54Z
**Completed:** 2026-05-26T20:36:55Z

**Why:** Two toolchain prerequisites must land before later tasks can type-check:
(a) `/(app)/lists/[list_id]/trash/+page.svelte` must exist before
`ListOverflowSheet` calls `goto(resolve('/lists/<id>/trash'))`, because
SvelteKit's `resolve()` rejects unknown route IDs; (b) `Snackbar.svelte` must
gain its `leading?: Snippet` prop and correct CSS before `UndoSnackbar` can wrap
it. Both are small, safe changes with no logic to test in isolation.

**Prerequisites:** None. Branch `0601_list_overflow` is checked out.

**Decisions:**

- Stub `+page.svelte` contains only a `<script lang="ts">` block with
  `export const prerender = false;` (or simply a minimal placeholder) — no real
  content. 0602 will fill it in. No test file for the stub; there is nothing to
  test yet.
- `Snackbar.svelte` gains `leading?: Snippet` rendered as `{@render leading?.()}`
  immediately before the `<span class="message">` element. Existing callers that
  pass no `leading` are unaffected.
- Fix `Snackbar.svelte` `div` CSS: replace `left: 16px; right: 16px` with
  `left: max(12px, calc(50% - var(--app-max-w) / 2 + 12px))` and
  `right: max(12px, calc(50% - var(--app-max-w) / 2 + 12px))`.
  Add `bottom: calc(env(safe-area-inset-bottom) + 18px)` (replacing the
  existing `bottom: var(--snackbar-bottom)` custom property). Note:
  `--snackbar-bottom` is also declared in
  `web/src/lib/shared/styles/tokens.css:17` — remove it there too (step 5).
- `Snackbar.test.ts` does not assert computed positions; no changes needed.
- The `__mocks__/Snackbar.svelte` mock does not render the `leading` slot; no
  changes needed unless the mock is found to import from `Snackbar.svelte`.

**Reference:** `docs/ui.md` → "Fixed-element positioning" for the CSS formula.
`docs/quality.md` → "Navigating to a not-yet-created SvelteKit route" for the
stub shape.

**Files:**

- `web/src/routes/(app)/lists/[list_id]/trash/+page.svelte` (create)
- `web/src/lib/shared/components/Snackbar.svelte` (modify)
- `web/src/lib/shared/styles/tokens.css` (modify)

**Steps:**

1. Create `web/src/routes/(app)/lists/[list_id]/trash/+page.svelte` as a minimal
   stub: a `<script lang="ts"></script>` block and a single `<div>Trash</div>`
   placeholder. No imports, no logic, no test file.
2. In `web/src/lib/shared/components/Snackbar.svelte`, add two optional props to the `$props()` destructure and type annotation:
   - `leading?: Snippet` — for a leading icon (used by `UndoSnackbar`).
   - `children?: Snippet` — for rich message content (used by `UndoSnackbar` to bold the item name); when absent, fall back to `<span class="message">{message}</span>`.
     Make `message: string` optional (`message?: string`) so callers that pass `children` instead can omit it. Existing callers (`LoginRequest`, profile page) pass `message` only and are unaffected.
3. In the template, apply the snippets in order: `{@render leading?.()}`, then `{#if children}{@render children()}{:else}<span class="message">{message}</span>{/if}`, then the action button.
4. In the `<style>` block, make these CSS changes:
   - Replace `left: 16px; right: 16px;` with the canonical formula from `docs/ui.md`:
     `left: max(12px, calc(50% - var(--app-max-w) / 2 + 12px))` and a matching `right`.
   - Replace `bottom: var(--snackbar-bottom)` with
     `bottom: calc(env(safe-area-inset-bottom) + 18px)`.
   - Add `gap: 10px` to the `div` rule so there is spacing between the `leading`
     snippet and the message text (the design uses `gap: 12`; 10 px also improves
     the existing message-to-action spacing on `LoginRequest` snackbars).
     Do NOT change `padding`, `border-radius`, or `box-shadow` — those are
     undo-snackbar-specific values that will be applied in `UndoSnackbar.svelte`'s
     scoped style block (task 1.2), keeping `LoginRequest` and profile page
     snackbars visually unchanged.
5. In `web/src/lib/shared/styles/tokens.css`, remove the `--snackbar-bottom` declaration (it is now hardcoded in `Snackbar.svelte`).
6. Run `pnpm lint && pnpm check` in `web/` — must be green.

**Verify:** `cd web && pnpm lint && pnpm check`

### [x] 1.2 Create `UndoSnackbar.svelte` and replace inline snackbar in `ItemsScreen`

**Created:** 2026-05-26T18:28:54Z
**Completed:** 2026-05-26T20:55:32Z

**Why:** The inline `.undo-snackbar` block in `ItemsScreen.svelte` has several
deviations from the R4/R5 spec (wrong padding, font-weight, UNDO sizing).
Extracting it into `UndoSnackbar.svelte` fixes both item-delete and list-delete
callsites in one shot. The test for `UndoSnackbar` lives in a new file separate
from `Snackbar.test.ts`.

**Prerequisites:** Task 1.1 (`Snackbar.svelte` has the `leading` prop).

**Decisions:**

- `UndoSnackbar.svelte` props: `message: string`, `onUndo: () => void`,
  `ondismiss: () => void`. The caller provides `ondismiss` to be notified when
  the snackbar self-dismisses (after the 6 s timer); it is passed to `Snackbar`
  as `onclose`. It passes `open={true}` to `Snackbar`, `actionLabel="UNDO"`, `onaction={onUndo}`,
  and `onclose={ondismiss}`. `Snackbar`'s internal `$effect` timer is the dismiss
  path: after 6 s it fires `onclose`, which here is `ondismiss`. The state layer
  (`deleteList` / `softDeleteItem`) also sets a 6-second timer that clears
  `pendingDelete` directly — this is a belt-and-suspenders fallback for the case
  where the component unmounts before the timer completes. Both timers fire at ~6 s
  and are safe to coexist; the first one to fire clears `pendingDelete` and the
  second is a no-op.
- The `leading` snippet passed to `Snackbar` renders
  `<Icon name="trash-2" size={16} />` — no extra colour override needed because
  `Snackbar`'s `color: var(--paper)` cascades to the icon.
- Visual spec (R4 / design screen 15):
  - `border-radius: 12px; padding: 12px 14px;` are undo-snackbar-specific values.
    Task 1.1 explicitly does **not** change `padding` or `border-radius` in
    `Snackbar.svelte` (to preserve `LoginRequest` and profile page snackbars).
    These values are applied via the scoped `:global(div)` override below.
  - Message item name: `font-weight: 600` (not 500).
  - UNDO label: `font-size: 12px; padding: 4px 8px; font-weight: 700;
letter-spacing: 0.04em; text-transform: uppercase; color: var(--sage)`.
    Override `Snackbar`'s `.action` style from inside `UndoSnackbar`'s own
    `<style>` block using a **scoped** `:global()` selector:
    `.undo-snackbar-root :global(.action) { … }` where `.undo-snackbar-root`
    is a wrapper element rendered by `UndoSnackbar`. Do NOT use a bare
    `:global(.action)` — that would leak to all Snackbar instances in the
    document.
- **`UndoSnackbar` props:** `deletedName: string`, `onUndo: () => void`,
  `ondismiss: () => void`. (Not `message: string` — a plain string cannot render
  the name in bold; `deletedName` lets `UndoSnackbar` construct the formatted
  children snippet itself.) It passes `open={true}` to `Snackbar`, `actionLabel="UNDO"`,
  `onaction={onUndo}`, and `onclose={ondismiss}`. It passes two snippets:
  - `leading`: renders `<Icon name="trash-2" size={16} />`.
  - `children`: renders `Deleted <strong style="font-weight:600">{deletedName}</strong>`.
    (Using inline `style` rather than a class keeps the bold within the `children`
    snippet's own scope without requiring a `<style>` block in the snippet.)
- Visual overrides (R4 / design screen 15) that are undo-snackbar-specific go in
  `UndoSnackbar.svelte`'s own `<style>` block via a scoped `:global()` so they
  do NOT affect `LoginRequest` or profile page snackbars:
  ```css
  .undo-snackbar-root :global(div) {
  	padding: 12px 14px;
  	border-radius: 12px;
  	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  }
  .undo-snackbar-root :global(.action) {
  	font-size: 12px;
  	padding: 4px 8px;
  	font-weight: 700;
  	letter-spacing: 0.04em;
  	text-transform: uppercase;
  	color: var(--sage);
  }
  ```
  Wrap `<Snackbar>` in `<div class="undo-snackbar-root">` in `UndoSnackbar`'s template.
- `__mocks__/UndoSnackbar.svelte`:
  ```svelte
  <script lang="ts">
    let { deletedName, onUndo, ondismiss, ...rest } = $props();
  </script>
  <div data-test={rest['data-test']}>UndoSnackbar: {deletedName}</div>
  ```
  No timer logic in the mock.
- Replacing the inline block in `ItemsScreen.svelte`:
  - Add `import UndoSnackbar from '$lib/shared/components/UndoSnackbar.svelte';`
  - Replace the `{#if items.pendingDelete}` block with:
    ```svelte
    {#if items.pendingDelete}
      {#if items.error}
        <div class="undo-snackbar" data-test="undo-snackbar">
          <Icon name="trash-2" size={16} />
          <span class="snackbar-text">Couldn't restore — item is in trash.</span>
        </div>
      {:else}
        <UndoSnackbar
          deletedName={items.pendingDelete.item.name}
          onUndo={() => void undoDelete()}
          ondismiss={() => { items.pendingDelete = null; }}
          data-test="undo-snackbar"
        />
      {/if}
    {/if}
    ```
  - Remove `.snackbar-item-name` and `.undo-btn` CSS blocks (no longer used).
    **Keep** `.undo-snackbar` and `.snackbar-text` — they style the error-state `<div>` above. The `.undo-snackbar` padding and border-radius no longer need updating here because `UndoSnackbar` applies its own scoped overrides; keep the error div's existing CSS.
- Updating `ItemsScreen.test.ts`: add `vi.mock('$lib/shared/components/UndoSnackbar.svelte')` near the top. Update tests (i-a), (i-b), (i-d) to query `data-test="undo-snackbar"` on the mock `<div>` — `textContent` will read `"UndoSnackbar: First item"` so `toContain('First item')` still passes. Remove test (i-c) (it asserts `data-test="undo-btn"` which no longer exists); replace it with a new test verifying `onUndo` prop is wired — click the mock's wrapper or check the prop is passed. Test (i-e) (the error-state message) is unchanged and should continue to pass because the error branch is kept inline.

**Files:**

- `web/src/lib/shared/components/UndoSnackbar.svelte` (create)
- `web/src/lib/shared/components/UndoSnackbar.test.ts` (create)
- `web/src/lib/shared/components/__mocks__/UndoSnackbar.svelte` (create)
- `web/src/lib/item/components/ItemsScreen.svelte` (modify)
- `web/src/lib/item/components/ItemsScreen.test.ts` (modify — update mock import if needed)

**Steps:**

1. RED — Create `UndoSnackbar.test.ts` with tests:
   (a) renders `data-test` attribute from parent;
   (b) calls `onUndo` when UNDO button is clicked;
   (c) calls `ondismiss` after 6 000 ms — using `vi.useFakeTimers()` and
   `vi.advanceTimersByTime(6000)`. Do NOT call `vi.mock` on `Snackbar.svelte`
   for this test file; use the real `Snackbar` so that the timer wiring can
   be exercised with fake timers (the same technique `Snackbar.test.ts` uses).
   Run `cd web && pnpm test -- --reporter=verbose UndoSnackbar` — must fail
   (file doesn't exist).
2. GREEN — Create `UndoSnackbar.svelte` per Decisions. Create
   `__mocks__/UndoSnackbar.svelte`. Run tests — must be green.
3. In `ItemsScreen.svelte`, restructure the `{#if items.pendingDelete}` block per Decisions: add the `{#if items.error}` / `{:else}` split. Remove `.snackbar-item-name` and `.undo-btn` CSS. Leave `.undo-snackbar` and `.snackbar-text` intact — they style the error-state div and their existing values are correct.
4. Run `cd web && pnpm lint && pnpm check && pnpm test` — must be green.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

### [x] 1.3 Add `&deleted_at=is.null` filter to `loadLists()`

**Created:** 2026-05-26T18:28:54Z
**Completed:** 2026-05-26T21:05:18Z

**Why:** The `lists_select` RLS policy allows the deleter to read their own
soft-deleted rows (needed so the soft-delete PATCH passes Postgres's WITH-CHECK
gate). Without a client-side `deleted_at=is.null` filter, a freshly deleted
list reappears on the Lists screen after the next `refreshLists()` call. This is
a one-line fix in `lists.svelte.ts`, best landed here before the delete flow is
wired in Phase 2.

**Prerequisites:** None (independent of other Phase 1 tasks).

**Decisions:**

- Append `&deleted_at=is.null` to the existing query string in `lists.svelte.ts`
  before the `&order=` clause.
- Add a test assertion that the URL passed to `pgGet` contains `deleted_at=is.null`
  (see step 2). This is a correctness fix for R6; an untested URL change is an
  unverified claim.

**Files:**

- `web/src/lib/list/state/lists.svelte.ts` (modify)
- `web/src/lib/list/state/lists.test.ts` (modify)

**Steps:**

1. In `lists.svelte.ts`, find the `pgGet<List[]>(...)` call and append
   `&deleted_at=is.null` to the query string, immediately before `&order=`.
   Add a short inline comment explaining that `lists_select` allows the deleter
   to see their own deleted rows, so the client must filter them out.
2. In `lists.test.ts`, add a test assertion to the signed-in fetch test (or
   the `refreshLists` test) that verifies the URL string passed to `pgGet`
   contains `deleted_at=is.null`. Check how `pgGet` is mocked in the existing
   tests (`vi.fn`) and use `expect(pgGet).toHaveBeenCalledWith(expect.stringContaining('deleted_at=is.null'))`.
3. Run `cd web && pnpm lint && pnpm check && pnpm test` — must be green.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

---

## Phase 2 — List delete state

### [x] 2.1 Add `deleteList` and `undoDeleteList` to `lists.svelte.ts`

**Created:** 2026-05-26T18:28:54Z
**Completed:** 2026-05-26T21:17:10Z

**Why:** The undo snackbar on the Lists screen requires the same
optimistic-remove / restore state pattern that `items.svelte.ts` uses for item
delete. This task implements that pattern in isolation, with full Vitest
coverage, before any UI wiring touches it.

**Prerequisites:** Task 1.3 (`&deleted_at=is.null` filter is in place).

**Decisions:**

- Add `pendingDelete: { list: List; timerId: ReturnType<typeof setTimeout> } | null`
  to the `lists` state object. Mirrors `items.pendingDelete`.
- `deleteList(listId: string)`:
  1. If `pendingDelete` exists, clear its timer and let the old delete stand.
  2. Find the list in `lists.items` by id, capture it, remove it from the
     array (optimistic).
  3. Set a 6-second timer; when it fires, set `pendingDelete = null`.
  4. Set `pendingDelete = { list, timerId }`.
  5. Send `PATCH /lists?id=eq.<uuid>` with `{deleted_at: new Date().toISOString()}`.
     On error: clear the timer, restore the list into `lists.items`, and set
     `pendingDelete = null`.
- `undoDeleteList()`:
  1. If no `pendingDelete`, return.
  2. Capture `{ list, timerId }`, clear the timer.
  3. Send `PATCH /lists?id=eq.<uuid>` with `{deleted_at: null}`.
     On success: restore the list into `lists.items` (push to front, then
     re-sort by `modified_at` desc to match the server order); set
     `pendingDelete = null`.
     On error: set `lists.error`; set a 4-second fallback timer; keep
     `pendingDelete` alive so the snackbar stays up briefly. (Mirrors the
     error branch in `undoDelete()` in `items.svelte.ts`.)
- The `List` type imported from `$lib/list/model/list` is already the correct
  shape (it has `id`, `name`, `modified_at`, etc.).
- `lists.test.ts` mocks `pgPatch` from `$lib/shared/http/postgrest` (check how
  `items.test.ts` mocks its HTTP calls and follow the same pattern).

**Reference:** `web/src/lib/item/state/items.svelte.ts` and
`web/src/lib/item/state/items.test.ts` — the pattern to mirror.

**Files:**

- `web/src/lib/list/state/lists.svelte.ts` (modify)
- `web/src/lib/list/state/lists.test.ts` (modify)
- `web/src/lib/list/state/__mocks__/lists.svelte.ts` (modify)

**Steps:**

1. RED — In `lists.test.ts`, add a `describe('deleteList')` block with tests:
   (a) optimistically removes the list from `lists.items`;
   (b) sends `PATCH /lists?id=eq.<uuid>` with `{deleted_at: <iso>}`;
   (c) sets `pendingDelete`;
   (d) on API error, restores the list and clears `pendingDelete`.
   Add a `describe('undoDeleteList')` block with tests:
   (a) clears the timer and sends `PATCH /lists?id=eq.<uuid>` with `{deleted_at: null}`;
   (b) on success, restores the list into `lists.items` and clears `pendingDelete`;
   (c) on error, keeps `pendingDelete` alive and sets `lists.error`.
   Run `cd web && pnpm test -- --reporter=verbose lists.svelte` — must fail.
2. GREEN — In `lists.svelte.ts`, add `pendingDelete` to the state object, and
   implement `deleteList` and `undoDeleteList` per Decisions. Export both
   functions.
3. Update `web/src/lib/list/state/__mocks__/lists.svelte.ts`: add
   `deleteList = vi.fn<() => Promise<void>>()` and
   `undoDeleteList = vi.fn<() => Promise<void>>()` exports, and add
   `pendingDelete: null as { list: List; timerId: ReturnType<typeof setTimeout> } | null`
   to the mocked `lists` state object. Tasks 3.1 and 4.1 will rely on this mock;
   without it, `vi.mock('$lib/list/state/lists.svelte')` returns a module that
   lacks these exports and the tests fail to compile.
4. Run `cd web && pnpm lint && pnpm check && pnpm test` — must be green.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

---

## Phase 3 — Overflow sheets

### [x] 3.1 Create `ListOverflowSheet`, `RenameListSheet`, and `EditDescriptionSheet`

**Created:** 2026-05-26T18:28:54Z
**Completed:** 2026-05-26T21:33:41Z

**Why:** The three bottom sheets implement the core of R1–R3. They must land
before the wiring phase so `ListsScreen` and `ItemsScreen` can import them.

**Prerequisites:** Task 1.1 (trash stub exists — `ListOverflowSheet` navigates
to it). Task 2.1 (`deleteList` is exported from `lists.svelte.ts` —
`ListOverflowSheet` calls it).

**Decisions:**

- All three sheets use `Sheet.svelte` as the container (the existing shared
  primitive in `web/src/lib/basic/components/Sheet.svelte`). Follow the same
  pattern as `DeleteItemSheet.svelte`: pass `open={true}` to `Sheet` always, and
  let `Sheet`'s own `$effect` manage the `pushHistoryGuard` call. Do NOT add a
  separate `pushHistoryGuard` call inside `ListOverflowSheet` — `Sheet.svelte`
  already pushes a history entry when `open=true`; a second call would push two
  entries and require two back presses to close. The caller controls visibility
  via `{#if overflowList}` (mount/unmount), which triggers `Sheet`'s cleanup.
- **`ListOverflowSheet` props:**
  `listId: string`, `listName: string`, `description: string | null`,
  `itemCount: number`, `memberCount: number`,
  `onDelete: () => void`, `onviewtrash: () => void`, `onclose: () => void`. No
  `open` prop — the caller controls mount/unmount via `{#if overflowList}`. Pass
  `open={true}` to `Sheet` and wire Sheet's `onclose` to call `props.onclose()`.
  The parent sets its mount gate to `null`/`false` in its `onclose` handler;
  without this, Android back / tap-outside will not visually close the sheet.
- **Design JSX row count note:** `design/cairn-screens.jsx` `ListMenuScreen` (line 991) shows 7 rows including Invite a friend, Manage members, and Leave this list. Implement **only the 4 rows listed here** — the others are non-requirements for step 6, explicitly excluded in REQUIREMENTS.md. Do not add placeholders or disabled rows.
- **Sheet visual spec** (from `design/cairn-screens.jsx` `ListMenuScreen`):
  - Handle: `width: 36px; height: 4px; border-radius: 99px; background: var(--stone-lt); margin: 0 auto 14px`.
  - Header: `padding: 0 22px 14px; border-bottom: 1px solid var(--rule)`.
    - Name: `font-family: 'Newsreader Variable', Georgia, serif; font-size: 18px; font-weight: 500; color: var(--ink)`.
    - Meta: `font-size: 12px; color: var(--stone); margin-top: 2px`.
  - Rows: `display: flex; align-items: center; gap: 14px; padding: 14px 22px`.
    `border-bottom: 1px solid var(--rule)` between rows (not the last).
    Icon: `size={18}`, `strokeWidth={1.75}`. Label: `font-size: 15px; font-weight: 500`.
    Delete row: `color: var(--ember)`.
- **Delete action in `ListOverflowSheet`:** calls `deleteList(listId)` (imported
  from `lists.svelte.ts`), then `history.back()` (closes the sheet), then
  `onDelete()`.
- **View trash navigation:** The "View trash" row calls `onviewtrash()` — it does
  NOT call `goto` directly. If `goto` were called while the sheet is mounted,
  `Sheet.svelte`'s `$effect` cleanup (run when the old route's components are
  destroyed after navigation) would call `history.back()`, which SvelteKit's
  router interprets as a backward pop — immediately undoing the forward navigation
  to the trash route. Delegating to the caller (via `onviewtrash`) lets the
  caller close the sheet first, wait for the guard's `history.back()` popstate to
  fire, and only then call `goto`. See task 4.1 Decisions for the wiring.
- **`RenameListSheet` props:** `listId: string`, `currentName: string`,
  `onclose: () => void`. Sends `PATCH /lists?id=eq.<listId>` with
  `{name: trimmed}`. On success, calls `refreshLists()` then `onclose()`.
  Inline error below the input when the user tries to save an empty name.
  Max-length check: if length > 200, shows error "Name must be 200 characters or
  fewer."
- **`EditDescriptionSheet` props:** `listId: string`,
  `currentDescription: string | null`, `onclose: () => void`. Sends
  `PATCH /lists?id=eq.<listId>` with `{description: null}` if trimmed empty, or
  `{description: trimmed}` otherwise. On success, calls `refreshLists()` then
  `onclose()`.
- Mock files render a minimal `<div data-test="...">ComponentName</div>`.

**Reference:** `web/src/lib/basic/components/Sheet.svelte` — how existing sheets
use `pushHistoryGuard`. `web/src/lib/list/components/CreateListSheet.svelte` —
existing list sheet for style reference.

**Files:**

- `web/src/lib/list/components/ListOverflowSheet.svelte` (create)
- `web/src/lib/list/components/ListOverflowSheet.test.ts` (create)
- `web/src/lib/list/components/__mocks__/ListOverflowSheet.svelte` (create)
- `web/src/lib/list/components/RenameListSheet.svelte` (create)
- `web/src/lib/list/components/RenameListSheet.test.ts` (create)
- `web/src/lib/list/components/__mocks__/RenameListSheet.svelte` (create)
- `web/src/lib/list/components/EditDescriptionSheet.svelte` (create)
- `web/src/lib/list/components/EditDescriptionSheet.test.ts` (create)
- `web/src/lib/list/components/__mocks__/EditDescriptionSheet.svelte` (create)

**Steps:**

1. RED — Create `ListOverflowSheet.test.ts`. Add
   `vi.mock('$lib/list/components/RenameListSheet.svelte')` and
   `vi.mock('$lib/list/components/EditDescriptionSheet.svelte')` at the top so
   sub-sheet opening can be asserted.
   Tests:
   (a) renders list name and meta in header;
   (b) shows four rows: Rename list, Edit description, View trash, Delete list;
   (c) tapping "View trash" calls `onviewtrash`;
   (d) tapping "Delete list" calls `deleteList` and then `onDelete`;
   (e) tapping "Rename list" renders `RenameListSheet` (mocked);
   (f) tapping "Edit description" renders `EditDescriptionSheet` (mocked);
   (g) mock `Sheet.svelte` and verify that calling the `onclose` prop it receives
   invokes `ListOverflowSheet`'s own `onclose` prop.
   Create `RenameListSheet.test.ts` with tests:
   (a) input is pre-filled with `currentName`;
   (b) tapping Save with a non-empty name calls PATCH and then `onclose`;
   (c) tapping Save with an empty name shows an error and does not call PATCH;
   (d) tapping Cancel calls `onclose` without PATCH;
   (e) tapping Save with a name longer than 200 characters shows the max-length
   error and does not call PATCH.
   Create `EditDescriptionSheet.test.ts` with tests:
   (a) textarea is pre-filled with `currentDescription` (or empty if null);
   (b) tapping Save with non-empty text sends the trimmed value;
   (c) tapping Save with blank text sends `null`;
   (d) tapping Cancel calls `onclose`.
   Run `cd web && pnpm test -- --reporter=verbose ListOverflow RenameList EditDescription` — must fail.
2. GREEN — Implement `ListOverflowSheet.svelte`, `RenameListSheet.svelte`, and
   `EditDescriptionSheet.svelte` per Decisions and visual spec. Create mock files.
3. Run `cd web && pnpm lint && pnpm check && pnpm test` — must be green.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

**Notes:** Updated the Sheet mock (`__mocks__/Sheet.svelte`) to destructure `onclose` and render a `data-test="sheet-close"` trigger button so test (g) can simulate Sheet's onclose prop. The mock files for all three sheets use hardcoded `data-test` slugs (no prop forwarding) to avoid `@typescript-eslint/no-unsafe-member-access` errors. Two Svelte 5 `state_referenced_locally` warnings appear for `RenameListSheet` and `EditDescriptionSheet` (props used as `$state` initializers) — these are warnings not errors, the behavior is correct since the sheets are always remounted fresh.

---

## Phase 4 — Wiring

### [x] 4.1 Wire `ListsScreen`: ⋮ button, overflow sheet, and undo snackbar

**Created:** 2026-05-26T18:28:54Z
**Completed:** 2026-05-26T21:45:42Z

**Why:** Connects `ListOverflowSheet`, `UndoSnackbar`, and the `pendingDelete`
state to the Lists screen — the primary surface for list management.

**Prerequisites:** Task 3.1 (sheets created). Task 2.1 (`deleteList`,
`undoDeleteList` exported from `lists.svelte.ts`).

**Decisions:**

- Remove `<span class="chevron"><Icon name="chevron-right" size={18} /></span>` from inside `<button class="row-nav">`. Add a `<div class="row-top">` as the first child of each `.row`, containing two siblings:
  1. `<button class="row-nav">` now wraps only `<span class="name">{item.name}</span>` (no chevron span).
  2. `<MoreButton size={18} aria-label="List options" data-test="list-overflow-{item.id}" onclick={() => (overflowList = item)} style="color: var(--stone)" />` — a sibling of `row-nav`, not nested inside it. No `e.stopPropagation()` needed; siblings do not bubble into each other.
     Import `MoreButton` from `$lib/shared/components/MoreButton.svelte`.
- **Migrate the Settings icon button:** While in `ListsScreen.svelte`, replace the existing:
  ```svelte
  <button class="icon-btn" aria-label="Settings" data-test="lists-settings" onclick={() => goto(resolve('/settings'))}>
    <Icon name="settings" size={22} />
  </button>
  ```
  with:
  ```svelte
  <IconButton aria-label="Settings" data-test="lists-settings" onclick={() => goto(resolve('/settings'))}>
    <Icon name="settings" size={22} />
  </IconButton>
  ```
  Import `IconButton` from `$lib/basic/components/IconButton.svelte`. Remove the `.icon-btn` CSS class block from `ListsScreen.svelte`'s `<style>`.
- **CSS changes:** Remove `.chevron { … }`. Add `.row-top { display: flex; align-items: center; }` (the overflow button is `flex-shrink: 0` by default from its `padding` only; `row-nav` keeps `width: 100%` removed in favour of `flex: 1` set on `.row-nav`).
- Add `let overflowList = $state<List | null>(null)` to the script (import `List`
  from `$lib/list/model/list`). Storing the full `List` object (not just the id)
  keeps `item.name`, `item.item_count`, and `item.list_members` in scope outside
  the `{#each}` loop.
- Render `{#if overflowList}` a `<ListOverflowSheet>`. Pass
  `listId={overflowList.id}`, `listName={overflowList.name}`,
  `description={overflowList.description}`,
  `itemCount={overflowList.item_count}`,
  `memberCount={overflowList.list_members.length}`,
  `onDelete={() => {}}`,
  `onclose={() => (overflowList = null)}`, and:
  ```svelte
  onviewtrash={async () => {
    const trashListId = overflowList!.id;
    overflowList = null;           // unmounts sheet → Sheet.$effect cleanup → history.back()
    await tick();                  // flush Svelte DOM update so cleanup fires
    // Wait for Sheet's history.back() popstate to fire before navigating forward;
    // otherwise SvelteKit sees the backward pop after the forward push and undoes
    // the navigation. Sheet always calls pushHistoryGuard on mount, so unmounting
    // it always triggers cleanup → history.back() → popstate.
    await new Promise<void>(r => window.addEventListener('popstate', () => r(), { once: true }));
    await goto(resolve('/lists/' + trashListId + '/trash'));
  }}
  ```
  Import `tick` from `'svelte'`.
  Include a code comment at the `onDelete` call site:
  `// ListsScreen — sheet closes itself (one back); user is already on the right screen.`
- Add `<UndoSnackbar>` for list delete: `{#if lists.pendingDelete}` renders
  `<UndoSnackbar deletedName={lists.pendingDelete.list.name} onUndo={() => void undoDeleteList()} ondismiss={() => { lists.pendingDelete = null; }} data-test="list-undo-snackbar" />`.
  Note: when `undoDeleteList()` fails, `lists.error` is set and `pendingDelete` stays alive so the snackbar remains visible, but no error-state branch is shown in this plan. A "Couldn't restore" message is deferred to 0602 alongside the full trash restore flow.
- Hide the `<Fab>` while `lists.pendingDelete !== null`: add
  `{#if !lists.pendingDelete}` wrapper around `<Fab>`.
- Update `ListsScreen.test.ts`:
  (a) existing test that checks for `chevron-right` should be updated or removed;
  (b) new test: clicking `data-test="list-overflow-<id>"` renders
  `ListOverflowSheet` (mocked) — the `MoreButton` mock forwards `data-test` so
  the `fireEvent.click` query still works;
  (c) new test: when `lists.pendingDelete` is set, `<UndoSnackbar>` is present;
  (d) new test: when `lists.pendingDelete` is set, `<Fab>` is absent.
  Add `vi.mock('$lib/shared/components/MoreButton.svelte')` and
  `vi.mock('$lib/basic/components/IconButton.svelte')` at the top of the test file.

**Files:**

- `web/src/lib/list/components/ListsScreen.svelte` (modify)
- `web/src/lib/list/components/ListsScreen.test.ts` (modify)

**Steps:**

1. RED — Add the new tests to `ListsScreen.test.ts` per Decisions. Run
   `cd web && pnpm test -- --reporter=verbose ListsScreen` — new tests must fail.
2. GREEN — Update `ListsScreen.svelte` per Decisions: add `row-top` wrapper,
   swap `<span class="chevron">` for `<MoreButton>`, migrate Settings button to
   `<IconButton>`, mount `ListOverflowSheet` conditionally, add `<UndoSnackbar>`,
   hide FAB. Import `MoreButton`, `IconButton`, `ListOverflowSheet`, `UndoSnackbar`,
   `undoDeleteList`, `tick`, and the `lists` state. (`deleteList` is called inside
   `ListOverflowSheet` — do not import it in `ListsScreen`.)
3. Run `cd web && pnpm lint && pnpm check && pnpm test` — must be green.

**Verify:** `cd web && pnpm lint && pnpm check && pnpm test`

**Notes:** MoreButton mock didn't forward `onclick` — updated `__mocks__/MoreButton.svelte` to destructure and forward it so test (new-b) works. The `goto(resolve(...))` call for the trash route needed a template literal rather than string concatenation to satisfy SvelteKit's typed-route overloads. Two side fixes landed alongside this task: (1) `Sheet.svelte` gained an invisible backdrop div (same `left`/`right` formula as the sheet) that calls `onclose` on click, giving all sheets tap-outside-to-dismiss behaviour; (2) `Sheet.svelte` CSS was updated with a proper upward shadow (`0 -8px 30px rgba(0,0,0,0.15)`) and `border-radius: 24px 24px 0 0` so sheets are visually distinguishable from the page background.

### [x] 4.2 Wire `ItemsScreen`: ⋮ button opens `ListOverflowSheet`

**Created:** 2026-05-26T18:28:54Z
**Completed:** 2026-05-26T22:04:36Z

**Why:** The Items screen TopBar has had a no-op `⋮` button since step 4. This
task wires it to `ListOverflowSheet` so list management is reachable from within
a list.

**Prerequisites:** Task 3.1 (sheets created). Task 4.1 (`ListOverflowSheet`
already used in `ListsScreen` — pattern is established).

**Decisions:**

- Add `let overflowOpen = $state(false)` to `ItemsScreen.svelte`.
- **Extend `listMeta` to include `description`.** Update the `ListMeta` type to
  `{ name: string; description: string | null; list_members: { user_id: string }[] }`
  and set the initial value to `{ name: '', description: null, list_members: [] }`.
  Add `description` to the `pgGet` select clause:
  `/lists?id=eq.${listId}&select=name,description,list_members(user_id)&list_members.deleted_at=is.null`.
  This is needed so `ItemsScreen` can pass `description` to `ListOverflowSheet`,
  which forwards it to `EditDescriptionSheet`.
- **Migrate the TopBar `⋮` button:** Replace the existing:
  ```svelte
  <button class="icon-btn" aria-label="More options" onclick={() => {}}>
    <Icon name="more-vertical" size={22} />
  </button>
  ```
  with `<MoreButton aria-label="More options" size={22} onclick={() => (overflowOpen = true)} />`. Import `MoreButton` from `$lib/shared/components/MoreButton.svelte`. Remove the `.icon-btn` CSS class block from `ItemsScreen.svelte`'s `<style>` (it is no longer used after this task — the TopBar button replaced here is the only `.icon-btn` user in this file).
- Render `{#if overflowOpen}` a `<ListOverflowSheet>` with:
  - `listId={listId}` (already available as a prop)
  - `listName={listMeta.name}`
  - `description={listMeta.description}`
  - `itemCount={items.rows.length}`
  - `memberCount={listMeta.list_members.length}`
  - `onDelete={() => history.back()}` — after the sheet closes itself (one
    `history.back()`), this call pops the now-stale Items route. Include comment:
    `// ItemsScreen — delete closes the sheet (one back) then leaves this route`
    `// (second back), because the list no longer exists.`
  - `onclose={() => (overflowOpen = false)}` — called when the user presses Android
    back or taps outside the sheet; unmounts the component.
  - ```svelte
    onviewtrash={async () => {
      overflowOpen = false;        // unmounts sheet → Sheet.$effect cleanup → history.back()
      await tick();
      // Same guarantee as in task 4.1: Sheet always calls pushHistoryGuard on
      // mount, so unmounting it always fires popstate.
      await new Promise<void>(r => window.addEventListener('popstate', () => r(), { once: true }));
      await goto(resolve('/lists/' + listId + '/trash'));
    }}
    ```
    Import `tick` from `'svelte'`. `listId` is already in scope (component prop).
- Update `ItemsScreen.test.ts`:
  (a) new test: clicking `aria-label="More options"` renders `ListOverflowSheet`
  (mocked). The `MoreButton` mock forwards `aria-label`, so `getByRole('button', { name: 'More options' })` works.
  Add `vi.mock('$lib/shared/components/MoreButton.svelte')` at the top of the test file.

**Files:**

- `web/src/lib/item/components/ItemsScreen.svelte` (modify)
- `web/src/lib/item/components/ItemsScreen.test.ts` (modify)

**Steps:**

1. RED — Add `vi.mock('$lib/shared/components/MoreButton.svelte')` and the new test to `ItemsScreen.test.ts`. Run
   `cd web && pnpm test -- --reporter=verbose ItemsScreen` — must fail.
2. GREEN — In `ItemsScreen.svelte`: update `ListMeta` type and initial value to include `description`; extend the `pgGet` select to include `description`; add `overflowOpen` state; replace the `<button class="icon-btn">` TopBar button with `<MoreButton>` wired to `overflowOpen`; mount `<ListOverflowSheet>` conditionally (passing `description`); remove the `.icon-btn` CSS block. Import `MoreButton`, `ListOverflowSheet`, `tick`.
3. Run `cd web && pnpm lint && pnpm check && pnpm test` — must be green.
4. Run `./scripts/check.sh` from the repo root — must be green.

**Verify:** `./scripts/check.sh`
