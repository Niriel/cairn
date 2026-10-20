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
// A stub PostgREST kept so these tests stay offline and hermetic. The generic
// /auth pass-through does not itself call PostgREST (the cookie-plant
// enrichment retired with the magic-link surface), so the stub is defensive.
let postgrest: http.Server;

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
	postgrest = http.createServer((_req, res) => {
		res.statusCode = 200;
		res.setHeader('content-type', 'application/json');
		res.end('[]'); // no profile row → enrichment degrades to { id }
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
	lastReq = null;
	respond = defaultRespond;
	delete process.env.COOKIE_SECURE;
});

afterEach(() => {
	delete process.env.COOKIE_SECURE;
});

function sessionCookie(res: request.Response): string | undefined {
	// Prefix-aware: in prod (COOKIE_SECURE=true) the durable cookie is
	// __Host-cairn_session; in dev it is unprefixed. Match either.
	const raw: unknown = res.headers['set-cookie'];
	const list = Array.isArray(raw) ? (raw as string[]) : [];
	return list.find((c) => /^(?:__Host-)?cairn_session=/.test(c));
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
	it('(a) plants no cookies on a GoTrue pass-through, even on a token-returning 200 (cookie-plant retired)', async () => {
		const onToken = await request(app).post('/auth/token').send({ grant_type: 'refresh_token' });
		expect(sessionCookie(onToken)).toBeUndefined();
		expect(accessCookie(onToken)).toBeUndefined();

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

	it('(c) attaches no cookie-derived bearer on any GoTrue pass-through (bearer-attach retired)', async () => {
		// The BFF no longer reads a cookie into an upstream Authorization header;
		// GoTrue sees no bearer even when the access cookie is present.
		await request(app).get('/auth/user').set('Cookie', 'cairn_access=xxx.yyy.zzz');
		expect(capturedAuthHeader()).toBeUndefined();

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

	it('(h) forwards no client-IP header to GoTrue, so its request log never records a client address', async () => {
		// Caddy adds X-Forwarded-For and sets X-Real-IP on every request it
		// routes here; GoTrue copies either into the `remote_addr` of its log
		// line. Any request that reaches the generic pass-through (e.g. a GET
		// on a POST-only BFF path) must arrive without them.
		await request(app)
			.get('/auth/refresh')
			.set('X-Forwarded-For', '203.0.113.7')
			.set('X-Real-IP', '203.0.113.7')
			.set('Forwarded', 'for=203.0.113.7');
		expect(lastReq).not.toBeNull();
		expect(lastReq?.headers['x-forwarded-for']).toBeUndefined();
		expect(lastReq?.headers['x-real-ip']).toBeUndefined();
		expect(lastReq?.headers.forwarded).toBeUndefined();
	});

	// Sign-out moved to POST /auth/signout (revocable, server-side); its
	// behaviour is covered by signout.test.ts. The cookie Secure + __Host-
	// prefix behaviour is covered by cookies.test.ts (plantSession directly),
	// now that no /auth pass-through plants a cookie.

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
