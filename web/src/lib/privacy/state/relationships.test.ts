import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { server } from '$lib/test/server';

vi.mock('$lib/shared/state/profile.svelte');

const TEST_UID = '11111111-1111-1111-1111-111111111111';
const OTHER_UID = '22222222-2222-2222-2222-222222222222';
const STRANGER_UID = '33333333-3333-3333-3333-333333333333';

const CIRCLE_ROW = {
	other_user_id: OTHER_UID,
	status: 'circle',
	created_at: '2026-04-12T10:00:00Z',
	profiles: { display_name: 'Bob', avatar_version: 0 }
};

const BLOCKED_ROW = {
	other_user_id: STRANGER_UID,
	status: 'blocked',
	created_at: '2026-03-01T10:00:00Z',
	profiles: { display_name: 'Stranger', avatar_version: 0 }
};

let profileMod: typeof import('$lib/shared/state/profile.svelte');
let relsMod: typeof import('./relationships.svelte');

beforeEach(async () => {
	vi.resetModules();
	profileMod = await import('$lib/shared/state/profile.svelte');
	profileMod.profile.uid = TEST_UID;
	relsMod = await import('./relationships.svelte');
});

describe('loadRelationships', () => {
	test('(a) populates circle and blocked from response', async () => {
		server.use(http.get('*/api/relationships', () => HttpResponse.json([CIRCLE_ROW, BLOCKED_ROW])));
		await relsMod.loadRelationships();
		expect(relsMod.relationships.circle).toHaveLength(1);
		expect(relsMod.relationships.circle[0].otherUserId).toBe(OTHER_UID);
		expect(relsMod.relationships.circle[0].displayName).toBe('Bob');
		expect(relsMod.relationships.blocked).toHaveLength(1);
		expect(relsMod.relationships.blocked[0].otherUserId).toBe(STRANGER_UID);
		expect(relsMod.relationships.loaded).toBe(true);
	});
});

describe('addCircleByUsername', () => {
	test('(b) on success posts p_username and appends to circle', async () => {
		let captured: unknown;
		server.use(
			http.get('*/api/relationships', () => HttpResponse.json([CIRCLE_ROW])),
			http.post('*/api/rpc/add_circle_by_username', async ({ request }) => {
				captured = await request.json();
				return new HttpResponse(null, { status: 204 });
			})
		);
		const result = await relsMod.addCircleByUsername('BobHandle');
		expect(result).toEqual({ ok: true });
		expect(captured).toEqual({ p_username: 'BobHandle' });
		expect(relsMod.relationships.circle).toHaveLength(1);
		expect(relsMod.relationships.circle[0].otherUserId).toBe(OTHER_UID);
	});

	test('(c) on "no such user" error returns {ok: false, reason: "no-such-user"} and does not mutate circle', async () => {
		server.use(
			http.post('*/api/rpc/add_circle_by_username', () =>
				HttpResponse.json({ code: 'P0001', message: 'no such user' }, { status: 400 })
			)
		);
		const result = await relsMod.addCircleByUsername('ghost');
		expect(result).toEqual({ ok: false, reason: 'no-such-user' });
		expect(relsMod.relationships.circle).toHaveLength(0);
	});

	test('(c.i) on "cannot add yourself" error returns {ok: false, reason: "self"} and does not mutate circle', async () => {
		server.use(
			http.post('*/api/rpc/add_circle_by_username', () =>
				HttpResponse.json({ code: 'P0001', message: 'cannot add yourself' }, { status: 400 })
			)
		);
		const result = await relsMod.addCircleByUsername('MyOwnHandle');
		expect(result).toEqual({ ok: false, reason: 'self' });
		expect(relsMod.relationships.circle).toHaveLength(0);
	});

	test('(c.ii) on any other error returns {ok: false, reason: "unknown"}', async () => {
		server.use(
			http.post('*/api/rpc/add_circle_by_username', () => new HttpResponse(null, { status: 500 }))
		);
		const result = await relsMod.addCircleByUsername('ErrorHandle');
		expect(result).toEqual({ ok: false, reason: 'unknown' });
	});
});

describe('addCircleById', () => {
	test('(d) on success appends to circle', async () => {
		server.use(
			http.get('*/api/relationships', () => HttpResponse.json([CIRCLE_ROW])),
			http.post('*/api/rpc/add_circle_by_id', () => new HttpResponse(null, { status: 204 }))
		);
		await relsMod.addCircleById(OTHER_UID);
		expect(relsMod.relationships.circle).toHaveLength(1);
		expect(relsMod.relationships.circle[0].otherUserId).toBe(OTHER_UID);
	});

	test('(d.i) on "no such user" error re-throws and does not mutate circle', async () => {
		server.use(
			http.post('*/api/rpc/add_circle_by_id', () =>
				HttpResponse.json({ code: 'P0001', message: 'no such user' }, { status: 400 })
			)
		);
		await expect(relsMod.addCircleById(STRANGER_UID)).rejects.toThrow('no such user');
		expect(relsMod.relationships.circle).toHaveLength(0);
	});

	test('(d.ii) on "cannot add yourself" error re-throws and does not mutate circle', async () => {
		server.use(
			http.post('*/api/rpc/add_circle_by_id', () =>
				HttpResponse.json({ code: 'P0001', message: 'cannot add yourself' }, { status: 400 })
			)
		);
		await expect(relsMod.addCircleById(TEST_UID)).rejects.toThrow('cannot add yourself');
		expect(relsMod.relationships.circle).toHaveLength(0);
	});
});

describe('removeFromCircle', () => {
	test('(e) DELETEs and removes from circle', async () => {
		server.use(
			http.get('*/api/relationships', () => HttpResponse.json([CIRCLE_ROW])),
			http.delete('*/api/relationships', () => new HttpResponse(null, { status: 204 }))
		);
		await relsMod.loadRelationships();
		expect(relsMod.relationships.circle).toHaveLength(1);
		await relsMod.removeFromCircle(OTHER_UID);
		expect(relsMod.relationships.circle).toHaveLength(0);
	});
});

describe('block', () => {
	test('(f) on a user in circle: removes from circle and appends to blocked', async () => {
		server.use(http.get('*/api/relationships', () => HttpResponse.json([CIRCLE_ROW])));
		await relsMod.loadRelationships();
		expect(relsMod.relationships.circle).toHaveLength(1);
		expect(relsMod.relationships.blocked).toHaveLength(0);

		server.use(
			http.get('*/api/relationships', () =>
				HttpResponse.json([{ ...CIRCLE_ROW, status: 'blocked' }])
			),
			http.post('*/api/relationships', () => new HttpResponse(null, { status: 201 }))
		);
		await relsMod.block(OTHER_UID);
		expect(relsMod.relationships.circle).toHaveLength(0);
		expect(relsMod.relationships.blocked).toHaveLength(1);
		expect(relsMod.relationships.blocked[0].otherUserId).toBe(OTHER_UID);
	});

	test('(g) on a stranger: appends to blocked with no circle mutation', async () => {
		server.use(
			http.get('*/api/relationships', () => HttpResponse.json([BLOCKED_ROW])),
			http.post('*/api/relationships', () => new HttpResponse(null, { status: 201 }))
		);
		await relsMod.block(STRANGER_UID);
		expect(relsMod.relationships.blocked).toHaveLength(1);
		expect(relsMod.relationships.circle).toHaveLength(0);
	});
});

describe('unblock', () => {
	test('(h) DELETEs and removes from blocked; does NOT add to circle', async () => {
		server.use(
			http.get('*/api/relationships', () => HttpResponse.json([BLOCKED_ROW])),
			http.delete('*/api/relationships', () => new HttpResponse(null, { status: 204 }))
		);
		await relsMod.loadRelationships();
		expect(relsMod.relationships.blocked).toHaveLength(1);
		await relsMod.unblock(STRANGER_UID);
		expect(relsMod.relationships.blocked).toHaveLength(0);
		expect(relsMod.relationships.circle).toHaveLength(0);
	});
});
