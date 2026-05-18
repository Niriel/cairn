import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { server } from '$lib/test/server';

// VITE_AUTH_BASE is pinned for the suite so the URL prefix the auth
// client builds is asserted independently of any contributor's local
// `.env`. Same rationale as the postgrest suite's VITE_API_BASE
// pinning (Task 2.3).
beforeAll(() => {
	vi.stubEnv('VITE_AUTH_BASE', '/auth');
});

afterAll(() => {
	vi.unstubAllEnvs();
});

let mod: typeof import('./auth-client');

beforeEach(async () => {
	vi.resetModules();
	mod = await import('./auth-client');
});

afterEach(() => {
	vi.restoreAllMocks();
});

const SEED_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'dev@example.test' };

describe('sendMagicLink', () => {
	test('POSTs `${VITE_AUTH_BASE}/otp` with {email, create_user: true}', async () => {
		let seenPath: string | null = null;
		let seenContentType: string | null = null;
		let seenBody: unknown = null;
		server.use(
			http.post('*/auth/otp', async ({ request }) => {
				seenPath = new URL(request.url).pathname;
				seenContentType = request.headers.get('content-type');
				seenBody = await request.json();
				return HttpResponse.json({});
			})
		);
		await mod.sendMagicLink('alice@example.test');
		expect(seenPath).toBe('/auth/otp');
		expect(seenContentType).toMatch(/application\/json/);
		expect(seenBody).toEqual({ email: 'alice@example.test', create_user: true });
	});

	test('throws on non-2xx', async () => {
		server.use(
			http.post('*/auth/otp', () => HttpResponse.json({ msg: 'rate limited' }, { status: 429 }))
		);
		const rejection = expect(mod.sendMagicLink('alice@example.test')).rejects;
		await rejection.toBeInstanceOf(Error);
		await rejection.toBeInstanceOf(mod.HttpError);
		await rejection.toMatchObject({ name: 'HttpError', status: 429 });
	});
});

describe('verifyToken', () => {
	test('POSTs `${VITE_AUTH_BASE}/verify` and returns { user } parsed from the 200 body', async () => {
		let seenPath: string | null = null;
		let seenBody: unknown = null;
		server.use(
			http.post('*/auth/verify', async ({ request }) => {
				seenPath = new URL(request.url).pathname;
				seenBody = await request.json();
				return HttpResponse.json({
					token_type: 'bearer',
					expires_in: 604800,
					user: SEED_USER
				});
			})
		);
		const result = await mod.verifyToken({ token: 'tok-abc', type: 'magiclink' });
		expect(seenPath).toBe('/auth/verify');
		expect(seenBody).toEqual({ token: 'tok-abc', type: 'magiclink' });
		expect(result).toEqual({ user: SEED_USER });
	});

	test('throws when the 200 body is missing user.id/user.email', async () => {
		server.use(http.post('*/auth/verify', () => HttpResponse.json({ access_token: 'x' })));
		await expect(mod.verifyToken({ token: 'tok-abc', type: 'magiclink' })).rejects.toBeInstanceOf(
			Error
		);
	});

	test('throws on non-2xx', async () => {
		server.use(
			http.post('*/auth/verify', () => HttpResponse.json({ msg: 'token expired' }, { status: 401 }))
		);
		const rejection = expect(mod.verifyToken({ token: 'tok-abc', type: 'magiclink' })).rejects;
		await rejection.toBeInstanceOf(Error);
		await rejection.toBeInstanceOf(mod.HttpError);
		await rejection.toMatchObject({ name: 'HttpError', status: 401 });
	});
});

describe('devPasswordSignIn', () => {
	test('POSTs `${VITE_AUTH_BASE}/token?grant_type=password` with explicit password and returns { user }', async () => {
		let seenPath: string | null = null;
		let seenSearch: string | null = null;
		let seenBody: unknown = null;
		server.use(
			http.post('*/auth/token', async ({ request }) => {
				const url = new URL(request.url);
				seenPath = url.pathname;
				seenSearch = url.search;
				seenBody = await request.json();
				return HttpResponse.json({
					token_type: 'bearer',
					expires_in: 604800,
					user: SEED_USER
				});
			})
		);
		const result = await mod.devPasswordSignIn('alice@example.test', 'cairn-dev');
		expect(seenPath).toBe('/auth/token');
		expect(seenSearch).toBe('?grant_type=password');
		expect(seenBody).toEqual({ email: 'alice@example.test', password: 'cairn-dev' });
		expect(result).toEqual({ user: SEED_USER });
	});

	test('throws when the 200 body is missing user.id/user.email', async () => {
		server.use(http.post('*/auth/token', () => HttpResponse.json({ access_token: 'x' })));
		await expect(mod.devPasswordSignIn('alice@example.test', 'cairn-dev')).rejects.toBeInstanceOf(
			Error
		);
	});

	test('throws on non-2xx', async () => {
		server.use(
			http.post('*/auth/token', () => HttpResponse.json({ msg: 'invalid grant' }, { status: 400 }))
		);
		const rejection = expect(mod.devPasswordSignIn('alice@example.test', 'cairn-dev')).rejects;
		await rejection.toBeInstanceOf(Error);
		await rejection.toBeInstanceOf(mod.HttpError);
		await rejection.toMatchObject({ name: 'HttpError', status: 400 });
	});
});

describe('logout', () => {
	test('issues DELETE `${VITE_AUTH_BASE}/session`', async () => {
		let seenPath: string | null = null;
		let seenMethod: string | null = null;
		server.use(
			http.delete('*/auth/session', ({ request }) => {
				seenPath = new URL(request.url).pathname;
				seenMethod = request.method;
				return new HttpResponse(null, { status: 204 });
			})
		);
		await mod.logout();
		expect(seenMethod).toBe('DELETE');
		expect(seenPath).toBe('/auth/session');
	});

	test('throws on non-2xx', async () => {
		server.use(http.delete('*/auth/session', () => new HttpResponse(null, { status: 500 })));
		const rejection = expect(mod.logout()).rejects;
		await rejection.toBeInstanceOf(Error);
		await rejection.toBeInstanceOf(mod.HttpError);
		await rejection.toMatchObject({ name: 'HttpError', status: 500 });
	});
});
