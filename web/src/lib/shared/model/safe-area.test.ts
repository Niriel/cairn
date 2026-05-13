import { describe, expect, test } from 'vitest';

import { SAFE_BOTTOM, SAFE_LEFT, SAFE_RIGHT, SAFE_TOP } from './safe-area';

describe('safe-area named constants', () => {
	test('SAFE_TOP is env(safe-area-inset-top)', () => {
		expect(SAFE_TOP).toBe('env(safe-area-inset-top)');
	});

	test('SAFE_RIGHT is env(safe-area-inset-right)', () => {
		expect(SAFE_RIGHT).toBe('env(safe-area-inset-right)');
	});

	test('SAFE_BOTTOM is env(safe-area-inset-bottom)', () => {
		expect(SAFE_BOTTOM).toBe('env(safe-area-inset-bottom)');
	});

	test('SAFE_LEFT is env(safe-area-inset-left)', () => {
		expect(SAFE_LEFT).toBe('env(safe-area-inset-left)');
	});
});
