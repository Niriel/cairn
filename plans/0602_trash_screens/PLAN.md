# Plan: Trash recovery screens

Sub-plan 0602, the middle slice of step 6 (soft-delete UX). Builds the
per-list **item trash** screen (filling in the route stub 0601 left behind)
and the account-level **deleted lists** screen, both read-only views over the
existing `items_deleted` / `lists_deleted` Postgres views with a single
**Restore** action per row.

## Context

After 0601 the integration branch `0600_soft_delete_ux` has:

- `ListOverflowSheet.svelte`, reachable from the per-row `⋮` on
  `ListsScreen` and the existing TopBar `⋮` on `ItemsScreen`. Tapping
  **View trash** navigates to `/(app)/lists/<id>/trash/` via `goto()`.
- A minimal empty stub at `web/src/routes/(app)/lists/[list_id]/trash/
  +page.svelte` (`<div>Trash</div>`), put there so 0601's
  `goto('/lists/<id>/trash')` would pass `svelte-check`. It needs filling
  in.
- A unified `UndoSnackbar` component already used by both item-delete
  (since step 4) and list-delete (since 0601). The trash screens do
  **not** use it — restore is snackbar-less per R3/R4.

The DB views are already in place from step 1:
`db/migrations/0004_domain_schema.sql:810` (`items_deleted`) and `:831`
(`lists_deleted`). Both run `security_invoker = FALSE` and gate access via
`public.is_list_member()` — exactly the asymmetry that lets a current
member see a soft-deleted row's contents while a former member sees
nothing. The web client reads them via plain `GET /items_deleted` and `GET
/lists_deleted`; RLS does the rest. Restoring is a `PATCH /items` (or
`/lists`) with `{deleted_at: null}` — the existing item-restore path
(`restoreItem` in `lib/item/model/item.ts`) is the template; an
equivalent for lists doesn't exist yet and is added here.

Settings (0603) needs the deleted-lists route to *exist* before its
Recovery section can `goto()` it without `svelte-check` failing — the same
toolchain-coupling reason 0601 created the trash route stub. 0602 lands
both routes, so 0603 just adds the nav row.

## Decisions

**Two routes, two screen components, model + state per domain.** The two
trash screens are different enough that sharing a single generic
`<TrashScreen>` would cost more in conditional branching than it saves.
They both have an outer chrome of `TopBar` + description + row list + empty
state, but the row shape, the data source, and the back-target differ.
Following the established `web/src/lib/<domain>/components/<Screen>.svelte`
+ `<domain>/state/<store>.svelte.ts` + `<domain>/model/<types>.ts` layout
keeps tests per-domain and obeys `docs/frontend-layout.md` — the item
trash lives under `item/`, the deleted-lists trash lives under `list/`.
Sibling-domain imports are kept zero.

**Client-side batched `display_name` lookup, not PostgREST embedding (R5).**
Migration 0006 added `profiles` FKs only for `items.created_by`,
`items.modified_by`, and `votes.user_id`. `items.deleted_by`,
`lists.created_by`, and `lists.deleted_by` still FK to `auth.users(id)`
only. PostgREST auto-embedding requires an FK target in the exposed
(`public`) schema — silently returns null for FKs into `auth`. Two ways
out: (a) add a 0008 migration mirroring 0006 for `deleted_by`, or
(b) batch-fetch `profiles?id=in.(…)` after the trash fetch. Picking (b)
because the cost is one extra round-trip per page load (negligible at v1
volumes), the surface area is zero (no schema changes, no new RLS, no
pgTAP), and the parent plan's task 2.1 Decisions already chose this path.
A shared helper `fetchDisplayNames(uids)` in `lib/shared/model/profile-names.ts`
is consumed by both screens.

**Module-local cache, not a global store.** The `display_name` map is
scoped to the screen's `$effect` lifetime — a fresh page visit re-fetches.
A global cache would need invalidation on display-name change (Settings →
Profile) and we don't have a signal for that. The duplicated network call
on each open is the cheaper path.

**Restore is snackbar-less; failure shows an inline error.** Restore is
the inverse of a deliberate trash action — the user is on a screen called
"Trash" and tapping **Restore** is unambiguous, so a success snackbar
would be visual noise. Failure is rare but real (network blip, RLS
mismatch if membership changed mid-session); surface that path with a
brief inline error region modeled on the `items.error` field in
`items.svelte.ts`. The state shape mirrors `items.svelte.ts`: `{ rows,
loading, error, displayNames }`.

**TrashScreen fetches the list name in parallel with the trash rows.**
The TopBar `sub` shows the parent list's name. Two ways: (a) embed it in
the `items_deleted` query via `&select=*,list_name:lists(name)` — but
that crosses a schema/view boundary PostgREST can be flaky on; (b) issue
a separate `GET /lists?id=eq.<uuid>&select=name`. Picking (b) — simpler,
and the two requests fire in parallel via **`Promise.allSettled`** so a
list-name failure doesn't cancel the trash fetch (R5's "still loads"
guarantee, see Task 1.1). Note we **do not** copy `profile.svelte.ts`'s
single-object accept header here: that endpoint queries the caller's own
uid (which always exists), but the trash screen can hit a stale
`list_id`, and the single-object form throws HTTP 406 (`PGRST116`) on
zero rows. Use the default array form and read `rows[0]?.name ?? null`.
If the list fetch fails or returns no row the screen still renders with
`sub` empty.

**`refreshLists()` is *not* called on list restore.** When a user restores
a list from the deleted-lists screen, the row disappears from that screen.
The restored list will reappear on the Lists screen on its next
`loadLists()` (next visit, next refresh signal). Wiring
`refreshLists()` from inside the deleted-lists screen would couple
account trash to list state for no user-visible gain in this slice — the
user navigates back to Settings, then either to Lists (which reloads on
mount via the `refreshSignal` `$effect`) or elsewhere. Crossing the
domain boundary deliberately stays off.

**No e2e tests in this sub-plan.** Playwright cannot run on this
development machine (standing project memory). The parent plan's Phase 4
(`./scripts/check.sh --e2e` on `0600_soft_delete_ux`) is where the
trash/restore flows get their cross-stack coverage. Vitest screen tests
here cover row rendering, restore action, error path, and empty state.

**Toolchain coupling check.** Both routes are *created* in this sub-plan,
so the only outbound `goto()` from this code is within these two routes
(neither goes elsewhere new). Inbound:
- 0601 already `goto`s `/lists/<id>/trash` — the route file exists (stub),
  so filling it in won't break the type checker.
- 0603 will `goto` `/settings/deleted-lists` — the file lands here in
  Phase 2, so 0603 type-checks without a workaround. This is the
  toolchain reason 0602 owns the deleted-lists route even though 0603
  owns the Settings nav row.

## Architecture

### New files

- **`web/src/lib/shared/model/profile-names.ts`** — `fetchDisplayNames
  (uids: string[]): Promise<Map<string, string>>` batched lookup helper.
  Empty-input fast path returns an empty map without a network call.
- **`web/src/lib/shared/model/profile-names.test.ts`** — Vitest unit
  tests for the helper (empty input, dedupe, fetch failure → throws,
  tombstone UID handled).
- **`web/src/lib/item/model/item-trash.ts`** — `DeletedItem` type and
  `fetchDeletedItems(listId)` function. Re-uses `restoreItem` from
  `item.ts`.
- **`web/src/lib/item/state/item-trash.svelte.ts`** — `itemTrash` rune
  store: `{ rows: DeletedItem[]; loading: boolean; error: string | null;
  listId: string | null; listName: string | null }` + `loadTrash(listId)`
  + `restoreOne(itemId)`.
- **`web/src/lib/item/components/TrashScreen.svelte`** — the per-list
  trash screen.
- **`web/src/lib/item/components/TrashScreen.test.ts`** — Vitest.
- **`web/src/lib/item/components/__mocks__/TrashScreen.svelte`** —
  stub for route-level test.
- **`web/src/lib/list/model/list-trash.ts`** — `DeletedList` type,
  `fetchDeletedLists()`, `restoreList(listId)`.
- **`web/src/lib/list/state/list-trash.svelte.ts`** — `listTrash` rune
  store: `{ rows: DeletedList[]; loading: boolean; error: string | null }`
  + `loadDeletedLists()` + `restoreOne(listId)`.
- **`web/src/lib/list/components/DeletedListsScreen.svelte`** — account
  trash screen.
- **`web/src/lib/list/components/DeletedListsScreen.test.ts`** — Vitest.
- **`web/src/lib/list/components/__mocks__/DeletedListsScreen.svelte`**
  — stub for route-level test.
- **`web/src/routes/(app)/settings/deleted-lists/+page.svelte`** —
  SvelteKit route, thin wrapper over `<DeletedListsScreen />`.
- **`web/src/routes/(app)/settings/deleted-lists/page.test.ts`** —
  Vitest route-level smoke (mocks the screen, asserts the stub renders).

### Modified files

- **`web/src/routes/(app)/lists/[list_id]/trash/+page.svelte`** — fills
  in the 0601 stub with the same shape as `/lists/[list_id]/+page.svelte`
  (`<TrashScreen listId={params.list_id} />`).
- **`web/src/routes/(app)/lists/[list_id]/trash/page.test.ts`** — new
  alongside the stub fill-in (0601 left only the empty `+page.svelte`).

### Data flow per screen

```
TrashScreen.svelte (mount)
  └─> itemTrash.loadTrash(listId)
       ├─> Promise.allSettled(
       │     pgGet('/items_deleted?list_id=eq.<uuid>&order=deleted_at.desc'),
       │     pgGet('/lists?id=eq.<uuid>&select=name')   // default array form
       │   )
       ├─> fetchDisplayNames(unique deleted_by uuids)
       └─> itemTrash.rows = joined; itemTrash.listName = rows[0]?.name ?? null

[Restore button] -> itemTrash.restoreOne(itemId)
  └─> restoreItem(itemId)   // already exists in item/model/item.ts
       └─> on success: splice row out of itemTrash.rows
       └─> on failure: itemTrash.error = '…', 4s clear timer

DeletedListsScreen.svelte (mount)
  └─> listTrash.loadDeletedLists()
       ├─> pgGet('/lists_deleted?order=deleted_at.desc')
       ├─> fetchDisplayNames(unique deleted_by uuids)
       └─> listTrash.rows = joined

[Restore button] -> listTrash.restoreOne(listId)
  └─> restoreList(listId)   // new in list/model/list-trash.ts
       └─> on success: splice row out of listTrash.rows
       └─> on failure: listTrash.error = '…', 4s clear timer
```

## Phase structure

0. **Phase 0 — Doc reconciliation.** A one-line edit to `docs/ui.md`'s
   "Trash screen" paragraph to switch the attribution-line separator
   from a comma to the bullet (`·`) that the design (`design/cairn-screens.jsx:1298`)
   and this plan's R3/R4 already use. The doc currently reads
   *"deleted by Bob, 3 May 2026"*; should read *"deleted by Bob · 3 May 2026"*.

1. **Phase 1 — Item trash screen.** Add the shared `fetchDisplayNames`
   helper, the `item-trash` model + state, the `TrashScreen` component,
   and fill in the route stub. Each task RED-then-GREEN per
   `docs/testing.md`.

2. **Phase 2 — Account deleted-lists screen.** Add the `list-trash`
   model + state, the `DeletedListsScreen` component, the route file,
   and the route-level smoke test. Same RED-then-GREEN cadence; reuses
   `fetchDisplayNames` from Phase 1.

`docs/data-model.md`'s `items_deleted` / `lists_deleted` view sections
already describe the surface this sub-plan implements. The PLAN.md of
0600 noted PostgREST embedding as the *preferred* path and required
0602 to confirm or fall back; this sub-plan has confirmed (FK is missing
for `deleted_by`) and falls back to client-side batch lookup per R5. No
doc edit is needed for that — the parent plan's `PLAN.md` already
anticipates the fallback, and `docs/data-model.md` does not over-promise
the embedding.

## Reference docs and skills

- **`docs/ui.md` → "Trash & undo"** — canonical spec for the trash
  screen description text, row shape, and the contract that hard-delete
  is not a v1 UI action.
- **`docs/data-model.md` → "The `items_deleted` view"** — view body,
  RLS exemption rationale, and the restore-via-PATCH shape.
- **`docs/frontend-layout.md`** — the `components/`, `state/`, `model/`
  tier split that drives where each new file lands.
- **`docs/testing.md`** — three test layers; Vitest carries this sub-plan.
- **`design/cairn-screens.jsx`** — `TrashScreen` (screen 14, lines
  1254–1311) is the visual spec for the item trash. The account
  deleted-lists screen has no dedicated mock-up; lift the same row shape
  and adapt the leading slot per R4.
- **`.claude/skills/writing-tasks.md`** — how to keep each task block
  self-contained for a fresh executor.
- **`web/src/lib/item/model/item.ts`** — `restoreItem` already exists;
  reuse it. `fetchItems` is the template for the new `fetchDeletedItems`
  (drop the `votes` join, switch the view, drop the `created_by_profile`
  embed since `deleted_by` doesn't have one).
- **`web/src/lib/list/state/lists.svelte.ts`** — pattern for `loadLists`,
  `refreshSignal`, and the `pendingDelete` shape. The new `list-trash`
  state mirrors this minus the pending-delete machinery.
