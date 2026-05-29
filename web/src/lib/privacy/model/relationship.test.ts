import { describe, expect, it } from 'vitest';
import { addedAtLabel, blockedAtLabel } from './relationship';

const NOW_2026 = new Date('2026-05-28T12:00:00Z');

describe('addedAtLabel', () => {
	it('returns short form when createdAt year matches now', () => {
		expect(addedAtLabel('2026-04-12T10:00:00Z', NOW_2026)).toBe('added 12 Apr');
	});

	it('returns long form when createdAt year differs from now', () => {
		expect(addedAtLabel('2025-04-12T10:00:00Z', NOW_2026)).toBe('added 12 Apr 2025');
	});

	it('uses short form on January 1 of the current year', () => {
		expect(addedAtLabel('2026-01-01T00:00:00Z', NOW_2026)).toBe('added 1 Jan');
	});

	it('uses long form on January 1 of a prior year', () => {
		expect(addedAtLabel('2025-01-01T00:00:00Z', NOW_2026)).toBe('added 1 Jan 2025');
	});
});

describe('blockedAtLabel', () => {
	it('returns short form when createdAt year matches now', () => {
		expect(blockedAtLabel('2026-04-12T10:00:00Z', NOW_2026)).toBe('blocked 12 Apr');
	});

	it('returns long form when createdAt year differs from now', () => {
		expect(blockedAtLabel('2025-04-12T10:00:00Z', NOW_2026)).toBe('blocked 12 Apr 2025');
	});

	it('uses short form on January 1 of the current year', () => {
		expect(blockedAtLabel('2026-01-01T00:00:00Z', NOW_2026)).toBe('blocked 1 Jan');
	});

	it('uses long form on January 1 of a prior year', () => {
		expect(blockedAtLabel('2025-01-01T00:00:00Z', NOW_2026)).toBe('blocked 1 Jan 2025');
	});
});
