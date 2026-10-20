// Whether the entry directly behind the current one in this tab's history is a
// Cairn page, i.e. whether history.back() stays inside the app. The default
// TopBar back control (BackOrHome) reads it: Back when true; when false (a cold
// load onto a bookmarked or reopened deep URL, or after pressing back down to
// that first page) it becomes a Home button instead.
//
// The browser answers this exactly: the Navigation API's `canGoBack` is true
// only when the previous session-history entry is same-origin, and it stays
// right across replaceState redirects, shallow pushState guards and reloads.
// Don't rebuild it from SvelteKit's `afterNavigate`: in a client-only app the
// first load already arrives with a non-null `from`, and a navigation can't
// tell a replaceState redirect from a push.
//
// Without the API (older browsers, happy-dom) this reports false, so the
// control shows Home: never stranding, just less convenient.

type NavigationLike = EventTarget & { readonly canGoBack: boolean };

const nav = (globalThis as { navigation?: NavigationLike }).navigation;

export const navHistory = $state<{ canGoBack: boolean }>({ canGoBack: nav?.canGoBack ?? false });

nav?.addEventListener('currententrychange', () => (navHistory.canGoBack = nav.canGoBack));
