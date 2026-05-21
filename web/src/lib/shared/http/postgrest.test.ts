import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { server } from '$lib/test/server';

// VITE_API_BASE is pinned for the suite so the URL prefix `pgGet/pgPost/
// pgPatch/pgDelete` build is asserted independently of any contributor's
// local `.env`. Same pattern as the session store suite (Task 2.2).
beforeAll(() => {
	vi.stubEnv('VITE_API_BASE', '/api');
});

afterAll(() => {
	vi.unstubAllEnvs();
});

// The session-store mock from `__mocks__/session.svelte.ts` is the
// substitute — the test asserts that `onUnauthorized` was called via
// the mock's spy.
vi.mock('$lib/shared/state/session.svelte');

let mod: typeof import('./postgrest');
let session: typeof import('$lib/shared/state/session.svelte');

beforeEach(async () => {
	vi.resetModules();
	mod = await import('./postgrest');
	session = await import('$lib/shared/state/session.svelte');
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('pgGet', () => {
	test('parses JSON body and returns it', async () => {
		const payload = [{ id: 1, name: 'alice' }];
		server.use(http.get('*/api/lists', () => HttpResponse.json(payload)));
		await expect(mod.pgGet('/lists')).resolves.toEqual(payload);
	});

	test('issues the request to `${VITE_API_BASE}/lists`', async () => {
		const seen: string[] = [];
		server.use(
			http.get('*/api/lists', ({ request }) => {
				seen.push(new URL(request.url).pathname);
				return HttpResponse.json([]);
			})
		);
		await mod.pgGet('/lists');
		expect(seen).toEqual(['/api/lists']);
	});

	test('passes `Accept: application/vnd.pgrst.object+json` through to the request', async () => {
		let acceptHeader: string | null = null;
		server.use(
			http.get('*/api/lists', ({ request }) => {
				acceptHeader = request.headers.get('accept');
				return HttpResponse.json({ id: 1 });
			})
		);
		await mod.pgGet('/lists', {
			headers: { Accept: 'application/vnd.pgrst.object+json' }
		});
		expect(acceptHeader).toBe('application/vnd.pgrst.object+json');
	});
});

describe('pgPost', () => {
	test('POSTs JSON-serialised body to `${VITE_API_BASE}/lists` with `Content-Type: application/json`', async () => {
		let seenPath: string | null = null;
		let seenContentType: string | null = null;
		let seenBody: unknown = null;
		server.use(
			http.post('*/api/lists', async ({ request }) => {
				seenPath = new URL(request.url).pathname;
				seenContentType = request.headers.get('content-type');
				seenBody = await request.json();
				return HttpResponse.json({ id: 1, name: 'x' });
			})
		);
		await mod.pgPost('/lists', { name: 'x' });
		expect(seenPath).toBe('/api/lists');
		expect(seenContentType).toMatch(/application\/json/);
		expect(seenBody).toEqual({ name: 'x' });
	});
});

describe('pgPatch', () => {
	test('PATCHes JSON-serialised body to `${VITE_API_BASE}/lists?id=eq.1` with `Content-Type: application/json`', async () => {
		let seenPath: string | null = null;
		let seenSearch: string | null = null;
		let seenContentType: string | null = null;
		let seenBody: unknown = null;
		server.use(
			http.patch('*/api/lists', async ({ request }) => {
				const url = new URL(request.url);
				seenPath = url.pathname;
				seenSearch = url.search;
				seenContentType = request.headers.get('content-type');
				seenBody = await request.json();
				return HttpResponse.json({ id: 1, name: 'y' });
			})
		);
		await mod.pgPatch('/lists?id=eq.1', { name: 'y' });
		expect(seenPath).toBe('/api/lists');
		expect(seenSearch).toBe('?id=eq.1');
		expect(seenContentType).toMatch(/application\/json/);
		expect(seenBody).toEqual({ name: 'y' });
	});
});

describe('pgDelete', () => {
	test('DELETEs `${VITE_API_BASE}/lists?id=eq.1` and resolves to undefined on 204', async () => {
		let seenPath: string | null = null;
		let seenSearch: string | null = null;
		server.use(
			http.delete('*/api/lists', ({ request }) => {
				const url = new URL(request.url);
				seenPath = url.pathname;
				seenSearch = url.search;
				return new HttpResponse(null, { status: 204 });
			})
		);
		await expect(mod.pgDelete('/lists?id=eq.1')).resolves.toBeUndefined();
		expect(seenPath).toBe('/api/lists');
		expect(seenSearch).toBe('?id=eq.1');
	});
});

describe('401 handling', () => {
	test('calls session.onUnauthorized and throws AuthError', async () => {
		server.use(http.get('*/api/lists', () => new HttpResponse(null, { status: 401 })));
		await expect(mod.pgGet('/lists')).rejects.toBeInstanceOf(mod.AuthError);
		expect(session.onUnauthorized).toHaveBeenCalledTimes(1);
	});
});

describe('non-2xx error handling', () => {
	test('parses PostgREST error shape and throws ApiError with code/details/hint', async () => {
		server.use(
			http.get('*/api/lists', () =>
				HttpResponse.json(
					{
						code: '42501',
						message: 'permission denied for table lists',
						details: 'rls denied',
						hint: 'check your policy'
					},
					{ status: 403 }
				)
			)
		);
		await expect(mod.pgGet('/lists')).rejects.toMatchObject({
			name: 'ApiError',
			code: '42501',
			message: 'permission denied for table lists',
			details: 'rls denied',
			hint: 'check your policy'
		});
		// Make sure it is an ApiError specifically (and an Error).
		await mod.pgGet('/lists').catch((err) => {
			expect(err).toBeInstanceOf(mod.ApiError);
			expect(err).toBeInstanceOf(Error);
			expect(session.onUnauthorized).not.toHaveBeenCalled();
		});
	});
});

describe('empty-body 2xx', () => {
	test('returns undefined on 204', async () => {
		server.use(http.get('*/api/lists', () => new HttpResponse(null, { status: 204 })));
		await expect(mod.pgGet('/lists')).resolves.toBeUndefined();
	});
});
