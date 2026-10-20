import { describe, expect, test } from 'vitest';

import { compareNames, compareNamesThenAge, compareNamesThenId } from './compare-names';

function sorted(names: string[]): string[] {
	return names
		.map((name) => ({ name }))
		.sort(compareNames)
		.map((r) => r.name);
}

describe('compareNames', () => {
	test('(a) ignores case', () => {
		expect(sorted(['cherry', 'Banana', 'apple'])).toEqual(['apple', 'Banana', 'cherry']);
	});

	test('(b) sorts accented letters with their base letter', () => {
		expect(sorted(['fig', 'école', 'date'])).toEqual(['date', 'école', 'fig']);
		expect(compareNames({ name: 'école' }, { name: 'ecole' })).toBe(0);
	});

	test('(c) orders embedded numbers naturally', () => {
		expect(sorted(['Item 10', 'Item 2', 'Item 1'])).toEqual(['Item 1', 'Item 2', 'Item 10']);
	});

	test('(d) ignores surrounding whitespace', () => {
		expect(sorted(['banana', ' cherry', 'apple'])).toEqual(['apple', 'banana', ' cherry']);
	});

	test('(e) equal names compare as 0 so callers can tie-break', () => {
		expect(compareNames({ name: 'Apple' }, { name: 'apple' })).toBe(0);
	});
});

describe('compareNamesThenAge', () => {
	test('(a) orders by name first', () => {
		const older = { name: 'b', created_at: '2026-01-01T00:00:00+00:00' };
		const newer = { name: 'a', created_at: '2026-01-02T00:00:00+00:00' };
		expect(compareNamesThenAge(newer, older)).toBeLessThan(0);
	});

	test('(b) same names: oldest first, even when PostgREST drops a zero fraction', () => {
		const older = { name: 'x', created_at: '2026-01-01T12:00:00+00:00' };
		const newer = { name: 'X', created_at: '2026-01-01T12:00:00.5+00:00' };
		expect(compareNamesThenAge(older, newer)).toBeLessThan(0);
		expect(compareNamesThenAge(newer, older)).toBeGreaterThan(0);
	});
});

describe('compareNamesThenId', () => {
	test('(a) orders by name first', () => {
		expect(compareNamesThenId({ name: 'a', id: 'b' }, { name: 'b', id: 'a' })).toBeLessThan(0);
	});

	test('(b) same names: lower id first', () => {
		expect(compareNamesThenId({ name: 'x', id: 'a' }, { name: 'X', id: 'b' })).toBeLessThan(0);
		expect(compareNamesThenId({ name: 'x', id: 'b' }, { name: 'X', id: 'a' })).toBeGreaterThan(0);
		expect(compareNamesThenId({ name: 'x', id: 'a' }, { name: 'X', id: 'a' })).toBe(0);
	});
});
