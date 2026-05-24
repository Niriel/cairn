import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import Page from './+page.svelte';

vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/shared/components/TopBar.svelte');
vi.mock('$lib/shared/state/profile.svelte');
vi.mock('$lib/shared/state/preferences.svelte');
vi.mock('$lib/shared/state/session.svelte');
vi.mock('$lib/basic/components/Button.svelte');

describe('/settings page', () => {
	test('(a) renders without throwing and contains the signout button', () => {
		const { queryByDataTest } = render(Page);
		expect(queryByDataTest('signout')).not.toBeNull();
	});
});
