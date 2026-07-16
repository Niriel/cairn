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

describe('setRecoveryEmail', () => {
	test('POSTs `${VITE_AUTH_BASE}/recovery-email` with {email} + the CSRF header', async () => {
		let seenPath: string | null = null;
		let seenCsrf: string | null = null;
		let seenBody: unknown = null;
		server.use(
			http.post('*/auth/recovery-email', async ({ request }) => {
				seenPath = new URL(request.url).pathname;
				seenCsrf = request.headers.get(CSRF_HEADER);
				seenBody = await request.json();
				return HttpResponse.json({ ok: true });
			})
		);
		await mod.setRecoveryEmail('alice@example.test');
		expect(seenPath).toBe('/auth/recovery-email');
		expect(seenCsrf).not.toBeNull();
		expect(seenBody).toEqual({ email: 'alice@example.test' });
	});

	test('throws HttpError on a 429 (send cap hit)', async () => {
		server.use(
			http.post('*/auth/recovery-email', () =>
				HttpResponse.json({ error: 'too many requests' }, { status: 429 })
			)
		);
		const rejection = expect(mod.setRecoveryEmail('alice@example.test')).rejects;
		await rejection.toBeInstanceOf(mod.HttpError);
		await rejection.toMatchObject({ name: 'HttpError', status: 429 });
	});
});

describe('confirmRecoveryEmail', () => {
	test('POSTs `${VITE_AUTH_BASE}/recovery-email/confirm` with {code} + the CSRF header', async () => {
		let seenPath: string | null = null;
		let seenCsrf: string | null = null;
		let seenBody: unknown = null;
		server.use(
			http.post('*/auth/recovery-email/confirm', async ({ request }) => {
				seenPath = new URL(request.url).pathname;
				seenCsrf = request.headers.get(CSRF_HEADER);
				seenBody = await request.json();
				return HttpResponse.json({ ok: true });
			})
		);
		await mod.confirmRecoveryEmail('123456');
		expect(seenPath).toBe('/auth/recovery-email/confirm');
		expect(seenCsrf).not.toBeNull();
		expect(seenBody).toEqual({ code: '123456' });
	});

	test('throws HttpError on a 400 (incorrect or expired code)', async () => {
		server.use(
			http.post('*/auth/recovery-email/confirm', () =>
				HttpResponse.json({ error: 'invalid or expired code' }, { status: 400 })
			)
		);
		const rejection = expect(mod.confirmRecoveryEmail('000000')).rejects;
		await rejection.toBeInstanceOf(mod.HttpError);
		await rejection.toMatchObject({ name: 'HttpError', status: 400 });
	});
});

describe('removeRecoveryEmail', () => {
	test('POSTs `${VITE_AUTH_BASE}/recovery-email` with {remove:true} + the CSRF header', async () => {
		let seenPath: string | null = null;
		let seenCsrf: string | null = null;
		let seenBody: unknown = null;
		server.use(
			http.post('*/auth/recovery-email', async ({ request }) => {
				seenPath = new URL(request.url).pathname;
				seenCsrf = request.headers.get(CSRF_HEADER);
				seenBody = await request.json();
				return HttpResponse.json({ ok: true });
			})
		);
		await mod.removeRecoveryEmail();
		expect(seenPath).toBe('/auth/recovery-email');
		expect(seenCsrf).not.toBeNull();
		expect(seenBody).toEqual({ remove: true });
	});

	test('throws HttpError on a 502 (upstream unavailable)', async () => {
		server.use(
			http.post('*/auth/recovery-email', () =>
				HttpResponse.json({ error: 'upstream auth service unavailable' }, { status: 502 })
			)
		);
		const rejection = expect(mod.removeRecoveryEmail()).rejects;
		await rejection.toBeInstanceOf(mod.HttpError);
		await rejection.toMatchObject({ name: 'HttpError', status: 502 });
	});
});

describe('requestPasswordReset', () => {
	test('POSTs `${VITE_AUTH_BASE}/forgot-password` with {username} + the CSRF header', async () => {
		let seenPath: string | null = null;
		let seenCsrf: string | null = null;
		let seenBody: unknown = null;
		server.use(
			http.post('*/auth/forgot-password', async ({ request }) => {
				seenPath = new URL(request.url).pathname;
				seenCsrf = request.headers.get(CSRF_HEADER);
				seenBody = await request.json();
				return HttpResponse.json({ ok: true });
			})
		);
		await mod.requestPasswordReset('dev');
		expect(seenPath).toBe('/auth/forgot-password');
		expect(seenCsrf).not.toBeNull();
		expect(seenBody).toEqual({ username: 'dev' });
	});

	// The anti-enumeration swallow is the ForgotPassword screen's job (3.3), NOT
	// the client's — requestPasswordReset throws like every other auth-client call.
	test('throws HttpError on a non-2xx (e.g. 429)', async () => {
		server.use(
			http.post('*/auth/forgot-password', () =>
				HttpResponse.json({ error: 'too many requests' }, { status: 429 })
			)
		);
		const rejection = expect(mod.requestPasswordReset('dev')).rejects;
		await rejection.toBeInstanceOf(mod.HttpError);
		await rejection.toMatchObject({ name: 'HttpError', status: 429 });
	});
});

describe('resetPassword', () => {
	test('POSTs `${VITE_AUTH_BASE}/reset-password` with {username, code, new_password} + the CSRF header', async () => {
		let seenPath: string | null = null;
		let seenCsrf: string | null = null;
		let seenBody: unknown = null;
		server.use(
			http.post('*/auth/reset-password', async ({ request }) => {
				seenPath = new URL(request.url).pathname;
				seenCsrf = request.headers.get(CSRF_HEADER);
				seenBody = await request.json();
				return HttpResponse.json({ ok: true });
			})
		);
		await mod.resetPassword('dev', '123456', 'new-cairn-pw');
		expect(seenPath).toBe('/auth/reset-password');
		expect(seenCsrf).not.toBeNull();
		expect(seenBody).toEqual({ username: 'dev', code: '123456', new_password: 'new-cairn-pw' });
	});

	test('throws HttpError on a 400 (invalid or expired code)', async () => {
		server.use(
			http.post('*/auth/reset-password', () =>
				HttpResponse.json({ error: 'invalid or expired code' }, { status: 400 })
			)
		);
		const rejection = expect(mod.resetPassword('dev', '000000', 'new-cairn-pw')).rejects;
		await rejection.toBeInstanceOf(mod.HttpError);
		await rejection.toMatchObject({ name: 'HttpError', status: 400 });
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
