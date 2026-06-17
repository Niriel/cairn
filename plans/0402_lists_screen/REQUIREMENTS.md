# Requirements: Lists screen

Step 4, sub-plan 2. The DB foundation, auth layer, Avatar component, and Settings
screen are in place. This sub-plan adds the Lists screen — the authenticated home —
replacing the placeholder `/+page.svelte` with a redirect to `/lists` and shipping
the create-list form backed by the existing `create_list` RPC.

## R1. Root page redirects to Lists

`/+page.svelte` must redirect authenticated users to `/lists` using
`goto('/lists', { replaceState: true })`. The root `+layout.svelte` already handles
unauthenticated redirects (signed-out → `/auth/login`), so this redirect fires only
for signed-in users.

## R2. `List` type and `createList` API helper

A `List` type and a `createList(name: string, description?: string): Promise<List>`
function live in `web/src/lib/list/model/list.ts`. `createList` posts to
`POST /rpc/create_list` with body `{ name, description: description ?? null }` and
returns the new `List` row. Thin wrapper over `pgPost` — no retry, no caching.

The SQL function's parameters must be named `name` and `description` (no `p_`
prefix) so PostgREST routes the JSON body fields to the correct parameters. PostgREST
v10+ matches RPC bodies by parameter name; a `p_name` / `p_description` mismatch
causes a schema-cache "function not found" error at runtime.

```typescript
export type List = {
	id: string;
	name: string;
	description: string | null;
	modified_at: string;
};
```

## R3. Reactive `lists` store

`web/src/lib/list/state/lists.svelte.ts` exports:

- `lists: { items: List[]; loading: boolean; error: string | null }` — module-level
  `$state` that auto-fetches `GET /lists?order=modified_at.desc` when the session
  becomes `signed-in` and resets to empty when `signed-out`.
- `refreshLists(): void` — increments a refresh signal that re-fires the fetch
  effect; called after creating or deleting a list.

## R4. Lists screen UI

A `ListsScreen.svelte` component at `web/src/lib/list/components/` renders:

- A `TopBar` with title "Lists" and no back arrow (`showBack={false}`).
- When `lists.loading` is true: a loading skeleton or spinner (not specified in
  detail; a `data-test="lists-loading"` element is sufficient).
- When `lists.items` is non-empty: a vertical list where each row shows the list
  name and an `Accordion` that expands the description inline. Tapping the list
  name navigates to `/(app)/lists/<id>` (placeholder for 0403 — the route does not
  need to exist yet). Each row carries `data-test="list-row-<id>"`.
- When `lists.items` is empty and not loading: an empty-state message
  `data-test="lists-empty"` with the copy "No lists yet."
- A `Fab` (`data-test="lists-fab"`) that opens the create-list sheet.
- A `CreateListSheet` wired to the fab.

## R5. Create-list sheet

A `CreateListSheet.svelte` component at `web/src/lib/list/components/` wraps
`Sheet`. Props:

```typescript
type Props = {
	open: boolean;
	onclose: () => void;
	oncreated: (list: List) => void;
};
```

The sheet body contains:

- A required text input for the list name (`data-test="create-list-name"`).
- An optional textarea for the description (`data-test="create-list-description"`).
- A `ButtonPair`: left "Cancel" (`data-test="create-list-cancel"`) calls `onclose`;
  right "Create" (`data-test="create-list-submit"`) submits the form.
- While submitting: the Create button is disabled (`data-test="create-list-submit"`
  has `disabled`); an inline error (`data-test="create-list-error"`) appears on
  failure.
- On success: calls `oncreated(newList)` and `onclose()`.

## R6. Lists route

A thin `/(app)/lists/+page.svelte` mounts `<ListsScreen />`. No logic in the route
file itself.

## Non-requirements (explicitly excluded)

- **`create_list` DB RPC** — already implemented in `db/migrations/0004_domain_schema.sql`
  with pgTAP coverage in `db/tests/rpc_create_list.sql`. No DB work in this plan.
- **`/(app)/+layout.svelte` auth guard change** — the root `+layout.svelte` already
  handles auth gating for all routes. The `/(app)/` passthrough is correct as-is
  and requires no changes.
- **Navigation to items screen** — the "tap list name → navigate to items" row in R4
  produces a `goto('/lists/<id>')` call at runtime; the route `/(app)/lists/[list_id]/`
  does not exist until 0403. The call is safe because SvelteKit's `goto` accepts any
  string at runtime; the route 404s until 0403 lands, which is acceptable for
  pre-alpha dogfooding.
- **List rename / delete / trash** — deferred to step 6.
- **Accordion description for lists without descriptions** — a list with
  `description = null` shows no Accordion; the name is the only content in the row.
- **Playwright e2e touch** — a full end-to-end flow (sign in → lists → create →
  navigate) is part of task 4.1 in `plans/0400_mvp_product/TASKS.md`. This plan
  covers Vitest only.
