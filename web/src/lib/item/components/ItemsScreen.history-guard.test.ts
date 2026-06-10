import { fireEvent } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest';

import { items } from '$lib/item/state/items.svelte';
import { _resetForTesting } from '$lib/shared/state/back-stack.svelte';
import { bumpHistoryVersion, resetHistoryVersion } from '$lib/test/reactive-history.svelte';
import { render } from '$lib/test/render';
import type { Item } from '$lib/item/model/item';

import ItemsScreen from './ItemsScreen.svelte';

// Same regression as Accordion.history-guard, at the surface where the bug bit:
// ItemsScreen hand-rolls the open-item history guard. The mocked pushState READS
// a reactive source; the guard effect must untrack pushHistoryGuard so a later
// history-state change doesn't re-run it and re-push, trapping the back button.
vi.mock('$lib/item/state/items.svelte');
vi.mock('$lib/shared/http/postgrest', () => ({ pgGet: vi.fn(() => Promise.resolve([])) }));
vi.mock('$lib/basic/components/Fab.svelte');
vi.mock('$lib/list/components/ListOverflowSheet.svelte');
vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/shared/components/MoreButton.svelte');
vi.mock('$lib/shared/components/UndoSnackbar.svelte');
vi.mock('$lib/item/components/VoteControl.svelte');
vi.mock('$lib/item/components/AddEditItemSheet.svelte');
vi.mock('$lib/item/components/DeleteItemSheet.svelte');
vi.mock('$app/paths', () => ({ resolve: vi.fn((p: string) => p) }));
vi.mock('$app/navigation', async () => {
	const mod = await import('$lib/test/reactive-history.svelte');
	return {
		goto: vi.fn(() => Promise.resolve()),
		pushState: vi.fn(() => mod.readHistoryVersion())
	};
});

import { pushState } from '$app/navigation';

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

describe('ItemsScreen open-item history guard does not re-track history state', () => {
	let backSpy: MockInstance<typeof history.back>;

	beforeEach(() => {
		Object.assign(items, { rows: [ITEM_1], loading: false, error: null, pendingDelete: null });
	});

	afterEach(() => {
		vi.mocked(pushState).mockClear();
		resetHistoryVersion();
		_resetForTesting();
		backSpy?.mockRestore();
	});

	test('a history-state change after opening a row does not re-push the guard', async () => {
		backSpy = vi.spyOn(history, 'back').mockImplementation(() => {});

		const { getByDataTest } = render(ItemsScreen, { listId: 'test-list-id' });
		await fireEvent.click(getByDataTest('row-item-1'));
		flushSync();

		expect(pushState).toHaveBeenCalledTimes(1);

		bumpHistoryVersion();
		flushSync();

		expect(pushState).toHaveBeenCalledTimes(1);
	});
});
