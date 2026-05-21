import { delay, http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { server } from '$lib/test/server';

import type { AuthUser } from './session.svelte';

// VITE_AUTH_BASE is pinned for the suite so the URL prefix `bootSession`
// and `signOut` build is asserted independently of any contributor's
// local `.env`. Matches Task 2.3 / Task 3.1's pattern.
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

describe('bootSession', () => {
	test('unknown → signed-in on 200 with user payload', async () => {
		const user: AuthUser = { id: 'u1', email: 'alice@example.test' };
		server.use(http.get('*/auth/user', () => HttpResponse.json(user)));
		expect(mod.session.current.status).toBe('unknown');
		await mod.bootSession();
		expect(mod.session.current).toEqual({ status: 'signed-in', user });
	});

	test('unknown → signed-out on 401', async () => {
		// Default handler in handlers.ts already returns 401.
		await mod.bootSession();
		expect(mod.session.current).toEqual({ status: 'signed-out' });
	});

	test('unknown → signed-out on 500', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		server.use(http.get('*/auth/user', () => new HttpResponse(null, { status: 500 })));
		await mod.bootSession();
		expect(mod.session.current.status).toBe('signed-out');
	});

	test('unknown → signed-out on 503', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		server.use(http.get('*/auth/user', () => new HttpResponse(null, { status: 503 })));
		await mod.bootSession();
		expect(mod.session.current.status).toBe('signed-out');
	});

	test('unknown → signed-out on network error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		server.use(http.get('*/auth/user', () => HttpResponse.error()));
		await mod.bootSession();
		expect(mod.session.current.status).toBe('signed-out');
	});

	test('hits the `${VITE_AUTH_BASE}/user` URL', async () => {
		const seen: string[] = [];
		server.use(
			http.get('*/auth/user', ({ request }) => {
				seen.push(new URL(request.url).pathname);
				return new HttpResponse(null, { status: 401 });
			})
		);
		await mod.bootSession();
		expect(seen).toEqual(['/auth/user']);
	});
});

describe('signOut', () => {
	test('calls DELETE /auth/session and transitions to signed-out', async () => {
		let deleteHits = 0;
		server.use(
			http.delete('*/auth/session', () => {
				deleteHits++;
				return new HttpResponse(null, { status: 204 });
			})
		);
		mod.setSignedIn({ id: 'u1', email: 'alice@example.test' });
		expect(mod.session.current.status).toBe('signed-in');
		await mod.signOut();
		expect(deleteHits).toBe(1);
		expect(mod.session.current).toEqual({ status: 'signed-out' });
	});

	test('is a no-op when already signed-out (no DELETE fires)', async () => {
		// Land in signed-out via the default 401 boot — no DELETE involved.
		await mod.bootSession();
		expect(mod.session.current.status).toBe('signed-out');
		let deleteHits = 0;
		server.use(
			http.delete('*/auth/session', () => {
				deleteHits++;
				return new HttpResponse(null, { status: 204 });
			})
		);
		await mod.signOut();
		expect(deleteHits).toBe(0);
		expect(mod.session.current.status).toBe('signed-out');
	});

	test('while unknown, fires DELETE and ends signed-out; a later boot 200 does not overwrite', async () => {
		// Boot is delayed enough that signOut clearly resolves first; signOut
		// then writes signed-out in `finally`, and boot's 2xx branch must
		// observe `status !== 'unknown'` and skip the overwrite.
		const ghost: AuthUser = { id: 'ghost', email: 'ghost@example.test' };
		server.use(
			http.get('*/auth/user', async () => {
				await delay(30);
				return HttpResponse.json(ghost);
			})
		);
		expect(mod.session.current.status).toBe('unknown');
		const bootP = mod.bootSession();
		const signOutP = mod.signOut();
		await Promise.all([bootP, signOutP]);
		expect(mod.session.current).toEqual({ status: 'signed-out' });
	});

	test('transitions to signed-out even when DELETE rejects with a network error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		server.use(http.delete('*/auth/session', () => HttpResponse.error()));
		mod.setSignedIn({ id: 'u1', email: 'alice@example.test' });
		await expect(mod.signOut()).resolves.toBeUndefined();
		expect(mod.session.current).toEqual({ status: 'signed-out' });
	});
});

describe('onUnauthorized', () => {
	test('signed-in → signed-out without HTTP', () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		mod.setSignedIn({ id: 'u1', email: 'alice@example.test' });
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
	const user: AuthUser = { id: 'u1', email: 'alice@example.test' };

	test('signed-out → signed-in without HTTP', async () => {
		await mod.bootSession(); // 401 → signed-out
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		mod.setSignedIn(user);
		expect(mod.session.current).toEqual({ status: 'signed-in', user });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test('unknown → signed-in without HTTP', () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		expect(mod.session.current.status).toBe('unknown');
		mod.setSignedIn(user);
		expect(mod.session.current).toEqual({ status: 'signed-in', user });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test('race: setSignedIn while unknown, boot resolves 401 afterwards — final is signed-in', async () => {
		server.use(
			http.get('*/auth/user', async () => {
				await delay(30);
				return new HttpResponse(null, { status: 401 });
			})
		);
		const bootP = mod.bootSession();
		mod.setSignedIn(user);
		await bootP;
		expect(mod.session.current).toEqual({ status: 'signed-in', user });
	});

	test('race: setSignedIn while unknown, boot resolves 200 with a different user — keeps setSignedIn user', async () => {
		const bootUser: AuthUser = { id: 'u2', email: 'eve@example.test' };
		server.use(
			http.get('*/auth/user', async () => {
				await delay(30);
				return HttpResponse.json(bootUser);
			})
		);
		const bootP = mod.bootSession();
		mod.setSignedIn(user);
		await bootP;
		expect(mod.session.current).toEqual({ status: 'signed-in', user });
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
			http.get('*/auth/user', async () => {
				calls++;
				await delay(20);
				return new HttpResponse(null, { status: 401 });
			})
		);
		await Promise.all([mod.bootSession(), mod.bootSession()]);
		expect(calls).toBe(1);
		expect(mod.session.current.status).toBe('signed-out');
		await mod.signOut(); // no-op (already signed-out), no DELETE fired
		await mod.bootSession();
		expect(calls).toBe(2);
	});
});
