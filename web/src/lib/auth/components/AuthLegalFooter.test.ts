import { describe, expect, test } from 'vitest';

import { render } from '$lib/test/render';

import AuthLegalFooter from './AuthLegalFooter.svelte';

describe('AuthLegalFooter', () => {
	test('links the Imprint, Privacy policy and Terms under the given hook prefix', () => {
		const { getByDataTest } = render(AuthLegalFooter, { hookPrefix: 'signin' });
		expect(getByDataTest('signin-imprint-link').getAttribute('href')).toBe('/about/imprint');
		expect(getByDataTest('signin-privacy-link').getAttribute('href')).toBe('/about/privacy');
		expect(getByDataTest('signin-terms-link').getAttribute('href')).toBe('/about/terms');
	});

	test('carries the European-and-private line', () => {
		const { container } = render(AuthLegalFooter, { hookPrefix: 'register' });
		expect(container.textContent).toContain('Wholly European, private, and law-abiding.');
	});
});
