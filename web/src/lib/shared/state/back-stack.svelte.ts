type GuardState = { cairnGuard: true; id: string };

function isGuardState(state: unknown): state is GuardState {
	return (
		typeof state === 'object' &&
		state !== null &&
		(state as { cairnGuard?: unknown }).cairnGuard === true &&
		typeof (state as { id?: unknown }).id === 'string'
	);
}

export function pushHistoryGuard(onPop: () => void): () => void {
	const id = crypto.randomUUID();
	history.pushState({ cairnGuard: true, id } satisfies GuardState, '');

	let fired = false;

	const onPopState = (event: PopStateEvent) => {
		if (fired) return;
		// This guard's marker is no longer the top of history iff the
		// post-popstate state's id is not ours. When two guards are stacked,
		// popping B leaves A's marker on top — A's listener sees its own id
		// and does nothing; B's listener sees a different id and fires.
		const topId = isGuardState(event.state) ? event.state.id : undefined;
		if (topId === id) return;
		fired = true;
		window.removeEventListener('popstate', onPopState);
		onPop();
	};

	window.addEventListener('popstate', onPopState);

	return () => {
		if (fired) return;
		fired = true;
		window.removeEventListener('popstate', onPopState);
		// Pop the marker we pushed. The listener is already removed, so the
		// resulting popstate won't re-enter onPop.
		history.back();
	};
}
