import { describe, expect, test } from 'vitest';

import { OPERATOR, POLICY_DATES, PROCESSORS, SOURCE_REPO_URL } from './operator';

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

	test('at least one data processor is named', () => {
		expect(PROCESSORS.length).toBeGreaterThan(0);
	});

	test('the source repository is an https URL', () => {
		expect(SOURCE_REPO_URL).toMatch(/^https:\/\//);
	});
});
