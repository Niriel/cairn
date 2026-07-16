# Requirements: Refresh button

The app uses manual signal-based stores — no real-time sync yet. When a collaborator adds a list or item, the current user won't see the change until they navigate away and back (or restart). A Refresh button in the TopBar gives users an explicit escape hatch on every data-bearing screen.

## R1. Refresh button on the Lists screen

The Lists screen TopBar must include a Refresh button in the right slot, positioned before the Settings button. Tapping it re-fetches the full lists data (equivalent to calling `refreshLists()`). The button is disabled while the lists are loading to prevent duplicate in-flight requests.

## R2. Refresh button on the Items screen

The Items screen TopBar must include a Refresh button in the right slot, positioned before the More (⋮) button. Tapping it re-fetches both the items list (`loadItems`) and the list metadata (name, description, member count). The button is disabled while items are loading.

## R3. Icon

Both buttons use the `rotate-ccw` icon (already in `ICON_PATHS`) at 20 px (slightly smaller than the 22 px Settings / More buttons, keeping the Refresh icon visually secondary). `aria-label="Refresh"` on both.

## R4. Vitest tests for each screen component

Both `ListsScreen` and `ItemsScreen` must have Vitest component tests that assert:

- The Refresh button renders with the correct `aria-label` and `data-test` attribute.
- Clicking it calls the refresh function.
- The button has `disabled` set when the loading flag is true.

## Non-requirements (explicitly excluded)

- **Automatic / polling refresh** — out of scope; real-time sync is a later plan.
- **Visual spin animation on the icon** — nice-to-have but not required; a plain disabled state during load is sufficient.
- **Refresh on other screens** (Settings, Trash, etc.) — those screens either don't show collaborative data or already reload on navigation.
- **Pull-to-refresh gesture** — a separate interaction pattern; deferred.
- **Separate Vitest assertion for `reloadMeta`** — the metadata-reload half of R2 is exercised by the existing mount test `(g)` (which verifies the TopBar title appears via the MSW `GET /lists` handler). Because `pgGet` is intercepted at the network layer rather than injected as a spy, the new Refresh button tests do not re-assert it; they verify `loadItems` only.
