import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { server } from '$lib/test/server';

vi.mock('$lib/shared/state/profile.svelte');

const TEST_UID = '11111111-1111-1111-1111-111111111111';

let profileMod: typeof import('$lib/shared/state/profile.svelte');
let settingsMod: typeof import('./user-settings.svelte');

beforeEach(async () => {
	vi.resetModules();
	profileMod = await import('$lib/shared/state/profile.svelte');
	profileMod.profile.uid = TEST_UID;
	settingsMod = await import('./user-settings.svelte');
});

describe('loadUserSettings', () => {
	test('populates invitePolicy and recoveryEmail from response and sets loaded', async () => {
		server.use(
			http.get('*/api/user_settings', () =>
				HttpResponse.json(
					{ invite_policy: 'circle', recovery_email: 'alice@example.test' },
					{ headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } }
				)
			)
		);
		expect(settingsMod.userSettings.invitePolicy).toBeNull();
		expect(settingsMod.userSettings.recoveryEmail).toBeNull();
		expect(settingsMod.userSettings.loaded).toBe(false);
		await settingsMod.loadUserSettings();
		expect(settingsMod.userSettings.invitePolicy).toBe('circle');
		expect(settingsMod.userSettings.recoveryEmail).toBe('alice@example.test');
		expect(settingsMod.userSettings.loaded).toBe(true);
	});

	test('recoveryEmail stays null when none is on file', async () => {
		server.use(
			http.get('*/api/user_settings', () =>
				HttpResponse.json(
					{ invite_policy: 'everybody', recovery_email: null },
					{ headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } }
				)
			)
		);
		await settingsMod.loadUserSettings();
		expect(settingsMod.userSettings.recoveryEmail).toBeNull();
	});
});

describe('setInvitePolicy', () => {
	test('issues prevCount GET, PATCH, newCount GET in that order', async () => {
		const calls: string[] = [];
		let invitationsCallCount = 0;
		server.use(
			http.get('*/api/user_settings', () =>
				HttpResponse.json(
					{ invite_policy: 'everybody' },
					{ headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } }
				)
			),
			http.get('*/api/invitations', () => {
				invitationsCallCount++;
				calls.push(`GET invitations #${invitationsCallCount}`);
				return HttpResponse.json(
					invitationsCallCount === 1 ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'a' }]
				);
			}),
			http.patch('*/api/user_settings', () => {
				calls.push('PATCH user_settings');
				return new HttpResponse(null, { status: 204 });
			})
		);
		await settingsMod.loadUserSettings();
		await settingsMod.setInvitePolicy('circle');
		expect(calls).toEqual(['GET invitations #1', 'PATCH user_settings', 'GET invitations #2']);
	});

	test('returns prevCount and newCount from the two GET calls', async () => {
		let invitationsCallCount = 0;
		server.use(
			http.get('*/api/user_settings', () =>
				HttpResponse.json(
					{ invite_policy: 'everybody' },
					{ headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } }
				)
			),
			http.get('*/api/invitations', () => {
				invitationsCallCount++;
				return HttpResponse.json(
					invitationsCallCount === 1 ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'a' }]
				);
			}),
			http.patch('*/api/user_settings', () => new HttpResponse(null, { status: 204 }))
		);
		await settingsMod.loadUserSettings();
		const result = await settingsMod.setInvitePolicy('circle');
		expect(result.prevCount).toBe(2);
		expect(result.newCount).toBe(1);
	});

	test('sets invitePolicy to next on success', async () => {
		server.use(
			http.get('*/api/user_settings', () =>
				HttpResponse.json(
					{ invite_policy: 'everybody' },
					{ headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } }
				)
			),
			http.get('*/api/invitations', () => HttpResponse.json([])),
			http.patch('*/api/user_settings', () => new HttpResponse(null, { status: 204 }))
		);
		await settingsMod.loadUserSettings();
		expect(settingsMod.userSettings.invitePolicy).toBe('everybody');
		await settingsMod.setInvitePolicy('nobody');
		expect(settingsMod.userSettings.invitePolicy).toBe('nobody');
	});

	test('PATCH failure re-throws and leaves invitePolicy unchanged', async () => {
		server.use(
			http.get('*/api/user_settings', () =>
				HttpResponse.json(
					{ invite_policy: 'everybody' },
					{ headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } }
				)
			),
			http.get('*/api/invitations', () => HttpResponse.json([])),
			http.patch('*/api/user_settings', () => new HttpResponse(null, { status: 500 }))
		);
		await settingsMod.loadUserSettings();
		await expect(settingsMod.setInvitePolicy('circle')).rejects.toThrow();
		expect(settingsMod.userSettings.invitePolicy).toBe('everybody');
	});
});

describe('setInvitePolicy tightened flag', () => {
	async function setupAndSet(from: string, to: string) {
		let invitationsCallCount = 0;
		server.use(
			http.get('*/api/user_settings', () =>
				HttpResponse.json(
					{ invite_policy: from },
					{ headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } }
				)
			),
			http.get('*/api/invitations', () => {
				invitationsCallCount++;
				return HttpResponse.json(invitationsCallCount === 1 ? [{ id: 'a' }] : []);
			}),
			http.patch('*/api/user_settings', () => new HttpResponse(null, { status: 204 }))
		);
		vi.resetModules();
		profileMod = await import('$lib/shared/state/profile.svelte');
		profileMod.profile.uid = TEST_UID;
		settingsMod = await import('./user-settings.svelte');
		await settingsMod.loadUserSettings();
		return settingsMod.setInvitePolicy(to as 'everybody' | 'circle' | 'nobody');
	}

	test('everybody → circle: tightened = true', async () => {
		const result = await setupAndSet('everybody', 'circle');
		expect(result.tightened).toBe(true);
	});

	test('everybody → nobody: tightened = true', async () => {
		const result = await setupAndSet('everybody', 'nobody');
		expect(result.tightened).toBe(true);
	});

	test('circle → nobody: tightened = true', async () => {
		const result = await setupAndSet('circle', 'nobody');
		expect(result.tightened).toBe(true);
	});

	test('nobody → circle: tightened = false (loosen)', async () => {
		const result = await setupAndSet('nobody', 'circle');
		expect(result.tightened).toBe(false);
	});

	test('nobody → everybody: tightened = false (loosen)', async () => {
		const result = await setupAndSet('nobody', 'everybody');
		expect(result.tightened).toBe(false);
	});

	test('circle → everybody: tightened = false (loosen)', async () => {
		const result = await setupAndSet('circle', 'everybody');
		expect(result.tightened).toBe(false);
	});

	test('everybody → everybody: tightened = false (same)', async () => {
		const result = await setupAndSet('everybody', 'everybody');
		expect(result.tightened).toBe(false);
	});
});
