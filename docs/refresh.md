# Refresh and loading state

This document describes the pattern Cairn uses for loading data and letting users manually refresh a screen.

## The pattern

Every screen that fetches data follows the same three-part shape:

**1. A `loading` flag on the state object.**

```ts
export const myState = $state<{
    items: Item[];
    loading: boolean;
}>({ items: [], loading: false });
```

When a state module handles several independent fetch operations, scope the flag name to the operation: `inboxLoading`, `sentLoading`, etc. When there is only one fetch, `loading` is fine.

**2. The fetch function sets `loading` true/false.**

```ts
export async function loadItems(): Promise<void> {
    myState.loading = true;
    try {
        myState.items = await pgGet<Item[]>('/items');
    } finally {
        myState.loading = false;
    }
}
```

`finally` guarantees the flag clears on both success and error — never leave a screen permanently stuck in the loading state.

**3. The screen renders a loading indicator and disables the refresh button.**

```svelte
<AppTopBar>
    Title
    {#snippet right()}
        <IconButton
            aria-label="Refresh"
            data-test="screen-refresh"
            disabled={myState.loading}
            onclick={() => void loadItems()}
        >
            <Icon name="rotate-ccw" size={22} />
        </IconButton>
    {/snippet}
</AppTopBar>

{#if myState.loading}
    <div class="loading" data-test="screen-loading">Loading…</div>
{:else if myState.items.length === 0}
    <!-- empty state -->
{:else}
    <!-- list -->
{/if}
```

The disabled button gives visual feedback that a refresh is already in progress, and prevents a second concurrent fetch.

## Triggering a refresh

Two approaches are in use:

- **Direct call** — the refresh button's `onclick` calls `loadItems()` directly. Simple and correct for screens where no other code needs to trigger a reload. Used by ItemsScreen, TrashScreen, DeletedListsScreen, InvitesInboxScreen.
- **Signal counter** — the state module exposes a `refreshXxx()` function that increments a private `$state` counter; an `$effect.root` watches the counter and fetches. Useful when multiple callers (a button *and* a route change *and* a session change) all need to trigger the same fetch. Used by ListsScreen (`refreshLists()` + `refreshSignal`).

Prefer the direct-call approach unless you need multi-caller coordination.

## Loading text

The loading indicator is a plain `<div class="loading">Loading…</div>`, left-padded to align with the list content:

```css
.loading {
    padding: 16px 18px;
    color: var(--stone);
}
```

No spinner, no skeleton — the copy is enough for the sub-second fetches Cairn targets against a local VPS.

## Mock pattern in Vitest tests

State module mocks expose the loading flag with its initial value:

```ts
export const invitations = $state<{
    inbox: InboxEntry[];
    inboxLoading: boolean;
    // ...
}>({ inbox: [], inboxLoading: false, /* ... */ });
```

Component tests that want to assert the loading state set the flag directly before rendering:

```ts
invitations.inboxLoading = true;
const { getByDataTest } = render(InvitesInboxScreen);
expect(getByDataTest('inbox-loading')).not.toBeNull();
```
