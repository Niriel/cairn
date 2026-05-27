# Tasks

## Reference skills and docs

- **`.claude/skills/writing-tasks.md`** — self-contained briefing format; RED-before-GREEN; route-test filenames drop the `+`.
- **`docs/frontend-layout.md`** — `components/` / `state/` / `model/` tier split; sibling domains never import from each other.
- **`docs/ui.md` → "Trash & undo"** — canonical row spec and the contract that hard-delete is not a v1 UI action.
- **`docs/data-model.md` → "The `items_deleted` view"** — view body, restore semantics (PATCH `deleted_at: null`), RLS gating.
- **`docs/testing.md`** — Vitest layer covers this sub-plan; Playwright is deferred to Phase 4 of the parent plan.
- **`design/cairn-screens.jsx`** — `TrashScreen` (screen 14, lines 1254–1311) is the row visual spec for the item trash; the deleted-lists row reuses the same shape adapted per R4.
- **`web/src/lib/item/model/item.ts`** — `restoreItem` is the existing per-item restore call; reuse it. `fetchItems` is the template for `fetchDeletedItems`.
- **`web/src/lib/list/state/lists.svelte.ts`** — pattern for the rune store and `loadLists`. The new trash stores mirror this minus the pending-delete machinery.

---

## Phase 0 — Doc reconciliation

### [x] 0.1 Switch the trash-attribution separator in `docs/ui.md` and `docs/data-model.md` to a bullet

**Created:** 2026-05-27T11:00:00Z
**Completed:** 2026-05-27T09:36:00Z

**Why:** `docs/ui.md` "Trash & undo" → "Trash screen" still describes the
attribution row as *"deleted by Bob, 3 May 2026"* (comma), and the same
example string appears once more in `docs/data-model.md`'s
`items_deleted` view documentation. The design mockup at
`design/cairn-screens.jsx:1298` and this plan's R3/R4 both use the bullet
(`·`) separator. The docs are the living spec; landing the implementation
before reconciling both copies would leave a drift that the next
`/concerns` audit re-raises.

**Prerequisites:** None.

**Decisions:**
- Edit both `docs/ui.md`'s "Trash screen" subsection *and*
  `docs/data-model.md`'s `items_deleted` view paragraph. Don't touch
  other attribution prose (the Items-screen "Added by Alice on …" copy
  in `docs/ui.md` line 61 uses "on", not a separator, and is unaffected).
- Keep the rest of each sentence intact — only the comma-space changes
  to a space-bullet-space.

**Files:**
- `docs/ui.md` (modify)
- `docs/data-model.md` (modify)

**Steps:**
1. In `docs/ui.md` "Trash screen" subsection, replace
   *"deleted by Bob, 3 May 2026"* with *"deleted by Bob · 3 May 2026"*.
2. In `docs/data-model.md`'s `items_deleted` view paragraph, replace
   the same string with the bullet form.
3. Commit: `docs: use bullet separator in trash attribution example`.

**Verify:** `grep -rn "deleted by Bob, 3 May 2026" docs/` returns no
match; `grep -rn "deleted by Bob · 3 May 2026" docs/` returns two
matches (one in `ui.md`, one in `data-model.md`).

---

## Phase 1 — Item trash screen

### [x] 1.1 Add `fetchDisplayNames` helper, `item-trash` model + state

**Created:** 2026-05-27T08:27:35Z
**Completed:** 2026-05-27T09:44:35Z

**Notes:**
- Deviated from the task's "Mock `pgGet` via `vi.mock(...)`" direction in the test files; used MSW handler overrides instead, matching the convention used by every other model-layer test in the repo (e.g. `item.test.ts`, `items.test.ts`). The behavioural coverage in Decisions/Steps is preserved — empty-input no-fetch, dedup, reject propagation, missing-uid fallback, slim `select=`, list-name `null`-on-empty — just exercised through the MSW boundary rather than a module mock.

**Why:** The item trash screen needs (a) a way to resolve `deleted_by` UUIDs to human-readable names via a batched profiles fetch, since PostgREST embedding isn't available for `deleted_by` (FK points into `auth`, not `public`), and (b) a `loadTrash(listId)` action backed by a rune store so the screen component itself stays focused on layout. Both pieces are pure data plumbing — they belong below the component tier and ship in the same commit as a tested unit.

**Prerequisites:** None — uses only existing helpers (`pgGet` from `lib/shared/http/postgrest.ts`).

**Decisions:**
- `fetchDisplayNames(uids: string[]): Promise<Map<string, string>>` lives in `web/src/lib/shared/model/profile-names.ts`. Empty input short-circuits and returns `new Map()` without hitting the network. Dedup via `Array.from(new Set(uids))` before issuing the request. Query: `GET /profiles?id=in.(<csv>)&select=id,display_name`. If the fetch rejects, the function re-throws — *callers must wrap it in a try/catch so R5's "still loads" guarantee holds*; see the `fetchDeletedItems` Decision below. The function does **not** special-case the tombstone UUID: when the trash row's `deleted_by` is the tombstone, the tombstone profile row's `display_name` (`'Deleted user'`) comes back from `/profiles` like any other row.
- `DeletedItem` type in `web/src/lib/item/model/item-trash.ts` matches the `items_deleted` view exactly plus the joined name:
  ```ts
  export type DeletedItem = {
    id: string;
    list_id: string;
    name: string;
    notes: string | null;
    deleted_by: string;
    deleted_by_name: string;
    deleted_at: string;
  };
  ```
  Other view columns (`created_by`, `modified_by`, `created_at`, `modified_at`) are not surfaced in the row UI per R3 — drop them from the type to keep the state slim. `deleted_by_name` defaults to `'Unknown'` if the profiles fetch failed or the UUID wasn't returned.
- `fetchDeletedItems(listId: string): Promise<DeletedItem[]>` issues
  `GET /items_deleted?list_id=eq.<uuid>&order=deleted_at.desc&select=id,list_id,name,notes,deleted_by,deleted_at`
  (slim `select=` aligns with `fetchDeletedLists` in Task 2.1 — no over-fetching of view columns the type discards),
  then collects the unique `deleted_by` UUIDs and resolves names via
  `fetchDisplayNames`. The `fetchDisplayNames` call is wrapped in
  `try { … } catch { return new Map(); }` so a profiles-fetch failure
  degrades to `'Unknown'` for every name (R5's contract) without taking
  the whole load down. Returns just the rows; the caller stores the
  list name separately.
- `fetchListName(listId: string): Promise<string | null>` lives next
  to `fetchDeletedItems`. Use the **default array form** (no
  `Accept: application/vnd.pgrst.object+json` header) and read
  `rows[0]?.name ?? null` — the single-object form returns HTTP 406
  (`PGRST116`) on zero rows, which `pgGet` throws as `ApiError`, and
  the screen needs `null` (not a thrown error) when the list ID is
  stale.
- `itemTrash` store shape in `web/src/lib/item/state/item-trash.svelte.ts`:
  ```ts
  export const itemTrash = $state<{
    rows: DeletedItem[];
    loading: boolean;
    error: string | null;
    listId: string | null;
    listName: string | null;
  }>({ rows: [], loading: false, error: null, listId: null, listName: null });
  ```
  Plus `loadTrash(listId)` and `restoreOne(itemId)`.
  - `loadTrash` first **clears any pending error timer** (see error-timer note below), then clears state defensively (`itemTrash.rows = []; itemTrash.listName = null; itemTrash.error = null; itemTrash.loading = true; itemTrash.listId = listId`) so a previous list's rows never flash under the new screen's chrome. Then issues `fetchDeletedItems` and `fetchListName` in parallel via **`Promise.allSettled`** (not `Promise.all` — the rows must survive a list-name fetch failure per PLAN.md's Decisions). After both settle: assign `rows` from the items result if fulfilled (else `[]` and `error` set to the canonical *"Couldn't load — try again."*, **not** `err.message`, for the same reason `restoreOne` doesn't leak raw PostgREST text — see below), and `listName` from the list-name result if fulfilled (else stays `null` so the TopBar `sub` is empty, per R1's deliberate decision). Finally `loading = false`.
  - `restoreOne` calls the existing `restoreItem` from `lib/item/model/item.ts`, splices the row on success. On failure sets `itemTrash.error = "Couldn't restore — try again."` (the exact canonical text from R3 — *do not* propagate `err.message`, which leaks raw PostgREST status to the UI) and starts a 4-second clear timer (see error-timer note).
  - **Error timer must be tracked, not fire-and-forget.** Hold the timer id in a module-level `let errorTimer: ReturnType<typeof setTimeout> | null = null;`. Before scheduling a new timer (in either `loadTrash` or `restoreOne`), `clearTimeout(errorTimer)` if non-null and reset to null. Also `clearTimeout(errorTimer)` at the top of `loadTrash` and on a *successful* `restoreOne` (so a stale 4-second-old failure doesn't suddenly clear a fresh error). This mirrors the `pendingDelete.timerId` tracking in `items.svelte.ts` and prevents two failed restores within 4 seconds from clobbering each other's error display.
- The state module does **not** wire a `$effect.root` like `lists.svelte.ts` does — load is explicit (called from the screen's `$effect`), not session-driven. The trash screen is always behind the auth gate; the screen mounts/unmounts via SvelteKit route navigation, so an explicit `loadTrash` call is clearer than a session-listening effect.
- **Manual mock at `web/src/lib/item/state/__mocks__/item-trash.svelte.ts`.** Task 1.2's screen tests will `vi.mock('$lib/item/state/item-trash.svelte')`; Vitest's auto-mock can't synthesise a working `$state(...)` rune, so the project pattern is a hand-written mock alongside `__mocks__/items.svelte.ts`. Export the same `itemTrash` `$state` plus `vi.fn()` stubs for `loadTrash` and `restoreOne` — exactly the shape `__mocks__/items.svelte.ts` uses for `items` and its actions.

**Reference:**
- `web/src/lib/item/model/item.ts` (template for the fetch helper, plus `restoreItem`).
- `web/src/lib/item/state/items.svelte.ts` (template for the rune store shape and the 4-second error-clear timer).
- `web/src/lib/shared/state/profile.svelte.ts` (template for the `Accept: application/vnd.pgrst.object+json` single-object fetch shape used by `fetchListName`).

**Files:**
- `web/src/lib/shared/model/profile-names.ts` (create)
- `web/src/lib/shared/model/profile-names.test.ts` (create)
- `web/src/lib/item/model/item-trash.ts` (create)
- `web/src/lib/item/model/item-trash.test.ts` (create)
- `web/src/lib/item/state/item-trash.svelte.ts` (create)
- `web/src/lib/item/state/__mocks__/item-trash.svelte.ts` (create — manual mock for Task 1.2's `vi.mock`; mirrors `__mocks__/items.svelte.ts`)

**Steps:**
1. RED — Create `web/src/lib/shared/model/profile-names.test.ts` with Vitest cases: (a) empty input returns empty map without calling fetch; (b) deduped UUIDs result in one fetch and a map of size N; (c) fetch failure rejects; (d) UIDs not returned by the API are absent from the map (caller's responsibility to default). Mock `pgGet` via `vi.mock('$lib/shared/http/postgrest')`. Run `pnpm test profile-names` and confirm red.
2. GREEN — Create `web/src/lib/shared/model/profile-names.ts` exporting `fetchDisplayNames`. Re-run the test; confirm green.
3. RED — Add tests for the model helpers in `web/src/lib/item/model/item-trash.test.ts`. Cover `fetchDeletedItems` (wire shape, dedupe of `deleted_by` UUIDs, graceful `'Unknown'` fallback when `fetchDisplayNames` rejects) and `fetchListName` (returns the name on hit, returns `null` on empty array, does not throw on no-row). Mock `pgGet` and `fetchDisplayNames`. The rune store's `loadTrash` / `restoreOne` are exercised through `TrashScreen.test.ts` in Task 1.2 — no separate state-layer test file. (The `.svelte.ts` state file *is* importable in `.test.ts`; the existing `items.test.ts` does so. Testing it via the screen is a layering choice here, not a constraint.) Run `pnpm test item-trash` and confirm red.
4. GREEN — Create `web/src/lib/item/model/item-trash.ts` with `DeletedItem`, `fetchDeletedItems`, `fetchListName`. Re-run the test; confirm green.
5. GREEN — Create `web/src/lib/item/state/item-trash.svelte.ts` with the `itemTrash` rune store, `loadTrash`, and `restoreOne` (including the tracked `errorTimer` per Decisions). No standalone test for this file — it's exercised through `TrashScreen.test.ts` in Task 1.2.
6. GREEN — Create `web/src/lib/item/state/__mocks__/item-trash.svelte.ts`. Mirror the shape of `web/src/lib/item/state/__mocks__/items.svelte.ts`: re-export the same `itemTrash` `$state(...)` declaration as the real module, and provide `vi.fn()` stubs for `loadTrash(_listId)` and `restoreOne(_itemId)` that return `Promise.resolve()`. Task 1.2's `TrashScreen.test.ts` will rely on this file being present.
7. Run `pnpm lint` (catches `no-floating-promises` and other typed-lint that `pnpm check` doesn't); fix any findings rather than disabling.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [x] 1.2 Build `TrashScreen` component and fill in route stub

**Created:** 2026-05-27T08:27:35Z
**Completed:** 2026-05-27T09:55:46Z

**Notes:**
- Deviation: the task specified `<Icon name="…" color="var(--stone-lt)" />`, but the existing `Icon.svelte` component accepts only `name`, `size`, and `data-test` — it draws with `stroke="currentColor"`. The codebase convention (see `ItemsScreen.svelte`'s empty-state) is to set the icon colour via a parent's `color`. Wrapped the row's `rotate-ccw` in a `.row-icon` span and let `.empty-circle` set the colour for the empty-state icon, rather than extending `Icon`'s API for one usage.
- User correction (during this task): the originally specified row palette (`var(--stone)` strike-through name, `var(--stone-lt)` attribution) was too faded. User asked for the row to look like a normal Items row. Updated `.name` to `15.5 px / 500 / var(--ink)` with no strike-through, `.attribution` to `12 px / var(--stone)`, and matched the Items row padding (`14 px 18 px 14 px 20 px`, `min-height: 56 px`, `gap: 10 px`). This diverges from the **Decisions** block's row spec lifted from the mockup; the user's directive supersedes.
- Manual browser check deferred — dev stack not started in this environment.

**Why:** With the model + state in place, the user-visible screen at `/(app)/lists/[list_id]/trash/` becomes a thin layout component that calls `loadTrash` on mount and renders rows. The route stub 0601 left in place gets filled in. This is one commit's worth of work: component, route fill-in, mock, and the two test files.

**Prerequisites:** Task 1.1 merged — `itemTrash` store and `fetchDeletedItems` exist.

**Decisions:**
- Component path: `web/src/lib/item/components/TrashScreen.svelte`. Props: `{ listId: string }`. On mount (`$effect`), call `itemTrash.loadTrash(listId)`. On unmount, no cleanup needed — the next mount re-fetches and resets state.
- Layout (lifted from `design/cairn-screens.jsx` `TrashScreen` lines 1254–1311):
  - `TopBar`: title `"Trash"`, `sub={itemTrash.listName ?? undefined}`. Default `showBack={true}` → uses `history.back()`. When `itemTrash.listName` is `null` (list-name fetch failed or returned no row, per R1's deliberate decision), the `sub` is simply omitted — do **not** invent a fallback string ("List unavailable", the raw `list_id`, etc.) here; the rows themselves carry context, and any invented copy diverges from R1.
  - Below TopBar, description block: `padding: 14px 18px 6px`, inner div `font-size: 12.5px; color: var(--stone); line-height: 1.5` with the exact text: `Items you delete from this list land here. Tap Restore to bring one back.`
  - Row container: `margin-top: 10px`.
  - Each row: `display: flex; align-items: center; gap: 12px; padding: 14px 18px;` plus `border-bottom: 1px solid var(--rule)` always and `border-top: 1px solid var(--rule)` on the first row only (achieve via `class:first={i === 0}` and a `.first` selector).
  - Leading icon: `<Icon name="rotate-ccw" size={16} color="var(--stone-lt)" />`. (Confirm `rotate-ccw` is in `icon-paths.ts` — if missing, that's a side change for Task 1.2 that must land in the same commit.)
  - Name span: `font-size: 14.5px; font-weight: 600; color: var(--stone); text-decoration: line-through; text-decoration-color: var(--stone-lt); text-decoration-thickness: 1px;`.
  - Attribution span: `font-size: 11.5px; color: var(--stone-lt); margin-top: 2px;`. Text: `deleted by {row.deleted_by_name} · {timeAgo(row.deleted_at)}`.
  - Restore button: `padding: 7px 12px; border: 1px solid var(--ink); border-radius: 999px; background: transparent; color: var(--ink); font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit;`. `data-test="trash-restore-{row.id}"`. Click handler: `() => void itemTrash.restoreOne(row.id)`.
- Empty state: shown when `!itemTrash.loading && itemTrash.rows.length === 0 && !itemTrash.error`. Block with `data-test="trash-empty"`, centred under the description. Layout mirrors the `.empty-circle` / `.empty-heading` styling already in `ItemsScreen.svelte` — read those rules and copy them. Trash icon uses `<Icon name="trash-2" size={44} color="var(--stone-lt)" />` and the single line is `Nothing in the trash.` styled to **match the existing `.empty-heading` rule exactly** (Newsreader serif, 22 px, `font-weight: 500`, `color: var(--ink)` — per R6). Do **not** override `font-weight` to 600; the headline weight is intentionally lighter to match Lists/Items empty states. No body copy, no CTA.
- Loading state: `data-test="trash-loading"`, single line `Loading…` in `var(--stone)`.
- Error region: when `itemTrash.error` is non-null, render a bottom-anchored block with `data-test="trash-error"` showing the error text in `var(--ember)`. The state's 4-second clear timer handles dismissal.
- Row-level `data-test="trash-row-{row.id}"` on each row's outer `<div>`.
- Route file `web/src/routes/(app)/lists/[list_id]/trash/+page.svelte`: overwrite the stub with:
  ```svelte
  <script lang="ts">
    import type { PageProps } from './$types';
    import TrashScreen from '$lib/item/components/TrashScreen.svelte';

    const { params }: PageProps = $props();
  </script>

  <TrashScreen listId={params.list_id} />
  ```
  Exact same shape as the existing `/lists/[list_id]/+page.svelte` (`web/src/routes/(app)/lists/[list_id]/+page.svelte:1-8`).
- Mock at `web/src/lib/item/components/__mocks__/TrashScreen.svelte`: a single-line `<div data-test="trash-screen-stub"></div>`. Same shape as `__mocks__/ItemsScreen.svelte`.
- Route-level test at `web/src/routes/(app)/lists/[list_id]/trash/page.test.ts` mocks the screen and asserts `trash-screen-stub` renders — mirrors the existing `page.test.ts` for the sibling route. **Filename drops the `+`** per `docs/frontend-layout.md` → "Filename conventions"; a `+page.test.ts` would fail `svelte-kit sync`.

**Reference:**
- `web/src/lib/item/components/ItemsScreen.svelte` for the empty-state styles (`.empty-circle`, `.empty-heading`, `.empty-body`) and for the in-screen error display pattern.
- `web/src/lib/shared/model/time-ago.ts` for the `timeAgo` formatter (already exists).
- `web/src/routes/(app)/lists/[list_id]/page.test.ts` for the route-test shape.
- `docs/quality.md` → "Filename conventions" for the no-`+` rule on colocated route tests.

**Files:**
- `web/src/lib/item/components/TrashScreen.svelte` (create)
- `web/src/lib/item/components/TrashScreen.test.ts` (create)
- `web/src/lib/item/components/__mocks__/TrashScreen.svelte` (create)
- `web/src/routes/(app)/lists/[list_id]/trash/+page.svelte` (modify — fill in stub)
- `web/src/routes/(app)/lists/[list_id]/trash/page.test.ts` (create)

**Steps:**
1. Sanity-check `grep -n "rotate-ccw" web/src/lib/basic/model/icon-paths.ts` — the icon is already exported at `icon-paths.ts:56`, so no edit is expected. If the grep returns nothing (unlikely; would mean an earlier branch reverted it), add the Lucide path back; otherwise move on.
2. RED — Create `web/src/lib/item/components/TrashScreen.test.ts`. Cover: (a) loading state shows `trash-loading`; (b) loaded with rows shows one `trash-row-<id>` per row, the row text includes `deleted by <name>`, `timeAgo` output is present; (c) empty state shows `trash-empty` when rows.length === 0 and loading is false; (d) clicking `trash-restore-<id>` calls `itemTrash.restoreOne` (mock the state module); (e) error path shows `trash-error`. Mock `$lib/item/state/item-trash.svelte` via `vi.mock` returning a controllable store stub — pattern used by other screen tests (look at `ItemsScreen.test.ts` for the rune-store mock idiom). Run `pnpm test TrashScreen` and confirm red.
3. GREEN — Create `web/src/lib/item/components/TrashScreen.svelte` per Decisions. Re-run the test; confirm green.
4. GREEN — Create `web/src/lib/item/components/__mocks__/TrashScreen.svelte` with the single stub div.
5. GREEN — Overwrite `web/src/routes/(app)/lists/[list_id]/trash/+page.svelte` with the thin wrapper. Verify the existing stub content is replaced, not appended.
6. RED — Create `web/src/routes/(app)/lists/[list_id]/trash/page.test.ts` mirroring `lists/[list_id]/page.test.ts`. Mock `$lib/item/components/TrashScreen.svelte`. Run `pnpm test trash/page` and confirm red, then green once the mock and route wrapper are in place.
7. Run `pnpm lint && pnpm check && pnpm test` — must all be green. If `svelte-check` complains about `data-test` typing, mirror the cast already used in sibling screens.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test` · open `http://localhost:5173/lists/<list_id>/trash` after `pnpm dev` and confirm rows render, Restore removes the row, back arrow returns to the Items screen. (Manual browser check is best-effort; mark as deferred if the dev stack isn't up at task time.)

---

## Phase 2 — Account deleted-lists screen

### [x] 2.1 Add `list-trash` model + state

**Created:** 2026-05-27T08:27:35Z
**Completed:** 2026-05-27T10:20:46Z

**Why:** The account-level deleted-lists screen mirrors the item trash but reads from `lists_deleted` and PATCHes `/lists`. The model and state layer carries the data — splitting it out of the component (same as Task 1.1 split item-trash) keeps `DeletedListsScreen.svelte` focused on layout and makes the state testable directly through the screen tests.

**Prerequisites:** Task 1.1 merged — `fetchDisplayNames` exists in `web/src/lib/shared/model/profile-names.ts`. This task reuses it.

**Decisions:**
- `DeletedList` type in `web/src/lib/list/model/list-trash.ts`:
  ```ts
  export type DeletedList = {
    id: string;
    name: string;
    description: string | null;
    deleted_by: string;
    deleted_by_name: string;
    deleted_at: string;
  };
  ```
  `created_by`, `created_at`, `modified_at` are not surfaced — drop them to keep the row slim. The deleted-lists screen does not display the description, but the type carries it for parity with `list.ts`'s `List` shape and so a future row-expansion could read it without re-fetching. Defaultable: if you'd rather drop `description` too, that's fine — only `id`, `name`, `deleted_by`, `deleted_by_name`, `deleted_at` are read by the screen.
- `fetchDeletedLists(): Promise<DeletedList[]>` issues `GET /lists_deleted?order=deleted_at.desc&select=id,name,description,deleted_by,deleted_at`, then `fetchDisplayNames(uniqueDeletedByUuids)`, then joins.
- `restoreList(listId: string): Promise<void>` is a new export in `web/src/lib/list/model/list-trash.ts` (not `list.ts`, to keep the trash domain self-contained):
  ```ts
  export function restoreList(listId: string): Promise<void> {
    // Send only deleted_at: null — the tg_set_attribution_lists trigger's
    // restore branch clears deleted_by automatically (same shape as
    // tg_set_attribution_items; see db/migrations/0004_domain_schema.sql:371).
    return pgPatch(`/lists?id=eq.${listId}`, { deleted_at: null });
  }
  ```
  Comment text and rationale mirror the existing `restoreItem` in
  `web/src/lib/item/model/item.ts:130-134`. The trigger is wired
  `BEFORE INSERT OR UPDATE ON public.lists` at
  `db/migrations/0004_domain_schema.sql:539-541`.
- `listTrash` store in `web/src/lib/list/state/list-trash.svelte.ts`:
  ```ts
  export const listTrash = $state<{
    rows: DeletedList[];
    loading: boolean;
    error: string | null;
  }>({ rows: [], loading: false, error: null });
  ```
  Plus `loadDeletedLists()` and `restoreOne(listId)`. Same shape as the item-trash store minus the `listId` / `listName` fields (account trash is not scoped to a list).
- `loadDeletedLists()` first **clears any pending error timer** (see error-timer note below), then clears state defensively (`listTrash.rows = []; listTrash.error = null; listTrash.loading = true`) so a previous user's rows don't flash on a fresh load. Calls `fetchDeletedLists`, stores rows, clears loading. On failure, sets `listTrash.error = "Couldn't load — try again."` (the canonical text — **not** `err.message`, mirroring the load-failure policy in Task 1.1's `loadTrash`) and starts a 4-second clear timer (see error-timer note).
- `restoreOne(listId)` calls `restoreList(listId)` and splices the row out **on success** (symmetric with `itemTrash.restoreOne` in Task 1.1 and with R8's "the row disappears on success"). On failure sets `listTrash.error = "Couldn't restore — try again."` (exact text — *do not* propagate raw `err.message`) and starts a 4-second clear timer (see error-timer note). The Decisions explicitly reject the optimistic splice-first pattern: the asymmetry with `itemTrash.restoreOne` has no user-visible upside at v1 volumes, and the requirements text (R8, parent R8) describes on-success behaviour.
- **Error timer must be tracked, not fire-and-forget.** Hold the timer id in a module-level `let errorTimer: ReturnType<typeof setTimeout> | null = null;`. Before scheduling a new timer (in either `loadDeletedLists` or `restoreOne`), `clearTimeout(errorTimer)` if non-null and reset to null. Also `clearTimeout(errorTimer)` at the top of `loadDeletedLists` and on a *successful* `restoreOne`. This mirrors the `pendingDelete.timerId` tracking in `items.svelte.ts` (and the equivalent decision in Task 1.1) — without it, two failed restores within 4 seconds clobber each other's error display.
- `fetchDeletedLists` wraps its internal `fetchDisplayNames` call in `try { … } catch { return new Map(); }` so a profiles-fetch failure degrades to `'Unknown'` for every row (R5 contract) without taking the load down. Symmetric with `fetchDeletedItems` in Task 1.1.
- **Manual mock at `web/src/lib/list/state/__mocks__/list-trash.svelte.ts`.** Task 2.2's screen tests will `vi.mock('$lib/list/state/list-trash.svelte')`; the manual-mock pattern (same reasoning as Task 1.1's mock file) is required so the `$state(...)` rune is preserved. Mirror `__mocks__/items.svelte.ts`: re-export the same `listTrash` `$state(...)` declaration as the real module plus `vi.fn()` stubs for `loadDeletedLists()` and `restoreOne(_listId)` returning `Promise.resolve()`.

**Reference:**
- `web/src/lib/item/model/item-trash.ts` from Task 1.1 (template).
- `web/src/lib/list/state/lists.svelte.ts` for the splice-on-failure-restore pattern.

**Files:**
- `web/src/lib/list/model/list-trash.ts` (create)
- `web/src/lib/list/model/list-trash.test.ts` (create)
- `web/src/lib/list/state/list-trash.svelte.ts` (create)
- `web/src/lib/list/state/__mocks__/list-trash.svelte.ts` (create — manual mock for Task 2.2's `vi.mock`; mirrors `__mocks__/items.svelte.ts`)

**Steps:**
1. RED — Create `web/src/lib/list/model/list-trash.test.ts` with cases: (a) `fetchDeletedLists` issues the expected URL, dedupes `deleted_by`, joins names; (b) `'Unknown'` fallback when a uid isn't in the names map; (c) `restoreList` issues `PATCH /lists?id=eq.<id>` with `{deleted_at: null}`. Mock `pgGet`, `pgPatch`, and `fetchDisplayNames`. Run `pnpm test list-trash` and confirm red.
2. GREEN — Create `web/src/lib/list/model/list-trash.ts` exporting `DeletedList`, `fetchDeletedLists`, `restoreList`. Re-run the test; confirm green.
3. GREEN — Create `web/src/lib/list/state/list-trash.svelte.ts` with the `listTrash` store, `loadDeletedLists`, `restoreOne` (including the tracked `errorTimer` per Decisions). Exercised by `DeletedListsScreen.test.ts` in Task 2.2; no standalone test.
4. GREEN — Create `web/src/lib/list/state/__mocks__/list-trash.svelte.ts`. Mirror the shape of `web/src/lib/item/state/__mocks__/items.svelte.ts`: re-export the same `listTrash` `$state(...)` declaration as the real module, and provide `vi.fn()` stubs for `loadDeletedLists()` and `restoreOne(_listId)` returning `Promise.resolve()`. Task 2.2's `DeletedListsScreen.test.ts` will rely on this file being present.
5. Run `pnpm lint` and fix findings without disabling rules.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 2.2 Build `DeletedListsScreen` component and `/settings/deleted-lists/` route

**Created:** 2026-05-27T08:27:35Z
**Completed:**

**Why:** The screen and route close out the trash UX layer. 0603 will wire the Settings Recovery nav row to this route's path; the file must exist now so `goto('/settings/deleted-lists')` passes `svelte-check` when 0603 lands. Visually mirrors `TrashScreen` adapted per R4 (different row content, no per-list scoping).

**Prerequisites:** Task 2.1 merged — `listTrash` store and helpers exist.

**Decisions:**
- Component path: `web/src/lib/list/components/DeletedListsScreen.svelte`. No props. On mount (`$effect`), call `listTrash.loadDeletedLists()`.
- Layout:
  - `TopBar`: title `"Deleted lists"`, no `sub`. Default `showBack={true}` → `history.back()` returns to Settings.
  - Below TopBar, no description block (the route's purpose is self-evident from the title; design has no equivalent description text for this screen).
  - Row container: `margin-top: 14px`.
  - Each row: `display: flex; align-items: center; gap: 12px; padding: 14px 18px;` plus `border-bottom: 1px solid var(--rule)` always and `border-top: 1px solid var(--rule)` on the first row only.
  - No leading icon (R4 — only the item trash has the `rotate-ccw` leading mark; the deleted-lists row is name + attribution).
  - Name: `font-size: 15px; font-weight: 600; color: var(--ink);`.
  - Attribution span: `font-size: 12px; color: var(--stone); margin-top: 2px;`. Text: `deleted by {row.deleted_by_name} · {timeAgo(row.deleted_at)}`.
  - Restore button: same outlined pill as item trash. `data-test="deleted-list-restore-{row.id}"`. Click: `() => void listTrash.restoreOne(row.id)`.
- Row-level `data-test="deleted-list-row-{row.id}"`.
- Empty state: `data-test="deleted-lists-empty"`, centred block with `<Icon name="trash-2" size={44} color="var(--stone-lt)" />` and the single line `No deleted lists.` — same shape as Task 1.2's empty state, which means **match `.empty-heading` exactly** (Newsreader serif, 22 px, `font-weight: 500`, `color: var(--ink)` — per R6). Do **not** override `font-weight` to 600.
- Loading state: `data-test="deleted-lists-loading"`, `Loading…`.
- Error region: `data-test="deleted-lists-error"`, `var(--ember)` text from `listTrash.error`.
- Route file `web/src/routes/(app)/settings/deleted-lists/+page.svelte`:
  ```svelte
  <script lang="ts">
    import DeletedListsScreen from '$lib/list/components/DeletedListsScreen.svelte';
  </script>

  <DeletedListsScreen />
  ```
  Mirrors `/settings/+page.svelte`'s shape.
- Mock: `web/src/lib/list/components/__mocks__/DeletedListsScreen.svelte` is `<div data-test="deleted-lists-screen-stub"></div>`.
- Route test: `web/src/routes/(app)/settings/deleted-lists/page.test.ts` (no `+`) — mocks the screen, asserts the stub renders.

**Reference:**
- `web/src/lib/item/components/TrashScreen.svelte` (Task 1.2 sibling) for the empty/loading/error block patterns. Adapt, don't copy wholesale — the row shapes differ.
- `web/src/routes/(app)/settings/+page.svelte` for the thin wrapper shape.
- `web/src/routes/(app)/settings/page.test.ts` for the route-test shape.
- `docs/quality.md` → "Filename conventions" for the no-`+` rule on colocated route tests.

**Files:**
- `web/src/lib/list/components/DeletedListsScreen.svelte` (create)
- `web/src/lib/list/components/DeletedListsScreen.test.ts` (create)
- `web/src/lib/list/components/__mocks__/DeletedListsScreen.svelte` (create)
- `web/src/routes/(app)/settings/deleted-lists/+page.svelte` (create)
- `web/src/routes/(app)/settings/deleted-lists/page.test.ts` (create)

**Steps:**
1. RED — Create `web/src/lib/list/components/DeletedListsScreen.test.ts` covering: (a) loading state; (b) rows render with `deleted-list-row-<id>` and include the `deleted by <name>` text + `timeAgo` output; (c) empty state shows `deleted-lists-empty` when rows is empty and loading is false; (d) clicking `deleted-list-restore-<id>` calls `listTrash.restoreOne`; (e) error path shows `deleted-lists-error`. Mock `$lib/list/state/list-trash.svelte` and `$lib/shared/components/TopBar.svelte` (or use the real TopBar — check what existing screen tests do; usually the real TopBar is fine for layout tests). Run `pnpm test DeletedListsScreen` and confirm red.
2. GREEN — Create `web/src/lib/list/components/DeletedListsScreen.svelte` per Decisions. Re-run; confirm green.
3. GREEN — Create the mock stub.
4. GREEN — Create the route file `web/src/routes/(app)/settings/deleted-lists/+page.svelte`. Make sure the directory `web/src/routes/(app)/settings/deleted-lists/` is created in the same step (the parent doesn't exist yet).
5. RED — Create `web/src/routes/(app)/settings/deleted-lists/page.test.ts` mocking the screen. Run and confirm red then green once the route wrapper exists.
6. Run `pnpm lint && pnpm check && pnpm test`. The full suite must be green; this also catches any cross-module type-issues from the new route's `$types`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test` · `./scripts/check.sh` (this is the merge-back gate before returning to `0600_soft_delete_ux` per the parent plan's task 2.1 Step 4) · open `http://localhost:5173/settings/deleted-lists` after `pnpm dev` and confirm rows render, Restore removes a row, back arrow returns to Settings (manual best-effort).
