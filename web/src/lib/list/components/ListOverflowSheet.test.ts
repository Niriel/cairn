import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { deleteList } from '$lib/list/state/lists.svelte';
import { render } from '$lib/test/render';

import ListOverflowSheet from './ListOverflowSheet.svelte';

vi.mock('$lib/basic/components/Sheet.svelte');
vi.mock('$lib/list/state/lists.svelte');
vi.mock('$lib/list/components/RenameListSheet.svelte');
vi.mock('$lib/list/components/EditDescriptionSheet.svelte');

afterEach(() => {
	vi.clearAllMocks();
});

const PROPS = {
	listId: 'list-1',
	listName: 'Movies for Bob',
	description: 'A great list',
	itemCount: 6,
	memberCount: 2,
	onDelete: vi.fn(),
	onviewtrash: vi.fn(),
	onclose: vi.fn()
};

describe('ListOverflowSheet', () => {
	test('(a) renders list name and meta in header', () => {
		const { container } = render(ListOverflowSheet, PROPS);
		expect(container.textContent).toContain('Movies for Bob');
		expect(container.textContent).toContain('6');
		expect(container.textContent).toContain('2');
	});

	test('(b) shows four rows: Rename list, Edit description, View trash, Delete list', () => {
		const { container } = render(ListOverflowSheet, PROPS);
		expect(container.textContent).toContain('Rename list');
		expect(container.textContent).toContain('Edit description');
		expect(container.textContent).toContain('View trash');
		expect(container.textContent).toContain('Delete list');
	});

	test('(c) tapping View trash calls onviewtrash', async () => {
		const onviewtrash = vi.fn();
		const { getByDataTest } = render(ListOverflowSheet, { ...PROPS, onviewtrash });
		await fireEvent.click(getByDataTest('list-overflow-view-trash'));
		expect(onviewtrash).toHaveBeenCalledTimes(1);
	});

	test('(d) tapping Delete list calls deleteList and then onDelete', async () => {
		const onDelete = vi.fn();
		const { getByDataTest } = render(ListOverflowSheet, { ...PROPS, onDelete });
		await fireEvent.click(getByDataTest('list-overflow-delete'));
		await vi.waitFor(() => {
			expect(vi.mocked(deleteList)).toHaveBeenCalledWith('list-1');
			expect(onDelete).toHaveBeenCalledTimes(1);
		});
	});

	test('(e) tapping Rename list renders RenameListSheet', async () => {
		const { getByDataTest, queryByDataTest } = render(ListOverflowSheet, PROPS);
		await fireEvent.click(getByDataTest('list-overflow-rename'));
		expect(queryByDataTest('rename-list-sheet-stub')).not.toBeNull();
	});

	test('(f) tapping Edit description renders EditDescriptionSheet', async () => {
		const { getByDataTest, queryByDataTest } = render(ListOverflowSheet, PROPS);
		await fireEvent.click(getByDataTest('list-overflow-edit-description'));
		expect(queryByDataTest('edit-description-sheet-stub')).not.toBeNull();
	});

	test('(g) Sheet onclose invokes ListOverflowSheet onclose prop', async () => {
		const onclose = vi.fn();
		const { getByDataTest } = render(ListOverflowSheet, { ...PROPS, onclose });
		await fireEvent.click(getByDataTest('sheet-close'));
		expect(onclose).toHaveBeenCalledTimes(1);
	});
});
