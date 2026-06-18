import {
	describe,
	it,
	expect,
	beforeAll,
	afterAll,
	beforeEach,
	afterEach,
	vi,
	type MockInstance
} from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
	generateCode,
	hashCode,
	requestPasswordReset,
	resetPassword
} from '../src/lib/recovery.js';
import {
	verifyEmailMessage,
	resetPasswordMessage,
	sendVerifyCode,
	sendResetCode,
	setMailTransport,
	type MailTransport
} from '../src/lib/mail.js';

// recovery.ts: code helpers (generateCode/hashCode) and a scoped-role PostgREST
// client that attaches the pre-minted cairn_auth_bff role JWT and calls the
// reset RPCs. A stub PostgREST server records the last request so we can assert
// the bearer and body without a real DB. Never logs the code/address/JWT.
let lastReq: { method: string; url: string; body: string; auth: string | undefined } | null;
let respond: (res: http.ServerResponse) => void;
let postgrest: http.Server;

beforeAll(async () => {
	postgrest = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			lastReq = {
				method: req.method ?? '',
				url: req.url ?? '',
				body: Buffer.concat(chunks).toString('utf8'),
				auth: req.headers.authorization
			};
			respond(res);
		});
	});
	await new Promise<void>((resolve) => postgrest.listen(0, '127.0.0.1', resolve));
	process.env.POSTGREST_URL = `http://127.0.0.1:${(postgrest.address() as AddressInfo).port}`;
	process.env.AUTH_BFF_DB_JWT = 'BFF.role.jwt';
});

afterAll(async () => {
	await new Promise<void>((resolve, reject) =>
		postgrest.close((err) => (err ? reject(err) : resolve()))
	);
});

beforeEach(() => {
	lastReq = null;
});

function json(res: http.ServerResponse, status: number, payload: unknown): void {
	res.statusCode = status;
	res.setHeader('content-type', 'application/json');
	res.end(JSON.stringify(payload));
}

describe('generateCode', () => {
	it('(a) returns a 6-digit numeric string', () => {
		for (let i = 0; i < 200; i++) {
			expect(generateCode()).toMatch(/^\d{6}$/);
		}
	});
});

describe('hashCode', () => {
	it('(b) is a deterministic 64-char lowercase hex SHA-256', () => {
		const h1 = hashCode('123456');
		const h2 = hashCode('123456');
		expect(h1).toBe(h2);
		expect(h1).toMatch(/^[0-9a-f]{64}$/);
	});

	it('(c) never returns the input and differs for different inputs', () => {
		expect(hashCode('123456')).not.toBe('123456');
		expect(hashCode('123456')).not.toBe(hashCode('654321'));
	});
});

describe('requestPasswordReset (scoped-role client)', () => {
	it('(d) POSTs /rpc/request_password_reset with the role JWT and the expected body', async () => {
		respond = (res) => json(res, 200, 'alice@example.test');
		const out = await requestPasswordReset('alice', 'codehash');
		expect(out).toEqual({ status: 'sent', email: 'alice@example.test' });
		expect(lastReq?.method).toBe('POST');
		expect(lastReq?.url).toBe('/rpc/request_password_reset');
		expect(lastReq?.auth).toBe('Bearer BFF.role.jwt');
		expect(JSON.parse(lastReq?.body ?? '{}')).toEqual({
			p_username: 'alice',
			p_code_hash: 'codehash'
		});
	});

	it('(e) maps a null RPC result (unknown user / no recovery e-mail) to status none', async () => {
		respond = (res) => json(res, 200, null);
		expect(await requestPasswordReset('nobody', 'codehash')).toEqual({ status: 'none' });
	});

	it('(f) maps a CA429 error to status throttled', async () => {
		respond = (res) => json(res, 429, { code: 'CA429', message: 'too many requests' });
		expect(await requestPasswordReset('alice', 'codehash')).toEqual({ status: 'throttled' });
	});
});

describe('resetPassword (scoped-role client)', () => {
	it('(g) POSTs /rpc/reset_password with the role JWT and the expected body, mapping ok', async () => {
		respond = (res) => json(res, 200, 'ok');
		const out = await resetPassword('alice', 'codehash', 'newpassword123');
		expect(out).toEqual({ status: 'ok' });
		expect(lastReq?.url).toBe('/rpc/reset_password');
		expect(lastReq?.auth).toBe('Bearer BFF.role.jwt');
		expect(JSON.parse(lastReq?.body ?? '{}')).toEqual({
			p_username: 'alice',
			p_code_hash: 'codehash',
			p_new_password: 'newpassword123'
		});
	});

	it('(h) maps the invalid/locked status strings through', async () => {
		respond = (res) => json(res, 200, 'invalid');
		expect(await resetPassword('alice', 'bad', 'newpassword123')).toEqual({ status: 'invalid' });
		respond = (res) => json(res, 200, 'locked');
		expect(await resetPassword('alice', 'bad', 'newpassword123')).toEqual({ status: 'locked' });
	});

	it('(i) maps a 23514 (too-short password) error to status too_short', async () => {
		respond = (res) => json(res, 400, { code: '23514', message: 'password too short' });
		expect(await resetPassword('alice', 'codehash', 'short')).toEqual({ status: 'too_short' });
	});
});

// mail.ts: pure body builders plus thin send functions over an injectable
// transport. Tests inject a recording stub so no real SMTP is touched, assert the
// message carries the code to the right address with no secret/token, and that
// the plaintext code is never logged (docs/logging.md).
describe('mail bodies', () => {
	it('(j) verify + reset bodies carry the 6-digit code, no link, and an "ignore" line', () => {
		const v = verifyEmailMessage('012345');
		expect(v.text).toContain('012345');
		expect(v.text).not.toMatch(/https?:\/\//);
		expect(v.text.toLowerCase()).toContain('ignore');
		// British-English, hyphenated "e-mail".
		expect(v.text).toContain('e-mail');

		const r = resetPasswordMessage('678901');
		expect(r.text).toContain('678901');
		expect(r.text).not.toMatch(/https?:\/\//);
		expect(r.text.toLowerCase()).toContain('ignore');
	});
});

describe('mail send', () => {
	let sent: Array<{ from: string; to: string; subject: string; text: string }>;
	let logSpies: MockInstance[];

	beforeEach(() => {
		sent = [];
		const stub: MailTransport = {
			sendMail: (opts) => {
				sent.push(opts);
				return Promise.resolve({});
			}
		};
		setMailTransport(stub);
		logSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
			vi.spyOn(console, m).mockImplementation(() => {})
		);
	});

	afterEach(() => {
		setMailTransport(null);
		logSpies.forEach((s) => s.mockRestore());
	});

	it('(k) sendVerifyCode mails the code to the address and logs no plaintext code', async () => {
		await sendVerifyCode('alice@example.test', '424242');
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe('alice@example.test');
		expect(sent[0].text).toContain('424242');
		for (const spy of logSpies) {
			for (const call of spy.mock.calls) {
				expect(JSON.stringify(call)).not.toContain('424242');
			}
		}
	});

	it('(l) sendResetCode mails the code to the address', async () => {
		await sendResetCode('bob@example.test', '999888');
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe('bob@example.test');
		expect(sent[0].text).toContain('999888');
	});
});
