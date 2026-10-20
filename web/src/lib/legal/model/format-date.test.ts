import { describe, expect, test } from 'vitest';

import { formatLegalDate } from './format-date';

describe('formatLegalDate', () => {
	test('renders an ISO date as a British long date', () => {
		expect(formatLegalDate('2026-10-20')).toBe('20 October 2026');
	});

	test('does not drift a day at the year boundary', () => {
		expect(formatLegalDate('2026-01-01')).toBe('1 January 2026');
	});
});
