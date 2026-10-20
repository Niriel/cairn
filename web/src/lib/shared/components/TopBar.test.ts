import { fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import { navHistory } from '$lib/shared/state/nav-history.svelte';

import TopBar from './TopBar.svelte';

vi.mock('$lib/basic/components/Button.svelte');
// TopBar's default back control is BackOrHome, which reaches for SvelteKit
// navigation on its home-fallback path; stub both so it renders in jsdom.
vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));
vi.mock('$app/paths', () => ({ resolve: vi.fn((p: string) => p) }));
vi.mock('$lib/shared/state/nav-history.svelte');

function span(html: string, dataTest?: string) {
	const attr = dataTest ? ` data-test="${dataTest}"` : '';
	return createRawSnippet(() => ({
		render: () => `<span${attr}>${html}</span>`
	}));
}

describe('TopBar', () => {
	beforeEach(() => {
		navHistory.canGoBack = false;
	});

	test('(a) renders the default snippet as the title', () => {
		const { getByDataTest } = render(TopBar, {
			children: span('Hello', 'title')
		});
		expect(getByDataTest('title').textContent).toBe('Hello');
	});

	test('(b) back arrow calls history.back() when a Cairn page is behind', async () => {
		const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
		try {
			navHistory.canGoBack = true;
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

	test('(e) renders the left snippet when provided', () => {
		const { getByDataTest } = render(TopBar, {
			children: span('Hello'),
			left: span('G', 'left-slot')
		});
		expect(getByDataTest('left-slot')).not.toBeNull();
	});

	test('(f) does not render back button when left is provided', () => {
		const { queryByDataTest } = render(TopBar, {
			children: span('Hello'),
			left: span('G')
		});
		expect(queryByDataTest('topbar-back')).toBeNull();
	});

	test('(g) renders sub text when sub prop is provided', () => {
		const { getByText } = render(TopBar, {
			children: span('Hello'),
			sub: 'hello sub'
		});
		expect(getByText('hello sub')).not.toBeNull();
	});
});
