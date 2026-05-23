# Tasks

## Reference skills and docs

- **`.claude/skills/writing-tests.md`** — `data-test` queries, `__mocks__/` automock
  convention, `vi.resetModules()` for store tests, MSW at the network layer, no
  shared `beforeEach` for mock state.
- **`docs/frontend-layout.md`** — `list/` domain placement; route-adjacent tests
  drop the `+` prefix (`page.test.ts`, not `+page.test.ts`).
- **`docs/data-model.md`** — `lists` table fields, `create_list` RPC signature
  `(name text, description text DEFAULT NULL)` returning a `lists` row.

---

## Phase 1 — Root redirect

### [x] 1.1 Redirect `/+page.svelte` to `/lists`

**Created:** 2026-05-23T09:23:49Z
**Completed:** 2026-05-23T10:03:29Z

**Why:** The placeholder home page currently renders a static paragraph. After this
task it becomes a redirect to `/lists`, which is the authenticated home added by
this plan.

**Prerequisites:** None — this is a purely self-contained change to two existing
files.

**Decisions:**
- Use `goto('/lists', { replaceState: true })` inside `onMount`. The root layout
  already guards unauthenticated users (redirects them to `/auth/login`), so this
  redirect only fires for signed-in users. `replaceState: true` prevents the blank
  `/` from appearing in the browser history between the auth callback and the lists
  page.
- The old placeholder imports (`CairnWordmark`, `resolve`) are removed entirely —
  the page has no rendered content.
- Test: mock `$app/navigation` (provides `goto`) and assert `goto` is called with
  `'/lists'` and `{ replaceState: true }` after mount. The existing test
  `page.test.ts` already exists and just asserts "renders without throwing"; that
  test is replaced with the redirect assertion.

**Files:**
- `web/src/routes/+page.svelte` (modify)
- `web/src/routes/page.test.ts` (modify)

**Steps:**
1. RED — In `web/src/routes/page.test.ts`, replace the existing smoke test with:
   - Import `{ goto }` from `$app/navigation` and mock the module.
   - Test `(a) redirects to /lists on mount`: render `Page`, `await tick()`, assert
     `vi.mocked(goto)` was called with `'/lists'` and `{ replaceState: true }`.
   - Run `pnpm test` from `web/` and confirm the new test fails (current page does
     not call `goto`).
2. GREEN — Rewrite `web/src/routes/+page.svelte` to a minimal `<script>` block:
   `import { onMount } from 'svelte'; import { goto } from '$app/navigation';`
   with `onMount(() => { goto('/lists', { replaceState: true }); })`. Remove all
   old content (wordmark, paragraph, sign-out link).
   The `/(app)/lists/+page.svelte` route does not exist until task 3.3, so
   `resolve('/lists')` fails type-check and `svelte/no-navigation-without-resolve`
   rejects the bare string. Use the quality.md workaround: bare string with a
   per-line disable comment that names the follow-up:
   ```svelte
   // eslint-disable-next-line svelte/no-navigation-without-resolve
   goto('/lists', { replaceState: true }); // swap to resolve('/lists') in task 3.3
   ```
   When task 3.3 creates the route, remove the disable line and switch to
   `goto(resolve('/lists'), { replaceState: true })`.
3. GREEN — Re-run `pnpm test` and confirm green.

**Verify:** `pnpm test` (from `web/`) · `pnpm check`

---

## Phase 2 — List domain model and state

### [x] 2.1 Create `list/model/list.ts` and `createList` helper

**Created:** 2026-05-23T09:23:49Z
**Completed:** 2026-05-23T10:34:57Z

**Why:** The Lists screen and the create-list sheet both need a typed `List` value
and a function to call `POST /rpc/create_list`. Centralising them in the model
layer keeps the PostgREST wire format in one place.

**Prerequisites:** None.

**Decisions:**
- `List` type: `{ id: string; name: string; description: string | null; modified_at: string }`.
  `modified_at` is the ISO 8601 string PostgREST returns for `timestamptz`.
- `createList(name: string, description?: string): Promise<List>` calls
  `pgPost<List>('/rpc/create_list', { name, description: description ?? null })`.
  No retry or caching — callers handle errors.
- MSW handler added to `web/src/lib/test/handlers.ts`: `http.post('*/api/rpc/create_list', ...)`
  returning a canned List row `{ id: 'aaaaaaaa-...', name: 'Test list', description: null, modified_at: '...' }`.
  Default response is 200 (PostgREST RPCs always return 200, not 201); per-test
  failures use `server.use(...)` overrides.

**Reference:** `docs/data-model.md` "What the app sees" → `/rpc/create_list` for
the exact RPC signature and return shape.

**Files:**
- `web/src/lib/list/model/list.ts` (create)
- `web/src/lib/list/model/list.test.ts` (create)
- `web/src/lib/test/handlers.ts` (modify — add `POST /api/rpc/create_list`)

**Steps:**
1. RED — Create `web/src/lib/list/model/list.test.ts` with:
   - Import `{ createList }` and the `List` type from `./list`.
   - Import `{ server }` from `$lib/test/server`.
   - Test `(a) createList calls POST /rpc/create_list and returns List row`: call
     `createList('My list')`, await it, assert the returned object has `name: 'My list'`
     and an `id` string. Use the default MSW handler for the response.
   - Test `(b) createList passes description when provided`: call
     `createList('My list', 'Details')`, assert success.
   - Run `pnpm test` from `web/` — tests fail because neither the module nor the
     MSW handler exist yet.
2. GREEN — Create `web/src/lib/list/model/list.ts` with the `List` type and
   `createList` function.
3. GREEN — In `web/src/lib/test/handlers.ts`, add the `POST */api/rpc/create_list`
   handler returning a valid List row.
4. GREEN — Re-run `pnpm test` — confirm green.

**Verify:** `pnpm test` · `pnpm check`

### [x] 2.2 Create `list/state/lists.svelte.ts` and reactive store

**Created:** 2026-05-23T09:23:49Z
**Completed:** 2026-05-23T10:39:13Z

**Why:** The Lists screen and the create-list flow need a shared reactive source of
truth for the user's lists. A module-level store (matching the `profile.svelte.ts`
shape) auto-fetches on sign-in and exposes `refreshLists()` for post-create updates.

**Prerequisites:** Task 2.1 — `List` type exists in `list/model/list.ts`.

**Decisions:**
- `lists = $state<{ items: List[]; loading: boolean; error: string | null }>({ items: [], loading: false, error: null })`
  exported at module level.
- `let refreshSignal = $state(0)` at module level; `refreshLists()` increments it.
  The `$effect` inside `$effect.root()` reads `refreshSignal` to track it, so
  calling `refreshLists()` re-fires the fetch independently of a session change.
- `$effect.root(() => { $effect(() => { refreshSignal; const s = session.current; ... }) })`
  — the bare `refreshSignal;` read registers the dependency.
- On `signed-in`: set `lists.loading = true`, call `pgGet<List[]>('/lists?order=modified_at.desc')`,
  then write `lists.items` and clear `lists.loading`. Errors write `lists.error`.
- On `signed-out` or `unknown`: reset `lists` to empty, no loading.
- MSW handler added to `handlers.ts`: `http.get('*/api/lists', ...)` returning `[]`
  by default (no lists). Tests override with `server.use(...)` to supply fixtures.
- `__mocks__/lists.svelte.ts` ships alongside the real module for automock:
  exports `lists = $state({ items: [], loading: false, error: null })` and
  `refreshLists = vi.fn()` (with `import { vi } from 'vitest'`).
- Tests use `vi.resetModules()` + re-import (same as `profile.test.ts`) to ensure
  `$effect.root` fires cleanly for each test.

**Reference:** `.claude/skills/writing-tests.md` "Store tests that trigger async
fetches" — `await tick()` then `vi.waitFor(...)` pattern.

**Files:**
- `web/src/lib/list/state/lists.svelte.ts` (create)
- `web/src/lib/list/state/lists.test.ts` (create)
- `web/src/lib/list/state/__mocks__/lists.svelte.ts` (create)
- `web/src/lib/test/handlers.ts` (modify — add `GET /api/lists`)

**Steps:**
1. RED — Create `web/src/lib/list/state/lists.test.ts` using the `vi.resetModules()`
   pattern from `profile.test.ts`. Mock `$lib/shared/state/session.svelte`.
   Re-import `session` and `lists`/`refreshLists` fresh in each `beforeEach`.
   Tests:
   - `(a) signed-in → fetches and populates lists.items`: use `server.use(...)` to
     return one list row; `setSignedIn(...)`, `await tick()`, `vi.waitFor` asserting
     `listsMod.lists.items.length === 1`.
   - `(b) signed-out → resets lists.items to []`: sign in, wait for data, then
     `signOut()`, `await tick()`, assert `lists.items` is empty.
   - `(c) refreshLists() re-triggers fetch`: sign in, wait for initial fetch, add a
     second row via `server.use(...)`, call `refreshLists()`, `await tick()`,
     `vi.waitFor` asserting `lists.items.length === 2`.
   - `(d) error response → sets lists.error`: override handler with a 500 response;
     sign in, `vi.waitFor` asserting `lists.error` is truthy.
   Run `pnpm test` — tests fail.
2. GREEN — Create `web/src/lib/list/state/lists.svelte.ts` with the store
   implementation per Decisions above.
3. GREEN — In `web/src/lib/test/handlers.ts`, add the `GET */api/lists` handler
   returning `[]` by default.
4. GREEN — Create `web/src/lib/list/state/__mocks__/lists.svelte.ts` with the
   `$state`-based mock and `vi.fn()` refresh.
5. GREEN — Re-run `pnpm test` — confirm green.

**Verify:** `pnpm test` · `pnpm check`

---

## Phase 3 — Lists screen UI

### [ ] 3.1 Create `CreateListSheet.svelte`

**Created:** 2026-05-23T09:23:49Z
**Completed:**

**Why:** The create-list form is the primary action on the Lists screen. Extracting
it into its own component keeps `ListsScreen.svelte` focused on layout and lets the
sheet be tested in isolation.

**Prerequisites:** Task 2.1 (`createList` helper), task 2.2 (MSW handler for
`POST /rpc/create_list` added in 2.1 step 3, `GET /api/lists` handler in 2.2).

**Decisions:**
- Props: `open: boolean`, `onclose: () => void`, `oncreated: (list: List) => void`.
- Renders a `Sheet` with `open` and `onclose` wired through. Sheet body: a `<form>`
  with a text input (`data-test="create-list-name"`, required), a textarea
  (`data-test="create-list-description"`, optional), a `ButtonPair` with left =
  Cancel (`data-test="create-list-cancel"`) and right = Create
  (`data-test="create-list-submit"`), and an error paragraph
  (`data-test="create-list-error"`) shown only on failure.
- On form submit: set `submitting = true`, call `createList(name, description)`.
  On success: call `oncreated(result)` then `onclose()`. On failure: set
  `error = err.message`. Always clear `submitting` in `finally`.
- The Create button has `disabled={submitting}`.
- Test mocks `Sheet` (via `vi.mock('$lib/basic/components/Sheet.svelte')`), so
  the sheet renders its children unconditionally in tests — no need to pass `open`.
  Actually: mock Sheet so it always renders children; set `open={true}` in the
  render call to keep the logic honest.
- `__mocks__/CreateListSheet.svelte` ships alongside: a stub that renders
  `<div data-test="create-list-sheet-stub"></div>` for use by `ListsScreen.test.ts`.
- Tests mock `Sheet` and `ButtonPair` with `vi.mock(...)`. `createList` is tested
  at the MSW level (no spy on `createList` itself).

**Reference:** `web/src/lib/basic/components/Sheet.svelte` for the `open`/`onclose`/
`children` prop shape; `web/src/lib/shared/components/ButtonPair.svelte` for the
`left`/`right` snippet prop shape.

**Files:**
- `web/src/lib/list/components/CreateListSheet.svelte` (create)
- `web/src/lib/list/components/CreateListSheet.test.ts` (create)
- `web/src/lib/list/components/__mocks__/CreateListSheet.svelte` (create)
- `web/src/lib/shared/components/__mocks__/ButtonPair.svelte` (create — no automock
  exists; `vi.mock(...)` without a factory requires this file to render the
  `left`/`right` snippets)

**Steps:**
1. RED — Create `web/src/lib/list/components/CreateListSheet.test.ts`. Mock `Sheet`
   and `ButtonPair` with `vi.mock(...)`. Tests:
   - `(a) renders name input and description textarea`: render with `open={true}`,
     assert `queryByDataTest('create-list-name')` and
     `queryByDataTest('create-list-description')` are not null.
   - `(b) cancel button calls onclose`: `fireEvent.click(getByDataTest('create-list-cancel'))`,
     assert the `onclose` spy was called.
   - `(c) submit calls createList and fires oncreated`: fill in the name input,
     `fireEvent.submit` the form, `await vi.waitFor` asserting `oncreated` spy
     called with a List object.
   - `(d) submit failure shows error message`: override the MSW handler with a 500,
     fill and submit, `await vi.waitFor` asserting `queryByDataTest('create-list-error')`
     not null.
   - `(e) create button is disabled while submitting`: verify the button has
     `disabled` attribute between the submit and the MSW response (use a delayed
     MSW handler).
   Run `pnpm test` — tests fail.
2. GREEN — Create `web/src/lib/list/components/CreateListSheet.svelte` per
   Decisions.
3. GREEN — Create `web/src/lib/shared/components/__mocks__/ButtonPair.svelte`.
   It must render both snippets so the Cancel and Create buttons are reachable
   in the test DOM:
   ```svelte
   <script lang="ts">
     import type { Snippet } from 'svelte';
     let { left, right }: { left: Snippet; right: Snippet } = $props();
   </script>
   {@render left()}
   {@render right()}
   ```
4. GREEN — Create `web/src/lib/list/components/__mocks__/CreateListSheet.svelte`
   as a stub that renders `<div data-test="create-list-sheet-stub"></div>` (used
   by `ListsScreen.test.ts` to detect the sheet is mounted).
5. GREEN — Re-run `pnpm test` — confirm green.

**Verify:** `pnpm test` · `pnpm check`

### [ ] 3.2 Create `ListsScreen.svelte`

**Created:** 2026-05-23T09:23:49Z
**Completed:**

**Why:** The Lists screen is the product's authenticated home. All authenticated
flows start here.

**Prerequisites:** Task 2.2 (`lists` store + mock), task 3.1 (`CreateListSheet`
component + mock).

**Decisions:**
- Imports: `lists`, `refreshLists` from `$lib/list/state/lists.svelte`;
  `CreateListSheet` from `./CreateListSheet`; `TopBar` from
  `$lib/shared/components/TopBar`; `Accordion` from
  `$lib/shared/components/Accordion`; `Fab` from `$lib/basic/components/Fab`.
- Local state: `let createSheetOpen = $state(false)`. For Accordion expanded
  tracking: `let expandedId: string | null = $state(null)` (one-at-a-time; a
  second tap on a different row collapses the first automatically).
- `oncreated` handler: call `refreshLists()` — the store re-fetches; the sheet
  calls `onclose()` after `oncreated()` so `createSheetOpen` is already false when
  the re-fetch lands.
- List row: each `lists.items` entry renders in a `<li data-test="list-row-{item.id}">`.
  If `item.description` is non-null, wrap in an `<Accordion>` that shows the full
  description when open. Pass `expanded={expandedId === item.id}`,
  `onexpand={() => { expandedId = item.id }}`, `oncollapse={() => { expandedId = null }}`,
  `pushesHistory={true}`. The list name is a `<button>` (or anchor) that calls
  `goto('/lists/' + item.id)` on click.
- `data-test` attributes: `lists-loading` (skeleton div), `lists-empty` (empty
  state paragraph), `lists-fab` (on Fab), `list-row-{id}` (per row).
- Tests mock `TopBar`, `Accordion`, `Fab`, `CreateListSheet`, `lists.svelte.ts`,
  and `$app/navigation`. The `__mocks__/Accordion.svelte` and `__mocks__/TopBar.svelte`
  and `__mocks__/Fab.svelte` already exist in the codebase.
- `__mocks__/ListsScreen.svelte` ships alongside: renders
  `<div data-test="lists-screen-stub"></div>`.

**Reference:** `.claude/skills/writing-tests.md` "No shared beforeEach for mock
state" — each test sets `lists.items = [...]` inline.

**Files:**
- `web/src/lib/list/components/ListsScreen.svelte` (create)
- `web/src/lib/list/components/ListsScreen.test.ts` (create)
- `web/src/lib/list/components/__mocks__/ListsScreen.svelte` (create)

**Steps:**
1. RED — Create `web/src/lib/list/components/ListsScreen.test.ts`. Mock `TopBar`,
   `Accordion`, `Fab`, `CreateListSheet` (all via `vi.mock(...)`), `$lib/list/state/lists.svelte`,
   and `$app/navigation`. `afterEach`: `vi.clearAllMocks(); lists.items = [];
   lists.loading = false; lists.error = null`.
   Tests:
   - `(a) shows loading indicator when lists.loading is true`: set
     `lists.loading = true`, render, assert `queryByDataTest('lists-loading')` not null.
   - `(b) shows empty state when items is empty and not loading`: render with
     `lists.items = []` and `lists.loading = false`, assert
     `queryByDataTest('lists-empty')` not null.
   - `(c) renders one row per list item`: set `lists.items` to two fixtures; render;
     assert both `queryByDataTest('list-row-<id1>')` and `queryByDataTest('list-row-<id2>')`
     not null.
   - `(d) clicking Fab opens CreateListSheet`: render, click `data-test="lists-fab"`,
     assert `queryByDataTest('create-list-sheet-stub')` is now not null (or visible).
     Note: since `CreateListSheet` is mocked as the stub, this checks the `open`
     prop change. Use `await tick()` after click.
   - `(e) navigate to list on row click`: set `lists.items` to one fixture, render,
     click the row's navigate button (`data-test="list-nav-<id>"`), assert
     `vi.mocked(goto)` called with `'/lists/' + id`.
   Run `pnpm test` — tests fail.
2. GREEN — Create `web/src/lib/list/components/ListsScreen.svelte` per Decisions.
   Add `data-test="list-nav-{item.id}"` to the name button/anchor.
3. GREEN — Create `web/src/lib/list/components/__mocks__/ListsScreen.svelte` stub.
4. GREEN — Re-run `pnpm test` — confirm green.

**Verify:** `pnpm test` · `pnpm check`

### [ ] 3.3 Create `/(app)/lists/+page.svelte` route

**Created:** 2026-05-23T09:23:49Z
**Completed:**

**Why:** Wires the `ListsScreen` component into the SvelteKit route tree at
`/(app)/lists/`. This is the authenticated home the root page now redirects to.

**Prerequisites:** Task 3.2 (`ListsScreen` component + mock).

**Decisions:**
- `+page.svelte` is a one-liner: `<script>import ListsScreen from '$lib/list/components/ListsScreen.svelte';</script><ListsScreen />`.
- `page.test.ts` (no `+` prefix — SvelteKit manifest rule) mocks `ListsScreen` with
  `vi.mock(...)` and asserts the stub renders. This is a smoke test, not a
  feature test — all features are tested in `ListsScreen.test.ts`.

**Files:**
- `web/src/routes/(app)/lists/+page.svelte` (create)
- `web/src/routes/(app)/lists/page.test.ts` (create)

**Steps:**
1. RED — Create `web/src/routes/(app)/lists/page.test.ts`. Mock `ListsScreen`.
   Test: `(a) renders without throwing`: render `Page`, assert
   `queryByDataTest('lists-screen-stub')` is not null.
   Run `pnpm test` — fails because `+page.svelte` doesn't exist.
2. GREEN — Create `web/src/routes/(app)/lists/+page.svelte`.
3. GREEN — Re-run `pnpm test` — confirm green.

**Verify:** `pnpm test` · `pnpm check` · `pnpm lint`
