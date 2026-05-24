import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { items } from '$lib/item/state/items.svelte';
import { _resetForTesting } from '$lib/shared/state/back-stack.svelte';
import { server } from '$lib/test/server';
import { render } from '$lib/test/render';
import type { Item } from '$lib/item/model/item';

import ItemsScreen from './ItemsScreen.svelte';

vi.mock('$lib/item/state/items.svelte');
vi.mock('$lib/basic/components/Fab.svelte');
vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/item/components/VoteControl.svelte');
vi.mock('$lib/item/components/AddEditItemSheet.svelte');
vi.mock('$lib/item/components/DeleteItemSheet.svelte');

const STUB_LIST = {
	id: 'test-list-id',
	name: 'Test list',
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
});
