import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { preferences } from '$lib/shared/state/preferences.svelte';
import { profile } from '$lib/shared/state/profile.svelte';
import { session, signOut } from '$lib/shared/state/session.svelte';
import { invitations } from '$lib/invite/state/invitations.svelte';
import { install } from '$lib/pwa/state/install.svelte';
import { render } from '$lib/test/render';

import SettingsScreen from './SettingsScreen.svelte';

vi.mock('$lib/shared/components/Avatar.svelte');
vi.mock('$lib/shared/components/TopBar.svelte');
vi.mock('$lib/shared/state/profile.svelte');
vi.mock('$lib/shared/state/preferences.svelte');
vi.mock('$lib/shared/state/session.svelte');
vi.mock('$lib/basic/components/Button.svelte');
vi.mock('$lib/invite/state/invitations.svelte');
vi.mock('$lib/privacy/state/user-settings.svelte');
vi.mock('$lib/pwa/state/install.svelte');
vi.mock('$lib/pwa/components/InstallExplainerSheet.svelte');
vi.mock('$lib/auth/model/auth-client', () => ({
	setRecoveryEmail: vi.fn(),
	removeRecoveryEmail: vi.fn(),
	confirmRecoveryEmail: vi.fn()
}));
vi.mock('$app/navigation');
vi.mock('$app/paths');

afterEach(() => {
	vi.clearAllMocks();
	preferences.theme = 'system';
	preferences.fontSize = 'm';
	profile.displayName = null;
	invitations.inbox = [];
	session.current = { status: 'unknown' };
	install.canPrompt = false;
	install.isStandalone = false;
	install.isIos = false;
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

	test('(f-2) recovery e-mail row is mounted in the Account section', () => {
		const { queryByDataTest } = render(SettingsScreen);
		expect(queryByDataTest('recovery-email-add')).not.toBeNull();
	});

	test('(g) profile chip renders display name when loaded', () => {
		profile.displayName = 'Alice';
		const { queryByDataTest } = render(SettingsScreen);
		expect(queryByDataTest('profile-chip-skeleton')).toBeNull();
		// Avatar mock renders displayName as text content
		expect(queryByDataTest('profile-avatar')?.textContent).toContain('Alice');
	});

	test('(g-2) profile chip renders the own @username from the session', () => {
		profile.displayName = 'Alice';
		session.current = { status: 'signed-in', user: { id: 'u-alice', username: 'alice' } };
		const { getByDataTest } = render(SettingsScreen);
		expect(getByDataTest('profile-chip').textContent).toContain('@alice');
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

	test('(j-1) People section is first preference-group, before Colour theme', () => {
		const { container } = render(SettingsScreen);
		const groups = container.querySelectorAll('section.preference-group');
		expect(groups[0]?.textContent).toContain('People');
		expect(groups[1]?.textContent).toContain('Colour theme');
	});

	test('(j-2) People section heading is "People"', () => {
		const { container } = render(SettingsScreen);
		const groups = container.querySelectorAll('section.preference-group');
		expect(groups[0]?.querySelector('h2')?.textContent).toBe('People');
	});

	test('(j-3) Invites row renders with "No pending invites" sub-line', () => {
		const { getByDataTest } = render(SettingsScreen);
		expect(getByDataTest('settings-invites').textContent).toContain('No pending invites');
	});

	test('(j-4) Invites row is a <button>', () => {
		const { getByDataTest } = render(SettingsScreen);
		expect(getByDataTest('settings-invites').tagName).toBe('BUTTON');
	});

	test('(j-5) clicking Invites row navigates to /settings/invites', async () => {
		const { goto } = await import('$app/navigation');
		const { resolve } = await import('$app/paths');
		const { getByDataTest } = render(SettingsScreen);
		await fireEvent.click(getByDataTest('settings-invites'));
		expect(vi.mocked(goto)).toHaveBeenCalledOnce();
		expect(vi.mocked(goto)).toHaveBeenCalledWith(vi.mocked(resolve)('/settings/invites'));
	});

	test('(j-5b) when inbox has 3 entries, sub-line shows "3 pending"', () => {
		invitations.inbox = [
			{
				id: '1',
				listId: 'l1',
				listName: 'L1',
				inviterUid: 'u1',
				inviterName: 'A',
				inviterAvatarVersion: 0,
				createdAt: ''
			},
			{
				id: '2',
				listId: 'l2',
				listName: 'L2',
				inviterUid: 'u2',
				inviterName: 'B',
				inviterAvatarVersion: 0,
				createdAt: ''
			},
			{
				id: '3',
				listId: 'l3',
				listName: 'L3',
				inviterUid: 'u3',
				inviterName: 'C',
				inviterAvatarVersion: 0,
				createdAt: ''
			}
		];
		const { getByDataTest } = render(SettingsScreen);
		expect(getByDataTest('settings-invites').textContent).toContain('3 pending');
	});

	test('(j-5c) when inbox is empty, sub-line shows "No pending invites"', () => {
		invitations.inbox = [];
		const { getByDataTest } = render(SettingsScreen);
		expect(getByDataTest('settings-invites').textContent).toContain('No pending invites');
	});

	test('(j-6) Privacy row renders with correct sub-line', () => {
		const { getByDataTest } = render(SettingsScreen);
		expect(getByDataTest('settings-privacy').textContent).toContain(
			'Who can invite you · circle · blocked'
		);
	});

	test('(j-7) clicking Privacy row navigates to /settings/privacy', async () => {
		const { goto } = await import('$app/navigation');
		const { resolve } = await import('$app/paths');
		const { getByDataTest } = render(SettingsScreen);
		await fireEvent.click(getByDataTest('settings-privacy'));
		expect(vi.mocked(goto)).toHaveBeenCalledOnce();
		expect(vi.mocked(goto)).toHaveBeenCalledWith(vi.mocked(resolve)('/settings/privacy'));
	});

	test('(j) Recovery row renders', () => {
		const { queryByDataTest } = render(SettingsScreen);
		const row = queryByDataTest('settings-deleted-lists');
		expect(row).not.toBeNull();
		expect(row?.textContent).toContain('Deleted lists');
	});

	test('(k) clicking Recovery row navigates to /settings/deleted-lists', async () => {
		const { goto } = await import('$app/navigation');
		const { resolve } = await import('$app/paths');
		const { getByDataTest } = render(SettingsScreen);
		await fireEvent.click(getByDataTest('settings-deleted-lists'));
		expect(vi.mocked(goto)).toHaveBeenCalledOnce();
		expect(vi.mocked(goto)).toHaveBeenCalledWith(vi.mocked(resolve)('/settings/deleted-lists'));
	});

	test('(l) Delete account row renders in the Account section', () => {
		const { queryByDataTest } = render(SettingsScreen);
		const row = queryByDataTest('delete-account');
		expect(row).not.toBeNull();
		expect(row?.textContent).toContain('Delete account');
	});

	test('(m) clicking Delete account row navigates to /settings/delete-account', async () => {
		const { goto } = await import('$app/navigation');
		const { resolve } = await import('$app/paths');
		const { getByDataTest } = render(SettingsScreen);
		await fireEvent.click(getByDataTest('delete-account'));
		expect(vi.mocked(goto)).toHaveBeenCalledOnce();
		expect(vi.mocked(goto)).toHaveBeenCalledWith(vi.mocked(resolve)('/settings/delete-account'));
	});

	test('(n) Download my data row renders with its sub-line', () => {
		const { queryByDataTest } = render(SettingsScreen);
		const row = queryByDataTest('settings-download-data');
		expect(row).not.toBeNull();
		expect(row?.textContent).toContain('Download my data');
		expect(row?.textContent).toContain('A copy of everything Cairn stores');
	});

	test('(o) clicking Download my data navigates to /settings/data-export', async () => {
		const { goto } = await import('$app/navigation');
		const { resolve } = await import('$app/paths');
		const { getByDataTest } = render(SettingsScreen);
		await fireEvent.click(getByDataTest('settings-download-data'));
		expect(vi.mocked(goto)).toHaveBeenCalledOnce();
		expect(vi.mocked(goto)).toHaveBeenCalledWith(vi.mocked(resolve)('/settings/data-export'));
	});

	test('(j-about) clicking the About Cairn row navigates to /about', async () => {
		const { goto } = await import('$app/navigation');
		const { resolve } = await import('$app/paths');
		const { getByDataTest } = render(SettingsScreen);
		expect(getByDataTest('settings-about').textContent).toContain('About Cairn');
		await fireEvent.click(getByDataTest('settings-about'));
		expect(vi.mocked(resolve)).toHaveBeenCalledWith('/about');
		expect(vi.mocked(goto)).toHaveBeenCalledOnce();
	});

	test('(q) About section sits between Recovery and Account', () => {
		const { container } = render(SettingsScreen);
		const headings = [...container.querySelectorAll('section.preference-group h2')].map(
			(h) => h.textContent
		);
		const about = headings.indexOf('About');
		expect(about).toBeGreaterThan(-1);
		expect(headings[about - 1]).toBe('Recovery');
		expect(headings[about + 1]).toBe('Account');
	});

	test('(p) Privacy & data section sits immediately before Recovery', () => {
		const { container } = render(SettingsScreen);
		const headings = [...container.querySelectorAll('section.preference-group h2')].map(
			(h) => h.textContent
		);
		const privacyData = headings.indexOf('Privacy & data');
		const recovery = headings.indexOf('Recovery');
		expect(privacyData).toBeGreaterThan(-1);
		expect(recovery).toBe(privacyData + 1);
	});
});

describe('Install Cairn row', () => {
	test('(install-a) is hidden when Cairn is already running installed', () => {
		install.isStandalone = true;
		const { queryByDataTest } = render(SettingsScreen);
		expect(queryByDataTest('settings-install')).toBeNull();
	});

	test('(install-b) is shown when Cairn is running in a browser tab', () => {
		const { queryByDataTest } = render(SettingsScreen);
		expect(queryByDataTest('settings-install')).not.toBeNull();
	});

	test('(install-c) fires the captured prompt when there is one', async () => {
		install.canPrompt = true;
		const { getByDataTest, queryByDataTest } = render(SettingsScreen);
		await fireEvent.click(getByDataTest('settings-install'));
		expect(install.promptInstall).toHaveBeenCalledTimes(1);
		expect(queryByDataTest('install-explainer-sheet')).toBeNull();
	});

	test('(install-d) opens the explainer when there is no prompt to fire', async () => {
		install.isIos = true;
		const { getByDataTest, queryByDataTest } = render(SettingsScreen);
		expect(queryByDataTest('install-explainer-sheet')).toBeNull();

		await fireEvent.click(getByDataTest('settings-install'));
		expect(install.promptInstall).not.toHaveBeenCalled();
		expect(queryByDataTest('install-explainer-sheet')).not.toBeNull();
	});
});
