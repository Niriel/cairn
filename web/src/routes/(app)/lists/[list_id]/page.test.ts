import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import Page from './+page.svelte';

vi.mock('$lib/item/components/ItemsScreen.svelte');

describe('/lists/[list_id] page', () => {
	test('(a) renders without throwing', () => {
		const { queryByDataTest } = render(Page);
		expect(queryByDataTest('items-screen-stub')).not.toBeNull();
	});
});
