import { randomUUID } from 'node:crypto';

import express from 'express';
import type { Request, Response } from 'express';

import {
	BEARER_AUTH_PATHS,
	COOKIE_PLANT_PATHS,
	LOGOUT_PATHS,
	isSegmentMatch
} from './lib/auth-paths.js';
import { plantSession, clearSession, readAccessCookie, readSessionCookie } from './lib/cookies.js';
import { refresh, logout, passwordGrant, signup, type LogoutScope } from './lib/session.js';
import { resolveUsername, adoptStableIdentity, setUsername } from './lib/profiles.js';
import { requireCsrf } from './lib/csrf.js';
import {
	RateLimiter,
	rateLimitConfigFromEnv,
	signinRateLimit,
	clientIp,
	constantShapeFailure
} from './lib/rate-limit.js';

// Production auth BFF (Cairn-shaped). This is the prod analogue of the dev
// Vite proxy in web/vite.config.ts (~lines 30–185): it owns the dual-cookie
// session (durable `cairn_session` refresh token + short-lived `cairn_access`
// JWT), so no token ever reaches page JavaScript. Caddy routes the GoTrue
// endpoints (/auth/magiclink|verify|token|user|session) and the Cairn-shaped
// /auth/refresh here; the stock cookie→bearer direction for /api and /avatars
// stays in the Caddyfile and reads the access cookie. The narrowing lists are
// the canonical ones (auth-paths.ts, guarded deep-equal against web/'s copy by
// the drift test).
//
// The full Cairn-shaped BFF surface is:
//   POST /auth/register  — create an account
//   POST /auth/signin    — username + password sign-in
//   POST /auth/signout    — revoke server-side + clear cookies (?scope=global)
//   POST /auth/refresh   — rotate the durable refresh token, re-mint the access
// /auth/signin is the real username+password sign-in and /auth/register is the
// real open account-creation flow. All four are state-changing and require the
// CSRF header (csrf.ts). The magic-link GoTrue
// pass-throughs (/auth/token, /auth/verify, /auth/magiclink, /auth/user) keep
// GoTrue's own wire protocol so magic-link sign-in still works — except the
// public password grant on /auth/token, which is locked down (the only
// password-grant path is the rate-limited /auth/signin).

// The Cairn-shaped refresh endpoint — not a GoTrue passthrough, so it's handled
// before the generic fetch-to-GoTrue path below.
const REFRESH_PATH = '/auth/refresh';

// Cairn-shaped credential endpoints. These are route skeletons: they pass
// through the CSRF (and, in prod, rate-limit) guards and then answer HTTP 501
// (Not Implemented). The credential work fills in the username+password logic.
// The sign-in body's identifier field is pinned as `username` now (the
// per-account rate-limit leg keys on it); `password` and the credential check
// arrive with that later work.
const SIGNIN_PATH = '/auth/signin';
const REGISTER_PATH = '/auth/register';

// Username format + minimum password length, enforced at the BFF before any
// account is created. The username rule mirrors set_username's CHECK
// (`^[A-Za-z0-9]{3,30}$`) so a register that passes here can't fail the DB guard.
const USERNAME_RE = /^[A-Za-z0-9]{3,30}$/;
const MIN_PASSWORD_LENGTH = 8;

// The GoTrue token endpoint, kept as a pass-through for the legacy magic-link
// refresh-token grant. The public password grant against it is locked down (the
// only password-grant path is the rate-limited /auth/signin) — see authHandler.
const TOKEN_PATH = '/auth/token';

// Sign-in is rate-limited (per-IP block + per-account escalating delay) — the
// limiter is a single long-lived in-memory instance for this process. The
// signin handler reports each outcome to it (recordFailure on a credential miss,
// recordSuccess on a valid sign-in). Register (Task 3.3) will reuse this same
// instance's per-IP leg so the two share one mass-signup/brute-force bound.
const signinLimiter = new RateLimiter(rateLimitConfigFromEnv());
const signinGuard = signinRateLimit(signinLimiter);

// State-changing Cairn-shaped endpoints that require the CSRF header. The
// magic-link GoTrue pass-throughs (/auth/token, /auth/verify, /auth/magiclink)
// are the deliberate exception — see csrf.ts.
const CSRF_PROTECTED_PATHS = [REFRESH_PATH, SIGNIN_PATH, REGISTER_PATH, ...LOGOUT_PATHS];

// Config is read per-request (not cached at module load) so tests can point
// GOTRUE_URL at a stub server in beforeAll after the module is imported.
function gotrueUrl(): string {
	return process.env.GOTRUE_URL ?? 'http://gotrue:9999';
}

// Sign-out defaults to revoking just this session; `?scope=global` revokes all.
function logoutScope(originalUrl: string): LogoutScope {
	const qIdx = originalUrl.indexOf('?');
	if (qIdx === -1) return 'local';
	return new URLSearchParams(originalUrl.slice(qIdx + 1)).get('scope') === 'global'
		? 'global'
		: 'local';
}

// GoTrue carries the grant kind in the query string (`/auth/token?grant_type=…`),
// not the body, so the lockdown reads it from there. `isSegmentMatch` discards
// the query to compare the path, so it can't be used to inspect the grant type.
function grantTypeOf(originalUrl: string): string | null {
	const qIdx = originalUrl.indexOf('?');
	if (qIdx === -1) return null;
	return new URLSearchParams(originalUrl.slice(qIdx + 1)).get('grant_type');
}

// Request headers we never forward upstream: a client-supplied Authorization
// is stripped (only our cookie-derived bearer is trusted, and only on the
// narrowed paths); Accept-Encoding is dropped so GoTrue replies with identity
// JSON we can parse without inflating (the top correctness pitfall); the rest
// are hop-by-hop / length headers fetch must recompute.
const SKIP_REQUEST_HEADERS = new Set([
	'authorization',
	'accept-encoding',
	'host',
	'connection',
	'keep-alive',
	'content-length'
]);

// Response headers fetch already decoded (it auto-decompresses) or that Node
// must recompute from the possibly-rewritten body.
const SKIP_RESPONSE_HEADERS = new Set(['content-length', 'transfer-encoding', 'content-encoding']);

async function authHandler(req: Request, res: Response): Promise<void> {
	// req is mounted at /auth, so req.originalUrl is the full `/auth/...`
	// path the narrowing lists match against, while req.url is already
	// `/auth`-stripped — exactly what GoTrue expects (mirrors the dev
	// `rewrite: (p) => p.replace(/^\/auth/, '')`).
	const originalUrl = req.originalUrl;

	// CSRF: a state-changing Cairn-shaped request must carry the custom header.
	// Reject before any side effect (no GoTrue call, no cookie change).
	if (req.method === 'POST' && isSegmentMatch(originalUrl, CSRF_PROTECTED_PATHS)) {
		if (!requireCsrf(req)) {
			res.status(403).json({ error: 'missing csrf header' });
			return;
		}
	}

	// Sign-out: revoke server-side at GoTrue, then clear both cookies. Cookies
	// are cleared even if the GoTrue revoke fails (explicit user intent wins).
	// `?scope=global` revokes all the user's sessions (compromise kill-switch).
	if (req.method === 'POST' && isSegmentMatch(originalUrl, LOGOUT_PATHS)) {
		const refreshToken = readSessionCookie(req.headers.cookie);
		if (refreshToken) await logout(refreshToken, logoutScope(originalUrl));
		clearSession(res);
		res.status(204).end();
		return;
	}

	// Refresh: exchange the durable refresh cookie for a fresh token pair,
	// re-plant both cookies, and return a tokenless user payload. Owns the
	// GoTrue grant_type translation — the browser never sees a token.
	if (req.method === 'POST' && isSegmentMatch(originalUrl, [REFRESH_PATH])) {
		await refreshHandler(req, res);
		return;
	}

	// Sign-in: behind the CSRF gate above and the rate-limit guard (per-IP block →
	// 429, per-account escalating delay). The guard's `next` is the credential
	// handler, which resolves the username, runs the password grant, and reports
	// the outcome to the limiter (recordSuccess / recordFailure).
	if (req.method === 'POST' && isSegmentMatch(originalUrl, [SIGNIN_PATH])) {
		signinGuard(req, res, () => {
			void signinHandler(req, res);
		});
		return;
	}
	// Register: open account creation behind the CSRF gate above and a per-IP
	// throttle (shared with sign-in) so an open endpoint can't be hammered into
	// mass signup. The handler creates the GoTrue account, adopts the stable
	// identity, and sets the chosen username.
	if (req.method === 'POST' && isSegmentMatch(originalUrl, [REGISTER_PATH])) {
		await registerHandler(req, res);
		return;
	}

	// R6 lockdown: the public GoTrue password grant must be unreachable, since
	// anyone can compute `<uid>@cairn.internal` from the public resolver. The only
	// password-grant path is the rate-limited /auth/signin above. The legacy
	// magic-link refresh-token grant still flows through /auth/token, so reject
	// only grant_type=password (read from the query string) and never forward it.
	if (isSegmentMatch(originalUrl, [TOKEN_PATH]) && grantTypeOf(originalUrl) === 'password') {
		res.status(403).json({ error: 'use /auth/signin' });
		return;
	}

	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value === undefined) continue;
		if (SKIP_REQUEST_HEADERS.has(key.toLowerCase())) continue;
		headers.set(key, Array.isArray(value) ? value.join(', ') : value);
	}

	// Bearer attach is narrowed to BEARER_AUTH_PATHS (/auth/user) — anonymous
	// endpoints (/auth/magiclink|verify|token) must not receive a credential.
	if (isSegmentMatch(originalUrl, BEARER_AUTH_PATHS)) {
		// Read the short-lived access cookie — the durable cookie now holds a
		// refresh token, which GoTrue's /user would reject.
		const token = readAccessCookie(req.headers.cookie);
		if (token) headers.set('Authorization', `Bearer ${token}`);
	}

	const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
	// `Uint8Array.from` (not the raw Buffer) so the value matches fetch's
	// BodyInit typing; auth bodies are tiny, so the copy is negligible.
	const body =
		hasBody && Buffer.isBuffer(req.body) && req.body.length > 0
			? Uint8Array.from(req.body)
			: undefined;

	let upstream: globalThis.Response;
	try {
		upstream = await fetch(`${gotrueUrl()}${req.url}`, {
			method: req.method,
			headers,
			body,
			// Never follow GoTrue's /verify 302 — the browser must receive it
			// so it can land on /auth/callback#<tokens>. The dev Vite proxy
			// gets this right by accident (http-proxy doesn't follow); we do it
			// deliberately. A 302 carries no JSON, so the cookie-plant below
			// never fires on it and the body passes through verbatim.
			redirect: 'manual'
		});
	} catch {
		res.status(502).json({ error: 'upstream auth service unreachable' });
		return;
	}

	const status = upstream.status;
	const setCookies = upstream.headers.getSetCookie();
	upstream.headers.forEach((value, key) => {
		const lower = key.toLowerCase();
		if (SKIP_RESPONSE_HEADERS.has(lower)) return;
		// Never forward GoTrue's CORS headers. The custom-header CSRF defence
		// (csrf.ts) holds only because a cross-origin caller can't learn that
		// X-Cairn-Auth is an allowed header; leaking an Access-Control-Allow-*
		// would void it. Cairn is same-origin (behind Caddy), so no /auth
		// endpoint needs CORS — strip them all, including off any OPTIONS
		// preflight GoTrue answers.
		if (lower.startsWith('access-control-')) return;
		// Set-Cookie is re-emitted individually below; forwarding it through
		// the comma-joining `forEach` value would corrupt multi-cookie replies.
		if (lower === 'set-cookie') return;
		res.setHeader(key, value);
	});
	for (const cookie of setCookies) res.appendHeader('set-cookie', cookie);
	res.status(status);

	const buf = Buffer.from(await upstream.arrayBuffer());
	const contentType = upstream.headers.get('content-type') ?? '';

	if (status === 200 && contentType.includes('application/json')) {
		try {
			const json = JSON.parse(buf.toString('utf8')) as {
				access_token?: unknown;
				refresh_token?: unknown;
				expires_in?: unknown;
			};
			// Cookie-plant is narrowed to the deliberate-login endpoints
			// (COOKIE_PLANT_PATHS = /auth/verify, /auth/token) — a 2xx from
			// /auth/magiclink (or a future token-returning endpoint) must not
			// plant a session unless explicitly added to the allow-list. Plants
			// BOTH cookies (refresh in the durable cookie, access in the
			// short-lived one) so a magic-link/OTP sign-in establishes the
			// dual-cookie session.
			if (
				typeof json.access_token === 'string' &&
				typeof json.refresh_token === 'string' &&
				isSegmentMatch(originalUrl, COOKIE_PLANT_PATHS)
			) {
				const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : undefined;
				plantSession(res, {
					accessToken: json.access_token,
					refreshToken: json.refresh_token,
					expiresIn
				});
			}
			// Strip tokens unconditionally — page JS has no use for them; the
			// cookie is the source of truth.
			if (typeof json.access_token === 'string' || typeof json.refresh_token === 'string') {
				delete json.access_token;
				delete json.refresh_token;
				res.end(Buffer.from(JSON.stringify(json)));
				return;
			}
		} catch {
			// Non-JSON or parse error — fall through and pass the body verbatim.
		}
	}

	res.end(buf);
}

// POST /auth/refresh: read the durable refresh cookie, exchange it at GoTrue,
// re-plant the rotated pair, and answer with a tokenless `user` payload so the
// web boot can adopt the user without a second /auth/user round-trip (Task 4.1
// consumes it). Distinguishes an authoritative revocation (clear + 401) from a
// transient upstream blip (503, cookies left intact) so a momentary outage
// doesn't sign everyone out. Never logs the token (docs/logging.md).
async function refreshHandler(req: Request, res: Response): Promise<void> {
	const refreshToken = readSessionCookie(req.headers.cookie);
	if (!refreshToken) {
		clearSession(res);
		res.status(401).json({ error: 'no session' });
		return;
	}

	const result = await refresh(refreshToken);
	if (result.status === 'unavailable') {
		// Transient — leave both cookies intact.
		res.status(503).json({ error: 'upstream auth service unavailable' });
		return;
	}
	if (result.status === 'revoked') {
		clearSession(res);
		res.status(401).json({ error: 'session revoked' });
		return;
	}

	plantSession(res, {
		accessToken: result.accessToken,
		refreshToken: result.refreshToken,
		expiresIn: result.expiresIn
	});
	res.status(200).json({ user: result.user });
}

// POST /auth/signin: resolve the typed username → uid (anon PostgREST), then run
// the GoTrue password grant against the stable `<uid>@cairn.internal` identity.
// On success, plant both cookies and return a tokenless `{ user: { id, username } }`
// (canonical casing from the resolver, no second lookup). The unknown-username
// and wrong-password branches return a byte-identical constant-shape 401 so a
// caller can't tell which factor failed. Every credential failure is reported to
// the limiter (recordFailure); a success clears the caller's buckets
// (recordSuccess). Never logs the username, e-mail, password, or token.
async function signinHandler(req: Request, res: Response): Promise<void> {
	const ip = clientIp(req);

	// express.raw gives a Buffer; parse the credentials ourselves.
	let creds: { username?: unknown; password?: unknown };
	try {
		if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new Error('empty body');
		creds = JSON.parse(req.body.toString('utf8')) as typeof creds;
	} catch {
		res.status(400).json({ error: 'invalid request' });
		return;
	}
	const username = typeof creds.username === 'string' ? creds.username : '';
	const password = typeof creds.password === 'string' ? creds.password : '';
	if (!username || !password) {
		res.status(400).json({ error: 'invalid request' });
		return;
	}

	const resolved = await resolveUsername(username);
	if (!resolved) {
		// Unknown username — a credential failure; answer constant-shape.
		signinLimiter.recordFailure(ip, username);
		constantShapeFailure(res);
		return;
	}

	const grant = await passwordGrant(`${resolved.id}@cairn.internal`, password);
	if (grant.status === 'unavailable') {
		// Transient upstream blip — not a credential verdict, don't record it.
		res.status(503).json({ error: 'upstream auth service unavailable' });
		return;
	}
	if (grant.status === 'invalid') {
		signinLimiter.recordFailure(ip, username);
		constantShapeFailure(res);
		return;
	}

	signinLimiter.recordSuccess(ip, username);
	plantSession(res, {
		accessToken: grant.accessToken,
		refreshToken: grant.refreshToken,
		expiresIn: grant.expiresIn
	});
	res.status(200).json({ user: { id: resolved.id, username: resolved.username } });
}

// POST /auth/register: open account creation. Behind a per-IP throttle (the
// sign-in limiter's per-IP leg, keyed on IP with no username so register and
// sign-in share one mass-signup/brute-force bound from a given source). The flow:
// validate format + password length → availability pre-check → GoTrue signup with
// a transient `<random>@cairn.internal` address → adopt the stable identity → set
// the chosen username → plant the session and return a tokenless user.
//
// On any post-signup step failure (the set_username 23505 race, or an
// adopt/set_username error), no session is planted: the half-registered account
// is a sessionless, unreachable orphan (its transient identity and provisional
// username are unguessable), which the alpha accepts. Never logs the username,
// e-mail, password, or token.
async function registerHandler(req: Request, res: Response): Promise<void> {
	const ip = clientIp(req);
	// Per-IP throttle: a blocked IP is refused before any work. Every attempt
	// counts toward the window (recordFailure, no username); register never calls
	// recordSuccess, so a successful mass-signup run stays bounded.
	if (signinLimiter.check(ip).blocked) {
		res.status(429).json({ error: 'too many requests' });
		return;
	}
	signinLimiter.recordFailure(ip);

	// express.raw gives a Buffer; parse the body ourselves.
	let creds: { username?: unknown; password?: unknown };
	try {
		if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new Error('empty body');
		creds = JSON.parse(req.body.toString('utf8')) as typeof creds;
	} catch {
		res.status(400).json({ error: 'invalid request' });
		return;
	}
	const username = typeof creds.username === 'string' ? creds.username : '';
	const password = typeof creds.password === 'string' ? creds.password : '';
	if (!USERNAME_RE.test(username)) {
		res.status(400).json({ error: 'invalid username' });
		return;
	}
	if (password.length < MIN_PASSWORD_LENGTH) {
		res.status(400).json({ error: 'password too short' });
		return;
	}

	// Availability pre-check — refuse a taken handle without creating an account.
	if (await resolveUsername(username)) {
		res.status(409).json({ error: 'username taken' });
		return;
	}

	// Create the GoTrue account with a transient random address (never the
	// username, so concurrent same-username signups can't collide at GoTrue's
	// email-unique index).
	const created = await signup(`${randomUUID()}@cairn.internal`, password);
	if (created.status === 'disabled') {
		res.status(403).json({ error: 'registration closed' });
		return;
	}
	if (created.status !== 'ok') {
		res.status(503).json({ error: 'upstream auth service unavailable' });
		return;
	}

	// Post-signup, under the new account's bearer: adopt the stable identity, then
	// set the chosen username. Any failure here leaves a sessionless orphan.
	const adopted = await adoptStableIdentity(created.accessToken);
	if (!adopted.ok) {
		res.status(500).json({ error: 'registration failed' });
		return;
	}
	const named = await setUsername(username, created.accessToken);
	if (!named.ok) {
		// 23505: the case-fold uniqueness lost a race past the pre-check.
		if (named.code === '23505') {
			res.status(409).json({ error: 'username taken' });
			return;
		}
		res.status(500).json({ error: 'registration failed' });
		return;
	}

	plantSession(res, {
		accessToken: created.accessToken,
		refreshToken: created.refreshToken,
		expiresIn: created.expiresIn
	});
	res.status(200).json({ user: { id: created.userId, username } });
}

const app = express();

// Health check for the compose healthcheck.
app.get('/healthz', (_req, res) => {
	res.json({ ok: true });
});

// Buffer the raw request body (any content-type) so it can be forwarded to
// GoTrue verbatim, then run the shim. Mounted at /auth so req.originalUrl
// keeps the full path while req.url is `/auth`-stripped for the upstream call.
app.use('/auth', express.raw({ type: () => true, limit: '1mb' }), (req, res) => {
	void authHandler(req, res);
});

export { app };
