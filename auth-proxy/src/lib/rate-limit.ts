import type { Request, Response, NextFunction, RequestHandler } from 'express';

// Sign-in rate limiting for the Cairn-shaped /auth/signin endpoint. Username +
// password is brute-forceable in a way the magic-link flow was not, so the BFF
// throttles repeated *credential* failures along two axes:
//
//   - per source IP: a hard block once too many failures land within the window.
//     This is the primary brute-force bound and targets the attacker's own IP,
//     so it can't be used to lock a victim out.
//   - per account:   an *escalating delay* (never a hard block). Usernames are
//     public, so a hard per-account lock would let anyone deny a named victim
//     sign-in by spamming failures from many IPs. Instead each failure for an
//     account adds latency to that account's next attempt, but a correct
//     credential always still succeeds.
//
// What counts as a "failure" is an explicit signal from the sign-in handler
// (recordFailure / recordSuccess), NOT any non-2xx — the credential check (added
// with the username+password work) decides. The 501 skeleton reports nothing, so
// it never self-throttles.
//
// State is in-memory and per-process: a container restart or redeploy clears all
// backoff. This is brute-force *friction*, not durable protection, and is sound
// only because the auth-proxy runs as a single instance. A shared/persistent
// store is the follow-up if the BFF is ever scaled out.
//
// Nothing here is logged — raw IPs and usernames must stay out of the logs
// (docs/logging.md).

export interface RateLimitConfig {
	/** Per-IP failures within the window before the IP is blocked. */
	ipMax: number;
	/** Sliding-window length for the per-IP failure count, ms. */
	ipWindowMs: number;
	/** Sliding-window length for the per-account failure count, ms. */
	accountWindowMs: number;
	/** Base per-account delay (first failure), ms; doubles each subsequent failure. */
	accountBaseDelayMs: number;
	/** Cap on the per-account escalating delay, ms. */
	accountMaxDelayMs: number;
}

function intFromEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined) return fallback;
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Tunables via env with sane defaults. The window defaults to 15 minutes; ten
// per-IP failures in that window is a generous human-retry margin while still
// bounding an automated guesser.
export function rateLimitConfigFromEnv(): RateLimitConfig {
	return {
		ipMax: intFromEnv('RATELIMIT_IP_MAX', 10),
		ipWindowMs: intFromEnv('RATELIMIT_IP_WINDOW_MS', 15 * 60 * 1000),
		accountWindowMs: intFromEnv('RATELIMIT_ACCOUNT_WINDOW_MS', 15 * 60 * 1000),
		accountBaseDelayMs: intFromEnv('RATELIMIT_ACCOUNT_BASE_DELAY_MS', 500),
		accountMaxDelayMs: intFromEnv('RATELIMIT_ACCOUNT_MAX_DELAY_MS', 10_000)
	};
}

export interface RateLimitDecision {
	/** The per-IP threshold was hit — reject without serving the attempt. */
	blocked: boolean;
	/** Escalating per-account delay to impose before serving the attempt, ms. */
	delayMs: number;
}

export class RateLimiter {
	private readonly config: RateLimitConfig;
	private readonly now: () => number;
	private readonly ipFailures = new Map<string, number[]>();
	private readonly accountFailures = new Map<string, number[]>();

	// `now` is injectable so the throttle is deterministic under test.
	constructor(config: RateLimitConfig, now: () => number = () => Date.now()) {
		this.config = config;
		this.now = now;
	}

	// Decide what to do with an incoming sign-in attempt. Pure read — does not
	// itself count as a failure; the handler reports the outcome afterwards.
	check(ip: string, username?: string): RateLimitDecision {
		const now = this.now();
		const ipCount = this.countRecent(this.ipFailures, ip, now, this.config.ipWindowMs);
		if (ipCount >= this.config.ipMax) return { blocked: true, delayMs: 0 };

		let delayMs = 0;
		if (username) {
			const n = this.countRecent(this.accountFailures, username, now, this.config.accountWindowMs);
			if (n > 0) {
				delayMs = Math.min(
					this.config.accountBaseDelayMs * 2 ** (n - 1),
					this.config.accountMaxDelayMs
				);
			}
		}
		return { blocked: false, delayMs };
	}

	recordFailure(ip: string, username?: string): void {
		const now = this.now();
		this.push(this.ipFailures, ip, now);
		if (username) this.push(this.accountFailures, username, now);
	}

	// A success clears both buckets for this caller — a legitimate sign-in proves
	// the IP and the account are not under an active guessing run.
	recordSuccess(ip: string, username?: string): void {
		this.ipFailures.delete(ip);
		if (username) this.accountFailures.delete(username);
	}

	private push(map: Map<string, number[]>, key: string, now: number): void {
		const arr = map.get(key);
		if (arr) arr.push(now);
		else map.set(key, [now]);
	}

	// Count timestamps still inside the window, pruning the expired ones in place
	// (lazy cleanup — bounds the maps without a separate sweep timer).
	private countRecent(
		map: Map<string, number[]>,
		key: string,
		now: number,
		windowMs: number
	): number {
		const arr = map.get(key);
		if (!arr) return 0;
		const cutoff = now - windowMs;
		const recent = arr.filter((t) => t > cutoff);
		if (recent.length) map.set(key, recent);
		else map.delete(key);
		return recent.length;
	}
}

// The client IP is read ONLY from the Caddy-set X-Real-IP header, never from a
// client-supplied X-Forwarded-For (which is attacker-controllable and would let
// a guesser rotate the header to evade the per-IP limit or poison arbitrary
// buckets). Caddy must set X-Real-IP to the real client address on the auth
// upstream; that Caddy-side guarantee is confirmed by the deployment audit. The
// socket address is only a dev/direct-connection fallback.
export function clientIp(req: Request): string {
	const real = req.headers['x-real-ip'];
	if (typeof real === 'string' && real.trim()) return real.trim();
	return req.socket?.remoteAddress ?? 'unknown';
}

// The sign-in body's identifier field is pinned as `username`. The credential
// (password) and the real check arrive with the username+password work; here we
// only need the identifier for the per-account key. A missing/blank username
// keys the per-IP leg only.
export function readSigninUsername(body: unknown): string | undefined {
	if (!Buffer.isBuffer(body) || body.length === 0) return undefined;
	try {
		const json = JSON.parse(body.toString('utf8')) as { username?: unknown };
		if (typeof json.username === 'string' && json.username.trim()) return json.username;
	} catch {
		// Not JSON — no per-account key (the per-IP leg still applies).
	}
	return undefined;
}

// Constant-shape credential failure: an identical status + body regardless of
// which factor failed (wrong password vs unknown account), so a caller can't
// distinguish "no such account" from "wrong password" and enumerate usernames.
export function constantShapeFailure(res: Response): void {
	res.status(401).json({ error: 'invalid credentials' });
}

// Per-IP block. Distinct from the credential failure above — being throttled is
// an expected, observable signal; what must stay constant-shape is the
// credential failure, not the throttle.
function tooManyRequests(res: Response): void {
	res.status(429).json({ error: 'too many requests' });
}

// Middleware mounted on /auth/signin. Derives the trusted client IP and the
// account identifier, then asks the limiter what to do: a per-IP block rejects
// (429) without serving the attempt; otherwise it imposes the per-account
// escalating delay and calls next() (the credential handler — a 501 skeleton for
// now). The handler, not this middleware, reports the credential outcome to the
// limiter, so only genuine credential failures count.
export function signinRateLimit(
	limiter: RateLimiter,
	opts: { sleep?: (ms: number) => Promise<void> } = {}
): RequestHandler {
	const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	// Sync handler wrapping a `void`-discarded async IIFE — matches the
	// `void authHandler(req, res)` idiom in index.ts and keeps the express
	// RequestHandler return type `void`.
	return (req: Request, res: Response, next: NextFunction) => {
		void (async () => {
			const ip = clientIp(req);
			const username = readSigninUsername(req.body);
			const decision = limiter.check(ip, username);
			if (decision.blocked) {
				tooManyRequests(res);
				return;
			}
			if (decision.delayMs > 0) await sleep(decision.delayMs);
			next();
		})();
	};
}
