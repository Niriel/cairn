import { delay, http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { server } from '$lib/test/server';
import { CSRF_HEADER } from '$lib/shared/model/auth-paths';

import type { AuthUser } from './session.svelte';

// VITE_AUTH_BASE is pinned for the suite so the URL prefix `bootSession`,
// `refresh`, and `signOut` build is asserted independently of any
// contributor's local `.env`. Matches Task 2.3 / Task 3.1's pattern.
beforeAll(() => {
	vi.stubEnv('VITE_AUTH_BASE', '/auth');
});

afterAll(() => {
	vi.unstubAllEnvs();
});

// The session store is a module singleton — exactly one `session` per
// page load. To exercise the `unknown` initial state across every test
// we re-import the module after `vi.resetModules()` in beforeEach.
let mod: typeof import('./session.svelte');

beforeEach(async () => {
	vi.resetModules();
	mod = await import('./session.svelte');
});

afterEach(() => {
	vi.restoreAllMocks();
});

const USER: AuthUser = { id: 'u1', email: 'alice@example.test' };

describe('refresh', () => {
	test('POSTs /auth/refresh with the CSRF header and adopts the tokenless user → ok', async () => {
		let seenMethod: string | null = null;
		let seenPath: string | null = null;
		let seenCsrf: string | null = null;
		server.use(
			http.post('*/auth/refresh', ({ request }) => {
				seenMethod = request.method;
				seenPath = new URL(request.url).pathname;
				seenCsrf = request.headers.get(CSRF_HEADER);
				return HttpResponse.json({ user: USER });
			})
		);
		const result = await mod.refresh();
		expect(seenMethod).toBe('POST');
		expect(seenPath).toBe('/auth/refresh');
		expect(seenCsrf).not.toBeNull();
		expect(result).toEqual({ status: 'ok', user: USER });
	});

	test('an authoritative 401 → revoked', async () => {
		// Default handler in handlers.ts already returns 401.
		expect(await mod.refresh()).toEqual({ status: 'revoked' });
	});

	test('a transient 503 → transient (not revoked)', async () => {
		server.use(http.post('*/auth/refresh', () => new HttpResponse(null, { status: 503 })));
		expect(await mod.refresh()).toEqual({ status: 'transient' });
	});

	test('any non-401 (e.g. 500) → transient', async () => {
		server.use(http.post('*/auth/refresh', () => new HttpResponse(null, { status: 500 })));
		expect(await mod.refresh()).toEqual({ status: 'transient' });
	});

	test('a network error → transient', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		server.use(http.post('*/auth/refresh', () => HttpResponse.error()));
		expect(await mod.refresh()).toEqual({ status: 'transient' });
	});

	test('a malformed user body on 200 → transient (not signed in with a half user)', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		server.use(http.post('*/auth/refresh', () => HttpResponse.json({ user: { id: 'u1' } })));
		expect(await mod.refresh()).toEqual({ status: 'transient' });
	});

	test('concurrent callers share one in-flight request; a fresh call afterwards refetches', async () => {
		let calls = 0;
		server.use(
			http.post('*/auth/refresh', async () => {
				calls++;
				await delay(20);
				return new HttpResponse(null, { status: 401 });
			})
		);
		await Promise.all([mod.refresh(), mod.refresh(), mod.refresh()]);
		expect(calls).toBe(1);
		await mod.refresh();
		expect(calls).toBe(2);
	});
});

describe('bootSession', () => {
	test('unknown → signed-in adopting the refresh user (no /auth/user call)', async () => {
		let userHits = 0;
		server.use(
			http.get('*/auth/user', () => {
				userHits++;
				return HttpResponse.json(USER);
			}),
			http.post('*/auth/refresh', () => HttpResponse.json({ user: USER }))
		);
		expect(mod.session.current.status).toBe('unknown');
		await mod.bootSession();
		expect(mod.session.current).toEqual({ status: 'signed-in', user: USER });
		expect(userHits).toBe(0);
	});

	test('unknown → signed-out on an authoritative 401', async () => {
		// Default handler returns 401.
		await mod.bootSession();
		expect(mod.session.current).toEqual({ status: 'signed-out' });
	});

	test('stays unknown on a transient 503 (does not bounce a valid session to sign-in)', async () => {
		server.use(http.post('*/auth/refresh', () => new HttpResponse(null, { status: 503 })));
		await mod.bootSession();
		expect(mod.session.current.status).toBe('unknown');
	});

	test('stays unknown on a network error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		server.use(http.post('*/auth/refresh', () => HttpResponse.error()));
		await mod.bootSession();
		expect(mod.session.current.status).toBe('unknown');
	});

	test('POSTs the `${VITE_AUTH_BASE}/refresh` URL with the CSRF header', async () => {
		const seen: { path: string; csrf: string | null }[] = [];
		server.use(
			http.post('*/auth/refresh', ({ request }) => {
				seen.push({
					path: new URL(request.url).pathname,
					csrf: request.headers.get(CSRF_HEADER)
				});
				return new HttpResponse(null, { status: 401 });
			})
		);
		await mod.bootSession();
		expect(seen).toHaveLength(1);
		expect(seen[0].path).toBe('/auth/refresh');
		expect(seen[0].csrf).not.toBeNull();
	});
});

describe('signOut', () => {
	test('POSTs /auth/signout with the CSRF header and transitions to signed-out', async () => {
		let hits = 0;
		let seenMethod: string | null = null;
		let seenCsrf: string | null = null;
		server.use(
			http.post('*/auth/signout', ({ request }) => {
				hits++;
				seenMethod = request.method;
				seenCsrf = request.headers.get(CSRF_HEADER);
				return new HttpResponse(null, { status: 204 });
			})
		);
		mod.setSignedIn(USER);
		expect(mod.session.current.status).toBe('signed-in');
		await mod.signOut();
		expect(hits).toBe(1);
		expect(seenMethod).toBe('POST');
		expect(seenCsrf).not.toBeNull();
		expect(mod.session.current).toEqual({ status: 'signed-out' });
	});

	test('is a no-op when already signed-out (no POST fires)', async () => {
		await mod.bootSession(); // 401 → signed-out
		expect(mod.session.current.status).toBe('signed-out');
		let hits = 0;
		server.use(
			http.post('*/auth/signout', () => {
				hits++;
				return new HttpResponse(null, { status: 204 });
			})
		);
		await mod.signOut();
		expect(hits).toBe(0);
		expect(mod.session.current.status).toBe('signed-out');
	});

	test('while unknown, fires signout and ends signed-out; a later boot ok does not overwrite', async () => {
		// Boot is delayed enough that signOut clearly resolves first; signOut
		// then writes signed-out in `finally`, and boot's ok branch must observe
		// `status !== 'unknown'` and skip the overwrite.
		const ghost: AuthUser = { id: 'ghost', email: 'ghost@example.test' };
		server.use(
			http.post('*/auth/refresh', async () => {
				await delay(30);
				return HttpResponse.json({ user: ghost });
			})
		);
		expect(mod.session.current.status).toBe('unknown');
		const bootP = mod.bootSession();
		const signOutP = mod.signOut();
		await Promise.all([bootP, signOutP]);
		expect(mod.session.current).toEqual({ status: 'signed-out' });
	});

	test('transitions to signed-out even when the POST rejects with a network error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		server.use(http.post('*/auth/signout', () => HttpResponse.error()));
		mod.setSignedIn(USER);
		await expect(mod.signOut()).resolves.toBeUndefined();
		expect(mod.session.current).toEqual({ status: 'signed-out' });
	});
});

describe('onUnauthorized', () => {
	test('signed-in → signed-out without HTTP', () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		mod.setSignedIn(USER);
		fetchSpy.mockClear();
		mod.onUnauthorized();
		expect(mod.session.current).toEqual({ status: 'signed-out' });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test('unknown → signed-out without HTTP', () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		expect(mod.session.current.status).toBe('unknown');
		mod.onUnauthorized();
		expect(mod.session.current).toEqual({ status: 'signed-out' });
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe('setSignedIn', () => {
	test('signed-out → signed-in without HTTP', async () => {
		await mod.bootSession(); // 401 → signed-out
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		mod.setSignedIn(USER);
		expect(mod.session.current).toEqual({ status: 'signed-in', user: USER });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test('unknown → signed-in without HTTP', () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		expect(mod.session.current.status).toBe('unknown');
		mod.setSignedIn(USER);
		expect(mod.session.current).toEqual({ status: 'signed-in', user: USER });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test('race: setSignedIn while unknown, boot resolves 401 afterwards — final is signed-in', async () => {
		server.use(
			http.post('*/auth/refresh', async () => {
				await delay(30);
				return new HttpResponse(null, { status: 401 });
			})
		);
		const bootP = mod.bootSession();
		mod.setSignedIn(USER);
		await bootP;
		expect(mod.session.current).toEqual({ status: 'signed-in', user: USER });
	});

	test('race: setSignedIn while unknown, boot resolves ok with a different user — keeps setSignedIn user', async () => {
		const bootUser: AuthUser = { id: 'u2', email: 'eve@example.test' };
		server.use(
			http.post('*/auth/refresh', async () => {
				await delay(30);
				return HttpResponse.json({ user: bootUser });
			})
		);
		const bootP = mod.bootSession();
		mod.setSignedIn(USER);
		await bootP;
		expect(mod.session.current).toEqual({ status: 'signed-in', user: USER });
	});

	test('while already signed-in is a no-op (does not overwrite the existing user)', () => {
		const u1: AuthUser = { id: 'u1-aaaa', email: 'alice@example.test' };
		const u2: AuthUser = { id: 'u2-bbbb', email: 'other@example.test' };
		mod.setSignedIn(u1);
		expect(mod.session.current).toEqual({ status: 'signed-in', user: u1 });
		mod.setSignedIn(u2);
		// Defends the "live cookie is the source of truth" contract: a refresh-
		// token regression that silently swapped the user field would be caught
		// here.
		expect(mod.session.current).toEqual({ status: 'signed-in', user: u1 });
	});
});

describe('concurrent bootSession calls', () => {
	test('share one fetch; a fresh call after signOut can fetch again', async () => {
		let calls = 0;
		server.use(
			http.post('*/auth/refresh', async () => {
				calls++;
				await delay(20);
				return new HttpResponse(null, { status: 401 });
			})
		);
		await Promise.all([mod.bootSession(), mod.bootSession()]);
		expect(calls).toBe(1);
		expect(mod.session.current.status).toBe('signed-out');
		await mod.signOut(); // no-op (already signed-out), no POST fired
		await mod.bootSession();
		expect(calls).toBe(2);
	});
});
