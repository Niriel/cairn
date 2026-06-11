import { describe, expect, test } from 'vitest';

import { render } from '$lib/test/render';

import Page from './+page.svelte';

describe('/imprint', () => {
	test('renders the operator, postal address, and a contact e-mail line', () => {
		const { getByDataTest } = render(Page);

		expect(getByDataTest('imprint-screen')).toBeTruthy();
		expect(getByDataTest('imprint-operator').textContent).toMatch(/operator name/i);
		expect(getByDataTest('imprint-address').textContent).toMatch(/country/i);
		// The contact line is an e-mail address (placeholder), so it carries an @.
		expect(getByDataTest('imprint-email').textContent).toContain('@');
	});

	test('every detail is a clearly-marked placeholder (deploy gate R9)', () => {
		const { getByDataTest } = render(Page);

		// Bracketed placeholders signal the operator must replace them before
		// the URL is shared — none should ship as a real-looking value.
		for (const hook of ['imprint-operator', 'imprint-address', 'imprint-email']) {
			expect(getByDataTest(hook).textContent).toContain('[');
		}
	});
});
