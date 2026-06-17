import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { app } from '../src/index.js';

// The legacy magic-link cookie-plant pass-throughs (/auth/token, /auth/verify)
// forward GoTrue's token-returning 200 to the browser. Like /auth/signin and
// /auth/refresh, the forwarded user must be enriched with the username (looked
// up by uid with the freshly planted access token) so the client adopts an
// identically-shaped AuthUser regardless of which path established the session.
let pgLast: { url: string; auth: string | undefined } | null;
let pgRespond: (res: http.ServerResponse) => void;
let gotrue: http.Server;
let postgrest: http.Server;

beforeAll(async () => {
	// GoTrue stub: a token-returning 200 (the shape a magic-link token exchange
	// yields) carrying the durable token pair and the bare GoTrue user.
	gotrue = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			res.statusCode = 200;
			res.setHeader('content-type', 'application/json');
			res.end(
				JSON.stringify({
					access_token: 'PLANTED.access',
					refresh_token: 'PLANTED.refresh',
					expires_in: 300,
					user: { id: 'u7', role: 'authenticated' }
				})
			);
		});
	});
	postgrest = http.createServer((req, res) => {
		pgLast = { url: req.url ?? '', auth: req.headers.authorization };
		pgRespond(res);
	});
	await new Promise<void>((resolve) => gotrue.listen(0, '127.0.0.1', resolve));
	await new Promise<void>((resolve) => postgrest.listen(0, '127.0.0.1', resolve));
	process.env.GOTRUE_URL = `http://127.0.0.1:${(gotrue.address() as AddressInfo).port}`;
	process.env.POSTGREST_URL = `http://127.0.0.1:${(postgrest.address() as AddressInfo).port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve, reject) =>
		gotrue.close((err) => (err ? reject(err) : resolve()))
	);
	await new Promise<void>((resolve, reject) =>
		postgrest.close((err) => (err ? reject(err) : resolve()))
	);
});

beforeEach(() => {
	pgLast = null;
	pgRespond = (res) => {
		res.statusCode = 200;
		res.setHeader('content-type', 'application/json');
		res.end(JSON.stringify([{ username: 'Grace' }]));
	};
});

function cookieFor(res: request.Response, prefix: string): string | undefined {
	const raw: unknown = res.headers['set-cookie'];
	const list = Array.isArray(raw) ? (raw as string[]) : [];
	return list.find((c) => c.startsWith(prefix));
}

describe('cookie-plant pass-through enrichment (/auth/token)', () => {
	it('replaces the forwarded user with { id, username } and plants both cookies, tokenless', async () => {
		const res = await request(app).post('/auth/token').send({ token: 'magic' });

		expect(res.status).toBe(200);
		// User enriched with the username; tokens stripped from the body.
		const body = res.body as { user?: unknown; access_token?: unknown; refresh_token?: unknown };
		expect(body.user).toEqual({ id: 'u7', username: 'Grace' });
		expect(body.access_token).toBeUndefined();
		expect(body.refresh_token).toBeUndefined();
		// Both cookies planted from the forwarded token pair.
		expect(cookieFor(res, 'cairn_session=')).toContain('cairn_session=PLANTED.refresh');
		expect(cookieFor(res, 'cairn_access=')).toContain('cairn_access=PLANTED.access');
		// The lookup ran with the freshly planted access token.
		expect(pgLast?.url).toBe('/profiles?id=eq.u7&select=username');
		expect(pgLast?.auth).toBe('Bearer PLANTED.access');
	});

	it('empty profile lookup → user carries only the id', async () => {
		pgRespond = (res) => {
			res.statusCode = 200;
			res.setHeader('content-type', 'application/json');
			res.end('[]');
		};
		const res = await request(app).post('/auth/token').send({ token: 'magic' });
		expect(res.status).toBe(200);
		expect((res.body as { user?: unknown }).user).toEqual({ id: 'u7' });
	});
});
