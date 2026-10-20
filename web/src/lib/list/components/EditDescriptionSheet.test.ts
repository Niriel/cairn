import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { pgPatch } from '$lib/shared/http/postgrest';
import { render } from '$lib/test/render';

import EditDescriptionSheet from './EditDescriptionSheet.svelte';

vi.mock('$lib/basic/components/Sheet.svelte');
vi.mock('$lib/shared/http/postgrest');
vi.mock('$lib/list/state/lists.svelte');

afterEach(() => {
	vi.clearAllMocks();
});

describe('EditDescriptionSheet', () => {
	test('(a) textarea is pre-filled with currentDescription', () => {
		const { getByDataTest } = render(EditDescriptionSheet, {
			listId: 'list-1',
			currentDescription: 'My description',
			onclose: vi.fn()
		});
		expect((getByDataTest('edit-description-textarea') as HTMLTextAreaElement).value).toBe(
			'My description'
		);
	});

	test('(a) textarea is empty when currentDescription is null', () => {
		const { getByDataTest } = render(EditDescriptionSheet, {
			listId: 'list-1',
			currentDescription: null,
			onclose: vi.fn()
		});
		expect((getByDataTest('edit-description-textarea') as HTMLTextAreaElement).value).toBe('');
	});

	test('(b) Save with non-empty text sends the trimmed value', async () => {
		vi.mocked(pgPatch).mockResolvedValue(undefined);
		const onclose = vi.fn();
		const { getByDataTest } = render(EditDescriptionSheet, {
			listId: 'list-1',
			currentDescription: null,
			onclose
		});
		await fireEvent.input(getByDataTest('edit-description-textarea'), {
			target: { value: '  A description  ' }
		});
		await fireEvent.click(getByDataTest('edit-description-save'));
		await vi.waitFor(() => {
			expect(vi.mocked(pgPatch)).toHaveBeenCalledWith('/lists?id=eq.list-1', {
				description: 'A description'
			});
			expect(onclose).toHaveBeenCalledTimes(1);
		});
	});

	test('(c) Save with blank text sends null', async () => {
		vi.mocked(pgPatch).mockResolvedValue(undefined);
		const onclose = vi.fn();
		const { getByDataTest } = render(EditDescriptionSheet, {
			listId: 'list-1',
			currentDescription: 'Old description',
			onclose
		});
		await fireEvent.input(getByDataTest('edit-description-textarea'), {
			target: { value: '   ' }
		});
		await fireEvent.click(getByDataTest('edit-description-save'));
		await vi.waitFor(() => {
			expect(vi.mocked(pgPatch)).toHaveBeenCalledWith('/lists?id=eq.list-1', {
				description: null
			});
			expect(onclose).toHaveBeenCalledTimes(1);
		});
	});

	test('(e) Enter on textarea (no shift) calls PATCH and onclose', async () => {
		vi.mocked(pgPatch).mockResolvedValue(undefined);
		const onclose = vi.fn();
		const { getByDataTest } = render(EditDescriptionSheet, {
			listId: 'list-1',
			currentDescription: null,
			onclose
		});
		await fireEvent.input(getByDataTest('edit-description-textarea'), {
			target: { value: 'A description' }
		});
		await fireEvent.keyDown(getByDataTest('edit-description-textarea'), { key: 'Enter' });
		await vi.waitFor(() => {
			expect(vi.mocked(pgPatch)).toHaveBeenCalledWith('/lists?id=eq.list-1', {
				description: 'A description'
			});
			expect(onclose).toHaveBeenCalledTimes(1);
		});
	});

	test('(f) Shift+Enter on textarea does not trigger save', async () => {
		const onclose = vi.fn();
		const { getByDataTest } = render(EditDescriptionSheet, {
			listId: 'list-1',
			currentDescription: null,
			onclose
		});
		await fireEvent.input(getByDataTest('edit-description-textarea'), {
			target: { value: 'A description' }
		});
		await fireEvent.keyDown(getByDataTest('edit-description-textarea'), {
			key: 'Enter',
			shiftKey: true
		});
		expect(vi.mocked(pgPatch)).not.toHaveBeenCalled();
		expect(onclose).not.toHaveBeenCalled();
	});

	test('(d) Cancel calls onclose', async () => {
		const onclose = vi.fn();
		const { getByDataTest } = render(EditDescriptionSheet, {
			listId: 'list-1',
			currentDescription: null,
			onclose
		});
		await fireEvent.click(getByDataTest('edit-description-cancel'));
		expect(onclose).toHaveBeenCalledTimes(1);
		expect(vi.mocked(pgPatch)).not.toHaveBeenCalled();
	});
});
