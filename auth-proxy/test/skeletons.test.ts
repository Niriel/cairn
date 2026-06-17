import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { app } from '../src/index.js';
import { CSRF_HEADER } from '../src/lib/auth-paths.js';

// Stub GoTrue that records every request it sees, so the skeleton can be proven
// to short-circuit *before* any upstream call (a 501 must not reach GoTrue).
let requests: { method: string; url: string }[];
let gotrue: http.Server;

beforeAll(async () => {
	gotrue = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			requests.push({ method: req.method ?? '', url: req.url ?? '' });
			res.statusCode = 200;
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify({ user: { id: 'u1' } }));
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

// 2002 defines the Cairn-shaped credential surface as route skeletons behind the
// CSRF guard; 2003 fills in the username+password logic. The skeletons must pass
// the CSRF gate (proving the guard is mounted) and then answer 501, without ever
// reaching GoTrue.
describe('Cairn-shaped credential skeletons (/auth/signin, /auth/register)', () => {
	for (const path of ['/auth/signin', '/auth/register']) {
		it(`${path} without the CSRF header → 403, no GoTrue call`, async () => {
			const res = await request(app).post(path);
			expect(res.status).toBe(403);
			expect(requests).toHaveLength(0);
		});

		it(`${path} WITH the CSRF header → 501 (skeleton), no GoTrue call`, async () => {
			const res = await request(app).post(path).set(CSRF_HEADER, '1').send({ username: 'alice' });
			expect(res.status).toBe(501);
			expect(requests).toHaveLength(0);
		});
	}
});
