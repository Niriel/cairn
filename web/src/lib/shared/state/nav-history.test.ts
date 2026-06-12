import { beforeEach, describe, expect, test } from 'vitest';

import { _resetForTesting, navHistory, recordInAppNavigation } from './nav-history.svelte';

describe('nav-history', () => {
	beforeEach(() => {
		_resetForTesting();
	});

	test('(a) starts with no in-app history', () => {
		expect(navHistory.hasInApp).toBe(false);
	});

	test('(b) recordInAppNavigation flips the flag true', () => {
		recordInAppNavigation();
		expect(navHistory.hasInApp).toBe(true);
	});

	test('(c) recordInAppNavigation is idempotent', () => {
		recordInAppNavigation();
		recordInAppNavigation();
		expect(navHistory.hasInApp).toBe(true);
	});

	test('(d) _resetForTesting clears the flag', () => {
		recordInAppNavigation();
		_resetForTesting();
		expect(navHistory.hasInApp).toBe(false);
	});
});
