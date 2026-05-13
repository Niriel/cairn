import { fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import TopBar from './TopBar.svelte';

vi.mock('$lib/basic/components/Button.svelte');

function span(html: string, dataTest?: string) {
	const attr = dataTest ? ` data-test="${dataTest}"` : '';
	return createRawSnippet(() => ({
		render: () => `<span${attr}>${html}</span>`
	}));
}

describe('TopBar', () => {
	test('(a) renders the default snippet as the title', () => {
		const { getByDataTest } = render(TopBar, {
			children: span('Hello', 'title')
		});
		expect(getByDataTest('title').textContent).toBe('Hello');
	});

	test('(b) back arrow calls history.back()', async () => {
		const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
		try {
			const { getByDataTest } = render(TopBar, {
				children: span('Hello')
			});
			await fireEvent.click(getByDataTest('topbar-back'));
			expect(backSpy).toHaveBeenCalledTimes(1);
		} finally {
			backSpy.mockRestore();
		}
	});

	test('(c) showBack={false} hides the back button', () => {
		const { queryByDataTest } = render(TopBar, {
			showBack: false,
			children: span('Hello')
		});
		expect(queryByDataTest('topbar-back')).toBeNull();
	});

	test('(d) renders the right snippet when provided', () => {
		const { getByDataTest } = render(TopBar, {
			children: span('Hello'),
			right: span('⚙', 'cog')
		});
		expect(getByDataTest('cog')).not.toBeNull();
	});
});
