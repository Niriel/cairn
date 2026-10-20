import { fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { server } from '$lib/test/server';
import { render } from '$lib/test/render';

import CreateListSheet from './CreateListSheet.svelte';

vi.mock('$lib/basic/components/Sheet.svelte');
vi.mock('$lib/shared/components/ButtonPair.svelte');

afterEach(() => {
	vi.clearAllMocks();
});

const LIST_ROW = {
	id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
	name: 'My list',
	description: null,
	modified_at: '2026-01-01T00:00:00Z'
};

describe('CreateListSheet', () => {
	test('(a) renders name input and description textarea', () => {
		const { queryByDataTest } = render(CreateListSheet, {
			open: true,
			onclose: vi.fn(),
			oncreated: vi.fn()
		});
		expect(queryByDataTest('create-list-name')).not.toBeNull();
		expect(queryByDataTest('create-list-description')).not.toBeNull();
	});

	test('(b) cancel button calls onclose', async () => {
		const onclose = vi.fn();
		const { getByDataTest } = render(CreateListSheet, {
			open: true,
			onclose,
			oncreated: vi.fn()
		});
		await fireEvent.click(getByDataTest('create-list-cancel'));
		expect(onclose).toHaveBeenCalledTimes(1);
	});

	test('(c) submit calls createList and fires oncreated', async () => {
		const oncreated = vi.fn();
		const { getByDataTest, container } = render(CreateListSheet, {
			open: true,
			onclose: vi.fn(),
			oncreated
		});
		await fireEvent.input(getByDataTest('create-list-name'), {
			target: { value: 'My list' }
		});
		await fireEvent.submit(container.querySelector('form')!);
		await vi.waitFor(() => {
			expect(oncreated).toHaveBeenCalledWith(expect.objectContaining({ id: LIST_ROW.id }));
		});
	});

	test('(d) submit failure shows error message', async () => {
		server.use(http.post('*/api/rpc/create_list', () => new HttpResponse(null, { status: 500 })));
		const { getByDataTest, queryByDataTest, container } = render(CreateListSheet, {
			open: true,
			onclose: vi.fn(),
			oncreated: vi.fn()
		});
		await fireEvent.input(getByDataTest('create-list-name'), {
			target: { value: 'My list' }
		});
		await fireEvent.submit(container.querySelector('form')!);
		await vi.waitFor(() => {
			expect(queryByDataTest('create-list-error')).not.toBeNull();
		});
	});

	test('(f) Enter on description textarea submits the form (no newline)', async () => {
		const oncreated = vi.fn();
		const { getByDataTest } = render(CreateListSheet, {
			open: true,
			onclose: vi.fn(),
			oncreated
		});
		await fireEvent.input(getByDataTest('create-list-name'), {
			target: { value: 'My list' }
		});
		await fireEvent.keyDown(getByDataTest('create-list-description'), { key: 'Enter' });
		await vi.waitFor(() => {
			expect(oncreated).toHaveBeenCalledWith(expect.objectContaining({ id: LIST_ROW.id }));
		});
	});

	test('(g) Shift+Enter on description textarea does not submit', async () => {
		const oncreated = vi.fn();
		const { getByDataTest } = render(CreateListSheet, {
			open: true,
			onclose: vi.fn(),
			oncreated
		});
		await fireEvent.input(getByDataTest('create-list-name'), {
			target: { value: 'My list' }
		});
		await fireEvent.keyDown(getByDataTest('create-list-description'), {
			key: 'Enter',
			shiftKey: true
		});
		expect(oncreated).not.toHaveBeenCalled();
	});

	test('(e) create button is disabled while submitting', async () => {
		let resolveCreate!: () => void;
		const createPending = new Promise<void>((r) => {
			resolveCreate = r;
		});
		server.use(
			http.post('*/api/rpc/create_list', async () => {
				await createPending;
				return HttpResponse.json(LIST_ROW);
			})
		);
		const { getByDataTest, container } = render(CreateListSheet, {
			open: true,
			onclose: vi.fn(),
			oncreated: vi.fn()
		});
		await fireEvent.input(getByDataTest('create-list-name'), {
			target: { value: 'My list' }
		});
		await fireEvent.submit(container.querySelector('form')!);
		await tick();
		expect((getByDataTest('create-list-submit') as HTMLButtonElement).disabled).toBe(true);
		resolveCreate();
		await vi.waitFor(() => {
			expect((getByDataTest('create-list-submit') as HTMLButtonElement).disabled).toBe(false);
		});
	});
});
