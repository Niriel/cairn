import { describe, expect, test } from 'vitest';

import { OPERATOR } from '$lib/legal/model/operator';
import { render } from '$lib/test/render';

import Page from './+page.svelte';

describe('/about/imprint', () => {
	test('(a) names the operator with their full postal address', () => {
		const { getByDataTest } = render(Page);
		const address = getByDataTest('imprint-address').textContent ?? '';
		expect(address).toContain(OPERATOR.name);
		for (const line of OPERATOR.addressLines) expect(address).toContain(line);
		expect(address).toContain(OPERATOR.country);
	});

	test('(b) offers the contact e-mail as a mail link', () => {
		const { getByDataTest } = render(Page);
		const email = getByDataTest('imprint-email');
		expect(email.getAttribute('href')).toBe(`mailto:${OPERATOR.email}`);
		expect(email.textContent).toBe(OPERATOR.email);
	});

	test('(c) states who is responsible for the content', () => {
		const { getByText } = render(Page);
		expect(getByText('Responsible for content')).toBeTruthy();
	});

	test("(e) explains that the brand is the operator's personal label", () => {
		const { getByDataTest } = render(Page);
		expect(getByDataTest('imprint-brand').textContent).toBe(
			`${OPERATOR.brand} is the personal label of ${OPERATOR.name}.`
		);
	});

	test('(d) ships no placeholder text', () => {
		const { container } = render(Page);
		expect(container.textContent).not.toMatch(/\[[^\]]+\]/);
	});
});
