import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { softDeleteItem } from '$lib/item/state/items.svelte';
import { render } from '$lib/test/render';
import type { Item } from '$lib/item/model/item';

import DeleteItemSheet from './DeleteItemSheet.svelte';

vi.mock('$lib/item/state/items.svelte');
vi.mock('$lib/basic/components/Sheet.svelte');

afterEach(() => {
	vi.clearAllMocks();
});

const ITEM: Item = {
	id: 'item-42',
	list_id: 'test-list-id',
	name: 'Bringing Up Baby',
	notes: null,
	created_by: 'user-1',
	modified_by: 'user-1',
	created_by_name: 'Alice',
	modified_by_name: null,
	created_by_username: 'alice',
	modified_by_username: null,
	score: 0,
	created_at: '2026-01-01T00:00:00Z',
	modified_at: '2026-01-01T00:00:00Z',
	my_vote: null,
	member_votes: []
};

describe('DeleteItemSheet', () => {
	test('(a) shows item name in heading', () => {
		const { container } = render(DeleteItemSheet, {
			item: ITEM,
			memberCount: 2,
			ondelete: vi.fn(),
			oncancel: vi.fn()
		});
		expect(container.textContent).toContain('Bringing Up Baby');
	});

	test('(b) Cancel does not call softDeleteItem', async () => {
		const oncancel = vi.fn();
		const { getByDataTest } = render(DeleteItemSheet, {
			item: ITEM,
			memberCount: 2,
			ondelete: vi.fn(),
			oncancel
		});
		await fireEvent.click(getByDataTest('delete-cancel'));
		expect(vi.mocked(softDeleteItem)).not.toHaveBeenCalled();
		expect(oncancel).toHaveBeenCalledTimes(1);
	});

	test('(c) Delete calls softDeleteItem with item id', async () => {
		const ondelete = vi.fn();
		const { getByDataTest } = render(DeleteItemSheet, {
			item: ITEM,
			memberCount: 2,
			ondelete,
			oncancel: vi.fn()
		});
		await fireEvent.click(getByDataTest('delete-confirm'));
		await vi.waitFor(() => {
			expect(vi.mocked(softDeleteItem)).toHaveBeenCalledWith('item-42');
		});
	});
});
