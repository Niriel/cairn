import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';

import { server } from '$lib/test/server';
import { fetchDisplayNames } from './profile-names';

describe('fetchDisplayNames', () => {
	test('(a) empty input returns empty map without calling fetch', async () => {
		let called = false;
		server.use(
			http.get('*/api/profiles', () => {
				called = true;
				return HttpResponse.json([]);
			})
		);
		const result = await fetchDisplayNames([]);
		expect(result.size).toBe(0);
		expect(called).toBe(false);
	});

	test('(b) deduped UUIDs result in one fetch and a map of size N', async () => {
		let capturedUrl = '';
		let callCount = 0;
		server.use(
			http.get('*/api/profiles', ({ request }) => {
				callCount++;
				capturedUrl = request.url;
				return HttpResponse.json([
					{ id: 'a', display_name: 'Alice' },
					{ id: 'b', display_name: 'Bob' }
				]);
			})
		);
		const result = await fetchDisplayNames(['a', 'b', 'a', 'b']);
		expect(callCount).toBe(1);
		expect(result.size).toBe(2);
		expect(result.get('a')).toBe('Alice');
		expect(result.get('b')).toBe('Bob');
		expect(decodeURIComponent(capturedUrl)).toContain('id=in.(a,b)');
	});

	test('(c) fetch failure rejects', async () => {
		server.use(http.get('*/api/profiles', () => new HttpResponse(null, { status: 500 })));
		await expect(fetchDisplayNames(['x'])).rejects.toThrow();
	});

	test('(d) UIDs not returned by the API are absent from the map', async () => {
		server.use(
			http.get('*/api/profiles', () => HttpResponse.json([{ id: 'a', display_name: 'Alice' }]))
		);
		const result = await fetchDisplayNames(['a', 'b']);
		expect(result.get('a')).toBe('Alice');
		expect(result.has('b')).toBe(false);
	});
});
