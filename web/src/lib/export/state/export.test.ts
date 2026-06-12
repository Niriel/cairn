import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { server } from '$lib/test/server';

import type { ExportDocument } from '../model/types';

// A minimal-but-complete document: one list with a member, a live item
// the caller added (so it carries all_votes), and a soft-deleted item
// they didn't add (so all_votes is absent — the type's optional case).
const FIXTURE: ExportDocument = {
	exported_at: '2026-06-12T10:00:00Z',
	schema_version: 1,
	user: {
		id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
		email: 'alice@test',
		display_name: 'Alice',
		signed_up_at: '2025-11-03T09:14:22Z',
		invite_policy: 'circle',
		has_avatar: false
	},
	lists: [
		{
			id: '11111111-1111-1111-1111-111111111111',
			name: 'Movies for Alice',
			description: null,
			created_at: '2026-01-01T00:00:00Z',
			deleted_at: null,
			members: [{ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', display_name: 'Bob' }],
			items: [
				{
					id: '33333333-3333-3333-3333-333333333333',
					name: 'Bringing Up Baby',
					notes: null,
					created_by: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', display_name: 'Alice' },
					created_at: '2026-01-02T00:00:00Z',
					deleted_at: null,
					your_vote: 2,
					all_votes: [
						{ user_display_name: 'Alice', value: 2 },
						{ user_display_name: 'Bob', value: 3 }
					]
				},
				{
					id: '44444444-4444-4444-4444-444444444444',
					name: "Bob's pick",
					notes: null,
					created_by: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', display_name: 'Bob' },
					created_at: '2026-01-03T00:00:00Z',
					deleted_at: '2026-02-01T00:00:00Z',
					your_vote: null
				}
			]
		}
	],
	circle: [{ display_name: 'Bob' }],
	blocked: [{ display_name: 'Carol' }],
	invitations_sent: [
		{
			list_id: '11111111-1111-1111-1111-111111111111',
			list_name: 'Movies for Alice',
			created_at: '2026-01-04T00:00:00Z',
			invitee_display_name: 'Carol'
		}
	],
	invitations_received: [
		{
			list_id: '88888888-8888-8888-8888-888888888888',
			list_name: "Bob's books",
			created_at: '2026-01-05T00:00:00Z',
			inviter_display_name: 'Bob'
		}
	]
};

let mod: typeof import('./export.svelte');

beforeEach(async () => {
	vi.resetModules();
	mod = await import('./export.svelte');
});

describe('prepare', () => {
	test('(a) transitions idle → packaging → ready and yields a data.json blob', async () => {
		server.use(http.post('*/api/rpc/export_my_data', () => HttpResponse.json(FIXTURE)));

		expect(mod.exportState.status).toBe('idle');

		const pending = mod.prepare();
		// status flips to 'packaging' synchronously, before the await resolves.
		expect(mod.exportState.status).toBe('packaging');

		await pending;

		expect(mod.exportState.status).toBe('ready');
		expect(mod.exportState.result?.fileName).toBe('data.json');
		expect(mod.exportState.result?.blob.type).toContain('application/json');
		expect(mod.exportState.error).toBeNull();
	});

	test('(b) on a server error transitions to error with a message', async () => {
		server.use(
			http.post('*/api/rpc/export_my_data', () =>
				HttpResponse.json({ message: 'export failed' }, { status: 500 })
			)
		);

		await mod.prepare();

		expect(mod.exportState.status).toBe('error');
		expect(mod.exportState.error).toBeTruthy();
		expect(mod.exportState.result).toBeNull();
	});
});

describe('reset', () => {
	test('(c) returns the machine to idle and clears the result', async () => {
		server.use(http.post('*/api/rpc/export_my_data', () => HttpResponse.json(FIXTURE)));
		await mod.prepare();
		expect(mod.exportState.status).toBe('ready');

		mod.reset();

		expect(mod.exportState.status).toBe('idle');
		expect(mod.exportState.result).toBeNull();
		expect(mod.exportState.error).toBeNull();
	});
});
