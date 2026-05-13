import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest';

import { pushHistoryGuard } from './back-stack.svelte';

describe('pushHistoryGuard', () => {
	let pushStateSpy: MockInstance<typeof history.pushState>;
	let backSpy: MockInstance<typeof history.back>;

	beforeEach(() => {
		pushStateSpy = vi.spyOn(history, 'pushState');
		backSpy = vi.spyOn(history, 'back').mockImplementation(() => {
			// Don't actually navigate during tests; just observe the call.
		});
	});

	afterEach(() => {
		pushStateSpy.mockRestore();
		backSpy.mockRestore();
	});

	test('(a) pushes a guard marker with a unique id', () => {
		const onPop = vi.fn();
		pushHistoryGuard(onPop);

		expect(pushStateSpy).toHaveBeenCalledTimes(1);
		const state = pushStateSpy.mock.calls[0][0] as { cairnGuard: unknown; id: unknown };
		expect(state.cairnGuard).toBe(true);
		expect(typeof state.id).toBe('string');
	});

	test('(b) popstate fires onPop exactly once', () => {
		const onPop = vi.fn();
		pushHistoryGuard(onPop);

		// Simulate the marker being popped: post-popstate state is null
		// (parent route), no longer this guard's id.
		dispatchEvent(new PopStateEvent('popstate', { state: null }));
		dispatchEvent(new PopStateEvent('popstate', { state: null }));

		expect(onPop).toHaveBeenCalledTimes(1);
	});

	test('(c) cleanup before popstate calls history.back once', () => {
		const onPop = vi.fn();
		const cleanup = pushHistoryGuard(onPop);

		cleanup();

		expect(backSpy).toHaveBeenCalledTimes(1);
		expect(onPop).not.toHaveBeenCalled();
	});

	test('(d) cleanup after popstate does NOT call history.back', () => {
		const onPop = vi.fn();
		const cleanup = pushHistoryGuard(onPop);

		dispatchEvent(new PopStateEvent('popstate', { state: null }));
		expect(onPop).toHaveBeenCalledTimes(1);

		cleanup();

		expect(backSpy).not.toHaveBeenCalled();
	});

	test('(e) stacked guards: only the top-most guard fires per back press', () => {
		const onPopA = vi.fn();
		const onPopB = vi.fn();

		pushHistoryGuard(onPopA);
		const aState = pushStateSpy.mock.calls[0][0] as { cairnGuard: true; id: string };

		pushHistoryGuard(onPopB);

		// B's marker is popped — post-popstate state is A's marker.
		dispatchEvent(new PopStateEvent('popstate', { state: aState }));
		expect(onPopB).toHaveBeenCalledTimes(1);
		expect(onPopA).not.toHaveBeenCalled();

		// A's marker is popped — post-popstate state is the parent route (null).
		dispatchEvent(new PopStateEvent('popstate', { state: null }));
		expect(onPopA).toHaveBeenCalledTimes(1);
		// B must not fire again.
		expect(onPopB).toHaveBeenCalledTimes(1);
	});
});
