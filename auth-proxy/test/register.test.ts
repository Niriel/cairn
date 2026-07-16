import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { app } from '../src/index.js';
import { CSRF_HEADER } from '../src/lib/auth-paths.js';

// Register orchestrates GoTrue (signup with a transient address) and PostgREST
// (resolve_username pre-check, then the adopt_stable_identity + set_username RPCs
// under the new account's bearer). Two stub servers, each routing by URL with a
// per-route settable responder, let each test model success / taken / race /
// post-signup-failure independently and assert which upstreams were reached.
interface Rec {
	method: string;
	url: string;
	body: string;
	auth: string | undefined;
}
// Cleared (not reassigned) in beforeEach, so the stub handlers can close over the
// same array identities created here.
const pgReqs: Rec[] = [];
const gotrueReqs: Rec[] = [];
// PostgREST per-route responders.
let resolveRespond: (res: http.ServerResponse) => void;
let adoptRespond: (res: http.ServerResponse) => void;
let setUsernameRespond: (res: http.ServerResponse) => void;
// GoTrue /signup responder.
let signupRespond: (res: http.ServerResponse) => void;
let postgrest: http.Server;
let gotrue: http.Server;

function handler(reqs: Rec[], route: (url: string, res: http.ServerResponse) => void) {
	return (req: http.IncomingMessage, res: http.ServerResponse) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			reqs.push({
				method: req.method ?? '',
				url: req.url ?? '',
				body: Buffer.concat(chunks).toString('utf8'),
				auth: req.headers.authorization
			});
			route(req.url ?? '', res);
		});
	};
}

beforeAll(async () => {
	postgrest = http.createServer(
		handler(pgReqs, (url, res) => {
			if (url.startsWith('/rpc/resolve_username')) return resolveRespond(res);
			if (url.startsWith('/rpc/adopt_stable_identity')) return adoptRespond(res);
			if (url.startsWith('/rpc/set_username')) return setUsernameRespond(res);
			res.statusCode = 404;
			res.end('[]');
		})
	);
	gotrue = http.createServer(
		handler(gotrueReqs, (url, res) => {
			if (url.startsWith('/signup')) return signupRespond(res);
			res.statusCode = 404;
			res.end('{}');
		})
	);
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

// Defaults: username available, signup succeeds (autoconfirmed token set), both
// RPCs succeed. Each test overrides only the responder it exercises.
beforeEach(() => {
	pgReqs.length = 0;
	gotrueReqs.length = 0;
	resolveRespond = (res) => json(res, 200, []); // available
	signupRespond = (res) =>
		json(res, 200, {
			access_token: 'NEW.access',
			refresh_token: 'NEW.refresh',
			expires_in: 300,
			user: { id: 'u-new', email: 'transient@cairn.internal' }
		});
	adoptRespond = (res) => json(res, 200, null);
	setUsernameRespond = (res) => json(res, 200, null);
});

function cookieFor(res: request.Response, prefix: string): string | undefined {
	const raw: unknown = res.headers['set-cookie'];
	const list = Array.isArray(raw) ? (raw as string[]) : [];
	return list.find((c) => c.startsWith(prefix));
}

const signupReqs = () => gotrueReqs.filter((r) => r.url.startsWith('/signup'));
const rpc = (name: string) => pgReqs.filter((r) => r.url.startsWith(`/rpc/${name}`));

describe('POST /auth/register', () => {
	it('(a) valid → signup + adopt + set_username (bearer) → both cookies + tokenless user', async () => {
		const res = await request(app)
			.post('/auth/register')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'reg-a')
			.send({ username: 'NewHero', password: 'longenough' });

		expect(res.status).toBe(200);
		// Signup used a transient @cairn.internal address, not the username.
		expect(signupReqs()).toHaveLength(1);
		const signupBody = JSON.parse(signupReqs()[0].body) as { email: string };
		expect(signupBody.email).toMatch(/@cairn\.internal$/);
		expect(signupBody.email).not.toContain('newhero');
		// Both RPCs ran under the new account's bearer.
		expect(rpc('adopt_stable_identity')[0]?.auth).toBe('Bearer NEW.access');
		expect(rpc('set_username')).toHaveLength(1);
		expect(rpc('set_username')[0].auth).toBe('Bearer NEW.access');
		expect(JSON.parse(rpc('set_username')[0].body)).toEqual({ p_username: 'NewHero' });
		// Session planted from the signup token pair.
		expect(cookieFor(res, 'cairn_session=')).toContain('cairn_session=NEW.refresh');
		expect(cookieFor(res, 'cairn_access=')).toContain('cairn_access=NEW.access');
		// Tokenless body carrying the chosen username.
		const body = res.body as { user?: unknown; access_token?: unknown };
		expect(body.user).toEqual({ id: 'u-new', username: 'NewHero' });
		expect(body.access_token).toBeUndefined();
	});

	it('(b) taken username (pre-check resolves a row) → 409, signup never called', async () => {
		resolveRespond = (res) => json(res, 200, [{ id: 'u-old', username: 'NewHero' }]);
		const res = await request(app)
			.post('/auth/register')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'reg-b')
			.send({ username: 'NewHero', password: 'longenough' });
		expect(res.status).toBe(409);
		expect(res.body).toEqual({ error: 'username taken' });
		expect(signupReqs()).toHaveLength(0);
		expect(res.headers['set-cookie']).toBeUndefined();
	});

	it('(c) invalid username format → 400, nothing created', async () => {
		const res = await request(app)
			.post('/auth/register')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'reg-c')
			.send({ username: 'no', password: 'longenough' });
		expect(res.status).toBe(400);
		expect(signupReqs()).toHaveLength(0);
		expect(rpc('resolve_username')).toHaveLength(0);
	});

	it('(d) password shorter than 8 → 400, nothing created', async () => {
		const res = await request(app)
			.post('/auth/register')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'reg-d')
			.send({ username: 'NewHero', password: 'short' });
		expect(res.status).toBe(400);
		expect(signupReqs()).toHaveLength(0);
	});

	it('(e) set_username 23505 race → 409 with no session planted', async () => {
		setUsernameRespond = (res) =>
			json(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint' });
		const res = await request(app)
			.post('/auth/register')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'reg-e')
			.send({ username: 'NewHero', password: 'longenough' });
		expect(res.status).toBe(409);
		expect(res.body).toEqual({ error: 'username taken' });
		// Signup happened (the loser's orphan account), but no cookies planted.
		expect(signupReqs()).toHaveLength(1);
		expect(res.headers['set-cookie']).toBeUndefined();
	});

	it('(f) missing CSRF header → 403', async () => {
		const res = await request(app)
			.post('/auth/register')
			.set('X-Real-IP', 'reg-f')
			.send({ username: 'NewHero', password: 'longenough' });
		expect(res.status).toBe(403);
		expect(signupReqs()).toHaveLength(0);
	});

	it('(g) per-IP window exhausted → 429 without calling signup', async () => {
		const ip = 'reg-g';
		// 10 valid registrations from one IP (default ipMax) — each counts toward
		// the per-IP window and is never cleared (no recordSuccess on register).
		for (let i = 0; i < 10; i++) {
			await request(app)
				.post('/auth/register')
				.set(CSRF_HEADER, '1')
				.set('X-Real-IP', ip)
				.send({ username: `hero${i}`, password: 'longenough' });
		}
		const before = signupReqs().length;
		const res = await request(app)
			.post('/auth/register')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', ip)
			.send({ username: 'hero99', password: 'longenough' });
		expect(res.status).toBe(429);
		expect(res.body).toEqual({ error: 'too many requests' });
		expect(signupReqs().length).toBe(before); // signup not reached on the block
	});

	it('(h) post-signup step failure (adopt errors) → 500 with no session planted', async () => {
		adoptRespond = (res) => json(res, 500, { message: 'boom' });
		const res = await request(app)
			.post('/auth/register')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'reg-h')
			.send({ username: 'NewHero', password: 'longenough' });
		expect(res.status).toBe(500);
		expect(signupReqs()).toHaveLength(1); // orphan account accepted
		expect(res.headers['set-cookie']).toBeUndefined();
	});
});
