import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
	BEARER_AUTH_PATHS,
	COOKIE_PLANT_PATHS,
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

function readBearerFromCookie(req: IncomingMessage, name: string): string | null {
	const cookie = req.headers.cookie ?? '';
	const m = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
	return m ? decodeURIComponent(m[1]) : null;
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
				// Mounted at root (no path arg) so `req.url` stays the full
				// request path — `server.middlewares.use('/auth/session', …)`
				// would strip the mount and leave `req.url === '/'`, silently
				// failing the segment match. See Task 1.5 Decisions.
				server.middlewares.use((req, res, next) => {
					if (!isSegmentMatch(req.url, LOGOUT_PATHS)) {
						next();
						return;
					}
					if (req.method !== 'DELETE') {
						next();
						return;
					}
					res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
					res.statusCode = 204;
					res.end();
				});
			}
		},
		sveltekit()
	],
	server: {
		proxy: {
			'/api': {
				target: 'http://localhost:3000',
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
						// Durable cookie until Task 1.3 re-points /auth/user's
						// bearer-read to the access cookie.
						const token = readBearerFromCookie(req, COOKIE_NAME);
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
										isSegmentMatch(req.cairnOriginalUrl ?? req.url, COOKIE_PLANT_PATHS)
									) {
										const cookie =
											`${COOKIE_NAME}=${encodeURIComponent(json.access_token)}; ` +
											// fallback tracks GOTRUE_JWT_EXP — keep in sync if the env var changes
											`Path=/; HttpOnly; SameSite=Lax; Max-Age=${json.expires_in ?? 604800}`;
										// append — preserves any upstream Set-Cookie the header-copy loop already forwarded
										res.appendHeader('set-cookie', cookie);
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
