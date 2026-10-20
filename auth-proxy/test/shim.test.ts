import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { app } from '../src/index.js';

// The auth-proxy calls GoTrue only from its dedicated BFF handlers. Any other
// /auth/* request — an unknown path, or a stray method on a BFF path, which
// Caddy's method-agnostic /auth/refresh* and /auth/signout* routes forward here
// — gets a 404 and never reaches GoTrue. That is what keeps client addresses
// out of GoTrue's request log (see docs/logging.md).
let gotrueReqs: { method: string; url: string }[];
let gotrue: http.Server;

beforeAll(async () => {
	gotrue = http.createServer((req, res) => {
		gotrueReqs.push({ method: req.method ?? '', url: req.url ?? '' });
		res.statusCode = 200;
		res.setHeader('content-type', 'application/json');
		res.end('{}');
	});
	await new Promise<void>((resolve) => gotrue.listen(0, '127.0.0.1', resolve));
	process.env.GOTRUE_URL = `http://127.0.0.1:${(gotrue.address() as AddressInfo).port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve, reject) =>
		gotrue.close((err) => (err ? reject(err) : resolve()))
	);
});

beforeEach(() => {
	gotrueReqs = [];
});

describe('auth-proxy: no generic GoTrue pass-through', () => {
	it('(a) answers an unknown /auth path with 404 and never calls GoTrue', async () => {
		const res = await request(app).get('/auth/user').set('Cookie', 'cairn_access=xxx.yyy.zzz');
		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'not found' });
		expect(gotrueReqs).toHaveLength(0);
	});

	it('(b) answers a GoTrue-native endpoint with 404 and never calls GoTrue', async () => {
		const res = await request(app).post('/auth/magiclink').send({ email: 'x@y.z' });
		expect(res.status).toBe(404);
		expect(gotrueReqs).toHaveLength(0);
	});

	it('(c) answers a stray method on a BFF path with 404, so no client address reaches GoTrue', async () => {
		// Caddy sets X-Real-IP and adds X-Forwarded-For on every request it routes
		// here; GoTrue would copy either into the `remote_addr` of its log line.
		const res = await request(app)
			.get('/auth/refresh')
			.set('X-Forwarded-For', '203.0.113.7')
			.set('X-Real-IP', '203.0.113.7')
			.set('Forwarded', 'for=203.0.113.7');
		expect(res.status).toBe(404);
		expect(gotrueReqs).toHaveLength(0);
	});
});
