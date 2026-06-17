import { delay, http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { server } from '$lib/test/server';

// Drives the REAL session module so the single-flight collapse of concurrent
// 401s is observable against the shared `refresh()` primitive (same rationale
// as the postgrest suite). VITE_AUTH_BASE is pinned so `/auth/refresh` resolves.
beforeAll(() => {
	vi.stubEnv('VITE_AUTH_BASE', '/auth');
});

afterAll(() => {
	vi.unstubAllEnvs();
});

let mod: typeof import('./bearer-write');
let session: typeof import('$lib/shared/state/session.svelte');

const USER = { id: 'u1', username: 'alice' };

beforeEach(async () => {
	vi.resetModules();
	mod = await import('./bearer-write');
	session = await import('$lib/shared/state/session.svelte');
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('bearerWrite', () => {
	test('a non-401 response is returned as-is, without refreshing', async () => {
		let writeHits = 0;
		let refreshHits = 0;
		server.use(
			http.post('*/avatars', () => {
				writeHits++;
				return HttpResponse.json({ version: 1 });
			}),
			http.post('*/auth/refresh', () => {
				refreshHits++;
				return HttpResponse.json({ user: USER });
			})
		);
		const res = await mod.bearerWrite('/avatars', { method: 'POST' });
		expect(res.status).toBe(200);
		expect(writeHits).toBe(1);
		expect(refreshHits).toBe(0);
	});

	test('a 401 refreshes once and retries once, returning the retry response', async () => {
		session.setSignedIn(USER);
		let writeHits = 0;
		let refreshHits = 0;
		server.use(
			http.delete('*/avatars/me', () => {
				writeHits++;
				return writeHits === 1
					? new HttpResponse(null, { status: 401 })
					: new HttpResponse(null, { status: 204 });
			}),
			http.post('*/auth/refresh', () => {
				refreshHits++;
				return HttpResponse.json({ user: USER });
			})
		);
		const res = await mod.bearerWrite('/avatars/me', { method: 'DELETE' });
		expect(res.status).toBe(204);
		expect(writeHits).toBe(2);
		expect(refreshHits).toBe(1);
	});

	test('a 401 followed by a failed refresh returns the original 401, without retrying', async () => {
		session.setSignedIn(USER);
		let writeHits = 0;
		server.use(
			http.delete('*/avatars/me', () => {
				writeHits++;
				return new HttpResponse(null, { status: 401 });
			}),
			http.post('*/auth/refresh', () => new HttpResponse(null, { status: 401 }))
		);
		const res = await mod.bearerWrite('/avatars/me', { method: 'DELETE' });
		expect(res.status).toBe(401);
		expect(writeHits).toBe(1); // refresh failed → no retry
	});

	test('N concurrent 401 writes collapse to exactly one /auth/refresh', async () => {
		session.setSignedIn(USER);
		let refreshHits = 0;
		server.use(
			http.delete('*/avatars/me', () => new HttpResponse(null, { status: 401 })),
			http.post('*/auth/refresh', async () => {
				refreshHits++;
				await delay(20);
				return HttpResponse.json({ user: USER });
			})
		);
		await Promise.allSettled([
			mod.bearerWrite('/avatars/me', { method: 'DELETE' }),
			mod.bearerWrite('/avatars/me', { method: 'DELETE' }),
			mod.bearerWrite('/avatars/me', { method: 'DELETE' })
		]);
		expect(refreshHits).toBe(1);
	});
});
