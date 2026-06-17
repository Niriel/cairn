import { CSRF_HEADER } from '$lib/shared/model/auth-paths';
import type { AuthUser } from '$lib/shared/state/session.svelte';

// The revocable session's single-flight refresh lives in the `shared/`
// tier so boot, the /api 401-interceptor, and this client all await the
// same in-flight request. `auth/` → `shared/` is an allowed import, so the
// auth domain re-exports it rather than re-implementing the dedupe.
export { refresh } from '$lib/shared/state/session.svelte';

const AUTH_BASE = import.meta.env.VITE_AUTH_BASE ?? '/auth';

export class HttpError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.name = 'HttpError';
		this.status = status;
	}
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(`${AUTH_BASE}${path}`, {
		method: 'POST',
		credentials: 'same-origin',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			// Required on the Cairn-shaped /auth/* endpoints; harmless on the
			// GoTrue pass-throughs (the named CSRF exception). Sent uniformly.
			[CSRF_HEADER]: '1'
		},
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const message = await readErrorMessage(res);
		throw new HttpError(res.status, message);
	}
	const contentType = res.headers.get('content-type') ?? '';
	if (!contentType.includes('application/json')) {
		return undefined as T;
	}
	return (await res.json()) as T;
}

async function readErrorMessage(res: Response): Promise<string> {
	const contentType = res.headers.get('content-type') ?? '';
	if (contentType.includes('application/json')) {
		try {
			const payload = (await res.json()) as { msg?: string; error_description?: string };
			return payload.msg ?? payload.error_description ?? res.statusText;
		} catch {
			return res.statusText;
		}
	}
	return res.statusText;
}

// The `user` object in a 2xx body might be missing if a future GoTrue
// version drifts. Guarding here keeps the TS return type honest — without
// it, callers like `setSignedIn(result.user)` would silently receive
// `undefined`.
function assertAuthUser(value: unknown): asserts value is AuthUser {
	if (
		value === null ||
		typeof value !== 'object' ||
		typeof (value as { id?: unknown }).id !== 'string' ||
		typeof (value as { username?: unknown }).username !== 'string'
	) {
		throw new Error('Malformed auth response: missing user.id or user.username');
	}
}

// Cairn-shaped sign-in: POST /auth/signin { username, password }. The BFF
// resolves the username to the stable identity, runs the password grant,
// plants the dual session cookies, and returns a tokenless `{ user }`. A
// non-2xx (401 invalid credentials, 400 malformed) throws `HttpError` so the
// sign-in screen can map status → copy.
export async function signIn(username: string, password: string): Promise<{ user: AuthUser }> {
	const payload = await postJson<{ user?: unknown }>('/signin', { username, password });
	assertAuthUser(payload?.user);
	return { user: payload.user };
}

// Cairn-shaped registration: POST /auth/register { username, password }. The
// BFF signs up, adopts the stable identity, sets the chosen username, and
// plants the session. A non-2xx (409 taken, 400 invalid, 403 closed) throws
// `HttpError`.
export async function register(username: string, password: string): Promise<{ user: AuthUser }> {
	const payload = await postJson<{ user?: unknown }>('/register', { username, password });
	assertAuthUser(payload?.user);
	return { user: payload.user };
}

export async function sendMagicLink(email: string): Promise<void> {
	// GoTrue v2.158.1's MagicLinkParams struct has no RedirectTo field, so
	// `redirect_to` in the JSON body is silently dropped by encoding/json.
	// The accepted carriers are the query string, a `redirect_to` header,
	// or a form-encoded body — query string is the cleanest. See Task 6.2
	// Notes for the empirical trace.
	const redirectTo = encodeURIComponent(`${window.location.origin}/auth/callback`);
	await postJson<unknown>(`/magiclink?redirect_to=${redirectTo}`, { email });
}

export async function exchangeRefreshToken(refreshToken: string): Promise<{ user: AuthUser }> {
	const payload = await postJson<{ user?: unknown }>('/token?grant_type=refresh_token', {
		refresh_token: refreshToken
	});
	assertAuthUser(payload?.user);
	return { user: payload.user };
}

export async function verifyOtp(email: string, token: string): Promise<{ user: AuthUser }> {
	// The typed six-digit code from the magic-link e-mail. On 200 the auth
	// shim has already planted the cookie and stripped the tokens; the JSON
	// carries `user`. Unlike `sendMagicLink`, a non-2xx is NOT swallowed — it
	// throws `HttpError` so the caller can show an inline "incorrect or
	// expired" message. This leaks nothing: GoTrue returns the same 4xx for a
	// wrong code and an unknown e-mail, and the caller already holds a pending
	// e-mail.
	const payload = await postJson<{ user?: unknown }>('/verify', {
		type: 'magiclink',
		email,
		token
	});
	assertAuthUser(payload?.user);
	return { user: payload.user };
}

// Revocable sign-out: POST /auth/signout revokes the session server-side
// (GoTrue /logout) and clears both cookies. The CSRF header is required.
export async function signOut(): Promise<void> {
	await postSignout('');
}

// Sign out everywhere: revokes ALL of the user's sessions (compromise
// kill-switch / future password-change re-auth).
export async function signOutEverywhere(): Promise<void> {
	await postSignout('?scope=global');
}

async function postSignout(query: string): Promise<void> {
	const res = await fetch(`${AUTH_BASE}/signout${query}`, {
		method: 'POST',
		credentials: 'same-origin',
		headers: { [CSRF_HEADER]: '1' }
	});
	if (!res.ok) {
		const message = await readErrorMessage(res);
		throw new HttpError(res.status, message);
	}
}
