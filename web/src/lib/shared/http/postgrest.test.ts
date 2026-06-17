import { delay, http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { server } from '$lib/test/server';

// VITE_API_BASE / VITE_AUTH_BASE pinned for the suite so the URL prefixes the
// wrapper + the shared refresh build are asserted independently of any
// contributor's local `.env`. Same pattern as the session store suite.
beforeAll(() => {
	vi.stubEnv('VITE_API_BASE', '/api');
	vi.stubEnv('VITE_AUTH_BASE', '/auth');
});

afterAll(() => {
	vi.unstubAllEnvs();
});

// The 401-retry path drives the REAL session module: the silent-refresh
// interceptor calls the shared single-flight `refresh()`, and the single-flight
// collapse of concurrent 401s is only observable against the real primitive.
// Session state is asserted directly (signed-in / signed-out) rather than via a
// spy.
let mod: typeof import('./postgrest');
let session: typeof import('$lib/shared/state/session.svelte');

const USER = { id: 'u1', username: 'alice' };

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

describe('401 handling with silent refresh', () => {
	test('a successful refresh retries the request once and resolves; session stays signed-in', async () => {
		session.setSignedIn(USER);
		let apiHits = 0;
		let refreshHits = 0;
		server.use(
			http.get('*/api/lists', () => {
				apiHits++;
				return apiHits === 1
					? new HttpResponse(null, { status: 401 })
					: HttpResponse.json([{ id: 1 }]);
			}),
			http.post('*/auth/refresh', () => {
				refreshHits++;
				return HttpResponse.json({ user: USER });
			})
		);
		await expect(mod.pgGet('/lists')).resolves.toEqual([{ id: 1 }]);
		expect(apiHits).toBe(2);
		expect(refreshHits).toBe(1);
		expect(session.session.current.status).toBe('signed-in');
	});

	test('an authoritative refresh failure → no retry, signs out, throws AuthError', async () => {
		session.setSignedIn(USER);
		let apiHits = 0;
		server.use(
			http.get('*/api/lists', () => {
				apiHits++;
				return new HttpResponse(null, { status: 401 });
			}),
			http.post('*/auth/refresh', () => new HttpResponse(null, { status: 401 }))
		);
		await expect(mod.pgGet('/lists')).rejects.toBeInstanceOf(mod.AuthError);
		expect(apiHits).toBe(1); // refresh didn't succeed → no retry
		expect(session.session.current.status).toBe('signed-out');
	});

	test('a transient refresh failure (503) → no retry, signs out, throws AuthError', async () => {
		session.setSignedIn(USER);
		let apiHits = 0;
		server.use(
			http.get('*/api/lists', () => {
				apiHits++;
				return new HttpResponse(null, { status: 401 });
			}),
			http.post('*/auth/refresh', () => new HttpResponse(null, { status: 503 }))
		);
		await expect(mod.pgGet('/lists')).rejects.toBeInstanceOf(mod.AuthError);
		expect(apiHits).toBe(1);
		expect(session.session.current.status).toBe('signed-out');
	});

	test('the retry is attempted exactly once: a still-401 retry signs out without looping', async () => {
		session.setSignedIn(USER);
		let apiHits = 0;
		let refreshHits = 0;
		server.use(
			http.get('*/api/lists', () => {
				apiHits++;
				return new HttpResponse(null, { status: 401 });
			}),
			http.post('*/auth/refresh', () => {
				refreshHits++;
				return HttpResponse.json({ user: USER });
			})
		);
		await expect(mod.pgGet('/lists')).rejects.toBeInstanceOf(mod.AuthError);
		expect(apiHits).toBe(2); // initial + a single retry, no loop
		expect(refreshHits).toBe(1);
		expect(session.session.current.status).toBe('signed-out');
	});

	test('N concurrent 401s collapse to exactly one /auth/refresh (single-flight)', async () => {
		session.setSignedIn(USER);
		let refreshHits = 0;
		server.use(
			http.get('*/api/lists', () => new HttpResponse(null, { status: 401 })),
			http.post('*/auth/refresh', async () => {
				refreshHits++;
				await delay(20);
				return HttpResponse.json({ user: USER });
			})
		);
		await Promise.allSettled([mod.pgGet('/lists'), mod.pgGet('/lists'), mod.pgGet('/lists')]);
		expect(refreshHits).toBe(1);
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
		session.setSignedIn(USER);
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
			// A 403 is not an auth failure — the session must be untouched.
			expect(session.session.current.status).toBe('signed-in');
		});
	});
});

describe('empty-body 2xx', () => {
	test('returns undefined on 204', async () => {
		server.use(http.get('*/api/lists', () => new HttpResponse(null, { status: 204 })));
		await expect(mod.pgGet('/lists')).resolves.toBeUndefined();
	});
});
