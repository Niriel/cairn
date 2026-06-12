import { describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

import Page from './+page.svelte';

vi.mock('$lib/shared/components/TopBar.svelte');
vi.mock('$lib/shared/state/profile.svelte');
vi.mock('$lib/basic/components/Button.svelte');
vi.mock('$lib/export/state/export.svelte');

describe('/settings/data-export page', () => {
	test('(a) renders the export hub', () => {
		const { queryByDataTest } = render(Page);
		expect(queryByDataTest('export-prepare')).not.toBeNull();
	});
});
