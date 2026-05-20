import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { signOut } from '$lib/shared/state/session.svelte';
import { render } from '$lib/test/render';

import Page from './+page.svelte';

vi.mock('$lib/shared/state/session.svelte');
vi.mock('$lib/basic/components/Button.svelte');

afterEach(() => {
	vi.clearAllMocks();
});

describe('/ (placeholder home)', () => {
	test('(a) renders a Sign Out button with data-test="signout"', () => {
		const { queryByDataTest } = render(Page);
		const btn = queryByDataTest('signout');
		expect(btn).not.toBeNull();
		// data-test contract is load-bearing for the Task 5.2 Playwright
		// spec — when Step 4 moves Sign Out into Settings, the new button
		// must keep this same selector.
		expect(btn?.tagName).toBe('BUTTON');
	});

	test('(b) clicking Sign Out calls signOut() exactly once', async () => {
		const { getByDataTest } = render(Page);
		await fireEvent.click(getByDataTest('signout'));
		expect(vi.mocked(signOut)).toHaveBeenCalledTimes(1);
	});
});
