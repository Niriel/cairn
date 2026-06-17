import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { server } from '$lib/test/server';
import { CSRF_HEADER } from '$lib/shared/model/auth-paths';

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

const SEED_USER = { id: '11111111-1111-1111-1111-111111111111', username: 'dev' };

describe('sendMagicLink', () => {
	test('POSTs `${VITE_AUTH_BASE}/magiclink?redirect_to=…` with {email}', async () => {
		let seenPath: string | null = null;
		let seenRedirectTo: string | null = null;
		let seenContentType: string | null = null;
		let seenBody: unknown = null;
		server.use(
			http.post('*/auth/magiclink', async ({ request }) => {
				const url = new URL(request.url);
				seenPath = url.pathname;
				seenRedirectTo = url.searchParams.get('redirect_to');
				seenContentType = request.headers.get('content-type');
				seenBody = await request.json();
				return HttpResponse.json({});
			})
		);
		await mod.sendMagicLink('alice@example.test');
		expect(seenPath).toBe('/auth/magiclink');
		expect(seenContentType).toMatch(/application\/json/);
		expect(seenBody).toEqual({ email: 'alice@example.test' });
		expect(seenRedirectTo).toMatch(/\/auth\/callback$/);
	});

	test('throws on non-2xx', async () => {
		server.use(
			http.post('*/auth/magiclink', () =>
				HttpResponse.json({ msg: 'rate limited' }, { status: 429 })
			)
		);
		const rejection = expect(mod.sendMagicLink('alice@example.test')).rejects;
		await rejection.toBeInstanceOf(Error);
		await rejection.toBeInstanceOf(mod.HttpError);
		await rejection.toMatchObject({ name: 'HttpError', status: 429 });
	});
});

describe('exchangeRefreshToken', () => {
	test('POSTs `${VITE_AUTH_BASE}/token?grant_type=refresh_token` with {refresh_token} and returns { user }', async () => {
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
		const result = await mod.exchangeRefreshToken('rt-abc');
		expect(seenPath).toBe('/auth/token');
		expect(seenSearch).toBe('?grant_type=refresh_token');
		expect(seenBody).toEqual({ refresh_token: 'rt-abc' });
		expect(result).toEqual({ user: SEED_USER });
	});

	test('throws when the 200 body is missing user.id/user.username', async () => {
		server.use(http.post('*/auth/token', () => HttpResponse.json({ access_token: 'x' })));
		await expect(mod.exchangeRefreshToken('rt-abc')).rejects.toBeInstanceOf(Error);
	});

	test('throws on non-2xx', async () => {
		server.use(
			http.post('*/auth/token', () => HttpResponse.json({ msg: 'token expired' }, { status: 401 }))
		);
		const rejection = expect(mod.exchangeRefreshToken('rt-abc')).rejects;
		await rejection.toBeInstanceOf(Error);
		await rejection.toBeInstanceOf(mod.HttpError);
		await rejection.toMatchObject({ name: 'HttpError', status: 401 });
	});
});

describe('signIn', () => {
	test('POSTs `${VITE_AUTH_BASE}/signin` with {username,password} + the CSRF header and returns { user }', async () => {
		let seenPath: string | null = null;
		let seenCsrf: string | null = null;
		let seenBody: unknown = null;
		server.use(
			http.post('*/auth/signin', async ({ request }) => {
				seenPath = new URL(request.url).pathname;
				seenCsrf = request.headers.get(CSRF_HEADER);
				seenBody = await request.json();
				return HttpResponse.json({ user: SEED_USER });
			})
		);
		const result = await mod.signIn('dev', 'cairn-dev');
		expect(seenPath).toBe('/auth/signin');
		expect(seenCsrf).not.toBeNull();
		expect(seenBody).toEqual({ username: 'dev', password: 'cairn-dev' });
		expect(result).toEqual({ user: SEED_USER });
	});

	test('throws when the 200 body is missing user.id/user.username', async () => {
		server.use(http.post('*/auth/signin', () => HttpResponse.json({ ok: true })));
		await expect(mod.signIn('dev', 'cairn-dev')).rejects.toBeInstanceOf(Error);
	});

	test('throws HttpError on a 401 (invalid credentials)', async () => {
		server.use(
			http.post('*/auth/signin', () =>
				HttpResponse.json({ error: 'invalid credentials' }, { status: 401 })
			)
		);
		const rejection = expect(mod.signIn('dev', 'wrong')).rejects;
		await rejection.toBeInstanceOf(mod.HttpError);
		await rejection.toMatchObject({ name: 'HttpError', status: 401 });
	});
});

describe('register', () => {
	test('POSTs `${VITE_AUTH_BASE}/register` with {username,password} + the CSRF header and returns { user }', async () => {
		let seenPath: string | null = null;
		let seenCsrf: string | null = null;
		let seenBody: unknown = null;
		server.use(
			http.post('*/auth/register', async ({ request }) => {
				seenPath = new URL(request.url).pathname;
				seenCsrf = request.headers.get(CSRF_HEADER);
				seenBody = await request.json();
				return HttpResponse.json({ user: SEED_USER });
			})
		);
		const result = await mod.register('dev', 'cairn-dev');
		expect(seenPath).toBe('/auth/register');
		expect(seenCsrf).not.toBeNull();
		expect(seenBody).toEqual({ username: 'dev', password: 'cairn-dev' });
		expect(result).toEqual({ user: SEED_USER });
	});

	test('throws when the 200 body is missing user.id/user.username', async () => {
		server.use(http.post('*/auth/register', () => HttpResponse.json({ ok: true })));
		await expect(mod.register('dev', 'cairn-dev')).rejects.toBeInstanceOf(Error);
	});

	test('throws HttpError on a 409 (username taken)', async () => {
		server.use(
			http.post('*/auth/register', () =>
				HttpResponse.json({ error: 'username taken' }, { status: 409 })
			)
		);
		const rejection = expect(mod.register('dev', 'cairn-dev')).rejects;
		await rejection.toBeInstanceOf(mod.HttpError);
		await rejection.toMatchObject({ name: 'HttpError', status: 409 });
	});
});

describe('verifyOtp', () => {
	test('POSTs `${VITE_AUTH_BASE}/verify` with {type, email, token} and returns { user }', async () => {
		let seenPath: string | null = null;
		let seenContentType: string | null = null;
		let seenBody: unknown = null;
		server.use(
			http.post('*/auth/verify', async ({ request }) => {
				const url = new URL(request.url);
				seenPath = url.pathname;
				seenContentType = request.headers.get('content-type');
				seenBody = await request.json();
				return HttpResponse.json({
					token_type: 'bearer',
					expires_in: 604800,
					user: SEED_USER
				});
			})
		);
		const result = await mod.verifyOtp('alice@example.test', '123456');
		expect(seenPath).toBe('/auth/verify');
		expect(seenContentType).toMatch(/application\/json/);
		expect(seenBody).toEqual({
			type: 'magiclink',
			email: 'alice@example.test',
			token: '123456'
		});
		expect(result).toEqual({ user: SEED_USER });
	});

	test('throws when the 200 body is missing user.id/user.username', async () => {
		server.use(http.post('*/auth/verify', () => HttpResponse.json({ access_token: 'x' })));
		await expect(mod.verifyOtp('alice@example.test', '123456')).rejects.toBeInstanceOf(Error);
	});

	test('throws HttpError on a 4xx (wrong or expired code)', async () => {
		server.use(
			http.post('*/auth/verify', () =>
				HttpResponse.json({ msg: 'Token has expired or is invalid' }, { status: 403 })
			)
		);
		const rejection = expect(mod.verifyOtp('alice@example.test', '000000')).rejects;
		await rejection.toBeInstanceOf(Error);
		await rejection.toBeInstanceOf(mod.HttpError);
		await rejection.toMatchObject({ name: 'HttpError', status: 403 });
	});
});

describe('signOut', () => {
	test('issues POST `${VITE_AUTH_BASE}/signout` with the CSRF header and no scope', async () => {
		let seenPath: string | null = null;
		let seenMethod: string | null = null;
		let seenSearch: string | null = null;
		let seenCsrf: string | null = null;
		server.use(
			http.post('*/auth/signout', ({ request }) => {
				const url = new URL(request.url);
				seenPath = url.pathname;
				seenSearch = url.search;
				seenMethod = request.method;
				seenCsrf = request.headers.get(CSRF_HEADER);
				return new HttpResponse(null, { status: 204 });
			})
		);
		await mod.signOut();
		expect(seenMethod).toBe('POST');
		expect(seenPath).toBe('/auth/signout');
		expect(seenSearch).toBe('');
		expect(seenCsrf).not.toBeNull();
	});

	test('throws on non-2xx', async () => {
		server.use(http.post('*/auth/signout', () => new HttpResponse(null, { status: 500 })));
		const rejection = expect(mod.signOut()).rejects;
		await rejection.toBeInstanceOf(Error);
		await rejection.toBeInstanceOf(mod.HttpError);
		await rejection.toMatchObject({ name: 'HttpError', status: 500 });
	});
});

describe('signOutEverywhere', () => {
	test('issues POST `${VITE_AUTH_BASE}/signout?scope=global` with the CSRF header', async () => {
		let seenSearch: string | null = null;
		let seenCsrf: string | null = null;
		server.use(
			http.post('*/auth/signout', ({ request }) => {
				const url = new URL(request.url);
				seenSearch = url.search;
				seenCsrf = request.headers.get(CSRF_HEADER);
				return new HttpResponse(null, { status: 204 });
			})
		);
		await mod.signOutEverywhere();
		expect(seenSearch).toBe('?scope=global');
		expect(seenCsrf).not.toBeNull();
	});
});

describe('refresh', () => {
	test('delegates to the shared single-flight refresh(): POSTs /auth/refresh with the CSRF header', async () => {
		let seenPath: string | null = null;
		let seenMethod: string | null = null;
		let seenCsrf: string | null = null;
		server.use(
			http.post('*/auth/refresh', ({ request }) => {
				seenPath = new URL(request.url).pathname;
				seenMethod = request.method;
				seenCsrf = request.headers.get(CSRF_HEADER);
				return HttpResponse.json({ user: SEED_USER });
			})
		);
		const result = await mod.refresh();
		expect(seenMethod).toBe('POST');
		expect(seenPath).toBe('/auth/refresh');
		expect(seenCsrf).not.toBeNull();
		expect(result).toEqual({ status: 'ok', user: SEED_USER });
	});
});
