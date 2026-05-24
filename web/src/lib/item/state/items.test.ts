import { beforeEach, describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { server } from '$lib/test/server';
import type { ItemRanked } from '$lib/item/model/item';

vi.mock('$lib/shared/state/session.svelte');

const TEST_UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LIST_ID = 'llllllll-llll-llll-llll-llllllllllll';
const ITEM_ID = 'iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii';

const ITEM_ID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const RANKED_A: ItemRanked = {
	id: ITEM_ID,
	list_id: LIST_ID,
	name: 'Item A',
	notes: null,
	created_by: TEST_UID,
	modified_by: TEST_UID,
	score: 3,
	created_at: '2026-01-01T00:00:00Z',
	modified_at: '2026-01-01T00:00:00Z',
	created_by_profile: { display_name: 'Alice' },
	modified_by_profile: null
};

const RANKED_B: ItemRanked = {
	...RANKED_A,
	id: ITEM_ID_B,
	name: 'Item B',
	score: 1,
	created_at: '2026-01-02T00:00:00Z',
	modified_at: '2026-01-02T00:00:00Z'
};

// Item handlers that return RANKED_A for this test file's scenarios.
// Tests that need different data override with server.use() per-test.
function useItemHandlers() {
	server.use(
		http.get('*/api/items_ranked', () => HttpResponse.json([RANKED_A])),
		http.get('*/api/votes', () => HttpResponse.json([]))
	);
}

let sessionMod: typeof import('$lib/shared/state/session.svelte');
let itemsMod: typeof import('./items.svelte');

beforeEach(async () => {
	vi.resetModules();
	sessionMod = await import('$lib/shared/state/session.svelte');
	itemsMod = await import('./items.svelte');
	sessionMod.setSignedIn({ id: TEST_UID, email: 'test@test.com' });
});

describe('loadItems', () => {
	test('(a) populates rows from items_ranked and votes', async () => {
		useItemHandlers();
		await itemsMod.loadItems(LIST_ID);
		expect(itemsMod.items.rows).toHaveLength(1);
		expect(itemsMod.items.rows[0].id).toBe(ITEM_ID);
		expect(itemsMod.items.rows[0].score).toBe(3);
		expect(itemsMod.items.listId).toBe(LIST_ID);
	});
});

describe('upsertVote', () => {
	test('(b) optimistically mutates my_vote and score', async () => {
		useItemHandlers();
		await itemsMod.loadItems(LIST_ID);
		const before = itemsMod.items.rows[0].score;
		// Optimistic update fires before API resolves
		const promise = itemsMod.upsertVote(ITEM_ID, 1);
		expect(itemsMod.items.rows[0].my_vote).toBe(1);
		expect(itemsMod.items.rows[0].score).toBe(before + 1);
		await promise;
	});

	test('(c) rolls back my_vote and score on API 500', async () => {
		useItemHandlers();
		await itemsMod.loadItems(LIST_ID);
		const oldScore = itemsMod.items.rows[0].score;
		server.use(http.post('*/api/votes', () => new HttpResponse(null, { status: 500 })));
		await itemsMod.upsertVote(ITEM_ID, 1);
		expect(itemsMod.items.rows[0].my_vote).toBeNull();
		expect(itemsMod.items.rows[0].score).toBe(oldScore);
	});
});

describe('softDeleteItem', () => {
	test('(d) removes item from rows and sets pendingDelete', async () => {
		vi.useFakeTimers();
		try {
			useItemHandlers();
			await itemsMod.loadItems(LIST_ID);
			await itemsMod.softDeleteItem(ITEM_ID);
			expect(itemsMod.items.rows).toHaveLength(0);
			expect(itemsMod.items.pendingDelete).not.toBeNull();
			expect(itemsMod.items.pendingDelete!.item.id).toBe(ITEM_ID);
		} finally {
			vi.useRealTimers();
		}
	});

	test('(d2) second delete clears first timer and resets the 6s countdown', async () => {
		vi.useFakeTimers();
		try {
			server.use(
				http.get('*/api/items_ranked', () => HttpResponse.json([RANKED_A, RANKED_B])),
				http.get('*/api/votes', () => HttpResponse.json([]))
			);
			await itemsMod.loadItems(LIST_ID);
			await itemsMod.softDeleteItem(ITEM_ID);
			expect(itemsMod.items.pendingDelete!.item.id).toBe(ITEM_ID);

			// 3 s into item A's 6 s window — delete item B
			await vi.advanceTimersByTimeAsync(3000);
			await itemsMod.softDeleteItem(ITEM_ID_B);
			expect(itemsMod.items.pendingDelete!.item.id).toBe(ITEM_ID_B);

			// 3 s more — item A's old timer would have fired here if not cleared
			await vi.advanceTimersByTimeAsync(3000);
			expect(itemsMod.items.pendingDelete).not.toBeNull();

			// 3 s more (6 s from item B's delete) — item B's timer fires
			await vi.advanceTimersByTimeAsync(3000);
			expect(itemsMod.items.pendingDelete).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	test('(e) re-inserts item at original index and clears pendingDelete on API 500', async () => {
		vi.useFakeTimers();
		try {
			useItemHandlers();
			server.use(http.patch('*/api/items', () => new HttpResponse(null, { status: 500 })));
			await itemsMod.loadItems(LIST_ID);
			await itemsMod.softDeleteItem(ITEM_ID);
			expect(itemsMod.items.rows).toHaveLength(1);
			expect(itemsMod.items.rows[0].id).toBe(ITEM_ID);
			expect(itemsMod.items.pendingDelete).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('undoDelete', () => {
	test('(f) re-inserts item and clears pendingDelete when restoreItem succeeds', async () => {
		vi.useFakeTimers();
		try {
			useItemHandlers();
			await itemsMod.loadItems(LIST_ID);
			await itemsMod.softDeleteItem(ITEM_ID);
			expect(itemsMod.items.rows).toHaveLength(0);
			await itemsMod.undoDelete();
			expect(itemsMod.items.rows).toHaveLength(1);
			expect(itemsMod.items.pendingDelete).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	test('(g) on API 500: rows unchanged, pendingDelete set, error set; 4s timer clears both', async () => {
		vi.useFakeTimers();
		try {
			useItemHandlers();
			await itemsMod.loadItems(LIST_ID);
			await itemsMod.softDeleteItem(ITEM_ID);
			// Make restore fail
			server.use(http.patch('*/api/items', () => new HttpResponse(null, { status: 500 })));
			await itemsMod.undoDelete();
			expect(itemsMod.items.rows).toHaveLength(0);
			expect(itemsMod.items.pendingDelete).not.toBeNull();
			expect(itemsMod.items.error).toBeTruthy();
			await vi.advanceTimersByTimeAsync(4000);
			expect(itemsMod.items.pendingDelete).toBeNull();
			expect(itemsMod.items.error).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('addItem', () => {
	test('(h) calls API then loadItems to refresh rows', async () => {
		useItemHandlers();
		await itemsMod.addItem(LIST_ID, 'New item');
		expect(itemsMod.items.rows).toHaveLength(1);
	});

	test('(j) on API 500 sets error and does not load rows', async () => {
		useItemHandlers();
		server.use(http.post('*/api/items', () => new HttpResponse(null, { status: 500 })));
		await itemsMod.addItem(LIST_ID, 'New item');
		expect(itemsMod.items.error).toBeTruthy();
		expect(itemsMod.items.rows).toHaveLength(0);
	});
});

describe('editItem', () => {
	test('(i) calls API then refreshes rows via loadItems; rows unchanged on 500', async () => {
		useItemHandlers();
		await itemsMod.loadItems(LIST_ID);
		expect(itemsMod.items.rows[0].name).toBe('Item A');

		const updated: ItemRanked = { ...RANKED_A, name: 'Item A edited' };
		server.use(http.get('*/api/items_ranked', () => HttpResponse.json([updated])));
		await itemsMod.editItem(ITEM_ID, 'Item A edited', '');
		expect(itemsMod.items.rows[0].name).toBe('Item A edited');

		// On 500, rows unchanged
		server.use(
			http.patch('*/api/items', () => new HttpResponse(null, { status: 500 })),
			http.get('*/api/items_ranked', () => HttpResponse.json([updated]))
		);
		await itemsMod.editItem(ITEM_ID, 'Should not apply', '');
		expect(itemsMod.items.rows[0].name).toBe('Item A edited');
	});
});
