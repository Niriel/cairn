import type { Response } from 'express';

// The dual-cookie session contract, shared by the cookie-plant, the
// /auth/refresh handler, and sign-out. This file is the prod half; the dev
// Vite proxy in web/vite.config.ts re-implements the same shape (cookie names,
// attributes, Max-Age horizon) and must stay in lockstep — see the
// cross-reference comment there. The web app never reads these cookies
// (HttpOnly); only Caddy/Vite (request side) and this proxy (response side) do.
//
// Two cookies:
//   - durable `cairn_session`: the rotating, revocable refresh token; its
//     lifetime IS the session idle horizon.
//   - short-lived-JWT `cairn_access`: the BFF-minted access token Caddy/Vite
//     attach as the /api bearer.

// Both cookies are sized to the same ~30-day idle horizon. The access cookie
// deliberately outlives its own JWT: if it expired with the JWT, the browser
// would drop it and the next /api call would carry no cookie → Caddy attaches
// no bearer → PostgREST runs as anon and an RLS-protected SELECT answers
// `200 []`, not the `401` the refresh-on-401 interceptor needs. Sized to the
// horizon, the cookie is always present while the session lives; the JWT
// *inside* it carries the short `exp`, so PostgREST returns an unambiguous
// `401 jwt expired` and the silent refresh always fires. The JWT's `exp` — not
// the cookie Max-Age — bounds the bearer's security value. See Task 1.3.
const IDLE_HORIZON_SECONDS = 60 * 60 * 24 * 30;

// Cookie names. In prod (COOKIE_SECURE === 'true') both cookies carry the
// `__Host-` prefix, which the browser only honours when the cookie is also
// Secure, Path=/, and has no Domain — closing subdomain cookie injection. Dev
// runs plain-HTTP localhost, where a Secure cookie would never be sent back, so
// it keeps the unprefixed names. These are functions reading process.env at
// call time (not module-load consts) so per-test COOKIE_SECURE toggles take
// effect — matching cookieAttrs()/gotrueUrl() in index.ts. The dev Vite proxy
// in web/vite.config.ts re-implements the same name/prefix logic and must stay
// in lockstep — see the cross-reference comment there.
function hostPrefix(): string {
	return process.env.COOKIE_SECURE === 'true' ? '__Host-' : '';
}

export function sessionCookieName(): string {
	return `${hostPrefix()}cairn_session`;
}

export function accessCookieName(): string {
	return `${hostPrefix()}cairn_access`;
}

// Shared cookie attributes. `Secure` is appended only in production
// (COOKIE_SECURE === 'true') — dev runs over plain HTTP on localhost, where a
// Secure cookie would never be sent back. We never set Domain, and Path is
// always `/`, so the attribute string satisfies the `__Host-` prefix rules in
// prod. See docs/architecture.md.
function cookieAttrs(maxAge: string): string {
	const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
	return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
	const cookie = cookieHeader ?? '';
	const m = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
	return m ? decodeURIComponent(m[1]) : null;
}

export function readSessionCookie(cookieHeader: string | undefined): string | null {
	return readCookie(cookieHeader, sessionCookieName());
}

export function readAccessCookie(cookieHeader: string | undefined): string | null {
	return readCookie(cookieHeader, accessCookieName());
}

export interface SessionTokens {
	accessToken: string;
	refreshToken: string;
	// Accepted for forward-compatibility; the cookie Max-Age is the idle
	// horizon, not the JWT TTL (see IDLE_HORIZON_SECONDS), so this is not used
	// to size the access cookie.
	expiresIn?: number;
}

// Plant both session cookies. Called on every session-establish: the
// magic-link/OTP cookie-plant (index.ts) and a successful /auth/refresh.
export function plantSession(res: Response, tokens: SessionTokens): void {
	const maxAge = String(IDLE_HORIZON_SECONDS);
	res.appendHeader(
		'set-cookie',
		`${sessionCookieName()}=${encodeURIComponent(tokens.refreshToken)}; ${cookieAttrs(maxAge)}`
	);
	res.appendHeader(
		'set-cookie',
		`${accessCookieName()}=${encodeURIComponent(tokens.accessToken)}; ${cookieAttrs(maxAge)}`
	);
}

// Clear both cookies (sign-out, refresh-token revoked/invalid).
export function clearSession(res: Response): void {
	res.appendHeader('set-cookie', `${sessionCookieName()}=; ${cookieAttrs('0')}`);
	res.appendHeader('set-cookie', `${accessCookieName()}=; ${cookieAttrs('0')}`);
}
