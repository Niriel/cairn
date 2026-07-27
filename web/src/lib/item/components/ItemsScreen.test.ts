import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { items, loadItems, undoDelete } from '$lib/item/state/items.svelte';
import { _resetForTesting } from '$lib/shared/state/back-stack.svelte';
import { network } from '$lib/shared/state/network.svelte';
import { server } from '$lib/test/server';
import { render } from '$lib/test/render';
import type { Item } from '$lib/item/model/item';

import ItemsScreen from './ItemsScreen.svelte';

vi.mock('$lib/item/state/items.svelte');
vi.mock('$lib/shared/state/network.svelte');
vi.mock('$lib/basic/components/Fab.svelte');
vi.mock('$lib/list/components/ListOverflowSheet.svelte');
vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/shared/components/MoreButton.svelte');
vi.mock('$lib/shared/components/UndoSnackbar.svelte');
vi.mock('$lib/shared/components/NoConnectionState.svelte');
vi.mock('$lib/item/components/VoteControl.svelte');
vi.mock('$lib/item/components/AddEditItemSheet.svelte');
vi.mock('$lib/item/components/DeleteItemSheet.svelte');
vi.mock('$lib/item/components/ItemOverflowSheet.svelte');

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
	created_by_username: 'alice',
	modified_by_username: null,
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
	network.online = true;
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

	test('(b-offline) shows No-connection state on a failed load with no rows while offline', async () => {
		items.error = 'Failed to load items';
		items.rows = [];
		network.online = false;
		const { queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		expect(queryByDataTest('no-connection')).not.toBeNull();
		expect(queryByDataTest('items-empty')).toBeNull();
	});

	test('(b-online-error) a failed load while online shows the normal empty state, not No-connection', async () => {
		items.error = 'Failed to load items';
		items.rows = [];
		network.online = true;
		const { queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		expect(queryByDataTest('items-empty')).not.toBeNull();
		expect(queryByDataTest('no-connection')).toBeNull();
	});

	test('(offline-fab) the add FAB is disabled while offline', async () => {
		items.rows = [ITEM_1];
		network.online = false;
		const { getByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		expect((getByDataTest('items-fab') as HTMLButtonElement).disabled).toBe(true);
	});

	test('(offline-vote) the vote control is disabled while offline', async () => {
		vi.spyOn(history, 'back').mockImplementation(() => {});
		items.rows = [ITEM_1];
		network.online = false;
		const { getByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		expect(getByDataTest('vote-indicator').hasAttribute('data-disabled')).toBe(true);
	});

	test('(c) renders item rows with names and vote controls', async () => {
		items.rows = [ITEM_1, ITEM_2];
		const { queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		expect(queryByDataTest(`row-${ITEM_1.id}`)).not.toBeNull();
		expect(queryByDataTest(`row-${ITEM_2.id}`)).not.toBeNull();
	});

	test('(d) tapping a row opens its extra panel; opening second closes the first', async () => {
		vi.spyOn(history, 'back').mockImplementation(() => {});
		items.rows = [ITEM_1, ITEM_2];
		const { getByDataTest, queryByDataTest, getAllByDataTest } = render(ItemsScreen, {
			listId: 'test-list-id'
		});

		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		expect(queryByDataTest('item-extra')).not.toBeNull();

		await fireEvent.click(getByDataTest(`row-${ITEM_2.id}`));
		await tick();
		expect(getAllByDataTest('item-extra').length).toBe(1);
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

	test('(g2) public list renders the public marker in the TopBar sub line', async () => {
		server.use(
			http.get('*/api/lists', () => HttpResponse.json([{ ...STUB_LIST, is_public: true }]))
		);
		const { queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await vi.waitFor(() => {
			const marker = queryByDataTest('list-public-marker');
			expect(marker).not.toBeNull();
			expect(marker?.textContent).toContain('Public');
		});
	});

	test('(g3) private list renders no public marker', async () => {
		server.use(
			http.get('*/api/lists', () => HttpResponse.json([{ ...STUB_LIST, is_public: false }]))
		);
		const { queryByDataTest, container } = render(ItemsScreen, { listId: 'test-list-id' });
		await vi.waitFor(() => {
			expect(container.textContent).toContain('Test list');
		});
		expect(queryByDataTest('list-public-marker')).toBeNull();
	});

	test('(h) dispatching popstate while extra panel is open closes it', async () => {
		vi.spyOn(history, 'back').mockImplementation(() => {});
		items.rows = [ITEM_1];
		const { getByDataTest, queryByDataTest } = render(ItemsScreen, {
			listId: 'test-list-id'
		});

		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		expect(queryByDataTest('item-extra')).not.toBeNull();

		window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
		await tick();
		expect(queryByDataTest('item-extra')).toBeNull();
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

	test('(overflow-a) opening a row then tapping More renders the overflow sheet', async () => {
		vi.spyOn(history, 'back').mockImplementation(() => {});
		items.rows = [ITEM_1];
		const { getByDataTest, queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		expect(queryByDataTest('item-overflow-sheet-stub')).toBeNull();
		await fireEvent.click(getByDataTest(`item-overflow-${ITEM_1.id}`));
		await tick();
		expect(queryByDataTest('item-overflow-sheet-stub')).not.toBeNull();
	});

	test('(overflow-b) tapping Edit in the overflow sheet opens the edit sheet', async () => {
		vi.spyOn(history, 'back').mockImplementation(() => {});
		items.rows = [ITEM_1];
		const { getByDataTest, queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		await fireEvent.click(getByDataTest(`item-overflow-${ITEM_1.id}`));
		await tick();
		await fireEvent.click(getByDataTest('item-overflow-edit'));
		// The swap closes the overflow sheet and awaits its history.back() popstate
		// before opening the editor (see closeOverlayAndSettle). history.back is
		// mocked to a no-op here, so dispatch the popstate the handler is waiting on.
		window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
		await tick();
		await tick();
		expect(queryByDataTest('add-edit-sheet-stub')).not.toBeNull();
		expect(queryByDataTest('item-overflow-sheet-stub')).toBeNull();
	});

	test('(overflow-c) tapping Delete in the overflow sheet opens the delete sheet', async () => {
		vi.spyOn(history, 'back').mockImplementation(() => {});
		items.rows = [ITEM_1];
		const { getByDataTest, queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		await fireEvent.click(getByDataTest(`item-overflow-${ITEM_1.id}`));
		await tick();
		await fireEvent.click(getByDataTest('item-overflow-delete'));
		// See (overflow-b): the swap awaits the overflow sheet's history.back()
		// popstate before opening the delete sheet; dispatch it here.
		window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
		await tick();
		await tick();
		expect(queryByDataTest('delete-sheet-stub')).not.toBeNull();
		expect(queryByDataTest('item-overflow-sheet-stub')).toBeNull();
	});

	test('(empty-notes) an item with no notes shows the "(no notes)" placeholder', async () => {
		vi.spyOn(history, 'back').mockImplementation(() => {});
		items.rows = [{ ...ITEM_1, notes: null }];
		const { getByDataTest, queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		const placeholder = queryByDataTest(`item-notes-${ITEM_1.id}`);
		expect(placeholder).not.toBeNull();
		expect(placeholder?.textContent).toContain('(no notes)');
	});

	test('(notes-present) an item with notes shows the text, not the placeholder', async () => {
		vi.spyOn(history, 'back').mockImplementation(() => {});
		items.rows = [{ ...ITEM_1, notes: 'A real note' }];
		const { getByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		const notes = getByDataTest(`item-notes-${ITEM_1.id}`);
		expect(notes.textContent).toContain('A real note');
		expect(notes.textContent).not.toContain('(no notes)');
	});

	test('(empty-votes) an item with no member votes shows the "(no votes)" placeholder', async () => {
		vi.spyOn(history, 'back').mockImplementation(() => {});
		items.rows = [{ ...ITEM_1, member_votes: [] }];
		const { getByDataTest, queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		const placeholder = queryByDataTest(`item-votes-${ITEM_1.id}`);
		expect(placeholder).not.toBeNull();
		expect(placeholder?.textContent).toContain('(no votes)');
	});

	test('(votes-present) an item with member votes shows no "(no votes)" placeholder', async () => {
		vi.spyOn(history, 'back').mockImplementation(() => {});
		items.rows = [
			{
				...ITEM_1,
				member_votes: [
					{
						user_id: 'user-1',
						display_name: 'Alice',
						username: 'alice',
						avatar_version: 0,
						value: 2
					}
				]
			}
		];
		const { getByDataTest, queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		expect(queryByDataTest(`item-votes-${ITEM_1.id}`)).toBeNull();
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

	test('(new-d) a voter chip renders the @username handle', async () => {
		items.rows = [
			{
				...ITEM_1,
				member_votes: [
					{
						user_id: 'user-1',
						display_name: 'Alice',
						username: 'alice',
						avatar_version: 0,
						value: 2
					}
				]
			}
		];
		const { getByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		const handle = getByDataTest('vote-handle-user-1');
		expect(handle.textContent).toBe('@alice');
		expect(handle.classList.contains('identity-handle')).toBe(true);
	});

	test('(new-e) the "Added by" line renders the creator @username', async () => {
		items.rows = [{ ...ITEM_1, created_by: 'user-1', created_by_username: 'alice' }];
		const { getByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		expect(getByDataTest(`attribution-creator-handle-${ITEM_1.id}`).textContent).toBe('@alice');
	});

	test('(new-f) the "Last edited by" line renders the editor @username', async () => {
		items.rows = [
			{
				...ITEM_1,
				modified_by: 'user-2',
				modified_by_name: 'Bob',
				modified_by_username: 'bob',
				modified_at: '2026-02-01T00:00:00Z'
			}
		];
		const { getByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		expect(getByDataTest(`attribution-editor-handle-${ITEM_1.id}`).textContent).toBe('@bob');
	});

	test('(new-g) the tombstone creator suppresses the @username handle', async () => {
		items.rows = [
			{
				...ITEM_1,
				created_by: '00000000-0000-0000-0000-000000000000',
				created_by_name: 'Deleted user',
				created_by_username: 'deleted'
			}
		];
		const { getByDataTest, queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		await fireEvent.click(getByDataTest(`row-${ITEM_1.id}`));
		await tick();
		expect(queryByDataTest(`attribution-creator-handle-${ITEM_1.id}`)).toBeNull();
	});
});

describe('Refresh button', () => {
	test('(refresh-a) renders with data-test="items-refresh" and aria-label="Refresh"', () => {
		const { queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		const btn = queryByDataTest('items-refresh');
		expect(btn).not.toBeNull();
		expect(btn?.getAttribute('aria-label')).toBe('Refresh');
	});

	test('(refresh-b) clicking it calls loadItems with the listId prop', async () => {
		const { getByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await tick();
		vi.mocked(loadItems).mockClear();
		await fireEvent.click(getByDataTest('items-refresh'));
		expect(vi.mocked(loadItems)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(loadItems)).toHaveBeenCalledWith('test-list-id');
	});

	test('(refresh-c) is disabled when items.loading is true', () => {
		items.loading = true;
		const { queryByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		const btn = queryByDataTest('items-refresh') as HTMLButtonElement | null;
		expect(btn?.disabled).toBe(true);
	});
});
