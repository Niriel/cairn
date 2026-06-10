// Test stand-in for SvelteKit's internal *reactive* history state.
//
// The back-stack bug: a history-guard $effect that calls pushHistoryGuard
// without untrack ends up tracking the reactive state that SvelteKit's
// pushState touches, so every history change re-runs the effect and re-pushes
// a guard — stacking entries the back button can never escape.
//
// To reproduce that in a unit test we mock $app/navigation's pushState to READ
// this reactive `version`. A guard effect that tracks the read will re-run when
// the test bumps the version; one wrapped in untrack will not.
let version = $state(0);

/** Read the reactive version — call this from the mocked pushState. */
export function readHistoryVersion(): number {
	return version;
}

/** Mutate it — simulates SvelteKit updating its history state. */
export function bumpHistoryVersion(): void {
	version += 1;
}

export function resetHistoryVersion(): void {
	version = 0;
}
