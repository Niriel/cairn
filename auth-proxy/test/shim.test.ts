import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { app } from '../src/index.js';

// The auth-proxy calls GoTrue only from its dedicated BFF handlers. Any other
// /auth/* request Caddy forwards here (every non-GET) — an unknown path, or a
// stray method on a BFF path — gets a 404 and never reaches GoTrue. That is what keeps client addresses
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

// Caddy sets X-Real-IP and adds X-Forwarded-For on every request it routes
// here; GoTrue would copy either into the `remote_addr` of its log line.
const FORWARDED = {
	'X-Forwarded-For': '203.0.113.7',
	'X-Real-IP': '203.0.113.7',
	Forwarded: 'for=203.0.113.7'
};

describe('auth-proxy: no generic GoTrue pass-through', () => {
	// The public password grant is among these: the only password-grant path is
	// the rate-limited /auth/signin.
	it.each([
		[
			'an unknown /auth path',
			() => request(app).get('/auth/user').set('Cookie', 'cairn_access=xxx.yyy.zzz')
		],
		[
			'a GoTrue-native endpoint',
			() => request(app).post('/auth/magiclink').send({ email: 'x@y.z' })
		],
		[
			'the public password grant',
			() =>
				request(app)
					.post('/auth/token?grant_type=password')
					.send({ email: 'u1@cairn.internal', password: 'x' })
		],
		[
			'any other grant type',
			() => request(app).post('/auth/token?grant_type=refresh_token').send({ refresh_token: 'r' })
		],
		['a stray method on a BFF path', () => request(app).get('/auth/refresh').set(FORWARDED)]
	])('answers %s with 404 and never calls GoTrue', async (_name, send) => {
		const res = await send();
		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'not found' });
		expect(gotrueReqs).toHaveLength(0);
	});
});
