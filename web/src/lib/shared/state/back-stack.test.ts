import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest';

import { pushState } from '$app/navigation';

import { pushHistoryGuard, _resetForTesting } from './back-stack.svelte';

vi.mock('$app/navigation', () => ({
	pushState: vi.fn()
}));

describe('pushHistoryGuard', () => {
	let backSpy: MockInstance<typeof history.back>;

	beforeEach(() => {
		vi.mocked(pushState).mockClear();
		backSpy = vi.spyOn(history, 'back').mockImplementation(() => {
			// Don't actually navigate during tests; just observe the call.
		});
	});

	afterEach(() => {
		backSpy.mockRestore();
		_resetForTesting();
	});

	test('(a) pushes a guard marker with a unique id', () => {
		const onPop = vi.fn();
		pushHistoryGuard(onPop);

		expect(pushState).toHaveBeenCalledTimes(1);
		const [url, state] = vi.mocked(pushState).mock.calls[0];
		expect(url).toBe('');
		expect(state.cairnGuard).toBe(true);
		expect(typeof state.cairnGuardId).toBe('string');
	});

	test('(b) popstate fires onPop exactly once', () => {
		const onPop = vi.fn();
		pushHistoryGuard(onPop);

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
		pushHistoryGuard(onPopB);

		// First popstate pops B (top of stack).
		dispatchEvent(new PopStateEvent('popstate', { state: null }));
		expect(onPopB).toHaveBeenCalledTimes(1);
		expect(onPopA).not.toHaveBeenCalled();

		// Second popstate pops A (now top of stack).
		dispatchEvent(new PopStateEvent('popstate', { state: null }));
		expect(onPopA).toHaveBeenCalledTimes(1);
		// B must not fire again.
		expect(onPopB).toHaveBeenCalledTimes(1);
	});

	test('(f) programmatic cleanup of guard B does not fire a concurrently-installed guard A', () => {
		const onPopB = vi.fn();
		const cleanupB = pushHistoryGuard(onPopB);

		const onPopA = vi.fn();
		pushHistoryGuard(onPopA);

		// B cleaned up programmatically (e.g. accordion switch): should suppress the
		// resulting popstate so A's onPop is not triggered.
		cleanupB();
		dispatchEvent(new PopStateEvent('popstate', { state: null }));

		expect(onPopA).not.toHaveBeenCalled();
		expect(onPopB).not.toHaveBeenCalled();
	});
});
