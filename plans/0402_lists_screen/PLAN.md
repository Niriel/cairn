# Plan: Lists screen

The DB foundation, auth layer, Avatar component, and Settings screen are all in
place. The `create_list` RPC already exists in `db/migrations/0004_domain_schema.sql`
with pgTAP coverage — no DB work is needed here. This plan builds the Lists screen
(the authenticated home) and replaces the placeholder `/+page.svelte` with a
redirect to `/lists`.

## Context

`/(app)/+layout.svelte` is currently a passthrough `{@render children()}`. All auth
gating lives in the root `+layout.svelte`, which already redirects signed-out users
to `/auth/login` and redirects signed-in users away from `/auth/login` and
`/auth/check` back to `/`. Because the root layout handles all routes (not just
`/(app)/`), the route group's layout needs no auth changes here; R4 of the 0400
parent plan is satisfied by the root layout that shipped in step 3.

`/+page.svelte` currently renders a placeholder "Signed in. Lists land in step 4."
message. After this plan, it becomes a redirect to `/lists`.

The `create_list` RPC (`POST /rpc/create_list`) is already tested and live. The web
layer only needs a thin API helper (`createList`) and a reactive store (`lists`).

## Decisions

**No changes to `/(app)/+layout.svelte`.** The root layout guards all routes. Adding
a second auth guard in the `(app)` layout would create two-path logic with no
benefit: the root layout already covers the signed-out case, and the `(app)` layout
adds nothing. If a future plan adds per-app-screen chrome (a bottom nav, a header
with the user avatar), that work belongs to a separate layout task at that time.

**Module-level `lists` store (mirrors `profile.svelte.ts`).** Rather than
component-internal fetch state, `lists.svelte.ts` exports a module-level `$state`
with an auto-fetching `$effect.root`. This lets `CreateListSheet`'s `oncreated`
callback trigger `refreshLists()` without lifting state to the route, and makes the
store available to 0403's items screen for breadcrumb or "back to list" rendering
without re-fetching. The profile store (`shared/state/profile.svelte.ts`) uses the
same shape — `$effect.root` watching `session.current` — so this pattern is already
established in the codebase. `refreshLists()` increments a reactive counter that
the fetch effect depends on, giving callers an explicit refresh handle.

**`createList` as a plain async function in `model/list.ts`, not in the store.**
The API call is a pure async side effect, not reactive state. Keeping it in the
model layer (not the store) lets tests mock the HTTP via MSW without touching the
store, and keeps the store focused on derived reactive shape.

**`ListsScreen` + `CreateListSheet` in `lib/list/components/`.** Follows the Settings
pattern (`lib/settings/components/SettingsScreen.svelte` mounted by a thin
`/(app)/settings/+page.svelte`). The components carry the full Vitest coverage; the
route file is a one-liner with a minimal smoke test.

**Root-page redirect via `goto` in `onMount`.** `/+page.svelte` calls
`goto('/lists', { replaceState: true })` on mount. The root layout prevents
unauthenticated users from reaching the page at all (they are redirected to
`/auth/login`), so the redirect fires only for signed-in users. A two-hop sign-in
path (`/auth/login` → `/` → `/lists`) is acceptable for pre-alpha; a follow-up can
collapse it by updating `SIGNED_IN_REDIRECT_PATHS` in `auth-paths.ts` when it
becomes noticeable.

**MSW handlers added to `handlers.ts` alongside their first consumer.** `POST
/api/rpc/create_list` is added in task 2.1 (the `createList` model test needs it).
`GET /api/lists` is added in task 2.2 (the `lists` store test needs it). Both join
the default set so they are available to all downstream component tests without
per-test `server.use(...)` boilerplate.

## Architecture

### New files

- **`web/src/lib/list/model/list.ts`** — `List` type + `createList()` PostgREST helper.
- **`web/src/lib/list/model/list.test.ts`** — Vitest test for `createList`.
- **`web/src/lib/list/state/lists.svelte.ts`** — reactive `lists` store + `refreshLists()`.
- **`web/src/lib/list/state/lists.test.ts`** — Vitest test for the store (auto-fetch, reset, refresh).
- **`web/src/lib/list/state/__mocks__/lists.svelte.ts`** — automock used by `ListsScreen.test.ts`.
- **`web/src/lib/list/components/CreateListSheet.svelte`** — sheet with name + description form.
- **`web/src/lib/list/components/CreateListSheet.test.ts`** — Vitest test.
- **`web/src/lib/list/components/__mocks__/CreateListSheet.svelte`** — automock used by `ListsScreen.test.ts`.
- **`web/src/lib/list/components/ListsScreen.svelte`** — Lists overview component.
- **`web/src/lib/list/components/ListsScreen.test.ts`** — Vitest test.
- **`web/src/lib/list/components/__mocks__/ListsScreen.svelte`** — automock used by `/(app)/lists/page.test.ts`.
- **`web/src/routes/(app)/lists/+page.svelte`** — thin mount: `<ListsScreen />`.
- **`web/src/routes/(app)/lists/page.test.ts`** — smoke: renders without throwing.

### Modified files

- **`web/src/routes/+page.svelte`** — replaced with `goto('/lists', { replaceState: true })` on mount.
- **`web/src/routes/page.test.ts`** — updated to assert the redirect fires.
- **`web/src/lib/test/handlers.ts`** — add `POST /api/rpc/create_list` (task 2.1) and `GET /api/lists` (task 2.2).

### Data flow

```
session (signed-in)
  └─► $effect in lists.svelte.ts
        └─► GET /lists?order=modified_at.desc
              └─► lists.items = [...] (reactive)
                    └─► ListsScreen renders rows

Fab click
  └─► createSheetOpen = true
        └─► CreateListSheet opens
              └─► Submit: createList(name, desc)
                    └─► POST /rpc/create_list
                          └─► oncreated(newList)
                                └─► refreshLists() + onclose()
```

## Phase structure

1. **Phase 1 — Root redirect.** Update `/+page.svelte` to call
   `goto('/lists', { replaceState: true })` in `onMount`, replacing the placeholder
   paragraph. Update `page.test.ts` to assert `goto` is called (RED first, then
   GREEN). See tasks 1.1.

2. **Phase 2 — List domain model and state.** Task 2.1 creates `list/model/list.ts`
   with the `List` type and `createList()` helper, tests it against the `POST
/rpc/create_list` MSW handler (added to `handlers.ts` in the same task). Task 2.2
   creates `lists.svelte.ts` with the auto-fetch store and `refreshLists()`, tests
   it (auto-fetch on sign-in, reset on sign-out, re-fetch on refresh signal), adds
   the `GET /api/lists` MSW handler, and ships the `__mocks__/lists.svelte.ts`
   automock for downstream component tests.

3. **Phase 3 — Lists screen UI.** Task 3.1 creates `CreateListSheet.svelte` (Sheet
   - form + ButtonPair), tests form submission success and failure, and ships
     `__mocks__/CreateListSheet.svelte`. Task 3.2 creates `ListsScreen.svelte` (TopBar
   - list rows with Accordion + Fab + empty state + CreateListSheet), tests the four
     main cases (loading, populated, empty, create-opens-sheet), and ships
     `__mocks__/ListsScreen.svelte`. Task 3.3 creates the thin `/(app)/lists/+page.svelte`
     and its smoke test.

TDD order: each task writes RED tests first, GREEN implementation second. Cross-task:
2.2's `__mocks__/lists.svelte.ts` and 3.1's `__mocks__/CreateListSheet.svelte` must
both land before 3.2's `ListsScreen.test.ts` can run without unhandled-request
errors or missing-mock failures.

## Phase 4 — Fix `create_list` parameter names (bugfix)

After all Phase 1–3 tasks landed, creating a list from the UI produced PostgREST
error "Could not find the function public.create_list(description, name) in the
schema cache." Root cause: the SQL function was written with `p_name` /
`p_description` parameters, but the frontend sends `{ name, description }` (per R2).
PostgREST v10+ matches RPC bodies by parameter name, so the mismatch is fatal.

The fix is to rename the two parameters in `db/migrations/0004_domain_schema.sql`
from `p_name` / `p_description` to `name` / `description` and update the two
references in the function body. The migration uses `CREATE OR REPLACE FUNCTION`,
so re-running it (or resetting the dev DB) is enough to apply the change. No
pgTAP tests need updating — `rpc_create_list.sql` calls the function with
positional arguments.

## Reference docs and skills

- **`docs/data-model.md`** — `lists` table schema, RLS, `create_list` RPC signature, PostgREST endpoints.
- **`docs/frontend-layout.md`** — `list/` domain placement, filename conventions (`+`-drop rule for route tests).
- **`.claude/skills/writing-tests.md`** — `data-test`, `__mocks__`, MSW, `vi.resetModules()` for store tests.
