import { createRawSnippet } from 'svelte';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { pushHistoryGuard } from '$lib/shared/state/back-stack.svelte';
import { render } from '$lib/test/render';

import Sheet from './Sheet.svelte';

vi.mock('$lib/shared/state/back-stack.svelte');

function content(html: string) {
	return createRawSnippet(() => ({
		render: () => `<span>${html}</span>`
	}));
}

describe('Sheet', () => {
	beforeEach(() => {
		vi.mocked(pushHistoryGuard).mockClear();
	});

	test('(a) pushes history guard once when open flips false → true', async () => {
		const onclose = vi.fn();
		const { rerender } = render(Sheet, {
			open: false,
			onclose,
			'data-test': 'sheet',
			children: content('Hello')
		});

		expect(pushHistoryGuard).not.toHaveBeenCalled();

		await rerender({
			open: true,
			onclose,
			'data-test': 'sheet',
			children: content('Hello')
		});

		expect(pushHistoryGuard).toHaveBeenCalledTimes(1);
	});

	test('(b) calls pushHistoryGuard cleanup when open flips true → false', async () => {
		const onclose = vi.fn();
		const cleanup = vi.fn();
		vi.mocked(pushHistoryGuard).mockReturnValueOnce(cleanup);

		const { rerender } = render(Sheet, {
			open: true,
			onclose,
			'data-test': 'sheet',
			children: content('Hello')
		});

		expect(pushHistoryGuard).toHaveBeenCalledTimes(1);
		expect(cleanup).not.toHaveBeenCalled();

		await rerender({
			open: false,
			onclose,
			'data-test': 'sheet',
			children: content('Hello')
		});

		expect(cleanup).toHaveBeenCalledTimes(1);
	});

	test('(c) renders content slot only when open === true', async () => {
		const onclose = vi.fn();
		const { rerender, queryByDataTest } = render(Sheet, {
			open: false,
			onclose,
			'data-test': 'sheet',
			children: content('Hello')
		});

		expect(queryByDataTest('sheet')).toBeNull();

		await rerender({
			open: true,
			onclose,
			'data-test': 'sheet',
			children: content('Hello')
		});

		expect(queryByDataTest('sheet')).not.toBeNull();
	});
});
