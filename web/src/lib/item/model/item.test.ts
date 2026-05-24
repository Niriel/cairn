import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';

import { server } from '$lib/test/server';
import { fetchItems, addItem, softDeleteItem, upsertVote, deleteVote, restoreItem } from './item';
import type { ItemRanked, VoteRow } from './item';

const TEST_UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LIST_ID = 'llllllll-llll-llll-llll-llllllllllll';
const ITEM_ID = 'iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii';

const STUB_RANKED: ItemRanked = {
	id: ITEM_ID,
	list_id: LIST_ID,
	name: 'Test item',
	notes: null,
	created_by: TEST_UID,
	modified_by: TEST_UID,
	score: 2,
	created_at: '2026-01-01T00:00:00Z',
	modified_at: '2026-01-02T00:00:00Z',
	created_by_profile: { display_name: 'Alice' },
	modified_by_profile: { display_name: 'Alice' }
};

const STUB_VOTE: VoteRow = {
	item_id: ITEM_ID,
	user_id: TEST_UID,
	value: 1,
	profile: { display_name: 'Alice' }
};

describe('fetchItems', () => {
	test('(a) calls GET /items_ranked and GET /votes, returns merged Item[]', async () => {
		server.use(
			http.get('*/api/items_ranked', () => HttpResponse.json([STUB_RANKED])),
			http.get('*/api/votes', () => HttpResponse.json([STUB_VOTE]))
		);
		const items = await fetchItems(LIST_ID, TEST_UID);
		expect(items).toHaveLength(1);
		expect(items[0].id).toBe(ITEM_ID);
		expect(items[0].name).toBe('Test item');
		expect(items[0].score).toBe(2);
		expect(items[0].my_vote).toBe(1);
		expect(items[0].member_votes).toHaveLength(1);
		expect(items[0].member_votes[0].display_name).toBe('Alice');
	});

	test('(g) modified_by_name is null when modified_at equals created_at', async () => {
		const sameTimestamp = '2026-01-01T00:00:00Z';
		const unedited: ItemRanked = {
			...STUB_RANKED,
			created_at: sameTimestamp,
			modified_at: sameTimestamp,
			modified_by_profile: { display_name: 'Alice' }
		};
		server.use(
			http.get('*/api/items_ranked', () => HttpResponse.json([unedited])),
			http.get('*/api/votes', () => HttpResponse.json([]))
		);
		const items = await fetchItems(LIST_ID, TEST_UID);
		expect(items[0].modified_by_name).toBeNull();
	});
});

describe('addItem', () => {
	test('(b) posts to /items and returns the new row', async () => {
		const newItem: ItemRanked = {
			...STUB_RANKED,
			id: 'new-item-id',
			name: 'New item'
		};
		server.use(
			http.post('*/api/items', () => HttpResponse.json(newItem, { status: 201 })),
			http.get('*/api/items_ranked', () => HttpResponse.json([newItem])),
			http.get('*/api/votes', () => HttpResponse.json([]))
		);
		const result = await addItem(LIST_ID, 'New item');
		expect(result.name).toBe('New item');
	});
});

describe('softDeleteItem', () => {
	test('(c) sends PATCH with deleted_at timestamp only — no deleted_by field', async () => {
		let capturedBody: Record<string, unknown> | null = null;
		server.use(
			http.patch('*/api/items', async ({ request }) => {
				capturedBody = (await request.json()) as Record<string, unknown>;
				return new HttpResponse(null, { status: 204 });
			})
		);
		await softDeleteItem(ITEM_ID);
		expect(capturedBody).not.toBeNull();
		expect(typeof capturedBody!.deleted_at).toBe('string');
		expect('deleted_by' in capturedBody!).toBe(false);
	});
});

describe('upsertVote', () => {
	test('(d) posts to /votes with Prefer: resolution=merge-duplicates', async () => {
		let capturedPrefer: string | null = null;
		server.use(
			http.post('*/api/votes', ({ request }) => {
				capturedPrefer = request.headers.get('Prefer');
				return new HttpResponse(null, { status: 200 });
			})
		);
		await upsertVote(ITEM_ID, 1);
		expect(capturedPrefer).toContain('resolution=merge-duplicates');
	});
});

describe('deleteVote', () => {
	test('(e) deletes from /votes with item_id filter', async () => {
		let capturedUrl: string | null = null;
		server.use(
			http.delete('*/api/votes', ({ request }) => {
				capturedUrl = request.url;
				return new HttpResponse(null, { status: 204 });
			})
		);
		await deleteVote(ITEM_ID);
		expect(capturedUrl).toContain(`item_id=eq.${ITEM_ID}`);
	});
});

describe('restoreItem', () => {
	test('(f) sends PATCH with only deleted_at: null', async () => {
		let capturedBody: Record<string, unknown> | null = null;
		server.use(
			http.patch('*/api/items', async ({ request }) => {
				capturedBody = (await request.json()) as Record<string, unknown>;
				return new HttpResponse(null, { status: 204 });
			})
		);
		await restoreItem(ITEM_ID);
		expect(capturedBody).toEqual({ deleted_at: null });
	});
});
