import { describe, expect, test, vi } from 'vitest';

import { OPERATOR } from '$lib/legal/model/operator';
import { render } from '$lib/test/render';
import { normalizedText } from '$lib/test/text';

import Page from './+page.svelte';

vi.mock('$app/paths', () => ({ resolve: vi.fn((path: string) => path) }));

describe('/about/contact', () => {
	test('offers the contact e-mail as a mail link', () => {
		const { getByDataTest } = render(Page);
		const email = getByDataTest('contact-email');
		expect(email.getAttribute('href')).toBe(`mailto:${OPERATOR.email}`);
		expect(email.textContent).toBe(OPERATOR.email);
	});

	test('says what to write about: security, data requests, and illegal content', () => {
		const { container } = render(Page);
		const text = normalizedText(container);
		expect(text).toMatch(/Security/);
		expect(text).toMatch(/good-faith research/);
		expect(text).toMatch(/Privacy and data requests/);
		expect(text).toMatch(/illegal content/);
	});

	test('points postal correspondence to the Imprint', () => {
		const { getByDataTest } = render(Page);
		expect(getByDataTest('contact-imprint-link').getAttribute('href')).toBe('/about/imprint');
	});
});
