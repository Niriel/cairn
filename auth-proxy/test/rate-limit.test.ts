import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

import {
	RateLimiter,
	signinRateLimit,
	clientIp,
	readSigninUsername,
	constantShapeFailure,
	type RateLimitConfig
} from '../src/lib/rate-limit.js';

// A small, fast config so the tests don't depend on the production defaults.
const CONFIG: RateLimitConfig = {
	ipMax: 3,
	ipWindowMs: 1000,
	accountWindowMs: 1000,
	accountBaseDelayMs: 100,
	accountMaxDelayMs: 800
};

// Controllable clock + sleep spy so the throttle is fully deterministic — no
// real time, no real delays. `clock` is advanced by the test; `sleeps` records
// every delay the middleware would impose.
let clock: number;
let sleeps: number[];

function buildApp(limiter: RateLimiter) {
	const app = express();
	// Mirror the prod express.raw body buffering so readSigninUsername sees a
	// Buffer, exactly as the auth-proxy mounts it.
	app.post(
		'/auth/signin',
		express.raw({ type: () => true, limit: '1mb' }),
		signinRateLimit(limiter, {
			sleep: (ms: number) => {
				sleeps.push(ms);
				return Promise.resolve();
			}
		}),
		// Stub sign-in handler: reports success/credential-failure on demand via
		// the `x-test-outcome` header (2003's real credential check decides this).
		(req, res) => {
			const ip = clientIp(req);
			const username = readSigninUsername(req.body);
			if (req.get('x-test-outcome') === 'ok') {
				limiter.recordSuccess(ip, username);
				res.status(200).json({ ok: true });
				return;
			}
			// Any non-ok outcome is a credential failure (wrong password OR unknown
			// account — both must look identical to the caller).
			limiter.recordFailure(ip, username);
			constantShapeFailure(res);
		}
	);
	return app;
}

let limiter: RateLimiter;
let app: express.Express;

beforeEach(() => {
	clock = 0;
	sleeps = [];
	limiter = new RateLimiter(CONFIG, () => clock);
	app = buildApp(limiter);
});

function fail(opts: { ip?: string; xff?: string; username?: string } = {}) {
	let r = request(app).post('/auth/signin');
	if (opts.ip) r = r.set('X-Real-IP', opts.ip);
	if (opts.xff) r = r.set('X-Forwarded-For', opts.xff);
	return r.send(opts.username ? { username: opts.username } : {});
}

function succeed(opts: { ip?: string; username?: string } = {}) {
	let r = request(app).post('/auth/signin').set('x-test-outcome', 'ok');
	if (opts.ip) r = r.set('X-Real-IP', opts.ip);
	return r.send(opts.username ? { username: opts.username } : {});
}

describe('sign-in rate limiting', () => {
	it('blocks (429) after the per-IP failure threshold within the window', async () => {
		for (let i = 0; i < CONFIG.ipMax; i++) {
			const res = await fail({ ip: '1.1.1.1', username: 'alice' });
			expect(res.status).toBe(401);
		}
		const blocked = await fail({ ip: '1.1.1.1', username: 'alice' });
		expect(blocked.status).toBe(429);
	});

	it('the per-IP window slides: failures age out and the block lifts', async () => {
		for (let i = 0; i < CONFIG.ipMax; i++) await fail({ ip: '1.1.1.1' });
		expect((await fail({ ip: '1.1.1.1' })).status).toBe(429);
		clock += CONFIG.ipWindowMs + 1; // every failure ages out
		expect((await fail({ ip: '1.1.1.1' })).status).toBe(401);
	});

	it('per-account backoff escalates across IPs but never hard-blocks', async () => {
		// One failure each from many distinct IPs, same account. No single IP hits
		// the per-IP threshold, so the account is never blocked — but each next
		// attempt for that account is delayed more (graded backoff).
		await fail({ ip: '10.0.0.1', username: 'bob' }); // 1st attempt: no prior failure → no delay
		await fail({ ip: '10.0.0.2', username: 'bob' }); // 1 prior → 100
		await fail({ ip: '10.0.0.3', username: 'bob' }); // 2 prior → 200
		await fail({ ip: '10.0.0.4', username: 'bob' }); // 3 prior → 400
		// The delays imposed grew with each prior failure and none was a 429.
		expect(sleeps).toEqual([100, 200, 400]);

		// A correct credential from yet another IP still succeeds for the account
		// under distributed attack (never a hard denial — anti-weaponization).
		const ok = await succeed({ ip: '10.0.0.9', username: 'bob' });
		expect(ok.status).toBe(200);
	});

	it('per-account delay is capped at accountMaxDelayMs', async () => {
		for (let i = 0; i < 8; i++) await fail({ ip: `10.0.${i}.1`, username: 'carol' });
		expect(Math.max(...sleeps)).toBe(CONFIG.accountMaxDelayMs);
	});

	it('keys on the Caddy-set X-Real-IP and ignores a client X-Forwarded-For', async () => {
		// Reach the per-IP threshold from 1.1.1.1, while the request also carries a
		// spoofed XFF pointing at a victim IP.
		for (let i = 0; i < CONFIG.ipMax; i++) await fail({ ip: '1.1.1.1', xff: '9.9.9.9' });
		// Still blocked when X-Real-IP is 1.1.1.1, regardless of XFF.
		expect((await fail({ ip: '1.1.1.1', xff: '5.5.5.5' })).status).toBe(429);
		// The spoofed XFF value did NOT get its own bucket throttled: a real
		// request from 9.9.9.9 is clean.
		expect((await fail({ ip: '9.9.9.9' })).status).toBe(401);
	});

	it('a success resets the per-IP and per-account counters', async () => {
		await fail({ ip: '2.2.2.2', username: 'dave' });
		await fail({ ip: '2.2.2.2', username: 'dave' });
		await succeed({ ip: '2.2.2.2', username: 'dave' });
		// Counters cleared — no escalating delay on the next attempt.
		sleeps = [];
		await fail({ ip: '2.2.2.2', username: 'dave' });
		expect(sleeps).toEqual([]); // no delay imposed — the account counter was reset
		// And the per-IP bucket restarts: it takes the full threshold again to block.
		expect((await fail({ ip: '2.2.2.2', username: 'dave' })).status).toBe(401);
	});

	it('credential failures are constant-shape regardless of the cause', async () => {
		// "wrong password" and "unknown account" are simulated as two separate
		// outcomes, but both go through constantShapeFailure — byte-identical.
		const wrongPassword = await fail({ ip: '3.3.3.1', username: 'known' });
		const unknownAccount = await fail({ ip: '3.3.3.2', username: 'ghost' });
		expect(wrongPassword.status).toBe(unknownAccount.status);
		expect(wrongPassword.headers['content-type']).toBe(unknownAccount.headers['content-type']);
		expect(wrongPassword.text).toBe(unknownAccount.text);
	});
});
