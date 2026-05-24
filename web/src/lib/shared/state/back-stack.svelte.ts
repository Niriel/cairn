type GuardState = { cairnGuard: true; id: string };

function isGuardState(state: unknown): state is GuardState {
	return (
		typeof state === 'object' &&
		state !== null &&
		(state as { cairnGuard?: unknown }).cairnGuard === true &&
		typeof (state as { id?: unknown }).id === 'string'
	);
}

// When a guard is cleaned up programmatically (not via the browser back button),
// its history.back() fires an async popstate that any concurrently-installed guard
// would otherwise misinterpret as a real user navigation. This flag tells the next
// guard listener to ignore that spurious popstate.
let suppressNextPopState = false;

// Not reactive — purely for test cleanup via _resetForTesting.
const activeListeners: Array<(e: PopStateEvent) => void> = [];

/** Reset module state between tests. Not for production use. */
export function _resetForTesting(): void {
	suppressNextPopState = false;
	for (const listener of activeListeners) {
		window.removeEventListener('popstate', listener);
	}
	activeListeners.length = 0;
}

export function pushHistoryGuard(onPop: () => void): () => void {
	const id = crypto.randomUUID();
	history.pushState({ cairnGuard: true, id } satisfies GuardState, '');

	let fired = false;

	const onPopState = (event: PopStateEvent) => {
		if (suppressNextPopState) {
			suppressNextPopState = false;
			return;
		}
		if (fired) return;
		// This guard's marker is no longer the top of history iff the
		// post-popstate state's id is not ours. When two guards are stacked,
		// popping B leaves A's marker on top — A's listener sees its own id
		// and does nothing; B's listener sees a different id and fires.
		const topId = isGuardState(event.state) ? event.state.id : undefined;
		if (topId === id) return;
		fired = true;
		window.removeEventListener('popstate', onPopState);
		activeListeners.splice(activeListeners.indexOf(onPopState), 1);
		onPop();
	};

	window.addEventListener('popstate', onPopState);
	activeListeners.push(onPopState);

	return () => {
		if (fired) return;
		fired = true;
		window.removeEventListener('popstate', onPopState);
		activeListeners.splice(activeListeners.indexOf(onPopState), 1);
		// Pop the marker we pushed. Suppress the resulting popstate so any
		// concurrently-installed guard doesn't mistake it for a user back press.
		suppressNextPopState = true;
		history.back();
	};
}
