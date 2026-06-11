import express from 'express';
import type { Request, Response } from 'express';

import {
	BEARER_AUTH_PATHS,
	COOKIE_PLANT_PATHS,
	LOGOUT_PATHS,
	isSegmentMatch
} from './lib/auth-paths.js';

// Production cookie/JWT shim. This is the prod analogue of the dev Vite
// proxy in web/vite.config.ts (~lines 30–176): it translates between the
// HttpOnly `cairn_session` cookie the browser holds and the bearer/JSON
// GoTrue speaks, so the JWT never reaches page JavaScript. Caddy routes the
// GoTrue endpoints (/auth/magiclink|verify|token|user|session) here; the
// stock cookie→bearer direction for /api and /avatars stays in the
// Caddyfile. The narrowing lists are the canonical ones (auth-paths.ts,
// guarded deep-equal against web/'s copy by the drift test).
const COOKIE_NAME = 'cairn_session';

// Config is read per-request (not cached at module load) so tests can point
// GOTRUE_URL at a stub server in beforeAll after the module is imported.
function gotrueUrl(): string {
	return process.env.GOTRUE_URL ?? 'http://gotrue:9999';
}

// Shared cookie attributes for both plant and clear. `Secure` is appended
// only in production (COOKIE_SECURE === 'true') — dev runs over plain HTTP
// on localhost, where a Secure cookie would never be sent back. See
// docs/architecture.md "JWT storage".
function cookieAttrs(maxAge: string): string {
	const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
	return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function readBearerFromCookie(cookieHeader: string | undefined): string | null {
	const cookie = cookieHeader ?? '';
	const m = cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
	return m ? decodeURIComponent(m[1]) : null;
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

	// Logout: clear the cookie locally, never round-trip to GoTrue.
	if (req.method === 'DELETE' && isSegmentMatch(originalUrl, LOGOUT_PATHS)) {
		res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${cookieAttrs('0')}`);
		res.status(204).end();
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
		const token = readBearerFromCookie(req.headers.cookie);
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
			// plant a session unless explicitly added to the allow-list.
			if (
				typeof json.access_token === 'string' &&
				isSegmentMatch(originalUrl, COOKIE_PLANT_PATHS)
			) {
				const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : undefined;
				const maxAge = String(expiresIn ?? process.env.COOKIE_MAX_AGE ?? '604800');
				res.appendHeader(
					'set-cookie',
					`${COOKIE_NAME}=${encodeURIComponent(json.access_token)}; ${cookieAttrs(maxAge)}`
				);
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
