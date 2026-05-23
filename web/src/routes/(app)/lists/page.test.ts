import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import Page from './+page.svelte';

vi.mock('$lib/list/components/ListsScreen.svelte');

describe('/lists page', () => {
	test('(a) renders without throwing', () => {
		const { queryByDataTest } = render(Page);
		expect(queryByDataTest('lists-screen-stub')).not.toBeNull();
	});
});
