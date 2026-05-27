import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';

import { server } from '$lib/test/server';
import { fetchDeletedItems, fetchListName } from './item-trash';

const LIST_ID = 'llllllll-llll-llll-llll-llllllllllll';
const UID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const UID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('fetchDeletedItems', () => {
	test('(a) requests items_deleted with order=deleted_at.desc and slim select', async () => {
		let capturedUrl = '';
		server.use(
			http.get('*/api/items_deleted', ({ request }) => {
				capturedUrl = request.url;
				return HttpResponse.json([]);
			})
		);
		await fetchDeletedItems(LIST_ID);
		const url = decodeURIComponent(capturedUrl);
		expect(url).toContain(`list_id=eq.${LIST_ID}`);
		expect(url).toContain('order=deleted_at.desc');
		expect(url).toContain('select=id,list_id,name,notes,deleted_by,deleted_at');
	});

	test('(b) dedupes deleted_by UUIDs into a single profiles fetch', async () => {
		let profilesCallCount = 0;
		let profilesUrl = '';
		server.use(
			http.get('*/api/items_deleted', () =>
				HttpResponse.json([
					{
						id: 'i1',
						list_id: LIST_ID,
						name: 'one',
						notes: null,
						deleted_by: UID_A,
						deleted_at: '2026-05-01T00:00:00Z'
					},
					{
						id: 'i2',
						list_id: LIST_ID,
						name: 'two',
						notes: null,
						deleted_by: UID_A,
						deleted_at: '2026-05-02T00:00:00Z'
					},
					{
						id: 'i3',
						list_id: LIST_ID,
						name: 'three',
						notes: null,
						deleted_by: UID_B,
						deleted_at: '2026-05-03T00:00:00Z'
					}
				])
			),
			http.get('*/api/profiles', ({ request }) => {
				profilesCallCount++;
				profilesUrl = request.url;
				return HttpResponse.json([
					{ id: UID_A, display_name: 'Alice' },
					{ id: UID_B, display_name: 'Bob' }
				]);
			})
		);
		const rows = await fetchDeletedItems(LIST_ID);
		expect(profilesCallCount).toBe(1);
		const dec = decodeURIComponent(profilesUrl);
		expect(dec).toContain(`id=in.(${UID_A},${UID_B})`);
		expect(rows[0].deleted_by_name).toBe('Alice');
		expect(rows[2].deleted_by_name).toBe('Bob');
	});

	test('(c) graceful Unknown fallback when fetchDisplayNames rejects', async () => {
		server.use(
			http.get('*/api/items_deleted', () =>
				HttpResponse.json([
					{
						id: 'i1',
						list_id: LIST_ID,
						name: 'one',
						notes: null,
						deleted_by: UID_A,
						deleted_at: '2026-05-01T00:00:00Z'
					}
				])
			),
			http.get('*/api/profiles', () => new HttpResponse(null, { status: 500 }))
		);
		const rows = await fetchDeletedItems(LIST_ID);
		expect(rows).toHaveLength(1);
		expect(rows[0].deleted_by_name).toBe('Unknown');
	});
});

describe('fetchListName', () => {
	test('(d) returns the name when the list exists', async () => {
		server.use(http.get('*/api/lists', () => HttpResponse.json([{ name: 'My list' }])));
		await expect(fetchListName(LIST_ID)).resolves.toBe('My list');
	});

	test('(e) returns null on empty array (no throw)', async () => {
		server.use(http.get('*/api/lists', () => HttpResponse.json([])));
		await expect(fetchListName(LIST_ID)).resolves.toBeNull();
	});
});
