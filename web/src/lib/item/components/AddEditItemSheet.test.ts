import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { addItem, editItem } from '$lib/item/state/items.svelte';
import { render } from '$lib/test/render';
import type { Item } from '$lib/item/model/item';

import AddEditItemSheet from './AddEditItemSheet.svelte';

vi.mock('$lib/item/state/items.svelte');
vi.mock('$lib/basic/components/Sheet.svelte');
vi.mock('$lib/shared/components/ButtonPair.svelte');

afterEach(() => {
	vi.clearAllMocks();
});

const ITEM: Item = {
	id: 'item-1',
	list_id: 'test-list-id',
	name: 'The Third Man',
	notes: 'Vienna. Zithers.',
	created_by: 'user-1',
	modified_by: 'user-1',
	created_by_name: 'Alice',
	modified_by_name: null,
	created_by_username: 'alice',
	modified_by_username: null,
	score: 2,
	created_at: '2026-01-01T00:00:00Z',
	modified_at: '2026-01-01T00:00:00Z',
	my_vote: 1,
	member_votes: []
};

describe('AddEditItemSheet', () => {
	test('(a) add mode shows "New item" title', () => {
		const { container } = render(AddEditItemSheet, {
			mode: 'add',
			listId: 'test-list-id',
			listName: 'My list',
			onsubmit: vi.fn(),
			oncancel: vi.fn()
		});
		expect(container.textContent).toContain('New item');
	});

	test('(b) edit mode pre-populates name and notes', () => {
		const { getByDataTest } = render(AddEditItemSheet, {
			mode: 'edit',
			listId: 'test-list-id',
			listName: 'My list',
			item: ITEM,
			onsubmit: vi.fn(),
			oncancel: vi.fn()
		});
		expect((getByDataTest('add-edit-name') as HTMLInputElement).value).toBe('The Third Man');
		expect((getByDataTest('add-edit-notes') as HTMLTextAreaElement).value).toBe('Vienna. Zithers.');
	});

	test('(c) submitting in add mode calls addItem', async () => {
		const onsubmit = vi.fn();
		const { getByDataTest, container } = render(AddEditItemSheet, {
			mode: 'add',
			listId: 'test-list-id',
			listName: 'My list',
			onsubmit,
			oncancel: vi.fn()
		});
		await fireEvent.input(getByDataTest('add-edit-name'), { target: { value: 'New film' } });
		await fireEvent.submit(container.querySelector('form')!);
		await vi.waitFor(() => {
			expect(vi.mocked(addItem)).toHaveBeenCalledWith('test-list-id', 'New film', undefined);
		});
	});

	test('(d) submitting in edit mode calls editItem', async () => {
		const onsubmit = vi.fn();
		const { getByDataTest, container } = render(AddEditItemSheet, {
			mode: 'edit',
			listId: 'test-list-id',
			listName: 'My list',
			item: ITEM,
			onsubmit,
			oncancel: vi.fn()
		});
		await fireEvent.input(getByDataTest('add-edit-name'), { target: { value: 'Updated name' } });
		await fireEvent.submit(container.querySelector('form')!);
		await vi.waitFor(() => {
			expect(vi.mocked(editItem)).toHaveBeenCalledWith(
				'item-1',
				'Updated name',
				'Vienna. Zithers.'
			);
		});
	});

	test('(f) Enter on notes textarea (no shift) submits', async () => {
		const onsubmit = vi.fn();
		const { getByDataTest } = render(AddEditItemSheet, {
			mode: 'add',
			listId: 'test-list-id',
			listName: 'My list',
			onsubmit,
			oncancel: vi.fn()
		});
		await fireEvent.input(getByDataTest('add-edit-name'), { target: { value: 'New film' } });
		await fireEvent.keyDown(getByDataTest('add-edit-notes'), { key: 'Enter' });
		await vi.waitFor(() => {
			expect(vi.mocked(addItem)).toHaveBeenCalledWith('test-list-id', 'New film', undefined);
		});
	});

	test('(g) Shift+Enter on notes textarea does not submit', async () => {
		const { getByDataTest } = render(AddEditItemSheet, {
			mode: 'add',
			listId: 'test-list-id',
			listName: 'My list',
			onsubmit: vi.fn(),
			oncancel: vi.fn()
		});
		await fireEvent.input(getByDataTest('add-edit-name'), { target: { value: 'New film' } });
		await fireEvent.keyDown(getByDataTest('add-edit-notes'), { key: 'Enter', shiftKey: true });
		expect(vi.mocked(addItem)).not.toHaveBeenCalled();
	});

	test('(e) cancel calls oncancel without calling addItem or editItem', async () => {
		const oncancel = vi.fn();
		const { getByDataTest } = render(AddEditItemSheet, {
			mode: 'add',
			listId: 'test-list-id',
			listName: 'My list',
			onsubmit: vi.fn(),
			oncancel
		});
		await fireEvent.click(getByDataTest('add-edit-cancel'));
		expect(oncancel).toHaveBeenCalledTimes(1);
		expect(vi.mocked(addItem)).not.toHaveBeenCalled();
	});
});
