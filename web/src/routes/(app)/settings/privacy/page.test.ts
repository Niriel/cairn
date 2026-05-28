import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import Page from './+page.svelte';

vi.mock('$lib/privacy/state/relationships.svelte');
vi.mock('$lib/privacy/state/user-settings.svelte');
vi.mock('$lib/shared/components/TopBar.svelte');
vi.mock('$lib/shared/state/profile.svelte');
vi.mock('$app/navigation');
vi.mock('$app/paths');

describe('/settings/privacy page', () => {
	test('renders PrivacyScreen', () => {
		const { queryByDataTest } = render(Page);
		expect(queryByDataTest('privacy-screen')).not.toBeNull();
	});
});
