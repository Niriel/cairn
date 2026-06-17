import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { app } from '../src/index.js';
import { CSRF_HEADER } from '../src/lib/auth-paths.js';

// Stub GoTrue that records every request it sees, so a CSRF rejection can be
// proven to have stopped *before* any upstream call. It also stamps CORS
// headers on every response: the custom-header CSRF defence only holds if the
// BFF never lets a cross-origin caller learn that `X-Cairn-Auth` is an allowed
// header, so the BFF must strip GoTrue's CORS headers rather than forward them.
let requests: { method: string; url: string }[];
let gotrue: http.Server;

beforeAll(async () => {
	gotrue = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			requests.push({ method: req.method ?? '', url: req.url ?? '' });
			// Attacker-visible-if-forwarded CORS headers — the BFF must strip these.
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Access-Control-Allow-Headers', 'X-Cairn-Auth, Authorization');
			res.statusCode = 200;
			res.setHeader('content-type', 'application/json');
			res.end(
				JSON.stringify({
					access_token: 'AAA.access',
					refresh_token: 'RRR.refresh',
					user: { id: 'u1' }
				})
			);
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
});

describe('CSRF: required custom header on state-changing /auth/*', () => {
	it('(a) POST /auth/refresh without the CSRF header → 403, no cookie change, no GoTrue call', async () => {
		const res = await request(app).post('/auth/refresh').set('Cookie', 'cairn_session=R0.refresh');

		expect(res.status).toBe(403);
		expect(res.headers['set-cookie']).toBeUndefined();
		expect(requests).toHaveLength(0);
	});

	it('(b) POST /auth/signout without the CSRF header → 403, no cookie change, no GoTrue call', async () => {
		const res = await request(app).post('/auth/signout').set('Cookie', 'cairn_session=R0.refresh');

		expect(res.status).toBe(403);
		expect(res.headers['set-cookie']).toBeUndefined();
		expect(requests).toHaveLength(0);
	});

	it('(c) POST /auth/refresh WITH the CSRF header proceeds normally', async () => {
		const res = await request(app)
			.post('/auth/refresh')
			.set(CSRF_HEADER, '1')
			.set('Cookie', 'cairn_session=R0.refresh');

		expect(res.status).toBe(200);
		// Reached GoTrue and re-planted the rotated session.
		expect(requests.some((r) => r.url.startsWith('/token'))).toBe(true);
		const cookies = res.headers['set-cookie'] as unknown as string[];
		expect(cookies.some((c) => c.startsWith('cairn_session='))).toBe(true);
	});

	it('(d) POST /auth/signout WITH the CSRF header proceeds normally', async () => {
		const res = await request(app)
			.post('/auth/signout')
			.set(CSRF_HEADER, '1')
			.set('Cookie', 'cairn_session=R0.refresh');

		expect(res.status).toBe(204);
		expect(requests.length).toBeGreaterThan(0);
	});

	it('(e) Cairn-shaped endpoints carry NO Access-Control-Allow-* (preflight + normal response)', async () => {
		// A cross-origin OPTIONS preflight must not learn that X-Cairn-Auth is an
		// allowed header, else the defence is void.
		const preflight = await request(app)
			.options('/auth/refresh')
			.set('Origin', 'https://evil.example')
			.set('Access-Control-Request-Headers', 'x-cairn-auth');
		expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
		expect(preflight.headers['access-control-allow-headers']).toBeUndefined();

		const normal = await request(app)
			.post('/auth/refresh')
			.set(CSRF_HEADER, '1')
			.set('Cookie', 'cairn_session=R0.refresh');
		expect(normal.headers['access-control-allow-origin']).toBeUndefined();
		expect(normal.headers['access-control-allow-headers']).toBeUndefined();
	});

	it('(f) the GoTrue pass-through does not forward GoTrue CORS headers either', async () => {
		const res = await request(app).get('/auth/user').set('Cookie', 'cairn_access=xxx.yyy');
		expect(res.headers['access-control-allow-origin']).toBeUndefined();
		expect(res.headers['access-control-allow-headers']).toBeUndefined();
	});
});
