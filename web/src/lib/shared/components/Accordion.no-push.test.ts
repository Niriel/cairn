import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { pushHistoryGuard } from '$lib/shared/state/back-stack.svelte';
import { render } from '$lib/test/render';

import Accordion from './Accordion.svelte';

vi.mock('$lib/shared/state/back-stack.svelte');

function content(html: string) {
	return createRawSnippet(() => ({
		render: () => `<span>${html}</span>`
	}));
}

describe('Accordion with pushesHistory={false}', () => {
	afterEach(() => {
		vi.mocked(pushHistoryGuard).mockClear();
	});

	test('(e) pushHistoryGuard never called and popstate does not collapse', async () => {
		const onexpand = vi.fn();
		const oncollapse = vi.fn();
		const { rerender } = render(Accordion, {
			expanded: false,
			pushesHistory: false,
			onexpand,
			oncollapse,
			'data-test': 'acc',
			header: content('Header'),
			body: content('Body')
		});
		await rerender({
			expanded: true,
			pushesHistory: false,
			onexpand,
			oncollapse,
			'data-test': 'acc',
			header: content('Header'),
			body: content('Body')
		});
		expect(pushHistoryGuard).not.toHaveBeenCalled();

		window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
		expect(oncollapse).not.toHaveBeenCalled();
	});
});
