import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

vi.mock('$lib/basic/components/Sheet.svelte');

import ItemOverflowSheet from './ItemOverflowSheet.svelte';

afterEach(() => {
	vi.clearAllMocks();
});

const PROPS = {
	itemName: 'The Godfather',
	onedit: vi.fn(),
	ondelete: vi.fn(),
	onclose: vi.fn()
};

describe('ItemOverflowSheet', () => {
	test('(a) renders the item name in the header', () => {
		const { container } = render(ItemOverflowSheet, PROPS);
		expect(container.textContent).toContain('The Godfather');
	});

	test('(b) renders an Edit row and a Delete row', () => {
		const { queryByDataTest } = render(ItemOverflowSheet, PROPS);
		expect(queryByDataTest('item-overflow-edit')).not.toBeNull();
		expect(queryByDataTest('item-overflow-delete')).not.toBeNull();
	});

	test('(c) tapping Edit fires onedit', async () => {
		const onedit = vi.fn();
		const { getByDataTest } = render(ItemOverflowSheet, { ...PROPS, onedit });
		await fireEvent.click(getByDataTest('item-overflow-edit'));
		expect(onedit).toHaveBeenCalledTimes(1);
	});

	test('(d) tapping Delete fires ondelete', async () => {
		const ondelete = vi.fn();
		const { getByDataTest } = render(ItemOverflowSheet, { ...PROPS, ondelete });
		await fireEvent.click(getByDataTest('item-overflow-delete'));
		expect(ondelete).toHaveBeenCalledTimes(1);
	});
});
