import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { timeAgo } from './time-ago';

describe('timeAgo', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test('returns "just now" for 0 minutes ago', () => {
		expect(timeAgo('2026-06-01T12:00:00Z')).toBe('just now');
	});

	test('returns "just now" for 1 minute ago', () => {
		expect(timeAgo('2026-06-01T11:59:00Z')).toBe('just now');
	});

	test('returns minutes for 2–59 minutes ago', () => {
		expect(timeAgo('2026-06-01T11:45:00Z')).toBe('15 minutes ago');
	});

	test('returns hours for 1–23 hours ago', () => {
		expect(timeAgo('2026-06-01T11:00:00Z')).toBe('1 hour ago');
		expect(timeAgo('2026-06-01T06:00:00Z')).toBe('6 hours ago');
	});

	test('returns days for 1–29 days ago', () => {
		expect(timeAgo('2026-05-31T12:00:00Z')).toBe('1 day ago');
		expect(timeAgo('2026-05-25T12:00:00Z')).toBe('7 days ago');
	});

	test('returns formatted date for 30+ days ago', () => {
		expect(timeAgo('2026-04-01T12:00:00Z')).toBe('1 Apr 2026');
	});
});
