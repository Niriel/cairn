import { describe, expect, test } from 'vitest';

import { createList } from './list';
import type { List } from './list';

describe('createList', () => {
	test('(a) calls POST /rpc/create_list and returns List row', async () => {
		const result = await createList('My list');
		expect(result.name).toBe('My list');
		expect(typeof result.id).toBe('string');
	});

	test('(b) passes description when provided', async () => {
		const result: List = await createList('My list', 'Details');
		expect(result.name).toBe('My list');
	});
});
