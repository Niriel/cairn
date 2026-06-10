import { createRawSnippet, flushSync } from 'svelte';
import { afterEach, describe, expect, test, vi, type MockInstance } from 'vitest';

import { bumpHistoryVersion, resetHistoryVersion } from '$lib/test/reactive-history.svelte';
import { render } from '$lib/test/render';
import { _resetForTesting } from '$lib/shared/state/back-stack.svelte';

import Accordion from './Accordion.svelte';

// Mock only SvelteKit's pushState — the real back-stack runs. The mock READS a
// reactive source (readHistoryVersion) to mimic pushState touching SvelteKit's
// internal *reactive* history state. The guard effect must wrap pushHistoryGuard
// in untrack so it does NOT track that read; otherwise every history change
// re-runs the effect and re-pushes a guard, and the back button can never
// escape the pile (the "back doesn't work when an item is unfolded" bug).
vi.mock('$app/navigation', async () => {
	const mod = await import('$lib/test/reactive-history.svelte');
	return { pushState: vi.fn(() => mod.readHistoryVersion()) };
});

import { pushState } from '$app/navigation';

function content(html: string) {
	return createRawSnippet(() => ({ render: () => `<span>${html}</span>` }));
}

describe('Accordion history-guard does not re-track SvelteKit history state', () => {
	let backSpy: MockInstance<typeof history.back>;

	afterEach(() => {
		vi.mocked(pushState).mockClear();
		resetHistoryVersion();
		_resetForTesting();
		backSpy?.mockRestore();
	});

	test('a later history-state change does not re-push the guard', () => {
		backSpy = vi.spyOn(history, 'back').mockImplementation(() => {});

		render(Accordion, {
			expanded: true,
			pushesHistory: true,
			onexpand: vi.fn(),
			oncollapse: vi.fn(),
			'data-test': 'acc',
			header: content('Header'),
			body: content('Body')
		});
		flushSync();

		// Opening pushes exactly one guard.
		expect(pushState).toHaveBeenCalledTimes(1);

		// SvelteKit mutates its history state (e.g. a sibling pushState / nav).
		// With untrack the guard effect ignores it; without untrack it re-runs
		// and pushes again.
		bumpHistoryVersion();
		flushSync();

		expect(pushState).toHaveBeenCalledTimes(1);
	});
});
