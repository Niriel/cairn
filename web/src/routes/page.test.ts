import { describe, expect, test } from 'vitest';

import { render } from '$lib/test/render';

import Page from './+page.svelte';

describe('/ (placeholder home)', () => {
	test('(a) renders without throwing', () => {
		const { container } = render(Page);
		expect(container).not.toBeNull();
	});
});
