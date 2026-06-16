import express from 'express';
import type { Request, Response } from 'express';

import {
	BEARER_AUTH_PATHS,
	COOKIE_PLANT_PATHS,
	LOGOUT_PATHS,
	isSegmentMatch
} from './lib/auth-paths.js';
import { plantSession, clearSession, readAccessCookie, readSessionCookie } from './lib/cookies.js';
import { refresh } from './lib/session.js';

// Production auth BFF (Cairn-shaped). This is the prod analogue of the dev
// Vite proxy in web/vite.config.ts (~lines 30–185): it owns the dual-cookie
// session (durable `cairn_session` refresh token + short-lived `cairn_access`
// JWT), so no token ever reaches page JavaScript. Caddy routes the GoTrue
// endpoints (/auth/magiclink|verify|token|user|session) and the Cairn-shaped
// /auth/refresh here; the stock cookie→bearer direction for /api and /avatars
// stays in the Caddyfile and reads the access cookie. The narrowing lists are
// the canonical ones (auth-paths.ts, guarded deep-equal against web/'s copy by
// the drift test).

// The Cairn-shaped refresh endpoint — not a GoTrue passthrough, so it's handled
// before the generic fetch-to-GoTrue path below.
const REFRESH_PATH = '/auth/refresh';

// Config is read per-request (not cached at module load) so tests can point
// GOTRUE_URL at a stub server in beforeAll after the module is imported.
function gotrueUrl(): string {
	return process.env.GOTRUE_URL ?? 'http://gotrue:9999';
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

	// Logout: clear both cookies locally, never round-trip to GoTrue. (Task 1.4
	// reshapes this into a revocable POST /auth/signout.)
	if (req.method === 'DELETE' && isSegmentMatch(originalUrl, LOGOUT_PATHS)) {
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
