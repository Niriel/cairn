import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { itemTrash, restoreOne } from '$lib/item/state/item-trash.svelte';
import { render } from '$lib/test/render';
import type { DeletedItem } from '$lib/item/model/item-trash';

import TrashScreen from './TrashScreen.svelte';

vi.mock('$lib/item/state/item-trash.svelte');

const LIST_ID = 'llllllll-llll-llll-llll-llllllllllll';

const ROW_1: DeletedItem = {
	id: 'item-1',
	list_id: LIST_ID,
	name: 'First',
	notes: null,
	deleted_by: 'user-1',
	deleted_by_name: 'Alice',
	deleted_at: '2026-05-01T00:00:00Z'
};

const ROW_2: DeletedItem = { ...ROW_1, id: 'item-2', name: 'Second', deleted_by_name: 'Bob' };

beforeEach(() => {
	Object.assign(itemTrash, {
		rows: [],
		loading: false,
		error: null,
		listId: null,
		listName: null
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('TrashScreen', () => {
	test('(a) shows loading state', async () => {
		itemTrash.loading = true;
		const { queryByDataTest } = render(TrashScreen, { listId: LIST_ID });
		await tick();
		expect(queryByDataTest('trash-loading')).not.toBeNull();
	});

	test('(b) renders one row per deleted item with name and attribution', async () => {
		itemTrash.rows = [ROW_1, ROW_2];
		const { queryByDataTest, getByDataTest } = render(TrashScreen, { listId: LIST_ID });
		await tick();
		expect(queryByDataTest(`trash-row-${ROW_1.id}`)).not.toBeNull();
		expect(queryByDataTest(`trash-row-${ROW_2.id}`)).not.toBeNull();
		const row1 = getByDataTest(`trash-row-${ROW_1.id}`);
		expect(row1.textContent).toContain('First');
		expect(row1.textContent).toContain('deleted by Alice');
	});

	test('(c) shows empty state when rows is empty and not loading', async () => {
		itemTrash.rows = [];
		itemTrash.loading = false;
		const { queryByDataTest } = render(TrashScreen, { listId: LIST_ID });
		await tick();
		expect(queryByDataTest('trash-empty')).not.toBeNull();
	});

	test('(d) clicking restore calls itemTrash.restoreOne with the row id', async () => {
		itemTrash.rows = [ROW_1];
		const { getByDataTest } = render(TrashScreen, { listId: LIST_ID });
		await tick();
		await fireEvent.click(getByDataTest(`trash-restore-${ROW_1.id}`));
		expect(restoreOne).toHaveBeenCalledWith(ROW_1.id);
	});

	test('(e) renders error region when itemTrash.error is set', async () => {
		itemTrash.error = "Couldn't restore — try again.";
		const { queryByDataTest } = render(TrashScreen, { listId: LIST_ID });
		await tick();
		const err = queryByDataTest('trash-error');
		expect(err).not.toBeNull();
		expect(err!.textContent).toContain("Couldn't restore");
	});
});
