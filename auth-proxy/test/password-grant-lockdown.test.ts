import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { app } from '../src/index.js';

// Password-grant lockdown: the public GoTrue password grant must be unreachable
// — the only password-grant path is the rate-limited /auth/signin. The
// auth-proxy has no generic GoTrue pass-through, so /auth/token answers 404 for
// every grant type and never reaches GoTrue.
let gotrueReqs: { method: string; url: string }[];
let gotrue: http.Server;
let postgrest: http.Server;

beforeAll(async () => {
	gotrue = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			gotrueReqs.push({ method: req.method ?? '', url: req.url ?? '' });
			res.statusCode = 200;
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify({ access_token: 'a', refresh_token: 'r', user: { id: 'u1' } }));
		});
	});
	// A stub PostgREST kept for hermeticity — no test here should reach a real
	// PostgREST host.
	postgrest = http.createServer((_req, res) => {
		res.statusCode = 200;
		res.setHeader('content-type', 'application/json');
		res.end(JSON.stringify([{ username: 'Grace' }]));
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
	gotrueReqs = [];
});

describe('public password-grant lockdown on /auth/token', () => {
	it('answers grant_type=password with 404 and never forwards to GoTrue', async () => {
		const res = await request(app)
			.post('/auth/token?grant_type=password')
			.send({ email: 'u1@cairn.internal', password: 'x' });
		expect(res.status).toBe(404);
		expect(gotrueReqs).toHaveLength(0);
	});

	it('answers any other grant type with 404 too', async () => {
		const res = await request(app)
			.post('/auth/token?grant_type=refresh_token')
			.send({ refresh_token: 'r' });
		expect(res.status).toBe(404);
		expect(gotrueReqs).toHaveLength(0);
	});
});
