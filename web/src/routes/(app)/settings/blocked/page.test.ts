import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import Page from './+page.svelte';

vi.mock('$lib/privacy/state/relationships.svelte');
vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/shared/components/TopBar.svelte');
vi.mock('$lib/shared/state/profile.svelte');

describe('/settings/blocked page', () => {
	test('renders BlockedScreen', () => {
		const { queryByDataTest } = render(Page);
		expect(queryByDataTest('blocked-screen')).not.toBeNull();
	});
});
