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
	modified_at: '2026-01-01T00:00:00Z',
	item_count: 3,
	list_members: []
};

const LIST_B = {
	id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
	name: 'List B',
	description: null,
	modified_at: '2026-01-02T00:00:00Z',
	item_count: 1,
	list_members: []
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

	test("(e) query includes &deleted_at=is.null to exclude the signed-in user's own soft-deleted lists", async () => {
		let capturedUrl: string | undefined;
		server.use(
			http.get('*/api/lists', ({ request }) => {
				capturedUrl = request.url;
				return HttpResponse.json([LIST_A]);
			})
		);
		sessionMod.setSignedIn({ id: TEST_UID, email: 'dev@example.test' });
		await tick();
		await vi.waitFor(() => {
			expect(listsMod.lists.items).toHaveLength(1);
		});
		expect(capturedUrl).toContain('&deleted_at=is.null');
	});
});

async function setupWithLists(data = [LIST_A, LIST_B]) {
	server.use(http.get('*/api/lists', () => HttpResponse.json(data)));
	sessionMod.setSignedIn({ id: TEST_UID, email: 'dev@example.test' });
	await tick();
	await vi.waitFor(() => {
		expect(listsMod.lists.items).toHaveLength(data.length);
	});
}

describe('deleteList', () => {
	test('(a) optimistically removes the list from lists.items', async () => {
		await setupWithLists();
		vi.useFakeTimers();
		try {
			void listsMod.deleteList(LIST_A.id);
			expect(listsMod.lists.items).toHaveLength(1);
			expect(listsMod.lists.items[0].id).toBe(LIST_B.id);
		} finally {
			vi.useRealTimers();
		}
	});

	test('(b) sends PATCH /lists?id=eq.<uuid> with deleted_at ISO timestamp', async () => {
		let capturedUrl: string | undefined;
		let capturedBody: Record<string, unknown> | undefined;
		server.use(
			http.patch('*/api/lists', async ({ request }) => {
				capturedUrl = request.url;
				capturedBody = (await request.json()) as Record<string, unknown>;
				return new HttpResponse(null, { status: 204 });
			})
		);
		await setupWithLists();
		await listsMod.deleteList(LIST_A.id);
		expect(capturedUrl).toContain(`id=eq.${LIST_A.id}`);
		expect(typeof capturedBody?.deleted_at).toBe('string');
	});

	test('(c) sets pendingDelete with the captured list', async () => {
		await setupWithLists();
		vi.useFakeTimers();
		try {
			void listsMod.deleteList(LIST_A.id);
			expect(listsMod.lists.pendingDelete).not.toBeNull();
			expect(listsMod.lists.pendingDelete!.list.id).toBe(LIST_A.id);
		} finally {
			vi.useRealTimers();
		}
	});

	test('(d) on API error, restores the list and clears pendingDelete', async () => {
		server.use(http.patch('*/api/lists', () => new HttpResponse(null, { status: 500 })));
		await setupWithLists();
		await listsMod.deleteList(LIST_A.id);
		expect(listsMod.lists.items).toHaveLength(2);
		expect(listsMod.lists.pendingDelete).toBeNull();
	});
});

describe('undoDeleteList', () => {
	test('(a) clears the timer and sends PATCH with {deleted_at: null}', async () => {
		const patchBodies: unknown[] = [];
		server.use(
			http.patch('*/api/lists', async ({ request }) => {
				patchBodies.push(await request.json());
				return new HttpResponse(null, { status: 204 });
			})
		);
		await setupWithLists();
		await listsMod.deleteList(LIST_A.id);
		await listsMod.undoDeleteList();
		expect(patchBodies).toHaveLength(2);
		expect(patchBodies[1]).toEqual({ deleted_at: null });
	});

	test('(b) on success, restores the list into lists.items and clears pendingDelete', async () => {
		await setupWithLists();
		await listsMod.deleteList(LIST_A.id);
		expect(listsMod.lists.items).toHaveLength(1);
		await listsMod.undoDeleteList();
		expect(listsMod.lists.items).toHaveLength(2);
		expect(listsMod.lists.pendingDelete).toBeNull();
	});

	test('(c) on error, keeps pendingDelete and sets lists.error; 4s timer clears both', async () => {
		await setupWithLists();
		await listsMod.deleteList(LIST_A.id);
		server.use(http.patch('*/api/lists', () => new HttpResponse(null, { status: 500 })));
		vi.useFakeTimers();
		try {
			await listsMod.undoDeleteList();
			expect(listsMod.lists.pendingDelete).not.toBeNull();
			expect(listsMod.lists.error).toBeTruthy();
			await vi.advanceTimersByTimeAsync(4000);
			expect(listsMod.lists.pendingDelete).toBeNull();
			expect(listsMod.lists.error).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});
});
