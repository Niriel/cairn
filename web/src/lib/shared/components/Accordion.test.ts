import { fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import Accordion from './Accordion.svelte';

function content(html: string, dataTest?: string) {
	const attr = dataTest ? ` data-test="${dataTest}"` : '';
	return createRawSnippet(() => ({
		render: () => `<span${attr}>${html}</span>`
	}));
}

describe('Accordion (real back-stack)', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		history.replaceState(null, '');
	});

	test('(a) clicking the header calls onexpand when collapsed', async () => {
		const onexpand = vi.fn();
		const oncollapse = vi.fn();
		const { getByDataTest } = render(Accordion, {
			expanded: false,
			pushesHistory: true,
			onexpand,
			oncollapse,
			'data-test': 'acc',
			header: content('Header'),
			body: content('Body')
		});
		await fireEvent.click(getByDataTest('acc-header'));
		expect(onexpand).toHaveBeenCalledTimes(1);
	});

	test('(b) CANARY: synthetic popstate triggers oncollapse when expanded with pushesHistory', () => {
		vi.spyOn(history, 'back').mockImplementation(() => {});
		const onexpand = vi.fn();
		const oncollapse = vi.fn();
		render(Accordion, {
			expanded: true,
			pushesHistory: true,
			onexpand,
			oncollapse,
			'data-test': 'acc',
			header: content('Header'),
			body: content('Body')
		});
		window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
		expect(oncollapse).toHaveBeenCalledTimes(1);
	});

	test('(c) flipping expanded true → false runs cleanup that calls history.back', async () => {
		const backSpy = vi.spyOn(history, 'back').mockImplementation(() => {});
		const onexpand = vi.fn();
		const oncollapse = vi.fn();
		const { rerender } = render(Accordion, {
			expanded: true,
			pushesHistory: true,
			onexpand,
			oncollapse,
			'data-test': 'acc',
			header: content('Header'),
			body: content('Body')
		});
		expect(backSpy).not.toHaveBeenCalled();
		await rerender({
			expanded: false,
			pushesHistory: true,
			onexpand,
			oncollapse,
			'data-test': 'acc',
			header: content('Header'),
			body: content('Body')
		});
		expect(backSpy).toHaveBeenCalledTimes(1);
	});

	test('(d) body slot renders only when expanded === true', async () => {
		const onexpand = vi.fn();
		const oncollapse = vi.fn();
		const { rerender, queryByDataTest } = render(Accordion, {
			expanded: false,
			pushesHistory: false,
			onexpand,
			oncollapse,
			'data-test': 'acc',
			header: content('Header'),
			body: content('Body', 'acc-body')
		});
		expect(queryByDataTest('acc-body')).toBeNull();
		await rerender({
			expanded: true,
			pushesHistory: false,
			onexpand,
			oncollapse,
			'data-test': 'acc',
			header: content('Header'),
			body: content('Body', 'acc-body')
		});
		expect(queryByDataTest('acc-body')).not.toBeNull();
	});
});
