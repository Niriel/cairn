import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { app } from '../src/index.js';
import { CSRF_HEADER } from '../src/lib/auth-paths.js';
import { setMailTransport, type MailTransport } from '../src/lib/mail.js';

// The authenticated recovery-e-mail endpoints: POST /auth/recovery-email sets a
// candidate address (mails a code, records a verify token under the user's
// bearer) or — with {remove:true} — clears the on-file address via
// clear_recovery_email; POST /auth/recovery-email/confirm redeems the code via
// confirm_recovery_email (which RETURNS a status string the BFF maps to a status
// code). A stub PostgREST routes by URL with a per-route settable responder so
// each test can model ok/throttle/invalid/locked and assert the bearer + body.
// A recording mail transport captures the sent code without a real SMTP server.
interface Rec {
	method: string;
	url: string;
	body: string;
	auth: string | undefined;
}
// Cleared (not reassigned) in beforeEach so the stub closes over one array.
const pgReqs: Rec[] = [];
let verifyRespond: (res: http.ServerResponse) => void;
let confirmRespond: (res: http.ServerResponse) => void;
let clearRespond: (res: http.ServerResponse) => void;
let postgrest: http.Server;

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
			if (url.startsWith('/rpc/request_recovery_email_verification')) return verifyRespond(res);
			if (url.startsWith('/rpc/confirm_recovery_email')) return confirmRespond(res);
			if (url.startsWith('/rpc/clear_recovery_email')) return clearRespond(res);
			res.statusCode = 404;
			res.end('{}');
		})
	);
	await new Promise<void>((resolve) => postgrest.listen(0, '127.0.0.1', resolve));
	process.env.POSTGREST_URL = `http://127.0.0.1:${(postgrest.address() as AddressInfo).port}`;
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

// Defaults: the verify RPC accepts (void → 200), confirm matches (→ 'ok'), clear
// succeeds (void → 200). Each test overrides only the responder it exercises.
beforeEach(() => {
	pgReqs.length = 0;
	sent.length = 0;
	verifyRespond = (res) => json(res, 200, null);
	confirmRespond = (res) => json(res, 200, 'ok');
	clearRespond = (res) => json(res, 200, null);
});

const rpc = (name: string) => pgReqs.filter((r) => r.url.startsWith(`/rpc/${name}`));
const ACCESS = 'cairn_access=USER.access';

describe('POST /auth/recovery-email (set)', () => {
	it('(a) valid → records the verify token under the user bearer and mails the code', async () => {
		const res = await request(app)
			.post('/auth/recovery-email')
			.set(CSRF_HEADER, '1')
			.set('Cookie', ACCESS)
			.send({ email: 'alice@example.test' });

		expect(res.status).toBe(200);
		// The verify RPC ran once, under the caller's own access bearer.
		expect(rpc('request_recovery_email_verification')).toHaveLength(1);
		expect(rpc('request_recovery_email_verification')[0].auth).toBe('Bearer USER.access');
		// Body carried the candidate address and a hash — never the plaintext code.
		const body = JSON.parse(rpc('request_recovery_email_verification')[0].body) as {
			p_email: string;
			p_code_hash: string;
		};
		expect(body.p_email).toBe('alice@example.test');
		expect(body.p_code_hash).toMatch(/^[0-9a-f]{64}$/);
		// The code was mailed to the candidate address, not the DB.
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe('alice@example.test');
		expect(sent[0].text).not.toContain(body.p_code_hash);
	});

	it('(b) missing CSRF header → 403 with no upstream call and no mail', async () => {
		const res = await request(app)
			.post('/auth/recovery-email')
			.set('Cookie', ACCESS)
			.send({ email: 'alice@example.test' });
		expect(res.status).toBe(403);
		expect(rpc('request_recovery_email_verification')).toHaveLength(0);
		expect(sent).toHaveLength(0);
	});

	it('(c) no session cookie → 401 with no upstream call', async () => {
		const res = await request(app)
			.post('/auth/recovery-email')
			.set(CSRF_HEADER, '1')
			.send({ email: 'alice@example.test' });
		expect(res.status).toBe(401);
		expect(rpc('request_recovery_email_verification')).toHaveLength(0);
		expect(sent).toHaveLength(0);
	});

	it('(d) per-address send cap (CA429) → 429, no mail sent', async () => {
		verifyRespond = (res) => json(res, 400, { code: 'CA429', message: 'too many' });
		const res = await request(app)
			.post('/auth/recovery-email')
			.set(CSRF_HEADER, '1')
			.set('Cookie', ACCESS)
			.send({ email: 'alice@example.test' });
		expect(res.status).toBe(429);
		expect(sent).toHaveLength(0);
	});

	it('(e) malformed address (23514) → 400, no mail sent', async () => {
		verifyRespond = (res) => json(res, 400, { code: '23514', message: 'invalid' });
		const res = await request(app)
			.post('/auth/recovery-email')
			.set(CSRF_HEADER, '1')
			.set('Cookie', ACCESS)
			.send({ email: 'not-an-email' });
		expect(res.status).toBe(400);
		expect(sent).toHaveLength(0);
	});

	it('(f) {remove:true} → clears the address via clear_recovery_email, no code/mail', async () => {
		const res = await request(app)
			.post('/auth/recovery-email')
			.set(CSRF_HEADER, '1')
			.set('Cookie', ACCESS)
			.send({ remove: true });
		expect(res.status).toBe(200);
		expect(rpc('clear_recovery_email')).toHaveLength(1);
		expect(rpc('clear_recovery_email')[0].auth).toBe('Bearer USER.access');
		// The set path was not taken — no verify token, no mail.
		expect(rpc('request_recovery_email_verification')).toHaveLength(0);
		expect(sent).toHaveLength(0);
	});
});

describe('POST /auth/recovery-email/confirm', () => {
	it('(g) correct code (RPC ok) → 200, confirm called under the user bearer', async () => {
		const res = await request(app)
			.post('/auth/recovery-email/confirm')
			.set(CSRF_HEADER, '1')
			.set('Cookie', ACCESS)
			.send({ code: '123456' });
		expect(res.status).toBe(200);
		expect(rpc('confirm_recovery_email')).toHaveLength(1);
		expect(rpc('confirm_recovery_email')[0].auth).toBe('Bearer USER.access');
		// The plaintext code is hashed before it reaches the RPC.
		const body = JSON.parse(rpc('confirm_recovery_email')[0].body) as { p_code_hash: string };
		expect(body.p_code_hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('(h) wrong/expired code (RPC invalid) → 4xx the UI maps to "incorrect or expired"', async () => {
		confirmRespond = (res) => json(res, 200, 'invalid');
		const res = await request(app)
			.post('/auth/recovery-email/confirm')
			.set(CSRF_HEADER, '1')
			.set('Cookie', ACCESS)
			.send({ code: '000000' });
		expect(res.status).toBe(400);
	});

	it('(i) attempt cap hit (RPC locked) → 429 the UI maps to "too many attempts"', async () => {
		confirmRespond = (res) => json(res, 200, 'locked');
		const res = await request(app)
			.post('/auth/recovery-email/confirm')
			.set(CSRF_HEADER, '1')
			.set('Cookie', ACCESS)
			.send({ code: '000000' });
		expect(res.status).toBe(429);
	});

	it('(j) missing CSRF header → 403 with no upstream call', async () => {
		const res = await request(app)
			.post('/auth/recovery-email/confirm')
			.set('Cookie', ACCESS)
			.send({ code: '123456' });
		expect(res.status).toBe(403);
		expect(rpc('confirm_recovery_email')).toHaveLength(0);
	});

	it('(k) no session cookie → 401 with no upstream call', async () => {
		const res = await request(app)
			.post('/auth/recovery-email/confirm')
			.set(CSRF_HEADER, '1')
			.send({ code: '123456' });
		expect(res.status).toBe(401);
		expect(rpc('confirm_recovery_email')).toHaveLength(0);
	});
});
