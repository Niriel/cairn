import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { app } from '../src/index.js';
import { CSRF_HEADER } from '../src/lib/auth-paths.js';

// Sign-in talks to two upstreams: PostgREST (resolve the typed username → uid,
// as anon) and GoTrue (the password grant against <uid>@cairn.internal). Two
// stub servers, each with a settable responder, let each test model the
// resolver hit/miss and the grant success/failure independently — and assert
// which upstreams were (not) reached.
let pgReqs: { method: string; url: string; body: string }[];
let gotrueReqs: { method: string; url: string; body: string }[];
let pgRespond: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void;
let gotrueRespond: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void;
let postgrest: http.Server;
let gotrue: http.Server;

function record(reqs: { method: string; url: string; body: string }[]) {
	return (respond: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void) =>
		(req: http.IncomingMessage, res: http.ServerResponse) => {
			const chunks: Buffer[] = [];
			req.on('data', (c: Buffer) => chunks.push(c));
			req.on('end', () => {
				const body = Buffer.concat(chunks).toString('utf8');
				reqs.push({ method: req.method ?? '', url: req.url ?? '', body });
				respond(req, res, body);
			});
		};
}

beforeAll(async () => {
	postgrest = http.createServer((req, res) => record(pgReqs)(pgRespond)(req, res));
	gotrue = http.createServer((req, res) => record(gotrueReqs)(gotrueRespond)(req, res));
	await new Promise<void>((resolve) => postgrest.listen(0, '127.0.0.1', resolve));
	await new Promise<void>((resolve) => gotrue.listen(0, '127.0.0.1', resolve));
	process.env.POSTGREST_URL = `http://127.0.0.1:${(postgrest.address() as AddressInfo).port}`;
	process.env.GOTRUE_URL = `http://127.0.0.1:${(gotrue.address() as AddressInfo).port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve, reject) =>
		postgrest.close((err) => (err ? reject(err) : resolve()))
	);
	await new Promise<void>((resolve, reject) =>
		gotrue.close((err) => (err ? reject(err) : resolve()))
	);
});

function json(res: http.ServerResponse, status: number, payload: unknown): void {
	res.statusCode = status;
	res.setHeader('content-type', 'application/json');
	res.end(JSON.stringify(payload));
}

// Default responders: resolver finds LaraCroft (uid u-lara), grant succeeds.
beforeEach(() => {
	pgReqs = [];
	gotrueReqs = [];
	pgRespond = (_req, res) => json(res, 200, [{ id: 'u-lara', username: 'LaraCroft' }]);
	gotrueRespond = (_req, res) =>
		json(res, 200, {
			access_token: 'ACCESS.jwt',
			refresh_token: 'REFRESH.tok',
			expires_in: 300,
			user: { id: 'u-lara', email: 'u-lara@cairn.internal' }
		});
});

function cookieFor(res: request.Response, prefix: string): string | undefined {
	const raw: unknown = res.headers['set-cookie'];
	const list = Array.isArray(raw) ? (raw as string[]) : [];
	return list.find((c) => c.startsWith(prefix));
}

const grantReqs = () => gotrueReqs.filter((r) => r.url.startsWith('/token'));

describe('POST /auth/signin', () => {
	it('(a) valid credentials → resolver + password grant → both cookies + tokenless user', async () => {
		const res = await request(app)
			.post('/auth/signin')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'ip-a')
			.send({ username: 'laracroft', password: 'correct horse' });

		expect(res.status).toBe(200);
		// Resolver was asked for the typed username; grant ran against the uid.
		expect(JSON.parse(pgReqs[0].body)).toEqual({ p_username: 'laracroft' });
		expect(grantReqs()).toHaveLength(1);
		expect(grantReqs()[0].url).toContain('grant_type=password');
		expect(grantReqs()[0].body).toContain('u-lara@cairn.internal');
		// Both cookies planted from the grant's token pair.
		expect(cookieFor(res, 'cairn_session=')).toContain('cairn_session=REFRESH.tok');
		expect(cookieFor(res, 'cairn_access=')).toContain('cairn_access=ACCESS.jwt');
		// Tokenless body carrying the canonical username casing.
		const body = res.body as { user?: unknown; access_token?: unknown; refresh_token?: unknown };
		expect(body.user).toEqual({ id: 'u-lara', username: 'LaraCroft' });
		expect(body.access_token).toBeUndefined();
		expect(body.refresh_token).toBeUndefined();
	});

	it('(b) unknown username → constant-shape 401, password grant never called', async () => {
		pgRespond = (_req, res) => json(res, 200, []); // resolver miss
		const res = await request(app)
			.post('/auth/signin')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'ip-b')
			.send({ username: 'nobody', password: 'whatever' });

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'invalid credentials' });
		expect(grantReqs()).toHaveLength(0);
		expect(res.headers['set-cookie']).toBeUndefined();
	});

	it('(c) wrong password → byte-identical 401 to the unknown-username case', async () => {
		gotrueRespond = (_req, res) =>
			json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
		const res = await request(app)
			.post('/auth/signin')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'ip-c')
			.send({ username: 'laracroft', password: 'wrong' });

		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'invalid credentials' });
		expect(res.headers['set-cookie']).toBeUndefined();
	});

	it('(d) missing CSRF header → 403, neither resolver nor grant called', async () => {
		const res = await request(app)
			.post('/auth/signin')
			.set('X-Real-IP', 'ip-d')
			.send({ username: 'laracroft', password: 'correct horse' });
		expect(res.status).toBe(403);
		expect(pgReqs).toHaveLength(0);
		expect(grantReqs()).toHaveLength(0);
	});

	it('(e) malformed/empty body → 400, neither resolver nor grant called', async () => {
		const res = await request(app)
			.post('/auth/signin')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'ip-e')
			.set('content-type', 'application/json')
			.send('not json');
		expect(res.status).toBe(400);
		expect(pgReqs).toHaveLength(0);
		expect(grantReqs()).toHaveLength(0);
	});

	// recordFailure: each credential failure counts against the per-IP window, so
	// a run of failures from one IP eventually trips the per-IP block (429) before
	// the attempt is even resolved. Distinct usernames avoid the per-account delay.
	it('(f) credential failures accumulate per IP → eventual 429 (recordFailure wired)', async () => {
		pgRespond = (_req, res) => json(res, 200, []); // every attempt a miss
		const ip = 'ip-f';
		let last = 200;
		// Distinct usernames per attempt so the per-account escalating delay never
		// fires — this test exercises only the per-IP block.
		for (let i = 0; i < 12; i++) {
			const r = await request(app)
				.post('/auth/signin')
				.set(CSRF_HEADER, '1')
				.set('X-Real-IP', ip)
				.send({ username: `f-ghost-${i}`, password: 'x' });
			last = r.status;
		}
		expect(last).toBe(429);
	});

	// recordSuccess: a correct sign-in clears the per-IP bucket, so prior failures
	// don't carry over toward the block.
	it('(g) a successful sign-in clears the per-IP failure count (recordSuccess wired)', async () => {
		const ip = 'ip-g';
		// 9 misses (one short of the default ipMax of 10). Distinct usernames
		// (globally unique across this file) so no per-account delay fires.
		pgRespond = (_req, res) => json(res, 200, []);
		for (let i = 0; i < 9; i++) {
			await request(app)
				.post('/auth/signin')
				.set(CSRF_HEADER, '1')
				.set('X-Real-IP', ip)
				.send({ username: `g1-ghost-${i}`, password: 'x' });
		}
		// A success from the same IP resets the bucket.
		pgRespond = (_req, res) => json(res, 200, [{ id: 'u-lara', username: 'LaraCroft' }]);
		const ok = await request(app)
			.post('/auth/signin')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', ip)
			.send({ username: 'laracroft', password: 'correct horse' });
		expect(ok.status).toBe(200);
		// 9 more misses would have tripped the block had the bucket not reset.
		pgRespond = (_req, res) => json(res, 200, []);
		let last = 200;
		for (let i = 0; i < 9; i++) {
			const r = await request(app)
				.post('/auth/signin')
				.set(CSRF_HEADER, '1')
				.set('X-Real-IP', ip)
				.send({ username: `g2-wraith-${i}`, password: 'x' });
			last = r.status;
		}
		expect(last).toBe(401);
	});
});
