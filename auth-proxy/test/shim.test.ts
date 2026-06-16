import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { app } from '../src/index.js';

// A stub GoTrue: records the last request it received and replies via a
// per-test `respond` callback (default: a 200 JSON carrying tokens, so the
// narrowing tests prove the cookie-plant/bearer fire *only* where allowed,
// not merely because the response lacked tokens).
interface CapturedRequest {
	method: string;
	url: string;
	headers: http.IncomingHttpHeaders;
	body: string;
}

let lastReq: CapturedRequest | null;
let respond: (req: http.IncomingMessage, res: http.ServerResponse) => void;
let gotrue: http.Server;

function defaultRespond(_req: http.IncomingMessage, res: http.ServerResponse) {
	res.statusCode = 200;
	res.setHeader('content-type', 'application/json');
	res.end(
		JSON.stringify({ access_token: 'AAA.token', refresh_token: 'RRR.token', user: { id: 'u1' } })
	);
}

beforeAll(async () => {
	gotrue = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			lastReq = {
				method: req.method ?? '',
				url: req.url ?? '',
				headers: req.headers,
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
	respond = defaultRespond;
	delete process.env.COOKIE_SECURE;
});

afterEach(() => {
	delete process.env.COOKIE_SECURE;
});

function sessionCookie(res: request.Response): string | undefined {
	const raw: unknown = res.headers['set-cookie'];
	const list = Array.isArray(raw) ? (raw as string[]) : [];
	return list.find((c) => c.startsWith('cairn_session='));
}

function accessCookie(res: request.Response): string | undefined {
	const raw: unknown = res.headers['set-cookie'];
	const list = Array.isArray(raw) ? (raw as string[]) : [];
	return list.find((c) => c.startsWith('cairn_access='));
}

// Read the Authorization header GoTrue saw, via a helper so the assertions
// aren't tripped by TS narrowing `lastReq` to `null` after a `lastReq = null`
// reset (the value is repopulated asynchronously by the stub's request handler).
function capturedAuthHeader(): string | undefined {
	return lastReq?.headers.authorization;
}

describe('auth-proxy shim', () => {
	it('(a) plants both cookies on COOKIE_PLANT_PATHS but neither on /auth/magiclink', async () => {
		const onToken = await request(app).post('/auth/token').send({ grant_type: 'refresh_token' });
		// Durable cookie holds the refresh token, access cookie holds the JWT.
		expect(sessionCookie(onToken)).toContain('cairn_session=RRR.token');
		expect(accessCookie(onToken)).toContain('cairn_access=AAA.token');

		const onMagiclink = await request(app).post('/auth/magiclink').send({ email: 'x@y.z' });
		expect(sessionCookie(onMagiclink)).toBeUndefined();
		expect(accessCookie(onMagiclink)).toBeUndefined();
	});

	it('(b) strips access_token and refresh_token from the forwarded body', async () => {
		const res = await request(app).post('/auth/token').send({ grant_type: 'refresh_token' });
		const body = res.body as { access_token?: string; refresh_token?: string; user?: unknown };
		expect(body.access_token).toBeUndefined();
		expect(body.refresh_token).toBeUndefined();
		expect(body.user).toEqual({ id: 'u1' });
	});

	it('(c) attaches the bearer from the access cookie only on BEARER_AUTH_PATHS, never on anonymous endpoints', async () => {
		// The bearer comes from the short-lived access cookie — the durable
		// cookie now holds a refresh token GoTrue's /user would reject.
		await request(app).get('/auth/user').set('Cookie', 'cairn_access=xxx.yyy.zzz');
		expect(capturedAuthHeader()).toBe('Bearer xxx.yyy.zzz');

		lastReq = null;
		await request(app)
			.post('/auth/magiclink')
			.set('Cookie', 'cairn_access=xxx.yyy.zzz')
			.send({ email: 'x@y.z' });
		expect(capturedAuthHeader()).toBeUndefined();
	});

	it('(d) drops a client-supplied Authorization header on an anonymous endpoint', async () => {
		await request(app)
			.post('/auth/magiclink')
			.set('Authorization', 'Bearer client-supplied')
			.send({ email: 'x@y.z' });
		expect(capturedAuthHeader()).toBeUndefined();
	});

	// Sign-out moved to POST /auth/signout (revocable, server-side); its
	// behaviour is covered by signout.test.ts.

	it('(f) marks the cookie Secure iff COOKIE_SECURE === "true"', async () => {
		const insecure = await request(app).post('/auth/token').send({});
		expect(sessionCookie(insecure)).not.toContain('Secure');

		process.env.COOKIE_SECURE = 'true';
		const secure = await request(app).post('/auth/token').send({});
		expect(sessionCookie(secure)).toContain('Secure');
	});

	it('(g) forwards a GoTrue 302 unfollowed — Location verbatim, no cookie, no body rewrite', async () => {
		const location = 'https://cairn.example/auth/callback#access_token=ZZZ&refresh_token=QQQ';
		respond = (_req, res) => {
			res.statusCode = 302;
			res.setHeader('Location', location);
			res.end('redirecting');
		};
		const res = await request(app).get('/auth/verify?token=abc&type=magiclink');
		expect(res.status).toBe(302);
		expect(res.headers.location).toBe(location);
		expect(sessionCookie(res)).toBeUndefined();
		expect(res.text).toBe('redirecting');
	});
});
