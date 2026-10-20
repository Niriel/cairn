import { fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { pushHistoryGuard } from '$lib/shared/state/back-stack.svelte';
import { render } from '$lib/test/render';

import Sheet from './Sheet.svelte';

vi.mock('$lib/shared/state/back-stack.svelte');

function content(html: string) {
	return createRawSnippet(() => ({
		render: () => `<span>${html}</span>`
	}));
}

function markup(html: string) {
	return createRawSnippet(() => ({ render: () => `<div>${html}</div>` }));
}

describe('Sheet', () => {
	beforeEach(() => {
		vi.mocked(pushHistoryGuard).mockClear();
	});

	afterEach(() => {
		document.body.replaceChildren();
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

	test('(d) focuses the first text field on open, caret at the end', () => {
		const { getByDataTest } = render(Sheet, {
			open: true,
			onclose: vi.fn(),
			children: markup(
				'<input type="file" /><input type="text" data-test="name" value="Casablanca" /><textarea></textarea>'
			)
		});
		const name = getByDataTest('name') as HTMLInputElement;
		expect(document.activeElement).toBe(name);
		expect(name.selectionStart).toBe('Casablanca'.length);
	});

	test('(e) focuses a textarea when it is the first text field', () => {
		const { container } = render(Sheet, {
			open: true,
			onclose: vi.fn(),
			children: markup('<button>Pick</button><textarea></textarea>')
		});
		expect(document.activeElement).toBe(container.querySelector('textarea'));
	});

	test('(f) leaves focus alone when the sheet has no text field', () => {
		const opener = document.body.appendChild(document.createElement('button'));
		opener.focus();
		render(Sheet, { open: true, onclose: vi.fn(), children: markup('<button>Delete</button>') });
		expect(document.activeElement).toBe(opener);
	});

	test('(g) returns focus to the opener on close', async () => {
		const opener = document.body.appendChild(document.createElement('button'));
		opener.focus();
		const props = { onclose: vi.fn(), children: markup('<input type="text" />') };
		const { rerender } = render(Sheet, { ...props, open: true });
		expect(document.activeElement).not.toBe(opener);

		await rerender({ ...props, open: false });

		expect(document.activeElement).toBe(opener);
	});

	test('(h) Escape closes only the topmost of nested sheets', async () => {
		const outerClose = vi.fn();
		const innerClose = vi.fn();
		render(Sheet, { open: true, onclose: outerClose, children: content('Overflow') });
		render(Sheet, { open: true, onclose: innerClose, children: markup('<input type="text" />') });

		await fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

		expect(innerClose).toHaveBeenCalledTimes(1);
		expect(outerClose).not.toHaveBeenCalled();
	});

	test('(i) once the inner sheet closes, Escape reaches the outer one', async () => {
		const outerClose = vi.fn();
		render(Sheet, { open: true, onclose: outerClose, children: content('Overflow') });
		const inner = { onclose: vi.fn(), children: content('Rename') };
		const { rerender } = render(Sheet, { ...inner, open: true });
		await rerender({ ...inner, open: false });

		await fireEvent.keyDown(window, { key: 'Escape' });

		expect(outerClose).toHaveBeenCalledTimes(1);
	});
});
