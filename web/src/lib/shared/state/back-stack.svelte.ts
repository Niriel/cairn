import { pushState } from '$app/navigation';

// Guard-stack: each pushHistoryGuard call appends an entry. A single
// shared popstate listener pops the top entry and fires its onPop.
// Tracking the stack in module state (rather than reading event.state)
// is required because SvelteKit's pushState wraps the state object —
// the raw cairnGuard / cairnGuardId fields aren't directly visible on
// event.state.

type Entry = {
	id: string;
	onPop: () => void;
	fired: boolean;
};

const stack: Entry[] = [];
let listenerInstalled = false;

// When a guard is cleaned up programmatically (not via the browser back
// button), its history.back() fires an async popstate. This flag tells
// the shared listener to ignore that spurious popstate.
let suppressNextPopState = false;

function onPopState(): void {
	if (suppressNextPopState) {
		suppressNextPopState = false;
		return;
	}
	const top = stack.pop();
	if (top && !top.fired) {
		top.fired = true;
		top.onPop();
	}
}

/** Reset module state between tests. Not for production use. */
export function _resetForTesting(): void {
	suppressNextPopState = false;
	stack.length = 0;
	if (listenerInstalled) {
		window.removeEventListener('popstate', onPopState);
		listenerInstalled = false;
	}
}

export function pushHistoryGuard(onPop: () => void): () => void {
	if (!listenerInstalled) {
		window.addEventListener('popstate', onPopState);
		listenerInstalled = true;
	}

	const id = crypto.randomUUID();
	pushState('', { cairnGuard: true, cairnGuardId: id });

	const entry: Entry = { id, onPop, fired: false };
	stack.push(entry);

	return () => {
		if (entry.fired) return;
		entry.fired = true;
		const idx = stack.indexOf(entry);
		if (idx >= 0) stack.splice(idx, 1);
		// Pop the marker we pushed. Suppress the resulting popstate so
		// the shared listener doesn't mistake it for a user back press.
		suppressNextPopState = true;
		history.back();
	};
}
