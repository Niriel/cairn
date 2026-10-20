import { createRawSnippet } from 'svelte';
import { describe, expect, test } from 'vitest';

import { render } from '$lib/test/render';

import LegalPage from './LegalPage.svelte';

const body = createRawSnippet(() => ({
	render: () => '<p>Body text of the page.</p>'
}));

describe('LegalPage', () => {
	test('shows the title as the screen heading and the subtitle beneath it', () => {
		const { container, getByText } = render(LegalPage, {
			title: 'Privacy policy',
			sub: 'Last updated 20 October 2026',
			children: body
		});
		expect(container.querySelector('h1')?.textContent).toBe('Privacy policy');
		expect(getByText('Last updated 20 October 2026')).toBeTruthy();
	});

	test('renders the page content as long-form prose', () => {
		const { container } = render(LegalPage, { title: 'Terms of service', children: body });
		const prose = container.querySelector('article.prose');
		expect(prose?.textContent).toContain('Body text of the page.');
	});

	test('offers a back button', () => {
		const { getByDataTest } = render(LegalPage, { title: 'Imprint', children: body });
		expect(getByDataTest('topbar-back')).toBeTruthy();
	});

	test('passes its data-test hook to the screen', () => {
		const { getByDataTest } = render(LegalPage, {
			title: 'Imprint',
			children: body,
			'data-test': 'imprint-screen'
		});
		expect(getByDataTest('imprint-screen')).toBeTruthy();
	});
});
