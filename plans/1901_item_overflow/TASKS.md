# Tasks

## Reference skills and docs

- **`docs/ui.md`** — Items-screen extra-panel spec; overflow-menu / bottom-sheet,
  button-order (right = committal), and destructive-action conventions.
- **`docs/frontend-layout.md`** — `web/src/lib/` tier split and filename rules;
  the new sheet belongs in the `item/` domain.
- **`docs/testing.md`** — Vitest asserts user-visible component behaviour;
  Playwright covers the user flow.

## Phase 1 — overflow sheet + screen wiring

### [x] 1.1 Create `ItemOverflowSheet` with Edit/Delete menu

**Created:** 2026-06-15T07:33:25Z
**Completed:** 2026-06-15T08:29:17Z

**Notes:** `pnpm lint` and `pnpm check` report failures, but all are
pre-existing and confined to the `export/` domain: a missing `jszip`
dependency (`Cannot find module 'jszip'`) and the resulting unsafe-type
ESLint errors in `export/model/archive.ts` and `export/state/export.test.ts`.
None touch the new `ItemOverflowSheet` files, which lint and type-check
clean. Flagging the missing `jszip` install for the user.

**Why:** The item extra panel needs a bottom-sheet overflow menu (replacing the
inline Delete/Edit buttons) so the future copy/move-between-lists actions have
somewhere to land. This task builds the sheet in isolation; Task 1.2 wires it in.

**Prerequisites:** None. Model the component on the existing
`web/src/lib/list/components/ListOverflowSheet.svelte` and its test
`ListOverflowSheet.test.ts`.

**Decisions:**

- The sheet is a thin menu only — it holds no edit/delete business logic. It
  emits callbacks the parent handles; the parent keeps owning `AddEditItemSheet`,
  `DeleteItemSheet`, and the undo state. Props:
  ```ts
  type Props = {
  	itemName: string;
  	onedit: () => void;
  	ondelete: () => void;
  	onclose: () => void;
  };
  ```
- Structure mirrors `ListOverflowSheet`: `<Sheet open={true} {onclose}>`, a
  `div.sheet-handle`, a `header` with `h2.t-sheet` showing `{itemName}` (no
  meta line needed), and a `ul.menu` of full-width
  `Button variant="text" tone="ink" size="md"` rows, each `<Icon> + <span class="body">`.
- Two rows, non-destructive first, destructive last (button-order convention):
  - **Edit** — `Icon name="pencil"` size 18, label "Edit", `tone="ink"`,
    `data-test="item-overflow-edit"`, `onclick={onedit}`.
  - **Delete** — `Icon name="trash"` size 18, label "Delete",
    `tone="destructive"`, `data-test="item-overflow-delete"`, `onclick={ondelete}`.
  - Copy/Move will slot between these later — leave the order intentional.
- Copy the `<style>` block verbatim from `ListOverflowSheet.svelte` (header
  bottom border; full-bleed `.menu` top/bottom border; `.menu > li + li`
  divider; `.menu :global(button)` padding/gap). British English in labels.

**Reference:** `web/src/lib/list/components/ListOverflowSheet.svelte` (template)
and `ListOverflowSheet.test.ts` (test shape). `docs/ui.md` for menu-row styling
and destructive-action colour.

**Files:**

- `web/src/lib/item/components/ItemOverflowSheet.svelte` (create)
- `web/src/lib/item/components/ItemOverflowSheet.test.ts` (create)

**Steps:**

1. RED — Create `ItemOverflowSheet.test.ts`: (a) renders the item name in the
   header; (b) renders an Edit row (`item-overflow-edit`) and a Delete row
   (`item-overflow-delete`); (c) clicking Edit fires `onedit`; (d) clicking
   Delete fires `ondelete`. Use the render/`getByDataTest` helpers from
   `ListOverflowSheet.test.ts`.
2. RED — Run `cd web && pnpm test ItemOverflowSheet` and confirm red (component
   doesn't exist).
3. GREEN — Create `ItemOverflowSheet.svelte` per Decisions.
4. GREEN — Re-run `pnpm test ItemOverflowSheet`; confirm green.

**Verify:** `cd web && pnpm test ItemOverflowSheet` · `cd web && pnpm lint` · `cd web && pnpm check`

### [x] 1.2 Swap inline Edit/Delete for the More button + overflow sheet on the Items screen

**Created:** 2026-06-15T07:33:25Z
**Completed:** 2026-06-15T10:04:55Z

**Notes:** Resumed mid-task after a VSCode crash; the prior session had
implemented most of the screen wiring, the mock, the unit/e2e tests, and the
`docs/ui.md` edits. Several corrections were needed:

- **Crash artifact:** `ItemsScreen.svelte` had `align-items: flex-baseline`
  (invalid CSS — silently falls back to `stretch`); its own comment described
  `flex-start`. Restored to `flex-start`.
- **Real back-stack regression (the big one).** The overflow→Edit/Delete swap
  set the target sheet and nulled `overflowItem` in the _same tick_, so the
  overflow guard's programmatic `history.back()` raced a `pushState` for the
  target. `back-stack.svelte.ts` tracks self-induced popstates with a single
  boolean, so the guard stack desynced from real browser history and the app
  over-popped — nondeterministically across browsers, in the worst case flinging
  the session to `/auth/check`. This corrupted history for the rest of the
  session, so it wasn't contained to the dedicated back-button tests: it broke
  downstream e2e `(g)`/`(h)` too. Confirmed a regression by stashing the 1.2
  working changes and running the committed baseline (inline buttons) → 18/18
  green. **This contradicts the task's Decisions**, which said to leave `openId`
  set and _not_ use the await-popstate sequencing pattern, claiming the swap was
  a "proven one-back-one-push shape." It is not, once a second guard (the open
  row) is on the stack.
  - **Fix (local, no shared-primitive change):** added `closeOverlayAndSettle()`
    in `ItemsScreen.svelte` — close the overlay, await its `history.back()`
    popstate, _then_ push the next guard — so only one back is ever in flight
    (mirrors the existing `onviewtrash` handler). Applied to the Edit and Delete
    swaps. Also null `openId` when an item is actually deleted (the row behind
    the sheet is stale), sequenced after the delete sheet's teardown, so no row
    guard dangles. After the fix: e2e items 24/24 on chromium+firefox, run 3×,
    deterministic.
  - Unit tests `(overflow-b)`/`(overflow-c)` mock `history.back` to a no-op, so
    they now dispatch the `PopStateEvent` the handler awaits (same technique as
    test `(h)`).
- **TODO #10** updated: the Items flow is fixed by manual sequencing, but the
  shared `pushHistoryGuard` primitive is still fragile-by-convention; the
  durable fix (shallow routing via `$page.state`) is logged for its own plan.
- **Environment:** webkit e2e can't run here (host missing browser system deps);
  chromium + firefox cover the flow.
- **Unrelated change in the working tree:** an earlier FAB-clearance fix
  (`--fab-clearance` token in `tokens.css`, applied to `ListsScreen` and
  `ItemsScreen`) is present from a separate request — not part of this task.

**Why:** Remove the two inline extra-panel buttons and replace them with a
top-right More button that opens `ItemOverflowSheet`, routing Edit/Delete through
the existing flows. Completes the user-visible change and updates the spec.

**Prerequisites:** Task 1.1 (`ItemOverflowSheet` exists). `ItemsScreen.svelte`
already imports `MoreButton` (`$lib/shared/components/MoreButton.svelte`) and
already owns `editSheetItem` / `deleteSheetItem` state and the
`AddEditItemSheet` / `DeleteItemSheet` / undo-snackbar render blocks.

**Decisions:**

- **Remove** the entire `<div class="extra-actions">…</div>` block (the inline
  Delete + Edit `Button`s, ~lines 214-239) and its `.extra-actions` CSS
  (~lines 447-451). `Button` is used _only_ in that block, so also delete the
  now-unused `import Button from '$lib/basic/components/Button.svelte';`
  (line 19) — otherwise svelte-check / `@typescript-eslint/no-unused-vars` fails
  `pnpm check` / `pnpm lint`.
- **Add** a `.more` span containing `MoreButton` as the first child of the
  `.extra` block, pinned top-right — copy the placement from
  `ListsScreen.svelte` (`.more` span at lines ~104-113; `.extra`/`.more` CSS at
  ~247-264). Use `size={18}`, `aria-label="Item options"`,
  `data-test="item-overflow-{item.id}"`, `style="color: var(--stone)"`,
  `onclick={() => (overflowItem = item)}`.
- **CSS:** give `.extra` `position: relative`; add a `.more` rule
  (`position: absolute; top: 0.375rem; right: 0.55rem` as the starting values).
  Widen `.extra`'s right padding and/or top padding so the optional notes line
  and the right-aligned `VoteControl` in `.votes-row` clear the absolutely
  positioned button. Tune in the running app (light + dark, with and without
  notes); record the final insets in a short CSS comment like `ListsScreen` does.
- **Add** `let overflowItem = $state<Item | null>(null);` beside the existing
  `editSheetItem` / `deleteSheetItem` declarations (~line 53).
- **Render** the sheet near the other `{#if …Sheet}` blocks:
  ```svelte
  {#if overflowItem}
    <ItemOverflowSheet
      itemName={overflowItem.name}
      onedit={() => { editSheetItem = overflowItem; overflowItem = null; }}
      ondelete={() => { deleteSheetItem = overflowItem; overflowItem = null; }}
      onclose={() => (overflowItem = null)}
    />
  {/if}
  ```
  Note `openId` is deliberately left set — the row stays open under the sheet's
  backdrop so only the overflow guard tears down (see the Back-button decision
  below). The edit/delete/undo flows are otherwise unchanged from the old inline
  buttons.
- **Import** `ItemOverflowSheet` from `./ItemOverflowSheet.svelte`.
- **Test stub for `ItemOverflowSheet`.** `ItemsScreen.test.ts` mocks the sheet
  (as it already mocks `ListOverflowSheet`), but unlike the _static_
  `__mocks__/ListOverflowSheet.svelte` div, this mock must forward the callbacks
  so the wiring can be asserted. Create
  `web/src/lib/item/components/__mocks__/ItemOverflowSheet.svelte` rendering an
  `item-overflow-sheet-stub` wrapper plus an `item-overflow-edit` button
  (`onclick={onedit}`) and an `item-overflow-delete` button
  (`onclick={ondelete}`). The existing `add-edit-sheet-stub` /
  `delete-sheet-stub` mocks then confirm the target sheet opens.
- **Leave untouched** the screen's TopBar list-level More button (`overflowOpen`
  → `ListOverflowSheet`) — it is a different, unrelated overflow.
- **Back-button (R4) — leave the open row in place; do NOT null `openId` in the
  handlers.** While the overflow sheet is open the history-guard stack is
  `[rowGuard, overflowGuard]` (the open row pushes one via the `openId`
  `$effect`, the sheet pushes another). Nulling both `overflowItem` and `openId`
  in one tick would fire two `pushHistoryGuard` cleanups → two `history.back()`
  calls, but `back-stack.svelte`'s `suppressNextPopState` is a single boolean and
  suppresses only one — the second pop is then read as a user back-press and
  instantly closes the just-mounted edit/delete sheet. So the handlers null only
  `overflowItem` and set the target sheet item (as shown above): exactly one
  guard tears down (overflow) and one pushes (target) — the proven
  one-back-one-push shape the old inline buttons used. The row stays expanded
  under the sheet's backdrop, and backing out of the target sheet returns to the
  open row (R4). Do not use the `await tick()` + await-`popstate` pattern here —
  that is for one teardown before a `goto`, not this swap.
- **Docs:** update `docs/ui.md` Items-screen section — the extra panel ends in a
  top-right More (⋮) button opening an overflow sheet with **Edit** and
  **Delete** (and, in future, **Copy/Move between lists**), not inline buttons.
  British English in user-facing copy. Also add "item overflow menu" to the
  bottom-sheet examples in the back-button section (`docs/ui.md` ~line 148), so
  the new history-pushing overlay is listed alongside the others.

**Reference:** `web/src/lib/list/components/ListsScreen.svelte` for More-button
placement/CSS; `docs/ui.md` for the extra-panel spec being edited.

**Files:**

- `web/src/lib/item/components/ItemsScreen.svelte` (modify)
- `web/src/lib/item/components/ItemsScreen.test.ts` (modify)
- `web/src/lib/item/components/__mocks__/ItemOverflowSheet.svelte` (create)
- `web/e2e/items.spec.ts` (modify)
- `docs/ui.md` (modify)

**Steps:**

1. RED — In `ItemsScreen.test.ts`, **add** new assertions (the file has no
   `extra-edit` / `extra-delete` assertions today — those live only in the e2e
   spec, so there is nothing to replace here). Mock `ItemOverflowSheet` (see
   Decisions) alongside the existing mocks, then assert that after opening a row,
   clicking `item-overflow-{id}` renders `item-overflow-sheet-stub`; clicking
   `item-overflow-edit` renders `add-edit-sheet-stub`; and clicking
   `item-overflow-delete` renders `delete-sheet-stub`. Keep the
   open/close-on-tap and popstate tests.
2. RED — In `web/e2e/items.spec.ts`, re-point every `extra-edit-{id}` /
   `extra-delete-{id}` reference through the new affordance: test `(c)` (its
   open-panel probe at lines 108-109 → `item-overflow-{id}`), the Edit flow
   `(e)`, and the Delete flow `(f)` (row → `item-overflow-{id}` →
   `item-overflow-edit` / `item-overflow-delete`). Leave `(g)` as-is — it only
   taps undo and never referenced the inline hooks. Add assertions that (i) from
   an open row, tapping More then the back button closes the overflow sheet
   without leaving the Items screen; and (ii) after More → Edit and after
   More → Delete, the back button from the target sheet returns to the open
   Items screen (not a ghost overflow sheet), verifying R4.
3. RED — Run `cd web && pnpm test ItemsScreen` and confirm red against the new
   expectations.
4. GREEN — Edit `ItemsScreen.svelte` per Decisions: remove `.extra-actions` +
   CSS and the now-unused `import Button`, add the `.more` button + CSS, add
   `overflowItem` state, import and render `ItemOverflowSheet` wired to the
   existing flows.
5. GREEN — Run `cd web && pnpm test ItemsScreen`; confirm green.
6. GREEN — Update `docs/ui.md`: the Items-screen section to describe the new
   affordance, and the back-button section's bottom-sheet examples (~line 148)
   to include the item overflow menu.
7. GREEN — Manually run the app (`cd web && pnpm dev`, or the `/run` skill):
   open a list, unfold an item, confirm the More button sits top-right and clears
   the notes / vote control in light and dark; tap it; confirm the sheet opens
   with Edit + Delete; Edit opens the prefilled edit sheet; Delete opens the
   confirm sheet → undo snackbar works; the back button closes the overflow sheet
   (and panel) without navigating away. Record the final `.more`/`.extra` insets
   as a CSS comment.
8. GREEN — Run the e2e flow: `cd web && pnpm test:e2e items` (or
   `./scripts/check.sh --e2e`); confirm green.

**Verify:** `cd web && pnpm test` · `cd web && pnpm lint` · `cd web && pnpm check` · `cd web && pnpm test:e2e items`
