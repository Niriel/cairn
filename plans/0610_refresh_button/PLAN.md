# Plan: Refresh button

A Refresh button in the TopBar of the Lists and Items screens lets users pull the latest collaborative data without navigating away, bridging the gap until real-time sync is added.

## Context

Cairn is a collaborative ranked-list app. Multiple users can add lists and items to a shared workspace, but the frontend fetches data once on load and only updates in response to local mutations. A second user's additions are invisible to the first until they navigate away and back (which re-mounts the screen and triggers the `$effect`).

The data layer uses manual signal-based Svelte stores rather than SvelteKit's `invalidate()` (the app runs in SPA mode with SSR disabled, so route-level `load` functions aren't in play). The refresh primitives already exist:

- `refreshLists()` in `web/src/lib/list/state/lists.svelte.ts` — increments a signal that causes the lists `$effect` to re-fetch.
- `loadItems(listId)` in `web/src/lib/item/state/items.svelte.ts` — re-fetches items for the current list.
- The Items screen also fetches list metadata (`name`, `description`, `list_members`) via an inline `pgGet` in `ItemsScreen.svelte`'s `$effect`.

Both screens already have an `AppTopBar` / `TopBar` with a `right` snippet that accepts arbitrary `IconButton` nodes.

## Decisions

**Place before the existing action button, not after.** The design convention (and the user's explicit request) is Refresh → Settings on the Lists screen, and Refresh → More on the Items screen. This keeps the most-used navigation action (Settings / More) closest to the thumb, while Refresh sits just to its left.

**Disable during loading, not hide.** Hiding the button during a fetch would cause layout shift. Disabling it is visually stable and communicates that a fetch is already in progress (R1, R2).

**Extract `reloadMeta()` in `ItemsScreen`.** The list metadata fetch is currently inlined in `$effect`. To let both `$effect` (on mount / `listId` change) and the Refresh button call it, extract it into a named async function. The Refresh handler calls both `void loadItems(listId)` and `void reloadMeta()` in parallel (R2).

**No spinner animation (R non-req).** The `disabled` state on the button is the only loading feedback. A spinning icon is deferred.

## Architecture

### Modified files

- **`web/src/lib/list/components/ListsScreen.svelte`** — add `IconButton` with `rotate-ccw` icon before Settings in the `right` snippet; no import changes needed (all dependencies already imported).
- **`web/src/lib/item/components/ItemsScreen.svelte`** — import `IconButton`; extract inline `pgGet` into `reloadMeta()`; add `refreshItems()` calling both; add `IconButton` before `MoreButton` in the `right` snippet.

### New files

- **`web/src/lib/list/components/ListsScreen.test.ts`** — Vitest component tests for the Lists screen Refresh button (R4).
- **`web/src/lib/item/components/ItemsScreen.test.ts`** — Vitest component tests for the Items screen Refresh button (R4).

(Test files may already exist; if so, tests are appended rather than a new file created.)

## Phase structure

1. **Phase 1 — Lists screen.** Add the Refresh button to `ListsScreen.svelte` and write the Vitest tests (RED then GREEN).

2. **Phase 2 — Items screen.** Extract `reloadMeta()`, add `refreshItems()`, wire the Refresh button, and write the Vitest tests (RED then GREEN).

## Reference docs and skills

- **`docs/frontend-layout.md`** — tier split rules; test filename convention (no `+` prefix for route-colocated tests).
- **`docs/testing.md`** — Vitest component test conventions.
- **`docs/ui.md`** — TopBar button ordering and `IconButton` sizing conventions.
