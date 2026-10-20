import { describe, expect, test } from 'vitest';

import { render } from '$lib/test/render';

import AuthLegalFooter from './AuthLegalFooter.svelte';

describe('AuthLegalFooter', () => {
	test('links the Imprint, Privacy policy and Terms', () => {
		const { getByDataTest } = render(AuthLegalFooter);
		expect(getByDataTest('legal-imprint-link').getAttribute('href')).toBe('/about/imprint');
		expect(getByDataTest('legal-privacy-link').getAttribute('href')).toBe('/about/privacy');
		expect(getByDataTest('legal-terms-link').getAttribute('href')).toBe('/about/terms');
	});

	test('carries the European-and-private line', () => {
		const { container } = render(AuthLegalFooter);
		expect(container.textContent).toContain('Wholly European, private, and law-abiding.');
	});
});
