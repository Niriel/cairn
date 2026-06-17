import { randomUUID } from 'node:crypto';

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
	BEARER_AUTH_PATHS,
	COOKIE_PLANT_PATHS,
	CSRF_HEADER,
	LOGOUT_PATHS,
	PUBLIC_AUTH_PATHS,
	isSegmentMatch
} from './src/lib/shared/model/auth-paths';

// Module augmentation: every read site for the stamped original URL
// goes through `req.cairnOriginalUrl` with full type safety, so a typo
// can't silently fall through to the rewritten `req.url`. See
// auth-paths.ts and Task 1.4 Decisions.
declare module 'node:http' {
	interface IncomingMessage {
		cairnOriginalUrl?: string;
	}
}

// Dev-only cookie shim. In production Caddy translates between the
// HttpOnly cookies and the `Authorization: Bearer …` header that
// PostgREST expects; locally Vite's dev proxy plays the same role so
// the SvelteKit app sees identical paths and cookie behaviour in both
// environments. See docs/development.md.
//
// Two cookies (mirrors Caddyfile.prod): the durable `cairn_session`
// holds the rotating refresh token (the session lifetime / sign-out
// target), and the short-lived `cairn_access` holds the BFF-minted
// access JWT that the data plane attaches as a bearer. The data plane
// (`/api`, `/avatars`) reads the access cookie; the durable cookie is
// what the auth plane refreshes against.
const COOKIE_NAME = 'cairn_session';
const ACCESS_COOKIE_NAME = 'cairn_access';

// PostgREST base for the dev BFF handlers. In prod the auth-proxy reads
// POSTGREST_URL (http://postgrest:3000); in dev the `/api` proxy already
// targets PostgREST here, so the credential handlers (sign-in/register,
// Tasks 3.2/3.3) reuse the same base to resolve usernames via the
// resolve_username RPC. Mirrors postgrestUrl() in auth-proxy/src/lib/profiles.ts.
const POSTGREST_DEV_URL = 'http://localhost:3000';

// ~30-day idle horizon for both cookies — mirrors IDLE_HORIZON_SECONDS in
// auth-proxy/src/lib/cookies.ts (the prod sibling). The access cookie outlives
// its own JWT deliberately; see that file for why.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function readBearerFromCookie(req: IncomingMessage, name: string): string | null {
	const cookie = req.headers.cookie ?? '';
	const m = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
	return m ? decodeURIComponent(m[1]) : null;
}

// Dev Set-Cookie strings (no Secure — localhost is plain HTTP). Mirror
// plantSession/clearSession in auth-proxy/src/lib/cookies.ts.
function sessionCookie(name: string, value: string): string {
	return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

function clearCookie(name: string): string {
	return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// Dev mirror of auth-proxy/src/lib/csrf.ts: state-changing Cairn-shaped /auth/*
// requests must carry the custom CSRF header so dev and prod behave identically.
// Node lowercases header names.
function hasCsrfHeader(req: IncomingMessage): boolean {
	return req.headers[CSRF_HEADER.toLowerCase()] !== undefined;
}

async function handleDevRefresh(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const refreshToken = readBearerFromCookie(req, COOKIE_NAME);
	if (!refreshToken) {
		res.setHeader('Set-Cookie', [clearCookie(COOKIE_NAME), clearCookie(ACCESS_COOKIE_NAME)]);
		res.statusCode = 401;
		res.end(JSON.stringify({ error: 'no session' }));
		return;
	}

	let upstream: Response;
	try {
		upstream = await fetch('http://localhost:9999/token?grant_type=refresh_token', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ refresh_token: refreshToken })
		});
	} catch {
		// Transient — leave both cookies intact.
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}

	if (upstream.status >= 500) {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}
	if (upstream.status !== 200) {
		// Authoritative revoke — clear both cookies.
		res.setHeader('Set-Cookie', [clearCookie(COOKIE_NAME), clearCookie(ACCESS_COOKIE_NAME)]);
		res.statusCode = 401;
		res.end(JSON.stringify({ error: 'session revoked' }));
		return;
	}

	const json = (await upstream.json()) as {
		access_token?: string;
		refresh_token?: string;
		user?: unknown;
	};
	if (typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string') {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}

	res.setHeader('Set-Cookie', [
		sessionCookie(COOKIE_NAME, json.refresh_token),
		sessionCookie(ACCESS_COOKIE_NAME, json.access_token)
	]);
	res.setHeader('content-type', 'application/json');
	res.statusCode = 200;
	res.end(JSON.stringify({ user: json.user }));
}

async function handleDevSignout(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const refreshToken = readBearerFromCookie(req, COOKIE_NAME);
	const scope =
		req.url && new URLSearchParams(req.url.split('?')[1] ?? '').get('scope') === 'global'
			? 'global'
			: 'local';
	if (refreshToken) {
		try {
			// Mint a fresh access token, then revoke server-side (mirrors
			// logout() in auth-proxy/src/lib/session.ts). Errors swallowed —
			// cookies are cleared regardless.
			const minted = await fetch('http://localhost:9999/token?grant_type=refresh_token', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ refresh_token: refreshToken })
			});
			if (minted.status === 200) {
				const json = (await minted.json()) as { access_token?: string };
				if (typeof json.access_token === 'string') {
					await fetch(`http://localhost:9999/logout?scope=${scope}`, {
						method: 'POST',
						headers: { Authorization: `Bearer ${json.access_token}` }
					});
				}
			}
		} catch {
			// Swallow — clear cookies regardless (explicit user intent wins).
		}
	}
	res.setHeader('Set-Cookie', [clearCookie(COOKIE_NAME), clearCookie(ACCESS_COOKIE_NAME)]);
	res.statusCode = 204;
	res.end();
}

function readRequestBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
	});
}

// Dev mirror of the prod POST /auth/signin handler (auth-proxy/src/index.ts):
// resolve the typed username → uid against PostgREST (anon), then run the GoTrue
// password grant against the stable `<uid>@cairn.internal` identity; on success
// plant both cookies and return a tokenless `{ user: { id, username } }`. Unknown
// username and wrong password both answer a constant-shape 401. The prod per-IP /
// per-account rate-limiter is BFF-only — a deliberate dev-parity exception.
async function handleDevSignin(req: IncomingMessage, res: ServerResponse): Promise<void> {
	let creds: { username?: unknown; password?: unknown };
	try {
		creds = JSON.parse(await readRequestBody(req)) as typeof creds;
	} catch {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid request' }));
		return;
	}
	const username = typeof creds.username === 'string' ? creds.username : '';
	const password = typeof creds.password === 'string' ? creds.password : '';
	if (!username || !password) {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid request' }));
		return;
	}

	// Resolve the username → uid (anon; resolve_username RPC). The `/api` proxy
	// rewrites away, so call PostgREST directly at its dev base.
	let resolved: { id: string; username: string } | null = null;
	try {
		const r = await fetch(`${POSTGREST_DEV_URL}/rpc/resolve_username`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ p_username: username })
		});
		if (r.ok) {
			const rows = (await r.json()) as Array<{ id?: unknown; username?: unknown }>;
			const row = Array.isArray(rows) ? rows[0] : undefined;
			if (row && typeof row.id === 'string' && typeof row.username === 'string') {
				resolved = { id: row.id, username: row.username };
			}
		}
	} catch {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}
	if (!resolved) {
		res.statusCode = 401;
		res.end(JSON.stringify({ error: 'invalid credentials' }));
		return;
	}

	let grant: Response;
	try {
		grant = await fetch('http://localhost:9999/token?grant_type=password', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: `${resolved.id}@cairn.internal`, password })
		});
	} catch {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}
	if (grant.status >= 500) {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}
	if (grant.status !== 200) {
		res.statusCode = 401;
		res.end(JSON.stringify({ error: 'invalid credentials' }));
		return;
	}
	const json = (await grant.json()) as { access_token?: string; refresh_token?: string };
	if (typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string') {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}

	res.setHeader('Set-Cookie', [
		sessionCookie(COOKIE_NAME, json.refresh_token),
		sessionCookie(ACCESS_COOKIE_NAME, json.access_token)
	]);
	res.setHeader('content-type', 'application/json');
	res.statusCode = 200;
	res.end(JSON.stringify({ user: { id: resolved.id, username: resolved.username } }));
}

// Dev mirror of the prod POST /auth/register handler (auth-proxy/src/index.ts):
// validate → availability pre-check → GoTrue signup with a transient
// `<random>@cairn.internal` address → adopt the stable identity → set the chosen
// username → plant the session → tokenless `{ user }`. The prod per-IP throttle
// is BFF-only and omitted in dev (covered by the auth-proxy unit test).
async function handleDevRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
	let creds: { username?: unknown; password?: unknown };
	try {
		creds = JSON.parse(await readRequestBody(req)) as typeof creds;
	} catch {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid request' }));
		return;
	}
	const username = typeof creds.username === 'string' ? creds.username : '';
	const password = typeof creds.password === 'string' ? creds.password : '';
	if (!/^[A-Za-z0-9]{3,30}$/.test(username)) {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'invalid username' }));
		return;
	}
	if (password.length < 8) {
		res.statusCode = 400;
		res.end(JSON.stringify({ error: 'password too short' }));
		return;
	}

	// Availability pre-check (anon resolve_username RPC).
	try {
		const r = await fetch(`${POSTGREST_DEV_URL}/rpc/resolve_username`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ p_username: username })
		});
		const rows = r.ok ? ((await r.json()) as unknown[]) : [];
		if (Array.isArray(rows) && rows.length > 0) {
			res.statusCode = 409;
			res.end(JSON.stringify({ error: 'username taken' }));
			return;
		}
	} catch {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}

	// Create the GoTrue account with a transient random address.
	let signup: Response;
	try {
		signup = await fetch('http://localhost:9999/signup', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: `${randomUUID()}@cairn.internal`, password })
		});
	} catch {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}
	if (signup.status !== 200 && signup.status !== 201) {
		// 4xx → signups disabled (operator switch); 5xx → transient.
		res.statusCode = signup.status >= 500 ? 503 : 403;
		res.end(
			JSON.stringify({
				error: signup.status >= 500 ? 'upstream auth service unavailable' : 'registration closed'
			})
		);
		return;
	}
	const created = (await signup.json()) as {
		access_token?: string;
		refresh_token?: string;
		user?: { id?: string };
	};
	if (
		typeof created.access_token !== 'string' ||
		typeof created.refresh_token !== 'string' ||
		typeof created.user?.id !== 'string'
	) {
		res.statusCode = 503;
		res.end(JSON.stringify({ error: 'upstream auth service unavailable' }));
		return;
	}
	const bearer = {
		'content-type': 'application/json',
		Authorization: `Bearer ${created.access_token}`
	};

	// Adopt the stable identity, then set the chosen username — both as the new
	// account's bearer. Any failure leaves a sessionless orphan; never plant.
	const adopt = await fetch(`${POSTGREST_DEV_URL}/rpc/adopt_stable_identity`, {
		method: 'POST',
		headers: bearer,
		body: '{}'
	});
	if (!adopt.ok) {
		res.statusCode = 500;
		res.end(JSON.stringify({ error: 'registration failed' }));
		return;
	}
	const named = await fetch(`${POSTGREST_DEV_URL}/rpc/set_username`, {
		method: 'POST',
		headers: bearer,
		body: JSON.stringify({ p_username: username })
	});
	if (!named.ok) {
		const code = (await named.json().catch(() => ({}) as { code?: string })).code;
		res.statusCode = code === '23505' ? 409 : 500;
		res.end(JSON.stringify({ error: code === '23505' ? 'username taken' : 'registration failed' }));
		return;
	}

	res.setHeader('Set-Cookie', [
		sessionCookie(COOKIE_NAME, created.refresh_token),
		sessionCookie(ACCESS_COOKIE_NAME, created.access_token)
	]);
	res.setHeader('content-type', 'application/json');
	res.statusCode = 200;
	res.end(JSON.stringify({ user: { id: created.user.id, username } }));
}

export default defineConfig({
	plugins: [
		{
			// Stamps the original `/auth/...` URL onto the request before
			// Vite's internal proxy rewrites it. The `proxyReq` and `proxyRes`
			// handlers below need the original path to match against the
			// path lists in auth-paths.ts (which are all `/auth/...`-shaped).
			name: 'cairn-auth-shim',
			enforce: 'pre',
			configureServer(server) {
				// no return from configureServer → installs before Vite's internal
				// proxy; see auth-paths.ts and Task 1.4 Decisions.
				server.middlewares.use((req, _res, next) => {
					if (req.url?.startsWith('/auth/') || req.url === '/auth') {
						req.cairnOriginalUrl = req.url;
					}
					next();
				});
				// Sign-out: dev mirror of the prod POST /auth/signout handler
				// (auth-proxy/src/index.ts) — revoke server-side at GoTrue, then
				// clear both cookies (cleared regardless of the revoke outcome).
				// Mounted at root (no path arg) so `req.url` stays the full request
				// path — `server.middlewares.use('/auth/signout', …)` would strip
				// the mount and leave `req.url === '/'`, silently failing the
				// segment match.
				server.middlewares.use((req, res, next) => {
					if (!isSegmentMatch(req.url, LOGOUT_PATHS) || req.method !== 'POST') {
						next();
						return;
					}
					if (!hasCsrfHeader(req)) {
						res.statusCode = 403;
						res.end(JSON.stringify({ error: 'missing csrf header' }));
						return;
					}
					void handleDevSignout(req, res);
				});
				// Bespoke dev mirror of the prod /auth/refresh handler
				// (auth-proxy/src/index.ts): exchange the durable refresh cookie
				// at GoTrue, re-plant both cookies, return a tokenless user.
				// GoTrue has no /refresh route, so this can't be a plain proxy.
				// Distinguishes an authoritative revoke (clear + 401) from a
				// transient blip (503, cookies intact).
				server.middlewares.use((req, res, next) => {
					if (req.url?.split('?')[0] !== '/auth/refresh' || req.method !== 'POST') {
						next();
						return;
					}
					if (!hasCsrfHeader(req)) {
						res.statusCode = 403;
						res.end(JSON.stringify({ error: 'missing csrf header' }));
						return;
					}
					void handleDevRefresh(req, res);
				});
				// Cairn-shaped credential endpoints — dev mirror of the prod
				// /auth/signin + /auth/register handlers (auth-proxy/src/index.ts),
				// both now the real username+password flows. They sit behind the CSRF
				// gate so dev exercises the same routes + guard as prod. GoTrue:9999
				// has no such routes, so these can't be a plain proxy. (The prod
				// rate-limiter is BFF-only — a dev-parity exception.)
				server.middlewares.use((req, res, next) => {
					const path = req.url?.split('?')[0];
					if ((path !== '/auth/signin' && path !== '/auth/register') || req.method !== 'POST') {
						next();
						return;
					}
					if (!hasCsrfHeader(req)) {
						res.statusCode = 403;
						res.end(JSON.stringify({ error: 'missing csrf header' }));
						return;
					}
					if (path === '/auth/signin') {
						void handleDevSignin(req, res);
						return;
					}
					void handleDevRegister(req, res);
				});
				// R6 lockdown (dev parity): the public GoTrue password grant must be
				// unreachable; the only password-grant path is /auth/signin above.
				// The legacy magic-link refresh-token grant still proxies through, so
				// reject only grant_type=password (read from the query string).
				server.middlewares.use((req, res, next) => {
					if (req.url?.split('?')[0] !== '/auth/token' || req.method !== 'POST') {
						next();
						return;
					}
					const grantType = new URLSearchParams(req.url.split('?')[1] ?? '').get('grant_type');
					if (grantType === 'password') {
						res.statusCode = 403;
						res.end(JSON.stringify({ error: 'use /auth/signin' }));
						return;
					}
					next();
				});
			}
		},
		sveltekit()
	],
	server: {
		proxy: {
			'/api': {
				target: POSTGREST_DEV_URL,
				changeOrigin: false,
				rewrite: (p) => p.replace(/^\/api/, ''),
				configure: (proxy) => {
					proxy.on('proxyReq', (proxyReq, req) => {
						const token = readBearerFromCookie(req, ACCESS_COOKIE_NAME);
						if (token && !proxyReq.getHeader('authorization')) {
							proxyReq.setHeader('Authorization', `Bearer ${token}`);
						}
					});
				}
			},
			'/avatars': {
				target: 'http://localhost:8080',
				changeOrigin: false,
				configure: (proxy) => {
					proxy.on('proxyReq', (proxyReq, req) => {
						const token = readBearerFromCookie(req, ACCESS_COOKIE_NAME);
						if (token && !proxyReq.getHeader('authorization')) {
							proxyReq.setHeader('Authorization', `Bearer ${token}`);
						}
					});
				}
			},
			'/auth': {
				target: 'http://localhost:9999',
				changeOrigin: false,
				rewrite: (p) => p.replace(/^\/auth/, ''),
				// `bypass` runs before `rewrite`, so `req.url` is still the
				// original `/auth/...` here. Returning a string short-circuits
				// the proxy entirely and lets SvelteKit's router serve the
				// page (e.g. `/auth/callback?token=…`); see auth-paths.ts.
				bypass: (req) => (isSegmentMatch(req.url, PUBLIC_AUTH_PATHS) ? req.url : undefined),
				selfHandleResponse: true,
				configure: (proxy) => {
					proxy.on('proxyReq', (proxyReq, req) => {
						// Narrowed to BEARER_AUTH_PATHS — see auth-paths.ts.
						// `cairnOriginalUrl` is consulted because Vite's `rewrite`
						// mutates `req.url` before this handler fires.
						if (!isSegmentMatch(req.cairnOriginalUrl ?? req.url, BEARER_AUTH_PATHS)) {
							return;
						}
						// Read the short-lived access cookie — the durable cookie now
						// holds a refresh token GoTrue's /user would reject.
						const token = readBearerFromCookie(req, ACCESS_COOKIE_NAME);
						if (token && !proxyReq.getHeader('authorization')) {
							proxyReq.setHeader('Authorization', `Bearer ${token}`);
						}
					});
					proxy.on('proxyRes', (proxyRes, req: IncomingMessage, res: ServerResponse) => {
						const chunks: Buffer[] = [];
						proxyRes.on('data', (c: Buffer) => chunks.push(c));
						proxyRes.on('end', () => {
							let body = Buffer.concat(chunks);
							for (const [k, v] of Object.entries(proxyRes.headers)) {
								if (v === undefined) continue;
								// Skip content-length so Node recomputes it from the
								// (possibly rewritten) body in `res.end(body)`.
								if (k.toLowerCase() === 'content-length') continue;
								res.setHeader(k, v as string | string[]);
							}
							res.statusCode = proxyRes.statusCode ?? 502;
							const ct = String(proxyRes.headers['content-type'] ?? '');
							if (ct.includes('application/json') && proxyRes.statusCode === 200) {
								try {
									const json = JSON.parse(body.toString('utf8'));
									// Cookie-plant is narrowed to deliberate-login
									// endpoints (auth-paths.ts COOKIE_PLANT_PATHS).
									// `cairnOriginalUrl` is the original `/auth/...`
									// since `rewrite` mutated `req.url` before we got here.
									if (
										typeof json?.access_token === 'string' &&
										typeof json?.refresh_token === 'string' &&
										isSegmentMatch(req.cairnOriginalUrl ?? req.url, COOKIE_PLANT_PATHS)
									) {
										// Plant BOTH cookies: refresh token in the durable
										// cookie, access JWT in the short-lived one. Mirrors
										// plantSession() in auth-proxy/src/lib/cookies.ts.
										// append — preserves any upstream Set-Cookie the header-copy loop already forwarded
										res.appendHeader('set-cookie', sessionCookie(COOKIE_NAME, json.refresh_token));
										res.appendHeader(
											'set-cookie',
											sessionCookie(ACCESS_COOKIE_NAME, json.access_token)
										);
									}
									// strip tokens unconditionally — JS has no use for them; cookie is the source of truth (docs/architecture.md:145, :233)
									if (
										typeof json?.access_token === 'string' ||
										typeof json?.refresh_token === 'string'
									) {
										delete json.access_token;
										delete json.refresh_token;
										body = Buffer.from(JSON.stringify(json));
									}
								} catch {
									// non-JSON or parse error — pass through unchanged.
								}
							}
							res.end(body);
						});
					});
				}
			}
		}
	}
});
