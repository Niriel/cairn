import { tick } from 'svelte';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { server } from '$lib/test/server';

vi.mock('$lib/shared/state/session.svelte');

const TEST_UID = '11111111-1111-1111-1111-111111111111';

const LIST_A = {
	id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
	name: 'List A',
	description: null,
	modified_at: '2026-01-01T00:00:00Z'
};

const LIST_B = {
	id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
	name: 'List B',
	description: null,
	modified_at: '2026-01-02T00:00:00Z'
};

let sessionMod: typeof import('$lib/shared/state/session.svelte');
let listsMod: typeof import('./lists.svelte');

beforeEach(async () => {
	vi.resetModules();
	sessionMod = await import('$lib/shared/state/session.svelte');
	listsMod = await import('./lists.svelte');
});

describe('lists store', () => {
	test('(a) signed-in → fetches and populates lists.items', async () => {
		server.use(http.get('*/api/lists', () => HttpResponse.json([LIST_A])));
		expect(listsMod.lists.items).toEqual([]);
		sessionMod.setSignedIn({ id: TEST_UID, email: 'dev@example.test' });
		await tick();
		await vi.waitFor(() => {
			expect(listsMod.lists.items).toHaveLength(1);
		});
	});

	test('(b) signed-out → resets lists.items to []', async () => {
		server.use(http.get('*/api/lists', () => HttpResponse.json([LIST_A])));
		sessionMod.setSignedIn({ id: TEST_UID, email: 'dev@example.test' });
		await tick();
		await vi.waitFor(() => {
			expect(listsMod.lists.items).toHaveLength(1);
		});
		await sessionMod.signOut();
		await tick();
		expect(listsMod.lists.items).toEqual([]);
	});

	test('(c) refreshLists() re-triggers fetch', async () => {
		server.use(http.get('*/api/lists', () => HttpResponse.json([LIST_A])));
		sessionMod.setSignedIn({ id: TEST_UID, email: 'dev@example.test' });
		await tick();
		await vi.waitFor(() => {
			expect(listsMod.lists.items).toHaveLength(1);
		});
		server.use(http.get('*/api/lists', () => HttpResponse.json([LIST_A, LIST_B])));
		listsMod.refreshLists();
		await tick();
		await vi.waitFor(() => {
			expect(listsMod.lists.items).toHaveLength(2);
		});
	});

	test('(d) error response → sets lists.error', async () => {
		server.use(http.get('*/api/lists', () => new HttpResponse(null, { status: 500 })));
		sessionMod.setSignedIn({ id: TEST_UID, email: 'dev@example.test' });
		await tick();
		await vi.waitFor(() => {
			expect(listsMod.lists.error).toBeTruthy();
		});
	});
});
