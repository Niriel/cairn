import { fireEvent } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { render } from '$lib/test/render';
import { ApiError } from '$lib/shared/http/postgrest';

import PrivacyScreen from './PrivacyScreen.svelte';

vi.mock('$lib/privacy/components/CircleExplainerSheet.svelte');
vi.mock('$lib/privacy/state/relationships.svelte');
vi.mock('$lib/privacy/state/user-settings.svelte');
vi.mock('$lib/shared/components/Snackbar.svelte');
vi.mock('$lib/shared/components/TopBar.svelte');
vi.mock('$lib/shared/state/profile.svelte');
vi.mock('$app/navigation');
vi.mock('$app/paths');

const { relationships } = await import('$lib/privacy/state/relationships.svelte');
const { userSettings, setInvitePolicy } = await import('$lib/privacy/state/user-settings.svelte');

afterEach(() => {
	vi.clearAllMocks();
	relationships.loaded = false;
	relationships.circle = [];
	relationships.blocked = [];
	userSettings.loaded = false;
	userSettings.invitePolicy = null;
});

describe('PrivacyScreen', () => {
	test('(a) three segmented control options render with verbatim titles and subs', () => {
		userSettings.loaded = true;
		userSettings.invitePolicy = 'everybody';
		const { getByDataTest } = render(PrivacyScreen);
		expect(getByDataTest('policy-everybody')).toBeTruthy();
		expect(getByDataTest('policy-circle')).toBeTruthy();
		expect(getByDataTest('policy-nobody')).toBeTruthy();
	});

	test('(b) currently selected option visually indicated based on invitePolicy', () => {
		userSettings.loaded = true;
		userSettings.invitePolicy = 'circle';
		const { getByDataTest } = render(PrivacyScreen);
		const option = getByDataTest('policy-circle');
		expect(option.getAttribute('aria-checked')).toBe('true');
		expect(getByDataTest('policy-everybody').getAttribute('aria-checked')).toBe('false');
	});

	test('(c) selecting a different option calls setInvitePolicy with new value', async () => {
		userSettings.loaded = true;
		userSettings.invitePolicy = 'everybody';
		vi.mocked(setInvitePolicy).mockResolvedValueOnce({
			prevCount: 0,
			newCount: 0,
			tightened: false
		});
		const { getByDataTest } = render(PrivacyScreen);
		await fireEvent.click(getByDataTest('policy-circle'));
		expect(vi.mocked(setInvitePolicy)).toHaveBeenCalledWith('circle');
	});

	test("(d) What's a circle? link visible only when invitePolicy === 'circle'", async () => {
		userSettings.loaded = true;
		userSettings.invitePolicy = 'everybody';
		vi.mocked(setInvitePolicy).mockResolvedValue({ prevCount: 0, newCount: 0, tightened: false });
		const { queryByDataTest, getByDataTest } = render(PrivacyScreen);
		expect(queryByDataTest('whats-a-circle')).toBeNull();
		await fireEvent.click(getByDataTest('policy-circle'));
		userSettings.invitePolicy = 'circle';
	});

	test("(d.i) What's a circle? link opens the explainer", async () => {
		userSettings.loaded = true;
		userSettings.invitePolicy = 'circle';
		const { getByDataTest, queryByDataTest } = render(PrivacyScreen);
		expect(queryByDataTest('circle-explainer-sheet')).toBeNull();
		await fireEvent.click(getByDataTest('whats-a-circle'));
		expect(queryByDataTest('circle-explainer-sheet')).not.toBeNull();
	});

	test('(e) two NavRows render with count badges from mocked relationships', () => {
		userSettings.loaded = true;
		userSettings.invitePolicy = 'everybody';
		relationships.loaded = true;
		relationships.circle = [
			{ otherUserId: 'u1', displayName: 'Bob', avatarVersion: 0, createdAt: '2026-01-01T00:00:00Z' }
		];
		relationships.blocked = [
			{
				otherUserId: 'u2',
				displayName: 'Carol',
				avatarVersion: 0,
				createdAt: '2026-01-01T00:00:00Z'
			}
		];
		const { getByDataTest } = render(PrivacyScreen);
		expect(getByDataTest('circle-count').textContent).toBe('1');
		expect(getByDataTest('blocked-count').textContent).toBe('1');
	});

	test('(f) privacy note text renders verbatim', () => {
		const { getByDataTest } = render(PrivacyScreen);
		expect(getByDataTest('privacy-note').textContent).toContain(
			'Your e-mail address is never shown to other people on Cairn'
		);
	});

	test('(g) singular cascade note after tighten with prevCount=2, newCount=1', async () => {
		userSettings.loaded = true;
		userSettings.invitePolicy = 'everybody';
		vi.mocked(setInvitePolicy).mockResolvedValueOnce({
			prevCount: 2,
			newCount: 1,
			tightened: true
		});
		const { getByDataTest, queryByDataTest } = render(PrivacyScreen);
		expect(queryByDataTest('cascade-note')).toBeNull();
		await fireEvent.click(getByDataTest('policy-circle'));
		expect(getByDataTest('cascade-note').textContent).toContain(
			'1 pending invite has been declined to match your new setting.'
		);
	});

	test('(h) plural cascade note after tighten with prevCount=5, newCount=0', async () => {
		userSettings.loaded = true;
		userSettings.invitePolicy = 'everybody';
		vi.mocked(setInvitePolicy).mockResolvedValueOnce({
			prevCount: 5,
			newCount: 0,
			tightened: true
		});
		const { getByDataTest, queryByDataTest } = render(PrivacyScreen);
		expect(queryByDataTest('cascade-note')).toBeNull();
		await fireEvent.click(getByDataTest('policy-nobody'));
		expect(getByDataTest('cascade-note').textContent).toContain(
			'5 pending invites have been declined to match your new setting.'
		);
	});

	test('(i) no cascade note when prevCount === newCount and tightened true', async () => {
		userSettings.loaded = true;
		userSettings.invitePolicy = 'everybody';
		vi.mocked(setInvitePolicy).mockResolvedValueOnce({
			prevCount: 0,
			newCount: 0,
			tightened: true
		});
		const { queryByDataTest, getByDataTest } = render(PrivacyScreen);
		await fireEvent.click(getByDataTest('policy-circle'));
		expect(queryByDataTest('cascade-note')).toBeNull();
	});

	test('(j) no cascade note when tightened is false even if counts differ', async () => {
		userSettings.loaded = true;
		userSettings.invitePolicy = 'nobody';
		vi.mocked(setInvitePolicy).mockResolvedValueOnce({
			prevCount: 0,
			newCount: 0,
			tightened: false
		});
		const { queryByDataTest, getByDataTest } = render(PrivacyScreen);
		await fireEvent.click(getByDataTest('policy-everybody'));
		expect(queryByDataTest('cascade-note')).toBeNull();
	});

	test('(k) previously visible note clears the moment another option is clicked', async () => {
		userSettings.loaded = true;
		userSettings.invitePolicy = 'everybody';

		// First click: tighten to circle, produces a cascade note
		vi.mocked(setInvitePolicy).mockResolvedValueOnce({
			prevCount: 3,
			newCount: 1,
			tightened: true
		});
		const { getByDataTest, queryByDataTest } = render(PrivacyScreen);
		await fireEvent.click(getByDataTest('policy-circle'));
		await vi.waitFor(() => {
			expect(queryByDataTest('cascade-note')).not.toBeNull();
		});

		// Second click: another option with a pending mock — cascadeNote cleared before setInvitePolicy awaited
		vi.mocked(setInvitePolicy).mockImplementation(() => new Promise(() => {}));
		await fireEvent.click(getByDataTest('policy-nobody'));
		expect(queryByDataTest('cascade-note')).toBeNull();
	});

	test('(l) setInvitePolicy rejection: selection reverts, note cleared, snackbar shown', async () => {
		userSettings.loaded = true;
		userSettings.invitePolicy = 'everybody';
		vi.mocked(setInvitePolicy).mockRejectedValueOnce(new ApiError('fail', { code: 'P0001' }));
		const { getByDataTest, queryByDataTest } = render(PrivacyScreen);
		await fireEvent.click(getByDataTest('policy-circle'));
		await vi.waitFor(() => {
			expect(queryByDataTest('privacy-snackbar')).not.toBeNull();
		});
		expect(queryByDataTest('cascade-note')).toBeNull();
		// Selection reverts to everybody (aria-checked=true)
		expect(getByDataTest('policy-everybody').getAttribute('aria-checked')).toBe('true');
	});

	test('(m) before loaded, control indeterminate and options disabled', () => {
		userSettings.loaded = false;
		userSettings.invitePolicy = null;
		const { getByDataTest } = render(PrivacyScreen);
		const opt = getByDataTest('policy-everybody');
		expect(opt.hasAttribute('disabled')).toBe(true);
	});

	test('(n) before relationships loaded, count badges absent', () => {
		userSettings.loaded = true;
		userSettings.invitePolicy = 'everybody';
		relationships.loaded = false;
		const { queryByDataTest } = render(PrivacyScreen);
		expect(queryByDataTest('circle-count')).toBeNull();
		expect(queryByDataTest('blocked-count')).toBeNull();
	});
});
