import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { items, undoDelete } from '$lib/item/state/items.svelte';
import { _resetForTesting } from '$lib/shared/state/back-stack.svelte';
import { server } from '$lib/test/server';
import { render } from '$lib/test/render';
import type { Item } from '$lib/item/model/item';

import ItemsScreen from './ItemsScreen.svelte';

vi.mock('$lib/item/state/items.svelte');
vi.mock('$lib/basic/components/Fab.svelte');
vi.mock('$lib/list/components/ListOverflowSheet.svelte');
vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/shared/components/MoreButton.svelte');
vi.mock('$lib/shared/components/UndoSnackbar.svelte');
vi.mock('$lib/item/components/VoteControl.svelte');
vi.mock('$lib/item/components/AddEditItemSheet.svelte');
vi.mock('$lib/item/components/DeleteItemSheet.svelte');

const STUB_LIST = {
	id: 'test-list-id',
	name: 'Test list',
	description: null,
	list_members: [{ user_id: 'user-1' }]
};

const ITEM_1: Item = {
	id: 'item-1',
	list_id: 'test-list-id',
	name: 'First item',
	notes: null,
	created_by: 'user-1',
	modified_by: 'user-1',
	created_by_name: 'Alice',
	modified_by_name: null,
	score: 0,
	created_at: '2026-01-01T00:00:00Z',
	modified_at: '2026-01-01T00:00:00Z',
	my_vote: null,
	member_votes: []
};

const ITEM_2: Item = { ...ITEM_1, id: 'item-2', name: 'Second item' };

beforeEach(() => {
	server.use(http.get('*/api/lists', () => HttpResponse.json([STUB_LIST])));
	Object.assign(items, {
		rows: [],
		loading: false,
		error: null,
		listId: null,
		pendingDelete: null
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	history.replaceState(null, '');
	_resetForTesting();
});

describe('ItemsScreen', () => {
	test('(a) shows loading state initially', () => {
		items.loading = true;
		const { queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		expect(queryByDataTest('items-loading')).not.toBeNull();
	});

	test('(b) shows empty state when rows is empty', async () => {
		items.rows = [];
		const { queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		expect(queryByDataTest('items-empty')).not.toBeNull();
	});

	test('(c) renders item rows with names and vote controls', async () => {
		items.rows = [ITEM_1, ITEM_2];
		const { queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		expect(queryByDataTest(`row-${ITEM_1.id}`)).not.toBeNull();
		expect(queryByDataTest(`row-${ITEM_2.id}`)).not.toBeNull();
	});

	test('(d) tapping a row opens its panel; opening second closes the first', async () => {
		vi.spyOn(history, 'back').mockImplementation(() => {});
		items.rows = [ITEM_1, ITEM_2];
		const { getByDataTest, queryByDataTest, getAllByDataTest } = render(ItemsScreen, {
			listId: 'test-list-id'
		});

		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		expect(queryByDataTest('item-panel')).not.toBeNull();

		await fireEvent.click(getByDataTest(`row-${ITEM_2.id}`));
		await tick();
		expect(getAllByDataTest('item-panel').length).toBe(1);
	});

	test('(e) tapping the back button calls history.back()', async () => {
		const backSpy = vi.spyOn(history, 'back').mockImplementation(() => {});
		const { getByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await fireEvent.click(getByDataTest('topbar-back'));
		expect(backSpy).toHaveBeenCalledTimes(1);
	});

	test('(f) FAB is visible when no pending delete', () => {
		const { queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		expect(queryByDataTest('items-fab')).not.toBeNull();
	});

	test('(g) TopBar title text matches list name from GET /lists', async () => {
		const { container } = render(ItemsScreen, { listId: 'test-list-id' });
		await vi.waitFor(() => {
			expect(container.textContent).toContain('Test list');
		});
	});

	test('(h) dispatching popstate while panel is open closes it', async () => {
		vi.spyOn(history, 'back').mockImplementation(() => {});
		items.rows = [ITEM_1];
		const { getByDataTest, queryByDataTest } = render(ItemsScreen, {
			listId: 'test-list-id'
		});

		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		expect(queryByDataTest('item-panel')).not.toBeNull();

		window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
		await tick();
		expect(queryByDataTest('item-panel')).toBeNull();
	});

	test('(i-a) snackbar is visible with item name when pendingDelete is set', async () => {
		items.pendingDelete = { item: ITEM_1, timerId: 0 as unknown as ReturnType<typeof setTimeout> };
		const { queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		const snackbar = queryByDataTest('undo-snackbar');
		expect(snackbar).not.toBeNull();
		expect(snackbar?.textContent).toContain('First item');
	});

	test('(i-b) FAB is hidden while snackbar is showing', async () => {
		items.pendingDelete = { item: ITEM_1, timerId: 0 as unknown as ReturnType<typeof setTimeout> };
		const { queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		expect(queryByDataTest('items-fab')).toBeNull();
	});

	test('(i-c) tapping UNDO in snackbar calls undoDelete', async () => {
		items.pendingDelete = { item: ITEM_1, timerId: 0 as unknown as ReturnType<typeof setTimeout> };
		const { getByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		await fireEvent.click(getByDataTest('undo-snackbar-undo'));
		expect(vi.mocked(undoDelete)).toHaveBeenCalledTimes(1);
	});

	test('(i-d) snackbar is not in DOM when pendingDelete is null', async () => {
		items.pendingDelete = null;
		const { queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		expect(queryByDataTest('undo-snackbar')).toBeNull();
	});

	test('(new-a) clicking More options renders ListOverflowSheet', async () => {
		const { getByRole, queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await fireEvent.click(getByRole('button', { name: 'More options' }));
		await tick();
		expect(queryByDataTest('list-overflow-sheet-stub')).not.toBeNull();
	});

	test('(i-e) error state shows failure message and hides UNDO button', async () => {
		items.pendingDelete = { item: ITEM_1, timerId: 0 as unknown as ReturnType<typeof setTimeout> };
		items.error = 'Failed to restore item';
		const { queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		const snackbar = queryByDataTest('undo-snackbar');
		expect(snackbar?.textContent).toContain('Undo failed');
		expect(queryByDataTest('undo-btn')).toBeNull();
	});

	test('(new-b) tombstone created_by renders italic class on creator name', async () => {
		items.rows = [
			{
				...ITEM_1,
				created_by: '00000000-0000-0000-0000-000000000000',
				created_by_name: 'Deleted user'
			}
		];
		const { getByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		expect(getByDataTest(`attribution-creator-${ITEM_1.id}`).classList.contains('tombstone')).toBe(
			true
		);
	});

	test('(new-c) live creator + tombstone editor renders italic on editor only', async () => {
		items.rows = [
			{
				...ITEM_1,
				created_by: 'user-1',
				created_by_name: 'Alice',
				modified_by: '00000000-0000-0000-0000-000000000000',
				modified_by_name: 'Deleted user',
				modified_at: '2026-02-01T00:00:00Z'
			}
		];
		const { getByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		expect(getByDataTest(`attribution-creator-${ITEM_1.id}`).classList.contains('tombstone')).toBe(
			false
		);
		expect(getByDataTest(`attribution-editor-${ITEM_1.id}`).classList.contains('tombstone')).toBe(
			true
		);
	});
});
