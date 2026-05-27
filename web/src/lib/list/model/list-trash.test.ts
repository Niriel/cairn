import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';

import { server } from '$lib/test/server';
import { fetchDeletedLists, restoreList } from './list-trash';

const UID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const UID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LIST_ID = 'llllllll-llll-llll-llll-llllllllllll';

describe('fetchDeletedLists', () => {
	test('(a) requests lists_deleted with order=deleted_at.desc and slim select', async () => {
		let capturedUrl = '';
		server.use(
			http.get('*/api/lists_deleted', ({ request }) => {
				capturedUrl = request.url;
				return HttpResponse.json([]);
			})
		);
		await fetchDeletedLists();
		const url = decodeURIComponent(capturedUrl);
		expect(url).toContain('order=deleted_at.desc');
		expect(url).toContain('select=id,name,description,deleted_by,deleted_at');
	});

	test('(b) dedupes deleted_by UUIDs into a single profiles fetch and joins names', async () => {
		let profilesCallCount = 0;
		let profilesUrl = '';
		server.use(
			http.get('*/api/lists_deleted', () =>
				HttpResponse.json([
					{
						id: 'l1',
						name: 'one',
						description: null,
						deleted_by: UID_A,
						deleted_at: '2026-05-01T00:00:00Z'
					},
					{
						id: 'l2',
						name: 'two',
						description: 'desc',
						deleted_by: UID_A,
						deleted_at: '2026-05-02T00:00:00Z'
					},
					{
						id: 'l3',
						name: 'three',
						description: null,
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
		const rows = await fetchDeletedLists();
		expect(profilesCallCount).toBe(1);
		const dec = decodeURIComponent(profilesUrl);
		expect(dec).toContain(`id=in.(${UID_A},${UID_B})`);
		expect(rows[0].deleted_by_name).toBe('Alice');
		expect(rows[2].deleted_by_name).toBe('Bob');
	});

	test('(c) graceful Unknown fallback when fetchDisplayNames rejects', async () => {
		server.use(
			http.get('*/api/lists_deleted', () =>
				HttpResponse.json([
					{
						id: 'l1',
						name: 'one',
						description: null,
						deleted_by: UID_A,
						deleted_at: '2026-05-01T00:00:00Z'
					}
				])
			),
			http.get('*/api/profiles', () => new HttpResponse(null, { status: 500 }))
		);
		const rows = await fetchDeletedLists();
		expect(rows).toHaveLength(1);
		expect(rows[0].deleted_by_name).toBe('Unknown');
	});
});

describe('restoreList', () => {
	test('(d) issues PATCH /lists?id=eq.<id> with { deleted_at: null }', async () => {
		let capturedUrl = '';
		let capturedBody: unknown = null;
		server.use(
			http.patch('*/api/lists', async ({ request }) => {
				capturedUrl = request.url;
				capturedBody = await request.json();
				return new HttpResponse(null, { status: 204 });
			})
		);
		await restoreList(LIST_ID);
		expect(decodeURIComponent(capturedUrl)).toContain(`id=eq.${LIST_ID}`);
		expect(capturedBody).toEqual({ deleted_at: null });
	});
});
