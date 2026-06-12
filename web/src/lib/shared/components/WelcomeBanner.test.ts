import { fireEvent } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';

vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }));
vi.mock('$app/paths', () => ({ resolve: vi.fn((path: string) => path) }));

import { goto } from '$app/navigation';
import { profile } from '$lib/shared/state/profile.svelte';

import WelcomeBanner from './WelcomeBanner.svelte';

beforeEach(() => {
	vi.clearAllMocks();
	profile.displayName = null;
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('WelcomeBanner', () => {
	test('(a) renders nothing while the display name is still loading (null)', () => {
		profile.displayName = null;
		const { queryByDataTest } = render(WelcomeBanner);
		expect(queryByDataTest('welcome-banner')).toBeNull();
	});

	test('(b) renders nothing when the user has a real name', () => {
		profile.displayName = 'Bob';
		const { queryByDataTest } = render(WelcomeBanner);
		expect(queryByDataTest('welcome-banner')).toBeNull();
	});

	test('(c) renders the welcome banner for a default-named new user', () => {
		profile.displayName = 'New user';
		const { getByDataTest } = render(WelcomeBanner);
		const banner = getByDataTest('welcome-banner');
		expect(banner.textContent).toContain('Welcome to Cairn');
		expect(banner.textContent).toContain('recognise');
		expect(banner.querySelector('[data-test="welcome-banner-edit"]')).not.toBeNull();
	});

	test('(d) the edit button navigates to /profile', async () => {
		profile.displayName = 'New user';
		const { getByDataTest } = render(WelcomeBanner);
		await fireEvent.click(getByDataTest('welcome-banner-edit'));
		expect(goto).toHaveBeenCalledWith('/profile');
	});
});
