import { describe, expect, test } from 'vitest';

import { ATTRIBUTIONS, GROUP_LABELS } from '$lib/legal/model/attributions';
import { render } from '$lib/test/render';
import { headingTexts } from '$lib/test/text';

import Page from './+page.svelte';

describe('/about/open-source', () => {
	test('credits every attributed project by name', () => {
		const { container } = render(Page);
		for (const entry of ATTRIBUTIONS) expect(container.textContent).toContain(entry.name);
	});

	test('groups the credits under their headings', () => {
		const { container } = render(Page);
		const headings = headingTexts(container, 'h3');
		expect(headings).toEqual(Object.values(GROUP_LABELS));
	});

	test('links the full licence texts', () => {
		const { getByDataTest } = render(Page);
		expect(getByDataTest('open-source-licenses-link').getAttribute('href')).toBe(
			'/legal/licenses.txt'
		);
	});
});
