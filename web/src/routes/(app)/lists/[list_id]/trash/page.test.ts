import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import Page from './+page.svelte';

vi.mock('$lib/item/components/TrashScreen.svelte');

describe('/lists/[list_id]/trash page', () => {
	test('(a) renders without throwing', () => {
		const { queryByDataTest } = render(Page);
		expect(queryByDataTest('trash-screen-stub')).not.toBeNull();
	});
});
