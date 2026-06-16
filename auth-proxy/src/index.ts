import express from 'express';
import type { Request, Response } from 'express';

import {
	BEARER_AUTH_PATHS,
	COOKIE_PLANT_PATHS,
	LOGOUT_PATHS,
	isSegmentMatch
} from './lib/auth-paths.js';
import { plantSession, clearSession, readAccessCookie, readSessionCookie } from './lib/cookies.js';
import { refresh, logout, type LogoutScope } from './lib/session.js';
import { requireCsrf } from './lib/csrf.js';
import { RateLimiter, rateLimitConfigFromEnv, signinRateLimit } from './lib/rate-limit.js';

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
// /auth/signin and /auth/register are route skeletons for now: they reply HTTP
// 501 (Not Implemented) until the username+password credential work lands. All
// four are state-changing and require the CSRF header (csrf.ts). The magic-link
// GoTrue pass-throughs (/auth/token, /auth/verify, /auth/magiclink, /auth/user)
// keep GoTrue's own wire protocol so magic-link sign-in still works.

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

// Sign-in is rate-limited (per-IP block + per-account escalating delay) — the
// limiter is a single long-lived in-memory instance for this process. Register
// is not a credential guess, so it's not throttled. The skeleton 501 reports no
// outcome to the limiter, so nothing increments until the credential check lands.
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

	// Cairn-shaped credential surface — skeletons. They sit behind the CSRF gate
	// above so the guard is exercised against a real route; the credential work
	// replaces the HTTP 501 with the username+password logic. No GoTrue call and
	// no cookie change here.
	//
	// Sign-in additionally passes the rate-limit guard (per-IP block →
	// constant-shape 429, per-account escalating delay) before the skeleton
	// answers. The 501 sender is the guard's `next`; the credential check that
	// lands later takes its place and reports the outcome to the limiter.
	if (req.method === 'POST' && isSegmentMatch(originalUrl, [SIGNIN_PATH])) {
		signinGuard(req, res, () => {
			res.status(501).json({ error: 'not implemented' });
		});
		return;
	}
	if (req.method === 'POST' && isSegmentMatch(originalUrl, [REGISTER_PATH])) {
		res.status(501).json({ error: 'not implemented' });
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
