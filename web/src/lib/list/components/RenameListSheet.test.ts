import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { pgPatch } from '$lib/shared/http/postgrest';
import { render } from '$lib/test/render';

import RenameListSheet from './RenameListSheet.svelte';

vi.mock('$lib/basic/components/Sheet.svelte');
vi.mock('$lib/shared/http/postgrest');
vi.mock('$lib/list/state/lists.svelte');

afterEach(() => {
	vi.clearAllMocks();
});

describe('RenameListSheet', () => {
	test('(a) input is pre-filled with currentName', () => {
		const { getByDataTest } = render(RenameListSheet, {
			listId: 'list-1',
			currentName: 'My List',
			onclose: vi.fn()
		});
		expect((getByDataTest('rename-list-name') as HTMLInputElement).value).toBe('My List');
	});

	test('(b) Save with non-empty name calls PATCH and then onclose', async () => {
		vi.mocked(pgPatch).mockResolvedValue(undefined);
		const onclose = vi.fn();
		const { getByDataTest } = render(RenameListSheet, {
			listId: 'list-1',
			currentName: 'Old Name',
			onclose
		});
		await fireEvent.input(getByDataTest('rename-list-name'), { target: { value: 'New Name' } });
		await fireEvent.click(getByDataTest('rename-list-save'));
		await vi.waitFor(() => {
			expect(vi.mocked(pgPatch)).toHaveBeenCalledWith('/lists?id=eq.list-1', { name: 'New Name' });
			expect(onclose).toHaveBeenCalledTimes(1);
		});
	});

	test('(c) Save with empty name shows error and does not call PATCH', async () => {
		const { getByDataTest, queryByDataTest } = render(RenameListSheet, {
			listId: 'list-1',
			currentName: 'Old Name',
			onclose: vi.fn()
		});
		await fireEvent.input(getByDataTest('rename-list-name'), { target: { value: '' } });
		await fireEvent.click(getByDataTest('rename-list-save'));
		expect(queryByDataTest('rename-list-error')).not.toBeNull();
		expect(vi.mocked(pgPatch)).not.toHaveBeenCalled();
	});

	test('(d) Cancel calls onclose without PATCH', async () => {
		const onclose = vi.fn();
		const { getByDataTest } = render(RenameListSheet, {
			listId: 'list-1',
			currentName: 'My List',
			onclose
		});
		await fireEvent.click(getByDataTest('rename-list-cancel'));
		expect(onclose).toHaveBeenCalledTimes(1);
		expect(vi.mocked(pgPatch)).not.toHaveBeenCalled();
	});

	test('(f) Enter on input calls PATCH and onclose', async () => {
		vi.mocked(pgPatch).mockResolvedValue(undefined);
		const onclose = vi.fn();
		const { getByDataTest } = render(RenameListSheet, {
			listId: 'list-1',
			currentName: 'Old Name',
			onclose
		});
		await fireEvent.input(getByDataTest('rename-list-name'), { target: { value: 'New Name' } });
		await fireEvent.keyDown(getByDataTest('rename-list-name'), { key: 'Enter' });
		await vi.waitFor(() => {
			expect(vi.mocked(pgPatch)).toHaveBeenCalledWith('/lists?id=eq.list-1', { name: 'New Name' });
			expect(onclose).toHaveBeenCalledTimes(1);
		});
	});

	test('(g) Escape on input calls onclose without PATCH', async () => {
		const onclose = vi.fn();
		const { getByDataTest } = render(RenameListSheet, {
			listId: 'list-1',
			currentName: 'My List',
			onclose
		});
		await fireEvent.keyDown(getByDataTest('rename-list-name'), { key: 'Escape' });
		expect(onclose).toHaveBeenCalledTimes(1);
		expect(vi.mocked(pgPatch)).not.toHaveBeenCalled();
	});

	test('(e) Save with name > 200 chars shows max-length error and does not call PATCH', async () => {
		const { getByDataTest, queryByDataTest, container } = render(RenameListSheet, {
			listId: 'list-1',
			currentName: 'Old Name',
			onclose: vi.fn()
		});
		const longName = 'a'.repeat(201);
		await fireEvent.input(getByDataTest('rename-list-name'), { target: { value: longName } });
		await fireEvent.click(getByDataTest('rename-list-save'));
		expect(queryByDataTest('rename-list-error')).not.toBeNull();
		expect(container.textContent).toContain('200 characters');
		expect(vi.mocked(pgPatch)).not.toHaveBeenCalled();
	});
});
