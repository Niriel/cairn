import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import Page from './+page.svelte';

vi.mock('$lib/list/components/DeletedListsScreen.svelte');

describe('/settings/deleted-lists page', () => {
	test('(a) renders without throwing', () => {
		const { queryByDataTest } = render(Page);
		expect(queryByDataTest('deleted-lists-screen-stub')).not.toBeNull();
	});
});
