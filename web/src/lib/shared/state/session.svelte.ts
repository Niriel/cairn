// `shared/state/` cannot import from `auth/model/` per
// docs/frontend-layout.md, so the URL prefix is read from the same
// VITE_AUTH_BASE env var that pins `auth-client.ts`'s URLs — matching
// contracts via env instead of via import. `auth-paths` lives in
// `shared/model/`, so importing CSRF_HEADER from it is within-tier and
// allowed (the one shared home for the constant, byte-identical with the BFF).
import { CSRF_HEADER } from '$lib/shared/model/auth-paths';

export const AUTH_BASE = import.meta.env.VITE_AUTH_BASE ?? '/auth';

export type AuthUser = { id: string; username: string };

export type Session =
	| { status: 'unknown' }
	| { status: 'signed-out' }
	| { status: 'signed-in'; user: AuthUser };

// Boxed under `.current` so TypeScript narrows across `status` → `user`
// reads: after `if (session.current.status === 'signed-in')`, the very
// same `.current` access narrows `.user` to `AuthUser`. A two-getter
// shape (`session.status`, `session.user`) does NOT narrow. Mutators
// MUST replace `.current` wholesale — never split-assign `status` and
// `user` separately, the intermediate state would be impossible.
export const session = $state<{ current: Session }>({
	current: { status: 'unknown' }
});

// The outcome of a refresh attempt. Three-way, mirroring the BFF's
// /auth/refresh contract (Task 1.3): `ok` adopts the user, `revoked` is
// an authoritative sign-out, `transient` is a momentary upstream blip
// (503 / network / malformed body) that MUST NOT sign the user out.
export type RefreshResult =
	| { status: 'ok'; user: AuthUser }
	| { status: 'revoked' }
	| { status: 'transient' };

// The BFF returns a tokenless `user` on success; today's boot did an
// unvalidated `as AuthUser` cast, which would set a half-populated session
// from a malformed body. `auth/model`'s `assertAuthUser` can't be imported
// here (one-way tier rule), so this is the local guard.
function isAuthUser(value: unknown): value is AuthUser {
	return (
		value !== null &&
		typeof value === 'object' &&
		typeof (value as { id?: unknown }).id === 'string' &&
		typeof (value as { username?: unknown }).username === 'string'
	);
}

// Single shared in-flight refresh. With rotation + reuse detection, two
// concurrent refreshes would replay a rotated token and could trip a
// spurious family-revoke; deduping behind one promise prevents that
// *within this JS realm*. Cross-realm (multi-tab) concurrency is covered
// only by GoTrue's reuse interval (Task 1.2), not by this. Cleared in the
// `finally` so a later refresh can fire again.
let refreshPromise: Promise<RefreshResult> | null = null;

export function refresh(): Promise<RefreshResult> {
	if (refreshPromise) return refreshPromise;
	refreshPromise = (async (): Promise<RefreshResult> => {
		try {
			const res = await fetch(`${AUTH_BASE}/refresh`, {
				method: 'POST',
				credentials: 'same-origin',
				headers: { [CSRF_HEADER]: '1' }
			});
			if (res.ok) {
				const body = (await res.json().catch(() => null)) as { user?: unknown } | null;
				if (isAuthUser(body?.user)) {
					return { status: 'ok', user: body.user };
				}
				// A 2xx with a malformed body is a contract break, not a
				// revocation — treat it as transient so a single bad response
				// doesn't bounce a valid session to sign-in.
				console.error('refresh: malformed user payload from /auth/refresh');
				return { status: 'transient' };
			}
			// Only an authoritative 401 is a sign-out. The BFF returns 503 on a
			// transient upstream blip; any other non-401 is treated the same way.
			if (res.status === 401) {
				return { status: 'revoked' };
			}
			return { status: 'transient' };
		} catch (err) {
			console.error('refresh: POST /auth/refresh failed', err);
			return { status: 'transient' };
		} finally {
			refreshPromise = null;
		}
	})();
	return refreshPromise;
}

// Cached so concurrent callers share one in-flight boot. Cleared in the
// IIFE's `finally`, so a later boot (after `signOut`) can fire again. By
// the time `await bootSession()` returns to the caller, the finally has
// already run and this is null.
let bootPromise: Promise<void> | null = null;

export function bootSession(): Promise<void> {
	if (bootPromise) return bootPromise;
	bootPromise = (async () => {
		try {
			// Refresh-then-check: the short-lived access cookie may be expired
			// while the durable refresh cookie is still valid, so boot exchanges
			// the refresh token and adopts the returned user directly — no
			// separate /auth/user round-trip.
			const result = await refresh();
			// Symmetric guard with `setSignedIn`/`signOut`/`onUnauthorized`: if a
			// deliberate entrypoint fired while refresh was in flight, it wins.
			if (session.current.status !== 'unknown') return;
			if (result.status === 'ok') {
				session.current = { status: 'signed-in', user: result.user };
			} else if (result.status === 'revoked') {
				session.current = { status: 'signed-out' };
			}
			// `transient` leaves the status `unknown`: a momentary outage on cold
			// start must not bounce a validly-signed-in user to sign-in.
			// Signed-out is reserved for an authoritative revocation.
		} finally {
			bootPromise = null;
		}
	})();
	return bootPromise;
}

export async function signOut(): Promise<void> {
	if (session.current.status === 'signed-out') return;
	try {
		await fetch(`${AUTH_BASE}/signout`, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { [CSRF_HEADER]: '1' }
		});
	} catch (err) {
		// Explicit user intent is authoritative — a network failure must
		// not leave the user stuck in `signed-in` with an unhandled
		// rejection. The `finally` below still writes `signed-out`.
		console.error('signOut: POST /auth/signout failed', err);
	} finally {
		session.current = { status: 'signed-out' };
	}
}

export function setSignedIn(user: AuthUser): void {
	// No-op while already signed-in: the live cookie is the source of
	// truth and there is no path in step 3 that updates the user
	// payload on an existing session (refresh-token rotation is
	// deferred).
	if (session.current.status === 'signed-in') return;
	session.current = { status: 'signed-in', user };
}

export function onUnauthorized(): void {
	if (session.current.status === 'signed-out') return;
	session.current = { status: 'signed-out' };
}
