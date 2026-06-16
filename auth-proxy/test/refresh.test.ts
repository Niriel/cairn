import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { app } from '../src/index.js';

// Stub GoTrue: the refresh handler exchanges the durable refresh cookie for a
// fresh token pair at POST /token?grant_type=refresh_token. Each test sets
// `respond` to model success / authoritative-revoke / transient-outage.
let lastReq: { method: string; url: string; body: string } | null;
let respond: (req: http.IncomingMessage, res: http.ServerResponse) => void;
let gotrue: http.Server;

beforeAll(async () => {
	gotrue = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			lastReq = {
				method: req.method ?? '',
				url: req.url ?? '',
				body: Buffer.concat(chunks).toString('utf8')
			};
			respond(req, res);
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
	lastReq = null;
});

function cookieFor(res: request.Response, prefix: string): string | undefined {
	const raw: unknown = res.headers['set-cookie'];
	const list = Array.isArray(raw) ? (raw as string[]) : [];
	return list.find((c) => c.startsWith(prefix));
}

describe('POST /auth/refresh', () => {
	it('(a) exchanges the durable cookie, re-plants both, returns a tokenless user', async () => {
		respond = (_req, res) => {
			res.statusCode = 200;
			res.setHeader('content-type', 'application/json');
			res.end(
				JSON.stringify({
					access_token: 'NEW.access',
					refresh_token: 'NEW.refresh',
					expires_in: 300,
					user: { id: 'u1' }
				})
			);
		};
		const res = await request(app).post('/auth/refresh').set('Cookie', 'cairn_session=OLD.refresh');

		expect(res.status).toBe(200);
		// Rotated refresh re-planted in the durable cookie, fresh JWT in access.
		expect(cookieFor(res, 'cairn_session=')).toContain('cairn_session=NEW.refresh');
		expect(cookieFor(res, 'cairn_session=')).not.toContain('OLD.refresh');
		expect(cookieFor(res, 'cairn_access=')).toContain('cairn_access=NEW.access');
		// Body carries the user but never a token.
		const body = res.body as { user?: unknown; access_token?: unknown; refresh_token?: unknown };
		expect(body.user).toEqual({ id: 'u1' });
		expect(body.access_token).toBeUndefined();
		expect(body.refresh_token).toBeUndefined();
		// GoTrue saw the durable refresh token, never the browser.
		expect(lastReq?.body).toContain('OLD.refresh');
	});

	it('(b) with no refresh cookie → 401 and never calls GoTrue', async () => {
		respond = (_req, res) => {
			res.statusCode = 200;
			res.end('{}');
		};
		const res = await request(app).post('/auth/refresh');
		expect(res.status).toBe(401);
		expect(lastReq).toBeNull();
	});

	it('(c) authoritative revoke (400 invalid_grant) → clears both cookies + 401', async () => {
		respond = (_req, res) => {
			res.statusCode = 400;
			res.setHeader('content-type', 'application/json');
			res.end(
				JSON.stringify({
					error: 'invalid_grant',
					error_description: 'Invalid Refresh Token: Already Used'
				})
			);
		};
		const res = await request(app)
			.post('/auth/refresh')
			.set('Cookie', 'cairn_session=STALE.refresh');
		expect(res.status).toBe(401);
		expect(cookieFor(res, 'cairn_session=')).toContain('Max-Age=0');
		expect(cookieFor(res, 'cairn_access=')).toContain('Max-Age=0');
	});

	it('(d) transient upstream failure (5xx) → 503 and leaves both cookies intact', async () => {
		respond = (_req, res) => {
			res.statusCode = 503;
			res.end('upstream down');
		};
		const res = await request(app)
			.post('/auth/refresh')
			.set('Cookie', 'cairn_session=LIVE.refresh');
		expect(res.status).toBe(503);
		// No Set-Cookie at all — a blip must not sign the user out.
		expect(res.headers['set-cookie']).toBeUndefined();
	});
});
