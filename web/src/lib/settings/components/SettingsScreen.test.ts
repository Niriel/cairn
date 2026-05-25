import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { preferences } from '$lib/shared/state/preferences.svelte';
import { profile } from '$lib/shared/state/profile.svelte';
import { signOut } from '$lib/shared/state/session.svelte';
import { render } from '$lib/test/render';

import SettingsScreen from './SettingsScreen.svelte';

vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/shared/components/TopBar.svelte');
vi.mock('$lib/shared/state/profile.svelte');
vi.mock('$lib/shared/state/preferences.svelte');
vi.mock('$lib/shared/state/session.svelte');
vi.mock('$lib/basic/components/Button.svelte');
vi.mock('$app/navigation');
vi.mock('$app/paths');

afterEach(() => {
	vi.clearAllMocks();
	preferences.theme = 'system';
	preferences.fontSize = 'm';
	profile.displayName = null;
});

describe('SettingsScreen', () => {
	test('(a) Sign Out button is present', () => {
		const { queryByDataTest } = render(SettingsScreen);
		expect(queryByDataTest('signout')).not.toBeNull();
	});

	test('(b) clicking Sign Out calls signOut()', async () => {
		const { getByDataTest } = render(SettingsScreen);
		await fireEvent.click(getByDataTest('signout'));
		expect(vi.mocked(signOut)).toHaveBeenCalledTimes(1);
	});

	test('(c) active theme button matches preferences.theme', () => {
		preferences.theme = 'dark';
		const { getByDataTest } = render(SettingsScreen);
		expect(getByDataTest('theme-dark').getAttribute('aria-pressed')).toBe('true');
		expect(getByDataTest('theme-light').getAttribute('aria-pressed')).toBe('false');
		expect(getByDataTest('theme-system').getAttribute('aria-pressed')).toBe('false');
	});

	test('(d) active font size button matches preferences.fontSize', () => {
		preferences.fontSize = 'l';
		const { getByDataTest } = render(SettingsScreen);
		expect(getByDataTest('fontsize-l').getAttribute('aria-pressed')).toBe('true');
		expect(getByDataTest('fontsize-m').getAttribute('aria-pressed')).toBe('false');
	});

	test('(e) clicking a theme button updates preferences.theme', async () => {
		const { getByDataTest } = render(SettingsScreen);
		await fireEvent.click(getByDataTest('theme-light'));
		expect(preferences.theme).toBe('light');
	});

	test('(f) clicking a font size button updates preferences.fontSize', async () => {
		const { getByDataTest } = render(SettingsScreen);
		await fireEvent.click(getByDataTest('fontsize-xl'));
		expect(preferences.fontSize).toBe('xl');
	});

	test('(g) profile chip renders display name when loaded', () => {
		profile.displayName = 'Alice';
		const { queryByDataTest } = render(SettingsScreen);
		expect(queryByDataTest('profile-chip-skeleton')).toBeNull();
		// Avatar mock renders displayName as text content
		expect(queryByDataTest('profile-avatar')?.textContent).toContain('Alice');
	});

	test('(h) profile chip shows skeleton when displayName is null', () => {
		profile.displayName = null;
		const { queryByDataTest } = render(SettingsScreen);
		expect(queryByDataTest('profile-chip-skeleton')).not.toBeNull();
		expect(queryByDataTest('profile-avatar')).toBeNull();
	});

	test('(i) clicking profile chip navigates to /profile', async () => {
		const { goto } = await import('$app/navigation');
		const { resolve } = await import('$app/paths');
		profile.displayName = 'Alice';
		const { getByDataTest } = render(SettingsScreen);
		await fireEvent.click(getByDataTest('profile-chip'));
		expect(vi.mocked(goto)).toHaveBeenCalledOnce();
		expect(vi.mocked(goto)).toHaveBeenCalledWith(vi.mocked(resolve)('/profile'));
	});
});
