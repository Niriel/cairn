import { describe, expect, test } from 'vitest';

import { OPERATOR, POLICY_DATES } from './operator';

describe('operator facts', () => {
	test('the contact e-mail is an address', () => {
		expect(OPERATOR.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
	});

	test('every policy date is a valid ISO calendar date', () => {
		for (const iso of Object.values(POLICY_DATES)) {
			expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10)).toBe(iso);
		}
	});
});
