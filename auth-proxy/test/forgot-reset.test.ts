import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { app } from '../src/index.js';
import { CSRF_HEADER } from '../src/lib/auth-paths.js';
import { setMailTransport, type MailTransport } from '../src/lib/mail.js';

// The signed-out recovery endpoints, both behind the scoped cairn_auth_bff role:
//   POST /auth/forgot-password {username} — anti-enumeration. Emits a constant 200
//     and runs the lookup-and-send entirely AFTER responding (R5 timing parity), so
//     a username with a recovery e-mail is indistinguishable, by body or by timing,
//     from one without. The scoped RPC request_password_reset returns the on-file
//     address (or null); only on an address does the code get mailed.
//   POST /auth/reset-password {username, code, new_password} — reset_password via
//     the scoped role returns a status string; the BFF collapses 'invalid'/'locked'
//     to one generic error (reveals less than the authenticated confirm path) and
//     maps a raised 23514 (too-short) to the register flow's minimum-length error.
//     No cookie is ever planted (the user signs in afterwards).
//
// A stub PostgREST routes by URL with a per-route settable responder; a recording
// mail transport captures the sent code without a real SMTP server.
interface Rec {
	method: string;
	url: string;
	body: string;
	auth: string | undefined;
}
// Cleared (not reassigned) in beforeEach so the stub closes over one array.
const pgReqs: Rec[] = [];
let forgotRespond: (res: http.ServerResponse) => void;
let resetRespond: (res: http.ServerResponse) => void;
let postgrest: http.Server;
// Responses a test deliberately leaves open (the "200 not awaiting the lookup"
// case) are tracked here and ended in afterEach so no socket hangs the suite.
const held: http.ServerResponse[] = [];

// Recording mail transport — captures the to/subject/text of each send.
const sent: Array<{ to: string; subject: string; text: string }> = [];
const recordingMail: MailTransport = {
	sendMail(opts) {
		sent.push({ to: opts.to, subject: opts.subject, text: opts.text });
		return Promise.resolve({});
	}
};

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
			if (url.startsWith('/rpc/request_password_reset')) return forgotRespond(res);
			if (url.startsWith('/rpc/reset_password')) return resetRespond(res);
			res.statusCode = 404;
			res.end('{}');
		})
	);
	await new Promise<void>((resolve) => postgrest.listen(0, '127.0.0.1', resolve));
	process.env.POSTGREST_URL = `http://127.0.0.1:${(postgrest.address() as AddressInfo).port}`;
	// The scoped-role JWT the forgot/reset client attaches (Task 2.4 provisions the
	// real one); tests assert the calls go out under this bearer, never anon.
	process.env.AUTH_BFF_DB_JWT = 'BFF.jwt';
	setMailTransport(recordingMail);
});

afterAll(async () => {
	setMailTransport(null);
	await new Promise<void>((resolve, reject) =>
		postgrest.close((err) => (err ? reject(err) : resolve()))
	);
});

function json(res: http.ServerResponse, status: number, payload: unknown): void {
	res.statusCode = status;
	res.setHeader('content-type', 'application/json');
	res.end(JSON.stringify(payload));
}

// Defaults: forgot resolves a recovery address (so a code is mailed), reset
// matches the code ('ok'). Each test overrides only the responder it exercises.
beforeEach(() => {
	pgReqs.length = 0;
	sent.length = 0;
	forgotRespond = (res) => json(res, 200, 'alice@example.test');
	resetRespond = (res) => json(res, 200, 'ok');
});

afterEach(() => {
	for (const res of held) {
		try {
			res.end('{}');
		} catch {
			// already closed — ignore
		}
	}
	held.length = 0;
});

const rpc = (name: string) => pgReqs.filter((r) => r.url.startsWith(`/rpc/${name}`));

describe('POST /auth/forgot-password', () => {
	it('(a) known username with a recovery e-mail → 200, code mailed under the scoped role', async () => {
		const res = await request(app)
			.post('/auth/forgot-password')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'fp-a')
			.send({ username: 'alice' });

		expect(res.status).toBe(200);
		// The lookup + send happen after the response; wait for the mail to land.
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0].to).toBe('alice@example.test');
		// The scoped RPC ran under the cairn_auth_bff role JWT, never anon.
		expect(rpc('request_password_reset')).toHaveLength(1);
		expect(rpc('request_password_reset')[0].auth).toBe('Bearer BFF.jwt');
		// It carried the username and a hash, never the plaintext code.
		const body = JSON.parse(rpc('request_password_reset')[0].body) as {
			p_username: string;
			p_code_hash: string;
		};
		expect(body.p_username).toBe('alice');
		expect(body.p_code_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(sent[0].text).not.toContain(body.p_code_hash);
	});

	it('(b) unknown username (RPC null) → byte-identical 200, no mail sent', async () => {
		forgotRespond = (res) => json(res, 200, null);
		const res = await request(app)
			.post('/auth/forgot-password')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'fp-b')
			.send({ username: 'nobody' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
		// Give the fire-and-forget lookup time to run and assert it mailed nothing.
		await vi.waitFor(() => expect(rpc('request_password_reset')).toHaveLength(1));
		expect(sent).toHaveLength(0);
	});

	it('(c) the 200 is emitted without awaiting the lookup (R5 timing parity)', async () => {
		// A responder that never replies — if the handler awaited the RPC before
		// responding, this request would hang. It must still get a prompt 200.
		forgotRespond = (res) => {
			held.push(res);
		};
		const res = await request(app)
			.post('/auth/forgot-password')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'fp-c')
			.send({ username: 'alice' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ ok: true });
		// Let the fire-and-forget lookup reach (and stall at) the stub within this
		// test, so afterEach can release it before the next test clears pgReqs.
		await vi.waitFor(() => expect(rpc('request_password_reset')).toHaveLength(1));
	});

	it('(d) missing CSRF header → 403 with no upstream call', async () => {
		const res = await request(app)
			.post('/auth/forgot-password')
			.set('X-Real-IP', 'fp-d')
			.send({ username: 'alice' });
		expect(res.status).toBe(403);
		expect(rpc('request_password_reset')).toHaveLength(0);
	});

	it('(e) per-IP window exhausted → 429 without a lookup', async () => {
		const ip = 'fp-e';
		for (let i = 0; i < 10; i++) {
			await request(app)
				.post('/auth/forgot-password')
				.set(CSRF_HEADER, '1')
				.set('X-Real-IP', ip)
				.send({ username: 'alice' });
		}
		// Wait for all ten fire-and-forget lookups to land before clearing, so a
		// late one can't masquerade as a lookup from the blocked 11th request.
		await vi.waitFor(() => expect(rpc('request_password_reset')).toHaveLength(10));
		pgReqs.length = 0;
		const res = await request(app)
			.post('/auth/forgot-password')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', ip)
			.send({ username: 'alice' });
		expect(res.status).toBe(429);
		expect(res.body).toEqual({ error: 'too many requests' });
		expect(rpc('request_password_reset')).toHaveLength(0);
	});
});

describe('POST /auth/reset-password', () => {
	it('(f) valid code (RPC ok) → 200, reset_password called under the scoped role, no cookie', async () => {
		const res = await request(app)
			.post('/auth/reset-password')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'rp-f')
			.send({ username: 'alice', code: '123456', new_password: 'longenough' });

		expect(res.status).toBe(200);
		expect(rpc('reset_password')).toHaveLength(1);
		expect(rpc('reset_password')[0].auth).toBe('Bearer BFF.jwt');
		const body = JSON.parse(rpc('reset_password')[0].body) as {
			p_username: string;
			p_code_hash: string;
			p_new_password: string;
		};
		expect(body.p_username).toBe('alice');
		expect(body.p_code_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(body.p_new_password).toBe('longenough');
		// R6: no auto-login — no session cookie is planted.
		expect(res.headers['set-cookie']).toBeUndefined();
	});

	it('(g) wrong code (RPC invalid) → generic invalid-or-expired error', async () => {
		resetRespond = (res) => json(res, 200, 'invalid');
		const res = await request(app)
			.post('/auth/reset-password')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'rp-g')
			.send({ username: 'alice', code: '000000', new_password: 'longenough' });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'invalid or expired code' });
	});

	it('(h) attempt cap (RPC locked) → SAME generic error as a wrong code', async () => {
		resetRespond = (res) => json(res, 200, 'locked');
		const res = await request(app)
			.post('/auth/reset-password')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'rp-h')
			.send({ username: 'alice', code: '000000', new_password: 'longenough' });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'invalid or expired code' });
	});

	it('(i) correct code, too-short password (RPC 23514) → minimum-length error', async () => {
		// The BFF pre-checks length, so a too-short password never reaches the RPC;
		// assert the fast feedback path (no RPC call).
		const res = await request(app)
			.post('/auth/reset-password')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'rp-i')
			.send({ username: 'alice', code: '123456', new_password: 'short' });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'password too short' });
		expect(rpc('reset_password')).toHaveLength(0);
	});

	it('(j) too-short slips past the pre-check (RPC 23514) → minimum-length error', async () => {
		// Authoritative DB re-check: even if the BFF length gate were bypassed, the
		// RPC's 23514 maps to the same minimum-length error.
		resetRespond = (res) => json(res, 400, { code: '23514', message: 'too short' });
		const res = await request(app)
			.post('/auth/reset-password')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', 'rp-j')
			.send({ username: 'alice', code: '123456', new_password: 'longenough' });
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'password too short' });
	});

	it('(k) missing CSRF header → 403 with no upstream call', async () => {
		const res = await request(app)
			.post('/auth/reset-password')
			.set('X-Real-IP', 'rp-k')
			.send({ username: 'alice', code: '123456', new_password: 'longenough' });
		expect(res.status).toBe(403);
		expect(rpc('reset_password')).toHaveLength(0);
	});

	it('(l) per-IP window exhausted → 429 without a reset', async () => {
		const ip = 'rp-l';
		for (let i = 0; i < 10; i++) {
			await request(app)
				.post('/auth/reset-password')
				.set(CSRF_HEADER, '1')
				.set('X-Real-IP', ip)
				.send({ username: 'alice', code: '000000', new_password: 'longenough' });
		}
		pgReqs.length = 0;
		const res = await request(app)
			.post('/auth/reset-password')
			.set(CSRF_HEADER, '1')
			.set('X-Real-IP', ip)
			.send({ username: 'alice', code: '000000', new_password: 'longenough' });
		expect(res.status).toBe(429);
		expect(res.body).toEqual({ error: 'too many requests' });
		expect(rpc('reset_password')).toHaveLength(0);
	});
});
