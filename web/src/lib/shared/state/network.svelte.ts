// Single reactive source of truth for connectivity. The session boot, the
// ItemsScreen offline branch, and the disabled write controls all read
// `network.online`. Writes aren't queued offline — this store just lets the UI
// react to losing/regaining the network.
//
// SSR/test-guarded: Cairn is an SPA, but Vitest runs modules in happy-dom and
// the store is imported eagerly, so guard `navigator`/`window` access.

function initialOnline(): boolean {
	return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export const network = $state<{ online: boolean }>({ online: initialOnline() });

if (typeof window !== 'undefined') {
	window.addEventListener('online', () => (network.online = true));
	window.addEventListener('offline', () => (network.online = false));
}
