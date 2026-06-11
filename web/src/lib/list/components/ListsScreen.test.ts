import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { lists, refreshLists } from '$lib/list/state/lists.svelte';
import { render } from '$lib/test/render';

import ListsScreen from './ListsScreen.svelte';

vi.mock('$lib/shared/components/TopBar.svelte');
vi.mock('$lib/basic/components/Fab.svelte');
vi.mock('$lib/basic/components/IconButton.svelte');
vi.mock('$lib/invite/components/InvitesBanner.svelte');
vi.mock('$lib/list/components/CreateListSheet.svelte');
vi.mock('$lib/list/components/ListOverflowSheet.svelte');
vi.mock('$lib/list/state/lists.svelte');
vi.mock('$lib/shared/components/MoreButton.svelte');
vi.mock('$lib/shared/components/UndoSnackbar.svelte');
vi.mock('$lib/shared/state/profile.svelte');
vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));

afterEach(() => {
	vi.clearAllMocks();
	lists.items = [];
	lists.loading = false;
	lists.error = null;
	lists.pendingDelete = null;
});

const LIST_A = {
	id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
	name: 'List A',
	description: null,
	modified_at: '2026-01-01T00:00:00Z',
	item_count: 0,
	is_public: false,
	list_members: []
};

const LIST_B = {
	id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
	name: 'List B',
	description: 'A description',
	modified_at: '2026-01-02T00:00:00Z',
	item_count: 0,
	is_public: false,
	list_members: []
};

const LIST_C = {
	id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
	name: 'List C',
	description: 'Another description',
	modified_at: '2026-01-03T00:00:00Z',
	item_count: 0,
	is_public: false,
	list_members: []
};

describe('ListsScreen', () => {
	test('(z) InvitesBanner stub is mounted', () => {
		const { queryByDataTest } = render(ListsScreen);
		expect(queryByDataTest('invites-banner-stub')).not.toBeNull();
	});

	test('(a) shows loading indicator when lists.loading is true', () => {
		lists.loading = true;
		const { queryByDataTest } = render(ListsScreen);
		expect(queryByDataTest('lists-loading')).not.toBeNull();
	});

	test('(b) shows empty state with CTA button when items is empty and not loading', () => {
		lists.items = [];
		lists.loading = false;
		const { queryByDataTest } = render(ListsScreen);
		const empty = queryByDataTest('lists-empty');
		expect(empty).not.toBeNull();
		const cta = empty?.querySelector('button');
		expect(cta).not.toBeNull();
		expect(cta?.textContent).toContain('Create your first list');
	});

	test('(c) renders one row per list item', () => {
		lists.items = [LIST_A, LIST_B];
		const { queryByDataTest } = render(ListsScreen);
		expect(queryByDataTest(`list-row-${LIST_A.id}`)).not.toBeNull();
		expect(queryByDataTest(`list-row-${LIST_B.id}`)).not.toBeNull();
	});

	test('(d) clicking Fab opens CreateListSheet', async () => {
		const { getByDataTest, queryByDataTest } = render(ListsScreen);
		expect(queryByDataTest('create-list-sheet-stub')).toBeNull();
		await fireEvent.click(getByDataTest('lists-fab'));
		await tick();
		expect(queryByDataTest('create-list-sheet-stub')).not.toBeNull();
	});

	test('(e) navigate to list on row click', async () => {
		const { goto } = await import('$app/navigation');
		lists.items = [LIST_A];
		const { getByDataTest } = render(ListsScreen);
		await fireEvent.click(getByDataTest(`list-nav-${LIST_A.id}`));
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/lists/' + LIST_A.id);
	});

	test('(f) clicking description with content expands it', async () => {
		lists.items = [LIST_B];
		const { getByDataTest } = render(ListsScreen);
		const descEl = getByDataTest(`list-desc-${LIST_B.id}`);
		expect(descEl.classList.contains('expanded')).toBe(false);
		await fireEvent.click(descEl);
		await tick();
		expect(descEl.classList.contains('expanded')).toBe(true);
	});

	test('(g) two descriptions can be expanded simultaneously', async () => {
		lists.items = [LIST_B, LIST_C];
		const { getByDataTest } = render(ListsScreen);
		const descB = getByDataTest(`list-desc-${LIST_B.id}`);
		const descC = getByDataTest(`list-desc-${LIST_C.id}`);
		await fireEvent.click(descB);
		await tick();
		await fireEvent.click(descC);
		await tick();
		expect(descB.classList.contains('expanded')).toBe(true);
		expect(descC.classList.contains('expanded')).toBe(true);
	});

	test('(h) null-description row renders (no description) text', () => {
		lists.items = [LIST_A];
		const { getByDataTest } = render(ListsScreen);
		const descEl = getByDataTest(`list-desc-${LIST_A.id}`);
		expect(descEl.textContent).toContain('(no description)');
	});

	test('(i) metadata shows item count', () => {
		lists.items = [{ ...LIST_B, item_count: 3, list_members: [] }];
		const { getByDataTest } = render(ListsScreen);
		const row = getByDataTest(`list-row-${LIST_B.id}`);
		expect(row.textContent).toContain('3 items');
	});

	test('(j) public list renders the public marker with an accessible label', () => {
		lists.items = [{ ...LIST_A, is_public: true }];
		const { getByDataTest } = render(ListsScreen);
		const marker = getByDataTest(`list-public-marker-${LIST_A.id}`);
		expect(marker.textContent).toContain('Public list');
	});

	test('(k) private list renders no public marker', () => {
		lists.items = [LIST_A]; // is_public: false
		const { queryByDataTest } = render(ListsScreen);
		expect(queryByDataTest(`list-public-marker-${LIST_A.id}`)).toBeNull();
	});

	test('(new-b) clicking overflow button renders ListOverflowSheet', async () => {
		lists.items = [LIST_A];
		const { getByDataTest, queryByDataTest } = render(ListsScreen);
		expect(queryByDataTest('list-overflow-sheet-stub')).toBeNull();
		await fireEvent.click(getByDataTest(`list-overflow-${LIST_A.id}`));
		await tick();
		expect(queryByDataTest('list-overflow-sheet-stub')).not.toBeNull();
	});

	test('(new-c) when lists.pendingDelete is set, UndoSnackbar is present', () => {
		lists.items = [LIST_A];
		lists.pendingDelete = { list: LIST_A, timerId: setTimeout(() => {}, 0) };
		const { queryByDataTest } = render(ListsScreen);
		expect(queryByDataTest('list-undo-snackbar')).not.toBeNull();
	});

	test('(new-d) when lists.pendingDelete is set, Fab is absent', () => {
		lists.items = [LIST_A];
		lists.pendingDelete = { list: LIST_A, timerId: setTimeout(() => {}, 0) };
		const { queryByDataTest } = render(ListsScreen);
		expect(queryByDataTest('lists-fab')).toBeNull();
	});
});

describe('Refresh button', () => {
	test('(refresh-a) renders with data-test="lists-refresh" and aria-label="Refresh"', () => {
		const { queryByDataTest } = render(ListsScreen);
		const btn = queryByDataTest('lists-refresh');
		expect(btn).not.toBeNull();
		expect(btn?.getAttribute('aria-label')).toBe('Refresh');
	});

	test('(refresh-b) clicking it calls refreshLists', async () => {
		const { getByDataTest } = render(ListsScreen);
		await fireEvent.click(getByDataTest('lists-refresh'));
		expect(vi.mocked(refreshLists)).toHaveBeenCalledTimes(1);
	});

	test('(refresh-c) is disabled when lists.loading is true', () => {
		lists.loading = true;
		const { queryByDataTest } = render(ListsScreen);
		const btn = queryByDataTest('lists-refresh') as HTMLButtonElement | null;
		expect(btn?.disabled).toBe(true);
	});
});
