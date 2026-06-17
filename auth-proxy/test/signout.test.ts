import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { app } from '../src/index.js';
import { CSRF_HEADER } from '../src/lib/auth-paths.js';

// Stub GoTrue. Sign-out is a two-call dance: the proxy mints a fresh access
// token from the durable refresh cookie (POST /token?grant_type=refresh_token —
// the access cookie's JWT may be expired), then POSTs /logout with that bearer
// to revoke server-side. The stub records every request so the tests can assert
// the /logout scope and bearer.
interface Captured {
	method: string;
	url: string;
	auth?: string;
}
let requests: Captured[];
let logoutStatus: number;
let gotrue: http.Server;

beforeAll(async () => {
	gotrue = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			const url = req.url ?? '';
			requests.push({
				method: req.method ?? '',
				url,
				auth: req.headers.authorization
			});
			if (url.startsWith('/token')) {
				// The mint: hand back an access token to log out with.
				res.statusCode = 200;
				res.setHeader('content-type', 'application/json');
				res.end(
					JSON.stringify({
						access_token: 'MINTED.access',
						refresh_token: 'ROTATED.refresh',
						user: { id: 'u1' }
					})
				);
				return;
			}
			// /logout — status is per-test (204 success, or a failure for (c)).
			res.statusCode = logoutStatus;
			res.end();
		});
	});
	await new Promise<void>((resolve) => gotrue.listen(0, '127.0.0.1', resolve));
	const { port } = gotrue.address() as AddressInfo;
	process.env.GOTRUE_URL = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve, reject) =>
		gotrue.close((err) => (err ? reject(err) : resolve()))
	);
});

beforeEach(() => {
	requests = [];
	logoutStatus = 204;
});

function cookieFor(res: request.Response, prefix: string): string | undefined {
	const raw: unknown = res.headers['set-cookie'];
	const list = Array.isArray(raw) ? (raw as string[]) : [];
	return list.find((c) => c.startsWith(prefix));
}

function logoutCall(): Captured | undefined {
	return requests.find((r) => r.url.startsWith('/logout'));
}

describe('POST /auth/signout', () => {
	it('(a) calls GoTrue /logout (local scope) with a minted bearer and clears both cookies', async () => {
		const res = await request(app)
			.post('/auth/signout')
			.set(CSRF_HEADER, '1')
			.set('Cookie', 'cairn_session=R0.refresh');

		expect(res.status).toBe(204);
		// Minted an access token from the durable refresh token, then logged out.
		expect(requests.some((r) => r.url.startsWith('/token'))).toBe(true);
		const logout = logoutCall();
		expect(logout?.url).toContain('scope=local');
		expect(logout?.auth).toBe('Bearer MINTED.access');
		// Both cookies cleared.
		expect(cookieFor(res, 'cairn_session=')).toContain('Max-Age=0');
		expect(cookieFor(res, 'cairn_access=')).toContain('Max-Age=0');
	});

	it('(b) ?scope=global calls GoTrue /logout?scope=global', async () => {
		const res = await request(app)
			.post('/auth/signout?scope=global')
			.set(CSRF_HEADER, '1')
			.set('Cookie', 'cairn_session=R0.refresh');

		expect(res.status).toBe(204);
		expect(logoutCall()?.url).toContain('scope=global');
		expect(cookieFor(res, 'cairn_session=')).toContain('Max-Age=0');
		expect(cookieFor(res, 'cairn_access=')).toContain('Max-Age=0');
	});

	it('(c) clears both cookies even when GoTrue /logout fails', async () => {
		logoutStatus = 500;
		const res = await request(app)
			.post('/auth/signout')
			.set(CSRF_HEADER, '1')
			.set('Cookie', 'cairn_session=R0.refresh');

		// Explicit user intent wins — cookies cleared regardless of GoTrue.
		expect(res.status).toBe(204);
		expect(logoutCall()).toBeDefined();
		expect(cookieFor(res, 'cairn_session=')).toContain('Max-Age=0');
		expect(cookieFor(res, 'cairn_access=')).toContain('Max-Age=0');
	});
});
