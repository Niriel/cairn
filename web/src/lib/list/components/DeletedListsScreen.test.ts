import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { listTrash, loadDeletedLists, restoreOne } from '$lib/list/state/list-trash.svelte';
import { render } from '$lib/test/render';
import type { DeletedList } from '$lib/list/model/list-trash';

import DeletedListsScreen from './DeletedListsScreen.svelte';

vi.mock('$lib/list/state/list-trash.svelte');

const ROW_1: DeletedList = {
	id: 'list-1',
	name: 'Old favourites',
	description: null,
	deleted_by: 'user-1',
	deleted_by_name: 'Alice',
	deleted_at: '2026-05-01T00:00:00Z'
};

const ROW_2: DeletedList = {
	...ROW_1,
	id: 'list-2',
	name: 'Reading list',
	deleted_by_name: 'Bob'
};

beforeEach(() => {
	Object.assign(listTrash, { rows: [], loading: false, error: null });
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('DeletedListsScreen', () => {
	test('(a) shows loading state', async () => {
		listTrash.loading = true;
		const { queryByDataTest } = render(DeletedListsScreen);
		await tick();
		expect(queryByDataTest('deleted-lists-loading')).not.toBeNull();
	});

	test('(b) renders one row per deleted list with name and attribution', async () => {
		listTrash.rows = [ROW_1, ROW_2];
		const { queryByDataTest, getByDataTest } = render(DeletedListsScreen);
		await tick();
		expect(queryByDataTest(`deleted-list-row-${ROW_1.id}`)).not.toBeNull();
		expect(queryByDataTest(`deleted-list-row-${ROW_2.id}`)).not.toBeNull();
		const row1 = getByDataTest(`deleted-list-row-${ROW_1.id}`);
		expect(row1.textContent).toContain('Old favourites');
		expect(row1.textContent).toContain('deleted by Alice');
	});

	test('(c) shows empty state when rows is empty and not loading', async () => {
		listTrash.rows = [];
		listTrash.loading = false;
		const { queryByDataTest } = render(DeletedListsScreen);
		await tick();
		expect(queryByDataTest('deleted-lists-empty')).not.toBeNull();
	});

	test('(d) clicking restore calls listTrash.restoreOne with the row id', async () => {
		listTrash.rows = [ROW_1];
		const { getByDataTest } = render(DeletedListsScreen);
		await tick();
		await fireEvent.click(getByDataTest(`deleted-list-restore-${ROW_1.id}`));
		expect(restoreOne).toHaveBeenCalledWith(ROW_1.id);
	});

	test('(e) renders error region when listTrash.error is set', async () => {
		listTrash.error = "Couldn't restore — try again.";
		const { queryByDataTest } = render(DeletedListsScreen);
		await tick();
		const err = queryByDataTest('deleted-lists-error');
		expect(err).not.toBeNull();
		expect(err!.textContent).toContain("Couldn't restore");
	});
});

describe('Refresh button', () => {
	test('(refresh-a) renders with data-test="deleted-lists-refresh" and aria-label="Refresh"', () => {
		const { queryByDataTest } = render(DeletedListsScreen);
		const btn = queryByDataTest('deleted-lists-refresh');
		expect(btn).not.toBeNull();
		expect(btn?.getAttribute('aria-label')).toBe('Refresh');
	});

	test('(refresh-b) clicking it calls loadDeletedLists', async () => {
		const { getByDataTest } = render(DeletedListsScreen);
		await tick();
		vi.mocked(loadDeletedLists).mockClear();
		await fireEvent.click(getByDataTest('deleted-lists-refresh'));
		expect(vi.mocked(loadDeletedLists)).toHaveBeenCalledTimes(1);
	});

	test('(refresh-c) is disabled when listTrash.loading is true', () => {
		listTrash.loading = true;
		const { queryByDataTest } = render(DeletedListsScreen);
		const btn = queryByDataTest('deleted-lists-refresh') as HTMLButtonElement | null;
		expect(btn?.disabled).toBe(true);
	});
});
