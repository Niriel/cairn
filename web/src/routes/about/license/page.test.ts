import { describe, expect, test } from 'vitest';

import { SOURCE_REPO_URL } from '$lib/legal/model/operator';
import { render } from '$lib/test/render';

import Page from './+page.svelte';

describe('/about/license', () => {
	test("states Cairn's licence", () => {
		const { container } = render(Page);
		expect(container.textContent).toContain('AGPL-3.0-or-later');
	});

	test('links to the source repository, shown without its scheme', () => {
		const { getByDataTest } = render(Page);
		const link = getByDataTest('license-repo-link');
		expect(link.getAttribute('href')).toBe(SOURCE_REPO_URL);
		expect(link.textContent?.trim()).toBe(SOURCE_REPO_URL.replace(/^https:\/\//, ''));
	});

	test('explains what the AGPL means and why it was chosen', () => {
		const { container } = render(Page);
		const headings = [...container.querySelectorAll('h2')].map((h) => h.textContent?.trim());
		expect(headings).toEqual(['What the AGPL means for you', 'Why the AGPL and not MIT']);
	});
});
